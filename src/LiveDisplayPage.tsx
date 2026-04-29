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

type AnimStyle = "fade" | "slide-up" | "word-fade" | "word-bounce" | "typewriter" | "blur-in" | "echo" | "breathe";

interface LiveState {
  songTitle: string;
  lines: string[];
  animStyle: AnimStyle;
  visible: boolean;
  updatedAt: number;
  bgIdx?: number;
  echoAlign?: "center" | "centered-left" | "left";
  echoLines?: "auto" | "2" | "3";
  echoLineHeight?: number;
  lyricsScale?: number;
  loopEnabled?: boolean;
  loopInterval?: number;
  bgVideo?: { type: "local"; url: string } | { type: "youtube"; videoId: string } | null;
  transitioning?: boolean;
  fadeScreen?: boolean;
  fadeScreenBg?: { type: "color"; color: string } | { type: "image-url"; url: string } | { type: "image-local"; url: string };
  _fadeOnly?: boolean; // when true: ONLY update overlay, skip lyric animation (fade toggle, not slide change)
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
  // Kill ALL tweens and clear stale GSAP inline styles before starting new animation
  gsap.killTweensOf([...ws, ...cs, ...ls, el]);
  gsap.set([...ws, ...cs, ...ls, el], { clearProps: "opacity,transform,filter,scale" });
  if      (style === "fade")       gsap.fromTo(el, { opacity:0 }, { opacity:1, duration:0.8, ease:"power2.out" });
  else if (style === "slide-up")   gsap.fromTo(ls, { opacity:0, y:32 }, { opacity:1, y:0, duration:0.6, ease:"power3.out", stagger:0.1 });
  else if (style === "word-fade")  { gsap.set(ls,{opacity:1}); gsap.set(ws,{opacity:0}); gsap.to(ws,{opacity:1,duration:0.4,ease:"power2.out",stagger:0.07}); }
  else if (style === "word-bounce"){ gsap.set(ls,{opacity:1}); gsap.set(ws,{opacity:0,y:22,scale:0.65}); gsap.to(ws,{opacity:1,y:0,scale:1,duration:0.5,ease:"back.out(2.2)",stagger:0.065}); }
  else if (style === "typewriter") { gsap.set(ls,{opacity:1}); gsap.set(cs,{opacity:0}); gsap.to(cs,{opacity:1,duration:0.01,stagger:0.03,ease:"none"}); }
  else if (style === "blur-in")    { gsap.set(ls,{opacity:1}); gsap.fromTo(ws,{opacity:0,filter:"blur(18px)",scale:1.06},{opacity:1,filter:"blur(0px)",scale:1,duration:0.65,ease:"power2.out",stagger:0.07}); }
  else if (style === "echo") {
    gsap.set(el,{opacity:1});
    gsap.set(ws,{opacity:0,scale:0.35,y:20});
    gsap.to(ws,{opacity:1,scale:1,y:0,duration:0.4,ease:"back.out(2.8)",stagger:{amount:0.55}});
  }
  else if (style === "breathe") {
    gsap.set(ls, { opacity:1 });
    gsap.set(ws, { opacity:0, scale:1.05, filter:"blur(6px)" });
    // Cap stagger so entrance finishes well before loop fires (~2.5s target)
    const breatheStagger = ws.length > 1 ? Math.min(0.45, 0.7 / ws.length) : 0.45;
    gsap.to(ws,  { opacity:1, scale:1, filter:"blur(0px)", duration:1.8, ease:"sine.inOut", stagger:breatheStagger });
  }
}

