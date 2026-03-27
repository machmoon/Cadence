import express from "express";
import next from "next";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";

const PORT = Number(process.env.CADENCE_SOCKET_PORT || 8787);
const DUMMY_MODE = process.argv.includes("--dummy") || process.env.CADENCE_DUMMY === "1";
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(serverDir, "..");
const rootDir = path.resolve(serverDir, "../..");
const sessionsDir = path.join(rootDir, "sessions");
const snapshotPath = path.join(sessionsDir, "_current.json");
const dev = process.env.NODE_ENV !== "production";
const nextApp = next({ dev, dir: projectDir });
const handle = nextApp.getRequestHandler();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*"
  }
});

function energyFromTelemetry(samples) {
  if (!samples.length) return 0;
  const total = samples.reduce((sum, sample) => {
    return sum + Math.abs(sample.accel_x) + Math.abs(sample.accel_y) + Math.abs(sample.accel_z);
  }, 0);
  return Math.min(1, total / (samples.length * 6));
}

function hashSession(session) {
  const payload = JSON.stringify({
    session_id: session.session_id,
    start_timestamp: session.start_timestamp,
    event_count: session.event_count,
    metadata: session.metadata || {}
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function normalizeSession(session) {
  const imuEvents = (session.events || [])
    .filter((event) => event.type === "imu_data" && event.data)
    .slice(-72)
    .map((event) => ({
      t: event.timestamp,
      accel_x: Number(event.data.accel_x || 0),
      accel_y: Number(event.data.accel_y || 0),
      accel_z: Number(event.data.accel_z || 0),
      gyro_x: Number(event.data.gyro_x || 0),
      gyro_y: Number(event.data.gyro_y || 0),
      gyro_z: Number(event.data.gyro_z || 0)
    }));

  const latest = imuEvents[imuEvents.length - 1] || {
    accel_x: 0,
    accel_y: 0,
    accel_z: 0,
    gyro_x: 0,
    gyro_y: 0,
    gyro_z: 0
  };

  const halls = {
    hall1: Number(session.metadata?.hall1 || session.metadata?.hall?.hall1 || 0),
    hall2: Number(session.metadata?.hall2 || session.metadata?.hall?.hall2 || 0),
    hall3: Number(session.metadata?.hall3 || session.metadata?.hall?.hall3 || 0)
  };

  const fingers = {
    pointer: Number(session.metadata?.fingers?.pointer || 0),
    middle: Number(session.metadata?.fingers?.middle || 0),
    ring: Number(session.metadata?.fingers?.ring || 0),
    pinky: Number(session.metadata?.fingers?.pinky || 0)
  };

  const motion = {
    pitch_deg: Number(session.metadata?.motion?.pitch_deg || 0),
    accel_x: Number(session.metadata?.motion?.accel_x || latest.accel_x || 0),
    accel_y: Number(session.metadata?.motion?.accel_y || latest.accel_y || 0),
    accel_z: Number(session.metadata?.motion?.accel_z || latest.accel_z || 0),
    gyro_x: Number(session.metadata?.motion?.gyro_x || latest.gyro_x || 0),
    gyro_y: Number(session.metadata?.motion?.gyro_y || latest.gyro_y || 0),
    gyro_z: Number(session.metadata?.motion?.gyro_z || latest.gyro_z || 0)
  };

  const music = {
    chord: session.metadata?.music?.chord || "Imaj7",
    activeNotes: Number(session.metadata?.music?.active_notes || 0),
    mode: session.metadata?.music?.mode || "fusion"
  };

  return {
    sessionId: session.session_id || "waiting",
    performerId: session.metadata?.performer_id || "guest",
    fingerprint: hashSession(session),
    eventCount: Number(session.event_count || (session.events || []).length || 0),
    energy: energyFromTelemetry(imuEvents),
    thumb: Number(session.metadata?.thumb || 0),
    halls,
    fingers,
    motion,
    music,
    latest,
    history: imuEvents,
    startedAt: session.started_at || null,
    source: "live"
  };
}

function createEmptySession() {
  return {
    sessionId: "waiting",
    performerId: "guest",
    fingerprint: "unavailable",
    eventCount: 0,
    energy: 0,
    thumb: 0,
    halls: { hall1: 0, hall2: 0, hall3: 0 },
    fingers: { pointer: 0, middle: 0, ring: 0, pinky: 0 },
    motion: { pitch_deg: 0, accel_x: 0, accel_y: 0, accel_z: 0, gyro_x: 0, gyro_y: 0, gyro_z: 0 },
    music: { chord: "Imaj7", activeNotes: 0, mode: "idle" },
    latest: { accel_x: 0, accel_y: 0, accel_z: 0, gyro_x: 0, gyro_y: 0, gyro_z: 0 },
    history: [],
    startedAt: null,
    source: "idle"
  };
}

async function readCurrentSession() {
  try {
    const raw = await readFile(snapshotPath, "utf8");
    return normalizeSession(JSON.parse(raw));
  } catch {
    return createEmptySession();
  }
}

const dummyState = {
  tick: 0,
  eventCount: 0,
  history: [],
  sessionId: "cadence-dummy",
  performerId: "simulation",
  startedAt: new Date().toISOString(),
  current: createEmptySession()
};

function pushDummySample() {
  dummyState.tick += 1;
  dummyState.eventCount += 3;

  const t = dummyState.tick / 10;
  const accel_x = Math.sin(t * 0.8) * 1.6 + Math.sin(t * 2.1) * 0.25;
  const accel_y = Math.cos(t * 0.52) * 2.0 + 0.8 + Math.sin(t * 1.4) * 0.35;
  const accel_z = Math.sin(t * 1.12 + 1.3) * 0.7;
  const gyro_x = Math.cos(t * 0.63) * 38;
  const gyro_y = Math.sin(t * 0.44) * 61;
  const gyro_z = Math.cos(t * 0.91) * 27;

  const sample = {
    t: new Date().toISOString(),
    accel_x,
    accel_y,
    accel_z,
    gyro_x,
    gyro_y,
    gyro_z
  };

  dummyState.history.push(sample);
  if (dummyState.history.length > 72) {
    dummyState.history.shift();
  }

  const hall1 = Math.sin(t * 0.35) > 0.82 ? 1 : 0;
  const hall2 = Math.cos(t * 0.41) > 0.88 ? 1 : 0;
  const hall3 = Math.sin(t * 0.22 + 1.1) > 0.9 ? 1 : 0;
  const thumb = Math.round(((Math.sin(t * 0.74) + 1) / 2) * 4095);
  const fingers = {
    pointer: (Math.sin(t * 0.81) + 1) / 2,
    middle: (Math.sin(t * 0.63 + 0.8) + 1) / 2,
    ring: (Math.cos(t * 0.71 + 0.3) + 1) / 2,
    pinky: (Math.sin(t * 0.54 + 1.2) + 1) / 2
  };

  return {
    sessionId: dummyState.sessionId,
    performerId: dummyState.performerId,
    fingerprint: crypto.createHash("sha256").update(`${dummyState.sessionId}:${dummyState.tick}`).digest("hex"),
    eventCount: dummyState.eventCount,
    energy: energyFromTelemetry(dummyState.history),
    thumb,
    halls: { hall1, hall2, hall3 },
    fingers,
    motion: {
      pitch_deg: Math.sin(t * 0.26) * 24,
      accel_x,
      accel_y,
      accel_z,
      gyro_x,
      gyro_y,
      gyro_z
    },
    music: {
      chord: ["Imaj7", "vi7", "IVmaj7", "V7"][Math.floor(dummyState.tick / 24) % 4],
      activeNotes: 1 + (dummyState.tick % 4),
      mode: "fusion"
    },
    latest: sample,
    history: [...dummyState.history],
    startedAt: dummyState.startedAt,
    source: "dummy"
  };
}

function readDummySession() {
  return dummyState.current;
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", socketPort: PORT, dummyMode: DUMMY_MODE });
});

app.get("/api/current", async (_req, res) => {
  res.json(DUMMY_MODE ? readDummySession() : await readCurrentSession());
});


io.on("connection", async (socket) => {
  socket.emit("telemetry:update", DUMMY_MODE ? readDummySession() : await readCurrentSession());
});

let publishTimer = null;
async function publishUpdate() {
  const payload = DUMMY_MODE ? readDummySession() : await readCurrentSession();
  io.emit("telemetry:update", payload);
}

function startWatcher() {
  if (DUMMY_MODE) {
    dummyState.current = pushDummySample();
    setInterval(() => {
      dummyState.current = pushDummySample();
      publishUpdate().catch((error) => {
        console.error("dummy publish error", error);
      });
    }, 120);
    return;
  }

  if (fs.existsSync(snapshotPath)) {
    fs.watchFile(snapshotPath, { interval: 250 }, () => {
      clearTimeout(publishTimer);
      publishTimer = setTimeout(() => {
        publishUpdate().catch((error) => {
          console.error("publish error", error);
        });
      }, 60);
    });
  }

  setInterval(() => {
    publishUpdate().catch((error) => {
      console.error("heartbeat publish error", error);
    });
  }, 1500);
}

async function start() {
  await nextApp.prepare();

  app.all("*", (req, res) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io") || req.path === "/health") {
      return;
    }
    handle(req, res);
  });

  startWatcher();

  httpServer.listen(PORT, () => {
    console.log(`Cadence server listening on http://localhost:${PORT}`);
    if (DUMMY_MODE) {
      console.log("Running in dummy telemetry mode");
    } else {
      console.log(`Watching ${snapshotPath}`);
    }
    console.log(`Next.js running in ${dev ? "development" : "production"} mode`);
  });
}

start().catch((error) => {
  console.error("Failed to start Cadence server", error);
  process.exit(1);
});
