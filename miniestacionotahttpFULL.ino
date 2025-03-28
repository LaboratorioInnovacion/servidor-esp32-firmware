#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <HTTPClient.h>
#include <Update.h>
#include <Arduino_JSON.h>
#include "DHT.h"

// =====================
// CONFIGURACIONES GENERALES
// =====================
#define FIRMWARE_VERSION "1.0.1"
#define DEVICE_NAME "Estacion4"

// Credenciales WiFi
const char* WIFI_SSID = "Auditorio Nodo";
const char* WIFI_PASSWORD = "auditorio.nodo";

// =====================
// BROKER PARA FIRMWARE Y OTA
// =====================
const char* MQTT_FW_HOST = "ad11f935a9c74146a4d2e647921bf024.s1.eu.hivemq.cloud";
const int MQTT_FW_PORT = 8883;
const char* MQTT_FW_USER = "Augustodelcampo97";
const char* MQTT_FW_PASS = "Augustodelcampo97";

// =====================
// ENDPOINT HTTP PARA ENVÍO DE DATOS
// =====================
// const char* HTTP_SERVER_URL = "https://next-prisma-nextauth-eight.vercel.app/api/getandpushdataesp32";
const char* HTTP_SERVER_URL = "https://estacion-node-backend-1.onrender.com/api/weather/1"; // Estacion 1
//const char* HTTP_SERVER_URL = "https://estacion-node-backend-1.onrender.com/api/weather/2"; // Estacion 2
//const char* HTTP_SERVER_URL = "https://estacion-node-backend-1.onrender.com/api/weather/3"; // Estacion 3
//const char* HTTP_SERVER_URL = "https://estacion-node-backend-1.onrender.com/api/weather/4"; // 4

// =====================
// VARIABLES GLOBALES Y CLIENTE MQTT PARA OTA
// =====================
WiFiClientSecure fwClient;
PubSubClient mqttClientFW(fwClient);
String deviceMac;

// =====================
// CONFIGURACIÓN DEL SENSOR DHT (se usa en pin 23, DHT11)
#define DHTPIN 23
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

// =====================
// VARIABLES PARA ANEMÓMETRO Y PLUVIÓMETRO
// =====================
// Anemómetro (pin 39)
int lecturaAnemo = 0, vueltasAnemo = 0, contadorEstadoAnemoA = 0, tiempoAnemo = 0, acumuladorVueltas = 0, promedioAnemo = 0;
// Pluviometro (pin 36)
int lecturaPluv = 0, contadorEstadoPluviometroA = 0, contadorEstadoPluviometroB = 0;
float acumuladorMmCaidos = 0;

// =====================
// INTERVALOS Y TIMERS
// =====================
const unsigned long INTERVALO_ENVIO = 300000;  // 5 minutos para envío vía HTTP
unsigned long ultimoEnvio = 0;

const unsigned long HEARTBEAT_INTERVAL = 60000;  // Heartbeat cada 60 segundos
unsigned long lastHeartbeat = 0;

// =====================
// FUNCIONES DE CONEXIÓN WIFI
// =====================
void connectWiFi() {
  Serial.print("Conectando a WiFi...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 20) {
    delay(500);
    Serial.print(".");
    retries++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi conectado.");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nNo se pudo conectar a WiFi. Reiniciando...");
    ESP.restart();
  }
}

// =====================
// FUNCIONES OTA (firmware/actualización) – se usa el broker de firmware
// =====================
void doOTA(const String& url) {
  Serial.println("[OTA] Iniciando descarga: " + url);
  HTTPClient http;
  http.begin(url);
  int httpCode = http.GET();
  if (httpCode == 200) {
    int contentLength = http.getSize();
    WiFiClient* stream = http.getStreamPtr();
    if (contentLength > 0 && Update.begin(contentLength)) {
      size_t written = Update.writeStream(*stream);
      if (written == contentLength && Update.end(true)) {
        Serial.println("[OTA] Actualización exitosa. Reiniciando...");
        ESP.restart();
      } else {
        Serial.println("[OTA] Error al finalizar la actualización.");
      }
    } else {
      Serial.println("[OTA] No se pudo iniciar la actualización.");
    }
  } else {
    Serial.printf("[OTA] Error HTTP code: %d\n", httpCode);
  }
  http.end();
}

