/**
 * JWT 密钥的唯一来源。
 *
 * ⚠️ 为什么单独抽一个模块？
 *
 * 之前 requireAuth.ts 里写的是：
 *
 *     const JWT_SECRET = process.env.JWT_SECRET || 'linggan-dev-secret-change-me';
 *
 * 这行代码有两个问题：
 *
 * 1. 【加载顺序】ES 模块的 import 会被提升到模块体之前执行。index.ts 里
 *    `import aiRoutes from './routes/ai.js'` 会连带加载 requireAuth.ts，而
 *    `dotenv.config()` 写在所有 import 之后——也就是说这行代码执行时 .env
 *    还没被读取，process.env.JWT_SECRET 必然是 undefined。结果就是无论用户
 *    怎么配，密钥永远等于那个硬编码的默认值。
 *
 * 2. 【静默降级】用 `||` 兜底意味着"配置缺失"不会报错，而是悄悄用一个公开
 *    写在仓库里的字符串继续跑。密钥一旦公开，任何人都能自己签发合法 token
 *    冒充任意用户（包括管理员）。
 *
 * 所以这里改成：读取放在函数里（运行时才读），并且宁可启动失败也不静默降级。
 */

/** 历史遗留的默认密钥。曾用于兜底，现已废弃——出现即视为配置错误。 */
const LEGACY_INSECURE_SECRET = 'linggan-dev-secret-change-me';

/** 密钥最小长度。HS256 的密钥空间直接决定 token 能否被暴力破解。 */
const MIN_SECRET_LENGTH = 16;

/** 缓存已校验的密钥。只在首次调用时读 process.env，之后复用。 */
let cachedSecret: string | null = null;

/**
 * 读取并校验 JWT 密钥。必须在 dotenv 加载完成后调用。
 *
 * 校验不通过会直接抛错（fail fast）——服务端起不来，好过带着公开密钥对外服务。
 */
export function loadAuthSecret(): string {
  if (cachedSecret) return cachedSecret;

  const secret = process.env.JWT_SECRET?.trim();

  if (!secret) {
    throw new Error(
      '[auth] 缺少 JWT_SECRET。请在项目根目录的 .env 中配置一个随机长字符串，例如：\n' +
        '       JWT_SECRET=' + 'x'.repeat(48) + '\n' +
        '       （可用 `openssl rand -hex 32` 或 `node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"` 生成）',
    );
  }

  if (secret === LEGACY_INSECURE_SECRET) {
    throw new Error(
      `[auth] JWT_SECRET 仍是历史默认值「${LEGACY_INSECURE_SECRET}」。\n` +
        '       这个值公开写在仓库里，任何人都能用它伪造登录令牌，请立即更换为随机字符串。',
    );
  }

  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `[auth] JWT_SECRET 太短（当前 ${secret.length} 字符，至少需要 ${MIN_SECRET_LENGTH} 字符）。`,
    );
  }

  cachedSecret = secret;
  return cachedSecret;
}

/**
 * 获取已加载的密钥（供签发/校验 token 使用）。
 * 未调用过 loadAuthSecret() 时，这里会顺手加载一次，保证两条路径行为一致。
 */
export function getAuthSecret(): string {
  return loadAuthSecret();
}

/** token 有效期，默认 7 天。 */
export function getTokenExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN?.trim() || '7d';
}

/**
 * 仅供测试使用：清空缓存，让下一次调用重新读取 process.env。
 * 业务代码不要调用。
 */
export function __resetAuthSecretCacheForTests(): void {
  cachedSecret = null;
}
