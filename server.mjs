import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const app = express();
const PORT = 3000;

// Obtener __dirname en ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 📂 Ruta del firmware
const firmwarePath = path.join(__dirname, "firmware.bin");

// 📡 Servir el firmware OTA
app.get("/firmware.bin", (req, res) => {
  if (fs.existsSync(firmwarePath)) {
    res.sendFile(firmwarePath);
    console.log("📤 Firmware enviado al ESP32");
  } else {
    res.status(404).send("❌ Firmware no encontrado");
  }
});

// 🏠 Ruta principal
app.get("/", (req, res) => {
  res.send("Servidor OTA ESP32 activo 🚀");
});

// 🏃‍♂️ Iniciar el servidor
app.listen(PORT, () => {
  console.log(`🟢 Servidor OTA corriendo en http://localhost:${PORT}`);
});
