// server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const port = process.env.PORT || 3000;

// Middleware para parsear JSON en el body de las peticiones
app.use(express.json());

// Variables para manejar rutas relativas (ES Modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Endpoint para servir el firmware binario al ESP32
app.get('/firmware.bin', (req, res) => {
  const firmwarePath = path.join(__dirname, 'firmware', 'firmware.bin');
  res.sendFile(firmwarePath, (err) => {
    if (err) {
      console.error("Error enviando el firmware:", err);
      res.status(500).send("Error enviando el firmware");
    }
  });
});

// Endpoint para recibir datos del ESP32
app.post('/api/getandpushdataesp32', (req, res) => {
  console.log("Datos recibidos del ESP32:", req.body);
  // Aquí puedes almacenar o procesar los datos según tus necesidades
  res.json({ status: "ok", message: "Datos recibidos" });
});

app.listen(port, () => {
  console.log(`Servidor escuchando en el puerto ${port}`);
});

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
