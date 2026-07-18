"use client";

import React, { useEffect, useRef } from "react";

/**
 * Full-viewport WebGL shader backdrop: a floodlit pitch grid receding to the
 * horizon, with light pulses traveling down the lines. Dependency-free (raw
 * WebGL1), DPR-capped, paused when hidden, static under reduced motion.
 */

const FRAG = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform float uMx; // -1..1 pointer x

// hash noise
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;

  vec3 col = vec3(0.031, 0.035, 0.047); // #08090c
  vec3 violet = vec3(0.431, 0.384, 0.898); // #6e62e5
  float horizon = 0.40;

  // ---- ground plane (below horizon) ----
  if (uv.y < horizon) {
    float d = (horizon - uv.y);            // 0 at horizon
    float z = 0.08 / (d + 0.015);          // perspective depth
    float x = (uv.x - 0.5 + uMx * 0.02) * aspect * z * 2.2;
    float zz = z * 1.4 + uTime * 0.55;     // scroll toward viewer

    // grid lines
    float lx = abs(fract(x) - 0.5);
    float lz = abs(fract(zz) - 0.5);
    float wLine = 0.02 * z;                // constant screen-ish width
    float grid = smoothstep(wLine, 0.0, lx) + smoothstep(wLine, 0.0, lz);

    // distance fade + near fade
    float fade = smoothstep(0.0, 0.18, d) * smoothstep(0.75, 0.25, d);
    // traveling pulse: bright band sweeping toward the horizon
    float band = fract(zz * 0.125);
    float pulse = smoothstep(0.12, 0.0, abs(band - 0.5)) * 0.9;

    col += violet * grid * fade * (0.24 + pulse * 0.5);

    // centre "halfway line" glow
    float mid = smoothstep(0.012, 0.0, abs(fract(x + 0.5) - 0.5) * 0.9) ;
    col += violet * mid * fade * 0.05;
  }

  // ---- horizon glow ----
  float hg = exp(-abs(uv.y - horizon) * 30.0);
  col += violet * hg * 0.20;
  col += vec3(0.9, 0.92, 1.0) * hg * hg * 0.07;

  // ---- sky: sparse drifting pinprick stars ----
  if (uv.y > horizon) {
    vec2 sp = vec2(uv.x * aspect * 140.0, uv.y * 140.0 + uTime * 0.5);
    vec2 cell = floor(sp);
    float on = step(0.998, hash(cell));
    float dot_ = smoothstep(0.16, 0.04, length(fract(sp) - 0.5));
    col += vec3(0.7, 0.7, 0.9) * on * dot_ * 0.4 * smoothstep(horizon, horizon + 0.25, uv.y);
  }

  // grain + vignette
  col += (hash(uv * uRes + uTime) - 0.5) * 0.025;
  float vig = smoothstep(1.25, 0.35, length(uv - vec2(0.5, 0.45)));
  col *= mix(0.72, 1.0, vig);

  gl_FragColor = vec4(col, 1.0);
}
`;

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

export function PitchField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uMx = gl.getUniformLocation(prog, "uMx");

    let mx = 0;
    const onMove = (e: PointerEvent) => { mx = (e.clientX / window.innerWidth - 0.5) * 2; };
    window.addEventListener("pointermove", onMove, { passive: true });

    const resize = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let running = true;
    const t0 = performance.now();
    const frame = () => {
      if (!running) return;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, reduced ? 0 : (performance.now() - t0) / 1000);
      gl.uniform1f(uMx, mx);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduced) raf = requestAnimationFrame(frame);
    };
    frame();

    const onVis = () => {
      running = document.visibilityState === "visible";
      if (running && !reduced) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} className="pitchfield" aria-hidden="true" />;
}
