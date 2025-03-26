#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <HTTPClient.h>
#include <Update.h>

// -- Credenciales WiFi --
const char* ssid     = "PB02";
const char* password = "12345678";

// -- Credenciales HiveMQ Cloud --
const char* mqtt_server = "ad11f935a9c74146a4d2e647921bf024.s1.eu.hivemq.cloud";
const int   mqtt_port   = 8883;       
const char* mqtt_user   = "Augustodelcampo97";
const char* mqtt_pass   = "Augustodelcampo97";

// Cliente seguro
WiFiClientSecure espClient;
PubSubClient client(espClient);

// ------------------------------------------------------
// Función para realizar la OTA a partir de una URL
// ------------------------------------------------------
void doOTA(String url) {
  Serial.println("[OTA] Iniciando actualización desde: " + url);

  HTTPClient http;
  http.begin(url); 
  int httpCode = http.GET();

  if (httpCode == 200) {
    int contentLength = http.getSize();
    WiFiClient * stream = http.getStreamPtr();

    if (contentLength > 0) {
      bool canBegin = Update.begin(contentLength);
      if (canBegin) {
        size_t written = Update.writeStream(*stream);
        if (written == contentLength) {
          Serial.println("[OTA] Descarga completa. Finalizando actualización...");
          if (Update.end(true)) {
            Serial.println("[OTA] Actualización exitosa. Reiniciando...");
            ESP.restart();
          } else {
            Serial.printf("[OTA] Error al finalizar: %s\n", Update.errorString());
          }
        } else {
          Serial.println("[OTA] Error: El tamaño escrito no coincide con el tamaño total");
        }
      } else {
        Serial.println("[OTA] No se pudo iniciar la actualización");
      }
    } else {
      Serial.println("[OTA] El contenido de la respuesta está vacío o es inválido");
    }
  } else {
    Serial.printf("[OTA] Error HTTP code: %d\n", httpCode);
  }
  http.end();
}

// ------------------------------------------------------
// Callback MQTT: se ejecuta al recibir un mensaje
// ------------------------------------------------------
void callback(char* topic, byte* payload, unsigned int length) {
  Serial.print("Mensaje recibido en [");
  Serial.print(topic);
  Serial.print("]: ");

  // Convertir payload a String
  String incoming;
  for (int i = 0; i < length; i++) {
    incoming += (char)payload[i];
  }
  Serial.println(incoming);

  // Si comienza con "http", asumimos que es una URL para OTA
  if (incoming.startsWith("http")) {
    doOTA(incoming);
  } else {
    Serial.println("[INFO] Mensaje recibido (no es URL).");
  }
}

// ------------------------------------------------------
// Setup
// ------------------------------------------------------
void setup() {
  Serial.begin(115200);

  // Conectar a WiFi
  Serial.println("\nConectando a WiFi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi conectado00.");

  // Configurar conexión segura (insegura para demo).
  // En producción, usa el certificado raíz de HiveMQ en lugar de setInsecure().
  espClient.setInsecure();

  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);

  // Conexión al broker MQTT
  while (!client.connected()) {
    Serial.println("Conectando a HiveMQ Cloud...");
    if (client.connect("ESP32Client", mqtt_user, mqtt_pass)) {
      Serial.println("Conectado al broker MQTT.");
    } else {
      Serial.print("Fallo en la conexión. Estado=");
      Serial.println(client.state());
      delay(2000);
    }
  }

  // Suscribirse al tópico
  client.subscribe("esp32/update");
  Serial.println("Suscrito a: esp32/updateee");
}

// ------------------------------------------------------
// Loop principal
// ------------------------------------------------------
void loop() {
  client.loop();
}
