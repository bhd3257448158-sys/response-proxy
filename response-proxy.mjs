#!/usr/bin/env node
/**
 * response-proxy.mjs
 *
 * Universal Responses API → Chat Completions proxy
 * Lets Codex CLI (or any Responses API client) talk to any Chat Completions backend.
 *
 * Usage:
 *   node response-proxy.mjs
 *   node response-proxy.mjs --port 8080
 *   node response-proxy.mjs --setup
 *   node response-proxy.mjs --help
 */

import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { execSync } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VERSION = "1.0.0";

// ── CLI argument parsing ────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArgValue(name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
response-proxy.mjs — Universal Responses API → Chat Completions proxy

USAGE:
  node response-proxy.mjs [options]

OPTIONS:
  --port <number>       Proxy listen port (default: 9090, env: PROXY_PORT)
  --upstream <url>      Upstream Chat Completions base URL (env: UPSTREAM_BASE_URL)
                        Supports presets: glm, glmcp, deepseek, kimi, qwen, qwencp, doubao, doubaocp, minimax, minimaxcp, ollama
                        Examples: --upstream deepseek  or  --upstream https://api.deepseek.com/v1
  --setup               Auto-configure Codex CLI config.toml
  --help, -h            Show this help
  --version, -v         Show version

ENVIRONMENT VARIABLES:
  PROXY_PORT            Proxy listen port (default: 9090)
  UPSTREAM_BASE_URL     Upstream Chat Completions base URL
  OPENAI_API_KEY        API key for upstream (sent as Bearer token)
  DEBUG=1               Enable debug logging
  LOG_FILE=<path>       Write logs to file
  PROVIDER=<name>       Force provider detection: glm/deepseek/kimi/qwen/doubao/minimax/ollama/generic
  TOOL_CHOICE_STRICT=1  Pass through tool_choice as-is (no downgrade to "auto")

EXAMPLES:
  # GLM (default)
  node response-proxy.mjs

  # Using presets (short name)
  node response-proxy.mjs --upstream deepseek
  node response-proxy.mjs --upstream kimi
  node response-proxy.mjs --upstream ollama

  # Using full URL
  UPSTREAM_BASE_URL=https://api.deepseek.com/v1 node response-proxy.mjs

  # Local Ollama (no API key needed)
  node response-proxy.mjs --upstream ollama
`);
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  console.log(`response-proxy v${VERSION}`);
  process.exit(0);
}

// ── Interactive setup wizard ─────────────────────────────────────────────────

function ask(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function runWizard(presets, { skipContinuePrompt = false, port = 9090 } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log();
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║     response-proxy 首次配置                     ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log();

  // Step 1: Choose provider
  console.log("请选择模型厂商:");
  const providers = [
    { key: "1", name: "DeepSeek（推荐新手）", preset: "deepseek", defaultModel: "deepseek-chat" },
    { key: "2", name: "智谱 GLM", preset: "glm", defaultModel: "GLM-5.1" },
    { key: "3", name: "智谱 GLM Coding Plan", preset: "glmcp", defaultModel: "GLM-5.1" },
    { key: "4", name: "Kimi", preset: "kimi", defaultModel: "kimi-k2.5" },
    { key: "5", name: "通义千问", preset: "qwen", defaultModel: "qwen-max" },
    { key: "6", name: "百炼 Coding Plan", preset: "qwencp", defaultModel: "qwen3.6-plus" },
    { key: "7", name: "豆包（火山引擎）", preset: "doubao", defaultModel: "doubao-seed-1.5" },
    { key: "8", name: "方舟 Coding Plan", preset: "doubaocp", defaultModel: "ark-code-latest" },
    { key: "9", name: "MiniMax", preset: "minimax", defaultModel: "minimax-m2.5" },
    { key: "a", name: "MiniMax Coding Plan", preset: "minimaxcp", defaultModel: "minimax-m2.7" },
    { key: "b", name: "Ollama（本地，免费）", preset: "ollama", defaultModel: "qwen2.5-coder:7b" },
    { key: "c", name: "其他（自定义 URL）", preset: null, defaultModel: "" },
  ];
  for (const p of providers) {
    console.log(`  ${p.key}. ${p.name}`);
  }

  const choice = await ask(rl, "\n请输入编号: ");
  const selected = providers.find((p) => p.key === choice.trim().toLowerCase());
  if (!selected) {
    console.error("❌ 无效的选择");
    rl.close();
    process.exit(1);
  }

  let upstreamURL;
  if (selected.preset) {
    upstreamURL = presets[selected.preset];
  } else {
    upstreamURL = await ask(rl, "请输入上游 API 地址: ");
    if (!upstreamURL.trim()) {
      console.error("❌ URL 不能为空");
      rl.close();
      process.exit(1);
    }
  }

  // Step 2: API Key
  console.log();
  const apiKey = await ask(rl, "请输入 API Key: ");
  if (!apiKey.trim()) {
    console.error("❌ API Key 不能为空");
    rl.close();
    process.exit(1);
  }

  // Step 3: Model name
  console.log();
  const defaultModel = selected.defaultModel || "";
  const modelHint = defaultModel ? `（默认: ${defaultModel}）` : "";
  const model = (await ask(rl, `请输入模型名称${modelHint}: `)).trim() || defaultModel;
  if (!model) {
    console.error("❌ 模型名称不能为空");
    rl.close();
    process.exit(1);
  }

  // Step 4: Debug and log options
  console.log();
  const debugInput = (await ask(rl, "是否开启调试模式？(y/N): ")).trim().toLowerCase();
  const enableDebug = debugInput === "y";

  const defaultLogPath = path.join(__dirname, "proxy.log");
  let logFile = "";
  while (true) {
    const logInput = (await ask(rl, `日志文件路径（默认 ${defaultLogPath}，输入 n 跳过）: `)).trim();
    if (logInput.toLowerCase() === "n") break;
    const resolved = logInput || defaultLogPath;
    const parentDir = path.dirname(resolved);
    if (fs.existsSync(parentDir)) {
      logFile = resolved;
      break;
    }
    console.error(`   ❌ 目录不存在: ${parentDir}，请重新输入`);
  }

  rl.close();

  // Write Codex CLI config
  const codexDir = path.join(process.env.HOME || process.env.USERPROFILE || "~", ".codex");
  const configFile = path.join(codexDir, "config.toml");

  const providerBlock = `
