const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_HOST = process.env.MYSQL_HOST || 'localhost';
const DB_USER = process.env.MYSQL_USER || 'root';
const DB_PASS = process.env.MYSQL_PASSWORD || 'Jenil@2007';
const DB_NAME = process.env.MYSQL_DATABASE || 'cookvala';

(async function() {
  try {
    const conn = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASS,
      database: DB_NAME
    });
    
    console.log('Connected to DB');
    
    const [rows] = await conn.query('SELECT id, name, category, author_id, video FROM recipes');
    console.log('Recipes in DB:', rows.length);
    console.table(rows);
    
    const [users] = await conn.query('SELECT id, name, email, role FROM users');
    console.log('Users in DB:', users.length);
    console.table(users);

    const [r_count] = await conn.query('SELECT COUNT(*) AS c FROM recipes WHERE category != "Reels"');
    console.log('Count (category != "Reels"):', r_count[0].c);

    const [r_count_null] = await conn.query('SELECT COUNT(*) AS c FROM recipes WHERE category IS NULL');
    console.log('Count (category IS NULL):', r_count_null[0].c);

    await conn.end();
  } catch (err) {
    console.error('Error:', err);
  }
})();
