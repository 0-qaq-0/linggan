/**
 * think 标签解析器的边界测试。
 *
 * 跑法：
 *     cd server && npm test
 *
 * 为什么要有这些测试？
 * 流式解析的 bug 只在"标签恰好被切在 chunk 边界上"时出现，
 * 手工点页面几乎不可能稳定复现。所以必须把边界情况固化成测试。
 *
 * ⚠️ 注意本文件里所有标签都用 `tag()` 拼出来，而不是直接写尖括号字面量。
 * 原因是尖括号包裹的标签字面量在源码流转过程中很容易被当成真实 HTML 标签
 * 而被编辑器 / 格式化工具 / 渲染链路吃掉，一旦被吃，测试就会"静默地测了个寂寞"
 * （标签变成普通文本，断言全错但看不出为什么）。用函数构造可以彻底免疫。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createThinkTagParser, type ThinkEvent } from './thinkTagParser.js';

const LT = String.fromCharCode(60);
const GT = String.fromCharCode(62);

/** 拼出完整标签：tag('think') => 尖括号包裹的 think */
function tag(name: string): string {
  return LT + name + GT;
}

const OPEN = tag('think');
const OPEN_LONG = tag('thinking');
const CLOSE = tag('/think');
const CLOSE_LONG = tag('/thinking');

/** 把一串分片喂给解析器，返回全部事件（含 flush 的收尾内容） */
function run(chunks: string[]): ThinkEvent[] {
  const parser = createThinkTagParser();
  const events: ThinkEvent[] = [];
  for (const chunk of chunks) {
    events.push(...parser.process(chunk));
  }
  events.push(...parser.flush());
  return events;
}

/** 把事件合并成"思考文本"和"正文文本"两段，便于断言 */
function merge(events: ThinkEvent[]) {
  let thinking = '';
  let text = '';
  for (const e of events) {
    if (e.type === 'thinking') thinking += e.content;
    else text += e.content;
  }
  return { thinking, text };
}

/** 断言：合并后的正文与思考内容完全符合预期 */
function assertSplit(chunks: string[], expected: { thinking?: string; text: string }) {
  const { thinking, text } = merge(run(chunks));
  assert.equal(text, expected.text, `正文不符（分片：${JSON.stringify(chunks)}）`);
  if (expected.thinking !== undefined) {
    assert.equal(thinking, expected.thinking, `思考内容不符（分片：${JSON.stringify(chunks)}）`);
  }
  return { thinking, text };
}

test('用例 1：完整的 think 标签落在同一个分片里', () => {
  const events = run([OPEN + '用户在问商业模式' + CLOSE + '建议先做用户访谈。']);
  assert.deepEqual(events, [
    { type: 'thinking', content: '用户在问商业模式' },
    { type: 'text', content: '建议先做用户访谈。' },
  ]);
});

test('用例 2：开标签被切碎在分片边界上（<thi | nk>）', () => {
  assertSplit([OPEN.slice(0, 4), OPEN.slice(4) + '思考内容' + CLOSE.slice(0, 5), CLOSE.slice(5) + '正文'], {
    thinking: '思考内容',
    text: '正文',
  });
});

test('用例 3【关键回归】：正文含 "<t" 且流恰好在此结束，不能丢字', () => {
  // 这是原实现的真实缺陷：缓冲区里按住的 "<t" 在流结束时被直接丢弃，
  // 用户会看到 "片段：" 后面的内容凭空消失。
  assertSplit(['片段：', LT + 't'], { text: '片段：' + LT + 't' });
});

test('用例 4：HTML 标签不会被误判成 think 标签', () => {
  assertSplit(['看这个 ', tag('table'), ' 标签'], {
    thinking: '',
    text: '看这个 ' + tag('table') + ' 标签',
  });
});

test('用例 5：未闭合的 think 标签，内容不泄漏到正文', () => {
  const { thinking, text } = assertSplit([OPEN_LONG + '还没想完', '继续想'], { text: '' });
  assert.equal(thinking, '还没想完继续想');
});

