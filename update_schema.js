const mysql = require('mysql2/promise');
require('dotenv').config();

async function updateSchema() {
  const host = process.env.MYSQL_HOST;
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD;
  const database = process.env.MYSQL_DATABASE;

  console.log('Connecting to database...');
  const conn = await mysql.createConnection({ host, user, password, database, multipleStatements: true });

  console.log('Adding missing columns to recipes table...');
  try {
    const columns = [
      'ADD COLUMN prep_time VARCHAR(50)',
      'ADD COLUMN cook_time VARCHAR(50)',
      'ADD COLUMN servings VARCHAR(50)',
      'ADD COLUMN calories INT',
      'ADD COLUMN protein VARCHAR(50)',
      'ADD COLUMN carbs VARCHAR(50)',
      'ADD COLUMN fat VARCHAR(50)'
    ];

    // Check each column individually to avoid errors if some already exist (though error says they don't)
    // Or just try adding them and catch errors.
    // Better: Query information_schema or just run ALTER and catch specific error if exists.
    // Since we know they are missing, I'll run one ALTER statement.
    
    // However, if one exists and others don't, it might fail.
    // Safer to add them one by one or use IF NOT EXISTS if supported (MySQL 8.0+ supports ADD COLUMN IF NOT EXISTS? No, only MariaDB)
    // So I will loop and try to add each.

    for (const col of columns) {
      try {
        await conn.query(`ALTER TABLE recipes ${col}`);
        console.log(`Success: ${col}`);
      } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
          console.log(`Skipped (already exists): ${col}`);
        } else {
          console.error(`Failed: ${col}`, e.message);
        }
      }
    }

    console.log('Schema update completed.');
  } catch (e) {
    console.error('Fatal error during update:', e);
  } finally {
    await conn.end();
  }
}

updateSchema();
