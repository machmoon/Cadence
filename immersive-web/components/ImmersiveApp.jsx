"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { SiExpress, SiNextdotjs, SiPython, SiSocketdotio, SiThreedotjs } from "react-icons/si";
import { io } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:8787";
const StageScene = lazy(() => import("./StageScene"));

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatHarmonyLabel(chord) {
  if (!chord) return "harmony";

  const normalized = String(chord).trim();
  const romanMap = {
    I: "tonic",
    ii: "supertonic",
    iii: "mediant",
    IV: "subdominant",
    V: "dominant",
    vi: "relative minor",
    vii: "leading tone"
  };

  const match = normalized.match(/^(vii|iii|ii|vi|IV|V|I)(.*)$/i);
  if (!match) return normalized;

  const [, degree, quality] = match;
  const mapped = romanMap[degree] || romanMap[degree.toUpperCase()] || degree;
  const suffix = quality
    .replace("maj", " major ")
    .replace("min", " minor ")
    .replace(/([0-9]+)/g, " $1")
    .trim();

  return suffix ? `${mapped} ${suffix}` : mapped;
}

function formatDuration(startedAt) {
  if (!startedAt) return "00:00";
  const elapsed = Math.max(0, Date.now() - new Date(startedAt).getTime());
  const totalSeconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function motionMagnitude(latest = {}) {
  return Math.sqrt(
    Math.pow(latest.accel_x || 0, 2) +
    Math.pow(latest.accel_y || 0, 2) +
    Math.pow(latest.accel_z || 0, 2)
  );
}

function inferPerformanceState(telemetry) {
  const energy = clamp(telemetry.energy || 0, 0, 1);
  const thumb = clamp((telemetry.thumb || 0) / 4095, 0, 1);
  const hallMix =
    Number(Boolean(telemetry.halls?.hall1)) +
    Number(Boolean(telemetry.halls?.hall2)) +
    Number(Boolean(telemetry.halls?.hall3));
  const motion = motionMagnitude(telemetry.latest);

  if (energy > 0.72 || hallMix >= 2) return "surge";
  if (thumb > 0.62 || motion > 2.4) return "articulating";
  if (energy > 0.18 || hallMix >= 1) return "engaged";
  return "idle";
}

function buildSignalSummary(telemetry) {
  const energy = Math.round(clamp(telemetry.energy || 0, 0, 1) * 100);
  const thumb = Math.round(clamp((telemetry.thumb || 0) / 4095, 0, 1) * 100);
  const hallMix =
    Number(Boolean(telemetry.halls?.hall1)) +
    Number(Boolean(telemetry.halls?.hall2)) +
    Number(Boolean(telemetry.halls?.hall3));
  const motion = motionMagnitude(telemetry.latest);
  const runtime = formatDuration(telemetry.startedAt);
  const state = inferPerformanceState(telemetry);

  return {
    energy,
    thumb,
    hallMix,
    motion,
    runtime,
    state,
    pipelineLabel:
      telemetry.source === "live"
        ? "ESP32 -> Python fusion -> Socket.IO"
        : telemetry.source === "dummy"
          ? "simulated events -> websocket preview"
          : "waiting for runtime",
    sourceLabel:
      telemetry.source === "dummy"
        ? "simulated feed"
        : telemetry.source === "idle"
          ? "awaiting session"
          : "live fusion",
    blendLabel: telemetry.source === "live" ? "glove + vision" : "telemetry preview"
  };
}

function useTelemetry() {
  const [telemetry, setTelemetry] = useState({
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
  });

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    const onUpdate = (payload) => setTelemetry(payload);
    socket.on("telemetry:update", onUpdate);
    return () => {
      socket.off("telemetry:update", onUpdate);
      socket.disconnect();
    };
  }, []);

  return telemetry;
}

