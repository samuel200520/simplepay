const fs = require('fs');
const path = require('path');
const db = require('./index');

async function migrate() {
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('Running database migration...');
    await db.query(schema);
    console.log('✓ Migration completed successfully');
    
    // Verify tables exist
    const tables = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log('\nExisting tables:');
    tables.rows.forEach(row => console.log(`  - ${row.table_name}`));
    
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();