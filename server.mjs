const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

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
