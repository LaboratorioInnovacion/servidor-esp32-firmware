import express from 'express';
import fileUpload from 'express-fileupload';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Configuración para obtener __dirname en ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000; // Usar el puerto proporcionado por Render o 3000 como fallback

// Middleware para parsear JSON y manejar archivos
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({
  createParentPath: true
}));

// Directorio para almacenar firmware
const firmwareDir = path.join(__dirname, 'firmware');
if (!fs.existsSync(firmwareDir)) {
  fs.mkdirSync(firmwareDir, { recursive: true });
}

// Configuración de versión actual
let currentVersion = "1.0.0";
const versionFilePath = path.join(firmwareDir, 'version.txt');
const firmwareFilePath = path.join(firmwareDir, 'firmware.bin');

// Cargar versión si existe
if (fs.existsSync(versionFilePath)) {
  currentVersion = fs.readFileSync(versionFilePath, 'utf8').trim();
}

// Endpoint para obtener la versión actual
app.get('/firmware/version', (req, res) => {
  res.send(currentVersion);
  console.log(`Versión solicitada: ${currentVersion}`);
});

// Endpoint para descargar la imagen del firmware
app.get('/firmware/image', (req, res) => {
  if (fs.existsSync(firmwareFilePath)) {
    console.log('Firmware solicitado');
    res.download(firmwareFilePath);
  } else {
    res.status(404).send('Firmware no encontrado');
  }
});

// Dashboard para administración
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>ESP32 OTA Server</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #333; }
        .form { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        label { display: block; margin-bottom: 10px; }
        input { margin-bottom: 15px; }
        button { background: #4CAF50; color: white; padding: 10px 15px; border: none; cursor: pointer; }
        .info { background: #f9f9f9; padding: 15px; border-radius: 5px; }
      </style>
    </head>
    <body>
      <h1>ESP32 OTA Update Server</h1>
      
      <div class="info">
        <h2>Versión actual: ${currentVersion}</h2>
        <p>Firmware: ${fs.existsSync(firmwareFilePath) ? 'Disponible' : 'No disponible'}</p>
      </div>
      
      <div class="form">
        <h2>Actualizar versión</h2>
        <form action="/update-version" method="post">
          <label>Nueva versión:</label>
          <input type="text" name="version" required value="${currentVersion}">
          <button type="submit">Actualizar versión</button>
        </form>
      </div>
      
      <div class="form">
        <h2>Subir nuevo firmware</h2>
        <form action="/upload-firmware" method="post" enctype="multipart/form-data">
          <label>Archivo de firmware (.bin):</label>
          <input type="file" name="firmware" accept=".bin" required>
          <button type="submit">Subir firmware</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// Endpoint para actualizar la versión
app.post('/update-version', (req, res) => {
  const { version } = req.body;
  if (!version) {
    return res.status(400).send('Versión no especificada');
  }
  
  fs.writeFileSync(versionFilePath, version);
  currentVersion = version;
  console.log(`Versión actualizada a: ${version}`);
  
  res.redirect('/');
});

// Endpoint para subir firmware
app.post('/upload-firmware', (req, res) => {
  if (!req.files || !req.files.firmware) {
    return res.status(400).send('No se ha subido ningún archivo');
  }
  
  const firmwareFile = req.files.firmware;
  
  // Guardar archivo
  firmwareFile.mv(firmwareFilePath, (err) => {
    if (err) {
      return res.status(500).send(err);
    }
    
    console.log(`Firmware actualizado: ${firmwareFile.name}`);
    res.redirect('/');
  });
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`Servidor OTA ejecutándose en puerto ${port}`);
});
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
