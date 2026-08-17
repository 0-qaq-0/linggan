import type { AuthUser } from '../types';
import { authFetch } from './authFetch';

interface AuthResponse {
  token: string;
  user: AuthUser;
}

export async function register(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '注册失败' }));
    throw new Error(err.error || '注册失败');
  }
  return res.json();
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '登录失败' }));
    throw new Error(err.error || '登录失败');
  }
  return res.json();
}

export async function fetchMe(): Promise<AuthUser> {
  const res = await authFetch('/api/auth/me');
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '验证失败' }));
    throw new Error(err.error || '验证失败');
  }
  const data = await res.json();
  return data.user;
}

export interface AdminUser extends AuthUser {}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const res = await authFetch('/api/admin/users');
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '获取用户列表失败' }));
    throw new Error(err.error || '获取用户列表失败');
  }
  const data = await res.json();
  return data.users;
}

export async function updateAdminUser(
  id: string,
  updates: { role?: 'user' | 'admin'; disabled?: boolean },
): Promise<AdminUser> {
  const res = await authFetch(`/api/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '更新失败' }));
    throw new Error(err.error || '更新失败');
  }
  const data = await res.json();
  return data.user;
}
