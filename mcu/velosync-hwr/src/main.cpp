#include <Arduino.h>
#include <ArduinoJson.h>
#include <EEPROM.h>
#include <ESP8266WiFi.h>
#include <ESPAsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <stddef.h>
#include <string.h>

#ifndef WIFI_SSID
#define WIFI_SSID "CNWIFI-F1"
#endif

#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD "ef3600acr2032"
#endif

// ── Hardware ───────────────────────────────────────────
const int reedPin    = D2;
const int ledRedPin  = D3;
const int ledBluePin = D5;

// Calibrate this to the wheel/flywheel path represented by one reed pulse.
// 2.105m is a common 700x25c bicycle wheel circumference.
const float DEFAULT_WHEEL_CIRCUMFERENCE_M = 2.105f;
const uint8_t DEFAULT_MAGNETS_PER_REV = 1;
const float MIN_WHEEL_CIRCUMFERENCE_M = 0.5f;
const float MAX_WHEEL_CIRCUMFERENCE_M = 4.0f;
const uint8_t MIN_MAGNETS_PER_REV = 1;
const uint8_t MAX_MAGNETS_PER_REV = 16;

struct HardwareConfig {
  float wheelCircumferenceM;
  uint8_t magnetsPerRev;
};

struct PersistedHardwareConfig {
  uint32_t magic;
  uint16_t version;
  uint16_t size;
  HardwareConfig config;
  uint8_t reserved[3];
  uint32_t checksum;
};

const uint32_t CONFIG_MAGIC = 0x56534346UL;
const uint16_t CONFIG_VERSION = 1;
const size_t EEPROM_SIZE = 64;

HardwareConfig hardwareConfig = {
  DEFAULT_WHEEL_CIRCUMFERENCE_M,
  DEFAULT_MAGNETS_PER_REV,
};

// Target measurement range for the indoor bike.
const float MIN_TRACKED_SPEED_KMH = 1.0f;
const float MAX_TRACKED_SPEED_KMH = 40.0f;
const float MAX_ACCEPTED_SPEED_KMH = 45.0f;

// ── Filter constants ───────────────────────────────────
const float DELTA1 = 0.5f, DELTA2 = 2.0f, DELTA3 = 5.0f;
const float ALPHA_MIN = 0.12f, ALPHA_MID = 0.35f, ALPHA_HIGH = 0.80f, ALPHA_MAX = 0.95f;
const float ALPHA_SMOOTHING = 0.70f;

const unsigned long REED_BOUNCE_US    = 5000UL;
const float         DECAY_FACTOR      = 0.92f;
const unsigned long PRINT_INTERVAL_MS = 300;
const unsigned long WEBSOCKET_INTERVAL_MS = 100;

// ── Network ─────────────────────────────────────────────
const char* AP_SSID = "VeloSync-HWR";
const char* AP_PASSWORD = "velosync";

AsyncWebServer server(80);
AsyncWebSocket speedWs("/ws/speed");

unsigned long intervalForSpeedUs(float speedKmh) {
  return (unsigned long)((hardwareConfig.wheelCircumferenceM * 3600000.0f) /
                         (speedKmh * (float)hardwareConfig.magnetsPerRev));
}

unsigned long maxUnsignedLong(unsigned long a, unsigned long b) {
  return a > b ? a : b;
}

float speedFromIntervalKmh(unsigned long intervalUs) {
  return (hardwareConfig.wheelCircumferenceM * 3600000.0f) /
         ((float)intervalUs * (float)hardwareConfig.magnetsPerRev);
}

unsigned long minValidIntervalUs = intervalForSpeedUs(MAX_ACCEPTED_SPEED_KMH);
unsigned long maxValidIntervalUs = intervalForSpeedUs(MIN_TRACKED_SPEED_KMH);
volatile unsigned long minEdgeIntervalUs = maxUnsignedLong(REED_BOUNCE_US, minValidIntervalUs);
unsigned long stopTimeoutMs = (maxValidIntervalUs * 3UL) / 2000UL;

