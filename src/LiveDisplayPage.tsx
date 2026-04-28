/**
 * LiveDisplayPage — OBS Browser Source target.
 * URL: /live-display
 *
 * Polls /api/live-state every 250 ms — no auth, no Firestore.
 *
 * EXACT copy of LiveStageView's Screen component rendering logic:
 *  - ResizeObserver box sizing (strict 16:9 if needed, or full screen for OBS)
 *  - fs = box.w * 0.10 (same formula)
 *  - Echo: echoWordSm() mixed sizes, safeFsForRows() overflow guard, forced rows
 *  - Echo marquee: 5 scrolling outline rows behind the main lyrics
 *  - All 7 animation styles via GSAP
 *  - Vignette + stage glow overlays
 */
import React, {
  useEffect, useRef, useState, useCallback,
} from "react";
import gsap from "gsap";

type AnimStyle = "fade" | "slide-up" | "word-fade" | "word-bounce" | "typewriter" | "blur-in" | "echo";

interface LiveState {
  songTitle: string;
  lines: string[];
  animStyle: AnimStyle;
  visible: boolean;
  updatedAt: number;
  bgIdx?: number;
  echoAlign?: "center" | "centered-left" | "left";
  echoLines?: "auto" | "2" | "3";
  bgVideo?: { type: "local"; url: string } | { type: "youtube"; videoId: string } | null;
}

// ── Background presets — mirrors BG_PRESETS in LiveStageView ─────────────────
const BG_PRESETS = [
  "linear-gradient(135deg,#0a0a14 0%,#1a1a2e 50%,#0d1a2e 100%)",
  "linear-gradient(135deg,#0d0014 0%,#1a003a 60%,#000814 100%)",
  "linear-gradient(135deg,#140a00 0%,#2e1500 60%,#0a0a00 100%)",
  "#000",
];

// ── Sacred words — always render bigger (because it's God) ─────────────────
const SACRED_WORDS = new Set([
  'jesus','christ','diyos','dios','god','lord','yahweh','jehovah','emmanuel',
]);
function isSacred(word: string): boolean {
  return SACRED_WORDS.has(word.toLowerCase().replace(/[^a-z]/g, ''));
}

// ── Echo word sizing — exact mirror of LiveStageView ──────────────────────────
const FUNC_WORDS = new Set([
  'a','an','the','to','of','in','at','by','for','on','and','or','but',
  'is','are','was','were','i','we','he','she','it','my','our','your','his','her','its',
]);
function echoWordSm(word: string, gIdx: number): number {
  // Sacred words are BIGGEST — always elevated
  if (isSacred(word)) return 1.75;
  if (FUNC_WORDS.has(word.toLowerCase())) return 0.62;
  const hash = word.toLowerCase().split('').reduce((a, c) => a + c.charCodeAt(0), 0) + gIdx * 11;
  return (hash % 3 === 0) ? 0.68 : 1.30;
}

// ── GSAP animation — exact mirror of animIn() in LiveStageView ───────────────
function animIn(el: HTMLElement, style: AnimStyle) {
  const ws = Array.from(el.querySelectorAll<HTMLElement>(".pw"));
  const cs = Array.from(el.querySelectorAll<HTMLElement>(".pc"));
  const ls = Array.from(el.querySelectorAll<HTMLElement>(".pl"));
  gsap.killTweensOf([...ws, ...cs, ...ls, el]);
  if      (style === "fade")       gsap.fromTo(el, { opacity:0 }, { opacity:1, duration:0.8, ease:"power2.out" });
  else if (style === "slide-up")   gsap.fromTo(ls, { opacity:0, y:32 }, { opacity:1, y:0, duration:0.6, ease:"power3.out", stagger:0.1 });
  else if (style === "word-fade")  { gsap.set(ws,{opacity:0}); gsap.to(ws,{opacity:1,duration:0.4,ease:"power2.out",stagger:0.07}); }
  else if (style === "word-bounce"){ gsap.set(ws,{opacity:0,y:22,scale:0.65}); gsap.to(ws,{opacity:1,y:0,scale:1,duration:0.5,ease:"back.out(2.2)",stagger:0.065}); }
  else if (style === "typewriter") { gsap.set(cs,{opacity:0}); gsap.to(cs,{opacity:1,duration:0.01,stagger:0.03,ease:"none"}); }
  else if (style === "blur-in")    gsap.fromTo(ws,{opacity:0,filter:"blur(18px)",scale:1.06},{opacity:1,filter:"blur(0px)",scale:1,duration:0.65,ease:"power2.out",stagger:0.07});
  else if (style === "echo") {
    gsap.set(el,{opacity:1});
    gsap.set(ws,{opacity:0,scale:0.35,y:20});
    gsap.to(ws,{opacity:1,scale:1,y:0,duration:0.4,ease:"back.out(2.8)",stagger:{amount:0.55}});
  }
}

