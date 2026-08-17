import { Router, type Request, type Response } from 'express';
import { listUsers, updateUser } from '../services/userStore.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import type { UserRole } from '../types/auth.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/users', (_req: Request, res: Response) => {
  res.json({ users: listUsers() });
});

router.patch('/users/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { role, disabled } = req.body as { role?: UserRole; disabled?: boolean };

  if (id === req.user!.id) {
    if (role && role !== 'admin') {
      return res.status(400).json({ error: '不能取消自己的管理员权限' });
    }
    if (disabled === true) {
      return res.status(400).json({ error: '不能禁用自己的账号' });
    }
  }

  if (role !== undefined && role !== 'user' && role !== 'admin') {
    return res.status(400).json({ error: '无效的角色' });
  }

  const updated = updateUser(id, {
    ...(role !== undefined ? { role } : {}),
    ...(disabled !== undefined ? { disabled } : {}),
  });

  if (!updated) {
    return res.status(404).json({ error: '用户不存在' });
  }

  res.json({ user: updated });
});

export default router;
