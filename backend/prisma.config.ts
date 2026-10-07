import 'dotenv/config';
import { defineConfig } from 'prisma/config';
// Generation needs no database. Runtime and migration commands require the real URL.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://localhost/count_daraa',
  },
});
