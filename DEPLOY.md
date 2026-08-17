# LINGGAN 部署说明

## 数据持久化（重要）

用户账号与工作区数据保存在服务端本地文件：

| 路径 | 内容 |
|------|------|
| `server/data/users.json` | 注册账号、密码哈希、角色 |
| `server/data/workspaces/{userId}.json` | 画布、版本、用户设置（含 API Key） |

在 Render、Railway 等无状态 PaaS 上，**容器重启后这些文件会丢失**，除非挂载持久化卷。

### Render 持久化磁盘示例

1. 在 Web Service 添加 **Disk**
2. Mount Path: `/opt/render/project/src/server/data`
3. 确保 `Start Command` 从 `server` 目录启动，使 `data/` 落在挂载路径下

### 生产环境变量

```
NODE_ENV=production
JWT_SECRET=<随机长字符串>
ADMIN_EMAIL=<管理员邮箱>
ADMIN_PASSWORD=<强密码>
```

## 构建与启动

仓库根目录即项目根目录（`client/` 与 `server/` 并列）。

```bash
# Build
cd client && npm install && npm run build && cd ../server && npm install && npm run build

# Start
cd server && NODE_ENV=production node dist/index.js
```

生产模式下 Express 会同时托管 `client/dist` 与 API。
