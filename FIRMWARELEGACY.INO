#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <HTTPClient.h>
#include <Update.h>

// =====================
// CONFIGURACIONES
// =====================
#define FIRMWARE_VERSION "1.0.0"

// Credenciales WiFi
const char* WIFI_SSID = "PB02";
const char* WIFI_PASSWORD = "12345678";

// Broker MQTT (ejemplo: HiveMQ Cloud)
const char* MQTT_HOST = "ad11f935a9c74146a4d2e647921bf024.s1.eu.hivemq.cloud";
const int MQTT_PORT = 8883;  // TLS
const char* MQTT_USER = "Augustodelcampo97";
const char* MQTT_PASS = "Augustodelcampo97";

// =====================
// GLOBALES
// =====================
WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);

String deviceMac;

// =====================
// Función OTA
// =====================
void doOTA(const String& url) {
    HTTPClient http;
    http.begin(url);

    int httpCode = http.GET();
    if (httpCode == 200) {
        int contentLength = http.getSize();
        WiFiClient* stream = http.getStreamPtr();

        if (contentLength > 0 && Update.begin(contentLength)) {
            size_t written = Update.writeStream(*stream);
            if (written == contentLength && Update.end(true)) {
                Serial.println("Actualización OTA completada. Reiniciando...");
                ESP.restart();
            } else {
                Serial.printf("Error OTA: %s\n", Update.errorString());
            }
        } else {
            Serial.println("Error: Tamaño del contenido inválido o fallo en Update.begin.");
        }
    } else {
        Serial.printf("Error HTTP: %d\n", httpCode);
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
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nConexión WiFi establecida.");
}

// =====================
// Conexión MQTT
// =====================
void connectMQTT() {
    String willTopic = "esp32/status";
    String willMessage = String("{\"mac\":\"") + deviceMac + "\",\"status\":\"offline\"}";
    String clientId = String("ESP32-") + deviceMac;

    while (!mqttClient.connected()) {
        if (mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS, willTopic.c_str(), 0, false, willMessage.c_str())) {
            Serial.println("Conexión MQTT establecida.");

            String onlineMsg = String("{\"mac\":\"") + deviceMac + "\",\"status\":\"online\",\"version\":\"" + FIRMWARE_VERSION + "\"}";
            mqttClient.publish("esp32/status", onlineMsg.c_str(), false);
            mqttClient.subscribe("esp32/update");
        } else {
            Serial.println("Intentando reconectar al broker MQTT...");
            delay(1000);
        }
    }
}

// =====================
// SETUP
// =====================
void setup() {
    Serial.begin(115200);

    deviceMac = WiFi.macAddress();
    connectWiFi();

    espClient.setInsecure(); // TLS inseguro para pruebas
    mqttClient.setServer(MQTT_HOST, MQTT_PORT);
    mqttClient.setCallback(mqttCallback);

    connectMQTT();
}

// =====================
// LOOP
// =====================
void loop() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi desconectado. Intentando reconectar...");
        connectWiFi();
    }

    if (!mqttClient.connected()) {
        Serial.println("MQTT desconectado. Intentando reconectar...");
        connectMQTT();
    }

    mqttClient.loop();
}
