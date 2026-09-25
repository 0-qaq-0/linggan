/**
 * JWT 密钥配置的回归测试。
 *
 * 背景：修复前 `requireAuth.ts` 在模块顶层读取密钥：
 *
 *     const JWT_SECRET = process.env.JWT_SECRET || 'linggan-dev-secret-change-me';
 *
 * 由于 ESM 的 import 会被提升到模块体之前执行，而这行代码所在的模块是在
 * `dotenv.config()` 之前被加载的，所以 process.env.JWT_SECRET 永远是 undefined，
 * 密钥永远等于那个硬编码的默认值——用户配置的密钥被静默忽略，
 * 而默认值公开写在仓库里，任何人都能伪造登录令牌。
 *
 * 这些测试锁住修复后的行为：密钥必须"运行时读取 + 不安全就拒绝启动"。
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {
  loadAuthSecret,
  getAuthSecret,
  getTokenExpiresIn,
  __resetAuthSecretCacheForTests,
} from '../config/authSecret.js';

const LEGACY_SECRET = 'linggan-dev-secret-change-me';
const VALID_SECRET = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

let originalSecret: string | undefined;
let originalExpires: string | undefined;

beforeEach(() => {
  originalSecret = process.env.JWT_SECRET;
  originalExpires = process.env.JWT_EXPIRES_IN;
  __resetAuthSecretCacheForTests();
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
  if (originalExpires === undefined) delete process.env.JWT_EXPIRES_IN;
  else process.env.JWT_EXPIRES_IN = originalExpires;
  __resetAuthSecretCacheForTests();
});

test('未配置 JWT_SECRET 时必须抛错，而不是静默使用默认值', () => {
  delete process.env.JWT_SECRET;
  assert.throws(() => loadAuthSecret(), /缺少 JWT_SECRET/);
});

test('空字符串同样视为未配置', () => {
  process.env.JWT_SECRET = '   ';
  assert.throws(() => loadAuthSecret(), /缺少 JWT_SECRET/);
});

test('历史默认密钥必须被拒绝（这是漏洞的根源）', () => {
  process.env.JWT_SECRET = LEGACY_SECRET;
  assert.throws(() => loadAuthSecret(), /历史默认值/);
});

test('过短的密钥必须被拒绝', () => {
  process.env.JWT_SECRET = 'short';
  assert.throws(() => loadAuthSecret(), /太短/);
});

test('合法密钥应当被接受，且会缓存', () => {
  process.env.JWT_SECRET = VALID_SECRET;
  assert.equal(loadAuthSecret(), VALID_SECRET);
  assert.equal(getAuthSecret(), VALID_SECRET);

  // 缓存生效：改掉环境变量后仍返回首次加载的值
  process.env.JWT_SECRET = 'another-valid-secret-value-1234567890';
  assert.equal(getAuthSecret(), VALID_SECRET);
});

test('【核心回归】配置真实密钥后，用历史默认密钥签发的 token 必须校验失败', () => {
  process.env.JWT_SECRET = VALID_SECRET;
  const secret = getAuthSecret();

  // 攻击者用公开在仓库里的默认密钥伪造一个管理员 token
  const forged = jwt.sign({ sub: 'victim', email: 'v@x.z', role: 'admin' }, LEGACY_SECRET, {
    expiresIn: '7d',
  });

  // 服务端用真实密钥校验 → 必须失败
  assert.throws(
    () => jwt.verify(forged, secret),
    /invalid signature/,
    '伪造的 token 竟然通过了校验——说明密钥修复失效',
  );

  // 反过来，用真实密钥签发的 token 必须能通过
  const legit = jwt.sign({ sub: 'victim', email: 'v@x.z', role: 'user' }, secret, {
    expiresIn: '7d',
  });
  const decoded = jwt.verify(legit, secret) as { sub: string };
  assert.equal(decoded.sub, 'victim');
});

test('token 有效期默认 7 天，可通过环境变量覆盖', () => {
  delete process.env.JWT_EXPIRES_IN;
  assert.equal(getTokenExpiresIn(), '7d');
  process.env.JWT_EXPIRES_IN = '1h';
  assert.equal(getTokenExpiresIn(), '1h');
});
