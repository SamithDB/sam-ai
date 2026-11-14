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

  // MongoDB
  MONGO_URI: z.string().trim().min(1).default('mongodb://127.0.0.1:27017/sam-ai'),

  // CSE data source (unset = use built-in fixture data)
  CSE_API_BASE_URL: optionalString,

  // Mastra / LLM
  MASTRA_ENABLED: booleanFromString,
  MASTRA_MODEL: z.string().trim().min(1).default('openai/gpt-5-mini'),
  OPENAI_API_KEY: optionalString,
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
