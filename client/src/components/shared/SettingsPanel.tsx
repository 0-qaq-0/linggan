import { useState, useEffect } from 'react';
import Modal from './Modal';
import { getDb } from '../../db/dexie';
import { testConnection } from '../../services/aiService';
import { useSyncStore } from '../../store/useSyncStore';
import { useSessionStore } from '../../store/useSessionStore';
import { CARD_COLORS } from '../../types';
import type { AIProvider } from '../../types';

interface Props {
  onClose: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

const STORED_PROVIDERS: { key: AIProvider; label: string; sub: string; defaultBaseURL: string }[] = [
  { key: 'openai', label: 'OpenAI', sub: 'GPT-4o / o3 / o1', defaultBaseURL: '' },
  { key: 'anthropic', label: 'Claude', sub: 'Anthropic', defaultBaseURL: '' },
];

export default function SettingsPanel({ onClose, onShowToast }: Props) {
  const [provider, setProvider] = useState<AIProvider>('anthropic');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [accentColor, setAccentColor] = useState('#00d4ff');
  const [models, setModels] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);

  useEffect(() => {
    (async () => {
      const p = await getDb().settings.get('provider');
      const m = await getDb().settings.get('model');
      const k = await getDb().settings.get('apiKey');
      const u = await getDb().settings.get('baseURL');
      const savedModels = await getDb().settings.get('availableModels');
      const accent = await getDb().settings.get('accentColor');
      if (p) setProvider(p.value);
      if (m) setModel(m.value);
      if (k) setApiKey(k.value);
      if (u) setBaseURL(u.value);
      if (savedModels?.value) setModels(savedModels.value);
      if (accent?.value) setAccentColor(accent.value);
    })();
  }, []);

  const handleTest = async () => {
    if (!apiKey.trim()) {
      onShowToast('请先输入 API 密钥', 'error');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testConnection(
        provider,
        apiKey.trim(),
        baseURL.trim() || undefined,
      );
      setTestResult({ success: result.success, error: result.error });
      if (result.success) {
        setModels(result.models);
        if (!model || !result.models.includes(model)) {
          const defaultModel =
            provider === 'anthropic'
              ? result.models.find((m) => m.includes('sonnet')) || result.models[0]
              : result.models.find((m) => m.includes('gpt-4o')) || result.models[0];
          if (defaultModel) setModel(defaultModel);
        }
        onShowToast('连接成功！');
      } else {
        onShowToast('连接失败: ' + (result.error || '未知错误'), 'error');
      }
    } catch (e: any) {
      setTestResult({ success: false, error: e.message });
      onShowToast('测试失败: ' + e.message, 'error');
    }
    setTesting(false);
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      onShowToast('请输入 API 密钥', 'error');
      return;
    }
    if (!model) {
      onShowToast('请选择模型（先测试连接获取可用模型列表）', 'error');
      return;
    }

    await getDb().settings.put({ key: 'provider', value: provider });
    await getDb().settings.put({ key: 'model', value: model });
    await getDb().settings.put({ key: 'apiKey', value: apiKey.trim() });
    await getDb().settings.put({ key: 'baseURL', value: baseURL.trim() });
    await getDb().settings.put({ key: 'availableModels', value: models });
    await getDb().settings.put({ key: 'accentColor', value: accentColor });
    document.documentElement.style.setProperty('--primary', accentColor);

    useSessionStore.getState().setSettings(provider, model, apiKey.trim(), baseURL.trim());
    await useSyncStore.getState().syncNow({ force: true });

