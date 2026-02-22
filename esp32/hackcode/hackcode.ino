#include <Wire.h>
#include "BluetoothSerial.h"

// Flex sensor pins (ADC1)
const int pointerPin = 32;
const int middlePin  = 33;
const int ringPin    = 34;
const int pinkyPin   = 35;

// Capacitive touch pin
const int thumbTouchPin = 15;

// Hall sensor pin (digital Hall module output)
const int hallPin = 27;

// MPU-6050
const uint8_t MPU_ADDR = 0x68;
const float ACCEL_SCALE = 9.80665f / 16384.0f;  // m/s^2 per LSB at +-2g
const float GYRO_SCALE  = 1.0f / 131.0f;        // deg/s per LSB at +-250 dps

BluetoothSerial SerialBT;
volatile bool btConnected = false;

void btCallback(esp_spp_cb_event_t event, esp_spp_cb_param_t *param) {
  (void)param;
  if (event == ESP_SPP_SRV_OPEN_EVT) {
    btConnected = true;
    Serial.println("BT client connected");
  } else if (event == ESP_SPP_CLOSE_EVT) {
    btConnected = false;
    Serial.println("BT client disconnected");
  }
}

void sendLine(const char *line) {
  Serial.print(line);
  if (btConnected && SerialBT.availableForWrite() >= 160) {
    SerialBT.print(line);
  }
}

void mpuWrite(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}

bool mpuInit() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x75);  // WHO_AM_I
  Wire.endTransmission(false);
  Wire.requestFrom((int)MPU_ADDR, 1);
  if (!Wire.available()) return false;
  if (Wire.read() != 0x68) return false;

  mpuWrite(0x6B, 0x01);  // PWR_MGMT_1: wake
  delay(10);
  mpuWrite(0x19, 19);    // SMPLRT_DIV -> 50Hz
  mpuWrite(0x1A, 0x03);  // DLPF
  mpuWrite(0x1B, 0x00);  // GYRO +-250
  mpuWrite(0x1C, 0x00);  // ACCEL +-2g
  return true;
}

bool mpuRead(float &ax, float &ay, float &az, float &gx, float &gy, float &gz) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);  // ACCEL_XOUT_H
  Wire.endTransmission(false);
  if (Wire.requestFrom((int)MPU_ADDR, 14) != 14) return false;

  auto read16 = []() -> int16_t {
    int16_t hi = Wire.read();
    int16_t lo = Wire.read();
    return (int16_t)((hi << 8) | lo);
  };

  int16_t axr = read16();
  int16_t ayr = read16();
  int16_t azr = read16();
  (void)read16();  // temp
  int16_t gxr = read16();
  int16_t gyr = read16();
  int16_t gzr = read16();

  ax = axr * ACCEL_SCALE;
  ay = ayr * ACCEL_SCALE;
  az = azr * ACCEL_SCALE;
  gx = gxr * GYRO_SCALE;
  gy = gyr * GYRO_SCALE;
  gz = gzr * GYRO_SCALE;
  return true;
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  pinMode(hallPin, INPUT_PULLUP);

  Wire.begin(21, 22);
  Wire.setClock(400000);

  SerialBT.register_callback(btCallback);
  SerialBT.begin("ESP32_GLOVE");

  Serial.println("ESP32 Glove + IMU Started");
  Serial.println("Bluetooth name: ESP32_GLOVE");
  Serial.println("Format: GLOVE,p,m,r,pk,thumb,hall,ax,ay,az,gx,gy,gz");

  while (!mpuInit()) {
    Serial.println("MPU6050 not found, retrying...");
    delay(300);
  }
  Serial.println("MPU6050 ready");
}

void loop() {
  // Flex + touch + hall
  const int pointerValue = analogRead(pointerPin);
  const int middleValue  = analogRead(middlePin);
  const int ringValue    = analogRead(ringPin);
  const int pinkyValue   = analogRead(pinkyPin);
  const int thumbTouchValue = touchRead(thumbTouchPin);
  const int hallValue = (digitalRead(hallPin) == LOW) ? 1 : 0;

  const float pointerVoltage = pointerValue * (3.3f / 4095.0f);
  const float middleVoltage  = middleValue  * (3.3f / 4095.0f);
  const float ringVoltage    = ringValue    * (3.3f / 4095.0f);
  const float pinkyVoltage   = pinkyValue   * (3.3f / 4095.0f);

  // IMU
  float ax = 0, ay = 0, az = 0, gx = 0, gy = 0, gz = 0;
  mpuRead(ax, ay, az, gx, gy, gz);

  char buf[196];
  snprintf(
    buf,
    sizeof(buf),
    "GLOVE,%.3f,%.3f,%.3f,%.3f,%d,%d,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f\n",
    pointerVoltage,
    middleVoltage,
    ringVoltage,
    pinkyVoltage,
    thumbTouchValue,
    hallValue,
    ax, ay, az, gx, gy, gz
  );

  sendLine(buf);
  delay(20);  // ~50 Hz
}
