const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const mqtt = require('mqtt');
const multer = require('multer');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------
// CONEXIÓN A POSTGRES
// ---------------------------
const pool = new Pool({
  connectionString: 'postgresql://iot_firmwares_user:Uo2UxCL4hWc4KIKFS4pkIVQEKZkbEdR0@dpg-cve0csfnoe9s73ejkaog-a.oregon-postgres.render.com/iot_firmwares',
  ssl: {
    rejectUnauthorized: false,
  },
});
// Asegúrate de reemplazar 'user:password@localhost:5432/mydatabase' con la conexión a tu DB

// ---------------------------
// 2) CONFIGURAR VISTAS EJS
// ---------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Endpoint para ver los dispositivos en crudo (JSON)
app.get('/devices-json', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM devices ORDER BY last_seen DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error consultando la DB:', err);
    res.status(500).send('Error al consultar la DB.');
  }
});

// ---------------------------
// 3) CONEXIÓN AL BROKER MQTT
// ---------------------------
const mqttOptions = {
  host: 'ad11f935a9c74146a4d2e647921bf024.s1.eu.hivemq.cloud', // Ajusta a tu broker
  port: 8883,
  protocol: 'mqtts',
  username: 'Augustodelcampo97',
  password: 'Augustodelcampo97'
};

const mqttClient = mqtt.connect(mqttOptions);

mqttClient.on('connect', () => {
  console.log('MQTT conectado');
  // Suscribirse a tópicos de estado y heartbeat
  mqttClient.subscribe('esp32/status');
  mqttClient.subscribe('esp32/heartbeat');
});

mqttClient.on('error', err => {
  console.error('Error en MQTT:', err);
});

// ---------------------------
// 4) FUNCIÓN PARA FORMATEAR FECHAS (HUSO DE ARGENTINA)
// ---------------------------
function getArgentinaTime() {
  const options = {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  };
  const formatter = new Intl.DateTimeFormat('es-AR', options);
  return formatter.format(new Date());
}

// ---------------------------
// 5) MANEJO DE MENSAJES MQTT
// ---------------------------
mqttClient.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    const mac = payload.mac || 'unknown';

    if (topic === 'esp32/status') {
      const name = payload.name || '';
      const status = payload.status || 'unknown';
      const version = payload.version || '';

      // Insertar o actualizar el dispositivo en la tabla devices
      pool.query(
        `INSERT INTO devices (mac, name, status, version, last_seen) 
         VALUES ($1, $2, $3, $4, NOW()) 
         ON CONFLICT (mac) DO UPDATE SET 
           name = $2, status = $3, version = $4, last_seen = NOW()`,
        [mac, name, status, version],
        (err, result) => {
          if (err) {
            console.error('Error actualizando dispositivo:', err);
          } else {
            console.log(`Dispositivo ${mac} actualizado a estado ${status}, v:${version}`);
          }
        }
      );
    } else if (topic === 'esp32/heartbeat') {
      const name = payload.name || '';
      // Actualizar el dispositivo a estado online y actualizar last_seen
      pool.query(
        `INSERT INTO devices (mac, name, status, last_seen) 
         VALUES ($1, $2, 'online', NOW()) 
         ON CONFLICT (mac) DO UPDATE SET 
           name = $2, status = 'online', last_seen = NOW()`,
        [mac, name],
        (err, result) => {
          if (err) {
            console.error('Error actualizando heartbeat del dispositivo:', err);
          } else {
            console.log(`Heartbeat recibido de ${mac} => name: ${name}`);
          }
        }
      );
      // Insertar medición si se proporciona uptime
      if (payload.uptime) {
        pool.query(
          `INSERT INTO measurements (mac, time, uptime) VALUES ($1, NOW(), $2)`,
          [mac, payload.uptime],
          (err, result) => {
            if (err) {
              console.error('Error insertando medición:', err);
            }
          }
        );
      }
    }
  } catch (err) {
    console.error('Error parseando mensaje MQTT:', err);
  }
});

// ---------------------------
// 6) SUBIR FIRMWARE (OTA)
// ---------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, 'firmware.bin')
});
const upload = multer({ storage });

app.use('/firmware', express.static(path.join(__dirname, 'uploads')));

app.post('/update-firmware', upload.single('firmware'), (req, res) => {
  const deviceId = req.body.deviceId || 'all';
  const baseUrl = 'https://servidor-esp32.onrender.com';
  const firmwareUrl = `${baseUrl}/firmware/firmware.bin`;
  const payload = `${deviceId}|${firmwareUrl}`;

  mqttClient.publish('esp32/update', payload, err => {
    if (err) {
      console.error('Error publicando firmware:', err);
      return res.status(500).send('Error enviando firmware al ESP32.');
    }
    console.log(`Firmware publicado para ${deviceId}: ${firmwareUrl}`);
    res.send(`Firmware subido y URL enviada a ${deviceId}.`);
  });
});

// ---------------------------
// 7) VISTA PRINCIPAL
// ---------------------------
// app.get('/', async (req, res) => {
//   try {
//     const result = await pool.query('SELECT * FROM devices ORDER BY last_seen DESC');
//     res.render('index', { devices: result.rows });
//   } catch (err) {
//     console.error('Error consultando la DB:', err);
//     res.status(500).send('Error al consultar la DB.');
//   }
// });
app.get('/', async (req, res) => {
  try {
    const devicesResult = await pool.query('SELECT * FROM devices ORDER BY last_seen DESC');
    const measurementsResult = await pool.query('SELECT * FROM measurements ORDER BY time DESC');
    res.render('index', { 
      devices: devicesResult.rows, 
      measurements: measurementsResult.rows 
    });
  } catch (err) {
    console.error('Error consultando la DB:', err);
    res.status(500).send('Error al consultar la DB.');
  }
});


app.get('/devices', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM devices ORDER BY last_seen DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error consultando la DB:', err);
    res.status(500).send('Error al consultar la DB.');
  }
});

// ---------------------------
// 7.1) MONITOREO DE DISPOSITIVOS DESCONECTADOS
// ---------------------------
setInterval(() => {
  pool.query(
    `UPDATE devices SET status = 'offline' WHERE last_seen < NOW() - INTERVAL '60 seconds'`,
    (err, result) => {
      if (err) {
        console.error('Error actualizando dispositivos offline:', err);
      } else {
        console.log('Dispositivos marcados como offline');
      }
    }
  );
}, 30000); // Ejecutar cada 30 segundos

// ---------------------------
// 8) INICIAR SERVIDOR
// ---------------------------
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

// const fs = require('fs');
// const path = require('path');
// const express = require('express');
// const bodyParser = require('body-parser');
// const mqtt = require('mqtt');
// const multer = require('multer');

// const app = express();
// const PORT = process.env.PORT || 3000;

// // ---------------------------
// // 1) LECTURA DE devices.json
// // ---------------------------
// const devicesFile = path.join(__dirname, 'devices.json');
// let devicesData = {};
// // Intentar leer el archivo si existe
// try {
//   if (fs.existsSync(devicesFile)) {
//     const raw = fs.readFileSync(devicesFile, 'utf8');
//     if (raw.trim()) {
//       devicesData = JSON.parse(raw); // Solo parsear si el archivo tiene contenido
//     } else {
//       devicesData = {};
//     }
//   }
// } catch (err) {
//   console.error('Error leyendo devices.json:', err);
//   devicesData = {}; // Evitar que se borren datos si hay error
// }
// // try {
// //   if (fs.existsSync(devicesFile)) {
// //     const raw = fs.readFileSync(devicesFile);
// //     devicesData = JSON.parse(raw);
// //   } else {
// //     devicesData = {};
// //   }
// // } catch (err) {
// //   console.error('Error leyendo devices.json:', err);
// //   devicesData = {};
// // }