// ── Loop — smooth fade-out then replay entrance (no hard blink) ──────────────
// Returns a cleanup fn — the active flag prevents stale onComplete from firing animIn
function idleLoop(el: HTMLElement, style: AnimStyle, interval = 3500): () => void {
  let active = true;
  const id = setInterval(() => {
    if (!active) return;
    const targets = Array.from(el.querySelectorAll<HTMLElement>(".pw,.pc,.pl"));
    const fadeTargets = targets.length ? targets : [el];
    gsap.to(fadeTargets, {
      opacity: 0, duration: 0.25, ease: "power2.in",
      onComplete: () => { if (active) animIn(el, style); },
    });
  }, interval);
  return () => { active = false; clearInterval(id); };
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
  const [fadeBlack, setFadeBlack] = useState(false);
  const [fadeScreen, setFadeScreen] = useState<LiveState["fadeScreenBg"] | null>(null);
  // Keep last non-null bg so the image stays mounted during the CSS fade-out transition.
  // Without this the <img> unmounts instantly when fadeScreen becomes null, showing a black flash.
  const prevFadeScreenRef = useRef<LiveState["fadeScreenBg"] | null>(null);

  const wrapperRef  = useRef<HTMLDivElement>(null);
  const lyricsRef   = useRef<HTMLDivElement>(null);
  const marqueeRef  = useRef<HTMLDivElement>(null);
  const lastKeyRef  = useRef("");
  const animatingRef= useRef(false);
  const echoTLRef   = useRef<gsap.core.Timeline | null>(null);
  const echoTimerRef= useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopCleanupRef = useRef<(() => void) | null>(null);
  const rafRef         = useRef<number | null>(null);

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

      // Scene-switch transitioning signal: fade to black
      if (data.transitioning) {
        setFadeBlack(true);
        return;
      }
      setFadeBlack(false);
      lastKeyRef.current = key;

      // Fade Screen mode: show blank/image overlay — but STILL update live scene data
      // so the background is pre-loaded; when fade lifts there is no flash.
      if (data.fadeScreen) {
        const bg = data.fadeScreenBg ?? { type: "color", color: "#000" };
        prevFadeScreenRef.current = bg;
        setFadeScreen(bg);
      } else {
        setFadeScreen(null);
        // Note: prevFadeScreenRef.current intentionally NOT cleared here —
        // the overlay div uses it to keep the image rendered during the CSS fade-out.
      }

      // _fadeOnly: just update overlay state. Don't re-run lyric animation — the slide
      // content hasn't changed, only the fade screen toggled on or off.
      // Without this guard, toggling the fade screen causes a lyric flash/glitch in OBS.
      if (data._fadeOnly) return;

      const lyricsEl = lyricsRef.current;
      if (!lyricsEl) { setLive(data); return; }

      // ── Always cancel everything in flight first ──────────────────────────
      // 1. Stop the idle loop (active=false prevents stale onComplete from firing animIn)
      if (loopCleanupRef.current) { loopCleanupRef.current(); loopCleanupRef.current = null; }
      // 2. Cancel any pending RAF
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      // 3. Kill ALL in-flight tweens and clear stale inline GSAP styles
      gsap.killTweensOf(lyricsEl);
      const allChildren = Array.from(lyricsEl.querySelectorAll("*"));
      gsap.killTweensOf(allChildren);
      gsap.set(allChildren, { clearProps: "opacity,transform,filter,scale" });

      if (data.visible && data.lines.length > 0) {
        animatingRef.current = true;
        // Brief fade-out of current content, then swap + animate in
        gsap.to(lyricsEl, {
          opacity: 0, duration: 0.2, ease: "power2.in",
          onComplete: () => {
            setLive(data);
            // Double-RAF ensures new React DOM is painted before GSAP reads elements
            rafRef.current = requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                rafRef.current = null;
                gsap.set(lyricsEl, { opacity: 1 });
                gsap.set(Array.from(lyricsEl.querySelectorAll("*")), { clearProps: "opacity,transform,filter,scale" });
                animIn(lyricsEl, data.animStyle);
                animatingRef.current = false;
                if (data.loopEnabled !== false)
                  loopCleanupRef.current = idleLoop(lyricsEl, data.animStyle, data.loopInterval ?? 3500);
              })
            );
          },
        });
      } else {
        animatingRef.current = false;
        gsap.to(lyricsEl, {
          opacity: 0, duration: 0.35, ease: "power2.in",
          onComplete: () => setLive(data),
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
  // Track ALL marquee tweens so repeat:-1 tweens started in onComplete can be killed
  const marqueeTrackTweens = useRef<gsap.core.Tween[]>([]);

  useEffect(() => {
    if (echoTimerRef.current) { clearTimeout(echoTimerRef.current); echoTimerRef.current = null; }
    marqueeTrackTweens.current.forEach(t => t.kill());
    marqueeTrackTweens.current = [];
    if (marqueeRef.current) { gsap.killTweensOf(marqueeRef.current); gsap.set(marqueeRef.current, { opacity: 0 }); }
    if (lyricsRef.current)  { gsap.killTweensOf(lyricsRef.current); gsap.set(lyricsRef.current, { scale: 1, clearProps: "scale" }); }
    setEchoText("");

    if (!live || !live.visible || live.animStyle !== "echo") return;

    let cancelled = false;
    setEchoText(live.lines[0] ?? "");
    echoTimerRef.current = setTimeout(() => {
      if (cancelled) return;
      const container = marqueeRef.current;
      if (!container) return;
      const tracks = Array.from(container.querySelectorAll<HTMLElement>(".mqtrack"));
      gsap.to(container, { opacity: 1, duration: 0.7, ease: "power2.out" });
      tracks.forEach((track, i) => {
        const goLeft = i % 2 === 0;
        const dur = 18 + i * 2.5;
        const startFrac = (i * 0.13) % 0.5;
        if (goLeft) {
          const t1 = gsap.fromTo(track,
            { x: `-${startFrac * 100}%` },
            { x: "-50%", duration: dur * (0.5 - startFrac), ease: "none",
              onComplete: () => {
                if (cancelled) return;
                const t2 = gsap.fromTo(track, { x: "0%" }, { x: "-50%", duration: dur, ease: "none", repeat: -1 });
                marqueeTrackTweens.current.push(t2);
              }
            }
          );
          marqueeTrackTweens.current.push(t1);
        } else {
          const t1 = gsap.fromTo(track,
            { x: `-${(0.5 - startFrac) * 100}%` },
            { x: "0%", duration: dur * (0.5 - startFrac), ease: "none",
              onComplete: () => {
                if (cancelled) return;
                const t2 = gsap.fromTo(track, { x: "-50%" }, { x: "0%", duration: dur, ease: "none", repeat: -1 });
                marqueeTrackTweens.current.push(t2);
              }
            }
          );
          marqueeTrackTweens.current.push(t1);
        }
      });
      if (lyricsRef.current && !cancelled) {
        const breathe = gsap.to(lyricsRef.current, { scale: 1.018, duration: 5, ease: "sine.inOut", yoyo: true, repeat: -1, transformOrigin: "center" });
        marqueeTrackTweens.current.push(breathe as unknown as gsap.core.Tween);
      }
    }, 550);

    return () => {
      cancelled = true;
      if (echoTimerRef.current) { clearTimeout(echoTimerRef.current); echoTimerRef.current = null; }
      marqueeTrackTweens.current.forEach(t => t.kill());
      marqueeTrackTweens.current = [];
      if (marqueeRef.current) { gsap.killTweensOf(marqueeRef.current); gsap.set(marqueeRef.current, { opacity: 0 }); }
      if (lyricsRef.current)  { gsap.killTweensOf(lyricsRef.current); gsap.set(lyricsRef.current, { scale: 1, clearProps: "scale" }); }
      setEchoText("");
    };
  }, [live]); // eslint-disable-line

  // ── Echo content rendering — exact mirror of Screen's IIFE ───────────────
  const renderEcho = (data: LiveState, fsVal: number): React.ReactElement => {
    const allWords    = data.lines.flatMap(l => l.split(/\s+/).filter(Boolean));
    const echoAlign   = data.echoAlign ?? "center";
    const echoLinesV  = data.echoLines ?? "auto";
    const echoLineHeight = data.echoLineHeight ?? 1.0;
    const lineCount   = echoLinesV === "auto" ? null : parseInt(echoLinesV);
    const jc  = echoAlign === "center" ? "center" : "flex-start";
    const ml  = echoAlign === "left"   ? "0" : "0 auto";

    const CHAR_W = 0.63;
    const GAP_R  = 0.18;
    const maxPx  = box.w * 0.88;
    // Must match Screen: available height inside safe zone
    const availH = box.h * 0.82;

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
      const widthFs = safeFsForRows(rows, desired);
      // Height constraint — mirrors Screen logic exactly
      let gIdxH = 0;
      const rowMaxSms = rows.map(row => {
        const m = row.reduce((acc, w, wi) => Math.max(acc, echoWordSm(w, gIdxH + wi)), 0) || 1.0;
        gIdxH += row.length;
        return m;
      });
      const totalSmH = rowMaxSms.reduce((a, b) => a + b, 0);
      const gapH     = (rows.length - 1) * echoLineHeight * 0.10;
      const maxFsByH = availH / (totalSmH + gapH);
      const echoFs   = Math.min(widthFs, Math.round(maxFsByH));
      const rowGap   = Math.max(4, Math.round(echoFs * echoLineHeight * 0.10));
      let gIdx = 0;
      return (
        <div style={{ display:"flex", flexDirection:"column", alignItems: echoAlign === "center" ? "center" : "flex-start", gap:`${rowGap}px`, maxWidth:`${maxPx}px`, margin:ml }}>
          {rows.map((rw, ri) => (
            <div key={ri} style={{ display:"flex", justifyContent:jc, alignItems:"baseline", gap:`${Math.round(echoFs*0.18)}px` }}>
              {rw.map(word => makeSpan(word, gIdx++, echoFs))}
            </div>
          ))}
        </div>
      );
    }

    // Auto — width + height clamped, mirrors Screen exactly
    const maxWordLen = allWords.reduce((m, w) => Math.max(m, w.length), 0);
    const maxFsWord  = maxWordLen > 0 ? (maxPx * 0.80) / (maxWordLen * CHAR_W * 1.30) : fsVal;
    const estRows    = Math.max(1, Math.round(allWords.length / 3));
    const maxFsByH   = availH / (estRows * 1.40 + (estRows - 1) * echoLineHeight * 0.10);
    const autoFs     = Math.round(Math.min(fsVal, maxFsWord, maxFsByH));
    const autoRowGap = Math.max(2, Math.round(autoFs * echoLineHeight * 0.05));
    return (
      <div style={{ display:"flex", flexWrap:"wrap", justifyContent:jc, alignItems:"baseline", gap:`${autoRowGap}px ${Math.round(autoFs*0.18)}px`, maxWidth:`${maxPx}px`, margin:ml }}>
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
      {/* Fade-to-black scene transition overlay */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 100,
        background: "#000",
        opacity: fadeBlack ? 1 : 0,
        transition: "opacity 0.5s ease",
        pointerEvents: "none",
      }} />
      {/* Fade Screen overlay — always rendered so CSS opacity transition plays fully on deactivate.
           Uses prevFadeScreenRef so the media stays mounted during the 0.7s fade-out. */}
      {(() => {
        const bg = fadeScreen ?? prevFadeScreenRef.current;
        const bgUrl    = (bg as {type?:string;url?:string})?.url ?? "";
        const ytId     = (bg as {type?:string;videoId?:string})?.videoId ?? "";
        return (
          <div style={{
            position: "absolute", inset: 0, zIndex: 90,
            opacity: fadeScreen ? 1 : 0,
            transition: "opacity 0.7s ease",
            pointerEvents: "none",
            background: bg?.type === "color" ? (bg as {type:"color";color:string}).color : "#000",
          }}>
            {bg && (bg.type === "image-url" || bg.type === "image-local") && bgUrl && (
              <img src={bgUrl} alt=""
                style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
            )}
            {bg && bg.type === "video-local" && bgUrl && (
              <video key={bgUrl} src={bgUrl} autoPlay loop muted playsInline
                style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
            )}
            {bg && bg.type === "video-youtube" && ytId && (
              <iframe
                key={ytId}
                src={`https://www.youtube.com/embed/${ytId}?autoplay=1&loop=1&playlist=${ytId}&mute=1&muted=1&controls=0&disablekb=1&fs=0&modestbranding=1&iv_load_policy=3`}
                style={{ width:"100%", height:"100%", border:"none", pointerEvents:"none", display:"block" }}
                allow="autoplay; encrypted-media"
                title="fade-video-bg" />
            )}
          </div>
        );
      })()}
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

      {/* Lyrics — outer div holds user scale (React only, never GSAP). Inner lyricsRef is GSAP-only. */}
      <div style={{ position:"relative", zIndex:1, width:"100%", textAlign:"center",
        transform: `scale(${live?.lyricsScale ?? 1})`, transformOrigin:"center center" }}>
        <div
          ref={lyricsRef}
          style={{ opacity:0, width:"100%" }}
        >
        {isVisible && live && (
          live.animStyle === "echo" ? (
            renderEcho(live, fs)
          ) : (
            live.lines.map((line, i) => (
              <p key={`${live.updatedAt}-${i}`} className="pl" style={{
                margin: `0 0 ${Math.round(fs * (live.echoLineHeight ?? 1.0) * 0.18)}px`,
                lineHeight: live.echoLineHeight ?? 1.0,
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
        </div>{/* end lyricsRef inner div */}
      </div>{/* end scale wrapper outer div */}

      {/* Status dot */}
      <div style={{ position:"fixed", bottom:12, right:16, fontSize:10, fontFamily:"monospace", fontWeight:700, letterSpacing:"0.05em", pointerEvents:"none", userSelect:"none", zIndex:99,
        color: connected ? "rgba(52,211,153,0.55)" : "rgba(239,68,68,0.55)" }}>
        {connected ? "● LIVE" : "● CONNECTING…"}
      </div>
    </div>
  );
}
