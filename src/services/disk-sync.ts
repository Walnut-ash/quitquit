import { useSyncExternalStore } from "react";
import { useAppStore } from "../store/useAppStore";
import { STORAGE_KEY } from "../store/useAppStore";
import { migrateData } from "./migrate";
import { fileService } from "./files";
import { backendRequest, getBackendPreferences, readDiskState, setBackendPreferences, uploadDiskFile, writeDiskState } from "./backend";
import type { AppData } from "../types";

interface SyncStatus { state: "off" | "syncing" | "saved" | "error"; message: string; }
let status: SyncStatus = { state: "off", message: "浏览器保存 · 尚未启用本机磁盘备份" };
const listeners = new Set<() => void>();
const notify = (next: SyncStatus) => { status = next; listeners.forEach((fn) => fn()); };
export const useDiskSyncStatus = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => status);
let revision: number | null = null;
let stopped = true;
let timer: ReturnType<typeof setTimeout> | undefined;
let queue: Promise<void> = Promise.resolve();
let unsubscribe: (() => void) | undefined;
export const appSnapshot = (): AppData => JSON.parse(JSON.stringify(useAppStore.getState()));
async function flushSnapshot() {
  if (stopped || revision === null) return;
  const state = appSnapshot();
  notify({ state: "syncing", message: "正在写入本机磁盘…" });
  try {
    for (const material of state.materials) {
      if (!material.fileId) continue;
      const file = await fileService.getLocal(material.fileId);
      if (!file) throw new Error(`原件「${material.name}」不在浏览器里，不能声称完成备份。请先恢复原件。`);
      await uploadDiskFile(material.fileId, file.blob, file.name, file.type || "text/plain");
    }
    const saved = await writeDiskState(state, revision);
    revision = saved.revision;
    notify({ state: "saved", message: `已写入本机磁盘 · ${new Date().toLocaleTimeString()}（非云端）` });
  } catch (error) {
    stopped = true;
    unsubscribe?.(); unsubscribe = undefined;
    notify({ state: "error", message: `${(error as Error).message} 浏览器记录仍然保留，磁盘同步已暂停。` });
    throw error;
  }
}
function enqueue() {
  queue = queue.catch(() => {}).then(flushSnapshot);
  return queue;
}
function listen() {
  unsubscribe?.();
  unsubscribe = useAppStore.subscribe(() => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => { void enqueue().catch(() => {}); }, 800);
  });
}
export async function inspectDisk() { return readDiskState(); }
export async function connectDisk(mode: "restore" | "upload") {
  pauseDiskSync();
  const remote = await readDiskState();
  revision = remote.revision;
  if (mode === "restore") {
    if (!remote.state) throw new Error("本机磁盘没有可恢复的记录，请先上传当前浏览器数据。");
    // Restore originals before changing browser records, so a missing file cannot masquerade as complete recovery.
    for (const material of remote.state.materials) {
      if (material.fileId) await fileService.restoreFromDisk(material.fileId);
    }
    const restored = migrateData(remote.state);
    restored.messages = restored.messages.map((m) => m.status === "sending" ? { ...m, status: "failed" } : m);
    useAppStore.setState(restored);
  } else if (remote.state) {
    throw new Error("磁盘已有记录。为避免覆盖，请先选择恢复本机副本；不自动合并或覆盖。");
  }
  stopped = false;
  setBackendPreferences({ diskSync: true });
  await enqueue();
  listen();
}
export function pauseDiskSync() {
  stopped = true;
  clearTimeout(timer);
  unsubscribe?.(); unsubscribe = undefined;
  notify({ state: "off", message: "磁盘同步已暂停 · 浏览器记录仍会保存" });
}
export function disconnectDisk() { pauseDiskSync(); setBackendPreferences({ diskSync: false }); }
export async function startDiskSync() {
  if (!getBackendPreferences().diskSync) return;
  // Never silently overwrite a changed disk copy after reload or a second browser tab.
  notify({ state: "off", message: "已启用本机备份；请在「我的」读取磁盘副本并恢复同步，避免覆盖其他窗口修改。" });
}
export async function syncNow() { clearTimeout(timer); if (stopped) throw new Error("同步未启动或已暂停，请先在「我的」恢复同步。" ); await enqueue(); }
export async function clearDiskWorkspace() {
  pauseDiskSync();
  await queue.catch(() => {});
  const remote = await readDiskState();
  await backendRequest("/workspace", { confirm: true, expectedRevision: remote.revision }, "DELETE");
  setBackendPreferences({ diskSync: false });
  revision = null;
}
export function exportBrowserBackup() {
  const value = localStorage.getItem(STORAGE_KEY);
  return new Blob([value || "{}"], { type: "application/json" });
}