// // ---------------------------
// // 2) CONFIGURAR VISTAS EJS
// // ---------------------------
// app.set('view engine', 'ejs');
// app.set('views', path.join(__dirname, 'views'));

// app.use(bodyParser.urlencoded({ extended: false }));
// app.use(bodyParser.json());

// app.get('/devices-json', (req, res) => {
//   try {
//     const rawData = fs.readFileSync(devicesFile, 'utf8'); // Leer el archivo
//     const jsonData = JSON.parse(rawData); // Parsear el contenido
//     res.json(jsonData); // Enviar el contenido como respuesta JSON
//   } catch (err) {
//     console.error('Error leyendo devices.json:', err);
//     res.status(500).send('Error al leer el archivo devices.json');
//   }
// });

// // ---------------------------
// // 3) CONEXIÓN AL BROKER MQTT
// // ---------------------------
// const mqttOptions = {
//   host: 'ad11f935a9c74146a4d2e647921bf024.s1.eu.hivemq.cloud', // Ajusta a tu broker
//   port: 8883,
//   protocol: 'mqtts',
//   username: 'Augustodelcampo97',       // Reemplaza
//   password: 'Augustodelcampo97'      // Reemplaza
// };

// const mqttClient = mqtt.connect(mqttOptions);

// mqttClient.on('connect', () => {
//   console.log('MQTT conectado');

//   // Suscribirse a tópicos de estado
//   mqttClient.subscribe('esp32/status');
//   mqttClient.subscribe('esp32/heartbeat');
// });

// mqttClient.on('error', err => {
//   console.error('Error en MQTT:', err);
// });

// // ---------------------------
// // 4) FUNCIÓN PARA FORMATEAR FECHAS (HUSO DE ARGENTINA)
// // ---------------------------
// function getArgentinaTime() {
//   const options = {
//     timeZone: 'America/Argentina/Buenos_Aires',
//     year: 'numeric',
//     month: '2-digit',
//     day: '2-digit',
//     hour: '2-digit',
//     minute: '2-digit',
//     second: '2-digit',
//   };
//   const formatter = new Intl.DateTimeFormat('es-AR', options);
//   return formatter.format(new Date());
// }

// // ---------------------------
// // 5) MANEJO DE MENSAJES MQTT
// // ---------------------------
// mqttClient.on('message', (topic, message) => {
//   try {
//     const payload = JSON.parse(message.toString());

//     if (topic === 'esp32/status') {
//       const mac = payload.mac || 'unknown';
//       if (!devicesData[mac]) {
//         devicesData[mac] = { measurements: [] };
//       }
//       devicesData[mac].name = payload.name || devicesData[mac].name || '';
//       devicesData[mac].status = payload.status || 'unknown';
//       devicesData[mac].version = payload.version || devicesData[mac].version || '';
//       devicesData[mac].lastSeen = getArgentinaTime();

//       console.log(`Dispositivo ${mac} => ${devicesData[mac].status}, v:${devicesData[mac].version}`);

//     } else if (topic === 'esp32/heartbeat') {
//       const mac = payload.mac || 'unknown';
//       if (!devicesData[mac]) {
//         devicesData[mac] = { measurements: [] };
//       }
//       devicesData[mac].name = payload.name || devicesData[mac].name || '';
//       devicesData[mac].status = 'online';
//       devicesData[mac].lastSeen = getArgentinaTime();

//       // Guardar mediciones recibidas en el heartbeat
//       if (payload.uptime) {
//         devicesData[mac].measurements.push({
//           time: getArgentinaTime(),
//           uptime: payload.uptime,
//         });
//       }

//       console.log(`Heartbeat de ${mac} => name:${devicesData[mac].name}`);
//     }

//     // Guardar en disco
//     fs.writeFileSync(devicesFile, JSON.stringify(devicesData, null, 2));
//     console.log('Archivo devices.json actualizado:', devicesData);


//   } catch (err) {
//     console.error('Error parseando mensaje MQTT:', err);
//   }
// });

// // ---------------------------
// // 6) SUBIR FIRMWARE (OTA)
// // ---------------------------
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, 'uploads/'),
//   filename: (req, file, cb) => cb(null, 'firmware.bin')
// });
// const upload = multer({ storage });

// app.use('/firmware', express.static(path.join(__dirname, 'uploads')));

// app.post('/update-firmware', upload.single('firmware'), (req, res) => {
//   const deviceId = req.body.deviceId || 'all';
//   const baseUrl = 'https://servidor-esp32.onrender.com';
//   const firmwareUrl = `${baseUrl}/firmware/firmware.bin`;
//   const payload = `${deviceId}|${firmwareUrl}`;

//   mqttClient.publish('esp32/update', payload, err => {
//     if (err) {
//       console.error('Error publicando firmware:', err);
//       return res.status(500).send('Error enviando firmware al ESP32.');
//     }
//     console.log(`Firmware publicado para ${deviceId}: ${firmwareUrl}`);
//     res.send(`Firmware subido y URL enviada a ${deviceId}.`);
//   });
// });

// // ---------------------------
// // 7) VISTA PRINCIPAL
// // ---------------------------
// app.get('/', (req, res) => {
//   res.render('index', { devices: devicesData });
// });

// // Ruta JSON para ver datos en crudo
// app.get('/devices', (req, res) => {
//   res.json(devicesData);
// });
// // ---------------------------
// // 7.1) MONITOREO DE DISPOSITIVOS DESCONECTADOS
// // ---------------------------
// setInterval(() => {
//   const ahora = new Date();
//   Object.keys(devicesData).forEach(mac => {
//     const lastSeen = new Date(devicesData[mac].lastSeen);
//     const diferencia = (ahora - lastSeen) / 1000; // Diferencia en segundos
//     if (diferencia > 60) { // Si han pasado más de 60 segundos sin heartbeat
//       devicesData[mac].status = 'offline';
//     }
//   });

//   fs.writeFileSync(devicesFile, JSON.stringify(devicesData, null, 2));
// }, 30000); // Ejecutar cada 30 segundos


// // ---------------------------
// // 8) INICIAR SERVIDOR
// // ---------------------------
// app.listen(PORT, () => {
//   console.log(`Servidor corriendo en http://localhost:${PORT}`);
// });
// const fs = require('fs');
// const path = require('path');
// const express = require('express');
// const bodyParser = require('body-parser');
// const mqtt = require('mqtt');
// const multer = require('multer');

// const app = express();
// const PORT = process.env.PORT || 3000;

// // ---------------------------
// // 1) LECTURA DE devices.json
// // ---------------------------
// const devicesFile = path.join(__dirname, 'devices.json');
// let devicesData = {};

// try {
//   if (fs.existsSync(devicesFile)) {
//     const raw = fs.readFileSync(devicesFile);
//     devicesData = JSON.parse(raw);
//   } else {
//     devicesData = {};
//   }
// } catch (err) {
//   console.error('Error leyendo devices.json:', err);
//   devicesData = {};
// }

// // ---------------------------
// // 2) CONFIGURAR VISTAS EJS
// // ---------------------------
// app.set('view engine', 'ejs');
// app.set('views', path.join(__dirname, 'views'));

// app.use(bodyParser.urlencoded({ extended: false }));
// app.use(bodyParser.json());

// // ---------------------------
// // 3) CONEXIÓN AL BROKER MQTT
// // ---------------------------
// const mqttOptions = {
//   host: 'ad11f935a9c74146a4d2e647921bf024.s1.eu.hivemq.cloud', // Ajusta a tu broker
//   port: 8883,
//   protocol: 'mqtts',
//   username: 'Augustodelcampo97',       // Reemplaza
//   password: 'Augustodelcampo97'      // Reemplaza
// };

// const mqttClient = mqtt.connect(mqttOptions);

// mqttClient.on('connect', () => {
//   console.log('MQTT conectado');

//   // Suscribirse a tópicos de estado
//   mqttClient.subscribe('esp32/status');
//   mqttClient.subscribe('esp32/heartbeat');
// });

