# response-proxy

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)

> 一个文件，让 Codex CLI 接入任何 Chat Completions 后端 | A single-file proxy that connects Codex CLI to any Chat Completions backend

**零依赖 · 通用 · 单文件 Node.js 代理**

---

## 这是什么？

[Codex CLI](https://github.com/openai/codex) 是 OpenAI 出品的终端 AI 编程助手，但它**只支持 OpenAI 的 API**。如果你想让 Codex CLI 使用国产大模型（DeepSeek、智谱 GLM、Kimi、通义千问、豆包、MiniMax 等），就需要一个"翻译官"——这就是 `response-proxy`。

它做的事情很简单：

```
Codex CLI  ──→  response-proxy  ──→  你选择的任何大模型
(OpenAI格式)     (自动翻译协议)       (国产模型/本地模型)
```

**你不需要理解协议转换的细节**，只需要知道：设置好 API Key，启动代理，就能用了。

---

## 前置条件

你需要安装 **Node.js**（版本 18 或更高）和 **Codex CLI**。

### 检查是否已安装

**所有平台通用：**
```bash
node --version
```

### 安装 Node.js

**macOS / Linux：**
```bash
# macOS（Homebrew）
brew install node

# Linux（Ubuntu/Debian）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Windows：**
1. 访问 https://nodejs.org
2. 下载 LTS（长期支持）版本
3. 双击安装，一路"下一步"

### 安装 Codex CLI

**macOS / Linux：**
```bash
npm install -g @openai/codex
```

**Windows（CMD）：**
```cmd
npm install -g @openai/codex
```

---

## 快速开始（3 分钟上手）

### 第 1 步：下载脚本

**方式一：命令行下载**
```bash
# macOS / Linux
curl -O https://raw.githubusercontent.com/bhd3257448158-sys/response-proxy/main/response-proxy.mjs
```
```cmd
:: Windows（PowerShell）
Invoke-WebRequest -Uri https://raw.githubusercontent.com/bhd3257448158-sys/response-proxy/main/response-proxy.mjs -OutFile response-proxy.mjs
```

**方式二：浏览器下载**

直接访问 https://raw.githubusercontent.com/bhd3257448158-sys/response-proxy/main/response-proxy.mjs ，右键"另存为"即可。

### 第 2 步：启动代理

**所有平台通用：**
```bash
node response-proxy.mjs
```

- **首次运行**：自动进入配置向导，引导你选择厂商、输入 API Key、选择模型、配置调试选项，然后进行连通性测试，代理自动启动
- **再次运行**：自动加载上次配置，直接启动，无需重复输入
- **重新配置**：运行 `node response-proxy.mjs --setup`

配置保存在 `~/.response-proxy.json`（Windows: `%USERPROFILE%\.response-proxy.json`）。

### 第 3 步：开始使用

打开一个**新的终端窗口**，运行：

**所有平台通用：**
```bash
# 交互模式（像 ChatGPT 一样对话）
codex --config model_provider="response_proxy"

# 指定模型
codex --config model_provider="response_proxy" --model deepseek-chat

# 直接执行任务
codex exec "用 Python 写一个贪吃蛇游戏" --config model_provider="response_proxy" --full-auto
```

**搞定！** 🎉

---

## 支持的模型厂商

| 厂商 | UPSTREAM_BASE_URL | 推荐模型 | 说明 |
|------|-------------------|---------|------|
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | `GLM-5.1` | **默认值**，按 token 计费 |
| 智谱 GLM Coding Plan | `https://open.bigmodel.cn/api/coding/paas/v4` | `GLM-5.1` | 需订阅 Coding Plan，额度更高 |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` / `deepseek-reasoner` | 价格便宜，推荐新手 |
| Kimi | `https://api.moonshot.cn/v1` | `kimi-k2.5` | 支持超长上下文 |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-max` | 阿里云百炼平台 |
| 百炼 Coding Plan | `https://coding.dashscope.aliyuncs.com/v1` | `qwen3.6-plus` | 需订阅百炼 Coding Plan |
| 豆包 | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-seed-1.5` | 火山引擎方舟平台 |
| 豆包 Coding Plan | `https://ark.cn-beijing.volces.com/api/coding/v3` | `ark-code-latest` | 需订阅方舟 Coding Plan |
| MiniMax | `https://api.minimax.chat/v1` | `minimax-m2.5` | 支持交错思考 |
| MiniMax Coding Plan | `https://api.minimaxi.com/v1` | `minimax-m2.7` | 需订阅 MiniMax Coding Plan |
| Ollama | `http://localhost:11434/v1` | 任意本地模型 | **完全免费**，无需 API Key |
| 其他 | 自定义 | — | 任何 OpenAI 兼容 API |

---

---

## 命令行参数

**所有平台通用：**
```bash
node response-proxy.mjs [选项]

选项:
  --port <端口>        代理监听端口（默认 9090）
  --upstream <URL>     上游地址（支持预设名: deepseek, kimi, glm 等）
  --setup              重新配置 Codex CLI（交互式向导）
  --help, -h           显示帮助
  --version, -v        显示版本
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PROXY_PORT` | `9090` | 代理监听端口 |
| `UPSTREAM_BASE_URL` | `https://open.bigmodel.cn/api/paas/v4` | 上游 API 地址（支持预设名） |
| `OPENAI_API_KEY` | — | API 密钥（也支持请求中的 Authorization 头） |
| `DEBUG` | `false` | 设为 `1` 开启调试日志 |
| `LOG_FILE` | — | 日志文件路径 |
| `PROVIDER` | 自动检测 | 强制指定厂商：`glm`/`deepseek`/`kimi`/`qwen`/`doubao`/`minimax`/`ollama`/`generic` |
| `TOOL_CHOICE_STRICT` | `false` | 设为 `1` 保留原始 tool_choice 值（不降级为 auto） |

---

## 常见问题

### Codex CLI 报 "API Key 未配置"

最简单的方式是直接运行 `node response-proxy.mjs`，配置向导会自动收集 API Key。

如果手动启动，确保设置了 `OPENAI_API_KEY` 环境变量：

**macOS / Linux：**
```bash
export OPENAI_API_KEY="你的密钥"
node response-proxy.mjs
```
**Windows（CMD）：**
```cmd
set OPENAI_API_KEY=你的密钥
node response-proxy.mjs
```

### 上游返回 401（认证失败）

API Key 不正确或已过期。请到对应厂商平台检查你的密钥。

### 上游返回 429（请求过多）

请求频率超限或额度用尽。请检查你的账户余额或套餐用量。

### 工具调用不生效

部分模型可能不支持 function calling。开启调试模式查看详情：

**macOS / Linux：**
```bash
DEBUG=1 node response-proxy.mjs
```
**Windows（CMD）：**
```cmd
set DEBUG=1
node response-proxy.mjs
```

### 如何确认代理正在运行？

**macOS / Linux：**
```bash
curl http://localhost:9090/health
# 应返回: {"status":"ok","upstream":"https://..."}
```
**Windows（CMD）：**
```cmd
curl http://localhost:9090/health
```

### 端口被占用怎么办？

启动时如果提示 `端口 9090 已被占用`，代理会自动检测并显示占用进程的 PID，你可以：

**macOS / Linux：**
```bash
# 方法 1：换一个端口
PROXY_PORT=8080 node response-proxy.mjs

# 方法 2：结束占用进程（代理会显示具体命令）
kill <PID>
```
**Windows（CMD）：**
```cmd
:: 方法 1：换一个端口
set PROXY_PORT=8080
node response-proxy.mjs

:: 方法 2：结束占用进程
taskkill /PID <PID> /F
```

### 如何在后台运行？

**macOS / Linux：**
```bash
# 使用 nohup
nohup node response-proxy.mjs > proxy.log 2>&1 &

# 或使用 screen/tmux
screen -S proxy
node response-proxy.mjs
# 按 Ctrl+A 然后按 D 分离
```
**Windows：** 直接关闭窗口即可，或在 PowerShell 中使用 `Start-Process`。

### 如何同时使用多个模型？

启动多个代理实例，使用不同端口：

**macOS / Linux：**
```bash
# 终端 1：DeepSeek
UPSTREAM_BASE_URL=https://api.deepseek.com/v1 PROXY_PORT=9091 node response-proxy.mjs

# 终端 2：GLM
PROXY_PORT=9092 node response-proxy.mjs
```
**Windows（CMD）：**
```cmd
:: 终端 1：DeepSeek
set UPSTREAM_BASE_URL=https://api.deepseek.com/v1
set PROXY_PORT=9091
node response-proxy.mjs

:: 终端 2：GLM
set PROXY_PORT=9092
node response-proxy.mjs
```

然后在 `~/.codex/config.toml`（Windows: `%USERPROFILE%\.codex\config.toml`）中配置多个 provider。

---

## 工作原理

```
Codex CLI                        response-proxy                     GLM / DeepSeek / ...
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

代理在 Codex CLI 的 Responses API 和国产模型的 Chat Completions API 之间做协议翻译，包括：

- **请求转换**：`instructions` → system 消息、`input[]` → `messages[]`、工具定义格式转换
- **响应转换**：Chat Completions 的 SSE 流 → Responses API 的 SSE 事件
- **工具调用**：正确处理多轮 `function_call` / `function_call_output` 配对
- **推理模式**：自动适配各厂商的思考/推理参数（`thinking`、`enable_thinking`、`reasoning_split` 等）
- **错误处理**：上游错误格式归一化，正确发送 `response.failed` / `response.incomplete` 事件

### 各厂商自动适配

代理根据 `UPSTREAM_BASE_URL` **自动检测厂商**并适配参数，无需手动配置。

| 适配项 | DeepSeek | GLM | Kimi | 通义千问 | 豆包 | MiniMax |
|--------|----------|-----|------|---------|------|---------|
| 推理参数 | `thinking.type` | `thinking.type` | `thinking.type` | `enable_thinking` | `thinking.type`+auto | `reasoning_split` |
| stream_options | ✅ | ⚠️ 清理 | ✅ | ✅ | ✅ | ✅ |
| tool_choice: required | ✅ | ⚠️ 降级auto | ⚠️ 降级auto | ⚠️ 降级auto | ✅ | ⚠️ 降级auto |
| parallel_tool_calls | ⚠️ 删除 | ⚠️ 删除 | ⚠️ 删除 | ⚠️ 删除 | ⚠️ 删除 | ⚠️ 删除 |
| tools[].strict | ⚠️ 删除 | ⚠️ 删除 | ⚠️ 删除 | ⚠️ 删除 | ⚠️ 删除 | ⚠️ 删除 |

> ⚠️ = 该参数不被对应厂商支持，代理自动清理或降级以避免请求报错。

### 厂商检测规则

| 厂商 | URL 关键词 |
|------|-----------|
| 智谱 GLM | `bigmodel.cn` / `z.ai` |
| DeepSeek | `deepseek` |
| Kimi | `moonshot.cn` / `kimi` |
| 通义千问 | `dashscope` / `aliyuncs` |
| 豆包 (火山引擎) | `volces.com` / `ark.cn-beijing` |
| MiniMax | `minimax` |
| Ollama | `localhost` / `127.0.0.1` / `ollama` |

URL 不匹配任何规则时，代理以通用模式运行（原样透传所有参数）。可通过 `PROVIDER` 环境变量强制指定。

---

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/v1/responses` | 主代理端点（Codex CLI 调用这个） |
| `GET` | `/v1/models` | 模型列表（兼容性端点） |
| `GET` | `/health` | 健康检查 |

---

## 特性

- **零依赖** — 纯 Node.js 标准库，无需 `npm install`
- **单文件** — 一个 `.mjs` 文件，拷贝即用
- **通用** — 不绑定任何模型提供商，换一行环境变量即可切换
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
- **调试模式** — `DEBUG=1` 查看完整的请求/响应转换日志

---

## License

[MIT](LICENSE) © 2025

---

如果这个项目对你有帮助，欢迎给个 ⭐ Star！
