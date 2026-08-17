import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EMPTY_WORKSPACE, type UserWorkspace, type WorkspaceMeta } from '../types/workspace.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACES_DIR = path.join(__dirname, '../../data/workspaces');

function workspacePath(userId: string): string {
  return path.join(WORKSPACES_DIR, `${userId}.json`);
}

function ensureDir() {
  if (!fs.existsSync(WORKSPACES_DIR)) {
    fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
  }
}

function readWorkspace(userId: string): UserWorkspace | null {
  ensureDir();
  const filePath = workspacePath(userId);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as UserWorkspace;
}

export function getWorkspace(userId: string): UserWorkspace {
  return readWorkspace(userId) ?? { ...EMPTY_WORKSPACE };
}

export function getWorkspaceMeta(userId: string): WorkspaceMeta {
  const ws = getWorkspace(userId);
  return { revision: ws.revision, updatedAt: ws.updatedAt };
}

export function saveWorkspace(
  userId: string,
  payload: Omit<UserWorkspace, 'revision' | 'updatedAt'> & {
    updatedAt: number;
  },
  baseRevision: number,
): { workspace: UserWorkspace } | { conflict: true; workspace: UserWorkspace } {
  ensureDir();
  const current = getWorkspace(userId);

  if (current.revision !== baseRevision) {
    return { conflict: true, workspace: current };
  }

  const workspace: UserWorkspace = {
    revision: current.revision + 1,
    updatedAt: payload.updatedAt,
    cards: payload.cards,
    versions: payload.versions,
    settings: payload.settings,
  };

  fs.writeFileSync(workspacePath(userId), JSON.stringify(workspace, null, 2), 'utf-8');
  return { workspace };
}