// mqttClient.on('error', err => {
//   console.error('Error en MQTT:', err);
// });

// // ---------------------------
// // 4) MANEJO DE MENSAJES MQTT
// // ---------------------------
// mqttClient.on('message', (topic, message) => {
//   try {
//     const payload = JSON.parse(message.toString());

//     if (topic === 'esp32/status') {
//       // Ej: {"mac":"AA:BB:CC:11:22:33","name":"Oficina","status":"online","version":"1.0.0"}
//       const mac = payload.mac || 'unknown';
//       if (!devicesData[mac]) {
//         devicesData[mac] = { measurements: [] };
//       }
//       devicesData[mac].name = payload.name || devicesData[mac].name || '';
//       devicesData[mac].status = payload.status || 'unknown';
//       devicesData[mac].version = payload.version || devicesData[mac].version || '';
//       devicesData[mac].lastSeen = Date.now();

//       console.log(`Dispositivo ${mac} => ${devicesData[mac].status}, v:${devicesData[mac].version}`);

//     } else if (topic === 'esp32/heartbeat') {
//       // Ej: {"mac":"AA:BB:CC:11:22:33","name":"Oficina","uptime":123456}
//       const mac = payload.mac || 'unknown';
//       if (!devicesData[mac]) {
//         devicesData[mac] = { measurements: [] };
//       }
//       devicesData[mac].name = payload.name || devicesData[mac].name || '';
//       devicesData[mac].status = 'online'; // asume que está en línea
//       devicesData[mac].lastSeen = Date.now();

//       // Podrías guardar mediciones si vienen en el heartbeat
//       // e.g. devicesData[mac].measurements.push({time: Date.now(), value: payload.value });

//       console.log(`Heartbeat de ${mac} => name:${devicesData[mac].name}`);

//     } 
//     // Podrías añadir más else if si tienes otros tópicos (ej: mediciones)

//     // Guardar en disco
//     fs.writeFileSync(devicesFile, JSON.stringify(devicesData, null, 2));

//   } catch (err) {
//     console.error('Error parseando mensaje MQTT:', err);
//   }
// });

// // ---------------------------
// // 5) SUBIR FIRMWARE (OTA)
// // ---------------------------
// // Multer para subir el archivo .bin
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, 'uploads/'),
//   filename: (req, file, cb) => cb(null, 'firmware.bin')
// });
// const upload = multer({ storage });

// // Servir la carpeta /uploads en /firmware
// app.use('/firmware', express.static(path.join(__dirname, 'uploads')));

// // Ruta POST para subir firmware y publicar URL en "esp32/update"
// app.post('/update-firmware', upload.single('firmware'), (req, res) => {
//   // deviceId = MAC o "all"
//   const deviceId = req.body.deviceId || 'all';

//   // Ajusta baseUrl a tu dominio o IP
//   const baseUrl = 'https://servidor-esp32.onrender.com/'; 
//   // Si lo subes a Render, usarías "https://mi-app.onrender.com"
  
//   const firmwareUrl = `${baseUrl}/firmware/firmware.bin`;
//   const payload = `${deviceId}|${firmwareUrl}`;  // "<MAC>|<URL>" o "all|<URL>"

//   mqttClient.publish('esp32/update', payload, err => {
//     if (err) {
//       console.error('Error publicando firmware:', err);
//       return res.status(500).send('Error enviando firmware al ESP32.');
//     }
//     console.log(`Firmware publicado para ${deviceId}: ${firmwareUrl}`);
//     res.send(`Firmware subido y URL enviada a ${deviceId}.`);
//   });
// });

// // ---------------------------
// // 6) VISTA PRINCIPAL
// // ---------------------------
// app.get('/', (req, res) => {
//   // Muestra en HTML la lista de dispositivos
//   res.render('index', { devices: devicesData });
// });

// // Ruta JSON para ver datos en crudo
// app.get('/devices', (req, res) => {
//   res.json(devicesData);
// });

// // ---------------------------
// // 7) INICIAR SERVIDOR
// // ---------------------------
// app.listen(PORT, () => {
//   console.log(`Servidor corriendo en http://localhost:${PORT}`);
// });

// const express = require('express');
// const bodyParser = require('body-parser');
// const mqtt = require('mqtt');
// const path = require('path');
// const multer = require('multer');

// const app = express();
// const PORT = process.env.PORT || 3000;

// app.set('view engine', 'ejs');
// app.set('views', path.join(__dirname, 'views'));
// app.use(bodyParser.urlencoded({ extended: false }));

// // -----------------
// // MQTT
// // -----------------
// const mqttOptions = {
//   host: 'ad11f935a9c74146a4d2e647921bf024.s1.eu.hivemq.cloud',
//   port: 8883,
//   protocol: 'mqtts',
//   username: 'Augustodelcampo97',
//   password: 'Augustodelcampo97'
// };
// const mqttClient = mqtt.connect(mqttOptions);

// mqttClient.on('connect', () => {
//   console.log('MQTT conectado');
//   // Suscribirse a "esp32/status" para saber quién está online/offline
//   mqttClient.subscribe('esp32/status');
// });

// mqttClient.on('error', err => console.error('Error MQTT:', err));

// // Estructura en memoria para almacenar info de dispositivos
// const devices = {}; 
// // Formato: {
// //   "AA:BB:CC:11:22:33": { status: "online", version: "1.0.0", lastUpdate: Date.now() },
// //   ...
// // }

// // Al llegar un mensaje en "esp32/status"
// mqttClient.on('message', (topic, message) => {
//   if (topic === 'esp32/status') {
//     try {
//       const data = JSON.parse(message.toString());
//       // data: { mac: "...", status: "online"/"offline", version: "1.0.0" }
//       const mac = data.mac;
//       if (!mac) return;

//       devices[mac] = {
//         status: data.status || 'unknown',
//         version: data.version || devices[mac]?.version || 'unknown',
//         lastUpdate: Date.now()
//       };
//       console.log(`Dispositivo ${mac} => ${data.status}, versión: ${devices[mac].version}`);
//     } catch (e) {
//       console.error('Error parseando status:', e);
//     }
//   }
// });

// // -----------------
// // Subida de firmware
// // -----------------
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, 'uploads/'),
//   filename: (req, file, cb) => cb(null, 'firmware.bin')
// });
// const upload = multer({ storage });

// // Servir carpeta /uploads
// app.use('/firmware', express.static(path.join(__dirname, 'uploads')));

// // Vista principal
// app.get('/', (req, res) => {
//   // Podemos mostrar la lista de dispositivos y su estado
//   res.render('index', { devices });
// });

// // Procesar subida de firmware
// app.post('/update-firmware', upload.single('firmware'), (req, res) => {
//   const baseUrl = 'https://servidor-esp32.onrender.com'; // Ajustar a tu caso
//   const deviceId = req.body.deviceId; // MAC o "all"
//   const firmwareUrl = `${baseUrl}/firmware/firmware.bin`;
//   const payload = `${deviceId}|${firmwareUrl}`;

//   mqttClient.publish('esp32/update', payload, err => {
//     if (err) {
//       console.error('Error publicando firmware:', err);
//       return res.status(500).send('Error enviando firmware al ESP32.');
//     }
//     res.send(`Firmware subido y URL enviada a ${deviceId}.`);
//   });
// });

// app.listen(PORT, () => {
//   console.log(`Servidor en http://localhost:${PORT}`);
// });

// const express = require('express');
// const bodyParser = require('body-parser');
// const mqtt = require('mqtt');
// const path = require('path');
// const multer = require('multer');

// const app = express();

// // Para Render, usa el puerto asignado en process.env.PORT o 3000 por defecto
// const PORT = process.env.PORT || 3000;

// // Configurar EJS como motor de vistas
// app.set('view engine', 'ejs');
// app.set('views', path.join(__dirname, 'views'));

