const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixDatabase() {
  const host = process.env.MYSQL_HOST;
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD;
  const database = process.env.MYSQL_DATABASE;

  console.log('Connecting to database...');
  const conn = await mysql.createConnection({ host, user, password, database });

  const columnsToAdd = [
    { name: 'category', def: 'VARCHAR(50)' },
    { name: 'video', def: 'TEXT' }
  ];

  try {
    for (const col of columnsToAdd) {
      try {
        console.log(`Checking column: ${col.name}`);
        // Try to select the column to see if it exists
        await conn.query(`SELECT ${col.name} FROM recipes LIMIT 1`);
        console.log(`Column ${col.name} already exists.`);
      } catch (e) {
        if (e.code === 'ER_BAD_FIELD_ERROR') {
          console.log(`Column ${col.name} missing. Adding it...`);
          await conn.query(`ALTER TABLE recipes ADD COLUMN ${col.name} ${col.def}`);
          console.log(`Added column ${col.name}.`);
        } else {
          console.error(`Error checking column ${col.name}:`, e.message);
        }
      }
    }
    
    // Also check if index exists for category
    try {
        await conn.query('CREATE INDEX idx_category ON recipes(category)');
        console.log('Added index for category');
    } catch (e) {
        if (e.code === 'ER_DUP_KEYNAME') {
             console.log('Index for category already exists');
        } else {
            console.log('Index creation message:', e.message);
        }
    }

  } catch (e) {
    console.error('Fatal error:', e);
  } finally {
    await conn.end();
  }
}

fixDatabase();
