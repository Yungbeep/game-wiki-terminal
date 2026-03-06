"use client";

import React, { useEffect, useRef, useState } from "react";

type BootGateProps = {
  children: React.ReactNode;
  alwaysPlay?: boolean; // if true, boot runs every page load
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function uaDevice(): string {
  const ua = navigator.userAgent || "";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Unknown device";
}

function localeGuess(): { lang: string; tz: string } {
  const lang = navigator.language || "en-US";
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown TZ";
  return { lang, tz };
}

function nowStamp(): string {
  const d = new Date();
  return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
}

export default function BootGate({ children, alwaysPlay = true }: BootGateProps) {
  const [ready, setReady] = useState(false);
  const [skipped, setSkipped] = useState(false);

  const outputRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLSpanElement | null>(null);
  const glitchRef = useRef<HTMLDivElement | null>(null);

  // --- audio (no external files) ---
  const audioCtxRef = useRef<AudioContext | null>(null);
  const humRef = useRef<{ o: OscillatorNode; g: GainNode } | null>(null);

  function ensureAudio() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
  }

  function tone(freq: number, duration = 0.06, type: OscillatorType = "sine", gain = 0.03) {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;

    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + duration + 0.02);
  }

  function click() {
    tone(1400, 0.02, "square", 0.02);
    tone(900, 0.03, "square", 0.015);
  }
  function blip() {
    tone(520, 0.05, "sine", 0.03);
  }
  function unlock() {
    tone(880, 0.05, "sine", 0.03);
    setTimeout(() => tone(1320, 0.06, "sine", 0.03), 70);
  }
  function humStart() {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.value = 60;
    g.gain.value = 0.007;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    humRef.current = { o, g };
  }
  function humStop() {
    const ctx = audioCtxRef.current;
    const hum = humRef.current;
    if (ctx && hum) {
      hum.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.18);
      setTimeout(() => {
        try {
          hum.o.stop();
        } catch {}
        humRef.current = null;
      }, 700);
    }
  }

  function glitchOnce() {
    const el = glitchRef.current;
    if (!el) return;
    el.classList.add("tok-glitch-on");
    setTimeout(() => el.classList.remove("tok-glitch-on"), 260);
  }

  function appendLine(text = "") {
    const out = outputRef.current;
    if (!out) return;
    out.textContent = (out.textContent || "") + text + "\n";
  }

  async function typeLine(text: string, { speed = 14, keySound = false } = {}) {
    const s = statusRef.current;
    if (!s) return;

    let buf = "";
    for (const ch of text) {
      buf += ch;
      s.textContent = buf;
      if (keySound && ch.trim()) click();
      await sleep(speed + Math.random() * 10);
    }
    appendLine("> " + text);
    s.textContent = "_";
    await sleep(120);
  }

  async function runBoot() {
    // if user already skipped, don't re-run
    if (skipped) return;

    // reset
    setReady(false);
    const out = outputRef.current;
    if (out) out.textContent = "";

    ensureAudio();
    humStart();

    appendLine("TERMINAL OF KNOWLEDGE");
    appendLine("---------------------");
    appendLine("");

    await sleep(220);
    await typeLine("Initializing system...", { speed: 12, keySound: false });
    blip();

    await sleep(220);
    await typeLine("Connection detected.", { speed: 11, keySound: false });

    const { lang, tz } = localeGuess();
    const device = uaDevice();

    await sleep(160);
    await typeLine("Collecting session metadata...", { speed: 10, keySound: false });

    await sleep(120);
    glitchOnce();
    tone(220, 0.08, "sawtooth", 0.02);

    appendLine("> Timestamp: " + nowStamp());
    appendLine("> Timezone: " + tz);
    appendLine("> Locale: " + lang);
    appendLine("> Device: " + device);
    appendLine("");

    await sleep(200);
    await typeLine("User: UNKNOWN", { speed: 12, keySound: false });

    await sleep(140);
    await typeLine("Scanning...", { speed: 18, keySound: false });

    for (let i = 0; i < 3; i++) {
      glitchOnce();
      tone(300 + i * 80, 0.06, "square", 0.015);
      await sleep(120);
    }

    await sleep(180);
    await typeLine("Access granted.", { speed: 10, keySound: false });
    unlock();

    await sleep(130);
    try {
      const u = new SpeechSynthesisUtterance("What would you like to know?");
      u.rate = 0.92;
      u.pitch = 0.9;
      u.volume = 0.55;
      window.speechSynthesis.speak(u);
    } catch {}

    await sleep(240);

    humStop();
    setReady(true);
  }

  useEffect(() => {
    // keyframes / effects
    const style = document.createElement("style");
    style.innerHTML = `
      @keyframes tok_scan { 0% { transform: translateY(-30%);} 100% { transform: translateY(160%);} }
      @keyframes tok_flicker { 0%,100% { opacity: 0.05;} 50% { opacity: 0.085;} }
      @keyframes tok_blink { 50% { opacity: 0; } }

      .tok-noise { opacity: 0.06; mix-blend-mode: screen; animation: tok_flicker 3.5s infinite; }
      .tok-scanline { opacity: 0.9; mix-blend-mode: screen; animation: tok_scan 6s linear infinite; }
      .tok-cursor { animation: tok_blink 1s steps(1) infinite; }

      .tok-glitch { opacity: 0; mix-blend-mode: screen; }
      .tok-glitch-on { opacity: 1 !important; animation: tok_glitch 240ms steps(2) 1; }
      @keyframes tok_glitch {
        0% { transform: translateY(-8px); filter: blur(0.2px); }
        50% { transform: translateY(6px); filter: blur(0.6px); }
        100% { transform: translateY(0); filter: blur(0); }
      }
    `;
    document.head.appendChild(style);

    // iOS: allow audio after first gesture
    const onFirst = () => ensureAudio();
    window.addEventListener("pointerdown", onFirst, { once: true });

    // run boot
    runBoot();

    return () => {
      document.head.removeChild(style);
      window.removeEventListener("pointerdown", onFirst);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If alwaysPlay=false, we play once per tab load anyway (this component remounts on refresh).
  // You can extend with localStorage if you want.
  useEffect(() => {
    if (!alwaysPlay) return;
    // already handled by runBoot on mount
  }, [alwaysPlay]);

  if (ready) return <>{children}</>;

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        background: "#050607",
        color: "#d7fbe8",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        overflow: "hidden",
        position: "relative",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      {/* noise */}
      <div
        className="tok-noise"
        style={{
          pointerEvents: "none",
          position: "fixed",
          inset: 0,
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='.25'/%3E%3C/svg%3E\")",
        }}
      />
      {/* scanline */}
      <div
        className="tok-scanline"
        style={{
          pointerEvents: "none",
          position: "fixed",
          inset: "-40% 0 0 0",
          height: "30%",
          background:
            "linear-gradient(to bottom, transparent, rgba(215, 251, 232, 0.06), transparent)",
          filter: "blur(0.2px)",
        }}
      />

      <div
        style={{
          width: "min(980px, 92vw)",
          height: "min(560px, 70vh)",
          border: "1px solid rgba(215, 251, 232, 0.16)",
          borderRadius: 14,
          background:
            "radial-gradient(1200px 600px at 20% 0%, rgba(215, 251, 232, 0.06), transparent 60%)," +
            "radial-gradient(800px 400px at 80% 100%, rgba(215, 251, 232, 0.04), transparent 55%)," +
            "rgba(0, 0, 0, 0.35)",
          boxShadow:
            "0 0 0 1px rgba(215, 251, 232, 0.04) inset, 0 12px 60px rgba(0, 0, 0, 0.55), 0 0 80px rgba(215, 251, 232, 0.18)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            height: 38,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 14px",
            borderBottom: "1px solid rgba(215, 251, 232, 0.12)",
            background: "rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ width: 9, height: 9, borderRadius: 999, background: "rgba(215, 251, 232, 0.28)" }} />
          <div style={{ width: 9, height: 9, borderRadius: 999, background: "rgba(215, 251, 232, 0.28)" }} />
          <div style={{ width: 9, height: 9, borderRadius: 999, background: "rgba(215, 251, 232, 0.28)" }} />
          <div style={{ fontSize: 12, color: "rgba(215, 251, 232, 0.65)", marginLeft: 8, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            terminal-of-knowledge
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <button
              onClick={() => {
                setSkipped(true);
                setReady(true);
                humStop();
              }}
              style={{
                background: "rgba(215,251,232,0.06)",
                border: "1px solid rgba(215,251,232,0.14)",
                color: "rgba(215,251,232,0.85)",
                padding: "6px 10px",
                borderRadius: 10,
                fontFamily: "inherit",
                cursor: "pointer",
                fontSize: 12,
              }}
              title="Skip boot"
            >
              Skip
            </button>
          </div>
        </div>

        <div style={{ padding: 18, height: "calc(100% - 38px)", display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            ref={outputRef}
            style={{
              flex: 1,
              overflow: "hidden",
              whiteSpace: "pre-wrap",
              lineHeight: 1.55,
              fontSize: 14,
              color: "#d7fbe8",
              textShadow: "0 0 14px rgba(215, 251, 232, 0.18)",
            }}
          />
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              borderTop: "1px solid rgba(215, 251, 232, 0.12)",
              paddingTop: 12,
              color: "rgba(215, 251, 232, 0.65)",
              fontSize: 14,
            }}
          >
            <span style={{ color: "rgba(215, 251, 232, 0.9)" }}>&gt;</span>
            <span ref={statusRef}>_</span>
            <span
              className="tok-cursor"
              style={{
                display: "inline-block",
                width: 10,
                height: 16,
                background: "rgba(215, 251, 232, 0.9)",
                boxShadow: "0 0 18px rgba(215, 251, 232, 0.18)",
                marginLeft: 2,
                transform: "translateY(2px)",
              }}
            />
          </div>
        </div>

        <div
          ref={glitchRef}
          className="tok-glitch"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: "linear-gradient(transparent, rgba(215,251,232,0.08), transparent)",
          }}
        />
      </div>
    </div>
  );
}