// // Middlewares
// app.use(bodyParser.urlencoded({ extended: false }));
// app.use(bodyParser.json());

// // ----------------------------------------------------------------------
// // CONFIGURACIÓN MQTT (HiveMQ Cloud)
// // Sustituye con tus datos reales (o usa variables de entorno en Render).
// // ----------------------------------------------------------------------
// const mqttOptions = {
//   host: 'ad11f935a9c74146a4d2e647921bf024.s1.eu.hivemq.cloud', // Ejemplo
//   port: 8883,          // Puerto TLS
//   protocol: 'mqtts',   // Conexión segura
//   username: 'Augustodelcampo97',
//   password: 'Augustodelcampo97'
// };

// // Conectar al broker MQTT
// const client = mqtt.connect(mqttOptions);

// client.on('connect', () => {
//   console.log('Conectado al broker MQTT');
// });

// client.on('error', (err) => {
//   console.error('Error en la conexión MQTT:', err);
// });

// // ----------------------------------------------------------------------
// // CONFIGURACIÓN MULTER PARA SUBIR EL ARCHIVO
// // Se guardará en la carpeta "uploads/" con el nombre "firmware.bin"
// // ----------------------------------------------------------------------
// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, 'uploads/');
//   },
//   filename: function (req, file, cb) {
//     // Puedes usar un nombre dinámico si deseas versionar. Aquí usamos uno fijo:
//     cb(null, 'firmware.bin');
//   }
// });
// const upload = multer({ storage });

// // ----------------------------------------------------------------------
// // SERVIR LA CARPETA "uploads" DE FORMA ESTÁTICA EN /firmware
// // Ejemplo: https://mi-esp32-ota.onrender.com/firmware/firmware.bin
// // ----------------------------------------------------------------------
// app.use('/firmware', express.static(path.join(__dirname, 'uploads')));

// // ----------------------------------------------------------------------
// // RUTA PRINCIPAL: Renderiza el formulario EJS
// // ----------------------------------------------------------------------
// app.get('/', (req, res) => {
//   res.render('index');
// });

// // ----------------------------------------------------------------------
// // RUTA POST PARA PROCESAR LA SUBIDA DEL ARCHIVO .bin
// // Y PUBLICAR LA URL EN MQTT
// // ----------------------------------------------------------------------
// app.post('/update-firmware', upload.single('firmware'), (req, res) => {
//   // Si tu app está en Render, tu dominio será algo como:
//   // https://mi-esp32-ota.onrender.com
//   // Reemplaza con tu URL real o usa process.env para configurarla.
//   const baseUrl = 'https://servidor-esp32.onrender.com'; // <--- Cámbialo a tu URL en Render
  
//   // La ruta al binario subido:
//   const firmwareUrl = `${baseUrl}/firmware/firmware.bin`;

//   // Publicar la URL en el tópico "esp32/update"
//   client.publish('esp32/update', firmwareUrl, { qos: 0 }, (error) => {
//     if (error) {
//       console.error('Error publicando la URL de firmware:', error);
//       return res.send('Hubo un error al enviar la URL de firmware al ESP32.');
//     }
//     console.log('URL de firmware publicada en esp32/update:', firmwareUrl);
//     res.send('Firmware subido y URL enviada al ESP32 correctamente.');
//   });
// });

// // ----------------------------------------------------------------------
// // INICIAR SERVIDOR
// // ----------------------------------------------------------------------
// app.listen(PORT, () => {
//   console.log(`Servidor corriendo en http://localhost:${PORT}`);
// });

// const mqtt = require('mqtt');

// const brokerUrl = 'ad11f935a9c74146a4d2e647921bf024.s1.eu.hivemq.cloud';
// const topicOTA = 'esp32/ota';

// // URL del firmware (debe ser accesible públicamente)
// const firmwareUrl = 'https://servidor-esp32.onrender.com/firmware.bin';

// const client = mqtt.connect(brokerUrl);

// client.on('connect', () => {
//   console.log('Conectado al broker MQTT');
//   client.publish(topicOTA, firmwareUrl, (err) => {
//     if (!err) {
//       console.log(`URL del firmware enviada: ${firmwareUrl}`);
//     } else {
//       console.error('Error al enviar la URL OTA:', err);
//     }
//   });
// });

// // Servidor Node.js para actualización OTA remota de ESP32 con EJS
// const express = require('express');
// const mqtt = require('mqtt');
// const fs = require('fs');
// const path = require('path');
// const multer = require('multer');
// const bodyParser = require('body-parser');

// const app = express();
// const PORT = process.env.PORT || 3000;

// // Configuración MQTT
// const MQTT_SERVER = 'ad11f935a9c74146a4d2e647921bf024.s1.eu.hivemq.cloud';
// const MQTT_OPTIONS = {
//   username: 'psiconervio',
//   password: 'Psiconervio1',
//   clientId: '65535'
// };

// // Configuración para subir archivos
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, 'uploads/');
//   },
//   filename: (req, file, cb) => {
//     cb(null, 'firmware.bin');
//   }
// });
// const upload = multer({ storage: storage });

// // Conexión al broker MQTT
// const mqttClient = mqtt.connect(MQTT_SERVER, MQTT_OPTIONS);

// // Estado de dispositivos y mensajes para mostrar en la interfaz
// let deviceStatus = {};
// let statusMessages = [];

// mqttClient.on('connect', () => {
//   console.log('Conectado al broker MQTT');
//   mqttClient.subscribe('esp32/status', (err) => {
//     if (!err) {
//       console.log('Suscrito al topic de estado');
//     }
//   });
// });

// mqttClient.on('message', (topic, message) => {
//   const messageStr = message.toString();
//   console.log(`Mensaje recibido en ${topic}: ${messageStr}`);
  
//   // Registrar los mensajes de estado para mostrarlos en la interfaz
//   statusMessages.unshift({
//     time: new Date().toLocaleTimeString(),
//     message: messageStr
//   });
  
//   // Mantener solo los últimos 10 mensajes
//   if (statusMessages.length > 10) {
//     statusMessages = statusMessages.slice(0, 10);
//   }
  
//   // Actualizar estado del dispositivo si se puede extraer
//   if (messageStr.includes(':')) {
//     const parts = messageStr.split(':');
//     const deviceId = parts[0].trim();
//     const status = parts[1].trim();
    
//     deviceStatus[deviceId] = {
//       lastSeen: new Date(),
//       status: status
//     };
//   }
// });

// // Configuración del servidor Express
// app.use(bodyParser.json());
// app.use(bodyParser.urlencoded({ extended: true }));
// app.use(express.static('public'));

// // Configurar EJS como motor de plantillas
// app.set('view engine', 'ejs');
// app.set('views', path.join(__dirname, 'views'));

// // Asegurarse de que los directorios necesarios existen
// if (!fs.existsSync('uploads')) {
//   fs.mkdirSync('uploads');
// }
// if (!fs.existsSync('views')) {
//   fs.mkdirSync('views');
// }

// // Ruta principal - renderiza la plantilla EJS
// app.get('/', (req, res) => {
//   res.render('index', { 
//     deviceStatus: deviceStatus,
//     statusMessages: statusMessages
//   });
// });

// // Endpoint para subir firmware
// app.post('/upload', upload.single('firmware'), (req, res) => {
//   if (!req.file) {
//     return res.status(400).json({ error: 'No se ha subido ningún archivo' });
//   }
  
//   console.log('Firmware subido:', req.file.originalname);
  
//   // Registrar la acción en los mensajes de estado
//   statusMessages.unshift({
//     time: new Date().toLocaleTimeString(),
//     message: `Firmware subido: ${req.file.originalname} (${req.file.size} bytes)`
//   });
  
//   res.json({ success: true, message: 'Firmware subido correctamente' });
// });

