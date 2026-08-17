import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import type { PublicUser, UserRecord, UserRole } from '../types/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

interface UsersFile {
  users: UserRecord[];
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readUsersFile(): UsersFile {
  ensureDataDir();
  if (!fs.existsSync(USERS_FILE)) {
    return { users: [] };
  }
  const raw = fs.readFileSync(USERS_FILE, 'utf-8');
  return JSON.parse(raw) as UsersFile;
}

function writeUsersFile(data: UsersFile) {
  ensureDataDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    disabled: user.disabled,
    createdAt: user.createdAt,
  };
}

export function findUserByEmail(email: string): UserRecord | undefined {
  const { users } = readUsersFile();
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export function findUserById(id: string): UserRecord | undefined {
  const { users } = readUsersFile();
  return users.find((u) => u.id === id);
}

export function listUsers(): PublicUser[] {
  const { users } = readUsersFile();
  return users.map(toPublicUser).sort((a, b) => a.createdAt - b.createdAt);
}

export async function createUser(
  email: string,
  password: string,
  role: UserRole = 'user',
): Promise<PublicUser> {
  const normalizedEmail = email.trim().toLowerCase();
  if (findUserByEmail(normalizedEmail)) {
    throw new Error('该邮箱已注册');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user: UserRecord = {
    id: crypto.randomUUID(),
    email: normalizedEmail,
    passwordHash,
    role,
    disabled: false,
    createdAt: Date.now(),
  };

  const data = readUsersFile();
  data.users.push(user);
  writeUsersFile(data);
  return toPublicUser(user);
}

export async function verifyPassword(user: UserRecord, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.passwordHash);
}

export function updateUser(
  id: string,
  updates: Partial<Pick<UserRecord, 'role' | 'disabled'>>,
): PublicUser | null {
  const data = readUsersFile();
  const index = data.users.findIndex((u) => u.id === id);
  if (index === -1) return null;

  if (updates.role !== undefined) data.users[index].role = updates.role;
  if (updates.disabled !== undefined) data.users[index].disabled = updates.disabled;
  writeUsersFile(data);
  return toPublicUser(data.users[index]);
}

export async function ensureBootstrapAdmin(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (findUserByEmail(normalizedEmail)) return;
  await createUser(normalizedEmail, password, 'admin');
  console.log(`[auth] 已创建管理员账号: ${normalizedEmail}`);
}
