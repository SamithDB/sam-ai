import { join } from 'node:path';
import { z } from 'zod';

/**
 * Single source of truth for API environment variables.
 * Values come from the workspace-root `.env` (see `.env.example`), and real
 * environment variables always take precedence over the file.
 */
const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // API server
  API_PORT: z.coerce.number().int().positive().default(3333),
  API_PORT_FALLBACK: booleanFromString,


  // Public cse.lk API used for all live market data (there is no sample-data mode)
  CSE_API_BASE_URL: z.string().trim().url().default('https://www.cse.lk/api'),

  // Research results written by research/scripts/run_experiment.py (relative to the workspace root)
  RESEARCH_RESULTS_DIR: z.string().trim().min(1).default('research/results'),
  // Python research service (research/src/cse_xai/service.py): data sync + live predictions
  RESEARCH_SERVICE_URL: z.string().trim().url().default('http://127.0.0.1:8001'),

  // Mastra / LLM
  MASTRA_ENABLED: booleanFromString,
  // LLM provider for the agents: 'openai' (default) or 'anthropic'. Each provider has its own model and key.
  LLM_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
  OPENAI_MODEL: z.string().trim().min(1).default('gpt-5-mini'),
  OPENAI_API_KEY: optionalString,
  ANTHROPIC_MODEL: z.string().trim().min(1).default('claude-haiku-5-5'),
  ANTHROPIC_API_KEY: optionalString,
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

// Resolved from the process cwd, which is the workspace root for both `npm start`
// and `node apps/api/dist/main.js`. `.env.local` overrides `.env` for personal tweaks.
export const envFilePaths = [join(process.cwd(), '.env.local'), join(process.cwd(), '.env')];