    onShowToast('设置已保存');
    onClose();
  };

  const handleProviderChange = (newProvider: AIProvider) => {
    setProvider(newProvider);
    setTestResult(null);
    setModel('');
    setModels([]);
  };

  return (
    <Modal open onClose={onClose} title="设置" wide>
      <div className="space-y-4">
        {/* Provider selector */}
        <div>
          <label className="block text-sm text-gray-300 mb-1.5">AI 提供商</label>
          <div className="flex gap-2">
            {STORED_PROVIDERS.map((p) => (
              <button
                key={p.key}
                className={`flex-1 py-2.5 px-3 rounded-lg text-sm transition-all ${
                  provider === p.key
                    ? 'bg-[#00d4ff]/15 border border-[#00d4ff]/40 text-[#00d4ff]'
                    : 'bg-white/5 border border-white/10 text-gray-400 hover:border-white/20'
                }`}
                onClick={() => handleProviderChange(p.key)}
              >
                <div className="font-medium">{p.label}</div>
                <div className="text-[10px] opacity-60">{p.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* API Key */}
        <div>
          <label className="block text-sm text-gray-300 mb-1.5">API 密钥</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setTestResult(null);
            }}
            placeholder="sk-..."
            className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00d4ff] transition-colors font-mono"
          />
        </div>

        {/* Base URL */}
        <div>
          <label className="block text-sm text-gray-300 mb-1.5">
            API 地址
            <span className="text-gray-500 ml-1 text-[10px]">（兼容 OpenAI 协议的第三方 API 在此填写）</span>
          </label>
          <input
            type="text"
            value={baseURL}
            onChange={(e) => {
              setBaseURL(e.target.value);
              setTestResult(null);
            }}
            placeholder={
              provider === 'anthropic'
                ? '默认: https://api.anthropic.com'
                : '默认: https://api.openai.com/v1'
            }
            className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00d4ff] transition-colors font-mono"
          />
          <div className="mt-1.5 flex flex-wrap gap-1">
            {[
              { label: 'DeepSeek', url: 'https://api.deepseek.com/v1' },
              { label: 'Ollama', url: 'http://localhost:11434/v1' },
              { label: 'Groq', url: 'https://api.groq.com/openai/v1' },
              { label: '智谱', url: 'https://open.bigmodel.cn/api/paas/v4' },
              { label: '通义千问', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
              { label: '硅基流动', url: 'https://api.siliconflow.cn/v1' },
            ].map((preset) => (
              <button
                key={preset.label}
                onClick={() => setBaseURL(preset.url)}
                className={`px-2 py-0.5 rounded text-[10px] transition-all ${
                  baseURL === preset.url
                    ? 'bg-[#a78bfa]/20 border border-[#a78bfa]/40 text-[#a78bfa]'
                    : 'bg-white/5 border border-white/5 text-gray-400 hover:border-white/15'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Test + Model */}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-sm text-gray-300 mb-1.5">
              模型
              {models.length > 0 && (
                <span className="text-gray-500 ml-1">({models.length} 个可用)</span>
              )}
            </label>
            {models.length > 0 ? (
              <div className="max-h-[180px] overflow-y-auto scrollbar-thin space-y-1 pr-1">
                {models.map((m) => (
                  <button
                    key={m}
                    onClick={() => setModel(m)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                      model === m
                        ? 'bg-[#a78bfa]/15 border border-[#a78bfa]/40 text-[#a78bfa]'
                        : 'bg-white/5 border border-white/5 text-gray-300 hover:border-white/15'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-3 py-4 rounded-lg bg-white/5 border border-white/5 text-center">
                <p className="text-xs text-gray-500">
                  {apiKey.trim()
                    ? '点击右侧"测试连接"获取可用模型列表'
                    : '请先输入 API 密钥再测试连接'}
                </p>
              </div>
            )}
          </div>
          <button
            onClick={handleTest}
            disabled={testing || !apiKey.trim()}
            className={`shrink-0 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              testResult?.success
                ? 'bg-green-500/20 border border-green-500/40 text-green-400'
                : testResult && !testResult.success
                  ? 'bg-red-500/20 border border-red-500/40 text-red-400'
                  : 'bg-white/5 border border-white/10 text-gray-300 hover:border-[#00d4ff]/30 hover:text-[#00d4ff]'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {testing ? (
              <span className="flex items-center gap-1">
                <span className="typing-dot w-1.5 h-1.5 rounded-full bg-current inline-block" />
                测试中
              </span>
            ) : testResult?.success ? (
              '✓ 已连接'
            ) : (
              '测试连接'
            )}
          </button>
        </div>
        {testResult && !testResult.success && (
          <p className="text-xs text-red-400 -mt-2">{testResult.error}</p>
        )}
        {model && (
          <p className="text-[10px] text-gray-500 -mt-2">
            当前选择: <span className="text-[#a78bfa]">{model}</span>
          </p>
        )}

        {/* Global accent theme */}
        <div>
          <label className="block text-sm text-gray-300 mb-1.5">
            主题强调色
            <span className="text-gray-500 ml-1 text-[10px]">（用于全局高亮、选中、滚动条等）</span>
          </label>
          <div className="flex gap-2 flex-wrap">
            {CARD_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => {
                  setAccentColor(c.value);
                  document.documentElement.style.setProperty('--primary', c.value);
                }}
                className="w-8 h-8 rounded-full border-2 transition-all hover:scale-110"
                style={{
                  backgroundColor: c.value,
                  borderColor: accentColor === c.value ? '#fff' : 'transparent',
                  boxShadow: accentColor === c.value ? `0 0 10px ${c.value}80` : 'none',
                }}
                title={c.label}
              />
            ))}
          </div>
        </div>

        <button
          onClick={handleSave}
          className="w-full py-2.5 rounded-lg bg-gradient-to-r from-[#00d4ff] to-[#a78bfa] text-white font-medium hover:opacity-90 transition-opacity"
        >
          保存设置
        </button>
      </div>
    </Modal>
  );
}