function usePointer() {
  const [pointer, setPointer] = useState({ x: 0, y: 0, tx: 0, ty: 0 });
  const targetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleMove = (event) => {
      const x = window.innerWidth ? event.clientX / window.innerWidth : 0.5;
      const y = window.innerHeight ? event.clientY / window.innerHeight : 0.5;
      targetRef.current = { x: x * 2 - 1, y: y * 2 - 1 };
    };

    const handleLeave = () => {
      targetRef.current = { x: 0, y: 0 };
    };

    let rafId = 0;
    let current = { x: 0, y: 0 };

    const tick = () => {
      current = {
        x: current.x + (targetRef.current.x - current.x) * 0.08,
        y: current.y + (targetRef.current.y - current.y) * 0.08
      };
      setPointer({
        x: current.x,
        y: current.y,
        tx: current.x * 18,
        ty: current.y * 18
      });
      rafId = window.requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerleave", handleLeave);
    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerleave", handleLeave);
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  return pointer;
}

function IntroStack() {
  const items = [
    { label: "Next.js", icon: SiNextdotjs },
    { label: "Three.js", icon: SiThreedotjs },
    { label: "Express", icon: SiExpress },
    { label: "Socket.IO", icon: SiSocketdotio },
    { label: "Python", icon: SiPython }
  ];

  return (
    <div className="hero-stack" aria-label="technology stack">
      {items.map(({ label, icon: Icon }) => (
        <div key={label} className="stack-badge" title={label} aria-label={label}>
          <span className="stack-badge-icon" aria-hidden="true">
            <Icon className="stack-logo-svg" />
          </span>
        </div>
      ))}
    </div>
  );
}

function IntroPanel({ onStart }) {
  return (
    <main className="intro-panel layer-hero">
      <div className="intro-topbar">
        <div className="intro-eyebrow">Cadence</div>
        <div className="intro-top-actions">
          <button className="hero-button hero-button-secondary" type="button">
            previous sessions
          </button>
          <button className="hero-button hero-button-secondary" type="button">
            sign in
          </button>
        </div>
      </div>

      <div className="intro-hero-grid intro-hero-grid-simple">
        <div className="intro-copy intro-copy-simple">
          <div className="hero-title">gesture into sound</div>
          <p className="hero-copy">
            A wearable musical interface that turns glove movement into live musical performance.
          </p>
        <div className="intro-support-strip" aria-label="project details">
          <div className="intro-stack-inline">
            <span className="intro-support-label">Built with</span>
            <IntroStack />
          </div>
          <div className="intro-meta-row">
            <div className="intro-note-pill">Built for MakeMIT x Harvard</div>
          </div>
        </div>
        <div className="hero-actions">
            <button className="hero-button hero-button-primary" type="button" onClick={onStart}>
              start
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function ControlBar({ focusMode, panelsOpen, onTogglePanels, onToggleFocus }) {
  return (
    <div className="control-bar">
      <button className={`control-chip ${panelsOpen ? "control-chip-active" : ""}`} type="button" onClick={onTogglePanels}>
        {panelsOpen ? "hide data" : "show data"}
      </button>
      <button className={`control-chip ${focusMode ? "control-chip-active" : ""}`} type="button" onClick={onToggleFocus}>
        {focusMode ? "show interface" : "focus visual"}
      </button>
    </div>
  );
}

function SensorWebGraph({ fingers, halls, thumbValue, summary }) {
  const fingerEntries = [
    ["pointer", fingers.pointer || 0],
    ["middle", fingers.middle || 0],
    ["ring", fingers.ring || 0],
    ["pinky", fingers.pinky || 0]
  ];
  const webPoints = fingerEntries
    .map(([, value], index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / fingerEntries.length;
      const radius = 56 * (0.24 + value * 0.76);
      const x = 88 + Math.cos(angle) * radius;
      const y = 88 + Math.sin(angle) * radius;
      return { x, y };
    });
  const polygon = webPoints.map(({ x, y }) => `${x},${y}`).join(" ");
  const hallEntries = [
    ["H1", Boolean(halls.hall1)],
    ["H2", Boolean(halls.hall2)],
    ["H3", Boolean(halls.hall3)]
  ];
  const imuBarHeight = `${Math.max(10, Math.min(100, summary.motion * 28))}%`;
  const activeHallCount = hallEntries.filter(([, active]) => active).length;

  return (
    <div className="sensor-web-card">
      <div className="sensor-web-hero">
        <div className="sensor-web-graphic">
          <svg viewBox="0 0 176 176" className="telemetry-svg" aria-hidden="true">
            <circle cx="88" cy="88" r="56" className="telemetry-ring" />
            <circle cx="88" cy="88" r="36" className="telemetry-ring telemetry-ring-faint" />
            <circle cx="88" cy="88" r="18" className="telemetry-ring telemetry-ring-faint" />
            <line x1="88" y1="20" x2="88" y2="156" className="telemetry-axis" />
            <line x1="20" y1="88" x2="156" y2="88" className="telemetry-axis" />
            <polygon points={polygon} className="telemetry-shape" />
            {webPoints.map(({ x, y }, index) => (
              <circle key={index} cx={x} cy={y} r="4.5" className="telemetry-node" />
            ))}
          </svg>
        </div>
        <div className="sensor-web-side">
          <div className="mini-metric">
            <span>thumb</span>
            <strong>{Math.round(thumbValue * 100)}%</strong>
          </div>
          <div className="mini-metric mini-metric-energy">
            <span>imu</span>
            <div className="imu-column-track">
              <div className="imu-column-fill" style={{ height: imuBarHeight }} />
            </div>
            <strong>{summary.motion.toFixed(1)}g</strong>
          </div>
        </div>
      </div>

      <div className="sensor-web-footer">
        <div className="hall-strip" aria-label="hall trigger states">
          {hallEntries.map(([label, active]) => (
            <div key={label} className={`hall-chip ${active ? "hall-chip-active" : ""}`}>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className="panel-meta">
          <span>{activeHallCount} live</span>
        </div>
      </div>
    </div>
  );
}

function MusicTelemetryCard({ music, summary }) {
  const harmonyLabel = formatHarmonyLabel(music.chord);
  const points = Array.from({ length: 18 }, (_, index) => {
    const active = music.activeNotes || 0;
    const chordWeight = (music.chord || "").length % 7;
    const x = (index / 17) * 100;
    const waveA = Math.sin(index * 0.42 + active * 0.5) * 10;
    const waveB = Math.cos(index * 0.26 + chordWeight * 0.7) * 6;
    const y = 32 - waveA - waveB;
    return [x, y];
  });
  const linePath = points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  const areaPath = `${linePath} L 100 64 L 0 64 Z`;

  return (
    <div className="music-telemetry-card">
      <div className="music-telemetry-hero">
        <svg viewBox="0 0 100 64" className="music-wave-graphic" aria-hidden="true">
          <path d={areaPath} className="music-wave-area" />
          <path d={linePath} className="music-wave-line" />
          {points.slice(2, 16).filter((_, index) => index % 4 === 0).map(([x, y], index) => (
            <circle key={index} cx={x} cy={y} r="1.6" className="music-wave-node" />
          ))}
        </svg>
        <div className="music-hero-copy">
          <span>music</span>
          <strong>{harmonyLabel}</strong>
          <em>{music.mode || "fusion"}</em>
        </div>
      </div>

      <div className="panel-meta">
        <span>{music.activeNotes || 0} active</span>
      </div>
    </div>
  );
}

function PerformancePanels({ telemetry }) {
  const summary = buildSignalSummary(telemetry);
  const halls = telemetry.halls || {};
  const fingers = telemetry.fingers || {};
  const motion = telemetry.motion || telemetry.latest || {};
  const thumbValue = clamp((telemetry.thumb || 0) / 4095, 0, 1);
  const music = telemetry.music || { chord: "Imaj7", activeNotes: 0, mode: "idle" };

  return (
    <section className="panel-deck">
      <section className="panel-section">
        <div className="panel-section-header">
          <div>
            <span>gesture</span>
            <strong>fingers + imu</strong>
          </div>
        </div>
        <SensorWebGraph fingers={fingers} halls={halls} thumbValue={thumbValue} summary={summary} />
      </section>
      <section className="panel-section">
        <div className="panel-section-header">
          <div>
            <span>music</span>
            <strong>live chord</strong>
          </div>
        </div>
        <MusicTelemetryCard music={music} summary={summary} />
      </section>
    </section>
  );
}

function TelemetryOverlay({ telemetry, panelsOpen, focusMode, onTogglePanels, onToggleFocus }) {
  const summary = buildSignalSummary(telemetry);

  return (
    <section className={`telemetry-workbench ${panelsOpen ? "" : "telemetry-workbench-collapsed"}`}>
      <div className="workbench-header">
        <div className="workbench-status">
          <span>live console</span>
          <strong>{summary.state}</strong>
        </div>
        <ControlBar
          focusMode={focusMode}
          panelsOpen={panelsOpen}
          onTogglePanels={onTogglePanels}
          onToggleFocus={onToggleFocus}
        />
      </div>
      {panelsOpen ? <PerformancePanels telemetry={telemetry} /> : null}
    </section>
  );
}

export default function ImmersiveApp() {
  const telemetry = useTelemetry();
  const pointer = usePointer();
  const [started, setStarted] = useState(false);
  const [panelsOpen, setPanelsOpen] = useState(true);
  const [focusMode, setFocusMode] = useState(false);

  const shellStyle = {
    "--tx": `${pointer.tx}px`,
    "--ty": `${pointer.ty}px`
  };

  return (
    <div className={`app-shell ${focusMode ? "focus-mode" : ""} ${!started ? "app-shell-intro" : ""}`} style={shellStyle}>
      <div className="canvas-frame">
        <Suspense fallback={<div className="loading-screen">Loading immersive scene...</div>}>
          <StageScene telemetry={telemetry} pointer={pointer} started={started} />
        </Suspense>
      </div>

      <div className="ui-overlay">
        {!started ? <IntroPanel onStart={() => setStarted(true)} /> : null}

        {started && !focusMode ? (
          <div className="experience-shell">
            <TelemetryOverlay
              telemetry={telemetry}
              panelsOpen={panelsOpen}
              focusMode={focusMode}
              onTogglePanels={() => setPanelsOpen((value) => !value)}
              onToggleFocus={() => setFocusMode((value) => !value)}
            />
          </div>
        ) : null}

        {started && focusMode ? (
          <button className="focus-exit" type="button" onClick={() => setFocusMode(false)}>
            exit focus
          </button>
        ) : null}
      </div>
    </div>
  );
}