test('用例 6：分片边界上出现 "<" 后下一片补齐为标签', () => {
  assertSplit(['答案' + LT, 'think' + GT + '内部思考' + CLOSE.slice(0, 6), CLOSE.slice(6) + '后面'], {
    thinking: '内部思考',
    text: '答案后面',
  });
});

test('用例 7：正文里的裸 "<" 应当立即输出，不引入延迟', () => {
  // "<" 后面跟空格和数字，不可能是标签名，应该马上作为正文吐出。
  // 注意：解析器允许把连续文本拆成多个事件（拼接后等价即可），
  // 所以这里断言"本片立即产出正文"而不是断言事件个数。
  const parser = createThinkTagParser();
  const events = parser.process('1 ' + LT + ' 2');
  assert.ok(events.length > 0, '裸 "<" 不应被无限按住');
  assert.deepEqual(merge(events), { thinking: '', text: '1 ' + LT + ' 2' });
});

test('用例 8：多个 think 块交替出现', () => {
  assertSplit(['a' + OPEN + 'x' + CLOSE + 'b', OPEN + 'y' + CLOSE + 'c'], {
    thinking: 'xy',
    text: 'abc',
  });
});

test('用例 9：只有思考内容、没有正文时，正文为空', () => {
  assertSplit([OPEN_LONG, '只有思考', CLOSE_LONG], { thinking: '只有思考', text: '' });
});

test('用例 10：逐字符喂入（最极端的切分情况）也应得到相同结果', () => {
  const raw = '开头' + OPEN_LONG + '思考中' + CLOSE_LONG + '结尾';
  const oneShot = merge(run([raw]));
  const charByChar = merge(run(raw.split('')));
  assert.deepEqual(charByChar, oneShot);
  assert.deepEqual(oneShot, { thinking: '思考中', text: '开头结尾' });
});

/**
 * 用例 12【关键回归 · 比丢字更严重】：所有"半截标签"输入都必须正常返回。
 *
 * 旧实现在遇到这些输入时会陷入死循环：当 `lastLt === 0` 时 `buffer = suffix`
 * 等于把 buffer 原样赋回自己，循环条件 `buffer.length > 0` 永远成立，进程永不返回。
 * 由于 Node 是单线程，这意味着**一个请求就能把整个服务端的事件循环卡死**。
 *
 * 这里用耗时断言兜底：如果解析器再出现死循环，测试会失败而不是把测试进程挂住。
 */
test('用例 12：所有半截标签前缀都不得导致死循环', () => {
  const dangerous = [
    LT + 't',
    LT + 'th',
    LT + 'thi',
    LT + 'thin',
    LT + 'think',
    LT + 'thinki',
    LT + 'thinkin',
    LT + '/t',
    LT + '/think',
    LT + '/thinki',
  ];

  for (const input of dangerous) {
    const started = Date.now();
    const { text } = merge(run([input]));
    const elapsed = Date.now() - started;

    // 内容必须原样保留（没有被当成标签吃掉）
    assert.equal(text, input, `半截标签 ${JSON.stringify(input)} 的内容丢失了`);
    // 必须迅速返回，不能卡住
    assert.ok(elapsed < 1000, `半截标签 ${JSON.stringify(input)} 耗时 ${elapsed}ms，疑似死循环`);
  }
});

test('用例 13：半截标签后紧跟真实标签，仍能正确解析', () => {
  // 先给一段"像标签但其实不是"的正文，再给真正的 think 块
  assertSplit([LT + 't', 'hreshold 是阈值' + OPEN + '思考' + CLOSE + '正文'], {
    thinking: '思考',
    text: LT + 'threshold 是阈值正文',
  });
});

test('用例 14：闭合标签的两种写法（短写与长写）都能识别', () => {
  assertSplit([OPEN + '思考' + CLOSE + 'A' + OPEN_LONG + '思考2' + CLOSE_LONG + 'B'], {
    thinking: '思考思考2',
    text: 'AB',
  });
});
