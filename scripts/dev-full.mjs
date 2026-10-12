import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const children = [];
const run = (command, args, name) => {
  const child = spawn(command, args, { cwd: project, stdio: "inherit" });
  child.on("exit", (code, signal) => {
    if (signal) return;
    console.error(`[${name}] 退出，代码 ${code}；正在停止另一个进程。`);
    shutdown(code ?? 1);
  });
  children.push(child);
  return child;
};
let stopping = false;
const shutdown = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 300);
};
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

if (!existsSync(resolve(project, ".env.local")))
  console.warn("提示：未找到 .env.local，聊天将返回「尚未配置模型 API」。可复制 .env.example 后填写。");

run(process.execPath, ["scripts/backend.mjs"], "backend");
run(process.execPath, [resolve(project, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1"], "vite");
console.log("本机后端 http://127.0.0.1:8787 · 前端 http://127.0.0.1:5173 （仅本机可访问）");
