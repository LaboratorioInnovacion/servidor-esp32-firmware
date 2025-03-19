const { Pool } = require('pg');

// Configura la cadena de conexión según tu entorno
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Reemplaza 'user:password@localhost:5432/mydatabase' con tus datos de conexión
  ssl: {
    rejectUnauthorized: false,
  },
});

async function migrate() {
  try {
    // Crear la tabla "devices" si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS devices (
        mac TEXT PRIMARY KEY,
        name TEXT,
        status TEXT,
        version TEXT,
        last_seen TIMESTAMP
      );
    `);

    // Crear la tabla "measurements" si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS measurements (
        id SERIAL PRIMARY KEY,
        mac TEXT REFERENCES devices(mac),
        time TIMESTAMP,
        uptime INTEGER
      );
    `);

    console.log("Migración completada exitosamente.");
  } catch (err) {
    console.error("Error en migración:", err);
  } finally {
    await pool.end();
  }
}

migrate();
