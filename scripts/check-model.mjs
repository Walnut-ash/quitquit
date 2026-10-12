// 模型连通性自检：npm run check:model
// 读取 .env.local，向配置的模型服务发一次最小请求，把服务商的原话告诉你。
// 只做诊断，不写入任何记录，也不打印密钥。
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(project, ".env.local");
if (!existsSync(envFile)) {
  console.error("找不到 .env.local。请先复制 .env.example 并填写。");
  process.exit(1);
}
process.loadEnvFile(envFile);

const baseURL = process.env.LLM_BASE_URL;
const model = process.env.LLM_MODEL;
const apiKey = process.env.LLM_API_KEY;
const missing = [["LLM_BASE_URL", baseURL], ["LLM_MODEL", model], ["LLM_API_KEY", apiKey]]
  .filter(([, value]) => !value || !value.trim())
  .map(([name]) => name);
if (missing.length) {
  console.error(`以下配置还是空的：${missing.join("、")}\n请在 .env.local 里填写后重试。`);
  process.exit(1);
}

let url;
try {
  const parsed = new URL(baseURL);
  if (parsed.protocol !== "https:") throw new Error("只接受 https 地址（本机 http 需另设 LLM_ALLOW_HTTP_LOOPBACK）");
  if (parsed.username || parsed.password) throw new Error("地址里不要带账号密码");
  url = `${parsed.href.replace(/\/+$/, "")}/chat/completions`;
} catch (error) {
  console.error(`LLM_BASE_URL 无效：${error.message}`);
  process.exit(1);
}

const redact = (text) => String(text).split(apiKey).join("[已隐去]")
  .replace(/(sk-|Bearer\s+)[A-Za-z0-9._-]{8,}/gi, "$1[已隐去]").replace(/\s+/g, " ").slice(0, 400);

console.log(`地址：${url}`);
console.log(`模型：${model}`);
console.log(`密钥：已读取（长度 ${apiKey.length}，不显示内容）`);
console.log("正在请求…");

try {
  const response = await fetch(url, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(45000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "只输出 JSON。" },
        { role: "user", content: '回一个 JSON：{"ok":true}' },
      ],
      response_format: { type: "json_object" },
    }),
  });
  const body = await response.text();
  if (!response.ok) {
    console.error(`\n失败：HTTP ${response.status}`);
    console.error(`服务商原话：${redact(body)}`);
    if (response.status === 401) console.error("→ 密钥无效或格式不对，请核对方舟控制台里的 API Key。");
    else if (response.status === 404) console.error("→ 模型名或接入点 ID 不存在，请核对 LLM_MODEL。");
    else if (response.status === 403) console.error("→ 账户未开通该模型，或密钥权限不足。");
    else if (response.status === 429) console.error("→ 触发限流或余额不足。");
    process.exit(1);
  }
  const content = JSON.parse(body)?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    console.error("\n返回了 200，但结构不是预期的 chat/completions 格式：");
    console.error(redact(body));
    process.exit(1);
  }
  console.log(`\n成功。模型返回：${redact(content)}`);
  console.log("配置可用，现在重启 npm run dev:full 即可在应用里使用。");
} catch (error) {
  console.error(`\n请求没有完成：${error.name === "TimeoutError" ? "45 秒超时" : error.message}`);
  console.error("请检查网络、代理设置，以及地址是否可在本机访问。");
  process.exit(1);
}
