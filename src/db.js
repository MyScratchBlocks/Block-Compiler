const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://myscratchblocks_user:C1jfpv8DsLUmUdQC5m7If06XiYD146dv@dpg-d1ddofidbo4c73cnh7dg-a/myscratchblocks',
  ssl: { rejectUnauthorized: false } // Required by Neon
});

module.exports = pool;