// // Endpoint para iniciar actualización OTA
// app.post('/deploy/:deviceId', async (req, res) => {
//   const deviceId = req.params.deviceId;
//   const firmwarePath = path.join(__dirname, 'uploads', 'firmware.bin');
  
//   try {
//     // Verificar si el archivo existe
//     if (!fs.existsSync(firmwarePath)) {
//       return res.status(404).json({ error: 'No se encuentra el firmware' });
//     }
    
//     // Obtener el tamaño del firmware
//     const stats = fs.statSync(firmwarePath);
//     const fileSize = stats.size;
    
//     // Enviar comando de inicio OTA con el tamaño del archivo
//     mqttClient.publish('esp32/ota', `START_OTA:${fileSize}`);
//     console.log(`Iniciando OTA para ${deviceId} con archivo de ${fileSize} bytes`);
    
//     // Registrar la acción en los mensajes de estado
//     statusMessages.unshift({
//       time: new Date().toLocaleTimeString(),
//       message: `Iniciando actualización OTA para ${deviceId} (${fileSize} bytes)`
//     });
    
//     // Leer el archivo y enviarlo en fragmentos
//     const CHUNK_SIZE = 1024; // 1KB por fragmento para no saturar la memoria del ESP32
//     const fileData = fs.readFileSync(firmwarePath);
    
//     for (let i = 0; i < fileData.length; i += CHUNK_SIZE) {
//       const chunk = fileData.slice(i, i + CHUNK_SIZE);
//       await new Promise((resolve) => {
//         mqttClient.publish('esp32/ota', chunk, { qos: 1 }, () => {
//           // Pequeña pausa entre fragmentos para no saturar el ESP32
//           setTimeout(resolve, 50);
//         });
//       });
      
//       // Calcular y mostrar progreso
//       const progress = Math.min(100, Math.round((i + CHUNK_SIZE) * 100 / fileSize));
      
//       // Actualizar cada 10% para no saturar la consola
//       if (progress % 10 === 0) {
//         console.log(`Enviando firmware: ${progress}%`);
//       }
//     }
    
//     // Registrar la finalización
//     statusMessages.unshift({
//       time: new Date().toLocaleTimeString(),
//       message: `Firmware enviado completamente a ${deviceId}`
//     });
    
//     res.json({
//       success: true,
//       message: `Firmware enviado correctamente al dispositivo ${deviceId}`
//     });
    
//   } catch (error) {
//     console.error('Error al enviar firmware:', error);
    
//     // Registrar el error
//     statusMessages.unshift({
//       time: new Date().toLocaleTimeString(),
//       message: `ERROR: ${error.message}`
//     });
    
//     res.status(500).json({ error: 'Error al enviar firmware' });
//   }
// });

// // Endpoint para obtener estado actual (para actualizaciones AJAX)
// app.get('/status', (req, res) => {
//   res.json({
//     deviceStatus: deviceStatus,
//     statusMessages: statusMessages
//   });
// });

// // Iniciar servidor
// app.listen(PORT, () => {
//   console.log(`Servidor OTA ejecutándose en http://localhost:${PORT}`);
// });
// const express = require('express');
// const path = require('path');
// const app = express();
// const port = 3000;

// // Ruta para servir el firmware
// app.get('/firmware.bin', (req, res) => {
//   const filePath = path.join(__dirname, 'firmware.bin');
//   res.download(filePath, 'firmware.bin', (err) => {
//     if (err) {
//       console.error("Error enviando el firmware:", err);
//       res.status(500).send("Error interno");
//     }
//   });
// });

// app.listen(port, () => {
//   console.log(`Servidor de actualizaciones escuchando en http://localhost:${port}`);
// });

// const express = require('express');
// const multer = require('multer');
// const fs = require('fs');
// const path = require('path');
// const bodyParser = require('body-parser');

// const app = express();
// const port = 3000;

// // Crear directorio para almacenar firmwares si no existe
// const firmwareDir = path.join(__dirname, 'firmware');
// if (!fs.existsSync(firmwareDir)) {
//   fs.mkdirSync(firmwareDir);
// }

// // Configurar almacenamiento para los archivos de firmware subidos
// const storage = multer.diskStorage({
//   destination: function(req, file, cb) {
//     cb(null, firmwareDir);
//   },
//   filename: function(req, file, cb) {
//     const version = req.body.version || 'latest';
//     cb(null, `firmware-v${version}.bin`);
//   }
// });

// const upload = multer({ storage: storage });

// // Middleware para parsear JSON
// app.use(bodyParser.json());

// // Base de datos simple para seguimiento de versiones
// let deviceVersions = {};

// // Endpoint para subir nuevo firmware
// app.post('/upload-firmware', upload.single('firmware'), (req, res) => {
//   if (!req.file) {
//     return res.status(400).send('No se subió ningún archivo');
//   }
  
//   const version = req.body.version || 'unknown';
//   console.log(`Firmware versión ${version} subido correctamente`);
  
//   // Actualizar la versión más reciente
//   fs.writeFileSync(path.join(firmwareDir, 'latest-version.txt'), version);
  
//   res.send(`Firmware v${version} subido correctamente`);
// });

// // Endpoint para que los dispositivos verifiquen actualizaciones
// app.post('/check-update', (req, res) => {
//   const { deviceId, version } = req.body;
  
//   if (!deviceId || version === undefined) {
//     return res.status(400).send('Falta información del dispositivo');
//   }
  
//   // Registrar dispositivo
//   deviceVersions[deviceId] = version;
  
//   // Verificar si hay una actualización disponible
//   const latestVersion = fs.existsSync(path.join(firmwareDir, 'latest-version.txt')) 
//     ? parseInt(fs.readFileSync(path.join(firmwareDir, 'latest-version.txt'), 'utf8')) 
//     : 0;
  
//   console.log(`Dispositivo: ${deviceId}, Versión actual: ${version}, Versión más reciente: ${latestVersion}`);
  
//   if (latestVersion > version) {
//     res.send('update-available');
//   } else {
//     res.send('up-to-date');
//   }
// });

// // Endpoint para enviar el firmware a los dispositivos
// app.get('/firmware', (req, res) => {
//   const deviceId = req.headers['device-id'];
//   const currentVersion = req.headers['current-version'];
  
//   if (!deviceId) {
//     return res.status(400).send('Identificación de dispositivo requerida');
//   }
  
//   console.log(`Solicitud de firmware del dispositivo: ${deviceId}, versión actual: ${currentVersion}`);
  
//   // Obtener versión más reciente
//   const latestVersionFile = path.join(firmwareDir, 'latest-version.txt');
//   if (!fs.existsSync(latestVersionFile)) {
//     return res.status(404).send('No hay firmware disponible');
//   }
  
//   const latestVersion = fs.readFileSync(latestVersionFile, 'utf8');
//   const firmwarePath = path.join(firmwareDir, `firmware-v${latestVersion}.bin`);
  
//   if (!fs.existsSync(firmwarePath)) {
//     return res.status(404).send('Archivo de firmware no encontrado');
//   }
  
//   // Enviar el firmware
//   res.setHeader('Content-Type', 'application/octet-stream');
//   res.setHeader('Content-Disposition', `attachment; filename=firmware-v${latestVersion}.bin`);
  
//   fs.createReadStream(firmwarePath).pipe(res);
// });

// // Interfaz web simple para administrar firmware
// app.get('/', (req, res) => {
//   let deviceList = '';
//   for (const [deviceId, version] of Object.entries(deviceVersions)) {
//     deviceList += `<li>${deviceId}: versión ${version}</li>`;
//   }
  
//   res.send(`
//     <html>
//     <head><title>Sistema OTA ESP32</title></head>
//     <body>
//       <h1>Sistema de Actualización OTA para ESP32</h1>
      
