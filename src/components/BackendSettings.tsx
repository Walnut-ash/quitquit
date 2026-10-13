import { useState } from "react";
import { Button, SectionTitle } from "./ui";
import { getBackendStatus, setBackendPreferences, useBackendPreferences, type BackendStatus } from "../services/backend";
import { connectDisk, disconnectDisk, inspectDisk, syncNow, useDiskSyncStatus } from "../services/disk-sync";
import { downloadBlob } from "../services/files";

export function BackendSettings() {
  const prefs = useBackendPreferences();
  const disk = useDiskSyncStatus();
  const [backend, setBackend] = useState<BackendStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasRemote, setHasRemote] = useState<boolean | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <section className="card stack" aria-label="聊天 API 与本机备份">
    <SectionTitle title="聊天 API 与本机备份" subtitle="本机后端只监听 127.0.0.1；不是云端账号或跨设备同步。" />
    <div className="field">
      <label className="label" htmlFor="ai-mode">聊天模式</label>
      <select id="ai-mode" className="input" value={prefs.aiMode} onChange={(e) => setBackendPreferences({ aiMode: e.target.value as "api" | "demo" })}>
        <option value="api">真实模型 API（未配置会明确报错）</option>
        <option value="demo">本地演示规则（不是 AI）</option>
      </select>
    </div>
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={prefs.aiConsent} onChange={(e) => setBackendPreferences({ aiConsent: e.target.checked })} />
      <span>我同意在 API 模式将近期聊天原文、相关已确认事件及材料类型/覆盖日期发送给所配置的模型服务，用于回复和总结。不会自动发送附件原件；请先去除姓名、公司机密和第三方隐私。</span>
    </label>
    <p className="small muted">此授权与磁盘备份分开。可随时关闭；关闭不能撤回模型服务已收到的数据。模型服务的保留期限需另行核查。</p>
    <div className="button-row">
      <Button disabled={busy} onClick={() => void run(async () => {
        setBackend(await getBackendStatus());
        setHasRemote(Boolean((await inspectDisk()).state));
      })}>检查后端连接</Button>
    </div>
    {backend && <p className="small">本机数据库已连接 · {backend.modelConfigured ? `模型已配置：${backend.model}（配置存在，不代表已成功调用）` : "模型 API 尚未配置"}</p>}
    <details className="small">
      <summary className="cursor-pointer">如何配置模型接口</summary>
      <div className="stack mt-2">
        <p>项目根目录新建 .env.local（已忽略，不提交），按 .env.example 填写以下三项，然后重启 npm run dev:full。</p>
        <pre className="overflow-auto rounded-md bg-[var(--color-fill)] p-3 text-[var(--color-ink)]">{"LLM_BASE_URL=<服务商提供的 HTTPS 地址，通常以 /v1 结尾>\nLLM_MODEL=<支持 JSON 输出的模型名>\nLLM_API_KEY=<只写在本机文件中的密钥>"}</pre>
        <p>没有预置供应商或密钥。接口使用 OpenAI 兼容的 /chat/completions 和 JSON 输出；收费与配额取决于你选择的模型服务。</p>
      </div>
    </details>
    <div className="divider pt-3 stack">
      <p role="status" className={disk.state === "error" ? "error" : "small muted"}>{disk.message}</p>
      <p className="small muted">启用后，记录和原件保存在项目 data/workday.sqlite。数据库未加密，请保护电脑、系统账号和磁盘备份。浏览器 Cookie 是本机工作区凭证，不是真正的注册登录；丢失 Cookie 会创建新的空工作区。</p>
      {hasRemote === false && <Button disabled={busy} onClick={() => void run(async () => {
        await connectDisk("upload"); setHasRemote(true);
      })}>同意保存当前记录与附件到本机磁盘</Button>}
      {hasRemote === true && <Button disabled={busy} onClick={() => void run(async () => {
        if (!window.confirm("恢复会替换当前浏览器记录，但不删除磁盘原件。请先导出当前浏览器记录；不同副本不会自动合并。确认恢复？")) return;
        await connectDisk("restore");
      })}>恢复本机副本并开启同步</Button>}
      <div className="button-row">
        {prefs.diskSync && <><Button disabled={busy} onClick={() => void run(syncNow)}>立即保存到磁盘</Button><Button onClick={disconnectDisk}>暂停磁盘同步</Button></>}
        <Button disabled={busy} onClick={() => void run(async () => {
          const remote = await inspectDisk();
          if (!remote.state) throw new Error("磁盘尚无可导出的记录。");
          downloadBlob(new Blob([JSON.stringify(remote, null, 2)], { type: "application/json" }), "职场日记-本机快照.json");
        })}>导出磁盘记录（不含原件）</Button>
      </div>
      <p className="faint">完整备份须在停止后端后复制整个 data 目录（包括可能存在的 WAL 文件），而不是只导出 JSON。哈希只能检查字节一致，不能证明发生时间、真实性或法律效力。</p>
    </div>
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}