// ── Interrupt state ────────────────────────────────────
volatile unsigned long lastPulseUs   = 0;
volatile unsigned long pulseIntervalUs = 0;
volatile bool          newPulse      = false;
volatile unsigned long bouncePulses  = 0;

// ── Filter state ───────────────────────────────────────
float    speedFiltered      = 0.0f;
float    speedSmoothed      = 0.0f;
unsigned long lastValidPulseMs = 0;
unsigned long lastValidIntervalUs = 0;
float    lastInstantSpeedKmh = 0.0f;
float    smoothedAlpha      = ALPHA_MID;
unsigned long totalPulses   = 0;
unsigned long rejectedPulses = 0;
unsigned long latestBouncePulses = 0;
unsigned long telemetrySeq = 0;
bool     restartPrimed      = false;
float    lastSpeedForDelta  = 0.0f;

struct PendingConfigUpdate {
  bool pending;
  uint32_t clientId;
  char requestId[65];
  HardwareConfig config;
};

PendingConfigUpdate pendingConfigUpdate = {};

bool isValidHardwareConfig(const HardwareConfig& config) {
  return isfinite(config.wheelCircumferenceM) &&
         config.wheelCircumferenceM >= MIN_WHEEL_CIRCUMFERENCE_M &&
         config.wheelCircumferenceM <= MAX_WHEEL_CIRCUMFERENCE_M &&
         config.magnetsPerRev >= MIN_MAGNETS_PER_REV &&
         config.magnetsPerRev <= MAX_MAGNETS_PER_REV;
}

uint32_t configChecksum(const PersistedHardwareConfig& stored) {
  const uint8_t* bytes = reinterpret_cast<const uint8_t*>(&stored);
  uint32_t checksum = 2166136261UL;
  for (size_t i = 0; i < offsetof(PersistedHardwareConfig, checksum); ++i) {
    checksum ^= bytes[i];
    checksum *= 16777619UL;
  }
  return checksum;
}

bool persistHardwareConfig(const HardwareConfig& config) {
  PersistedHardwareConfig stored = {};
  stored.magic = CONFIG_MAGIC;
  stored.version = CONFIG_VERSION;
  stored.size = sizeof(PersistedHardwareConfig);
  stored.config = config;
  stored.checksum = configChecksum(stored);
  EEPROM.put(0, stored);
  return EEPROM.commit();
}

void resetMeasurementForConfig() {
  minValidIntervalUs = intervalForSpeedUs(MAX_ACCEPTED_SPEED_KMH);
  maxValidIntervalUs = intervalForSpeedUs(MIN_TRACKED_SPEED_KMH);
  stopTimeoutMs = (maxValidIntervalUs * 3UL) / 2000UL;
  unsigned long nextMinEdgeIntervalUs =
    maxUnsignedLong(REED_BOUNCE_US, minValidIntervalUs);

  noInterrupts();
  minEdgeIntervalUs = nextMinEdgeIntervalUs;
  lastPulseUs = 0;
  pulseIntervalUs = 0;
  newPulse = false;
  interrupts();

  speedFiltered = 0.0f;
  speedSmoothed = 0.0f;
  lastValidPulseMs = 0;
  lastValidIntervalUs = 0;
  lastInstantSpeedKmh = 0.0f;
  smoothedAlpha = ALPHA_MID;
  restartPrimed = false;
  lastSpeedForDelta = 0.0f;
}

void applyHardwareConfig(const HardwareConfig& config) {
  hardwareConfig = config;
  resetMeasurementForConfig();
}