//       <h2>Subir nuevo firmware</h2>
//       <form action="/upload-firmware" method="post" enctype="multipart/form-data">
//         <label>Versión: <input type="number" name="version" required></label><br>
//         <label>Archivo: <input type="file" name="firmware" required></label><br>
//         <button type="submit">Subir</button>
//       </form>
      
//       <h2>Dispositivos registrados</h2>
//       <ul>${deviceList || '<li>No hay dispositivos registrados</li>'}</ul>
//     </body>
//     </html>
//   `);
// });

// // Iniciar servidor HTTP
// app.listen(port, () => {
//   console.log(`Servidor OTA para ESP32 ejecutándose en puerto ${port}`);
// });
// import express from 'express';
// import fileUpload from 'express-fileupload';
// import fs from 'fs';
// import path from 'path';
// import { fileURLToPath } from 'url';

// // Configuración para obtener __dirname en ESM
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// const app = express();
// const port = process.env.PORT || 3000; // Usar el puerto proporcionado por Render o 3000 como fallback

// // Middleware para parsear JSON y manejar archivos
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));
// app.use(fileUpload({
//   createParentPath: true
// }));

// // Directorio para almacenar firmware
// const firmwareDir = path.join(__dirname, 'firmware');
// if (!fs.existsSync(firmwareDir)) {
//   fs.mkdirSync(firmwareDir, { recursive: true });
// }

// // Configuración de versión actual
// let currentVersion = "1.0.0";
// const versionFilePath = path.join(firmwareDir, 'version.txt');
// const firmwareFilePath = path.join(firmwareDir, 'firmware.bin');

// // Cargar versión si existe
// if (fs.existsSync(versionFilePath)) {
//   currentVersion = fs.readFileSync(versionFilePath, 'utf8').trim();
// }

// // Endpoint para obtener la versión actual
// app.get('/firmware/version', (req, res) => {
//   res.send(currentVersion);
//   console.log(`Versión solicitada: ${currentVersion}`);
// });

// // Endpoint para descargar la imagen del firmware
// app.get('/firmware/image', (req, res) => {
//   if (fs.existsSync(firmwareFilePath)) {
//     console.log('Firmware solicitado');
//     res.download(firmwareFilePath);
//   } else {
//     res.status(404).send('Firmware no encontrado');
//   }
// });

// // Dashboard para administración
// app.get('/', (req, res) => {
//   res.send(`
//     <!DOCTYPE html>
//     <html>
//     <head>
//       <title>ESP32 OTA Server</title>
//       <style>
//         body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
//         h1 { color: #333; }
//         .form { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
//         label { display: block; margin-bottom: 10px; }
//         input { margin-bottom: 15px; }
//         button { background: #4CAF50; color: white; padding: 10px 15px; border: none; cursor: pointer; }
//         .info { background: #f9f9f9; padding: 15px; border-radius: 5px; }
//       </style>
//     </head>
//     <body>
//       <h1>ESP32 OTA Update Server</h1>
      
//       <div class="info">
//         <h2>Versión actual: ${currentVersion}</h2>
//         <p>Firmware: ${fs.existsSync(firmwareFilePath) ? 'Disponible' : 'No disponible'}</p>
//       </div>
      
//       <div class="form">
//         <h2>Actualizar versión</h2>
//         <form action="/update-version" method="post">
//           <label>Nueva versión:</label>
//           <input type="text" name="version" required value="${currentVersion}">
//           <button type="submit">Actualizar versión</button>
//         </form>
//       </div>
      
//       <div class="form">
//         <h2>Subir nuevo firmware</h2>
//         <form action="/upload-firmware" method="post" enctype="multipart/form-data">
//           <label>Archivo de firmware (.bin):</label>
//           <input type="file" name="firmware" accept=".bin" required>
//           <button type="submit">Subir firmware</button>
//         </form>
//       </div>
//     </body>
//     </html>
//   `);
// });

// // Endpoint para actualizar la versión
// app.post('/update-version', (req, res) => {
//   const { version } = req.body;
//   if (!version) {
//     return res.status(400).send('Versión no especificada');
//   }
  
//   fs.writeFileSync(versionFilePath, version);
//   currentVersion = version;
//   console.log(`Versión actualizada a: ${version}`);
  
//   res.redirect('/');
// });

// // Endpoint para subir firmware
// app.post('/upload-firmware', (req, res) => {
//   if (!req.files || !req.files.firmware) {
//     return res.status(400).send('No se ha subido ningún archivo');
//   }
  
//   const firmwareFile = req.files.firmware;
  
//   // Guardar archivo
//   firmwareFile.mv(firmwareFilePath, (err) => {
//     if (err) {
//       return res.status(500).send(err);
//     }
    
//     console.log(`Firmware actualizado: ${firmwareFile.name}`);
//     res.redirect('/');
//   });
// });

// // Iniciar servidor
// app.listen(port, () => {
//   console.log(`Servidor OTA ejecutándose en puerto ${port}`);
// });
// import express from 'express';
// import fileUpload from 'express-fileupload';
// import fs from 'fs';
// import path from 'path';
// import { fileURLToPath } from 'url';

// const app = express();
// const port = 3000;

// // Obtener el nombre del directorio actual
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // Middleware para parsear JSON y manejar archivos
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));
// app.use(fileUpload({
//   createParentPath: true
// }));

// // Directorio para almacenar firmware
// const firmwareDir = path.join(__dirname, 'firmware');
// if (!fs.existsSync(firmwareDir)) {
//   fs.mkdirSync(firmwareDir, { recursive: true });
// }

// // Configuración de versión actual
// let currentVersion = "1.0.0";
// const versionFilePath = path.join(firmwareDir, 'version.txt');
// const firmwareFilePath = path.join(firmwareDir, 'firmware.bin');

// // Cargar versión si existe
// if (fs.existsSync(versionFilePath)) {
//   currentVersion = fs.readFileSync(versionFilePath, 'utf8').trim();
// }

// // Endpoint para obtener la versión actual
// app.get('/firmware/version', (req, res) => {
//   res.send(currentVersion);
//   console.log(`Versión solicitada: ${currentVersion}`);
// });

// // Endpoint para descargar la imagen del firmware
// app.get('/firmware/image', (req, res) => {
//   if (fs.existsSync(firmwareFilePath)) {
//     console.log('Firmware solicitado');
//     res.download(firmwareFilePath);
//   } else {
//     res.status(404).send('Firmware no encontrado');
//   }
// });

// // Dashboard para administración
// app.get('/', (req, res) => {
//   res.send(`
//     <!DOCTYPE html>
//     <html>
//     <head>
//       <title>ESP32 OTA Server</title>
//       <style>
//         body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
//         h1 { color: #333; }
//         .form { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
//         label { display: block; margin-bottom: 10px; }
//         input { margin-bottom: 15px; }
//         button { background: #4CAF50; color: white; padding: 10px 15px; border: none; cursor: pointer; }
//         .info { background: #f9f9f9; padding: 15px; border-radius: 5px; }
//       </style>
//     </head>
//     <body>
//       <h1>ESP32 OTA Update Server</h1>
      
//       <div class="info">
//         <h2>Versión actual: ${currentVersion}</h2>
//         <p>Firmware: ${fs.existsSync(firmwareFilePath) ? 'Disponible' : 'No disponible'}</p>
//       </div>
      
//       <div class="form">
//         <h2>Actualizar versión</h2>
//         <form action="/update-version" method="post">
//           <label>Nueva versión:</label>
//           <input type="text" name="version" required value="${currentVersion}">
//           <button type="submit">Actualizar versión</button>
//         </form>
//       </div>
      
//       <div class="form">
//         <h2>Subir nuevo firmware</h2>
//         <form action="/upload-firmware" method="post" enctype="multipart/form-data">
//           <label>Archivo de firmware (.bin):</label>
//           <input type="file" name="firmware" accept=".bin" required>
//           <button type="submit">Subir firmware</button>
//         </form>
//       </div>
//     </body>
//     </html>
//   `);
// });

