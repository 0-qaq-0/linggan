import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { findUserById, toPublicUser } from '../services/userStore.js';
import type { AuthTokenPayload } from '../types/auth.js';
import { getAuthSecret, getTokenExpiresIn } from '../config/authSecret.js';

export function signToken(payload: AuthTokenPayload): string {
  // 密钥必须在「调用时」读取，不能在模块顶层固化成常量。
  // 模块顶层执行时 dotenv 还没加载（ESM 的 import 会被提升到模块体之前），
  // 那时 process.env.JWT_SECRET 必然是 undefined，配置会被静默忽略。
  return jwt.sign(payload, getAuthSecret(), { expiresIn: getTokenExpiresIn() } as jwt.SignOptions);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: '请先登录' });
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, getAuthSecret()) as AuthTokenPayload;
    const user = findUserById(decoded.sub);
    if (!user) {
      return res.status(401).json({ error: '用户不存在' });
    }
    if (user.disabled) {
      return res.status(403).json({ error: '账号已被禁用' });
    }
    req.user = toPublicUser(user);
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}