// Callback para mensajes MQTT del broker de firmware
void mqttCallbackFW(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }
  // Formato esperado: "<MAC>|<URL>" o "all|<URL>"
  int sepIndex = msg.indexOf('|');
  if (sepIndex < 0) return;

  String targetId = msg.substring(0, sepIndex);
  String firmwareUrl = msg.substring(sepIndex + 1);

  // Ejecuta la OTA si el mensaje es para este dispositivo o para todos ("all")
  if ((targetId == deviceMac || targetId == "all") && firmwareUrl.startsWith("http")) {
    Serial.println("[OTA] Comando recibido para actualizar firmware.");
    doOTA(firmwareUrl);
  }
}

// Función para conectar al broker MQTT de firmware
void connectMQTTFW() {
  String willTopic = "esp32/status";
  String willMessage = String("{\"mac\":\"") + deviceMac + "\",\"name\":\"" + DEVICE_NAME + "\",\"status\":\"offline\"}";
  String clientId = "ESP32-FW-" + deviceMac;
  while (!mqttClientFW.connected()) {
    Serial.println("Conectando a MQTT (firmware)...");
    if (mqttClientFW.connect(clientId.c_str(), MQTT_FW_USER, MQTT_FW_PASS,
                             willTopic.c_str(), 0, false, willMessage.c_str())) {
      Serial.println("MQTT (firmware) conectado!");
      // Publicar estado "online" y versión de firmware
      String onlineMsg = String("{\"mac\":\"") + deviceMac + "\",\"name\":\"" + DEVICE_NAME + "\",\"status\":\"online\",\"version\":\"" + FIRMWARE_VERSION + "\"}";
      mqttClientFW.publish("esp32/status", onlineMsg.c_str(), false);
      // Suscribirse al tópico para actualizaciones OTA
      mqttClientFW.subscribe("esp32/update");
    } else {
      Serial.print("Error MQTT (firmware): ");
      Serial.println(mqttClientFW.state());
      delay(2000);
    }
  }
}

// =====================
// TAREA DE LECTURA CONTINUA DE SENSORES (anemómetro y pluviometro)
// =====================
void tareaSensores(void* parameter) {
  for (;;) {
    // Lectura del pluviometro (pin 36)
    lecturaPluv = analogRead(36);
    float factorMM = 0.277;
    if (lecturaPluv < 600) {
      contadorEstadoPluviometroB = 0;
      if (contadorEstadoPluviometroA == 0) {
        acumuladorMmCaidos += factorMM;
      }
      contadorEstadoPluviometroA++;
    } else {
      contadorEstadoPluviometroA = 0;
      if (contadorEstadoPluviometroB == 0) {
        acumuladorMmCaidos += factorMM;
      }
      contadorEstadoPluviometroB++;
    }

    // Lectura del anemómetro (pin 39)
    lecturaAnemo = analogRead(39);
    promedioAnemo += lecturaAnemo;
    if (lecturaAnemo > 600) {
      if (contadorEstadoAnemoA == 0) {
        vueltasAnemo++;
      }
      contadorEstadoAnemoA++;
    } else {
      contadorEstadoAnemoA = 0;
    }

    tiempoAnemo += 10;
    if (tiempoAnemo >= 10000) {
      promedioAnemo /= 1000;
      if (promedioAnemo > 520) {
        acumuladorVueltas = 0;
      } else {
        acumuladorVueltas = vueltasAnemo;
      }
      promedioAnemo = 0;
      vueltasAnemo = 0;
      tiempoAnemo = 0;
    }

    vTaskDelay(10 / portTICK_PERIOD_MS);
  }
}

