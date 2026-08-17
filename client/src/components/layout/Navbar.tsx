import { useAuthStore } from '../../store/useAuthStore';
import { useSyncStore } from '../../store/useSyncStore';

interface Props {
  onOpenSettings: () => void;
  onToggleAgent: () => void;
  onOpenAdmin: () => void;
  agentActive?: boolean;
}

function syncLabel(status: string, pendingDirty: boolean): string {
  if (status === 'offline') return pendingDirty ? '离线，待同步' : '离线';
  if (status === 'syncing') return '同步中…';
  if (status === 'error') return '同步失败';
  if (pendingDirty) return '待同步';
  return '已同步';
}

export default function Navbar({ onOpenSettings, onToggleAgent, onOpenAdmin, agentActive }: Props) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const logout = useAuthStore((s) => s.logout);
  const syncStatus = useSyncStore((s) => s.status);
  const pendingDirty = useSyncStore((s) => s.pendingDirty);
  const syncNow = useSyncStore((s) => s.syncNow);

  return (
    <nav className="h-12 flex items-center justify-between px-4 border-b border-white/5 bg-[#0a0a1a]/90 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-xl">💡</span>
        <span className="text-lg font-bold bg-gradient-to-r from-[#00d4ff] to-[#a78bfa] bg-clip-text text-transparent">
          LINGGAN
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => syncNow({ force: true })}
          className={`px-2 py-1 rounded-lg text-[10px] transition-colors border ${
            syncStatus === 'error'
              ? 'text-red-400 border-red-500/30 hover:bg-red-500/10'
              : syncStatus === 'offline'
                ? 'text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/10'
                : syncStatus === 'syncing'
                  ? 'text-[#00d4ff] border-[#00d4ff]/30 animate-pulse'
                  : pendingDirty
                    ? 'text-gray-400 border-white/10 hover:bg-white/5'
                    : 'text-green-400/80 border-green-500/20 hover:bg-white/5'
          }`}
          title="点击手动同步工作区"
        >
          {syncLabel(syncStatus, pendingDirty)}
        </button>

        {user && (
          <span className="hidden sm:inline text-xs text-gray-500 mr-1 max-w-[160px] truncate" title={user.email}>
            {user.email}
          </span>
        )}

        {isAdmin && (
          <button
            onClick={onOpenAdmin}
            className="px-2.5 py-1.5 rounded-lg text-xs hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
            title="用户管理"
          >
            👤 管理
          </button>
        )}

        <button
          onClick={onToggleAgent}
          className={`px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1 ${
            agentActive
              ? 'bg-[#a78bfa]/20 text-[#a78bfa] border border-[#a78bfa]/30'
              : 'hover:bg-white/5 text-gray-400 hover:text-white'
          }`}
          title="AI 助手（代你操作画布）"
        >
          🤖 助手
        </button>

        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
          title="设置"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        <button
          onClick={() => logout()}
          className="px-2.5 py-1.5 rounded-lg text-xs hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
          title="退出登录"
        >
          退出
        </button>
      </div>
    </nav>
  );
}
