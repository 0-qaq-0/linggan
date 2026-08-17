import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { findUserById, toPublicUser } from '../services/userStore.js';
import type { AuthTokenPayload } from '../types/auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'linggan-dev-secret-change-me';

export function signToken(payload: AuthTokenPayload): string {
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: '请先登录' });
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
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