void loadHardwareConfig() {
  EEPROM.begin(EEPROM_SIZE);
  PersistedHardwareConfig stored = {};
  EEPROM.get(0, stored);

  bool valid = stored.magic == CONFIG_MAGIC &&
               stored.version == CONFIG_VERSION &&
               stored.size == sizeof(PersistedHardwareConfig) &&
               stored.checksum == configChecksum(stored) &&
               isValidHardwareConfig(stored.config);
  if (valid) {
    applyHardwareConfig(stored.config);
    Serial.println("Loaded hardware configuration from EEPROM.");
  } else {
    resetMeasurementForConfig();
    Serial.println("Using default hardware configuration.");
  }
}

// ── ISR ────────────────────────────────────────────────
void IRAM_ATTR sensorISR() {
  unsigned long now = micros();

  if (lastPulseUs == 0) {
    lastPulseUs = now;
    return;
  }

  unsigned long diff = now - lastPulseUs;
  if (diff >= minEdgeIntervalUs) {
    pulseIntervalUs = diff;
    lastPulseUs = now;
    newPulse = true;
  } else {
    bouncePulses++;
  }
}

// ── Filters ────────────────────────────────────────────
float calcAlpha(float curr, float prev) {
  float d = fabs(curr - prev);
  if (d < DELTA1) return ALPHA_MIN;
  if (d < DELTA2) return ALPHA_MIN + ((d - DELTA1)/(DELTA2 - DELTA1)) * (ALPHA_MID - ALPHA_MIN);
  if (d < DELTA3) return ALPHA_MID + ((d - DELTA2)/(DELTA3 - DELTA2)) * (ALPHA_HIGH - ALPHA_MID);
  return ALPHA_MAX;
}

float smoothAlpha(float desired) {
  if (desired >= ALPHA_MAX) { smoothedAlpha = desired; return desired; }
  smoothedAlpha = ALPHA_SMOOTHING * desired + (1.0f - ALPHA_SMOOTHING) * smoothedAlpha;
  return smoothedAlpha;
}

// ── Web API ─────────────────────────────────────────────
void buildTelemetryJson(char* buffer, size_t bufferSize, unsigned long nowMs) {
  unsigned long pulseAgeMs = lastValidPulseMs > 0 ? nowMs - lastValidPulseMs : 0;
  unsigned long intervalMs = lastValidIntervalUs > 0 ? lastValidIntervalUs / 1000UL : 0;
  bool stopped = speedFiltered < MIN_TRACKED_SPEED_KMH;

  snprintf(buffer, bufferSize,
           "{\"type\":\"speed\",\"version\":1,\"seq\":%lu,\"timestampMs\":%lu,"
           "\"speedKmh\":%.2f,\"instantSpeedKmh\":%.2f,"
           "\"pulseIntervalMs\":%lu,\"pulseAgeMs\":%lu,\"stopped\":%s,"
           "\"wheelCircumferenceM\":%.3f,\"magnetsPerRev\":%u,"
           "\"counters\":{\"accepted\":%lu,\"rejected\":%lu,\"bounce\":%lu}}",
           telemetrySeq++, nowMs, speedFiltered, lastInstantSpeedKmh,
           intervalMs, pulseAgeMs, stopped ? "true" : "false",
           hardwareConfig.wheelCircumferenceM, hardwareConfig.magnetsPerRev,
           totalPulses, rejectedPulses, latestBouncePulses);
}

void sendTelemetry(AsyncWebSocketClient* client = nullptr) {
  char payload[384];
  buildTelemetryJson(payload, sizeof(payload), millis());

  if (client != nullptr) {
    client->text(payload);
  } else {
    speedWs.textAll(payload);
  }
}

void sendConfigResult(AsyncWebSocketClient* client,
                      const char* requestId,
                      bool ok,
                      const char* errorCode = nullptr,
                      const char* errorMessage = nullptr) {
  JsonDocument response;
  response["type"] = "configResult";
  response["version"] = 1;
  response["requestId"] = requestId;
  response["ok"] = ok;
  if (ok) {
    response["wheelCircumferenceM"] = hardwareConfig.wheelCircumferenceM;
    response["magnetsPerRev"] = hardwareConfig.magnetsPerRev;
  } else {
    response["error"]["code"] = errorCode;
    response["error"]["message"] = errorMessage;
  }

  String payload;
  serializeJson(response, payload);
  client->text(payload);
}

