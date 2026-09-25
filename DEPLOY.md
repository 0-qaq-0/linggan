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
JWT_SECRET=<32 字节随机字符串，必填>
ADMIN_EMAIL=<管理员邮箱>
ADMIN_PASSWORD=<强密码>
```

> ⚠️ **`JWT_SECRET` 是必填项。** 它是登录令牌的签名密钥，泄露等于任何人都能伪造任意用户（含管理员）的登录状态。
>
> 服务端启动时会校验，出现以下任一情况会**直接退出并打印原因**，不会带着不安全配置继续服务：
> - 未配置 `JWT_SECRET`
> - 仍使用历史默认值 `linggan-dev-secret-change-me`
> - 长度不足 16 字符
>
> 生成方式：
> ```bash
> openssl rand -hex 32
> # 或
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```
>
> 更换密钥后，此前签发的所有登录令牌都会失效，用户需要重新登录（这是预期行为）。

## 构建与启动

仓库根目录即项目根目录（`client/` 与 `server/` 并列）。

```bash
# Build
cd client && npm install && npm run build && cd ../server && npm install && npm run build

# Start
cd server && NODE_ENV=production node dist/index.js
```

生产模式下 Express 会同时托管 `client/dist` 与 API。
