/**
 * LiveDisplayPage — the fullscreen OBS Browser Source target.
 * URL: /live-display
 *
 * Listens to Firestore liveStage/current in real time.
 * Animates lyrics per-word or per-character depending on the selected style.
 */
import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import gsap from "gsap";

type AnimStyle = "fade" | "slide-up" | "word-fade" | "word-bounce" | "typewriter" | "blur-in";

interface LiveState {
  songTitle: string;
  lines: string[];
  animStyle: AnimStyle;
  visible: boolean;
  updatedAt: number;
}

// ── Per-word span splitter ────────────────────────────────────────────────────
function splitWords(line: string): string[] {
  return line.split(/(\s+)/).filter(Boolean);
}

// ── Animation runner ──────────────────────────────────────────────────────────
function animateIn(container: HTMLElement, style: AnimStyle) {
  const words = Array.from(container.querySelectorAll<HTMLElement>(".anim-word"));
  const chars = Array.from(container.querySelectorAll<HTMLElement>(".anim-char"));
  const lines = Array.from(container.querySelectorAll<HTMLElement>(".anim-line"));

  gsap.killTweensOf([...words, ...chars, ...lines, container]);

  switch (style) {
    case "fade":
      gsap.fromTo(container, { opacity: 0 }, { opacity: 1, duration: 0.55, ease: "power2.out" });
      break;

    case "slide-up":
      gsap.fromTo(lines,
        { opacity: 0, y: 28 },
        { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", stagger: 0.09 }
      );
      break;

    case "word-fade":
      gsap.set(words, { opacity: 0 });
      gsap.to(words, {
        opacity: 1,
        duration: 0.35,
        ease: "power2.out",
        stagger: { each: 0.07, from: "start" },
      });
      break;

    case "word-bounce":
      gsap.set(words, { opacity: 0, y: 18, scale: 0.7 });
      gsap.to(words, {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.45,
        ease: "back.out(2.2)",
        stagger: { each: 0.06, from: "start" },
      });
      break;

    case "typewriter":
      gsap.set(chars, { opacity: 0 });
      gsap.to(chars, {
        opacity: 1,
        duration: 0.01,
        stagger: { each: 0.035, from: "start" },
        ease: "none",
      });
      break;

    case "blur-in":
      gsap.fromTo(
        words,
        { opacity: 0, filter: "blur(12px)", scale: 1.04 },
        {
          opacity: 1,
          filter: "blur(0px)",
          scale: 1,
          duration: 0.55,
          ease: "power2.out",
          stagger: { each: 0.065, from: "start" },
        }
      );
      break;
  }
}

function animateOut(container: HTMLElement, onDone: () => void) {
  gsap.to(container, {
    opacity: 0,
    duration: 0.3,
    ease: "power2.in",
    onComplete: onDone,
  });
}

// ── Word-split render ─────────────────────────────────────────────────────────
function renderLine(line: string, style: AnimStyle): JSX.Element[] {
  if (style === "typewriter") {
    // split per character
    return line.split("").map((ch, i) => (
      <span key={i} className="anim-char" style={{ display: "inline" }}>{ch === " " ? "\u00a0" : ch}</span>
    ));
  }
  // all other styles: split per word
  return splitWords(line).map((token, i) =>
    token.trim() === "" ? (
      <span key={i}>&nbsp;</span>
    ) : (
      <span key={i} className="anim-word" style={{ display: "inline-block", marginRight: "0.25em" }}>{token}</span>
    )
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function LiveDisplayPage() {
  const [live, setLive] = useState<LiveState | null>(null);
  const [displayed, setDisplayed] = useState<LiveState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<LiveState | null>(null);
  const animatingRef = useRef(false);

  // Real-time Firestore listener
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "liveStage", "current"), snap => {
      if (!snap.exists()) return;
      const data = snap.data() as LiveState;
      setLive(data);
    }, err => console.error("[LiveDisplay] Firestore error:", err));
    return () => unsub();
  }, []);

  // When new live state arrives, animate out → swap → animate in
  useEffect(() => {
    if (!live) return;
    pendingRef.current = live;
    const container = containerRef.current;
    if (!container) return;

    const swap = () => {
      animatingRef.current = true;
      const next = pendingRef.current!;
      setDisplayed(next);
      // Give React a tick to render the new content, then animate in
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          gsap.set(container, { opacity: 1 });
          if (next.visible && next.lines.length) {
            animateIn(container, next.animStyle);
          } else {
            gsap.fromTo(container, { opacity: 1 }, { opacity: 0, duration: 0.35 });
          }
          animatingRef.current = false;
        });
      });
    };

    if (animatingRef.current) {
      // Already animating — just queue it
      return;
    }

    if (displayed && container) {
      animateOut(container, swap);
    } else {
      swap();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const isVisible = displayed?.visible && (displayed?.lines?.length ?? 0) > 0;
  const animStyle: AnimStyle = displayed?.animStyle ?? "word-fade";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "transparent",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        padding: "0 5% 8%",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Google Font for display */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      {/* Lyrics container */}
      <div
        ref={containerRef}
        style={{
          opacity: 0,
          textAlign: "center",
          maxWidth: "90%",
          width: "100%",
          willChange: "opacity, transform",
        }}
      >
        {isVisible && displayed?.lines.map((line, i) => (
          <p
            key={`${displayed.updatedAt}-${i}`}
            className="anim-line"
            style={{
              margin: "0 0 0.2em",
              lineHeight: 1.25,
              fontSize: "clamp(28px, 5vw, 72px)",
              fontWeight: 800,
              color: "#ffffff",
              textShadow: "0 2px 24px rgba(0,0,0,0.9), 0 1px 4px rgba(0,0,0,0.8)",
              letterSpacing: "-0.01em",
              display: "block",
              wordBreak: "break-word",
            }}
          >
            {renderLine(line, animStyle)}
          </p>
        ))}

        {/* Song title (small, below lyrics) */}
        {isVisible && displayed?.songTitle && (
          <p
            style={{
              marginTop: "1em",
              fontSize: "clamp(11px, 1.2vw, 18px)",
              fontWeight: 600,
              color: "rgba(255,255,255,0.35)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              textShadow: "0 1px 8px rgba(0,0,0,0.8)",
            }}
          >
            {displayed.songTitle}
          </p>
        )}
      </div>
    </div>
  );
}
