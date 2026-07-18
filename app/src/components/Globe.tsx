"use client";

import React, { useEffect, useRef } from "react";
import createGlobe from "cobe";

const MARKERS: { location: [number, number]; size: number }[] = [
  [-34.6, -58.4], [-22.9, -43.2], [48.85, 2.35], [51.5, -0.12], [40.4, -3.7],
  [52.52, 13.4], [40.71, -74.0], [19.43, -99.13], [33.57, -7.59], [35.68, 139.69],
  [52.37, 4.9], [38.72, -9.14], [45.81, 15.98], [-33.87, 151.2], [30.04, 31.24],
  [-23.55, -46.63], [37.57, 126.98], [9.08, 8.68],
].map((location) => ({ location: location as [number, number], size: 0.055 }));

interface Props {
  baseColor?: [number, number, number];
  markerColor?: [number, number, number];
  glowColor?: [number, number, number];
  onClick?: () => void;
}

export function Globe({
  baseColor = [0.28, 0.24, 0.4],
  markerColor = [1, 0.7, 0.15],
  glowColor = [0.5, 0.35, 0.95],
  onClick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    let phi = 0;
    let width = 0;
    let pointerInteracting: number | null = null;
    let pointerPhiDiff = 0;
    let downX = 0;
    let downAt = 0;
    let moved = 0;

    const onResize = () => {
      if (canvasRef.current) width = canvasRef.current.offsetWidth;
    };
    window.addEventListener("resize", onResize);
    onResize();

    const globe = createGlobe(canvasRef.current!, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 0,
      theta: 0.28,
      dark: 1,
      diffuse: 1.3,
      mapSamples: 16000,
      mapBrightness: 6,
      baseColor,
      markerColor,
      glowColor,
      markers: MARKERS,
      onRender: (state) => {
        if (pointerInteracting === null) phi += 0.004; // auto-rotate when idle
        state.phi = phi + pointerPhiDiff;
        state.width = width * 2;
        state.height = width * 2;
      },
    });

    const canvas = canvasRef.current!;
    const onPointerDown = (e: PointerEvent) => {
      pointerInteracting = e.clientX - pointerPhiDiff * 200;
      downX = e.clientX;
      downAt = Date.now();
      moved = 0;
      canvas.style.cursor = "grabbing";
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onPointerUp = () => {
      const wasDragging = pointerInteracting !== null;
      pointerInteracting = null;
      canvas.style.cursor = "grab";
      if (wasDragging && moved < 6 && Date.now() - downAt < 350) onClickRef.current?.();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (pointerInteracting !== null) {
        moved = Math.abs(e.clientX - downX);
        pointerPhiDiff = (e.clientX - pointerInteracting) / 200;
      }
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.style.cursor = "grab";

    requestAnimationFrame(() => canvas && (canvas.style.opacity = "1"));
    return () => {
      globe.destroy();
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointermove", onPointerMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      role="button"
      aria-label="Explore World Cup markets around the globe"
      style={{ width: "100%", height: "100%", aspectRatio: "1", opacity: 0, transition: "opacity 1.2s ease", contain: "layout paint size", touchAction: "none" }}
    />
  );
}
