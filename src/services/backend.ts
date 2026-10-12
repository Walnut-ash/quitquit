import { useSyncExternalStore } from "react";
import type { AppData } from "../types";

export interface BackendPreferences {
  aiMode: "api" | "demo";
  aiConsent: boolean;
  diskSync: boolean;
}
const KEY = "workday-backend-preferences-v1";
const defaults: BackendPreferences = { aiMode: "api", aiConsent: false, diskSync: false };
function readPreferences(): BackendPreferences {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return defaults; }
}
let preferences = typeof localStorage === "undefined" ? defaults : readPreferences();
const listeners = new Set<() => void>();
export function getBackendPreferences() { return preferences; }
export function setBackendPreferences(patch: Partial<BackendPreferences>) {
  const next = { ...preferences, ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  preferences = next;
  listeners.forEach((fn) => fn());
}
export function useBackendPreferences() {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, getBackendPreferences);
}

export class BackendError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}
export async function backendRequest<T>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method, credentials: "same-origin", cache: "no-store",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new BackendError("本机后端无法连接或请求超时。请先运行 npm run dev:full；原文仍在浏览器里。", 0);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    const code = result?.code ?? result?.error?.code;
    const messages: Record<string, string> = {
      MODEL_NOT_CONFIGURED: "尚未配置模型 API。请在 .env.local 填写接口、模型名和密钥后重启后端；不会用模拟回复冒充 AI。",
      CONSENT_REQUIRED: "请先在「我的 → 聊天 API 与本机备份」同意将聊天上下文发送给模型服务。",
      REVISION_CONFLICT: "本机副本有更新，已暂停同步以避免覆盖。请在「我的」重新读取本机副本。",
      MODEL_UPSTREAM_ERROR: "模型服务拒绝了请求。常见原因是密钥无效、模型名或接入点 ID 不正确、账户未开通该模型、余额或配额不足。",
      MODEL_TIMEOUT: "模型服务 45 秒内没有返回，请稍后重试或更换模型。",
      INVALID_MODEL_RESPONSE: "模型返回的内容不符合预期格式（可能需要支持 JSON 输出的模型）。原文仍保留。",
    };
    const detail = typeof result?.detail === "string" && result.detail ? `（服务商返回：${result.detail}）` : "";
    throw new BackendError(`${messages[code] || result?.message || "后端请求失败，请检查连接或权限。"}${detail}`, response.status, code);
  }
  return result as T;
}
export interface BackendStatus { storage: string; modelConfigured: boolean; model: string | null; }
export const getBackendStatus = () => backendRequest<BackendStatus>("/status");
export interface StateResponse { state: AppData | null; revision: number; savedAt?: string; }
export const readDiskState = () => backendRequest<StateResponse>("/state");
export const writeDiskState = (state: AppData, expectedRevision: number) =>
  backendRequest<StateResponse>("/state", { state, expectedRevision }, "PUT");

export async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
export async function uploadDiskFile(id: string, file: Blob, name: string, type: string) {
  return backendRequest<{ sha256: string; uploadedAt: string }>(`/files/${id}`, { name, type, base64: await blobToBase64(file) }, "PUT");
}
export async function readDiskFile(id: string) {
  const data = await backendRequest<{ id: string; name: string; type: string; sha256: string; uploadedAt: string; base64: string }>(`/files/${id}`);
  const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
  return { ...data, blob: new Blob([bytes], { type: data.type }) };
}
export async function fileHash(file: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