void handleConfigMessage(AsyncWebSocketClient* client, uint8_t* data, size_t len) {
  JsonDocument command;
  DeserializationError parseError = deserializeJson(command, data, len);
  if (parseError) {
    sendConfigResult(client, "", false, "invalid_json", "Message must be valid JSON.");
    return;
  }

  const char* requestId = command["requestId"] | "";
  if (strlen(requestId) == 0) {
    sendConfigResult(client, "", false, "missing_request_id", "requestId is required.");
    return;
  }
  if (strlen(requestId) >= sizeof(pendingConfigUpdate.requestId)) {
    sendConfigResult(client, "", false, "invalid_request_id",
                     "requestId must be 64 characters or fewer.");
    return;
  }
  if (strcmp(command["type"] | "", "setConfig") != 0 || command["version"] != 1) {
    sendConfigResult(client, requestId, false, "unsupported_message",
                     "Expected a setConfig message with version 1.");
    return;
  }
  if (!command["wheelCircumferenceM"].is<float>() ||
      !command["magnetsPerRev"].is<int>()) {
    sendConfigResult(client, requestId, false, "invalid_config",
                     "wheelCircumferenceM and magnetsPerRev are required numbers.");
    return;
  }

  int magnetsPerRev = command["magnetsPerRev"].as<int>();
  HardwareConfig nextConfig = {
    roundf(command["wheelCircumferenceM"].as<float>() * 1000.0f) / 1000.0f,
    static_cast<uint8_t>(magnetsPerRev),
  };
  if (magnetsPerRev < MIN_MAGNETS_PER_REV ||
      magnetsPerRev > MAX_MAGNETS_PER_REV ||
      !isValidHardwareConfig(nextConfig)) {
    sendConfigResult(client, requestId, false, "out_of_range",
                     "Wheel circumference must be 0.5-4.0 m and magnets per revolution 1-16.");
    return;
  }

  bool changed =
    nextConfig.wheelCircumferenceM != hardwareConfig.wheelCircumferenceM ||
    nextConfig.magnetsPerRev != hardwareConfig.magnetsPerRev;
  if (!changed) {
    sendConfigResult(client, requestId, true);
    return;
  }
  if (pendingConfigUpdate.pending) {
    sendConfigResult(client, requestId, false, "device_busy",
                     "Another configuration update is being saved.");
    return;
  }

  pendingConfigUpdate.clientId = client->id();
  strncpy(pendingConfigUpdate.requestId, requestId,
          sizeof(pendingConfigUpdate.requestId) - 1);
  pendingConfigUpdate.requestId[sizeof(pendingConfigUpdate.requestId) - 1] = '\0';
  pendingConfigUpdate.config = nextConfig;
  pendingConfigUpdate.pending = true;
}

void processPendingConfigUpdate() {
  if (!pendingConfigUpdate.pending) return;

  PendingConfigUpdate update = pendingConfigUpdate;
  pendingConfigUpdate.pending = false;
  AsyncWebSocketClient* client = speedWs.client(update.clientId);

  if (!persistHardwareConfig(update.config)) {
    if (client != nullptr) {
      sendConfigResult(client, update.requestId, false, "persistence_failed",
                       "The device could not save the configuration.");
    }
    return;
  }

  applyHardwareConfig(update.config);
  if (client != nullptr) {
    sendConfigResult(client, update.requestId, true);
  }
  sendTelemetry();
}

