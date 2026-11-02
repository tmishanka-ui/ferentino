export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { store } = await import('./lib/server/db');
  const { env } = await import('./lib/server/env');
  try {
    await store();
    console.log(`Connected to MongoDB (database "${env.mongoDb}").`);
  } catch (e: any) {
    console.error('\nCould not open the database: ' + (e?.message || e));
    console.error('Check MONGODB_URI in .env.local (see README.md, step 3). The pages will retry on the next request.\n');
  }
}
