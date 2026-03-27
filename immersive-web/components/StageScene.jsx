"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line, PerspectiveCamera, Sparkles } from "@react-three/drei";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function TelemetryTrail({ telemetry }) {
  const [curvePoints, shimmerPoints, tailPoints] = useMemo(() => {
    const history = telemetry.history || [];
    if (!history.length) {
      const fallback = [
        new THREE.Vector3(-0.5, -0.3, -1.8),
        new THREE.Vector3(-0.15, 0.22, -2.7),
        new THREE.Vector3(0.2, 0.12, -3.8),
        new THREE.Vector3(0.46, -0.14, -5.2),
        new THREE.Vector3(0.18, -0.28, -6.6)
      ];
      const fallbackCurve = new THREE.CatmullRomCurve3(fallback, false, "catmullrom", 0.6);
      const points = fallbackCurve.getPoints(96);
      return [points, fallbackCurve.getPoints(24), points.slice(-22)];
    }

    const anchors = history.slice(-24).map((sample, index, arr) => {
      const spread = index / Math.max(arr.length - 1, 1);
      return new THREE.Vector3(
        (sample.accel_x || 0) * 0.28 + Math.sin(spread * Math.PI * 1.4) * 0.18,
        (sample.accel_y || 0) * 0.11 - 0.1 + Math.cos(spread * Math.PI * 2) * 0.08,
        -1.1 - spread * 8.8 + (sample.accel_z || 0) * 0.18
      );
    });

    const curve = new THREE.CatmullRomCurve3(anchors, false, "catmullrom", 0.7);
    const points = curve.getPoints(120);
    return [points, curve.getPoints(28), points.slice(-28)];
  }, [telemetry.history]);

  return (
    <group>
      <Line points={curvePoints} color="#f7e7d4" lineWidth={1.9} transparent opacity={0.82} />
      <Line
        points={curvePoints.map((point, index) => point.clone().add(new THREE.Vector3(index * 0.0016, -index * 0.0008, 0)))}
        color="#ffb77f"
        lineWidth={0.7}
        transparent
        opacity={0.22}
      />
      <Sparkles
        count={shimmerPoints.length}
        positions={Float32Array.from(shimmerPoints.flatMap((point) => [point.x, point.y, point.z]))}
        size={2.4}
        speed={0.14}
        opacity={0.52}
        scale={[1, 1, 1]}
        color="#f9dfc5"
      />
      <Sparkles
        count={tailPoints.length}
        positions={Float32Array.from(tailPoints.flatMap((point) => [point.x, point.y, point.z]))}
        size={4.2}
        speed={0.24}
        opacity={0.7}
        scale={[1, 1, 1]}
        color="#ffd7aa"
      />
    </group>
  );
}

function MotionCore({ telemetry }) {
  const core = useRef();
  const shell = useRef();
  const bloom = useRef();
  const energy = clamp(telemetry.energy || 0, 0, 1);
  const thumb = clamp((telemetry.thumb || 0) / 4095, 0, 1);
  const hallMix = Number(Boolean(telemetry.halls?.hall1)) + Number(Boolean(telemetry.halls?.hall2)) + Number(Boolean(telemetry.halls?.hall3));

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (core.current) {
      core.current.rotation.y = t * 0.09;
      core.current.rotation.z = Math.sin(t * 0.14) * 0.08;
      core.current.scale.setScalar(0.68 + energy * 0.06 + thumb * 0.03);
      core.current.material.emissiveIntensity = 1.9 + energy * 1.4;
    }
    if (shell.current) {
      shell.current.rotation.y = -t * 0.06;
      shell.current.rotation.x = Math.sin(t * 0.1) * 0.06;
      shell.current.scale.setScalar(1.08 + energy * 0.08 + hallMix * 0.04);
      shell.current.material.opacity = 0.12 + energy * 0.08;
    }
    if (bloom.current) {
      bloom.current.rotation.z = t * 0.04;
      bloom.current.scale.setScalar(1.55 + energy * 0.08 + hallMix * 0.03);
      bloom.current.material.opacity = 0.06 + energy * 0.05;
    }
  });

  return (
    <group>
      <mesh ref={core}>
        <octahedronGeometry args={[0.34, 3]} />
        <meshStandardMaterial color="#fff8ef" emissive="#ffc17b" roughness={0.92} metalness={0.01} />
      </mesh>
      <mesh ref={shell}>
        <icosahedronGeometry args={[0.72, 2]} />
        <meshBasicMaterial color="#ffd6a8" transparent opacity={0.14} wireframe />
      </mesh>
      <mesh ref={bloom} rotation={[Math.PI / 4, 0, 0]}>
        <octahedronGeometry args={[1.08, 1]} />
        <meshBasicMaterial color="#f4b176" transparent opacity={0.08} />
      </mesh>
    </group>
  );
}