void onSpeedWsEvent(AsyncWebSocket* server,
                    AsyncWebSocketClient* client,
                    AwsEventType type,
                    void* arg,
                    uint8_t* data,
                    size_t len) {
  (void)server;
  if (type == WS_EVT_CONNECT) {
    sendTelemetry(client);
  } else if (type == WS_EVT_DATA) {
    AwsFrameInfo* frame = static_cast<AwsFrameInfo*>(arg);
    if (frame->opcode != WS_TEXT || !frame->final || frame->index != 0 ||
        frame->len != len) {
      if (frame->index == 0) {
        sendConfigResult(client, "", false, "unsupported_frame",
                         "Configuration commands must be one complete text frame.");
      }
      return;
    }
    handleConfigMessage(client, data, len);
  }
}

void setupWiFi() {
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);

  if (strlen(WIFI_SSID) > 0) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    Serial.printf("Connecting to Wi-Fi SSID '%s'", WIFI_SSID);
    unsigned long startedMs = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startedMs < 12000UL) {
      delay(250);
      Serial.print(".");
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
      String localIp = WiFi.localIP().toString();
      Serial.printf("Wi-Fi connected in STA mode to '%s'\n", WIFI_SSID);
      Serial.printf("STA IP address: %s\n", localIp.c_str());
      Serial.printf("Device URL: http://%s/\n", localIp.c_str());
      return;
    }

    Serial.println("Wi-Fi connection failed; starting access point instead.");
  }

  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASSWORD);
  Serial.printf("Access point started: SSID '%s', password '%s'\n", AP_SSID, AP_PASSWORD);
  Serial.printf("Device URL: http://%s/\n", WiFi.softAPIP().toString().c_str());
}

void setupWebApi() {
  speedWs.onEvent(onSpeedWsEvent);
  server.addHandler(&speedWs);

  server.on("/", HTTP_GET, [](AsyncWebServerRequest* request) {
    request->send(200, "text/plain",
                  "VeloSync HW\nWebSocket: ws://<device-ip>/ws/speed\nHTTP snapshot: /api/speed\n");
  });

  server.on("/api/speed", HTTP_GET, [](AsyncWebServerRequest* request) {
    char payload[384];
    buildTelemetryJson(payload, sizeof(payload), millis());
    request->send(200, "application/json", payload);
  });

  server.begin();
  Serial.println("HTTP/WebSocket API started on port 80");
}

// ── SETUP ───────────────────────────────────────────────
void setup() {
  pinMode(reedPin, INPUT_PULLUP);
  pinMode(ledRedPin, OUTPUT);
  pinMode(ledBluePin, OUTPUT);
  digitalWrite(ledRedPin, HIGH);
  digitalWrite(ledBluePin, LOW);

  Serial.begin(115200);
  delay(300);

  loadHardwareConfig();
  setupWiFi();
  setupWebApi();

  attachInterrupt(digitalPinToInterrupt(reedPin), sensorISR, FALLING);

  Serial.println();
  Serial.println("=== VeloSync HW v1.4 ===");
  Serial.printf("Wheel: %.3fm | Magnets: %u | Range: %.0f-%.0f km/h\n",
                hardwareConfig.wheelCircumferenceM, hardwareConfig.magnetsPerRev,
                MIN_TRACKED_SPEED_KMH, MAX_TRACKED_SPEED_KMH);
  Serial.printf("Valid pulse interval: %lums-%lums | Debounce: %lums\n",
                minValidIntervalUs / 1000UL,
                maxValidIntervalUs / 1000UL,
                REED_BOUNCE_US / 1000UL);
  Serial.println("Speed     | Pulses (ok/rej/bounce)");
}

