import { z } from 'zod';

const Schema = z.object({
  POLITO_BASE_URL: z.string().url().default('https://app.didattica.polito.it'),
  PUBLIC_ORIGIN: z.string().url().default('http://localhost:8787'),
  ENC_MASTER_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'ENC_MASTER_KEY must be 64 hex chars (32 bytes)'),
  JWT_SECRET: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'JWT_SECRET must be 64 hex chars (32 bytes)'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  DB_PATH: z.string().default('./data/polito-mcp.sqlite'),
  SENTRY_DSN: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Config = z.infer<typeof Schema>;

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetConfigForTests(overrides?: Partial<Config>): Config {
  cached = null;
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = String(v);
    }
  }
  return loadConfig();
}
