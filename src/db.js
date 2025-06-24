const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_zenEQCNp8J4K@ep-purple-paper-a8qvap9g-pooler.eastus2.azure.neon.tech/neondb?sslmode=require'
  ssl: { rejectUnauthorized: false } // Required by Neon
});

module.exports = pool;
