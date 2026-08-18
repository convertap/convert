import { defineConfig } from 'drizzle-kit';

// Generated SQL is committed and reviewed, never applied blind: the tenancy guarantee
// lives in policy DDL, so a human reads every migration (ADR 0017).
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://convert:convert@localhost:5432/convert',
  },
  strict: true,
  verbose: true,
});
