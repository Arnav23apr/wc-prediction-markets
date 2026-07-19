"use client";

import React, { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sparkles, Float } from "@react-three/drei";
import * as THREE from "three";

function useBallTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 512;
    const x = c.getContext("2d")!;
    x.fillStyle = "#f4f4f7";
    x.fillRect(0, 0, 1024, 512);
    const pent = (cx: number, cy: number, r: number, rot: number) => {
      x.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = rot - Math.PI / 2 + (i * 2 * Math.PI) / 5;
        const px = cx + r * Math.cos(a);
        const py = cy + r * Math.sin(a);
        i ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      x.closePath();
      x.fillStyle = "#16161f";
      x.fill();
    };
    const pts: [number, number][] = [
      [110, 95], [320, 70], [530, 105], [740, 75], [935, 120],
      [210, 235], [430, 215], [650, 245], [855, 235], [1010, 250], [12, 250],
      [110, 375], [330, 400], [550, 378], [770, 408], [960, 375],
    ];
    pts.forEach(([px, py], i) => pent(px, py, 40, (i % 4) * 0.35));
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 8;
    return t;
  }, []);
}

function Ball() {
  const ref = useRef<THREE.Mesh>(null);
  const tex = useBallTexture();
  useFrame((s) => {
    if (!ref.current) return;
    const t = s.clock.elapsedTime;
    ref.current.rotation.y = t * 0.26;
    ref.current.rotation.x = 0.35 + Math.sin(t * 0.16) * 0.07;
    ref.current.position.x = THREE.MathUtils.lerp(ref.current.position.x, 3.1 + s.pointer.x * 0.22, 0.04);
    ref.current.position.y = THREE.MathUtils.lerp(ref.current.position.y, 0.35 + s.pointer.y * 0.18, 0.04);
  });
  return (
    <Float speed={1.0} rotationIntensity={0.3} floatIntensity={0.6}>
      <mesh ref={ref} scale={1.35} position={[3.1, 0.35, -1]}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshStandardMaterial map={tex} roughness={0.45} metalness={0.08} />
      </mesh>
    </Float>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 6, 4]} intensity={2.0} color="#ffffff" />
      <pointLight position={[-5, 2, 3]} intensity={1.8} color="#fbbf24" />
      <pointLight position={[4, -3, 2]} intensity={1.3} color="#f0a92a" />
      <Ball />
      <Sparkles count={90} scale={[16, 11, 7]} size={1.3} speed={0.25} color="#fbbf24" opacity={0.4} />
    </>
  );
}

export function Scene3D() {
  return (
    <div className="scene3d" aria-hidden="true">
      <Canvas camera={{ position: [0, 0, 7], fov: 40 }} dpr={[1, 1.8]} gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}>
        <Scene />
      </Canvas>
    </div>
  );
}