function StellarFilaments({ telemetry }) {
  const group = useRef();
  const energy = clamp(telemetry.energy || 0, 0, 1);
  const thumb = clamp((telemetry.thumb || 0) / 4095, 0, 1);
  const hallMix = Number(Boolean(telemetry.halls?.hall1)) + Number(Boolean(telemetry.halls?.hall2)) + Number(Boolean(telemetry.halls?.hall3));

  const filaments = useMemo(() => {
    const bands = [];
    for (let bandIndex = 0; bandIndex < 3; bandIndex += 1) {
      const baseRadius = 0.9 + bandIndex * 0.3;
      const points = [];
      for (let i = 0; i < 180; i += 1) {
        const angle = (i / 180) * Math.PI * 2;
        const wobble = Math.sin(angle * (2.5 + bandIndex * 0.7)) * 0.12;
        const radius = baseRadius + wobble;
        points.push(
          Math.cos(angle) * radius,
          Math.sin(angle * (1.5 + bandIndex * 0.2)) * 0.12,
          Math.sin(angle) * radius * (0.46 + bandIndex * 0.08)
        );
      }
      bands.push(Float32Array.from(points));
    }
    return bands;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!group.current) return;
    group.current.rotation.y = t * 0.04;
    group.current.rotation.z = Math.sin(t * 0.07) * 0.08;
    group.current.rotation.x = Math.sin(t * 0.05) * 0.05;
    group.current.scale.setScalar(1 + energy * 0.06 + thumb * 0.04);
  });

  return (
    <group ref={group}>
      {filaments.map((positions, index) => (
        <Sparkles
          key={index}
          count={positions.length / 3}
          positions={positions}
          size={index === 0 ? 3.4 + energy * 0.8 : 2.4 + hallMix * 0.4}
          speed={0.12 + index * 0.03}
          opacity={0.18 + energy * 0.07 - index * 0.02}
          scale={[1, 1, 1]}
          color={index === 0 ? "#f6c58f" : index === 1 ? "#d7b3d9" : "#ffe7c8"}
        />
      ))}
    </group>
  );
}

function StarCrown({ telemetry }) {
  const group = useRef();
  const energy = clamp(telemetry.energy || 0, 0, 1);

  const [raysA, raysB] = useMemo(() => {
    const makeRays = (count, inner, outer, variance) =>
      Array.from({ length: count }, (_, index) => {
        const angle = (index / count) * Math.PI * 2;
        const radius = outer + Math.sin(angle * 3.2) * variance;
        return [
          new THREE.Vector3(Math.cos(angle) * inner, Math.sin(angle) * inner * 0.3, Math.sin(angle) * inner * 0.55),
          new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.18, Math.sin(angle) * radius * 0.7)
        ];
      });

    return [makeRays(12, 0.48, 1.48, 0.16), makeRays(9, 0.52, 1.18, 0.12)];
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!group.current) return;
    group.current.rotation.z = t * 0.05;
    group.current.rotation.y = Math.sin(t * 0.07) * 0.12;
  });

  return (
    <group ref={group}>
      {raysA.map((points, index) => (
        <Line key={`a-${index}`} points={points} color="#f6c58f" lineWidth={0.9} transparent opacity={0.22 + energy * 0.08} />
      ))}
      {raysB.map((points, index) => (
        <Line key={`b-${index}`} points={points} color="#d6b3d8" lineWidth={0.7} transparent opacity={0.16 + energy * 0.05} />
      ))}
    </group>
  );
}