// // Endpoint para actualizar la versión
// app.post('/update-version', (req, res) => {
//   const { version } = req.body;
//   if (!version) {
//     return res.status(400).send('Versión no especificada');
//   }
  
//   fs.writeFileSync(versionFilePath, version);
//   currentVersion = version;
//   console.log(`Versión actualizada a: ${version}`);
  
//   res.redirect('/');
// });

// // Endpoint para subir firmware
// app.post('/upload-firmware', (req, res) => {
//   if (!req.files || !req.files.firmware) {
//     return res.status(400).send('No se ha subido ningún archivo');
//   }
  
//   const firmwareFile = req.files.firmware;
  
//   // Guardar archivo
//   firmwareFile.mv(firmwareFilePath, (err) => {
//     if (err) {
//       return res.status(500).send(err);
//     }
    
//     console.log(`Firmware actualizado: ${firmwareFile.name}`);
//     res.redirect('/');
//   });
// });

// // Iniciar servidor
// app.listen(port, () => {
//   console.log(`Servidor OTA ejecutándose en http://localhost:${port}`);
// });

// import express from 'express';
// import fileUpload from 'express-fileupload';
// import fs from 'fs';
// import path from 'path';

// const app = express();
// const port = 3000;

// // Middleware para parsear JSON y manejar archivos
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));
// app.use(fileUpload({
//   createParentPath: true
// }));

// // Directorio para almacenar firmware
// const firmwareDir = path.join(__dirname, 'firmware');
// if (!fs.existsSync(firmwareDir)) {
//   fs.mkdirSync(firmwareDir, { recursive: true });
// }

// // Configuración de versión actual
// let currentVersion = "1.0.0";
// const versionFilePath = path.join(firmwareDir, 'version.txt');
// const firmwareFilePath = path.join(firmwareDir, 'firmware.bin');

// // Cargar versión si existe
// if (fs.existsSync(versionFilePath)) {
//   currentVersion = fs.readFileSync(versionFilePath, 'utf8').trim();
// }

// // Endpoint para obtener la versión actual
// app.get('/firmware/version', (req, res) => {
//   res.send(currentVersion);
//   console.log(`Versión solicitada: ${currentVersion}`);
// });

// // Endpoint para descargar la imagen del firmware
// app.get('/firmware/image', (req, res) => {
//   if (fs.existsSync(firmwareFilePath)) {
//     console.log('Firmware solicitado');
//     res.download(firmwareFilePath);
//   } else {
//     res.status(404).send('Firmware no encontrado');
//   }
// });

// // Dashboard para administración
// app.get('/', (req, res) => {
//   res.send(`
//     <!DOCTYPE html>
//     <html>
//     <head>
//       <title>ESP32 OTA Server</title>
//       <style>
//         body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
//         h1 { color: #333; }
//         .form { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
//         label { display: block; margin-bottom: 10px; }
//         input { margin-bottom: 15px; }
//         button { background: #4CAF50; color: white; padding: 10px 15px; border: none; cursor: pointer; }
//         .info { background: #f9f9f9; padding: 15px; border-radius: 5px; }
//       </style>
//     </head>
//     <body>
//       <h1>ESP32 OTA Update Server</h1>
      
//       <div class="info">
//         <h2>Versión actual: ${currentVersion}</h2>
//         <p>Firmware: ${fs.existsSync(firmwareFilePath) ? 'Disponible' : 'No disponible'}</p>
//       </div>
      
//       <div class="form">
//         <h2>Actualizar versión</h2>
//         <form action="/update-version" method="post">
//           <label>Nueva versión:</label>
//           <input type="text" name="version" required value="${currentVersion}">
//           <button type="submit">Actualizar versión</button>
//         </form>
//       </div>
      
//       <div class="form">
//         <h2>Subir nuevo firmware</h2>
//         <form action="/upload-firmware" method="post" enctype="multipart/form-data">
//           <label>Archivo de firmware (.bin):</label>
//           <input type="file" name="firmware" accept=".bin" required>
//           <button type="submit">Subir firmware</button>
//         </form>
//       </div>
//     </body>
//     </html>
//   `);
// });

// // Endpoint para actualizar la versión
// app.post('/update-version', (req, res) => {
//   const { version } = req.body;
//   if (!version) {
//     return res.status(400).send('Versión no especificada');
//   }
  
//   fs.writeFileSync(versionFilePath, version);
//   currentVersion = version;
//   console.log(`Versión actualizada a: ${version}`);
  
//   res.redirect('/');
// });

// // Endpoint para subir firmware
// app.post('/upload-firmware', (req, res) => {
//   if (!req.files || !req.files.firmware) {
//     return res.status(400).send('No se ha subido ningún archivo');
//   }
  
//   const firmwareFile = req.files.firmware;
  
//   // Guardar archivo
//   firmwareFile.mv(firmwareFilePath, (err) => {
//     if (err) {
//       return res.status(500).send(err);
//     }
    
//     console.log(`Firmware actualizado: ${firmwareFile.name}`);
//     res.redirect('/');
//   });
// });

// // Iniciar servidor
// app.listen(port, () => {
//   console.log(`Servidor OTA ejecutándose en http://localhost:${port}`);
// });


// import express from "express";
// import multer from "multer";
// import fs from "fs";
// import path from "path";
// import { fileURLToPath } from "url";

// // Configuración de directorios
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
// const PORT = 3000;
// const firmwarePath = path.join(__dirname, "firmware.bin");

// // Configuración de Multer para almacenar el archivo en disco
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     // Guarda el archivo en el mismo directorio del script
//     cb(null, __dirname);
//   },
//   filename: (req, file, cb) => {
//     // Se guarda siempre con el nombre "firmware.bin"
//     cb(null, "firmware.bin");
//   },
// });

// const upload = multer({
//   storage,
//   limits: { fileSize: 10 * 1024 * 1024 }, // Límite de 10 MB
// });

// const app = express();

// // Endpoint para subir el archivo
// app.post("/upload", upload.single("firmware"), (req, res) => {
//   if (!req.file) {
//     return res.status(400).json({ error: "No se recibió ningún archivo" });
//   }
//   console.log(`Firmware recibido: ${req.file.originalname}`);
//   res.json({ message: "Firmware actualizado correctamente" });
// });

// // Middleware global para manejar errores de Multer y otros
// app.use((err, req, res, next) => {
//   console.error("Error en la subida:", err.message);
//   res.status(400).json({ error: err.message });
// });

// // Endpoint para obtener el firmware
// app.get("/firmware.bin", (req, res) => {
//   if (fs.existsSync(firmwarePath)) {
//     res.sendFile(firmwarePath);
//   } else {
//     res.status(404).send("No hay firmware disponible");
//   }
// });

// // Iniciar el servidor
// app.listen(PORT, () => {
//   console.log(`Servidor corriendo en http://localhost:${PORT}`);
// });

// import express from "express";
// import multer from "multer";
// import fs from "fs";

// const app = express();
// const upload = multer({ dest: "uploads/" });

// let firmwareVersion = { version: "1.0.0" };

// app.post("/upload", upload.single("firmware"), (req, res) => {
//     const version = req.body.version;
    
//     if (!req.file || !version) {
//         return res.status(400).send("Falta el archivo o la versión.");
//     }

//     // Mueve el archivo a la carpeta de firmware con el nombre correcto
//     const firmwarePath = `./firmware/firmware_${version}.bin`;
//     fs.renameSync(req.file.path, firmwarePath);

//     // Actualiza la versión en el servidor
//     firmwareVersion.version = version;
//     fs.writeFileSync("./firmware/version.json", JSON.stringify(firmwareVersion));

//     res.send(`Firmware actualizado a la versión ${version}`);
// });

// app.get("/firmware/version", (req, res) => {
//     res.json(firmwareVersion);
// });

