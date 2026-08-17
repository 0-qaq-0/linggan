import { create } from 'zustand';
import {
  exportLocalWorkspace,
  fetchRemoteWorkspace,
  importLocalWorkspace,
  localHasWorkspaceData,
  pushRemoteWorkspace,
  setLocalSyncMeta,
  touchLocalUpdatedAt,
  getLocalSyncMeta,
} from '../services/workspaceSyncService';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

const DEBOUNCE_MS = 3000;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let syncInFlight = false;

interface SyncState {
  status: SyncStatus;
  lastSyncedAt: number | null;
  pendingDirty: boolean;
  errorMessage: string | null;
  conflictNotice: string | null;

  markDirty: () => void;
  syncNow: (opts?: { force?: boolean }) => Promise<void>;
  bootstrapSync: () => Promise<void>;
  clearConflictNotice: () => void;
  reset: () => void;
}

async function pushLocal(baseRevision: number) {
  const local = await exportLocalWorkspace();
  const result = await pushRemoteWorkspace(local, baseRevision);

  if (result.ok) {
    await setLocalSyncMeta(result.workspace.revision, result.workspace.updatedAt);
    return { applied: 'pushed' as const, remote: result.workspace };
  }

  const remote = result.workspace;
  const localMeta = await getLocalSyncMeta();

  if (remote.updatedAt > localMeta.updatedAt) {
    await importLocalWorkspace(remote);
    return { applied: 'pulled_conflict' as const, remote };
  }

  const retry = await pushRemoteWorkspace(
    { ...local, updatedAt: Math.max(local.updatedAt, remote.updatedAt + 1) },
    remote.revision,
  );
  if (retry.ok) {
    await setLocalSyncMeta(retry.workspace.revision, retry.workspace.updatedAt);
    return { applied: 'pushed_retry' as const, remote: retry.workspace };
  }

  await importLocalWorkspace(retry.workspace);
  return { applied: 'pulled_retry' as const, remote: retry.workspace };
}

export const useSyncStore = create<SyncState>((set, get) => ({
  status: 'idle',
  lastSyncedAt: null,
  pendingDirty: false,
  errorMessage: null,
  conflictNotice: null,

  markDirty: () => {
    if (!navigator.onLine) {
      set({ pendingDirty: true, status: 'offline' });
      return;
    }

    touchLocalUpdatedAt().catch(() => {});
    set({ pendingDirty: true, status: 'idle' });

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      get().syncNow().catch(() => {});
    }, DEBOUNCE_MS);
  },

  syncNow: async (opts) => {
    if (syncInFlight && !opts?.force) return;
    if (!navigator.onLine) {
      set({ status: 'offline', pendingDirty: true });
      return;
    }

    syncInFlight = true;
    set({ status: 'syncing', errorMessage: null });

    try {
      const meta = await getLocalSyncMeta();
      const result = await pushLocal(meta.revision);

      if (result.applied === 'pulled_conflict' || result.applied === 'pulled_retry') {
        set({
          conflictNotice: '工作区已在其他设备更新，已同步云端版本',
        });
      }

      set({
        status: 'idle',
        pendingDirty: false,
        lastSyncedAt: Date.now(),
        errorMessage: null,
      });
    } catch (err: any) {
      set({
        status: navigator.onLine ? 'error' : 'offline',
        errorMessage: err.message || '同步失败',
        pendingDirty: true,
      });
    } finally {
      syncInFlight = false;
    }
  },

  bootstrapSync: async () => {
    if (!navigator.onLine) {
      set({ status: 'offline' });
      return;
    }

    set({ status: 'syncing', errorMessage: null });

    try {
      const remote = await fetchRemoteWorkspace();
      const local = await exportLocalWorkspace();
      const localMeta = await getLocalSyncMeta();

      if (remote.revision === 0 && localHasWorkspaceData(local)) {
        await pushLocal(0);
      } else if (remote.updatedAt > localMeta.updatedAt) {
        await importLocalWorkspace(remote);
      } else if (localMeta.updatedAt > remote.updatedAt) {
        await pushLocal(remote.revision);
      } else if (localMeta.updatedAt === remote.updatedAt && localMeta.revision !== remote.revision) {
        await setLocalSyncMeta(remote.revision, remote.updatedAt);
      }

      set({
        status: 'idle',
        pendingDirty: false,
        lastSyncedAt: Date.now(),
        errorMessage: null,
      });
    } catch (err: any) {
      set({
        status: 'error',
        errorMessage: err.message || '同步失败',
      });
    }
  },

  clearConflictNotice: () => set({ conflictNotice: null }),

  reset: () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    set({
      status: 'idle',
      lastSyncedAt: null,
      pendingDirty: false,
      errorMessage: null,
      conflictNotice: null,
    });
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    const { pendingDirty, syncNow } = useSyncStore.getState();
    if (pendingDirty) {
      syncNow().catch(() => {});
    } else {
      useSyncStore.setState({ status: 'idle' });
    }
  });

  window.addEventListener('offline', () => {
    useSyncStore.setState({ status: 'offline' });
  });
}