// =====================
// TAREA DE ENVÍO DE DATOS VIA HTTP (sin envío por MQTT)
// =====================
void tareaEnvio(void* parameter) {
  for (;;) {
    unsigned long tiempoActual = millis();
    if (tiempoActual - ultimoEnvio >= INTERVALO_ENVIO) {
      ultimoEnvio = tiempoActual;

      if (WiFi.status() != WL_CONNECTED) {
        connectWiFi();
      }

      float humedad = dht.readHumidity();
      float temperatura = dht.readTemperature();

      Serial.print("Temperatura: ");
      Serial.print(temperatura);
      Serial.println("°C");

      Serial.print("Humedad: ");
      Serial.print(humedad);
      Serial.println("%");

      Serial.print("Viento (vueltas): ");
      Serial.println(acumuladorVueltas);

      Serial.print("Lluvia (mm): ");
      Serial.println(acumuladorMmCaidos);

      // Envío de datos vía HTTP
      HTTPClient http;
      http.begin(HTTP_SERVER_URL);
      http.addHeader("Content-Type", "application/json");

      JSONVar jsonData;
      // jsonData["mac"] = deviceMac;
      // jsonData["board"] = "esp32_01eva01";
      jsonData["temperature"] = String(temperatura);
      // jsonData["temperature"] = 10;
      jsonData["humidity"] = String(humedad);
      // jsonData["humidity"] = 10;
      // jsonData["anemometro"] = String(acumuladorVueltas);
      // jsonData["pluviometro"] = String(acumuladorMmCaidos);

      String postData = JSON.stringify(jsonData);
      int httpCode = http.POST(postData);

      Serial.print("httpCode: ");
      Serial.println(httpCode);
      Serial.println("--------------");

      http.end();

      // Reiniciar acumulador de lluvia tras envío
      acumuladorMmCaidos = 0;
    }
    vTaskDelay(1000 / portTICK_PERIOD_MS);
  }
}

// =====================
// SETUP Y LOOP
// =====================
void setup() {
  Serial.begin(115200);
  delay(1000);

  // Conectar a WiFi
  connectWiFi();

  // Inicializar el sensor DHT
  dht.begin();

  // Obtener la MAC del dispositivo
  deviceMac = WiFi.macAddress();
  Serial.print("MAC: ");
  Serial.println(deviceMac);

  // Configurar cliente MQTT seguro para OTA
  fwClient.setInsecure();  // Para demo; en producción se debe validar el certificado
  mqttClientFW.setServer(MQTT_FW_HOST, MQTT_FW_PORT);
  mqttClientFW.setCallback(mqttCallbackFW);
  connectMQTTFW();

  // Crear tarea para lectura continua de sensores en el core 1
  xTaskCreatePinnedToCore(tareaSensores, "TareaSensores", 10000, NULL, 1, NULL, 1);
  // Crear tarea para envío de datos vía HTTP en el core 0
  xTaskCreatePinnedToCore(tareaEnvio, "TareaEnvio", 10000, NULL, 1, NULL, 0);
}

void loop() {
  mqttClientFW.loop();

  // Reconectar si se pierde la conexión WiFi o el broker MQTT de firmware
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }
  if (!mqttClientFW.connected()) {
    connectMQTTFW();
  }

  // Enviar heartbeat vía MQTT (broker de firmware) cada HEARTBEAT_INTERVAL
  if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    lastHeartbeat = millis();
    String hbMsg = String("{\"mac\":\"") + deviceMac + "\",\"name\":\"" + DEVICE_NAME + "\",\"uptime\":" + millis() + "}";
    mqttClientFW.publish("esp32/heartbeat", hbMsg.c_str(), false);
  }

  vTaskDelay(1000 / portTICK_PERIOD_MS);
}
