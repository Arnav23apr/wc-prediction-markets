"use client";

import React from "react";

/**
 * Cinematic floodlit-stadium loop behind the hero (AI-generated, ping-pong
 * looped). Muted + autoplay + playsInline; masked + faded into the page.
 */
export function HeroVideo() {
  return (
    <div className="hero-video-wrap" aria-hidden="true">
      <video autoPlay muted loop playsInline poster="/poster.jpg" preload="auto">
        <source src="/hero.webm" type="video/webm" />
        <source src="/hero.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
