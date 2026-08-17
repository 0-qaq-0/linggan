# LINGGAN — AI 引导式灵感激发与无限画布

LINGGAN 是一款 **AI 引导式头脑风暴工具**：不是让 AI 直接给你答案，而是让 AI 像一位会提问的伙伴，通过一轮一轮的定向提问帮你把模糊的灵感打磨成清晰的想法，并将整个过程可视化地沉淀在一张**无限画布**上。

- 前端：React 18 + TypeScript + Vite + Tailwind CSS + React Flow（@xyflow/react）+ Zustand + Dexie + Framer Motion
- 后端：Express + TypeScript（tsx 开发 / tsc 构建）
- AI：支持 Anthropic Claude 与 OpenAI 兼容接口，流式输出、思考过程展示、结构化 JSON 抽取

> 灵感（linggan，灵感的拼音）→ 提问（guided questioning）→ 精炼（refinement）→ 画布沉淀（crystallization）

---

## ✨ 功能特性

### 🧭 AI 引导式提问（Ideation）
- 输入一个模糊想法，AI 按 **analyze → questions（5~8 轮）→ final** 的生命周期逐步引导
- 每轮只提出 **1 个关键问题 + 2~4 个可选路径**，也可自定义输入，像剥洋葱一样逐层深入（5W1H 框架）
- 每轮附带简短洞察（analysis）与步骤标签，形成**可追溯的思考步骤时间线**
- 收集足够回答后，AI 综合所有回答产出**精炼版想法**，并给出建议标签

### 🖼️ 无限画布（Infinite Canvas）
- 基于 React Flow 的无限画布：卡片（主题/元素）、连线、多级子画布
- 一次思考过程中，AI 可建议将成熟子话题**固化为独立元素节点**（suggestElement）
- 卡片支持多种强调色、标签、连接关系
- 对话步骤与画布元素一一映射，可查看**步骤 ↔ 元素回滚图**（Rollback Graph）

### 📚 卡片版本管理（Git 式分支）
- 每张卡片拥有独立版本树，支持分支、回滚
- 每个版本保存当时完整的对话历史，随时回溯灵感演化过程

### 🤖 AI Agent 面板（画布操作助手）
- 用自然语言指挥 Agent 操作画布，基于**结构化操作协议**执行：
  `createElement` / `connect` / `recolor` / `rename` / `delete` / `summarize` / `startQuestioning` / `setAnchor`
- 每一步操作都有明确的执行状态（pending / executed / rejected）

### 🔍 AI 推荐
- 根据当前卡片内容与画布上下文，推荐值得继续思考的问题方向

### 🔐 用户认证与管理
- 邮箱 + 密码注册登录，JWT 鉴权（默认 7 天有效期）
- 用户角色：`user` / `admin`；管理面板可查看所有用户、调整角色、禁用账号

### ☁️ 云端工作区同步
- 画布、版本、设置（含 AI Provider / API Key）按用户同步到服务端
- 基于 **revision 乐观锁** 的同步协议，多设备冲突返回 409 并由客户端合并

### ⚙️ AI 设置
- Provider：`anthropic` / `openai`，支持自定义 `baseURL`（可接入 DeepSeek 等 OpenAI 兼容服务）
- 内置常用模型列表，支持**测试连接**并自动拉取可用模型

---

## 🧱 目录结构

```
.
├── client/                  # 前端（React + Vite）
│   ├── src/
│   │   ├── components/      # 画布、聊天、卡片、认证、Agent、管理面板等
│   │   ├── services/        # AI 请求、认证、工作区同步等 API 封装
│   │   ├── store/           # Zustand 全局状态（画布、会话、认证、同步、Agent）
│   │   ├── db/              # Dexie 本地缓存（IndexedDB）
│   │   └── types/           # 领域类型定义
│   ├── index.html
│   ├── vite.config.ts       # dev 端口 5173，/api 代理到 3001
│   └── package.json
├── server/                  # 后端（Express + TypeScript）
│   ├── src/
│   │   ├── routes/          # auth / admin / workspace / ai
│   │   ├── services/        # aiClient / userStore / workspaceStore
│   │   ├── prompts/         # 引导提问、总结、Agent 系统提示词
│   │   └── middleware/      # requireAuth / requireAdmin
│   ├── data/                # 运行时数据（自动创建，需持久化）
│   └── package.json
├── DEPLOY.md                # 部署与数据持久化说明
├── LICENSE                  # MIT License
└── README.md
```

