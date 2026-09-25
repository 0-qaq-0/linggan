/**
 * 流式 think 标签解析器。
 *
 * ## 背景：为什么需要这个东西
 *
 * DeepSeek R1、Claude 的扩展思考等模型，会把"思考过程"和"正式回答"混在同一个
 * 文本流里输出，思考部分用 think 标签包起来（尖括号 + think / thinking）。
 * 前端只想把正式回答渲染成气泡，思考过程单独折叠展示，所以要在流式过程中把两者分开。
 *
 * ## 难点：标签会被切碎
 *
 * 流式接口一次只给一小段文本（chunk），切分位置完全不可控。于是可能出现：
 *
 *     chunk1 = "我先分析一下< t"
 *     chunk2 = "hink>用户在问商业模式</thi"
 *     chunk3 = "nk>建议先做用户访谈。"
 *
 * 如果把每个 chunk 直接往外发，用户就会看到 `<t`、`hink>` 这种碎片漏进正文。
 * 所以必须缓冲：当缓冲区末尾可能是某个标签的开头时，先按住不发，等下一段来了再判断。
 *
 * ## 原来的实现在哪里错了
 *
 * 原代码用一个正则判断"末尾是不是标签前缀"，但那个正则把 `<t`、`<th`、`<thi`
 * 这些都算作前缀，而且**一旦按住就再也没有兜底**——如果流恰好以 `<t` 结束，
 * 或者下一个 chunk 证明它不是标签，这段被按住的文本就可能永远发不出去（丢字）。
 *
 * 这里的实现做了两件事：
 *   1. 只在末尾**确实**是 think 开/闭标签的真前缀时才按住，其他情况立刻当正文发出。
 *   2. 提供 `flush()`，流结束时把缓冲区里剩下的内容**原样吐出**，绝不丢字。
 *
 * ## 为什么标签是用代码拼出来的
 *
 * 见文件末尾 `LT` / `GT` 的注释：源码里直接写尖括号包裹的标签字面量，容易在
 * 各种文本处理环节被误当成真实 HTML 标签而吃掉，所以统一用 `tag()` 构造。
 */

/** 小于号 / 大于号。用字符码构造，避免源码里出现会被误处理的尖括号字面量。 */
const LT = String.fromCharCode(60);
const GT = String.fromCharCode(62);

/** 用标签名拼出完整标签，例如 tag('think') => 尖括号包裹的 think */
function tag(name: string): string {
  return LT + name + GT;
}

/** 打开思考块的标签：think 与 thinking 两种写法都支持 */
const OPEN_TAGS: readonly string[] = [tag('think'), tag('thinking')];

/** 关闭思考块的标签 */
const CLOSE_TAGS: readonly string[] = [tag('/think'), tag('/thinking')];

/** 所有标签（用于计算"可能是标签前缀"的最长后缀） */
const ALL_TAGS: readonly string[] = [...OPEN_TAGS, ...CLOSE_TAGS];

/** 可能出现在标签名里的字符，只有这些字符才值得按住等待 */
const TAG_NAME_CHARS = new Set(['t', 'h', 'i', 'n', 'k', 'g', '/']);

export type ThinkEvent =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string };

export interface ThinkTagParser {
  /** 处理一个流式分片，返回本片可以对外发送的事件（可能为空数组） */
  process(chunk: string): ThinkEvent[];
  /** 流结束时调用，吐出缓冲区中所有剩余内容（绝不丢字） */
  flush(): ThinkEvent[];
}

/**
 * 判断字符串 `s` 是否是某个标签的真前缀（即 s 是 tag 的开头部分，且比 tag 短）。
 * 例如 `<thi` 是 `<thinking>` 的前缀，返回 true；`<t ` 不是，返回 false。
 */
function isTagPrefix(s: string): boolean {
  if (s.length === 0) return false;
  return ALL_TAGS.some((t) => t.length > s.length && t.startsWith(s));
}

