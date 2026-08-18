import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from '../src/db/client';

/** Gate G7, first half: migrations must apply to an empty database. */
const main = async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const db = createDatabase(url);
  await migrate(db, { migrationsFolder: './src/db/migrations' });
  console.warn('migrations applied');
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
