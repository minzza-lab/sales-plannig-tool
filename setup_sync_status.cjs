const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:lenr51u456vcqppgto71sw@db.fqjlsldmalvbikztzmis.supabase.co:5432/postgres'
});

async function setup() {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS sync_status (
      id SERIAL PRIMARY KEY,
      synced_by_name TEXT NOT NULL,
      synced_by_id TEXT NOT NULL,
      synced_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE sync_status DISABLE ROW LEVEL SECURITY;
  `);
  console.log('Table created!');
  await client.end();
}
setup();