// ── Standard line renderer — sacred words get larger + golden glow ────────────────
function renderLine(line: string, style: AnimStyle): React.ReactElement[] {
  if (style === "typewriter")
    return line.split("").map((ch, i) => <span key={i} className="pc" style={{display:"inline"}}>{ch==" "?"\u00a0":ch}</span>);
  return line.split(/(\s+)/).filter(Boolean).map((tok, i) => {
    if (!tok.trim()) return <span key={i}>&nbsp;</span>;
    if (isSacred(tok)) {
      return (
        <span key={i} className="pw" style={{
          display: "inline-block", marginRight: "0.22em",
          fontSize: "1.45em",
          fontWeight: 900,
          textShadow: "0 0 30px rgba(255,220,80,0.55), 0 3px 40px rgba(0,0,0,0.99)",
          verticalAlign: "middle",
        }}>{tok}</span>
      );
    }
    return <span key={i} className="pw" style={{display:"inline-block",marginRight:"0.22em"}}>{tok}</span>;
  });
}

// ── Echo word span maker — sacred words glow gold, others use standard sizing ──
function makeSpan(word: string, gIdx: number, efs: number): React.ReactElement {
  const sm      = echoWordSm(word, gIdx);
  const sacred  = isSacred(word);
  return (
    <span key={gIdx} className="pw" style={{
      fontSize:      Math.round(efs * sm),
      fontWeight:    900,
      letterSpacing: sm > 1 ? "-0.03em" : "-0.01em",
      lineHeight:    0.9,
      color:         "#fff",
      textShadow:    sacred
        ? "0 0 40px rgba(255,220,80,0.65), 0 3px 40px rgba(0,0,0,0.99)"
        : "0 3px 40px rgba(0,0,0,0.99)",
      textTransform: "uppercase",
      display:       "inline-block",
      verticalAlign: "baseline",
    }}>{word}</span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function LiveDisplayPage() {
  const [live, setLive]           = useState<LiveState | null>(null);
  const [connected, setConnected] = useState(false);
  const [echoText, setEchoText]   = useState("");

  const wrapperRef  = useRef<HTMLDivElement>(null);
  const lyricsRef   = useRef<HTMLDivElement>(null);
  const marqueeRef  = useRef<HTMLDivElement>(null);
  const lastKeyRef  = useRef("");
  const animatingRef= useRef(false);
  const echoTLRef   = useRef<gsap.core.Timeline | null>(null);
  const echoTimerRef= useRef<ReturnType<typeof setTimeout> | null>(null);

  // Box size — OBS Browser Source is always the right size (1920×1080)
  // but we measure anyway so fs = box.w * 0.10 matches the controller exactly.
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = wrapperRef.current; if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Font size: exactly 10% of box width — matches controller formula
  const fs = box.w > 0 ? Math.round(box.w * 0.10) : 192; // 192 ≈ 10% of 1920

  // ── Poll /api/live-state every 250 ms ────────────────────────────────────
  const poll = useCallback(async () => {
    try {
      const r = await fetch("/api/live-state", { cache: "no-store" });
      if (!r.ok) return;
      const data: LiveState = await r.json();
      setConnected(true);

      const key = `${data.updatedAt}`;
      if (key === lastKeyRef.current) return;
      lastKeyRef.current = key;

      const lyricsEl = lyricsRef.current;
      if (!lyricsEl) { setLive(data); return; }
      if (animatingRef.current) { setLive(data); return; }

      if (data.visible && data.lines.length > 0) {
        animatingRef.current = true;
        gsap.killTweensOf(lyricsEl);
        gsap.to(lyricsEl, {
          opacity: 0, duration: 0.25, ease: "power2.in",
          onComplete: () => {
            setLive(data);
            requestAnimationFrame(() => requestAnimationFrame(() => {
              gsap.set(lyricsEl, { opacity: 1 });
              animIn(lyricsEl, data.animStyle);
              animatingRef.current = false;
            }));
          },
        });
      } else {
        gsap.to(lyricsEl, {
          opacity: 0, duration: 0.35, ease: "power2.in",
          onComplete: () => { setLive(data); animatingRef.current = false; },
        });
      }
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 250);
    return () => clearInterval(id);
  }, [poll]);

  // ── Echo marquee — exact mirror of the useEffect in Screen ───────────────
  useEffect(() => {
    if (echoTLRef.current)  { echoTLRef.current.kill(); echoTLRef.current = null; }
    if (echoTimerRef.current) clearTimeout(echoTimerRef.current);
    if (lyricsRef.current)  gsap.set(lyricsRef.current, { scale: 1 });
    if (marqueeRef.current) gsap.set(marqueeRef.current, { opacity: 0 });
    setEchoText("");

    if (!live || !live.visible || live.animStyle !== "echo") return;

    setEchoText(live.lines[0] ?? "");
    echoTimerRef.current = setTimeout(() => {
      const container = marqueeRef.current;
      if (!container) return;
      const tracks = Array.from(container.querySelectorAll<HTMLElement>(".mqtrack"));
      gsap.to(container, { opacity: 1, duration: 0.7, ease: "power2.out" });
      tracks.forEach((track, i) => {
        const goLeft = i % 2 === 0;
        const dur = 18 + i * 2.5;
        const startFrac = (i * 0.13) % 0.5;
        if (goLeft) {
          gsap.fromTo(track, { x: `-${startFrac * 100}%` }, { x: "-50%", duration: dur * (0.5 - startFrac), ease: "none",
            onComplete: () => gsap.fromTo(track, { x: "0%" }, { x: "-50%", duration: dur, ease: "none", repeat: -1 }),
          });
        } else {
          gsap.fromTo(track, { x: `-${(0.5 - startFrac) * 100}%` }, { x: "0%", duration: dur * (0.5 - startFrac), ease: "none",
            onComplete: () => gsap.fromTo(track, { x: "-50%" }, { x: "0%", duration: dur, ease: "none", repeat: -1 }),
          });
        }
      });
      if (lyricsRef.current)
        gsap.to(lyricsRef.current, { scale: 1.018, duration: 5, ease: "sine.inOut", yoyo: true, repeat: -1, transformOrigin: "center" });
    }, 550);

    return () => {
      if (echoTLRef.current)  { echoTLRef.current.kill(); echoTLRef.current = null; }
      if (echoTimerRef.current) clearTimeout(echoTimerRef.current);
      const c = marqueeRef.current;
      if (c) { gsap.killTweensOf(c); gsap.set(c,{opacity:0}); gsap.killTweensOf(Array.from(c.querySelectorAll<HTMLElement>(".mqtrack"))); }
      if (lyricsRef.current) gsap.set(lyricsRef.current, { scale: 1 });
      setEchoText("");
    };
  }, [live]);

  // ── Echo content rendering — exact mirror of Screen's IIFE ───────────────
  const renderEcho = (data: LiveState, fsVal: number): React.ReactElement => {
    const allWords   = data.lines.flatMap(l => l.split(/\s+/).filter(Boolean));
    const echoAlign  = data.echoAlign ?? "center";
    const echoLinesV = data.echoLines ?? "auto";
    const lineCount  = echoLinesV === "auto" ? null : parseInt(echoLinesV);
    const jc  = echoAlign === "center" ? "center" : "flex-start";
    const ml  = echoAlign === "left"   ? "0" : "0 auto";

    const CHAR_W = 0.63;
    const GAP_R  = 0.18;
    const maxPx  = box.w * 0.88;

    const safeFsForRows = (rows: string[][], desiredFs: number): number => {
      let safe = desiredFs;
      let gIdx = 0;
      for (const row of rows) {
        const rowFactor = row.reduce((sum, word, wi) => {
          const sm = echoWordSm(word, gIdx + wi);
          return sum + word.length * CHAR_W * sm + (wi > 0 ? GAP_R : 0);
        }, 0);
        gIdx += row.length;
        if (rowFactor > 0) safe = Math.min(safe, maxPx / rowFactor);
      }
      return Math.round(Math.max(safe, fsVal * 0.80));
    };

    if (lineCount) {
      const rowSize = Math.ceil(allWords.length / lineCount);
      const rows: string[][] = [];
      for (let i = 0; i < allWords.length; i += rowSize) rows.push(allWords.slice(i, i + rowSize));
      const desired = fsVal * (lineCount === 2 ? 1.25 : 1.45);
      const echoFs  = safeFsForRows(rows, desired);
      let gIdx = 0;
      return (
        <div style={{ display:"flex", flexDirection:"column", alignItems: echoAlign === "center" ? "center" : "flex-start", gap:`${Math.round(echoFs*0.06)}px`, maxWidth:`${maxPx}px`, margin:ml }}>
          {rows.map((rw, ri) => (
            <div key={ri} style={{ display:"flex", justifyContent:jc, alignItems:"baseline", gap:`${Math.round(echoFs*0.18)}px` }}>
              {rw.map(word => makeSpan(word, gIdx++, echoFs))}
            </div>
          ))}
        </div>
      );
    }

    const maxWordLen = allWords.reduce((m, w) => Math.max(m, w.length), 0);
    const maxFsWord  = maxWordLen > 0 ? (maxPx * 0.80) / (maxWordLen * CHAR_W * 1.30) : fsVal;
    const autoFs     = Math.round(Math.min(fsVal, maxFsWord));
    return (
      <div style={{ display:"flex", flexWrap:"wrap", justifyContent:jc, alignItems:"baseline", gap:`${Math.round(autoFs*0.05)}px ${Math.round(autoFs*0.18)}px`, maxWidth:`${maxPx}px`, margin:ml }}>
        {allWords.map((word, i) => makeSpan(word, i, autoFs))}
      </div>
    );
  };

  const bgStyle    = BG_PRESETS[live?.bgIdx ?? 0] ?? BG_PRESETS[0];
  const isVisible  = live?.visible && (live?.lines?.length ?? 0) > 0;
  const NUM_ROWS   = 5;
  const GAP        = "\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0";

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "fixed", inset: 0,
        background: bgStyle,
        transition: "background 0.6s ease",
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxSizing: "border-box",
        padding: box.h > 0 ? `${box.h * 0.08}px ${box.w * 0.05}px` : "8% 5%",
      }}
    >
      {/* Video background — same as Screen component */}
      {live?.bgVideo && (
        <div style={{ position:"absolute", inset:0, overflow:"hidden", zIndex:0 }}>
          {live.bgVideo.type === "local" ? (
            <video
              key={live.bgVideo.url}
              src={live.bgVideo.url}
              autoPlay loop muted playsInline
              style={{ width:"100%", height:"100%", objectFit:"cover" }}
            />
          ) : (
            <iframe
              key={live.bgVideo.videoId}
              src={`https://www.youtube.com/embed/${live.bgVideo.videoId}?autoplay=1&loop=1&playlist=${live.bgVideo.videoId}&mute=1&muted=1&controls=0&disablekb=1&fs=0&modestbranding=1&iv_load_policy=3&enablejsapi=1`}
              style={{ width:"100%", height:"100%", border:"none", pointerEvents:"none" }}
              allow="autoplay; encrypted-media"
              title="video-bg"
            />
          )}
          {/* Dark scrim — keeps lyrics readable over video */}
          <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.45)" }} />
        </div>
      )}

      {/* Vignette */}
      <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.7) 100%)", pointerEvents:"none", zIndex:0 }} />
      {/* Stage glow */}
      <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse 70% 35% at 50% 25%, rgba(100,60,220,0.07) 0%, transparent 70%)", pointerEvents:"none", zIndex:0 }} />

      {/* Marquee Echo background — 5 scrolling outline rows */}
      {echoText && (
        <div ref={marqueeRef} style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", overflow:"hidden", opacity:0, zIndex:0, pointerEvents:"none" }}>
          {Array.from({ length: NUM_ROWS }, (_, i) => {
            const track = `${echoText}${GAP}${echoText}${GAP}`;
            return (
              <div key={i} style={{ flex:1, overflow:"hidden", display:"flex", alignItems:"center" }}>
                <div className="mqtrack" style={{
                  whiteSpace: "nowrap",
                  display: "inline-block",
                  fontSize: fs * 1.8,
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                  color: "rgba(255,255,255,0.14)",
                  userSelect: "none",
                }}>{track}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lyrics */}
      <div
        ref={lyricsRef}
        style={{ opacity:0, position:"relative", zIndex:1, width:"100%", textAlign:"center" }}
      >
        {isVisible && live && (
          live.animStyle === "echo" ? (
            renderEcho(live, fs)
          ) : (
            live.lines.map((line, i) => (
              <p key={`${live.updatedAt}-${i}`} className="pl" style={{
                margin: `0 0 ${Math.round(fs * 0.18)}px`,
                lineHeight: 1.15,
                fontSize: fs,
                fontWeight: 900,
                color: "#fff",
                textShadow: "0 3px 40px rgba(0,0,0,0.99), 0 2px 8px rgba(0,0,0,0.95)",
                letterSpacing: "-0.02em",
                display: "block", width: "100%",
                whiteSpace: "normal", wordBreak: "normal", overflowWrap: "normal",
              }}>
                {renderLine(line, live.animStyle)}
              </p>
            ))
          )
        )}
        {!isVisible && (
          <p style={{ fontSize: Math.max(12, Math.round(fs * 0.14)), color:"rgba(255,255,255,0.08)", letterSpacing:"0.1em", fontWeight:600 }}>● DISPLAY CLEAR</p>
        )}
      </div>

      {/* Status dot */}
      <div style={{ position:"fixed", bottom:12, right:16, fontSize:10, fontFamily:"monospace", fontWeight:700, letterSpacing:"0.05em", pointerEvents:"none", userSelect:"none", zIndex:99,
        color: connected ? "rgba(52,211,153,0.55)" : "rgba(239,68,68,0.55)" }}>
        {connected ? "● LIVE" : "● CONNECTING…"}
      </div>
    </div>
  );
}
