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
#define FIRMWARE_VERSION "1.0.4"
#define DEVICE_NAME      "Estacion4VerlogsPruebWebsocket"

// Credenciales WiFi (compartidas para ambos brokers)
const char* WIFI_SSID     = "Tplink4568";
const char* WIFI_PASSWORD = "delc@mpo4268";

// =====================
// BROKER PARA FIRMWARE Y OTA
// =====================
const char* MQTT_FW_HOST = "ad11f935a9c74146a4d2e647921bf024.s1.eu.hivemq.cloud";
const int   MQTT_FW_PORT = 8883;
const char* MQTT_FW_USER = "Augustodelcampo97";
const char* MQTT_FW_PASS = "Augustodelcampo97";

// =====================
// BROKER PARA DATOS DE ESTACIÓN METEOROLÓGICA
// =====================
const char* MQTT_DATA_HOST = "5b89b77699514c54af8285b7c1b73dd1.s1.eu.hivemq.cloud";  // Reemplaza con el host de tu segundo broker
const int   MQTT_DATA_PORT = 8883;                      // Reemplaza con el puerto correspondiente
const char* MQTT_DATA_USER = "Augustodelcampo97";             // Reemplaza con el usuario
const char* MQTT_DATA_PASS = "Augustodelcampo97";            // Reemplaza con la contraseña

// =====================
// VARIABLES GLOBALES Y CLIENTES MQTT
// =====================

// Para firmware/OTA:
WiFiClientSecure fwClient;
PubSubClient mqttClientFW(fwClient);

// Para datos meteorológicos:
WiFiClientSecure dataClient;
PubSubClient mqttClientData(dataClient);

String deviceMac;
String deviceName = DEVICE_NAME;

unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_INTERVAL = 60000; // 60 segundos

// =====================
// CONFIGURACIÓN DEL SENSOR DHT
// =====================
#define DHTPIN 23
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

// =====================
// VARIABLES PARA ANEMÓMETRO Y PLUVIÓMETRO
// =====================
// Anemómetro:
int lecturaAnemo = 0, vueltasAnemo = 0, contadorEstadoAnemoA = 0, tiempoAnemo = 0, acumuladorVueltas = 0, promedioAnemo = 0;
// Pluviometro:
int lecturaPluv = 0, contadorEstadoPluviometroA = 0, contadorEstadoPluviometroB = 0;
float acumuladorMmCaidos = 0;

// Intervalo de envío de datos (5 minutos)
const unsigned long INTERVALO_ENVIO = 300000;
unsigned long ultimoEnvio = 0;

TaskHandle_t tareaEnvioHandle = NULL;

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
        Serial.println("[OTA] Error al finalizar actualización.");
      }
    } else {
      Serial.println("[OTA] No se pudo iniciar la actualización.");
    }
  } else {
    Serial.printf("[OTA] Error HTTP code: %d\n", httpCode);
  }
  http.end();
}

// =====================
// CALLBACK MQTT PARA BROKER DE FIRMWARE
// =====================
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
  
  if ((targetId == deviceMac || targetId == "all") && firmwareUrl.startsWith("http")) {
    doOTA(firmwareUrl);
  }
}

// =====================
// CONEXIÓN WIFI
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
    Serial.println("\nNo se pudo conectar. Reiniciando...");
    ESP.restart();
  }
}

// =====================
// CONEXIÓN MQTT – Broker de Firmware/OTA
// =====================
void connectMQTTFW() {
  String willTopic = "esp32/status";
  String willMessage = String("{\"mac\":\"") + deviceMac +
                       "\",\"name\":\"" + deviceName +
                       "\",\"status\":\"offline\"}";
  String clientId = "ESP32-FW-" + deviceMac;
  while (!mqttClientFW.connected()) {
    Serial.println("Conectando a MQTT (firmware)...");
    if (mqttClientFW.connect(clientId.c_str(), MQTT_FW_USER, MQTT_FW_PASS,
                             willTopic.c_str(), 0, false, willMessage.c_str())) {
      Serial.println("MQTT (firmware) conectado!");
      // Publicar estado "online"
      String onlineMsg = String("{\"mac\":\"") + deviceMac +
                         "\",\"name\":\"" + deviceName +
                         "\",\"status\":\"online\",\"version\":\"" + FIRMWARE_VERSION + "\"}";
      mqttClientFW.publish("esp32/status", onlineMsg.c_str(), false);
      // Suscribirse al tópico de OTA
      mqttClientFW.subscribe("esp32/update");
    } else {
      Serial.print("Error MQTT (firmware): ");
      Serial.println(mqttClientFW.state());
      delay(2000);
    }
  }
}

