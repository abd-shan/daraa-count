import 'dotenv/config';
import { z } from 'zod';
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (v) => /^postgres(ql)?:/.test(v),
      'DATABASE_URL must use PostgreSQL',
    ),
  APP_ORIGIN: z
    .string()
    .url()
    .refine((v) => {
      const url = new URL(v);
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash
      );
    }, 'APP_ORIGIN must be an HTTP(S) origin without credentials, path, query or fragment')
    .transform((v) => new URL(v).origin),
  SESSION_COOKIE_NAME: z
    .string()
    .regex(/^[a-zA-Z0-9_]+$/)
    .default('count_daraa_session'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  MAX_IMPORT_FILE_MB: z.coerce.number().int().min(1).max(10).default(10),
  MAX_IMPORT_ROWS: z.coerce.number().int().min(1).max(10000).default(10000),
});

export function readConfig() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success)
    throw new Error(
      'Invalid configuration: ' +
        parsed.error.issues
          .map((i) => i.path.join('.') + ': ' + i.message)
          .join('; '),
    );
  // if (
  //   parsed.data.NODE_ENV === 'production' &&
  //   !parsed.data.APP_ORIGIN.startsWith('https://')
  // )
  //   throw new Error('APP_ORIGIN must use HTTPS in production');
  return parsed.data;
}
