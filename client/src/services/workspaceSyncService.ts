import { getDb } from '../db/dexie';
import { authFetch } from './authFetch';
import type { UserWorkspace } from '../types';
import { WORKSPACE_SETTING_KEYS } from '../types';

export async function getLocalSyncMeta(): Promise<{ revision: number; updatedAt: number }> {
  const database = getDb();
  const revisionEntry = await database.settings.get('syncRevision');
  const updatedEntry = await database.settings.get('syncUpdatedAt');
  return {
    revision: typeof revisionEntry?.value === 'number' ? revisionEntry.value : 0,
    updatedAt: typeof updatedEntry?.value === 'number' ? updatedEntry.value : 0,
  };
}

export async function setLocalSyncMeta(revision: number, updatedAt: number): Promise<void> {
  const database = getDb();
  await database.settings.put({ key: 'syncRevision', value: revision });
  await database.settings.put({ key: 'syncUpdatedAt', value: updatedAt });
}

export async function touchLocalUpdatedAt(): Promise<number> {
  const updatedAt = Date.now();
  await getDb().settings.put({ key: 'syncUpdatedAt', value: updatedAt });
  return updatedAt;
}

async function readWorkspaceSettings(): Promise<Record<string, unknown>> {
  const database = getDb();
  const settings: Record<string, unknown> = {};
  for (const key of WORKSPACE_SETTING_KEYS) {
    const entry = await database.settings.get(key);
    if (entry !== undefined) {
      settings[key] = entry.value;
    }
  }
  return settings;
}

export async function exportLocalWorkspace(): Promise<UserWorkspace> {
  const database = getDb();
  const meta = await getLocalSyncMeta();
  const cards = await database.cards.toArray();
  const versions = await database.versions.toArray();
  const settings = await readWorkspaceSettings();

  return {
    revision: meta.revision,
    updatedAt: meta.updatedAt || Date.now(),
    cards,
    versions,
    settings,
  };
}

export async function importLocalWorkspace(workspace: UserWorkspace): Promise<void> {
  const database = getDb();
  await database.cards.clear();
  await database.versions.clear();

  if (workspace.cards.length > 0) {
    await database.cards.bulkPut(workspace.cards);
  }
  if (workspace.versions.length > 0) {
    await database.versions.bulkPut(workspace.versions);
  }

  for (const key of WORKSPACE_SETTING_KEYS) {
    if (key in workspace.settings) {
      await database.settings.put({ key, value: workspace.settings[key] });
    }
  }

  await setLocalSyncMeta(workspace.revision, workspace.updatedAt);

  const { useCanvasStore } = await import('../store/useCanvasStore');
  await useCanvasStore.getState().loadFromDB();

  const { useSessionStore } = await import('../store/useSessionStore');
  const provider = workspace.settings.provider as string | undefined;
  const model = workspace.settings.model as string | undefined;
  const apiKey = workspace.settings.apiKey as string | undefined;
  const baseURL = workspace.settings.baseURL as string | undefined;
  if (provider && apiKey) {
    useSessionStore.getState().setSettings(
      provider as 'anthropic' | 'openai',
      model || '',
      apiKey,
      baseURL || '',
    );
  }
  const accent = workspace.settings.accentColor as string | undefined;
  if (accent) {
    document.documentElement.style.setProperty('--primary', accent);
  }
}

export function localHasWorkspaceData(workspace: UserWorkspace): boolean {
  return workspace.cards.length > 0 || workspace.versions.length > 0
    || Object.keys(workspace.settings).length > 0;
}

export async function fetchRemoteWorkspace(): Promise<UserWorkspace> {
  const res = await authFetch('/api/workspace');
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '拉取工作区失败' }));
    throw new Error(err.error || '拉取工作区失败');
  }
  const data = await res.json();
  return data.workspace as UserWorkspace;
}

export async function pushRemoteWorkspace(
  workspace: UserWorkspace,
  baseRevision: number,
): Promise<{ ok: true; workspace: UserWorkspace } | { ok: false; conflict: true; workspace: UserWorkspace }> {
  const res = await authFetch('/api/workspace', {
    method: 'PUT',
    body: JSON.stringify({
      baseRevision,
      updatedAt: workspace.updatedAt,
      cards: workspace.cards,
      versions: workspace.versions,
      settings: workspace.settings,
    }),
  });

  if (res.status === 409) {
    const data = await res.json();
    return { ok: false, conflict: true, workspace: data.workspace as UserWorkspace };
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '上传工作区失败' }));
    throw new Error(err.error || '上传工作区失败');
  }

  const data = await res.json();
  return { ok: true, workspace: data.workspace as UserWorkspace };
}

export async function applyRemoteWorkspaceMeta(workspace: UserWorkspace): Promise<void> {
  await setLocalSyncMeta(workspace.revision, workspace.updatedAt);
}
