import { memo, useState, type CSSProperties } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

const HANDLE_SIZE = 26;

const handleStyle = (fill: string): CSSProperties => ({
  width: HANDLE_SIZE,
  height: HANDLE_SIZE,
  minWidth: HANDLE_SIZE,
  minHeight: HANDLE_SIZE,
  borderRadius: '50%',
  border: 'none',
  background: `radial-gradient(circle at 40% 36%, ${fill}b3 0%, ${fill}80 50%, ${fill}55 100%)`,
  boxShadow: [
    `0 0 0 3px ${fill}10`,
    `0 0 12px 4px ${fill}22`,
    `0 0 24px 8px ${fill}0a`,
  ].join(', '),
  opacity: 0.72,
});

export default memo(function CardNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  const title = (d.title as string) || '未命名';
  const summary = (d.summary as string) || '';
  const versionCount = (d.versionCount as number) || 1;
  const tags = (d.tags as string[]) || [];
  const cardId = d.cardId as string;
  const color = (d.color as string) || '#00d4ff';
  const kind = (d.kind as string) || 'element';
  const isTheme = kind === 'theme';
  const onVersionClick = d.onVersionClick as ((id: string) => void) | undefined;
  const onRecommendClick = d.onRecommendClick as ((id: string) => void) | undefined;
  const onEnterSubCanvas = d.onEnterSubCanvas as ((id: string) => void) | undefined;
  const onDeleteClick = d.onDeleteClick as ((id: string) => void) | undefined;
  const onConnectClick = d.onConnectClick as ((id: string) => void) | undefined;
  const onBranchClick = d.onBranchClick as ((id: string) => void) | undefined;

  const [hovering, setHovering] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onDoubleClick={(e) => { e.stopPropagation(); onEnterSubCanvas?.(cardId); }}
      style={{
        background: 'rgba(15, 15, 40, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: selected
          ? `2px solid ${color}99`
          : isTheme
            ? `2px solid ${color}66`
            : '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '16px',
        padding: '16px',
        minWidth: '220px',
        maxWidth: '280px',
        color: '#e0e0e0',
        boxShadow: selected
          ? `0 0 24px ${color}40`
          : '0 4px 16px rgba(0, 0, 0, 0.4)',
        fontSize: '13px',
        cursor: 'pointer',
        transition: 'box-shadow 0.2s, border-color 0.2s',
        position: 'relative',
      }}
    >
      {/* Delete button — visible on hover */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDeleteClick?.(cardId);
        }}
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          width: 20,
          height: 20,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.1)',
          background: hovering ? 'rgba(239, 68, 68, 0.3)' : 'transparent',
          color: hovering ? '#fca5a5' : 'transparent',
          fontSize: 11,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s',
          lineHeight: 1,
          padding: 0,
        }}
        title="删除卡片"
      >
        ✕
      </button>

      <Handle
        type="target"
        position={Position.Top}
        className="linggan-handle linggan-handle-target"
        style={handleStyle('#a78bfa')}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="linggan-handle linggan-handle-source"
        style={handleStyle(color)}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, paddingRight: 20 }}>
        {isTheme && (
          <span
            style={{
              fontSize: '9px',
              padding: '1px 6px',
              borderRadius: '99px',
              background: `${color}20`,
              border: `1px solid ${color}40`,
              color,
              whiteSpace: 'nowrap',
            }}
          >
            主题
          </span>
        )}
        <span style={{ fontWeight: 600, color: '#fff' }}>{title}</span>
      </div>

      {summary && (
        <div
          style={{
            fontSize: '12px',
            color: '#999',
            marginBottom: 10,
            lineHeight: 1.5,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {summary}
        </div>
      )}

      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
          {tags.map((tag: string) => (
            <span
              key={tag}
              style={{
                padding: '2px 8px',
                borderRadius: '99px',
                fontSize: '10px',
                background: `${color}15`,
                border: `1px solid ${color}30`,
                color: color,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
        <span style={{ fontSize: '10px', color: '#666' }}>版本</span>
        <span style={{ fontSize: '10px', color, fontFamily: 'monospace' }}>
          v{versionCount}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={(e) => { e.stopPropagation(); onVersionClick?.(cardId); }}
          style={{
            flex: 1,
            padding: '6px 0',
            borderRadius: '8px',
            fontSize: '10px',
            border: `1px solid ${color}30`,
            background: `${color}10`,
            color: '#999',
            cursor: 'pointer',
          }}
        >
          版本
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onBranchClick?.(cardId); }}
          style={{
            flex: 1,
            padding: '6px 0',
            borderRadius: '8px',
            fontSize: '10px',
            border: `1px solid ${color}30`,
            background: `${color}10`,
            color: color,
            cursor: 'pointer',
          }}
          title="从此节点引出新提问分支"
        >
          引出
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onConnectClick?.(cardId); }}
          style={{
            flex: 1,
            padding: '6px 0',
            borderRadius: '8px',
            fontSize: '10px',
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.04)',
            color: '#999',
            cursor: 'pointer',
          }}
          title="点击后选择目标卡片进行连线"
        >
          连线
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRecommendClick?.(cardId); }}
          style={{
            flex: 1,
            padding: '6px 0',
            borderRadius: '8px',
            fontSize: '10px',
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.04)',
            color: '#999',
            cursor: 'pointer',
          }}
        >
          推荐
        </button>
      </div>
    </div>
  );
});