function OrbitalStars({ telemetry }) {
  const group = useRef();
  const energy = clamp(telemetry.energy || 0, 0, 1);
  const hallMix = Number(Boolean(telemetry.halls?.hall1)) + Number(Boolean(telemetry.halls?.hall2)) + Number(Boolean(telemetry.halls?.hall3));

    const [outerBand, innerBand] = useMemo(() => {
      const makeBand = (count, radiusX, radiusZ, ySpread) => {
      const points = [];
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2;
        const jitter = (Math.random() - 0.5) * 0.18;
        points.push(
          radiusX * Math.cos(angle) + jitter,
          (Math.random() - 0.5) * ySpread,
          radiusZ * Math.sin(angle) + jitter * 0.6
        );
      }
      return Float32Array.from(points);
    };

    return [
      makeBand(140, 3.8, 2.4, 0.32),
      makeBand(90, 2.7, 1.5, 0.22)
    ];
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!group.current) return;
    group.current.rotation.y = t * 0.08;
    group.current.rotation.z = Math.sin(t * 0.1) * 0.08;
    group.current.rotation.x = Math.sin(t * 0.06) * 0.06;
  });

    return (
    <group ref={group}>
      <Sparkles
        count={140}
        positions={outerBand}
        size={1.9 + energy * 0.45}
        speed={0.1}
        opacity={0.18 + hallMix * 0.04}
        scale={[1, 1, 1]}
        color="#f0cba8"
      />
      <Sparkles
        count={90}
        positions={innerBand}
        size={1.5 + energy * 0.35}
        speed={0.08}
        opacity={0.12 + energy * 0.05}
        scale={[1, 1, 1]}
        color="#d1bfd9"
      />
    </group>
  );
}

function ParticleField({ telemetry }) {
  const pointsRef = useRef();
  const energy = clamp(telemetry.energy || 0, 0, 1);

  const [geometry, material] = useMemo(() => {
    const positions = [];
    const sizes = [];
    const offsets = [];

    for (let i = 0; i < 12000; i += 1) {
      const radius = 10 + Math.random() * 24;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions.push(
        radius * Math.sin(phi) * Math.cos(theta),
        (Math.random() - 0.5) * 10,
        radius * Math.sin(phi) * Math.sin(theta) - 10
      );
      sizes.push(Math.random() * 1.0 + 0.25);
      offsets.push(Math.random() * Math.PI * 2, Math.random() * 0.7 + 0.1, Math.random() * 0.45 + 0.12);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
    g.setAttribute("aOffset", new THREE.Float32BufferAttribute(offsets, 3));

    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0 }
      },
      vertexShader: `
        uniform float uTime;
        uniform float uEnergy;
        attribute float aSize;
        attribute vec3 aOffset;
        varying float vAlpha;
        varying float vMix;
        void main() {
          vec3 transformed = position;
          transformed.x += sin(uTime * aOffset.y + aOffset.x) * (0.06 + uEnergy * 0.16);
          transformed.y += cos(uTime * aOffset.z + aOffset.x) * (0.05 + uEnergy * 0.12);
          transformed.z += sin(uTime * 0.18 + aOffset.x) * (0.04 + uEnergy * 0.08);
          vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
          gl_PointSize = aSize * (150.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
          vAlpha = clamp(1.05 - length(transformed.xy) * 0.022, 0.04, 1.0);
          vMix = clamp((transformed.y + 5.0) / 10.0, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying float vMix;
        void main() {
          float d = length(gl_PointCoord.xy - 0.5);
          float alpha = smoothstep(0.5, 0.04, d) * vAlpha;
          vec3 colorA = vec3(0.94, 0.78, 0.62);
          vec3 colorB = vec3(0.76, 0.69, 0.84);
          vec3 colorC = vec3(0.73, 0.8, 0.88);
          vec3 color = mix(mix(colorA, colorB, vMix), colorC, d * 1.1);
          gl_FragColor = vec4(color, alpha);
        }
      `
    });

    return [g, m];
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    material.uniforms.uTime.value = t;
    material.uniforms.uEnergy.value = energy;
    if (pointsRef.current) {
      pointsRef.current.rotation.y = t * 0.014;
      pointsRef.current.rotation.x = Math.sin(t * 0.05) * 0.03 + (telemetry.latest?.accel_x || 0) * 0.008;
    }
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}

