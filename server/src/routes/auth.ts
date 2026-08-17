import { Router, type Request, type Response } from 'express';
import {
  createUser,
  findUserByEmail,
  toPublicUser,
  verifyPassword,
} from '../services/userStore.js';
import { requireAuth, signToken } from '../middleware/requireAuth.js';

const router = Router();

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email?.trim() || !password) {
      return res.status(400).json({ error: '请填写邮箱和密码' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少 6 位' });
    }

    const user = await createUser(email, password, 'user');
    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    res.json({ token, user });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '注册失败' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email?.trim() || !password) {
      return res.status(400).json({ error: '请填写邮箱和密码' });
    }

    const record = findUserByEmail(email);
    if (!record || !(await verifyPassword(record, password))) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }
    if (record.disabled) {
      return res.status(403).json({ error: '账号已被禁用' });
    }

    const user = toPublicUser(record);
    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    res.json({ token, user });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '登录失败' });
  }
});

router.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

export default router;
