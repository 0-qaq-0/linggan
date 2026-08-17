import { useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore';

type Mode = 'login' | 'register';

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('请填写邮箱和密码');
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      setError('两次密码不一致');
      return;
    }
    if (mode === 'register' && password.length < 6) {
      setError('密码至少 6 位');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password);
      }
    } catch (err: any) {
      setError(err.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-[#0a0a1a] p-4">
      <div className="glass w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-2">
          <span className="text-4xl">💡</span>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-[#00d4ff] to-[#a78bfa] bg-clip-text text-transparent">
            LINGGAN
          </h1>
          <p className="text-sm text-gray-500">
            {mode === 'login' ? '登录以使用创意画布' : '注册新账号'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="mt-1 w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00d4ff] transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="mt-1 w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00d4ff] transition-colors"
            />
          </div>

          {mode === 'register' && (
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider">确认密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入密码"
                autoComplete="new-password"
                className="mt-1 w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00d4ff] transition-colors"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-gradient-to-r from-[#00d4ff] to-[#a78bfa] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? '请稍候…' : mode === 'login' ? '登录' : '注册'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500">
          {mode === 'login' ? (
            <>
              还没有账号？{' '}
              <button
                type="button"
                onClick={() => { setMode('register'); setError(''); }}
                className="text-[#00d4ff] hover:underline"
              >
                立即注册
              </button>
            </>
          ) : (
            <>
              已有账号？{' '}
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); }}
                className="text-[#00d4ff] hover:underline"
              >
                去登录
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