// =====================
// CONEXIÓN MQTT – Broker de Datos (Estación Meteorológica)
 // =====================
void connectMQTTData() {
  String clientId = "ESP32-Data-" + deviceMac;
  while (!mqttClientData.connected()) {
    Serial.println("Conectando a MQTT (datos)...");
    if (mqttClientData.connect(clientId.c_str(), MQTT_DATA_USER, MQTT_DATA_PASS)) {
      Serial.println("MQTT (datos) conectado!");
      // Aquí podrías suscribirte a tópicos si lo requieres, pero generalmente se usa solo para publicar.
    } else {
      Serial.print("Error MQTT (datos): ");
      Serial.println(mqttClientData.state());
      delay(2000);
    }
  }
}

// =====================
// FUNCIONES DE LOS SENSORES
// =====================

// Pluviometro: lectura en pin 36
float pluviometro() {
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
  return acumuladorMmCaidos;
}

// Anemómetro: lectura en pin 39
float anemometroV2() {
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
  return acumuladorVueltas;
}

// Tarea para lectura continua de sensores
void tareaSensores(void * parameter) {
  for (;;) {
    pluviometro();
    anemometroV2();
    vTaskDelay(10 / portTICK_PERIOD_MS);
  }
}

// Tarea para enviar datos de sensores vía HTTP y publicar por MQTT (broker de datos)
void tareaEnvio(void * parameter) {
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
      
      // Aquí se realiza el envío vía HTTP (como en tu código original)
      HTTPClient http;
      http.begin("https://next-prisma-nextauth-eight.vercel.app/api/getandpushdataesp32");
      http.addHeader("Content-Type", "application/json");
      
      JSONVar jsonData;
      jsonData["mac"] = deviceMac;
      jsonData["board"] = "esp32_01eva01";
      jsonData["temperature"] = String(temperatura);
      jsonData["humidity"] = String(humedad);
      jsonData["anemometro"] = String(acumuladorVueltas);
      jsonData["pluviometro"] = String(acumuladorMmCaidos);
      
      String postData = JSON.stringify(jsonData);
      int httpCode = http.POST(postData);
      
      Serial.print("httpCode: ");
      Serial.println(httpCode);
      Serial.println("--------------");
      
      http.end();
      
      // Publicar datos en el broker de datos
      String dataMsg = String("{\"mac\":\"") + deviceMac +
                       "\",\"temperature\":\"" + String(temperatura) +
                       "\",\"humidity\":\"" + String(humedad) +
                       "\",\"anemometro\":\"" + String(acumuladorVueltas) +
                       "\",\"pluviometro\":\"" + String(acumuladorMmCaidos) + "\"}";
      mqttClientData.publish("esp32/data", dataMsg.c_str(), false);
      
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
  
  // Obtener la MAC del dispositivo
  deviceMac = WiFi.macAddress();
  Serial.print("MAC: ");
  Serial.println(deviceMac);
  
  // Configurar clientes MQTT:
  // Para firmware/OTA
  fwClient.setInsecure();  // Para demo; en producción valida el certificado
  mqttClientFW.setServer(MQTT_FW_HOST, MQTT_FW_PORT);
  mqttClientFW.setCallback(mqttCallbackFW);
  connectMQTTFW();
  
  // Para datos
  dataClient.setInsecure();
  mqttClientData.setServer(MQTT_DATA_HOST, MQTT_DATA_PORT);
  connectMQTTData();
  
  // Inicializar sensor DHT
  dht.begin();
  
  // Configurar resolución analógica
  analogReadResolution(10);
  
  // Crear tarea para lectura de sensores en core 1
  xTaskCreatePinnedToCore(tareaSensores, "TareaSensores", 10000, NULL, 1, NULL, 1);
  // Crear tarea para envío de datos en core 0
  xTaskCreatePinnedToCore(tareaEnvio, "TareaEnvio", 10000, NULL, 1, &tareaEnvioHandle, 0);
}

void loop() {
  mqttClientFW.loop();
  mqttClientData.loop();
  
  // Reconectar si se pierde WiFi o cualquiera de los brokers
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }
  if (!mqttClientFW.connected()) {
    connectMQTTFW();
  }
  if (!mqttClientData.connected()) {
    connectMQTTData();
  }
  
  // Enviar heartbeat por el broker de firmware cada HEARTBEAT_INTERVAL
  if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    lastHeartbeat = millis();
    String hbMsg = String("{\"mac\":\"") + deviceMac +
                   "\",\"name\":\"" + deviceName +
                   "\",\"uptime\":" + millis() + "}";
    mqttClientFW.publish("esp32/heartbeat", hbMsg.c_str(), false);
  }
  
  vTaskDelay(1000 / portTICK_PERIOD_MS);
}
