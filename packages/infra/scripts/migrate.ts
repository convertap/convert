import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { createDatabase } from '../src/db/client';

/** Gate G7, first half: migrations must apply to an empty database. */
const main = async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const migrationsFolder = join(__dirname, '../src/db/migrations');
  try {
    await access(migrationsFolder);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn('no migrations directory exists yet - nothing to apply');
      return;
    }
    throw error;
  }

  const db = createDatabase(url);
  await migrate(db, { migrationsFolder });
  console.warn('migrations applied');
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
