import 'dotenv/config';
import * as argon2 from 'argon2';
import { HttpException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { parse, passwordSchema, usernameSchema } from './common/validation';
import { readConfig } from './config';
async function bootstrap() {
  readConfig();
  const username = parse(usernameSchema, process.env.BOOTSTRAP_ADMIN_USERNAME);
  const password = parse(passwordSchema, process.env.BOOTSTRAP_ADMIN_PASSWORD);
  if (username.startsWith('replace') || password.startsWith('REPLACE_'))
    throw new Error('Replace bootstrap placeholders');
  const db = new PrismaService();
  try {
    const existing = await db.user.findUnique({
      where: { username },
      select: { role: true },
    });
    if (existing) {
      if (existing.role !== 'SUPER_ADMIN')
        throw new Error('Bootstrap username belongs to a municipality account');
      console.log('Administrator already exists; password was not changed.');
      return;
    }
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { username, passwordHash, role: 'SUPER_ADMIN' },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'USER_CREATE',
          entityType: 'User',
          entityId: user.id,
          metadata: { bootstrap: true },
        },
      });
    });
    console.log('Administrator created.');
  } finally {
    await db.$disconnect();
  }
}
/**
 * Reports why bootstrap failed, so a rejected username or password is not
 * mistaken for a database problem. Validation messages state the rule that
 * was broken, never the value: the password is never read back or logged.
 */
function explain(error: unknown): string[] {
  if (error instanceof HttpException) {
    const payload = error.getResponse();
    const fields =
      typeof payload === 'object' && payload !== null && 'fields' in payload
        ? (payload as { fields?: Record<string, string> }).fields
        : undefined;
    const messages = Object.values(fields ?? {});
    if (messages.length) return messages;
  }
  if (error instanceof Error && error.message) return [error.message];
  return [];
}
void bootstrap().catch((error: unknown) => {
  console.error(
    'Administrator bootstrap failed. Check configuration and database access.',
  );
  for (const message of explain(error)) console.error('  -', message);
  process.exitCode = 1;
});
