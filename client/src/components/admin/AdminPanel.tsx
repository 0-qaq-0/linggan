import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { AuthUser } from '../../types';
import { fetchAdminUsers, updateAdminUser } from '../../services/authService';
import { useAuthStore } from '../../store/useAuthStore';

interface Props {
  onClose: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function AdminPanel({ onClose, onShowToast }: Props) {
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUsers = async () => {
    setLoading(true);
    try {
      setUsers(await fetchAdminUsers());
    } catch (err: any) {
      onShowToast(err.message || '加载失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleToggleDisabled = async (user: AuthUser) => {
    try {
      const updated = await updateAdminUser(user.id, { disabled: !user.disabled });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      onShowToast(updated.disabled ? '已禁用用户' : '已启用用户');
    } catch (err: any) {
      onShowToast(err.message || '操作失败', 'error');
    }
  };

  const handleToggleRole = async (user: AuthUser) => {
    const nextRole = user.role === 'admin' ? 'user' : 'admin';
    try {
      const updated = await updateAdminUser(user.id, { role: nextRole });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      onShowToast(nextRole === 'admin' ? '已设为管理员' : '已降为普通用户');
    } catch (err: any) {
      onShowToast(err.message || '操作失败', 'error');
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="glass w-full max-w-2xl max-h-[80vh] flex flex-col"
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">用户管理</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
          {loading ? (
            <p className="text-sm text-gray-500 text-center py-8">加载中…</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">暂无用户</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 text-xs uppercase tracking-wider">
                  <th className="pb-3">邮箱</th>
                  <th className="pb-3">角色</th>
                  <th className="pb-3">状态</th>
                  <th className="pb-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map((user) => {
                  const isSelf = user.id === currentUser?.id;
                  return (
                    <tr key={user.id} className="text-gray-300">
                      <td className="py-3 pr-2">
                        <div className="text-white">{user.email}</div>
                        <div className="text-[10px] text-gray-600 font-mono">{user.id.slice(0, 8)}…</div>
                      </td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          user.role === 'admin'
                            ? 'bg-[#a78bfa]/20 text-[#a78bfa] border border-[#a78bfa]/30'
                            : 'bg-white/5 text-gray-400'
                        }`}>
                          {user.role === 'admin' ? '管理员' : '用户'}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className={`text-xs ${user.disabled ? 'text-red-400' : 'text-green-400'}`}>
                          {user.disabled ? '已禁用' : '正常'}
                        </span>
                      </td>
                      <td className="py-3 text-right space-x-2">
                        <button
                          onClick={() => handleToggleRole(user)}
                          disabled={isSelf}
                          className="px-2 py-1 rounded text-xs border border-white/10 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {user.role === 'admin' ? '降为用户' : '设为管理'}
                        </button>
                        <button
                          onClick={() => handleToggleDisabled(user)}
                          disabled={isSelf}
                          className="px-2 py-1 rounded text-xs border border-white/10 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {user.disabled ? '启用' : '禁用'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
