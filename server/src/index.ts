import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import aiRoutes from './routes/ai.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import workspaceRoutes from './routes/workspace.js';
import { ensureBootstrapAdmin } from './services/userStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/workspace', workspaceRoutes);
app.use('/api/ai', aiRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// In production, serve the built client files
const clientDist = path.join(__dirname, '../../client/dist');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.json({ message: 'LINGGAN API Server', frontend: 'http://localhost:5173' });
  });
}

async function start() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    await ensureBootstrapAdmin(adminEmail, adminPassword);
  } else if (process.env.NODE_ENV !== 'production') {
    console.log('[auth] 未配置 ADMIN_EMAIL / ADMIN_PASSWORD，跳过管理员初始化');
  }

  app.listen(PORT, () => {
    console.log(`LINGGAN 服务端已启动: http://localhost:${PORT}`);
    console.log('[data] 用户与工作区数据目录: server/data/（部署时请挂载持久化卷，见 DEPLOY.md）');
  });
}

start();
