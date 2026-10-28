#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverApi = "http://192.168.1.100:3000/api/v1/targets/nearest"; // IP вашого ПК/сервера

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected!");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverApi);
    int httpResponseCode = http.GET();
    
    if (httpResponseCode > 0) {
      String payload = http.getString();
      Serial.println(payload);
      
      DynamicJsonDocument doc(1024);
      deserializeJson(doc, payload);
      const char* targetId = doc["target_id"];
      int distance = doc["predicted_impact"]["distance_meters"];
      
      Serial.printf("Ціль: %s | Дистанція до точки удару: %d м\n", targetId, distance);
    }
    http.end();
  }
  delay(1000);
}