// app.get("/firmware/latest", (req, res) => {
//     res.download(`./firmware/firmware_${firmwareVersion.version}.bin`);
// });

// app.listen(3000, () => console.log("Servidor corriendo en el puerto 3000"));


// import express from "express";
// import fs from "fs";
// import cors from "cors";

// const app = express();
// const PORT = 3000;

// app.use(express.json());
// app.use(cors());

// const VERSION_FILE = "version.json"; // Archivo donde se guarda la versión actual
// const FIRMWARE_PATH = "./firmware.bin"; // Ruta del firmware

// // Función para obtener la versión actual del firmware
// const getCurrentVersion = () => {
//     if (fs.existsSync(VERSION_FILE)) {
//         const data = fs.readFileSync(VERSION_FILE, "utf8");
//         return JSON.parse(data).version;
//     }
//     return "1.0.0"; // Versión por defecto si no existe el archivo
// };

// // Función para actualizar la versión en el servidor
// const setCurrentVersion = (newVersion) => {
//     fs.writeFileSync(VERSION_FILE, JSON.stringify({ version: newVersion }, null, 2), "utf8");
// };

// // Ruta para verificar actualizaciones
// app.post("/update", (req, res) => {
//     const { currentVersion } = req.body;

//     if (!currentVersion) {
//         return res.status(400).json({ error: "Versión actual no proporcionada" });
//     }

//     const latestVersion = getCurrentVersion();
//     console.log(`ESP32 conectado con versión: ${currentVersion}`);

//     if (currentVersion !== latestVersion) {
//         return res.json({
//             version: latestVersion,
//             firmware: `https://servidor-esp32.onrender.com:${PORT}/firmware.bin`
//         });
//     }

//     res.json({ message: "El firmware está actualizado", version: latestVersion });
// });

// // Ruta para servir el firmware
// app.get("/firmware.bin", (req, res) => {
//     if (fs.existsSync(FIRMWARE_PATH)) {
//         res.download(FIRMWARE_PATH);
//     } else {
//         res.status(404).json({ error: "Firmware no encontrado" });
//     }
// });

// // Ruta para actualizar la versión del firmware en el servidor
// app.post("/set-version", (req, res) => {
//     const { newVersion } = req.body;

//     if (!newVersion) {
//         return res.status(400).json({ error: "Nueva versión no proporcionada" });
//     }

//     setCurrentVersion(newVersion);
//     console.log(`Versión del firmware actualizada a: ${newVersion}`);
//     res.json({ message: "Versión actualizada correctamente", version: newVersion });
// });

// // Iniciar el servidor
// app.listen(PORT, () => {
//     console.log(`Servidor OTA corriendo en http://localhost:${PORT}`);
// });

// import express from "express";
// import fs from "fs";
// import path from "path";
// import cors from "cors";

// const app = express();
// const PORT = 3000;

// // Habilitar CORS y JSON
// app.use(cors());
// app.use(express.json());

// // Versión actual del firmware
// const FIRMWARE_VERSION = "1.0.1";
// const FIRMWARE_PATH = path.join(path.resolve(), "firmware.bin");

// // Ruta para obtener la versión actual del firmware
// app.get("/version", (req, res) => {
//     res.send(FIRMWARE_VERSION);
// });

// // Ruta para descargar el firmware
// app.get("/firmware", (req, res) => {
//     if (fs.existsSync(FIRMWARE_PATH)) {
//         res.sendFile(FIRMWARE_PATH);
//     } else {
//         res.status(404).send("Firmware not found");
//     }
// });

// // Ruta para recibir datos de sensores
// app.post("/api/sensordata", (req, res) => {
//     const data = req.body;
//     console.log("Datos recibidos:", data);
//     res.status(200).json({ message: "Datos recibidos correctamente" });
// });

// app.listen(PORT, () => {
//     console.log(`Servidor corriendo en http://192.168.1.100:${PORT}`);
// });

// import express from "express";
// import fs from "fs";
// import multer from "multer";
// import cors from "cors";

// const app = express();
// const PORT = 3000;
// const firmwareDir = "./firmware/";
// const versionFile = "./firmware/version.txt";

// // 📌 Habilitar CORS y JSON
// app.use(cors());
// app.use(express.json());

// // 📌 Configuración de multer para recibir archivos
// const storage = multer.diskStorage({
//   destination: firmwareDir,
//   filename: (req, file, cb) => {
//     cb(null, "firmware.bin");
//   },
// });
// const upload = multer({ storage });

// // 📌 Endpoint para obtener la versión actual del firmware
// app.get("/version", (req, res) => {
//   if (fs.existsSync(versionFile)) {
//     const version = fs.readFileSync(versionFile, "utf8").trim();
//     res.send(version);
//   } else {
//     res.status(404).send("No hay versión disponible.");
//   }
// });

// // 📌 Endpoint para descargar el firmware más reciente
// app.get("/firmware", (req, res) => {
//   const firmwarePath = firmwareDir + "firmware.bin";
//   if (fs.existsSync(firmwarePath)) {
//     res.download(firmwarePath);
//   } else {
//     res.status(404).send("Firmware no encontrado.");
//   }
// });

// // 📌 Endpoint para subir un nuevo firmware
// app.post("/upload", upload.single("firmware"), (req, res) => {
//   if (!req.file) {
//     return res.status(400).send("No se subió ningún archivo.");
//   }

//   const newVersion = req.body.version;
//   if (!newVersion) {
//     return res.status(400).send("Debe proporcionar una versión.");
//   }

//   fs.writeFileSync(versionFile, newVersion);
//   res.send(`Firmware subido con éxito, nueva versión: ${newVersion}`);
// });

// // 📌 Iniciar el servidor
// app.listen(PORT, () => {
//   console.log(`Servidor OTA corriendo en http://localhost:${PORT}`);
// });

// // server.js
// import express from 'express';
// import path from 'path';
// import { fileURLToPath } from 'url';

// const app = express();
// const port = process.env.PORT || 3000;

// // Middleware para parsear JSON en el body de las peticiones
// app.use(express.json());

// // Variables para manejar rutas relativas (ES Modules)
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // Endpoint para servir el firmware binario al ESP32
// app.get('/firmware.bin', (req, res) => {
//   const firmwarePath = path.join(__dirname, 'firmware', 'firmware.bin');
//   res.sendFile(firmwarePath, (err) => {
//     if (err) {
//       console.error("Error enviando el firmware:", err);
//       res.status(500).send("Error enviando el firmware");
//     }
//   });
// });

// // Endpoint para recibir datos del ESP32
// app.post('/api/getandpushdataesp32', (req, res) => {
//   console.log("Datos recibidos del ESP32:", req.body);
//   // Aquí puedes almacenar o procesar los datos según tus necesidades
//   res.json({ status: "ok", message: "Datos recibidos" });
// });

// app.listen(port, () => {
//   console.log(`Servidor escuchando en el puerto ${port}`);
// });

// import express from "express";
// import fs from "fs";
// import path from "path";
// import { fileURLToPath } from "url";
// import { dirname } from "path";

// const app = express();
// const PORT = 3000;

// // Obtener __dirname en ES module
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);

// // 📂 Ruta del firmware
// const firmwarePath = path.join(__dirname, "firmware.bin");

// // 📡 Servir el firmware OTA
// app.get("/firmware.bin", (req, res) => {
//   if (fs.existsSync(firmwarePath)) {
//     res.sendFile(firmwarePath);
//     console.log("📤 Firmware enviado al ESP32");
//   } else {
//     res.status(404).send("❌ Firmware no encontrado");
//   }
// });

// // 🏠 Ruta principal
// app.get("/", (req, res) => {
//   res.send("Servidor OTA ESP32 activo 🚀");
// });

// // 🏃‍♂️ Iniciar el servidor
// app.listen(PORT, () => {
//   console.log(`🟢 Servidor OTA corriendo en http://localhost:${PORT}`);
// });