// ── LOOP ────────────────────────────────────────────────
void loop() {
  static unsigned long lastPrintMs    = 0;
  static unsigned long blueOnMs       = 0;
  static unsigned long lastDecayMs     = 0;
  static unsigned long lastWebSocketMs = 0;

  processPendingConfigUpdate();

  // ── Atomically grab pulse data ───────────────────────
  noInterrupts();
  bool gotPulse = newPulse;
  unsigned long interval = pulseIntervalUs;
  unsigned long bounceCount = bouncePulses;
  newPulse = false;
  interrupts();
  latestBouncePulses = bounceCount;
  unsigned long nowMs = millis();

  // ── Process pulse ────────────────────────────────────
  if (gotPulse && interval > 0) {
    float instantSpeedKmh = speedFromIntervalKmh(interval);
    bool stoppedBeforePulse = speedFiltered < MIN_TRACKED_SPEED_KMH;

    if (interval >= minValidIntervalUs && interval <= maxValidIntervalUs) {
      lastValidIntervalUs = interval;

      if (stoppedBeforePulse && !restartPrimed) {
        restartPrimed = true;
        lastSpeedForDelta = 0.0f;
        lastInstantSpeedKmh = 0.0f;
        lastValidPulseMs = nowMs;
      } else {
        float alpha = calcAlpha(instantSpeedKmh, lastSpeedForDelta);
        alpha = stoppedBeforePulse ? ALPHA_MIN : smoothAlpha(alpha);
        lastSpeedForDelta = instantSpeedKmh;
        lastInstantSpeedKmh = instantSpeedKmh;

        if (speedSmoothed == 0.0f) {
          speedSmoothed = instantSpeedKmh * alpha;
        } else {
          speedSmoothed = alpha * instantSpeedKmh + (1.0f - alpha) * speedSmoothed;
        }

        speedFiltered = speedSmoothed;
        lastValidPulseMs = nowMs;
        lastDecayMs = nowMs;
        restartPrimed = false;
      }

      totalPulses++;

      // Blue flash
      digitalWrite(ledBluePin, HIGH);
      blueOnMs = nowMs;
    } else {
      rejectedPulses++;
      if (stoppedBeforePulse && interval > maxValidIntervalUs) {
        restartPrimed = true;
      }
    }
  }

  // ── Decay ─────────────────────────────────────────────
  unsigned long since = nowMs - lastValidPulseMs;
  unsigned long staleMs = lastValidIntervalUs > 0
                            ? max((lastValidIntervalUs * 3UL) / 2000UL, 1500UL)
                            : 1500UL;
  if (lastValidPulseMs > 0 && since > stopTimeoutMs) {
    speedFiltered = 0.0f;
    speedSmoothed = 0.0f;
    lastInstantSpeedKmh = 0.0f;
    restartPrimed = false;
  } else if (lastValidPulseMs > 0 && since > staleMs &&
             speedFiltered > 0.0f && (nowMs - lastDecayMs) >= PRINT_INTERVAL_MS) {
    speedFiltered *= DECAY_FACTOR;
    speedSmoothed = speedFiltered;
    lastDecayMs = nowMs;
    if (speedFiltered < MIN_TRACKED_SPEED_KMH) {
      speedFiltered = 0.0f;
      speedSmoothed = 0.0f;
      lastInstantSpeedKmh = 0.0f;
      restartPrimed = false;
    }
  }

  // ── Blue LED off after 40ms ───────────────────────────
  if (digitalRead(ledBluePin) == HIGH && (nowMs - blueOnMs > 40)) {
    digitalWrite(ledBluePin, LOW);
  }

  // ── Red LED: on when stopped ──────────────────────────
  digitalWrite(ledRedPin, speedFiltered < MIN_TRACKED_SPEED_KMH ? HIGH : LOW);

  // ── Serial print ──────────────────────────────────────
  if (nowMs - lastPrintMs >= PRINT_INTERVAL_MS) {
    lastPrintMs = nowMs;
    Serial.printf("%5.1f km/h | %lu / %lu / %lu\n",
                  speedFiltered, totalPulses, rejectedPulses, bounceCount);
  }

  if (nowMs - lastWebSocketMs >= WEBSOCKET_INTERVAL_MS) {
    lastWebSocketMs = nowMs;
    speedWs.cleanupClients();
    if (speedWs.count() > 0) {
      sendTelemetry();
    }
  }
}
