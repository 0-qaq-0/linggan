import { useState, useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import AppShell from './components/layout/AppShell';
import Navbar from './components/layout/Navbar';
import ChatPanel from './components/chat/ChatPanel';
import InfiniteCanvas from './components/canvas/InfiniteCanvas';
import CardDetail from './components/card/CardDetail';
import VersionPanel from './components/card/VersionPanel';
import RecommendPanel from './components/card/RecommendPanel';
import SettingsPanel from './components/shared/SettingsPanel';
import AgentPanel from './components/agent/AgentPanel';
import AdminPanel from './components/admin/AdminPanel';
import AuthScreen from './components/auth/AuthScreen';
import Toast from './components/shared/Toast';
import { useCanvasStore } from './store/useCanvasStore';
import { useAuthStore } from './store/useAuthStore';
import { useSyncStore } from './store/useSyncStore';

const TOAST_TIMEOUT = 3000;

export default function App() {
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const [versionCardId, setVersionCardId] = useState<string | null>(null);
  const [recommendCardId, setRecommendCardId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAgent, setShowAgent] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const removeCard = useCanvasStore((s) => s.removeCard);
  const isReady = useAuthStore((s) => s.isReady);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hydrate = useAuthStore((s) => s.hydrate);

  const logout = useAuthStore((s) => s.logout);
  const conflictNotice = useSyncStore((s) => s.conflictNotice);
  const clearConflictNotice = useSyncStore((s) => s.clearConflictNotice);
  const pendingDirty = useSyncStore((s) => s.pendingDirty);
  const syncNow = useSyncStore((s) => s.syncNow);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), TOAST_TIMEOUT);
  };

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const onExpired = () => logout();
    window.addEventListener('linggan:auth-expired', onExpired);
    return () => window.removeEventListener('linggan:auth-expired', onExpired);
  }, [logout]);

  useEffect(() => {
    if (conflictNotice) {
      showToast(conflictNotice, 'error');
      clearConflictNotice();
    }
  }, [conflictNotice, clearConflictNotice]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => {
      if (pendingDirty && navigator.onLine) {
        syncNow().catch(() => {});
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [isAuthenticated, pendingDirty, syncNow]);

  const handleDeleteCard = async (cardId: string) => {
    await removeCard(cardId);
    if (detailCardId === cardId) setDetailCardId(null);
    if (versionCardId === cardId) setVersionCardId(null);
    if (recommendCardId === cardId) setRecommendCardId(null);
    showToast('卡片已删除');
  };

  if (!isReady) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#0a0a1a]">
        <p className="text-sm text-gray-500">加载中…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  return (
    <ReactFlowProvider>
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#0a0a1a]">
        <Navbar
          onOpenSettings={() => setShowSettings(true)}
          onToggleAgent={() => setShowAgent((v) => !v)}
          onOpenAdmin={() => setShowAdmin(true)}
          agentActive={showAgent}
        />

        <AppShell
          chatPanel={
            <ChatPanel
              onOpenCardDetail={setDetailCardId}
              onShowToast={showToast}
            />
          }
          canvas={
            <InfiniteCanvas
              onCardClick={(cardId) => setDetailCardId(cardId)}
              onVersionClick={(cardId) => setVersionCardId(cardId)}
              onRecommendClick={(cardId) => setRecommendCardId(cardId)}
              onDeleteCard={handleDeleteCard}
              onShowToast={showToast}
            />
          }
        />

        {detailCardId && (
          <CardDetail
            cardId={detailCardId}
            onClose={() => setDetailCardId(null)}
            onVersionClick={(id) => {
              setVersionCardId(id);
            }}
            onRecommendClick={(id) => {
              setRecommendCardId(id);
            }}
            onShowToast={showToast}
          />
        )}

        {versionCardId && (
          <VersionPanel
            cardId={versionCardId}
            onClose={() => setVersionCardId(null)}
            onShowToast={showToast}
          />
        )}

        {recommendCardId && (
          <RecommendPanel
            cardId={recommendCardId}
            onClose={() => setRecommendCardId(null)}
            onShowToast={showToast}
          />
        )}

        {showSettings && (
          <SettingsPanel
            onClose={() => setShowSettings(false)}
            onShowToast={showToast}
          />
        )}

        {showAgent && (
          <AgentPanel
            onClose={() => setShowAgent(false)}
            onShowToast={showToast}
          />
        )}

        {showAdmin && (
          <AdminPanel
            onClose={() => setShowAdmin(false)}
            onShowToast={showToast}
          />
        )}

        {toast && <Toast message={toast.message} type={toast.type} />}
      </div>
    </ReactFlowProvider>
  );
}
