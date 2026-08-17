// ── AI Provider ──
export type AIProvider = 'anthropic' | 'openai';

// ── Chat Phases ──
export type ChatPhase = 'idle' | 'analyze' | 'questions' | 'final';

// ── Chat Message ──
export interface AIQuestion {
  id: string;
  question: string;
  options: string[];
  stepLabel?: string; // 简短标签（2-4字），用于步骤时间线展示
}

// ── Ideation Step (traceable Q&A round) ──
export interface IdeationStep {
  id: string;
  stepNumber: number;
  question: string;
  options: string[];
  userAnswer: string;
  analysis?: string;
  phase: ChatPhase;
  messageCount: number; // chatHistory.length at the moment this step completed
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  type: 'text' | 'question' | 'refinement' | 'error';
  timestamp: number;
  metadata?: {
    phase?: ChatPhase;
    analysis?: string;
    questions?: AIQuestion[];
    refinedContent?: string;
    refinementNote?: string;
    suggestedTags?: string[];
    suggestElement?: SuggestElement;
  };
}

// ── AI-suggested element crystallization ──
export interface SuggestElement {
  title: string;
  summary: string;
  reason?: string;
}

// ── Card accent color presets ──
export const CARD_COLORS = [
  { label: '默认', value: '#00d4ff' },
  { label: '紫', value: '#a78bfa' },
  { label: '绿', value: '#34d399' },
  { label: '橙', value: '#fb923c' },
  { label: '粉', value: '#f472b6' },
  { label: '黄', value: '#facc15' },
] as const;

// ── Idea Card (canvas element) ──
export type CardKind = 'theme' | 'element';

export interface IdeaCard {
  id: string;
  createdAt: number;
  updatedAt: number;
  position: { x: number; y: number };
  parentId: string | null;
  connections: string[];
  tags: string[];
  currentVersionId: string;
  color: string;
  kind?: CardKind; // 'theme' = 根主题元素, 'element' = 小结元素（默认）
}

// ── Step ↔ crystallized element mapping (for rollback graph) ──
export interface StepElement {
  stepId: string;
  cardId: string;
}

// ── Card Version (git-like branch tree) ──
export interface CardVersion {
  id: string;
  cardId: string;
  parentVersionId: string | null;
  title: string;
  content: string;
  summary: string;
  chatHistory: ChatMessage[];
  createdAt: number;
}

// ── Canvas Node Data (React Flow) ──
export interface CardNodeData {
  [key: string]: unknown;
  cardId: string;
  title: string;
  summary: string;
  versionCount: number;
  tags: string[];
  parentId: string | null;
  color: string;
  kind?: CardKind;

  onVersionClick?: (cardId: string) => void;
  onRecommendClick?: (cardId: string) => void;
  onEnterSubCanvas?: (cardId: string) => void;
  onDeleteClick?: (cardId: string) => void;
  onConnectClick?: (cardId: string) => void;
  onBranchClick?: (cardId: string) => void;
}

// ── AI Recommendation ──
export interface AIRecommendation {
  type: 'question';
  title: string;
  question: string;
  tags: string[];
}

// ── Settings ──
export interface AppSettings {
  key: string;
  value: any;
}

// ── AI Agent actions (structured action protocol) ──
export type AgentAction =
  | { type: 'createElement'; title: string; content?: string; summary?: string; tags?: string[]; color?: string; parentTitle?: string }
  | { type: 'connect'; sourceTitle: string; targetTitle: string }
  | { type: 'recolor'; cardTitle: string; color: string }
  | { type: 'rename'; cardTitle: string; title: string }
  | { type: 'delete'; cardTitle: string }
  | { type: 'summarize'; focus?: string; parentTitle?: string }
  | { type: 'startQuestioning'; idea?: string; fromTitle?: string }
  | { type: 'setAnchor'; cardTitle: string };

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: AgentAction[];
  status?: 'pending' | 'executed' | 'rejected';
  timestamp: number;
}

// ── Auth ──
export type UserRole = 'user' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  disabled: boolean;
  createdAt: number;
}

// ── Cloud workspace sync ──
export interface UserWorkspace {
  revision: number;
  updatedAt: number;
  cards: IdeaCard[];
  versions: CardVersion[];
  settings: Record<string, unknown>;
}

export const SYNC_META_KEYS = ['syncRevision', 'syncUpdatedAt'] as const;

export const WORKSPACE_SETTING_KEYS = [
  'provider',
  'model',
  'apiKey',
  'baseURL',
  'availableModels',
  'accentColor',
] as const;