/**
 * 找出缓冲区中"可能是标签开头"的最长后缀长度。
 *
 * 从最后一个 `<` 开始往后看：
 *   - 如果 `<` 后面出现了不可能是标签名的字符（比如空格、中文），说明这不是标签，返回 0；
 *   - 如果这段恰好是真前缀，返回它的长度（需要按住等待）；
 *   - 否则返回 0（不是标签，当正文发出）。
 */
function heldSuffixLength(buffer: string): number {
  const lt = buffer.lastIndexOf(LT);
  if (lt === -1) return 0;

  const suffix = buffer.slice(lt);
  for (let i = 1; i < suffix.length; i++) {
    if (!TAG_NAME_CHARS.has(suffix[i])) return 0;
  }
  return isTagPrefix(suffix) ? suffix.length : 0;
}

/** 在缓冲区中查找最先出现的关闭标签，返回位置与长度 */
function findCloseTag(buffer: string): { index: number; length: number } | null {
  let best: { index: number; length: number } | null = null;
  for (const t of CLOSE_TAGS) {
    const index = buffer.indexOf(t);
    if (index !== -1 && (best === null || index < best.index)) {
      best = { index, length: t.length };
    }
  }
  return best;
}

/** 缓冲区是否以某个打开标签开头，是则返回标签长度，否则返回 0 */
function startsWithOpenTag(buffer: string): number {
  for (const t of OPEN_TAGS) {
    if (buffer.startsWith(t)) return t.length;
  }
  return 0;
}

export function createThinkTagParser(): ThinkTagParser {
  let buffer = '';
  let insideThink = false;

  return {
    process(chunk: string): ThinkEvent[] {
      buffer += chunk;
      const events: ThinkEvent[] = [];

      // 循环处理，直到缓冲区里没有"可以确定"的内容为止
      for (;;) {
        if (buffer.length === 0) break;

        if (insideThink) {
          // ── 思考块内部：找关闭标签 ──
          const close = findCloseTag(buffer);
          if (close) {
            if (close.index > 0) {
              events.push({ type: 'thinking', content: buffer.slice(0, close.index) });
            }
            buffer = buffer.slice(close.index + close.length);
            insideThink = false;
            continue;
          }

          // 没找到关闭标签：可能标签被切碎了，按住最后一段等下一片
          const held = heldSuffixLength(buffer);
          const emit = buffer.slice(0, buffer.length - held);
          if (emit) events.push({ type: 'thinking', content: emit });
          buffer = buffer.slice(buffer.length - held);
          break;
        }

        // ── 思考块外部：找打开标签 ──
        if (!buffer.startsWith(LT)) {
          const lt = buffer.indexOf(LT);
          if (lt === -1) {
            events.push({ type: 'text', content: buffer });
            buffer = '';
            break;
          }
          events.push({ type: 'text', content: buffer.slice(0, lt) });
          buffer = buffer.slice(lt);
          continue;
        }

        const openLen = startsWithOpenTag(buffer);
        if (openLen > 0) {
          buffer = buffer.slice(openLen);
          insideThink = true;
          continue;
        }

        // 开头是 `<` 但不是完整标签：先看是不是"标签的前缀"
        const held = heldSuffixLength(buffer);
        if (held > 0) break; // 可能被切碎，等下一片再判断

        // 确认不是标签 → 当正文发出（只吐出第一个 `<`，剩下的继续循环处理）
        events.push({ type: 'text', content: LT });
        buffer = buffer.slice(1);
      }

      return events;
    },

    flush(): ThinkEvent[] {
      const events: ThinkEvent[] = [];
      if (buffer.length === 0) return events;

      // 流结束了，缓冲区里剩下的内容一律原样吐出，绝不丢弃。
      // 未闭合的思考块也当作思考内容输出（宁可多显示，不可丢内容）。
      events.push({ type: insideThink ? 'thinking' : 'text', content: buffer });
      buffer = '';
      return events;
    },
  };
}
