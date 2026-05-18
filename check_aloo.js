const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_HOST = process.env.MYSQL_HOST || 'localhost';
const DB_USER = process.env.MYSQL_USER || 'root';
const DB_PASS = process.env.MYSQL_PASSWORD || 'Jenil@2007';
const DB_NAME = process.env.MYSQL_DATABASE || 'tastytable';

async function check() {
  try {
    const pool = mysql.createPool({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASS,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    const [rows] = await pool.query('SELECT * FROM recipes WHERE title LIKE "%aloo%" OR description LIKE "%aloo%"');
    console.log(JSON.stringify(rows, null, 2));
    await pool.end();
  } catch (e) {
    console.error(e);
  }
}

check();