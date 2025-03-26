const { Client } = require('pg');

async function testConnection() {
  const client = new Client({
    user: 'dispositivos_iot_registro_user',
    host: 'dpg-cvdjr83v2p9s738kf1t0', // Dirección de tu servidor en Render
    database: 'dispositivos_iot_registro',
    password: 'mXZO1cax83uAap3iFcbf7hblGwPGVJUQ',
    port: 5432,
    ssl: {
      rejectUnauthorized: false, // Render normalmente requiere SSL
    },
  });

  try {
    await client.connect(); // Intentar conectar
    console.log('Conexión exitosa a la base de datos');
  } catch (err) {
    console.error('Error al conectar a la base de datos:', err);
  } finally {
    await client.end(); // Cierra la conexión
  }
}

testConnection();