function AtmosphereSheet({ telemetry }) {
  const mesh = useRef();
  const energy = clamp(telemetry.energy || 0, 0, 1);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!mesh.current) return;
    mesh.current.rotation.z = t * 0.03;
    mesh.current.rotation.x = Math.sin(t * 0.12) * 0.14;
    mesh.current.material.opacity = 0.08 + energy * 0.08;
  });

  return (
    <mesh ref={mesh} position={[0, 0, -7]} scale={[18, 18, 1]}>
      <planeGeometry args={[1, 1, 64, 64]} />
      <meshBasicMaterial color="#251f2f" transparent opacity={0.09} />
    </mesh>
  );
}

function SceneLights({ telemetry }) {
  const hallMix = Number(Boolean(telemetry.halls?.hall1)) + Number(Boolean(telemetry.halls?.hall2)) + Number(Boolean(telemetry.halls?.hall3));
  const accent = hallMix > 0 ? "#efb27b" : "#c4a6dd";
  const energy = clamp(telemetry.energy || 0, 0, 1);

  return (
    <>
      <ambientLight intensity={0.34 + energy * 0.16} color="#efe7df" />
      <directionalLight position={[4, 5, 3]} intensity={0.95 + energy * 0.28} color="#fff4e6" />
      <pointLight position={[0, 0.5, 2.5]} intensity={6 + energy * 4} distance={18} color={accent} />
      <pointLight position={[-5, 2, -5]} intensity={2.4 + hallMix * 0.7} distance={26} color="#8ca5cc" />
      <pointLight position={[4, -1, -3]} intensity={1.8} distance={20} color="#ae94c4" />
    </>
  );
}

function CameraRig({ telemetry, pointer }) {
  const target = useRef(new THREE.Vector3());
  const lookAtTarget = useRef(new THREE.Vector3());

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const energy = clamp(telemetry.energy || 0, 0, 1);
    const px = pointer?.x || 0;
    const py = pointer?.y || 0;
    const camera = state.camera;

    target.current.set(
      px * 1.2 + Math.sin(t * 0.12) * 0.2,
      py * -0.7 + Math.cos(t * 0.16) * 0.18,
      8.6 - energy * 0.8
    );

    lookAtTarget.current.lerp(new THREE.Vector3(px * 0.4, py * -0.2, -4.5), 0.06);
    camera.position.lerp(target.current, 0.045);
    camera.lookAt(lookAtTarget.current);
  });

  return null;
}

function ImmersiveScene({ telemetry, pointer, started }) {
  const bg = "#0d0f16";
  return (
    <>
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, 7, 42]} />
      <PerspectiveCamera makeDefault position={[0, 0, 8.8]} fov={34} />
      <CameraRig telemetry={telemetry} pointer={pointer} />
      <SceneLights telemetry={telemetry} />
      <AtmosphereSheet telemetry={telemetry} />
      <TelemetryTrail telemetry={telemetry} />
      <StellarFilaments telemetry={telemetry} />
      <StarCrown telemetry={telemetry} />
      <MotionCore telemetry={telemetry} />
      <OrbitalStars telemetry={telemetry} />
      <ParticleField telemetry={telemetry} />
      <Sparkles count={64} scale={[16, 9, 16]} size={1.8} speed={0.12} color="#fff2dd" />
    </>
  );
}

export default function StageScene({ telemetry, pointer, started }) {
  return (
    <Canvas dpr={[1, 1.8]} gl={{ antialias: true }}>
      <Suspense
        fallback={
          <Html center>
            <div className="loading-badge">Loading scene...</div>
          </Html>
        }
      >
        <ImmersiveScene telemetry={telemetry} pointer={pointer} started={started} />
      </Suspense>
    </Canvas>
  );
}
