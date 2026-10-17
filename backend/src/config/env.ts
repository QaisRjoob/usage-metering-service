import { z } from 'zod';

const booleanFlag = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(200).default(20),
    /** Operator token for /api/v1/admin/*. Local/demo mechanism; at least 16 characters. */
    ADMIN_API_TOKEN: z.string().min(16, 'ADMIN_API_TOKEN must be at least 16 characters'),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173,http://localhost:8080')
      .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean)),
    RUN_MIGRATIONS: booleanFlag.default(true),
    SEED_DEMO_DATA: booleanFlag.default(true),
    DEMO_API_KEY: z.string().min(20).default('umk_demo_local_only_do_not_use_in_production'),
    AI_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().optional(),
    OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(20_000),
    AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(100).max(4000).default(800),
    AI_RATE_LIMIT_PER_WINDOW: z.coerce.number().int().min(1).max(1000).default(10),
    AI_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
    /** POST /admin/accounts per minute per client IP. */
    ACCOUNT_CREATE_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(100_000).default(30),
    /** POST /auth/identify (login) attempts per minute per client IP. */
    LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(100_000).default(20),
    SIGNUP_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(100_000).default(10),
    /** Wrong credentials (admin token, API key, login token, claim code) per minute per client IP before 429. */
    AUTH_FAILURE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(100_000).default(20),
    /**
     * Trust X-Forwarded-For only behind a reverse proxy you control (number of proxy hops). With the
     * default 0 the API uses the socket address, so clients cannot fake their IP to dodge rate limits.
     */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  })
  .superRefine((env, ctx) => {
    if (env.AI_PROVIDER === 'openai') {
      if (!env.OPENAI_API_KEY) ctx.addIssue({ code: 'custom', path: ['OPENAI_API_KEY'], message: 'Required when AI_PROVIDER=openai' });
      if (!env.OPENAI_MODEL) ctx.addIssue({ code: 'custom', path: ['OPENAI_MODEL'], message: 'Required when AI_PROVIDER=openai' });
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

/** Demo values shipped in the repository; fine locally, never for a real deployment. */
const PLACEHOLDER_ADMIN_TOKENS = new Set(['local-admin-token-change-me', 'change-me-local-admin-token']);

/** Configuration problems that do not stop a local demo but must be fixed before a real deployment. */
export function securityWarnings(config: AppConfig): string[] {
  const warnings: string[] = [];
  if (config.NODE_ENV !== 'production') return warnings;
  if (PLACEHOLDER_ADMIN_TOKENS.has(config.ADMIN_API_TOKEN) || config.ADMIN_API_TOKEN.length < 32) {
    warnings.push('ADMIN_API_TOKEN is a demo placeholder or shorter than 32 characters. Set a long random token (e.g. openssl rand -base64 48).');
  }
  if (config.SEED_DEMO_DATA) warnings.push('SEED_DEMO_DATA is enabled; the demo API key is public. Disable it outside local demos.');
  if (config.CORS_ORIGINS.some((origin) => origin === '*')) warnings.push('CORS_ORIGINS contains "*"; list the web app origins instead.');
  return warnings;
}

/** Reads and validates configuration once at startup; invalid configuration stops the process. */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${problems}`);
  }
  return result.data;
}
