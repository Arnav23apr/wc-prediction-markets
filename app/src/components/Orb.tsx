"use client";

import React, { useMemo, useRef, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, OrbitControls, Float, useGLTF } from "@react-three/drei";
import * as THREE from "three";

function Ball() {
  const group = useRef<THREE.Group>(null);
  const { scene } = useGLTF("/ball.glb");

  const model = useMemo(() => {
    const s = scene.clone(true);
    const box = new THREE.Box3().setFromObject(s);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 2.1 / maxDim;
    s.scale.setScalar(scale);
    s.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    s.traverse((o: any) => {
      if (o.isMesh && o.material) {
        o.material.envMapIntensity = 1.0;
        o.material.roughness = Math.min(0.8, (o.material.roughness ?? 0.6));
        o.material.needsUpdate = true;
        o.castShadow = true;
      }
    });
    return s;
  }, [scene]);

  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += dt * 0.25;
  });

  return (
    <group ref={group}>
      <primitive object={model} />
    </group>
  );
}
useGLTF.preload("/ball.glb");

export function Orb() {
  return (
    <div className="orb-canvas">
      <Canvas
        camera={{ position: [0, 0, 4], fov: 34 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.4} />
          <directionalLight position={[4, 6, 5]} intensity={1.6} castShadow />
          <directionalLight position={[-5, -2, -4]} intensity={0.5} color="#a9c4ff" />
          <Environment preset="studio" />
          <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.6}>
            <Ball />
          </Float>
        </Suspense>
        <OrbitControls enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={0.5} rotateSpeed={0.6} />
      </Canvas>
    </div>
  );
}