[model_providers.response_proxy]
name = "Response Proxy (any Chat Completions backend)"
base_url = "http://localhost:${port}/v1"
env_key = "OPENAI_API_KEY"
wire_api = "responses"
model = "${model}"
`;

  try {
    if (!fs.existsSync(codexDir)) {
      fs.mkdirSync(codexDir, { recursive: true });
    }
    let existing = "";
    if (fs.existsSync(configFile)) {
      existing = fs.readFileSync(configFile, "utf-8");
    }
    if (existing.includes("[model_providers.response_proxy]")) {
      const updated = existing.replace(
        /\[model_providers\.response_proxy\][\s\S]*?(?=\n\[|$)/,
        providerBlock.trimEnd()
      );
      fs.writeFileSync(configFile, updated, "utf-8");
    } else {
      fs.appendFileSync(configFile, providerBlock, "utf-8");
    }
    console.log();
    console.log("✅ Codex CLI 配置已写入 " + configFile);
  } catch (err) {
    console.error("⚠️  Codex CLI 配置写入失败:", err.message);
    console.log("   代理仍可正常启动，稍后可手动运行 --setup 配置");
  }

  // Connectivity test
  console.log();
  console.log("正在测试连通性...");
  let testPassed = false;
  try {
    const url = new URL(upstreamURL + "/chat/completions");
    const testBody = JSON.stringify({
      model: model,
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 5,
      stream: false,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: testBody,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      console.log("✅ 连通性测试通过！上游服务正常");
      testPassed = true;
    } else {
      const errBody = await res.text().catch(() => "");
      console.error(`❌ 连通性测试失败: HTTP ${res.status}`);
      if (errBody) {
        try {
          const errJson = JSON.parse(errBody);
          console.error(`   ${errJson.error?.message || errBody.slice(0, 200)}`);
        } catch {
          console.error(`   ${errBody.slice(0, 200)}`);
        }
      }
      console.log("   请检查 API Key 和模型名称是否正确");
    }
  } catch (err) {
    if (err.name === "AbortError") {
      console.error("❌ 连通性测试超时（15秒），请检查网络连接");
    } else {
      console.error("❌ 连通性测试失败:", err.message);
    }
  }

  if (!testPassed && !skipContinuePrompt) {
    const ask2 = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve) => {
      ask2.question("是否仍要启动代理？(y/N): ", resolve);
    });
    ask2.close();

    if (answer.trim().toLowerCase() !== "y") {
      console.log("已退出。请修复问题后重新运行。");
      process.exit(1);
    }
  }

  return { upstreamURL, apiKey, model, enableDebug, logFile };
}

if (args.includes("--setup")) {
  const _PRESETS = {
    glm: "https://open.bigmodel.cn/api/paas/v4",
    glmcp: "https://open.bigmodel.cn/api/coding/paas/v4",
    deepseek: "https://api.deepseek.com/v1",
    kimi: "https://api.moonshot.cn/v1",
    qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    qwencp: "https://coding.dashscope.aliyuncs.com/v1",
    doubao: "https://ark.cn-beijing.volces.com/api/v3",
    doubaocp: "https://ark.cn-beijing.volces.com/api/coding/v3",
    minimax: "https://api.minimax.chat/v1",
    minimaxcp: "https://api.minimaxi.com/v1",
    ollama: "http://localhost:11434/v1",
  };
  const setupPort = Number(getArgValue("--port") || process.env.PROXY_PORT || 9090);
  await runWizard(_PRESETS, { skipContinuePrompt: true, port: setupPort });
  process.exit(0);
}

// ── Configuration ───────────────────────────────────────────────────────────

const PRESETS = {
  glm:       "https://open.bigmodel.cn/api/paas/v4",
  glmcp:     "https://open.bigmodel.cn/api/coding/paas/v4",
  deepseek:  "https://api.deepseek.com/v1",
  kimi:      "https://api.moonshot.cn/v1",
  qwen:      "https://dashscope.aliyuncs.com/compatible-mode/v1",
  qwencp:    "https://coding.dashscope.aliyuncs.com/v1",
  doubao:    "https://ark.cn-beijing.volces.com/api/v3",
  doubaocp:  "https://ark.cn-beijing.volces.com/api/coding/v3",
  minimax:   "https://api.minimax.chat/v1",
  minimaxcp: "https://api.minimaxi.com/v1",
  ollama:    "http://localhost:11434/v1",
};

function resolveUpstream(raw) {
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return PRESETS[key] || null;
}

const PORT = Number(getArgValue("--port") || process.env.PROXY_PORT || 9090);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  logError(`无效的端口号: ${getArgValue("--port") || process.env.PROXY_PORT || 9090}，端口必须是 1-65535 之间的整数`);
  process.exit(1);
}

// ── Auto-wizard: if no API key and no upstream specified, run interactive setup ──

let wizardUpstream = null;
if (!process.env.OPENAI_API_KEY && !getArgValue("--upstream") && !process.env.UPSTREAM_BASE_URL) {
  const result = await runWizard(PRESETS, { port: PORT });
  process.env.OPENAI_API_KEY = result.apiKey;
  if (result.enableDebug) process.env.DEBUG = "1";
  if (result.logFile) process.env.LOG_FILE = result.logFile;
  wizardUpstream = result.upstreamURL.replace(/\/+$/, "");
}

const UPSTREAM = (
  wizardUpstream ||
  resolveUpstream(getArgValue("--upstream")) ||
  resolveUpstream(process.env.UPSTREAM_BASE_URL) ||
  getArgValue("--upstream") ||
  process.env.UPSTREAM_BASE_URL ||
  "https://open.bigmodel.cn/api/paas/v4"
).replace(/\/+$/, "");
const DEBUG = process.env.DEBUG === "1" || process.env.DEBUG === "true";
const LOG_FILE = process.env.LOG_FILE || "";
const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB
const UPSTREAM_TIMEOUT = Number(process.env.UPSTREAM_TIMEOUT) || 600_000; // default 600s

// ── Logging ──────────────────────────────────────────────────────────────────

let logStream = null;
if (LOG_FILE) {
  logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });
}

function ts() {
  return new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

function log(level, parts) {
  const msg = `[${ts()}] [${level}] ${parts.join(" ")}\n`;
  process.stderr.write(msg);
  if (logStream) logStream.write(msg);
}

function logInfo(...args) { log("INFO", args); }
function logWarn(...args) { log("WARN", args); }
function logError(...args) { log("ERROR", args); }

// ── Helpers ──────────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (c) => {
      if (tooLarge) return;
      size += c.length;
      if (size > MAX_BODY_SIZE) {
        tooLarge = true;
        req.destroy(new Error("Request body too large"));
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!tooLarge) resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Request conversion: Responses → Chat Completions ─────────────────────────

function convertInputToMessages(input, instructions) {
  const messages = [];
  const systemParts = [];

  if (instructions) {
    // Codex CLI always sends a string, but guard against non-string values
    systemParts.push(typeof instructions === "string" ? instructions : JSON.stringify(instructions));
  }

  // input can be a plain string
  if (typeof input === "string") {
    if (systemParts.length > 0) {
      messages.push({ role: "system", content: systemParts.join("\n\n") });
    }
    messages.push({ role: "user", content: input });
    return messages;
  }

  // input is an array of items (guard against null/undefined)
  if (!Array.isArray(input)) {
    if (systemParts.length > 0) {
      messages.push({ role: "system", content: systemParts.join("\n\n") });
    }
    return messages;
  }

  // input is an array of items
  const userMessages = [];
  let pendingReasoning = null; // Deferred reasoning text for next assistant message

  for (const item of input) {
    if (item.type === "message") {
      let role = item.role;
      let content = "";

      if (typeof item.content === "string") {
        content = item.content;
      } else if (Array.isArray(item.content)) {
        content = item.content
          .filter((c) => c.type === "input_text" || c.type === "output_text")
          .map((c) => c.text ?? "")
          .join("\n");
      }

      if (role === "developer") {
        if (content) systemParts.push(content);
      } else {
        // Always preserve assistant messages (even with empty content),
        // because they may carry tool_calls from previous turns
        if (role === "assistant") {
          const msg = { role, content: content || null };
          // Attach deferred reasoning_content from a preceding reasoning item
          if (pendingReasoning) {
            msg.reasoning_content = pendingReasoning;
            pendingReasoning = null;
          }
          userMessages.push(msg);
        } else if (content) {
          userMessages.push({ role, content });
        }
      }
    } else if (item.type === "function_call") {
      // Convert to assistant message with tool_calls
      const prev = userMessages[userMessages.length - 1];
      const tc = {
        id: item.call_id || uid("call"),
        type: "function",
        function: {
          name: item.name,
          arguments: item.arguments,
        },
      };
      // Merge into previous assistant message if it's the last one (regardless of tool_calls presence)
      if (prev && prev.role === "assistant") {
        if (!prev.tool_calls) prev.tool_calls = [];
        prev.tool_calls.push(tc);
      } else {
        const newMsg = {
          role: "assistant",
          content: null,
          tool_calls: [tc],
        };
        // Attach deferred reasoning_content from a preceding reasoning item
        if (pendingReasoning) {
          newMsg.reasoning_content = pendingReasoning;
          pendingReasoning = null;
        }
        userMessages.push(newMsg);
      }
    } else if (item.type === "function_call_output") {
      userMessages.push({
        role: "tool",
        tool_call_id: item.call_id || uid("call"),
        content: item.output,
      });
    } else if (item.type === "reasoning") {
      // DeepSeek requires reasoning_content to be passed back in tool-call turns.
      // Codex CLI sends reasoning items BEFORE the assistant message, so we defer
      // attachment until the next assistant message is created.
      const reasoningText = item.content
        ? item.content.map((c) => c.text || "").join("")
        : (item.summary || []).map((s) => s.text || "").join("");
      if (reasoningText) {
        pendingReasoning = reasoningText;
      }
    }
    // Silently ignore other unknown item types (e.g. local_shell_call, etc.)
  }

  if (systemParts.length > 0) {
    messages.push({ role: "system", content: systemParts.join("\n\n") });
  }
  messages.push(...userMessages);
  return messages;
}

function convertTools(tools) {
  if (!tools || tools.length === 0) return undefined;

  return tools
    .filter((t) => t.type === "function")
    .map((t) => {
      const func = {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      };
      // Preserve strict field if present (Codex CLI sends it)
      if (t.strict !== undefined) func.strict = t.strict;
      return { type: "function", function: func };
    });
}

/**
 * Convert Responses API tool_choice to Chat Completions format.
 * Responses API uses: { type: "function", name: "..." } or "auto" or "none" or "required"
 * Chat Completions uses: { type: "function", function: { name: "..." } } or "auto" or "none" or "required"
 *
 * Note: Provider-specific downgrading (e.g. GLM only supports "auto") is handled in adaptRequest().
 * Set TOOL_CHOICE_STRICT=1 to skip all downgrading.
 */
function convertToolChoice(toolChoice) {
  if (!toolChoice) return undefined;

  if (typeof toolChoice === "string") {
    return toolChoice; // "auto", "none", "required"
  }

  if (toolChoice.type === "function" && toolChoice.name) {
    return { type: "function", function: { name: toolChoice.name } };
  }

  return toolChoice;
}

// ── Provider detection & adaptation ───────────────────────────────────────────

/**
 * Detect provider from UPSTREAM_BASE_URL.
 * Returns one of: "glm" | "deepseek" | "kimi" | "qwen" | "doubao" | "minimax" | "ollama" | "generic"
 */
function detectProvider(url) {
  const u = url.toLowerCase();
  if (u.includes("bigmodel.cn") || u.includes("z.ai")) return "glm";
  if (u.includes("deepseek")) return "deepseek";
  if (u.includes("moonshot.cn") || u.includes("kimi")) return "kimi";
  if (u.includes("dashscope") || u.includes("aliyuncs")) return "qwen";
  if (u.includes("volces.com") || u.includes("ark.cn-beijing")) return "doubao";
  if (u.includes("minimax")) return "minimax";
  if (u.includes("localhost") || u.includes("127.0.0.1") || u.includes("ollama")) return "ollama";
  return "generic";
}

const PROVIDER = process.env.PROVIDER || detectProvider(UPSTREAM);
if (PROVIDER !== "generic") {
  logInfo(`检测到上游厂商: ${PROVIDER} (${UPSTREAM})`);
}

/**
 * Adapt request params for provider-specific quirks.
 * Modifies chatReq in place.
 */
function adaptRequest(chatReq, body, provider) {
  // ── Reasoning parameter adaptation ──
  // Codex sends: { reasoning: { effort: "low"|"medium"|"high" } }
  // DeepSeek expects: { thinking: { type: "enabled"|"disabled" } }
  // GLM expects: { thinking: { type: "enabled"|"disabled" } }
  // Kimi expects: { thinking: { type: "enabled"|"disabled" } }
  // Qwen expects: { enable_thinking: true|false }
  // Doubao expects: { thinking: { type: "enabled"|"disabled"|"auto" } }
  // MiniMax expects: { reasoning_split: true }
  if (body.reasoning !== undefined) {
    const effort = body.reasoning?.effort;
    const enabled = effort !== "none" && effort !== undefined;

    switch (provider) {
      case "deepseek":
        // DeepSeek uses thinking.type to enable/disable reasoning
        chatReq.thinking = { type: enabled ? "enabled" : "disabled" };
        delete chatReq.reasoning;
        delete chatReq.reasoning_effort;
        break;

      case "glm":
        // GLM uses thinking.type
        chatReq.thinking = { type: enabled ? "enabled" : "disabled" };
        delete chatReq.reasoning;
        delete chatReq.reasoning_effort;
        // GLM stream_options support is unconfirmed, remove to be safe
        delete chatReq.stream_options;
        break;

      case "doubao":
        // Doubao uses thinking.type with "auto" support for effort-based thinking
        if (effort === "low") {
          chatReq.thinking = { type: "auto" };
        } else {
          chatReq.thinking = { type: enabled ? "enabled" : "disabled" };
        }
        delete chatReq.reasoning;
        delete chatReq.reasoning_effort;
        break;

      case "kimi":
        // Kimi uses thinking.type (only kimi-k2.5 supports it)
        if (enabled) chatReq.thinking = { type: "enabled" };
        delete chatReq.reasoning;
        delete chatReq.reasoning_effort;
        break;

      case "qwen":
        // Qwen uses enable_thinking boolean
        chatReq.enable_thinking = enabled;
        delete chatReq.reasoning;
        delete chatReq.reasoning_effort;
        break;

      case "minimax":
        // MiniMax uses reasoning_split to separate thinking content into reasoning_details
        if (enabled) chatReq.reasoning_split = true;
        delete chatReq.reasoning;
        delete chatReq.reasoning_effort;
        break;

      default:
        // Generic: pass through as-is (e.g. Ollama, other OpenAI-compatible)
        chatReq.reasoning = body.reasoning;
        if (effort !== undefined) chatReq.reasoning_effort = effort;
        break;
    }
  }

  // ── max_tokens / max_completion_tokens adaptation ──
  // Note: Kimi's max_tokens is NOT deprecated (contrary to some older docs).
  // No provider currently needs max_tokens → max_completion_tokens conversion.

  // ── stop adaptation ──
  // GLM only supports a single stop word
  if (provider === "glm" && Array.isArray(chatReq.stop) && chatReq.stop.length > 1) {
    logWarn(`GLM 仅支持单个停止词，已截取第一个: "${chatReq.stop[0]}"`);
    chatReq.stop = [chatReq.stop[0]];
  }

  // ── tool_choice compatibility ──
  // GLM: only supports "auto" (required/named cause stream interruption)
  // Ollama: does not support "required"
  const strict = process.env.TOOL_CHOICE_STRICT === "1";
  if (!strict && chatReq.tool_choice !== undefined) {
    const onlyAuto = ["glm", "ollama", "kimi", "minimax"];
    if (onlyAuto.includes(provider)) {
      if (chatReq.tool_choice === "required" || typeof chatReq.tool_choice === "object") {
        logWarn(`${provider} 不支持 tool_choice=${JSON.stringify(chatReq.tool_choice)}，已降级为 auto`);
        chatReq.tool_choice = "auto";
      }
    }
  }

  // ── Clean up unsupported params per provider ──
  // No domestic provider supports parallel_tool_calls
  delete chatReq.parallel_tool_calls;

  // Remove strict from tools (no domestic provider supports it)
  if (Array.isArray(chatReq.tools)) {
    for (const t of chatReq.tools) {
      if (t.function) delete t.function.strict;
    }
  }

  // Ollama: remove stream_options, filter empty tools
  // Note: stream_options is added after adaptRequest() in buildChatRequest,
  // so we clean it up there instead.
  if (provider === "ollama") {
    if (Array.isArray(chatReq.tools) && chatReq.tools.length === 0) {
      delete chatReq.tools;
    }
  }
}

function buildChatRequest(body) {
  const messages = convertInputToMessages(body.input, body.instructions);
  const tools = convertTools(body.tools);

  const chatReq = {
    model: body.model || "default",
    messages,
    stream: !!body.stream,
  };

  if (tools && tools.length > 0) {
    chatReq.tools = tools;
  }

  // Forward optional params
  if (body.temperature !== undefined) chatReq.temperature = body.temperature;
  if (body.top_p !== undefined) chatReq.top_p = body.top_p;
  if (body.max_output_tokens !== undefined) chatReq.max_tokens = body.max_output_tokens;
  if (body.stop !== undefined) chatReq.stop = body.stop;
  if (body.response_format !== undefined) chatReq.response_format = body.response_format;

  // tool_choice conversion
  const tc = convertToolChoice(body.tool_choice);
  if (tc !== undefined) chatReq.tool_choice = tc;

  // parallel_tool_calls (Codex CLI sends this)
  if (body.parallel_tool_calls !== undefined) {
    chatReq.parallel_tool_calls = body.parallel_tool_calls;
  }

  // Provider-specific adaptation (reasoning, max_tokens, stop, tool_choice, etc.)
  adaptRequest(chatReq, body, PROVIDER);

  // stream_options for usage tracking (supported by deepseek, kimi, qwen, doubao)
  if (chatReq.stream) {
    const supportsStreamUsage = ["deepseek", "kimi", "qwen", "doubao", "minimax"];
    if (supportsStreamUsage.includes(PROVIDER)) {
      chatReq.stream_options = { include_usage: true };
    }
    // Ollama does not support stream_options
    if (PROVIDER === "ollama") {
      delete chatReq.stream_options;
    }
  }

  // previous_response_id is not supported by Chat Completions — ignore

  return chatReq;
}

// ── Response conversion: Chat Completions → Responses ────────────────────────

function buildResponseObject(chatResp, model, finishReason) {
  const choice = chatResp.choices?.[0];
  const msg = choice?.message;
  const content = [];

  if (msg?.content) {
    content.push({ type: "output_text", text: msg.content });
  }

  const output = [];

  // Add reasoning item if present (DeepSeek, GLM, Kimi, etc.)
  // MiniMax uses reasoning_details instead of reasoning_content
  const nonStreamReasoning = msg?.reasoning_content
    || (msg?.reasoning_details
      ? (typeof msg.reasoning_details === "string"
        ? msg.reasoning_details
        : msg.reasoning_details?.content || msg.reasoning_details?.text || "")
      : null);
  if (nonStreamReasoning) {
    output.push({
      id: uid("rs"),
      type: "reasoning",
      summary: [{ type: "summary_text", text: nonStreamReasoning.slice(0, 200) }],
    });
  }

  output.push({
      id: uid("msg"),
      type: "message",
      role: "assistant",
      content,
    });

  if (msg?.tool_calls) {
    for (const tc of msg.tool_calls) {
      const func = tc.function || {};
      output.push({
        id: uid("fc"),
        type: "function_call",
        call_id: tc.id || uid("call"),
        name: func.name || "",
        arguments: func.arguments || "",
      });
    }
  }

  return {
    id: uid("resp"),
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    model: model || chatResp.model,
    status: finishReason === "length" ? "incomplete" : "completed",
    output,
    usage: chatResp.usage
      ? {
          input_tokens: chatResp.usage.prompt_tokens || 0,
          input_tokens_details: { cached_tokens: chatResp.usage.prompt_tokens_details?.cached_tokens || 0 },
          output_tokens: chatResp.usage.completion_tokens || 0,
          output_tokens_details: { reasoning_tokens: chatResp.usage.completion_tokens_details?.reasoning_tokens || 0 },
          total_tokens: chatResp.usage.total_tokens || 0,
        }
      : { input_tokens: 0, input_tokens_details: { cached_tokens: 0 }, output_tokens: 0, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 0 },
  };
}

// ── SSE Streaming conversion ─────────────────────────────────────────────────

function handleStreaming(upstreamRes, res, model, validToolNames) {
  // Forward model info via HTTP headers (Codex CLI reads these)
  const headers = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "OpenAI-Model": model,
  };
  if (upstreamRes.headers["x-reasoning-included"]) {
    headers["X-Reasoning-Included"] = upstreamRes.headers["x-reasoning-included"];
  }
  res.writeHead(200, headers);

  const respId = uid("resp");
  const msgId = uid("msg");
  let seq = 0;

  const emit = (event, data) => {
    if (!res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  // UTF-8 safe decoder to handle multi-byte characters split across chunks
  const decoder = new StringDecoder("utf-8");

  // Initial events
  // Codex CLI only checks event.response.is_some() for response.created
  emit("response.created", {
    type: "response.created",
    sequence_number: seq++,
    response: { id: respId },
  });
  // Note: response.in_progress is NOT sent — Codex CLI silently ignores it

  // Initial events — do NOT emit message output_item.added / content_part.added yet,
  // because if the model returns reasoning_content, it should occupy output_index 0.
  // We defer these events until the first actual content arrives (see processLines).
  let msgItemEmitted = false;

  let buffer = "";
  let fullText = "";
  let toolCalls = [];       // 紧凑数组，保证连续索引
  let toolIndexMap = {};    // 上游 tc.index → 紧凑 index 的映射
  let done = false;
  let streamUsage = null;   // 流式 usage 累积
  let streamFinishReason = null; // 流式 finish_reason 跟踪

  // Handle client disconnect — stop processing upstream
  res.on("close", () => {
    if (!done) {
      logInfo("客户端断开连接，终止流式处理");
      done = true;
      upstreamRes.destroy();
    }
  });

  // Reasoning content tracking
  let reasoningItemId = null;
  let reasoningContent = "";
  let reasoningEmitted = false;
  // Layout lock: once text has been emitted at output_index 0, reasoning arriving
  // later cannot reclaim index 0 (SSE events are immutable). We track this to
  // warn and handle the output array ordering correctly in finishStream.
  let layoutLocked = false;

  function finishStream(errorObj) {
    // errorObj can be: null (normal), string (message only), or { message, code, type } (full error)
    if (done) return;
    done = true;

    const errorMsg = errorObj
      ? (typeof errorObj === "string" ? errorObj : errorObj.message || "Unknown error")
      : null;
    const errorCode = (typeof errorObj === "object" && errorObj?.code) ? errorObj.code : "server_error";
    const errorType = (typeof errorObj === "object" && errorObj?.type) ? errorObj.type : "upstream_error";

    // Calculate output_index offset: +1 if reasoning was emitted
    // When layoutLocked (text arrived first), reasoning is at index 1, message at 0
    // When normal (reasoning arrived first), reasoning is at index 0, message at 1
    const reasoningOffset = reasoningEmitted ? 1 : 0;
    const reasoningOutputIndex = layoutLocked ? 1 : 0;
    const msgOutputIndex = layoutLocked ? 0 : reasoningOffset;

    // Finish reasoning item if emitted
    if (reasoningEmitted) {
      // Note: response.reasoning_text.done is NOT sent — Codex CLI silently ignores it
      emit("response.output_item.done", {
        type: "response.output_item.done",
        sequence_number: seq++,
        output_index: reasoningOutputIndex,
        item: {
          id: reasoningItemId,
          type: "reasoning",
          summary: [{ type: "summary_text", text: reasoningContent.slice(0, 200) }],
        },
      });
    }

    // If message item was never emitted (model returned only reasoning or only tool_calls),
    // emit it now so Codex CLI always receives a complete event sequence.
    if (!msgItemEmitted) {
      msgItemEmitted = true;
      emit("response.output_item.added", {
        type: "response.output_item.added",
        sequence_number: seq++,
        output_index: msgOutputIndex,
        item: { id: msgId, type: "message", role: "assistant", content: [] },
      });
    }

    const finalContent = [{ type: "output_text", text: fullText }];

    // Note: response.output_text.done and response.content_part.done are NOT sent —
    // Codex CLI silently ignores them. It gets final text from response.output_item.done.

    const output = [];

    if (layoutLocked && reasoningEmitted) {
      // Unusual case: text arrived before reasoning.
      output.push({
        id: msgId,
        type: "message",
        role: "assistant",
        content: finalContent,
      });
      output.push({
        id: reasoningItemId,
        type: "reasoning",
        summary: [{ type: "summary_text", text: reasoningContent.slice(0, 200) }],
      });
    } else {
      // Normal case: reasoning arrived before text (or no reasoning).
      // Output array: [reasoning(0)?, message(0|1), tool_calls(1|2+)]
      if (reasoningEmitted) {
        output.push({
        id: reasoningItemId,
        type: "reasoning",
        summary: [{ type: "summary_text", text: reasoningContent.slice(0, 200) }],
      });
    }
    output.push({
        id: msgId,
        type: "message",
        role: "assistant",
        content: finalContent,
      });
    }

    for (const tc of toolCalls) {
      // Strip internal tracking field before sending to client
      const { _addedEmitted, ...tcClean } = tc;
      output.push(tcClean);
    }

    emit("response.output_item.done", {
      type: "response.output_item.done",
      sequence_number: seq++,
      output_index: msgOutputIndex,
      item: output[msgOutputIndex],
    });

    for (let i = 0; i < toolCalls.length; i++) {
      const tcOutputIndex = msgOutputIndex + 1 + i;
      // Fallback: if call_id was never set, generate one now
      if (!toolCalls[i].call_id) {
        toolCalls[i].call_id = uid("call");
      }
      // Fallback: if output_item.added was never emitted (call_id arrived too late), emit now
      if (!toolCalls[i]._addedEmitted) {
        toolCalls[i]._addedEmitted = true;
        emit("response.output_item.added", {
          type: "response.output_item.added",
          sequence_number: seq++,
          output_index: tcOutputIndex,
          item: {
            id: toolCalls[i].id,
            type: "function_call",
            call_id: toolCalls[i].call_id,
            name: toolCalls[i].name,
            arguments: "",
          },
        });
      }
      // Note: response.function_call_arguments.done is NOT sent — Codex CLI silently ignores it.
      // It gets complete arguments from response.output_item.done.
      // Strip internal _addedEmitted before sending to client
      const { _addedEmitted: _, ...tcDoneItem } = toolCalls[i];
      emit("response.output_item.done", {
        type: "response.output_item.done",
        sequence_number: seq++,
        output_index: tcOutputIndex,
        item: tcDoneItem,
      });
    }

    const isTruncated = streamFinishReason === "length";

    if (errorMsg) {
      // ── Error: send response.failed (Codex CLI only processes errors via this event) ──
      emit("response.failed", {
        type: "response.failed",
        sequence_number: seq++,
        response: {
          id: respId,
          object: "response",
          status: "failed",
          error: { message: errorMsg, type: errorType, code: errorCode },
        },
      });
    } else if (isTruncated) {
      // ── Truncated: send response.incomplete (Codex CLI expects this for max_output_tokens) ──
      emit("response.incomplete", {
        type: "response.incomplete",
        sequence_number: seq++,
        response: {
          id: respId,
          object: "response",
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
        },
      });
    } else {
      // ── Normal completion ──
      const completedResponse = {
        id: respId,
        object: "response",
        created_at: Math.floor(Date.now() / 1000),
        model,
        status: "completed",
        output,
        usage: streamUsage
          ? {
              input_tokens: streamUsage.prompt_tokens || 0,
              input_tokens_details: { cached_tokens: streamUsage.prompt_tokens_details?.cached_tokens || 0 },
              output_tokens: streamUsage.completion_tokens || 0,
              output_tokens_details: { reasoning_tokens: streamUsage.completion_tokens_details?.reasoning_tokens || 0 },
              total_tokens: streamUsage.total_tokens || 0,
            }
          : { input_tokens: 0, input_tokens_details: { cached_tokens: 0 }, output_tokens: 0, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 0 },
      };

      emit("response.completed", {
        type: "response.completed",
        sequence_number: seq++,
        response: completedResponse,
      });
    }

    if (DEBUG) {
      logInfo("[DEBUG] 流式最终 output:", JSON.stringify(output, null, 2));
      if (streamUsage) logInfo("[DEBUG] 流式 usage:", JSON.stringify(streamUsage));
      if (errorMsg) logInfo("[DEBUG] 流式错误:", errorMsg);
    }

    if (!res.writableEnded) res.end();
  }

  function processLines(lines) {
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.startsWith("data: ") ? line.slice(6).trim() : line.slice(5).trim();
      if (payload === "[DONE]") {
        finishStream();
        return;
      }
      if (!payload) continue;

      try {
        const parsed = JSON.parse(payload);

        if (parsed.error) {
          const errMsg = parsed.error.message || parsed.error.code || JSON.stringify(parsed.error);
          logError("上游返回错误 (HTTP 200):", errMsg);
          finishStream({
            message: errMsg,
            code: parsed.error.code || "server_error",
            type: parsed.error.type || "upstream_error",
          });
          return;
        }

        const delta = parsed.choices?.[0]?.delta;

        // Extract reasoning_content (DeepSeek, GLM, Kimi, Doubao, etc.)
        // MiniMax uses reasoning_details instead of reasoning_content
        const reasoningText = delta?.reasoning_content
          || (delta?.reasoning_details
            ? (typeof delta.reasoning_details === "string"
              ? delta.reasoning_details
              : delta.reasoning_details?.content || delta.reasoning_details?.text || "")
            : null);
        if (reasoningText) {
          if (!reasoningEmitted) {
            reasoningEmitted = true;
            reasoningItemId = uid("rs");
            if (layoutLocked) {
              // Text was already emitted at index 0; reasoning arrives late.
              // SSE events cannot be revoked, so reasoning gets a higher index.
              // This is an unusual ordering from the upstream provider.
              logWarn("上游在 text content 之后发送 reasoning_content，output_index 可能不匹配");
            }
            emit("response.output_item.added", {
              type: "response.output_item.added",
              sequence_number: seq++,
              output_index: layoutLocked ? msgItemEmitted ? 1 : 0 : 0,
              item: {
                id: reasoningItemId,
                type: "reasoning",
                summary: [{ type: "summary_text", text: "" }],
              },
            });
          }
          reasoningContent += reasoningText;
          emit("response.reasoning_text.delta", {
            type: "response.reasoning_text.delta",
            sequence_number: seq++,
            output_index: layoutLocked ? 1 : 0,
            content_index: 0,
            delta: reasoningText,
          });
        }

        if (delta?.content) {
          const textReasoningOffset = reasoningEmitted ? 1 : 0;
          // Emit deferred message item events on first content
          if (!msgItemEmitted) {
            msgItemEmitted = true;
            layoutLocked = true; // Text claimed index 0 (or reasoningOffset); lock layout
            emit("response.output_item.added", {
              type: "response.output_item.added",
              sequence_number: seq++,
              output_index: textReasoningOffset,
              item: { id: msgId, type: "message", role: "assistant", content: [] },
            });
            // Note: response.content_part.added is NOT sent — Codex CLI silently ignores it
          }
          fullText += delta.content;
          emit("response.output_text.delta", {
            type: "response.output_text.delta",
            sequence_number: seq++,
            output_index: textReasoningOffset,
            content_index: 0,
            delta: delta.content,
          });
        }

        if (delta?.tool_calls) {
          const tcReasoningOffset = reasoningEmitted ? 1 : 0;
          for (const tc of delta.tool_calls) {
            if (tc.index === undefined) continue;
            // 使用紧凑索引，避免上游稀疏 index 导致 output_index 不连续
            if (!(tc.index in toolIndexMap)) {
              toolIndexMap[tc.index] = toolCalls.length;
              const compactIndex = toolCalls.length;
              const initialId = tc.id || null;
              toolCalls.push({
                id: uid("fc"),
                type: "function_call",
                call_id: initialId,
                name: tc.function?.name || "",
                arguments: "",
                _addedEmitted: false, // Track whether output_item.added has been emitted
              });
              // Defer output_item.added until we have a stable call_id
              // to avoid ID mismatch between added and done events
              if (initialId) {
                const outputIndex = tcReasoningOffset + 1 + compactIndex;
                toolCalls[compactIndex]._addedEmitted = true;
                emit("response.output_item.added", {
                  type: "response.output_item.added",
                  sequence_number: seq++,
                  output_index: outputIndex,
                  item: {
                    id: toolCalls[compactIndex].id,
                    type: "function_call",
                    call_id: initialId,
                    name: toolCalls[compactIndex].name,
                    arguments: "",
                  },
                });
              }
            }
            const compactIndex = toolIndexMap[tc.index];
            const outputIndex = tcReasoningOffset + 1 + compactIndex;
            // Backfill call_id from later chunks if not set
            if (tc.id && !toolCalls[compactIndex].call_id) {
              toolCalls[compactIndex].call_id = tc.id;
              // Now that we have a stable call_id, emit deferred output_item.added
              if (!toolCalls[compactIndex]._addedEmitted) {
                toolCalls[compactIndex]._addedEmitted = true;
                emit("response.output_item.added", {
                  type: "response.output_item.added",
                  sequence_number: seq++,
                  output_index: outputIndex,
                  item: {
                    id: toolCalls[compactIndex].id,
                    type: "function_call",
                    call_id: tc.id,
                    name: toolCalls[compactIndex].name,
                    arguments: "",
                  },
                });
              }
            }
            if (tc.function?.name && !toolCalls[compactIndex].name) {
              const name = tc.function.name;
              toolCalls[compactIndex].name = name;
              if (validToolNames.length > 0 && !validToolNames.includes(name)) {
                logWarn(`模型调用了不存在的工具: "${name}"，可用工具: [${validToolNames.join(", ")}]`);
              }
            }
            if (tc.function?.arguments) {
              toolCalls[compactIndex].arguments += tc.function.arguments;
              // Note: response.function_call_arguments.delta is NOT sent — Codex CLI silently ignores it.
              // It gets complete arguments from response.output_item.done.
            }
          }
        }

        // Extract stream usage (sent by providers with stream_options.include_usage)
        if (parsed.usage) {
          streamUsage = parsed.usage;
        }

        // Track finish_reason for truncation detection
        if (parsed.choices?.[0]?.finish_reason) {
          streamFinishReason = parsed.choices[0].finish_reason;
        }
      } catch {
        // Ignore non-JSON SSE lines (e.g. comments, keep-alive pings)
      }
    }
  }

  upstreamRes.on("data", (chunk) => {
    if (done) return;
    const raw = decoder.write(chunk);
    if (DEBUG) {
      for (const line of raw.split("\n")) {
        if (line.trim()) logInfo("[DEBUG] 上游原始 SSE:", line);
      }
    }
    buffer += raw;
    const lines = buffer.split("\n");
    buffer = lines.pop();
    processLines(lines);
  });

  upstreamRes.on("end", () => {
    // Flush any remaining bytes in the decoder
    const remaining = decoder.end();
    if (remaining) buffer += remaining;
    if (!done && buffer.trim()) {
      logInfo("流结束，处理剩余 buffer");
      processLines([buffer]);
      buffer = "";
    }
    if (!done) {
      logWarn("上游流结束但未收到 [DONE]，强制完成");
      finishStream();
    }
  });

  upstreamRes.on("error", (err) => {
    logError("上游流式响应出错:", err.message);
    finishStream(err.message);
  });
}

// ── HTTP request helper ──────────────────────────────────────────────────────

function forwardRequest(url, headers, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === "https:";
    const transport = isHttps ? https : http;
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: "POST",
      headers,
      timeout: UPSTREAM_TIMEOUT,
    };

    const req = transport.request(options, resolve);
    req.on("error", reject);
    req.on("timeout", () => {
      logError(`上游请求超时 (${UPSTREAM_TIMEOUT / 1000}s)，中断连接`);
      req.destroy(new Error("Request timeout"));
    });
    req.write(body);
    req.end();
  });
}

// ── Main server ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(200, { "Access-Control-Allow-Origin": "*" });
    return res.end();
  }

  if (req.method === "POST" && req.url?.startsWith("/v1/responses")) {
    const startTime = Date.now();
    try {
      const rawBody = await readBody(req);
      let body;
      try {
        body = JSON.parse(rawBody.toString());
      } catch (parseErr) {
        logError("请求体 JSON 解析失败:", parseErr.message);
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "Invalid JSON in request body", type: "invalid_request" } }));
      }

      const chatReq = buildChatRequest(body);
      const chatBody = JSON.stringify(chatReq);

      const model = body.model || "unknown";
      const upstreamURL = `${UPSTREAM}/chat/completions`;

      const forwardHeaders = {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(chatBody),
      };

      if (req.headers.authorization) {
        forwardHeaders["Authorization"] = req.headers.authorization;
      } else if (process.env.OPENAI_API_KEY) {
        forwardHeaders["Authorization"] = `Bearer ${process.env.OPENAI_API_KEY}`;
      } else {
        logError("请求被拒绝: 未设置 OPENAI_API_KEY 环境变量，且请求未携带 Authorization 头");
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          error: {
            message: "API Key 未配置。请设置环境变量 OPENAI_API_KEY 或在请求中携带 Authorization 头。",
            type: "authentication_error",
          },
        }));
      }

      const toolCount = chatReq.tools?.length || 0;
      const validToolNames = (body.tools || []).filter((t) => t.type === "function").map((t) => t.name);
      logInfo(`${req.socket.remoteAddress} ${model} | stream=${chatReq.stream} | ${chatReq.messages.length} msgs | ${toolCount} tools`);

      // Warn if model name looks mismatched with the upstream provider
      if (PROVIDER !== "generic" && PROVIDER !== "ollama") {
        const providerPrefixes = {
          deepseek: ["deepseek"],
          glm: ["glm", "chatglm"],
          kimi: ["kimi", "moonshot"],
          qwen: ["qwen", "qwq", "qwen3"],
          doubao: ["doubao", "doubao-seed", "ark"],
          minimax: ["minimax", "abab"],
        };
        const prefixes = providerPrefixes[PROVIDER];
        if (prefixes) {
          const modelLower = model.toLowerCase();
          const matched = prefixes.some((p) => modelLower.includes(p));
          if (!matched) {
            logWarn(`模型名 "${model}" 可能与上游厂商 ${PROVIDER} 不匹配，请检查 Codex CLI 的模型配置`);
          }
        }
      }

      if (DEBUG) {
        logInfo("[DEBUG] 转换后的 Chat Completions 请求:");
        logInfo(JSON.stringify(chatReq, null, 2));
      }

      const upstreamRes = await forwardRequest(upstreamURL, forwardHeaders, chatBody);

      if (chatReq.stream) {
        handleStreaming(upstreamRes, res, model, validToolNames);
        upstreamRes.on("end", () => {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          logInfo(`流式完成 | ${elapsed}s`);
        });
      } else {
        const respBody = await readBody(upstreamRes);

        if (upstreamRes.statusCode !== 200) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const detail = respBody.toString().slice(0, 500);
          logError(`上游返回 ${upstreamRes.statusCode} | ${elapsed}s | ${detail}`);

          if (upstreamRes.statusCode === 401) {
            logError("API Key 认证失败，请检查密钥是否正确");
          }
          if (upstreamRes.statusCode === 429) {
            logError("请求频率超限或额度用尽，请稍后重试");
          }

          let upstreamMessage = detail;
          let upstreamCode = String(upstreamRes.statusCode);
          try {
            const parsed = JSON.parse(respBody.toString());
            upstreamMessage = parsed.error?.message || parsed.message || detail;
            if (parsed.error?.code) upstreamCode = String(parsed.error.code);
          } catch {
            // Non-JSON upstream error body — use raw text
          }

          let proxyStatus;
          switch (upstreamRes.statusCode) {
            case 401: proxyStatus = 401; break;
            case 429: proxyStatus = 429; break;
            default:  proxyStatus = 502; break;
          }

          res.writeHead(proxyStatus, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({
            error: { message: upstreamMessage, type: "upstream_error", code: upstreamCode },
          }));
        }

        let chatResp;
        try {
          chatResp = JSON.parse(respBody.toString());
        } catch (parseErr) {
          logError("上游响应 JSON 解析失败:", parseErr.message);
          res.writeHead(502, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: { message: "Bad upstream response", type: "proxy_error" } }));
        }

        // Check for error field in HTTP 200 response body
        if (chatResp.error) {
          const errMsg = chatResp.error.message || JSON.stringify(chatResp.error);
          logError("上游在 HTTP 200 中返回错误:", errMsg);
          res.writeHead(502, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: { message: errMsg, type: "upstream_error", code: chatResp.error.code } }));
        }

        const finishReason = chatResp.choices?.[0]?.finish_reason;
        const responsesObj = buildResponseObject(chatResp, model, finishReason);
        if (DEBUG) {
          logInfo("[DEBUG] 上游原始响应:", JSON.stringify(chatResp, null, 2));
          logInfo("[DEBUG] 转换后 Responses 响应:", JSON.stringify(responsesObj, null, 2));
        }
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const usage = chatResp.usage;
        if (finishReason === "length") {
          logWarn(`上游响应被截断 (finish_reason: length)，max_output_tokens 可能不足`);
        }
        logInfo(`请求完成 | ${elapsed}s | tokens: ${usage?.prompt_tokens ?? "?"}+${usage?.completion_tokens ?? "?"} | finish: ${finishReason ?? "?"}`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(responsesObj));
      }
    } catch (err) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logError(`代理内部错误 | ${elapsed}s |`, err.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: err.message, type: "proxy_error" } }));
    }
  } else if (req.method === "GET" && (req.url === "/v1/models" || req.url === "/models")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ object: "list", data: [] }));
  } else if (req.method === "GET" && (req.url === "/health" || req.url === "/v1/health")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", upstream: UPSTREAM }));
  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "Not found", type: "invalid_request" } }));
  }
});

server.listen(PORT, () => {
  logInfo(`response-proxy v${VERSION} 已启动 http://localhost:${PORT}`);
  logInfo(`上游地址: ${UPSTREAM}`);
  // Detect if using Coding Plan endpoint and hint
  if (UPSTREAM.includes("/coding/")) {
    const provider = detectProvider(UPSTREAM);
    const cpHints = {
      glm:     ["GLM Coding Plan", "glm"],
      qwen:    ["阿里云百炼 Coding Plan", "qwen"],
      doubao:  ["火山方舟 Coding Plan", "doubao"],
      minimax: ["MiniMax Coding Plan", "minimax"],
    };
    if (cpHints[provider]) {
      const [name, preset] = cpHints[provider];
      logInfo(`提示: 当前使用 ${name} 端点，需要订阅对应套餐`);
      logInfo(`  如未订阅，请使用常规端点: node response-proxy.mjs --upstream ${preset}`);
    }
  }
  if (!process.env.OPENAI_API_KEY) {
    logWarn("环境变量 OPENAI_API_KEY 未设置，请在 Codex CLI 配置中确保 API Key 可用");
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    logError(`端口 ${PORT} 已被占用。`);
    logError(`解决方法（任选其一）：`);
    logError(`  1. 使用其他端口:  PROXY_PORT=8080 node response-proxy.mjs`);
    logError(`  2. 先结束占用进程，再重新启动`);
    // Try to identify the process occupying the port
    try {
      const isWin = process.platform === "win32";
      let cmd;
      if (isWin) {
        cmd = `netstat -ano | findstr :${PORT}`;
      } else {
        cmd = `lsof -i :${PORT} -t 2>/dev/null || ss -tlnp | grep :${PORT}`;
      }
      const output = execSync(cmd, { encoding: "utf-8", timeout: 3000 }).trim();
      if (output) {
        logError(`  占用端口的进程:`);
        logError(`    ${output.split("\n").slice(0, 3).join("\n    ")}`);
        if (!isWin && output.includes("\n")) {
          const pids = output.split("\n").map(l => l.trim()).filter(Boolean);
          logError(`  一键结束:  kill ${pids.join(" ")}`);
        }
      }
    } catch {
      // Command not available or timed out — skip
    }
  } else {
    logError("服务器启动失败:", err.message);
  }
  process.exit(1);
});

// ── Graceful shutdown ───────────────────────────────────────────────────────

function shutdown() {
  logInfo("正在关闭代理...");
  server.close(() => {
    if (logStream) logStream.end();
    logInfo("代理已关闭");
    process.exit(0);
  });
  setTimeout(() => {
    if (logStream) logStream.end();
    process.exit(0);
  }, 3000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
