# Cadence

![Cadence wearable instrument](assets/header.jpeg)

Cadence is a wearable musical interface built during MakeMIT 2026. The system combines an ESP32-based sensing glove, webcam hand tracking, and a Python real-time control pipeline to turn hand motion into notes, chords, and expressive control signals.

The project combines embedded sensor integration, signal conditioning, serial protocol design, real-time Python systems work, and a lightweight local/cloud data pipeline.

## Demo And Build Media

- [Demo video with audio](assets/demo.mp4)
- [Build-process clip](assets/build-process.mov)
- [Additional build photo](assets/build-photo.jpeg)

## Project Summary

The glove reads:

- Four flex sensors for finger bend
- A thumb pressure sensor
- Three hall-effect sensors for binary magnetic triggers
- An MPU-6050 IMU for motion and orientation

Those signals are streamed from an ESP32 to a host machine, where a Python application:

- Parses glove telemetry over serial/Bluetooth
- Tracks the hand with MediaPipe
- Fuses glove and camera signals to reduce false triggers
- Generates notes, chords, and MIDI control changes
- Logs performance sessions for replay and analysis
- Optionally streams session data into a Vultr-backed backend

## Why It Matters

Most gesture instruments fail for predictable reasons: noisy sensors, unreliable trigger logic, or fragile demo-only software. This project was built around those constraints. The design emphasizes calibration, filtering, hysteresis, fallback paths, and simple observability so the system remains usable under hackathon conditions.

## Architecture

```text
ESP32 Glove
  |- flex sensors
  |- thumb pressure sensor
  |- 3x hall-effect sensors
  |- MPU-6050 IMU
  `- serial / Bluetooth telemetry

Python Runtime
  |- FlexReader parses glove packets
  |- MediaPipe estimates hand landmarks from webcam
  |- sensor fusion combines glove bend + camera bend
  |- chord engine selects harmonic voicings
  |- MIDI / audio output layer renders performance
  `- LocalSessionLogger records sessions as JSON

Optional Cloud Path
  |- Vultr-hosted API
  |- Vultr managed PostgreSQL
  `- hosted session dashboard / ingestion service
```

## Engineering Highlights

### Embedded / hardware

- Integrated analog flex sensing, pressure sensing, digital hall sensing, and I2C IMU data on ESP32
- Built a compact serial packet format for mixed sensor telemetry
- Normalized raw sensor values into software-friendly representations
- Iterated on pin mapping and sensor wiring under tight build-time constraints

### Real-time software

- Implemented a threaded serial reader for continuous glove ingestion
- Used weighted sensor fusion between flex readings and MediaPipe hand landmarks
- Added smoothing, hysteresis, and velocity-based triggering to reduce note chatter
- Added a Madgwick-based orientation filter for stable IMU-derived control
- Logged structured session data for later playback and visualization

### Systems / product thinking

- Built local-first execution so the instrument still works offline
- Added a cloud ingestion path for remote persistence and session review
- Kept the repo modular enough to separate firmware, runtime, and dashboard concerns

## Repository Layout

```text
.
|- hand_tracking.py           # Main runtime: glove ingest, camera fusion, note generation
|- chord_library.py           # Reusable chord sequence library
|- markov.py                  # Chord progression logic
|- local_session_logger.py    # Session logging and snapshot writing
|- session_dashboard.py       # Local session review dashboard
|- live_dashboard.py          # Live telemetry dashboard
|- run.sh                     # Main launcher for local or Vultr-backed runs
|- esp32/
|  |- hackcode2.ino           # Current ESP32 glove firmware
|  `- mpu6050_bt.ino          # Earlier IMU/Bluetooth prototype
|- templates/                # Local dashboard templates
|- vultr_backend.py          # Hosted ingestion backend
|- vultr_schema.sql          # Database schema
`- sessions/                 # Saved local session logs
```

## How It Works

### 1. Glove firmware

The ESP32 firmware samples the glove sensors and transmits a compact line-oriented packet. This includes flex voltages, thumb sensor value, hall sensor states, and IMU measurements.

### 2. Sensor fusion runtime

`hand_tracking.py` runs the performance engine. It reads glove data in one thread while processing camera frames in the main loop. Finger bend is estimated from both sources, then fused to create more stable note triggers than either modality alone.

### 3. Music generation

Finger states trigger melody notes. Chord voicings come from a fixed sequence library and supporting harmonic logic. Additional sensor values are mapped to MIDI CC messages for expressive control.

### 4. Session capture

Each run can write structured session logs to `sessions/` so performances can be inspected later in a dashboard or forwarded to a cloud backend.

## Running The Project

### Prerequisites

- Python 3.10+
- `conda` or an equivalent Python environment manager
- A webcam
- An ESP32 glove flashed with the firmware in this repo
- A MIDI-capable synth or DAW if you want external MIDI playback

### Local setup

```bash
conda create -n gesture-hand python=3.11
conda activate gesture-hand
pip install -r requirements.txt
```

### Run locally

```bash
./run.sh --port /dev/cu.usbserial-0001
```

Useful flags:

- `--camera-index 1` to select a different webcam
- `--list-cameras` to probe available cameras
- `--list-midi` to inspect MIDI outputs
- `--no-dashboard` to skip the local dashboard

### Direct entry point

```bash
python3 hand_tracking.py --port /dev/cu.usbserial-0001 --camera-index 1
```

## Vultr Integration

The repo also contains a simple hosted backend path for session ingestion and review:

- `vultr_backend.py` exposes API endpoints for session start, ingest, stop, and review
- `vultr_schema.sql` defines the PostgreSQL schema
- `deploy_vultr_vm.py` and related scripts automate deployment to a Vultr VM

This part of the project demonstrates basic full-stack ownership beyond the instrument itself: device data leaves the glove, becomes structured events, and can be persisted in a hosted system.

## Key Files

- `esp32/hackcode2.ino` contains the current ESP32 glove firmware
- `hand_tracking.py` contains the main runtime for glove ingest, camera fusion, and note generation
- `chord_library.py` contains the reusable chord sequence logic
- `local_session_logger.py` writes structured session logs and live snapshots
- `vultr_backend.py` contains the hosted ingestion backend

## Current State

This is a working prototype, not a polished product. The code reflects fast iteration under hackathon constraints, but the core system is real: glove firmware, live input parsing, camera fusion, audio/MIDI control, and session logging are all implemented.

## Contact / Context

Built at MakeMIT 2026 as an exploration of wearable interfaces, embedded sensing, and real-time human-computer interaction.