---

## 🚀 快速开始

### 环境要求
- Node.js ≥ 18

### 1. 安装依赖

```bash
# 前端
cd client
npm install

# 后端
cd ../server
npm install
```

### 2. 配置环境变量

在仓库根目录创建 `.env`（服务端启动时自动读取 `../../.env`，即仓库根目录）：

```bash
# 服务端端口（默认 3001）
PORT=3001

# JWT 密钥与有效期（强烈建议生产环境修改）
JWT_SECRET=your-secret
JWT_EXPIRES_IN=7d

# 首次启动时自动创建的管理员账号（可选，非生产环境跳过）
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=strong-password-here
```

> AI 的 Provider / API Key / Model 不需要写在这里，登录后在网页「设置」面板中配置即可（会保存到你的工作区里）。

### 3. 启动开发环境

```bash
# 终端 1：后端（http://localhost:3001）
cd server
npm run dev

# 终端 2：前端（http://localhost:5173，/api 已代理到 3001）
cd client
npm run dev
```

打开 http://localhost:5173 ，注册账号后即可开始。

---

## 🏗️ 生产构建与启动

```bash
# 构建
cd client && npm install && npm run build
cd ../server && npm install && npm run build

# 启动（生产模式，Express 同时托管 client/dist 与 API）
cd server && NODE_ENV=production node dist/index.js
```

生产模式下访问 `http://localhost:3001` 即为完整应用。

详细部署（Render / Railway 持久化磁盘、环境变量）见 **[DEPLOY.md](./DEPLOY.md)**。

---

## 🔌 API 概览

所有业务接口均需 `Authorization: Bearer <token>`。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册（邮箱 + 密码 ≥ 6 位） |
| POST | `/api/auth/login` | 登录，返回 JWT |
| GET | `/api/auth/me` | 当前用户信息 |
| GET | `/api/workspace/meta` | 工作区元信息（revision 等） |
| GET | `/api/workspace` | 拉取完整工作区 |
| PUT | `/api/workspace` | 保存工作区（baseRevision 乐观锁，冲突返回 409） |
| POST | `/api/ai/test` | 测试 AI Provider 连接并获取模型列表 |
| POST | `/api/ai/chat` | AI 对话（引导提问/精炼），支持 `stream: true` |
| POST | `/api/ai/summarize` | 将对话总结为画布元素 |
| POST | `/api/ai/recommend` | 获取 AI 推荐问题 |
| GET | `/api/health` | 健康检查 |
| GET | `/api/admin/users` | （管理员）用户列表 |
| PATCH | `/api/admin/users/:id` | （管理员）修改角色 / 禁用 |

---

## 💾 数据存储

| 路径 | 内容 |
|------|------|
| `server/data/users.json` | 注册账号、密码哈希（bcrypt）、角色 |
| `server/data/workspaces/{userId}.json` | 画布、版本、用户设置（含 API Key） |
| 浏览器 IndexedDB（Dexie） | 客户端本地缓存，支持离线工作与同步 |

> ⚠️ `server/data/` 是运行时数据，已加入 `.gitignore`。部署到无状态 PaaS 时请务必挂载持久化卷，详见 [DEPLOY.md](./DEPLOY.md)。

---

## 🔑 主要环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3001` | 服务端端口 |
| `NODE_ENV` | — | `production` 时托管 `client/dist` |
| `JWT_SECRET` | `linggan-dev-secret-change-me` | JWT 签名密钥，生产环境务必修改 |
| `JWT_EXPIRES_IN` | `7d` | Token 有效期 |
| `ADMIN_EMAIL` | — | 启动时自动创建的管理员邮箱 |
| `ADMIN_PASSWORD` | — | 管理员密码 |

---

## 📄 许可证

[MIT](./LICENSE) © 2026 0-qaq-0