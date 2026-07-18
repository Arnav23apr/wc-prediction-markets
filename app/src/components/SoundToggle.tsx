"use client";

import React, { useEffect, useState } from "react";
import { initSound, isMuted, setMuted, playClick, playTick } from "@/lib/sound";

/**
 * Mute control + a single delegated listener that gives every button a soft
 * click. Opt out on an element with `data-no-sfx`.
 */
export function SoundToggle() {
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    initSound();
    setMutedState(isMuted());

    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      const btn = el?.closest("button, [role='button']");
      if (!btn || btn.hasAttribute("data-no-sfx") || btn.getAttribute("aria-disabled") === "true") return;
      if ((btn as HTMLButtonElement).disabled) return;
      playClick();
    };
    document.addEventListener("pointerdown", onDown, { capture: true });
    return () => document.removeEventListener("pointerdown", onDown, { capture: true } as any);
  }, []);

  const toggle = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) playTick();
  };

  return (
    <button
      className="sfx-toggle"
      onClick={toggle}
      data-no-sfx
      aria-label={muted ? "Unmute sound effects" : "Mute sound effects"}
      title={muted ? "Sound off" : "Sound on"}
    >
      {muted ? (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5 6 9H2v6h4l5 4V5Z" />
          <line x1="22" y1="9" x2="16" y2="15" />
          <line x1="16" y1="9" x2="22" y2="15" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5 6 9H2v6h4l5 4V5Z" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      )}
    </button>
  );
}
