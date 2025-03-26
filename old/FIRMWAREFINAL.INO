#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <HTTPClient.h>
#include <Update.h>

// =====================
// CONFIGURACIONES
// =====================
#define FIRMWARE_VERSION "1.0.0"
#define DEVICE_NAME      "NODO"  // alias opcional

// Credenciales WiFi
const char* WIFI_SSID     = "Tplink4568";
const char* WIFI_PASSWORD = "delc@mpo4268";
// const char* WIFI_SSID     = "Tplink4568";
// const char* WIFI_PASSWORD = "delc@mpo4268";

// Broker MQTT (ej. HiveMQ Cloud)
const char* MQTT_HOST     = "ad11f935a9c74146a4d2e647921bf024.s1.eu.hivemq.cloud";
const int   MQTT_PORT     = 8883;  
const char* MQTT_USER     = "Augustodelcampo97";
const char* MQTT_PASS     = "Augustodelcampo97";

// =====================
// GLOBALES
// =====================
WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);

String deviceMac; 
String deviceName = DEVICE_NAME;

// Heartbeat
unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_INTERVAL = 60000; // 60 seg

// =====================
// Función OTA
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
// Callback MQTT
// =====================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }

  // Formato: "<MAC>|<URL>" o "all|<URL>"
  int sepIndex = msg.indexOf('|');
  if (sepIndex < 0) return;

  String targetId = msg.substring(0, sepIndex);
  String firmwareUrl = msg.substring(sepIndex + 1);

  if ((targetId == deviceMac || targetId == "all") && firmwareUrl.startsWith("http")) {
    doOTA(firmwareUrl);
  }
}

// =====================
// Conexión WiFi
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
// Conexión MQTT
// =====================
void connectMQTT() {
  // LWT: publicará {"mac":"xx","name":"xx","status":"offline"} al desconectarse
  String willTopic = "esp32/status";
  String willMessage = String("{\"mac\":\"") + deviceMac +
                       "\",\"name\":\"" + deviceName +
                       "\",\"status\":\"offline\"}";

  // Client ID
  String clientId = "ESP32-" + deviceMac;

  while (!mqttClient.connected()) {
    Serial.println("Conectando a MQTT...");
    if (mqttClient.connect(
          clientId.c_str(), 
          MQTT_USER, 
          MQTT_PASS, 
          willTopic.c_str(), 
          0,   // QoS
          false, // Retain
          willMessage.c_str()
        )) 
    {
      Serial.println("MQTT conectado!");

      // Publicar "online"
      String onlineMsg = String("{\"mac\":\"") + deviceMac +
                         "\",\"name\":\"" + deviceName +
                         "\",\"status\":\"online\",\"version\":\"" + 
                         FIRMWARE_VERSION + "\"}";
      mqttClient.publish("esp32/status", onlineMsg.c_str(), false);

      // Suscribirse al tópico de OTA
      mqttClient.subscribe("esp32/update");
    } else {
      Serial.print("Error MQTT: ");
      Serial.println(mqttClient.state());
      delay(2000);
    }
  }
}

// =====================
// Setup
// =====================
void setup() {
  Serial.begin(115200);
  delay(1000);

  // 1) Apagar WiFi
  WiFi.mode(WIFI_OFF);
  delay(100);

  // 2) Encender WiFi en modo STA
  WiFi.mode(WIFI_STA);
  delay(100);

  // 3) Leer la MAC
  deviceMac = WiFi.macAddress();
  Serial.print("MAC: ");
  Serial.println(deviceMac);

  // 4) Conectar WiFi
  connectWiFi();

  // Para demo: sin validar el certificado
  // En producción, usa setCACert(...) con el certificado raíz
  espClient.setInsecure(); 
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);

  connectMQTT();
}

// =====================
// Loop
// =====================
void loop() {
  mqttClient.loop();

  // Reintentar WiFi si se pierde
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    connectMQTT();
  }

  // Heartbeat cada 60s (opcional)
  if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    lastHeartbeat = millis();
    String hbMsg = String("{\"mac\":\"") + deviceMac +
                   "\",\"name\":\"" + deviceName + 
                   "\",\"uptime\":" + millis() + "}";
    mqttClient.publish("esp32/heartbeat", hbMsg.c_str(), false);
  }
}
