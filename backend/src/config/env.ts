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
  })
  .superRefine((env, ctx) => {
    if (env.AI_PROVIDER === 'openai') {
      if (!env.OPENAI_API_KEY) ctx.addIssue({ code: 'custom', path: ['OPENAI_API_KEY'], message: 'Required when AI_PROVIDER=openai' });
      if (!env.OPENAI_MODEL) ctx.addIssue({ code: 'custom', path: ['OPENAI_MODEL'], message: 'Required when AI_PROVIDER=openai' });
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

/** Reads and validates configuration once at startup; invalid configuration stops the process. */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${problems}`);
  }
  return result.data;
}
