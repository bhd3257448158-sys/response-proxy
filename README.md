# response-proxy

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)

> 一个文件，让 Codex CLI 接入任何 Chat Completions 后端

**零依赖 · 通用 · 单文件 Node.js 代理**

---

## 目录

- [这是什么？](#这是什么)
- [前置条件](#前置条件)
- [快速开始](#快速开始)
- [支持的模型厂商](#支持的模型厂商)
- [常见问题](#常见问题)
- [配置文件说明](#配置文件说明)
- [命令行参数](#命令行参数)
- [技术参考](#技术参考)
- [License](#license)

---

## 这是什么？

[Codex CLI](https://github.com/openai/codex) 是 OpenAI 出品的终端 AI 编程助手。从 2026 年 2 月起，Codex CLI 不再支持 Chat Completions API，仅支持 OpenAI 的 Responses API。如果你想让 Codex CLI 接入其他大模型（DeepSeek、智谱 GLM、Kimi、通义千问、豆包、MiniMax，或任何 OpenAI 兼容 API），就需要一个"翻译官"——这就是 `response-proxy`。

```
Codex CLI  ──→  response-proxy  ──→  你选择的任何大模型
(OpenAI格式)     (自动翻译协议)       (任何 Chat Completions 后端)
```

---

## 前置条件

你需要安装 **Node.js**（版本 18 或更高）和 **Codex CLI**。

### 安装 Node.js

**macOS：**
```bash
brew install node
```

**Linux（Ubuntu/Debian）：**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Windows：** 访问 https://nodejs.org ，下载 LTS 版本安装。

### 安装 Codex CLI

```bash
npm install -g @openai/codex
```

> macOS 也可使用 `brew install --cask codex` 安装。

---

## 快速开始

### 第 1 步：下载脚本

```bash
# macOS / Linux
curl -O https://raw.githubusercontent.com/bhd3257448158-sys/response-proxy/main/response-proxy.mjs
```
```powershell
# Windows（PowerShell）
Invoke-WebRequest -Uri https://raw.githubusercontent.com/bhd3257448158-sys/response-proxy/main/response-proxy.mjs -OutFile response-proxy.mjs
```

或直接浏览器访问上面的 URL，右键"另存为"。

### 第 2 步：启动代理

在脚本所在文件夹打开终端，运行：

```bash
node response-proxy.mjs
```

- **首次运行**：自动进入配置向导，引导你选择厂商、输入 API Key、选择模型、配置调试选项，然后进行连通性测试，代理自动启动
- **再次运行**：自动加载上次配置，直接启动，无需重复输入
- **重新配置**：运行 `node response-proxy.mjs --setup`

### 第 3 步：开始使用

```bash
codex
```

**搞定！** 🎉

---

## 支持的模型厂商

| 厂商 | 推荐模型 | 说明 |
|------|---------|------|
| 智谱 GLM | `GLM-5.1` | 按 token 计费 |
| 智谱 GLM Coding Plan | `GLM-5.1` | 需订阅 Coding Plan，额度更高 |
| DeepSeek | `deepseek-chat` / `deepseek-reasoner` | 价格便宜 |
| Kimi | `kimi-k2.5` | 支持超长上下文 |
| 通义千问 | `qwen-max` | 阿里云百炼平台 |
| 百炼 Coding Plan | `qwen3.6-plus` | 需订阅百炼 Coding Plan |
| 豆包 | `doubao-seed-1.5` | 火山引擎方舟平台 |
| 豆包 Coding Plan | `ark-code-latest` | 需订阅方舟 Coding Plan |
| MiniMax | `minimax-m2.5` | 支持交错思考 |
| MiniMax Coding Plan | `minimax-m2.7` | 需订阅 MiniMax Coding Plan |
| Ollama | 任意本地模型 | **完全免费**，无需 API Key |
| 其他 | — | 任何 OpenAI 兼容 API |

---

## 常见问题

### 上游返回 401（认证失败）

API Key 不正确或已过期。请运行 `node response-proxy.mjs --setup` 重新配置。

### 上游返回 429（请求过多）

请求频率超限或额度用尽。请检查你的账户余额或套餐用量。

### 模型名不匹配警告

代理日志中出现 `模型名 "xxx" 可能与上游厂商不匹配` 时，说明 Codex CLI 发送的模型名与当前上游厂商不一致。运行 `node response-proxy.mjs --setup` 重新配置即可。

### 工具调用不生效

部分模型可能不支持 function calling。运行 `node response-proxy.mjs --setup` 并开启调试模式查看详情。

### 如何确认代理正在运行？

```bash
curl http://localhost:9090/health
# 应返回: {"status":"ok","upstream":"https://..."}
```

### 端口被占用怎么办？

```bash
# 换一个端口
node response-proxy.mjs --port 8080

# 或结束占用进程
kill <PID>        # macOS / Linux
taskkill /PID <PID> /F  # Windows
```

### 如何重置所有配置？

```bash
# macOS / Linux
rm ~/.response-proxy.json
node response-proxy.mjs --setup

# Windows
del %USERPROFILE%\.response-proxy.json
node response-proxy.mjs --setup
```

---

## 配置文件说明

代理涉及 3 个配置文件，均由向导自动管理，一般无需手动编辑。

### `~/.codex/config.toml`（Codex CLI 配置）

**路径：** `~/.codex/config.toml`（Windows: `%USERPROFILE%\.codex\config.toml`）

告诉 Codex CLI 使用 response-proxy 作为模型提供者：

```toml
model = "deepseek-chat"
model_provider = "response_proxy"

[model_providers.response_proxy]
name = "Response Proxy (any Chat Completions backend)"
base_url = "http://localhost:9090/v1"
env_key = "OPENAI_API_KEY"
wire_api = "responses"
model = "deepseek-chat"
```

> ⚠️ 顶层 `model` 必须与 provider 内的 `model` 保持一致，否则会导致模型名不匹配。向导会自动处理这一点。

### `~/.codex/auth.json`（API Key 存储）

**路径：** `~/.codex/auth.json`（Windows: `%USERPROFILE%\.codex\auth.json`）

Codex CLI 从此文件读取 API Key：

```json
{
  "auth_mode": "apikey",
  "OPENAI_API_KEY": "sk-你的密钥"
}
```

> ⚠️ 切换厂商后必须重新运行 `--setup`，否则 auth.json 中的旧 Key 会导致认证失败。

### `~/.response-proxy.json`（代理配置记忆）

**路径：** `~/.response-proxy.json`（Windows: `%USERPROFILE%\.response-proxy.json`）

保存上次向导的配置，下次启动时自动加载：

```json
{
  "upstreamURL": "https://api.deepseek.com/v1",
  "apiKey": "sk-你的密钥",
  "model": "deepseek-chat",
  "enableDebug": false,
  "logFile": "",
  "providerName": "DeepSeek"
}
```

> 如需完全重置配置，删除此文件后重新运行 `node response-proxy.mjs`。

---

## 命令行参数

```bash
node response-proxy.mjs [选项]

选项:
  --port <端口>        代理监听端口（默认 9090）
  --setup              重新配置并启动代理（交互式向导）
  --help, -h           显示帮助
  --version, -v        显示版本
```

---

## 技术参考

### 工作原理

```
Codex CLI                        response-proxy                     上游模型
┌──────────────┐                 ┌──────────────┐                  ┌──────────────┐
│              │  Responses API  │              │  Chat Completions│              │
│  POST        │ ──────────────→ │  协议转换     │ ──────────────→  │              │
│  /v1/        │                 │              │                  │              │
│  responses   │                 │  · 格式转换   │                  │              │
│              │                 │  · 工具调用   │                  │              │
│              │  Responses API  │  · 流式 SSE   │  Chat Completions│              │
│              │ ←────────────── │  · 错误处理   │ ←────────────── │              │
└──────────────┘                 └──────────────┘                  └──────────────┘
```

代理在 Codex CLI 的 Responses API 和上游的 Chat Completions API 之间做协议翻译，包括：

- **请求转换**：`instructions` → system 消息、`input[]` → `messages[]`、工具定义格式转换
- **响应转换**：Chat Completions 的 SSE 流 → Responses API 的 SSE 事件
- **工具调用**：正确处理多轮 `function_call` / `function_call_output` 配对
- **推理模式**：自动适配各厂商的思考/推理参数（`thinking`、`enable_thinking`、`reasoning_split` 等）
- **错误处理**：上游错误格式归一化，正确发送 `response.failed` / `response.incomplete` 事件

代理根据上游地址**自动检测厂商**并适配参数（推理模式、stream_options、tool_choice 等），无需手动配置。URL 不匹配任何已知厂商时，以通用模式原样透传。

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/v1/responses` | 主代理端点（Codex CLI 调用这个） |
| `GET` | `/v1/models` | 模型列表（兼容性端点） |
| `GET` | `/health` | 健康检查 |

### 特性

- **零依赖** — 纯 Node.js 标准库，无需 `npm install`
- **单文件** — 一个 `.mjs` 文件，拷贝即用
- **通用** — 不绑定任何模型提供商，向导切换即可
- **完整协议转换** — 请求 + 响应 + 流式 SSE + 工具调用 + 推理模式
- **多轮工具调用** — 正确处理 `function_call` / `function_call_output` 配对
- **推理内容回传** — DeepSeek 等模型思考模式下的多轮工具调用正确传递推理内容
- **错误处理** — 上游错误格式归一化，正确区分 `response.failed` / `response.incomplete`
- **UTF-8 安全** — 使用 `StringDecoder` 处理多字节字符，避免中文乱码
- **客户端断开检测** — 用户取消时自动终止上游请求，不浪费资源
- **引导式启动** — 首次运行自动进入配置向导，选厂商、输 Key、选模型，一步到位
- **配置记忆** — 自动保存配置，下次启动直接加载，无需重复输入
- **连通性测试** — 配置完成后自动验证 API Key 和模型是否可用
- **日志文件** — 支持写入日志文件，方便排查问题
- **调试模式** — 向导中可选开启，查看完整的请求/响应转换日志

---

## License

[MIT](LICENSE) © 2025

---

如果这个项目对你有帮助，欢迎给个 ⭐ Star！
