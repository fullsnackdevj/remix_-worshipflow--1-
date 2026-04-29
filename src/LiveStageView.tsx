import React, { useState, useEffect, useRef } from "react";
import { Search, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Radio, Music2, Layers, Play, Wand2, AlignCenter, AlignLeft, Video, Upload, Copy, Check as CheckIcon, Settings, Zap, Heart, EyeOff, Image as ImageIcon, Monitor, Timer, PlusCircle, Minus } from "lucide-react";
import type { Song } from "./types";
import gsap from "gsap";

type AnimStyle = "word-fade" | "word-bounce" | "typewriter" | "blur-in" | "fade" | "slide-up" | "echo" | "breathe";
type BgVideo   = { type: "local"; url: string } | { type: "youtube"; videoId: string };
type FadeScreenBg =
  | { type: "color"; color: string }
  | { type: "image-url"; url: string }
  | { type: "image-local"; url: string }
  | { type: "video-local"; url: string }
  | { type: "video-youtube"; videoId: string };

// ── IndexedDB helpers — for large data like uploaded images —————————————————
// localStorage has a ~5MB total limit per origin; a 3-4MB image hits it silently.
// IndexedDB has gigabytes of space and is the correct API for binary/large blobs.
const _IDB_NAME  = "lsv_idb";
const _IDB_STORE = "kv";
function _idbOpen(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(_IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(_IDB_STORE);
    r.onsuccess = () => res(r.result);
    r.onerror   = () => rej(r.error);
  });
}
async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await _idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(_IDB_STORE, "readwrite");
    tx.objectStore(_IDB_STORE).put(value, key);
    tx.oncomplete = () => res();
    tx.onerror    = () => rej(tx.error);
  });
}
async function idbGet<T>(key: string): Promise<T | null> {
  const db = await _idbOpen();
  return new Promise((res, rej) => {
    const tx  = db.transaction(_IDB_STORE, "readonly");
    const req = tx.objectStore(_IDB_STORE).get(key);
    req.onsuccess = () => res((req.result ?? null) as T | null);
    req.onerror   = () => rej(req.error);
  });
}

function extractYtId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/v\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

interface LyricSlide {
  id: string;
  sectionLabel: string;
  slideNum: number;
  totalSlides: number;
  lines: string[];
  animStyle: AnimStyle;
}
interface LyricSection { label: string; slides: LyricSlide[]; }

const ANIM_OPTIONS: AnimStyle[] = ["word-fade","word-bounce","typewriter","blur-in","fade","slide-up","echo","breathe"];
const ANIM_LABELS:  Record<AnimStyle, string> = { "word-fade":"Word Fade","word-bounce":"Bounce","typewriter":"Type","blur-in":"Blur","fade":"Fade","slide-up":"Slide Up","echo":"Echo","breathe":"Breathe" };

const BG_PRESETS = [
  { label:"Stage Dark",  style:"linear-gradient(135deg,#0a0a14 0%,#1a0a2e 50%,#0d1a2e 100%)" },
  { label:"Deep Purple", style:"linear-gradient(135deg,#0d0014 0%,#1a003a 60%,#000814 100%)" },
  { label:"Warm Night",  style:"linear-gradient(135deg,#140a00 0%,#2e1500 60%,#0a0a00 100%)" },
  { label:"Pure Black",  style:"#000" },
];

function cleanLine(l: string) { return l.trimEnd().replace(/[,.]+$/, ""); }

function chunkLines(lines: string[]): string[][] {
  // 1 line per slide — maximizes text size on LED wall
  return lines.map(cleanLine).filter(l => l.trim()).map(line => [line]);
}

function parseSections(raw: string): LyricSection[] {
  if (!raw?.trim()) return [];
  // Matches: [Verse 1], (PRE-CHORUS), {Bridge}, Chorus:, INTRO, verse 2, etc.
  const HEADER = /^\s*[\[({]?((verse|pre[\s-]?chorus|chorus|bridge|intro|outro|tag|hook|interlude|refrain|coda|vamp)\s*\d*)[\])}]?:?\s*$/i;
  const rawSecs: { label: string; lines: string[] }[] = [];
  let label = "", buf: string[] = [];
  const flush = () => { const ne = buf.filter(l => l.trim()); if (ne.length && label) rawSecs.push({ label, lines: ne }); buf = []; };
  for (const line of raw.split("\n")) {
    const m = line.match(HEADER);
    if (m) { flush(); label = m[1].trim().replace(/\b\w/g, c => c.toUpperCase()).replace(/Pre\s*-?\s*Chorus/i,"Pre-Chorus"); }
    else buf.push(line);
  }
  flush();
  if (!rawSecs.length) {
    const ne = raw.split("\n").filter(l => l.trim());
    const LBLS = ["Verse 1","Pre-Chorus","Chorus","Verse 2","Bridge","Chorus 2","Outro"];
    for (let i = 0; i < ne.length; i += 4) rawSecs.push({ label: LBLS[Math.floor(i/4)] ?? `Section ${Math.floor(i/4)+1}`, lines: ne.slice(i, i+4) });
  }

  // ── Merge repeated labels so all [Chorus] blocks appear under ONE tab ───────
  // Without this, 3 [Chorus] headers create 3 separate section objects that render
  // stacked on top of each other instead of being combined into one tab.
  const merged: { label: string; lines: string[] }[] = [];
  for (const sec of rawSecs) {
    const existing = merged.find(m => m.label === sec.label);
    if (existing) {
      // Separator: blank line between repeated sections for visual grouping
      existing.lines.push("", ...sec.lines);
    } else {
      merged.push({ label: sec.label, lines: [...sec.lines] });
    }
  }

  let gIdx = 0;
  return merged.map(sec => {
    const chunks = chunkLines(sec.lines);
    const slides: LyricSlide[] = chunks.map((lines, i) => ({
      id: `slide-${gIdx++}`, sectionLabel: sec.label,
      slideNum: i+1, totalSlides: chunks.length, lines,
      animStyle: "word-fade" as AnimStyle,
    }));
    return { label: sec.label, slides };
  });
}


function splitWords(line: string) { return line.split(/(\s+)/).filter(Boolean); }

// ─ Sacred words — always render bigger (because it's God) ────────────────────
const SACRED_WORDS = new Set([
  'jesus','christ','diyos','dios','god','lord','yahweh','jehovah','emmanuel',
]);
function isSacred(word: string): boolean {
  // Strip punctuation for matching
  return SACRED_WORDS.has(word.toLowerCase().replace(/[^a-z]/g, ''));
}

// ─ Echo: two font sizes, same font, random-ish assignment ─────────────────────
const FUNC_WORDS = new Set(['a','an','the','to','of','in','at','by','for','on','and','or','but','is','are','was','were','i','we','he','she','it','my','our','your','his','her','its']);
function echoWordSm(word: string, gIdx: number): number {
  // Sacred words are BIGGEST — always elevated above everything
  if (isSacred(word)) return 1.75;
  // Function/connector words are always small; content words alternate BIG/SMALL
  if (FUNC_WORDS.has(word.toLowerCase())) return 0.62;
  const hash = word.toLowerCase().split('').reduce((a, c) => a + c.charCodeAt(0), 0) + gIdx * 11;
  // 2 out of 3 words are BIG, 1 out of 3 is SMALL — gives a natural mixed look
  return (hash % 3 === 0) ? 0.68 : 1.30;
}

function animIn(el: HTMLElement, style: AnimStyle) {
  const ws = Array.from(el.querySelectorAll<HTMLElement>(".pw"));
  const cs = Array.from(el.querySelectorAll<HTMLElement>(".pc"));
  const ls = Array.from(el.querySelectorAll<HTMLElement>(".pl"));
  gsap.killTweensOf([...ws,...cs,...ls,el]);
  if      (style==="fade")        gsap.fromTo(el,{opacity:0},{opacity:1,duration:0.8,ease:"power2.out"});
  else if (style==="slide-up")    gsap.fromTo(ls,{opacity:0,y:32},{opacity:1,y:0,duration:0.6,ease:"power3.out",stagger:0.1});
  else if (style==="word-fade")   { gsap.set(ls,{opacity:1}); gsap.set(ws,{opacity:0}); gsap.to(ws,{opacity:1,duration:0.4,ease:"power2.out",stagger:0.07}); }
  else if (style==="word-bounce") { gsap.set(ls,{opacity:1}); gsap.set(ws,{opacity:0,y:22,scale:0.65}); gsap.to(ws,{opacity:1,y:0,scale:1,duration:0.5,ease:"back.out(2.2)",stagger:0.065}); }
  else if (style==="typewriter")  { gsap.set(ls,{opacity:1}); gsap.set(cs,{opacity:0}); gsap.to(cs,{opacity:1,duration:0.01,stagger:0.03,ease:"none"}); }
  else if (style==="blur-in")     { gsap.set(ls,{opacity:1}); gsap.fromTo(ws,{opacity:0,filter:"blur(18px)",scale:1.06},{opacity:1,filter:"blur(0px)",scale:1,duration:0.65,ease:"power2.out",stagger:0.07}); }
  else if (style==="echo") {
    gsap.set(el, { opacity:1 });
    gsap.set(ws, { opacity:0, scale:0.35, y:20 });
    gsap.to(ws,  { opacity:1, scale:1, y:0, duration:0.4, ease:"back.out(2.8)", stagger:{ amount:0.55 } });
  }
  else if (style==="breathe") {
    gsap.set(ls, { opacity:1 });
    gsap.set(ws, { opacity:0, scale:1.05, filter:"blur(6px)" });
    // Cap stagger: total entrance time must finish well before the loop interval fires.
    // Target: entrance completes within ~2.5s regardless of word count.
    const breatheStagger = ws.length > 1 ? Math.min(0.45, 0.7 / ws.length) : 0.45;
    gsap.to(ws,  { opacity:1, scale:1, filter:"blur(0px)", duration:1.8, ease:"sine.inOut", stagger:breatheStagger });
  }
}

// ── Loop — smooth fade-out then replay entrance (no hard blink) ──────────────
// Returns a cleanup function instead of an interval ID — this prevents the
// onComplete callback from firing animIn after the loop has been cancelled.
function idleLoop(
  el: HTMLElement,
  style: AnimStyle,
  interval = 3500
): () => void {
  let active = true;
  const id = setInterval(() => {
    if (!active) return;
    const targets = Array.from(el.querySelectorAll<HTMLElement>(".pw,.pc,.pl"));
    const fadeTargets = targets.length ? targets : [el];
    gsap.to(fadeTargets, {
      opacity: 0, duration: 0.25, ease: "power2.in",
      // Guard: only call animIn if loop is still active for THIS slide
      onComplete: () => { if (active) animIn(el, style); },
    });
  }, interval);
  return () => { active = false; clearInterval(id); };
}

// ── Screen — strict 16:9, ResizeObserver-based font sizing ───────────────────
function Screen({ slide, bgStyle, echoAlign, echoLines, echoLineHeight, lyricsScale, loopEnabled, bgVideo, loopInterval = 3500, visible = true }: {
  slide: LyricSlide | null; bgStyle: string;
  echoAlign: "center" | "centered-left" | "left";
  echoLines: "auto" | "2" | "3";
  echoLineHeight: number;
  lyricsScale: number;
  loopEnabled: boolean;
  bgVideo: BgVideo | null;
  loopInterval?: number;
  visible?: boolean; // false when the right panel is hidden on mobile
}) {
  const wrapperRef  = useRef<HTMLDivElement>(null);
  const lyricsRef   = useRef<HTMLDivElement>(null);
  const keyRef      = useRef("");
  const [box, setBox] = useState({ w: 0, h: 0 });
  // Refs so loop closure always reads the LATEST prop values (avoids stale closure)
  const loopEnabledRef  = useRef(loopEnabled);
  const loopIntervalRef = useRef(loopInterval);
  useEffect(() => { loopEnabledRef.current  = loopEnabled;  }, [loopEnabled]);
  useEffect(() => { loopIntervalRef.current = loopInterval; }, [loopInterval]);
  // Refs for loop cleanup and RAF cancellation
  const loopCleanup = useRef<(() => void) | null>(null);
  const rafRef      = useRef<number | null>(null);
  // Marquee echo refs
  const marqueeRef  = useRef<HTMLDivElement>(null);
  const echoTL      = useRef<gsap.core.Timeline|null>(null);
  const echoTimer   = useRef<ReturnType<typeof setTimeout>|null>(null);
  const [echoText, setEchoText] = useState<string>("");

  // Compute strict 16:9 box that fits inside the wrapper.
  // Guard against display:none reads (clientWidth/Height = 0) so we don't
  // store a zero box that leaves lyrics invisible when the panel becomes visible.
  useEffect(() => {
    const el = wrapperRef.current; if (!el) return;
    const measure = () => {
      const pw = el.clientWidth, ph = el.clientHeight;
      if (pw === 0 || ph === 0) return; // panel is hidden — skip zero-size read
      const ratio = 16 / 9;
      let w = pw, h = pw / ratio;
      if (h > ph) { h = ph; w = ph * ratio; }
      setBox({ w: Math.floor(w), h: Math.floor(h) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // When the panel becomes visible (mobile tab switch to "preview"), re-measure
  // AND re-trigger the GSAP animation for the current slide.
  useEffect(() => {
    if (!visible) return;
    const el = wrapperRef.current; if (!el) return;
    // Force measure now that the container has real dimensions
    const pw = el.clientWidth, ph = el.clientHeight;
    if (pw > 0 && ph > 0) {
      const ratio = 16 / 9;
      let w = pw, h = pw / ratio;
      if (h > ph) { h = ph; w = ph * ratio; }
      setBox({ w: Math.floor(w), h: Math.floor(h) });
    }
    // Reset the key so the animation fires again for the current slide
    keyRef.current = "";
  }, [visible]);

  // GSAP animation when slide changes.
  // Guard: if the panel is not visible (display:none on mobile), don't consume the key
  // so the animation fires correctly when the tab becomes visible.
  useEffect(() => {
    const el = lyricsRef.current; if (!el) return;
    if (!visible) return; // panel hidden — let the visible-change effect re-trigger this
    const key = `${slide?.id ?? "clear"}-${slide?.animStyle ?? ""}`;
    if (key === keyRef.current) return;
    keyRef.current = key;

    // ── Cancel everything from the previous slide ──
    // 1. Stop the loop (sets active=false so pending onComplete callbacks are no-ops)
    if (loopCleanup.current) { loopCleanup.current(); loopCleanup.current = null; }
    // 2. Cancel any pending RAF from a previous slide switch
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    // 3. Kill ALL in-flight GSAP tweens on this element and every child
    gsap.killTweensOf(el);
    const allChildren = Array.from(el.querySelectorAll("*"));
    gsap.killTweensOf(allChildren);
    // Reset GSAP-managed inline styles → prevents stale opacity/transform bleed
    gsap.set(allChildren, { clearProps: "opacity,transform,filter,scale" });
    gsap.set(el, { clearProps: "opacity,transform" });

    if (!slide) { gsap.to(el, { opacity: 0, duration: 0.35, ease: "power2.out" }); return; }

    // Snap to visible, then animate in on next frame
    gsap.set(el, { opacity: 1 });
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      animIn(el, slide.animStyle);
      if (loopEnabledRef.current) loopCleanup.current = idleLoop(el, slide.animStyle, loopIntervalRef.current);
    });

    return () => {
      if (loopCleanup.current) { loopCleanup.current(); loopCleanup.current = null; }
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, [slide, visible]); // eslint-disable-line



  // ── Marquee Echo effect ────────────────────────────────────────────────────────
  // Full-screen scrolling rows of outline text, alternating directions
  const NUM_ROWS = 5;
  // Store ALL marquee tweens so repeat:-1 tweens started inside onComplete can be killed
  const marqueeTrackTweens = useRef<gsap.core.Tween[]>([]);

  useEffect(() => {
    // Kill previous echo state immediately
    if (echoTimer.current) { clearTimeout(echoTimer.current); echoTimer.current = null; }
    marqueeTrackTweens.current.forEach(t => t.kill());
    marqueeTrackTweens.current = [];
    if (marqueeRef.current) {
      gsap.killTweensOf(marqueeRef.current);
      gsap.set(marqueeRef.current, { opacity: 0 });
    }
    // Kill breathing tween on lyricsRef without touching opacity (slide effect owns opacity)
    if (lyricsRef.current) {
      gsap.killTweensOf(lyricsRef.current);
      gsap.set(lyricsRef.current, { scale: 1, clearProps: "scale" });
    }
    setEchoText("");
    if (!slide || slide.animStyle !== "echo") return;

    let cancelled = false; // guard: prevents setTimeout callback from running after cleanup

    setEchoText(slide.lines[0] ?? "");
    echoTimer.current = setTimeout(() => {
      if (cancelled) return;
      const container = marqueeRef.current;
      if (!container) return;
      const tracks = Array.from(container.querySelectorAll<HTMLElement>(".mqtrack"));

      gsap.to(container, { opacity:1, duration:0.7, ease:"power2.out" });

      tracks.forEach((track, i) => {
        const goLeft = i % 2 === 0;
        const dur = 18 + i * 2.5;
        const startFrac = (i * 0.13) % 0.5;
        if (goLeft) {
          const t1 = gsap.fromTo(track,
            { x: `-${startFrac * 100}%` },
            { x:"-50%", duration: dur * (0.5 - startFrac), ease:"none",
              onComplete: () => {
                if (cancelled) return;
                const t2 = gsap.fromTo(track, { x:"0%" }, { x:"-50%", duration:dur, ease:"none", repeat:-1 });
                marqueeTrackTweens.current.push(t2);
              }
            }
          );
          marqueeTrackTweens.current.push(t1);
        } else {
          const t1 = gsap.fromTo(track,
            { x: `-${(0.5 - startFrac) * 100}%` },
            { x:"0%", duration: dur * (0.5 - startFrac), ease:"none",
              onComplete: () => {
                if (cancelled) return;
                const t2 = gsap.fromTo(track, { x:"-50%" }, { x:"0%", duration:dur, ease:"none", repeat:-1 });
                marqueeTrackTweens.current.push(t2);
              }
            }
          );
          marqueeTrackTweens.current.push(t1);
        }
      });

      if (lyricsRef.current && !cancelled) {
        const breathe = gsap.to(lyricsRef.current, { scale:1.018, duration:5, ease:"sine.inOut", yoyo:true, repeat:-1, transformOrigin:"center" });
        marqueeTrackTweens.current.push(breathe as unknown as gsap.core.Tween);
      }
    }, 550);

    return () => {
      cancelled = true;
      if (echoTimer.current) { clearTimeout(echoTimer.current); echoTimer.current = null; }
      marqueeTrackTweens.current.forEach(t => t.kill());
      marqueeTrackTweens.current = [];
      if (marqueeRef.current) {
        gsap.killTweensOf(marqueeRef.current);
        gsap.set(marqueeRef.current, { opacity: 0 });
      }
      if (lyricsRef.current) {
        gsap.killTweensOf(lyricsRef.current);
        gsap.set(lyricsRef.current, { scale: 1, clearProps: "scale" });
      }
      setEchoText("");
    };
  }, [slide]); // eslint-disable-line

  const renderLine = (line: string, style: AnimStyle) => {
    if (style === "typewriter")
      return line.split("").map((ch, i) => <span key={i} className="pc" style={{ display:"inline" }}>{ch === " " ? "\u00a0" : ch}</span>);
    return splitWords(line).map((tok, i) => {
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
      return <span key={i} className="pw" style={{ display:"inline-block", marginRight:"0.22em" }}>{tok}</span>;
    });
  };

  // Font: 10% of box width — big for LED wall
  const fs = box.w > 0 ? Math.round(box.w * 0.10) : 52;

  return (
    // Letterbox wrapper — black background fills any leftover space
    <div ref={wrapperRef} style={{ width:"100%", height:"100%", background:"#000", display:"flex", alignItems:"center", justifyContent:"center" }}>
      {box.w > 0 && (
        // Strict 16:9 canvas
        <div style={{
          width: box.w, height: box.h,
          position: "relative",
          background: bgStyle,
          overflow: "hidden",
          flexShrink: 0,
          // Safe zone — 8% top/bottom, 5% left/right for maximum text width
          boxSizing: "border-box",
          padding: `${box.h * 0.08}px ${box.w * 0.05}px`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {/* Video background — rendered first so it sits beneath all overlays */}
          {bgVideo && (
            <div style={{ position:"absolute", inset:0, overflow:"hidden" }}>
              {bgVideo.type === "local" ? (
                <video key={bgVideo.url} src={bgVideo.url} autoPlay loop muted playsInline
                  style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              ) : (
                <iframe key={bgVideo.videoId}
                  src={`https://www.youtube.com/embed/${bgVideo.videoId}?autoplay=1&loop=1&playlist=${bgVideo.videoId}&mute=1&muted=1&controls=0&disablekb=1&fs=0&modestbranding=1&iv_load_policy=3&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`}
                  style={{ width:"100%", height:"100%", border:"none", pointerEvents:"none" }}
                  allow="autoplay; encrypted-media" title="video-bg"
                  onLoad={e => {
                    // Belt-and-suspenders: force mute via postMessage regardless of URL param
                    const fw = (e.target as HTMLIFrameElement).contentWindow;
                    if (fw) {
                      fw.postMessage('{"event":"command","func":"mute","args":""}', '*');
                      fw.postMessage('{"event":"command","func":"setVolume","args":[0]}', '*');
                    }
                  }} />
              )}
              {/* Dark scrim — keeps lyrics readable over any video */}
              <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.45)" }} />
            </div>
          )}

          {/* Vignette */}
          <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.7) 100%)", pointerEvents:"none" }} />
          {/* Stage glow */}
          <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse 70% 35% at 50% 25%, rgba(100,60,220,0.07) 0%, transparent 70%)", pointerEvents:"none" }} />

          {/* Status — top right */}
          <div style={{ position:"absolute", top:Math.round(box.h*0.03), right:Math.round(box.w*0.03), display:"flex", alignItems:"center", gap:5, zIndex:10 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:slide?"#ef4444":"#374151", boxShadow:slide?"0 0 10px #ef4444":"none", transition:"all 0.3s" }} />
            <span style={{ fontSize:Math.max(9, Math.round(box.w*0.012)), fontWeight:700, letterSpacing:"0.1em", color:slide?"#ef4444":"#4b5563", textTransform:"uppercase" }}>{slide?"LIVE":"CLEAR"}</span>
          </div>

          {/* Section label — top left (no anim label — operator-only, not for OBS) */}
          {slide && (
            <div style={{ position:"absolute", top:Math.round(box.h*0.03), left:Math.round(box.w*0.03), zIndex:10, display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:Math.max(9, Math.round(box.w*0.012)), fontWeight:700, color:"rgba(255,255,255,0.3)", letterSpacing:"0.12em", textTransform:"uppercase" }}>{slide.sectionLabel}</span>
              {slide.totalSlides > 1 && <span style={{ fontSize:Math.max(8, Math.round(box.w*0.011)), color:"rgba(255,255,255,0.18)" }}>{slide.slideNum}/{slide.totalSlides}</span>}
            </div>
          )}

          {/* Marquee Echo: full-screen scrolling outline rows behind main lyrics */}
          {echoText && (
            <div ref={marqueeRef} style={{
              position:"absolute", inset:0,
              display:"flex", flexDirection:"column",
              overflow:"hidden",
              opacity:0, zIndex:0, pointerEvents:"none",
            }}>
              {Array.from({ length: NUM_ROWS }, (_, i) => {
                const GAP = "\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0";
                const track = `${echoText}${GAP}${echoText}${GAP}`;
                return (
                  <div key={i} style={{ flex:1, overflow:"hidden", display:"flex", alignItems:"center" }}>
                    <div className="mqtrack" style={{
                      whiteSpace:"nowrap",
                      display:"inline-block",
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

          {/* Lyrics — outer div holds user scale (React only, no GSAP). Inner lyricsRef is GSAP-only. */}
          <div style={{ position:"relative", zIndex:1, width:"100%", textAlign:"center",
            transform: `scale(${lyricsScale ?? 1})`, transformOrigin:"center center" }}>
            <div ref={lyricsRef} style={{ opacity:0, width:"100%" }}>
            {slide ? (
              slide.animStyle === "echo" ? (
                // ─ Echo: content-aware font sizing — never clips ──────────────
                (() => {
                  const allWords = slide.lines.flatMap(l => l.split(/\s+/).filter(Boolean));
                  const lineCount = echoLines === "auto" ? null : parseInt(echoLines);
                  const jc = echoAlign === "center" ? "center" : "flex-start";
                  const ml = echoAlign === "left" ? "0" : "0 auto";

                  const CHAR_W = 0.63;
                  const GAP_R  = 0.18;
                  const maxPx  = box.w * 0.88;
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
                    return Math.round(Math.max(safe, fs * 0.80));
                  };

                  const makeSpan = (word: string, gIdx: number, efs: number) => {
                    const sm     = echoWordSm(word, gIdx);
                    const sacred = isSacred(word);
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
                  };

                  if (lineCount) {
                    const rowSize = Math.ceil(allWords.length / lineCount);
                    const rows: string[][] = [];
                    for (let i = 0; i < allWords.length; i += rowSize) rows.push(allWords.slice(i, i + rowSize));

                    const desired = fs * (lineCount === 2 ? 1.25 : 1.45);
                    const widthFs = safeFsForRows(rows, desired);
                    let gIdxH = 0;
                    const rowMaxSms = rows.map(row => {
                      const m = row.reduce((acc, w, wi) => Math.max(acc, echoWordSm(w, gIdxH + wi)), 0) || 1.0;
                      gIdxH += row.length;
                      return m;
                    });
                    const totalSmH = rowMaxSms.reduce((a, b) => a + b, 0);
                    const gapH    = (rows.length - 1) * echoLineHeight * 0.10;
                    const maxFsByH = availH / (totalSmH + gapH);
                    const echoFs  = Math.min(widthFs, Math.round(maxFsByH));
                    const rowGap  = Math.max(4, Math.round(echoFs * echoLineHeight * 0.10));
                    let gIdx = 0;
                    return (
                      <div style={{
                        display: "flex", flexDirection: "column",
                        alignItems: echoAlign === "center" ? "center" : "flex-start",
                        gap: `${rowGap}px`,
                        maxWidth: `${maxPx}px`,
                        margin: ml,
                      }}>
                        {rows.map((rw, ri) => (
                          <div key={ri} style={{ display:"flex", justifyContent: jc, alignItems:"baseline", gap:`${Math.round(echoFs * 0.18)}px` }}>
                            {rw.map(word => makeSpan(word, gIdx++, echoFs))}
                          </div>
                        ))}
                      </div>
                    );
                  }

                  const maxWordLen = allWords.reduce((m, w) => Math.max(m, w.length), 0);
                  const maxFsWord  = maxWordLen > 0 ? (maxPx * 0.80) / (maxWordLen * CHAR_W * 1.30) : fs;
                  const estRows    = Math.max(1, Math.round(allWords.length / 3));
                  const maxFsByH   = availH / (estRows * 1.40 + (estRows - 1) * echoLineHeight * 0.10);
                  const autoFs     = Math.round(Math.min(fs, maxFsWord, maxFsByH));
                  const autoRowGap = Math.max(2, Math.round(autoFs * echoLineHeight * 0.05));
                  return (
                    <div style={{
                      display: "flex", flexWrap: "wrap",
                      justifyContent: jc,
                      alignItems: "baseline",
                      gap: `${autoRowGap}px ${Math.round(autoFs * 0.18)}px`,
                      maxWidth: `${maxPx}px`,
                      margin: ml,
                    }}>
                      {allWords.map((word, i) => makeSpan(word, i, autoFs))}
                    </div>
                  );
                })()
              ) : (
                // ─ Normal rendering for all other styles ───────────────
                slide.lines.map((line, i) => (
                  <p key={`${slide.id}-${i}`} className="pl" style={{
                    margin:`0 0 ${Math.round(fs * echoLineHeight * 0.18)}px`,
                    lineHeight: echoLineHeight, fontSize: fs, fontWeight: 900,
                    color: "#fff",
                    textShadow: "0 3px 40px rgba(0,0,0,0.99), 0 2px 8px rgba(0,0,0,0.95)",
                    letterSpacing: "-0.02em", display: "block", width: "100%",
                    whiteSpace: "normal", wordBreak: "normal", overflowWrap: "normal",
                  }}>
                    {renderLine(line, slide.animStyle)}
                  </p>
                ))
              )
            ) : (
              <p style={{ fontSize: Math.max(12, Math.round(box.w * 0.014)), color:"rgba(255,255,255,0.08)", letterSpacing:"0.1em", fontWeight:600 }}>● DISPLAY CLEAR</p>
            )}
            </div>{/* end lyricsRef inner div */}
          </div>{/* end scale wrapper outer div */}
        </div>
      )}
    </div>
  );
}

function sectionColor(label: string) {
  const l = label.toLowerCase();
  if (l.includes("chorus"))  return { accent:"#a78bfa", bg:"rgba(139,92,246,0.1)",  border:"rgba(139,92,246,0.25)", active:"rgba(139,92,246,0.22)", activeBorder:"rgba(139,92,246,0.6)" };
  if (l.includes("pre"))     return { accent:"#fb923c", bg:"rgba(251,146,60,0.1)",  border:"rgba(251,146,60,0.25)", active:"rgba(251,146,60,0.22)", activeBorder:"rgba(251,146,60,0.55)" };
  if (l.includes("bridge"))  return { accent:"#34d399", bg:"rgba(52,211,153,0.1)",  border:"rgba(52,211,153,0.25)", active:"rgba(52,211,153,0.22)", activeBorder:"rgba(52,211,153,0.55)" };
  if (l.includes("intro")||l.includes("outro")) return { accent:"#94a3b8", bg:"rgba(100,116,139,0.1)", border:"rgba(100,116,139,0.25)", active:"rgba(100,116,139,0.22)", activeBorder:"rgba(100,116,139,0.55)" };
  return { accent:"#818cf8", bg:"rgba(99,102,241,0.1)", border:"rgba(99,102,241,0.25)", active:"rgba(99,102,241,0.22)", activeBorder:"rgba(99,102,241,0.55)" };
}

// ── Responsive hook ───────────────────────────────────────────────────────────
function useWindowWidth() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

// ── Preset types & defaults ───────────────────────────────────────────────────────────
type PresetName = "praise" | "worship";
interface LivePreset {
  name: string;
  animStyle: AnimStyle; loopInterval: number; loopEnabled: boolean;
  bgIdx: number; echoAlign: "center"|"centered-left"|"left";
  echoLines: "auto"|"2"|"3"; echoLineHeight: number;
  lyricsScale: number;
  bgVideo: BgVideo | null;
}
const DEFAULT_PRESETS: Record<PresetName, LivePreset> = {
  praise:  { name:"Praise",  animStyle:"word-fade", loopInterval:3500, loopEnabled:true, bgIdx:1, echoAlign:"center", echoLines:"auto", echoLineHeight:1.0, lyricsScale:1.0, bgVideo:null },
  worship: { name:"Worship", animStyle:"breathe",   loopInterval:5000, loopEnabled:true, bgIdx:3, echoAlign:"center", echoLines:"auto", echoLineHeight:1.3, lyricsScale:1.0, bgVideo:null },
};

interface Props { allSongs: Song[]; isAdmin: boolean; onToast: (t:string, m:string) => void; }

export default function LiveStageView({ allSongs }: Props) {
  const [query, setQuery]               = useState("");
  const [sceneSongIds, setSceneSongIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("lsv_scene_songs") ?? "[]") ?? []; } catch { return []; }
  });
  const [songDropdownOpen, setSongDropdownOpen] = useState(false);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [sections, setSections]         = useState<LyricSection[]>([]);
  const [activeSlide, setActiveSlide]   = useState<LyricSlide | null>(null);
  // Restore last selected song and section after mount (allSongs is async)
  const _restoredSelectedRef = useRef(false);
  // \u2500\u2500 Preset state \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // Guard: only accept valid preset names — stale "altar" etc. → "praise"
  const _validPreset = (v: string | null): PresetName =>
    (v === "praise" || v === "worship") ? v : "praise";

  const [activePreset, setActivePreset] = useState<PresetName>(() => {
    try { return _validPreset(localStorage.getItem("lsv_active_preset")); } catch { return "praise"; }
  });
  const [presets, setPresets] = useState<Record<PresetName, LivePreset>>(() => {
    try {
      const s = JSON.parse(localStorage.getItem("lsv_presets") ?? "{}");
      return {
        praise:  { ...DEFAULT_PRESETS.praise,  ...s.praise  },
        worship: { ...DEFAULT_PRESETS.worship, ...s.worship },
      };
    } catch { return { ...DEFAULT_PRESETS }; }
  });
  // Derive initial settings from the active preset (always valid)
  const _cur = (() => {
    try {
      const s    = JSON.parse(localStorage.getItem("lsv_presets") ?? "{}");
      const key  = _validPreset(localStorage.getItem("lsv_active_preset"));
      return { ...DEFAULT_PRESETS[key], ...s[key] };
    } catch { return DEFAULT_PRESETS.praise; }
  })();
  const [bgIdx,           setBgIdxState]      = useState<number>(_cur.bgIdx);
  const [echoAlign,       setEchoAlign]       = useState<"center"|"centered-left"|"left">(_cur.echoAlign);
  const [echoLines,       setEchoLines]       = useState<"auto"|"2"|"3">(_cur.echoLines);
  const [echoLineHeight,  setEchoLineHeight]  = useState<number>(_cur.echoLineHeight);
  const [lyricsScale,     setLyricsScale]     = useState<number>(_cur.lyricsScale ?? 1.0);
  const [loopEnabled,     setLoopEnabled]     = useState<boolean>(_cur.loopEnabled ?? true);
  const [defaultAnimStyle,setDefaultAnimStyle]= useState<AnimStyle>(_cur.animStyle);
  const [loopInterval,    setLoopInterval]    = useState<number>(_cur.loopInterval);
  // bgVideo is now per-preset — live value comes from the active preset on save
  const [bgVideo,         setBgVideoState]    = useState<BgVideo | null>(_cur.bgVideo ?? null);
  // Refs that always hold the latest values — used by toggleFadeScreen to avoid stale closures
  const bgIdxRef   = useRef<number>(_cur.bgIdx);
  const bgVideoRef = useRef<BgVideo | null>(_cur.bgVideo ?? null);
  const setBgIdx   = (v: number)           => { bgIdxRef.current   = v; setBgIdxState(v); };
  const setBgVideo = (v: BgVideo | null)   => { bgVideoRef.current = v; setBgVideoState(v); };
  // Per-preset YouTube URL input (draft only, cleared when modal opens)
  const [ytInputs, setYtInputs] = useState<Record<PresetName, string>>({ praise:"", worship:"" });

  const [settingsOpen,  setSettingsOpen]  = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  // Ref so saveFadeScreenBg closure can read settingsOpen without stale capture
  const settingsOpenRef = useRef(false);
  const [echoApplied,   setEchoApplied]  = useState(() => _cur.animStyle === "echo");
  const [showVideoPanel, setShowVideoPanel] = useState(false);
  const [obsUrlCopied,   setObsUrlCopied]   = useState(false);
  const [activeSection,  setActiveSectionState]  = useState<string | null>(() => {
    try { return localStorage.getItem("lsv_active_section") ?? null; } catch { return null; }
  });
  const setActiveSection = (v: string | null) => {
    setActiveSectionState(v);
    try {
      if (v) localStorage.setItem("lsv_active_section", v);
      else localStorage.removeItem("lsv_active_section");
    } catch {}
  };
  const [mobileTab,      setMobileTab]       = useState<"slides"|"preview">("slides");
  const [autoPresetToast, setAutoPresetToast] = useState<string | null>(null);
  const isMobile = useWindowWidth() <= 700;

  // ── Modal draft state — edits both presets before committing on Save ────────
  const [settingsTab,     setSettingsTab]     = useState<"praise" | "worship" | "fade">("praise");
  const [modalDrafts,     setModalDrafts]     = useState<Record<PresetName, LivePreset>>({ ...DEFAULT_PRESETS });
  // presetActivated: always false on load — user must explicitly tap a preset pill each session
  const [presetActivated, setPresetActivated] = useState<boolean>(false);

  // ── Fade Screen state ─────────────────────────────────────────────────────
  // Default ON — OBS starts faded/black when module opens
  const [fadeScreenActive, setFadeScreenActive] = useState(() =>
    localStorage.getItem("lsv_fade_active") !== "0" // default true; 0 = explicitly off
  );
  // Ref mirrors state so pushToFirestore always reads the latest value (no stale closure)
  const fadeScreenActiveRef = useRef(
    localStorage.getItem("lsv_fade_active") !== "0"
  );
  const [fadeScreenBg, setFadeScreenBg] = useState<FadeScreenBg>(() => {
    try { return JSON.parse(localStorage.getItem("lsv_fade_screen") ?? "null") ?? { type: "color", color: "#000000" }; }
    catch { return { type: "color", color: "#000000" }; }
  });
  // Ref mirrors fadeScreenBg state so toggleFadeScreen always reads the latest value (no stale closure)
  const fadeScreenBgRef = useRef<FadeScreenBg>((() => {
    try { return JSON.parse(localStorage.getItem("lsv_fade_screen") ?? "null") ?? { type: "color", color: "#000000" }; }
    catch { return { type: "color", color: "#000000" }; }
  })());
  // Draft for the settings modal — init from localStorage so it survives hot reload / server restart
  const [modalFadeScreenBg, setModalFadeScreenBg] = useState<FadeScreenBg>(() => {
    try { return JSON.parse(localStorage.getItem("lsv_fade_screen") ?? "null") ?? { type: "color", color: "#000000" }; }
    catch { return { type: "color", color: "#000000" }; }
  });
  const [fadeImageUrlInput, setFadeImageUrlInput] = useState("");

  const toggleFadeScreen = () => {
    const next = !fadeScreenActive;
    fadeScreenActiveRef.current = next;
    setFadeScreenActive(next);
    // Persist so hard refresh remembers the last state
    localStorage.setItem("lsv_fade_active", next ? "1" : "0");

    // Build the current scene payload — always needed so OBS server state stays complete
    const curBgIdx   = bgIdxRef.current;
    const curBgVideo = bgVideoRef.current;
    const slide = activeSlide;
    const sceneBase = slide
      ? { songTitle: selectedSong?.title ?? "", lines: slide.lines, animStyle: slide.animStyle, visible: true,  bgIdx: curBgIdx, echoAlign, echoLines, echoLineHeight, lyricsScale, loopEnabled, bgVideo: curBgVideo, loopInterval }
      : { songTitle: "",                        lines: [],          animStyle: "word-fade",     visible: false, bgIdx: curBgIdx, echoAlign, echoLines, echoLineHeight, lyricsScale, loopEnabled, bgVideo: curBgVideo, loopInterval };

    if (next) {
      // ── ACTIVATE fade ────────────────────────────────────────────────────────
      // Push FULL scene + fadeScreen:true so the server retains all scene data.
      // OBS display will show the overlay AND pre-load the scene behind it — no flash.
      fetch("/api/live-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sceneBase, fadeScreen: true, fadeScreenBg: fadeScreenBgRef.current }),
      }).catch(() => {});
    } else {
      // ── DEACTIVATE fade ───────────────────────────────────────────────────────
      // _fadeOnly:true tells the OBS display to ONLY lift the overlay.
      // It will NOT run a new animIn so the lyrics don't flash during reveal.
      fetch("/api/live-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sceneBase, fadeScreen: false, _fadeOnly: true }),
      }).catch(() => {});
    }
  };

  // Updates the fade screen background.
  // WHILE THE SETTINGS MODAL IS OPEN: only updates the modal draft — does NOT
  // touch live state or push to OBS. This means the user can freely change
  // settings and Cancel to revert without any OBS side effects.
  // OUTSIDE THE MODAL (e.g. direct API calls): commits live state + pushes to OBS.
  const saveFadeScreenBg = (bg: FadeScreenBg) => {
    // Always persist to storage so large file uploads aren't lost on Cancel
    if (bg.type === "image-local" || bg.type === "video-local") {
      idbSet("lsv_fade_screen", bg).catch(e =>
        console.warn("[LiveStage] IDB write failed:", e)
      );
      try { localStorage.removeItem("lsv_fade_screen"); } catch {}
    } else {
      try { localStorage.setItem("lsv_fade_screen", JSON.stringify(bg)); } catch (e) {
        console.warn("[LiveStage] localStorage write failed:", e);
      }
      idbSet("lsv_fade_screen", bg).catch(() => {});
    }

    if (settingsOpenRef.current) {
      // Modal is open — only update draft, leave live state + OBS untouched
      setModalFadeScreenBg(bg);
    } else {
      // Outside modal — commit everything and push to OBS
      setModalFadeScreenBg(bg);
      setFadeScreenBg(bg);
      fadeScreenBgRef.current = bg;
      if (fadeScreenActiveRef.current) {
        fetch("/api/live-push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fadeScreen: true, fadeScreenBg: bg, updatedAt: Date.now() }),
        }).catch(() => {});
      }
    }
  };

  // ── Resolve preset from song tags ───────────────────────────────────
  // Rules: any tag whose name contains 'joyful'  → praise
  //        any tag whose name contains 'solemn'  → worship
  //        otherwise → null (no auto-switch)
  const resolvePresetFromSong = (song: Song): PresetName | null => {
    const names = (song.tags ?? []).map(t => t.name.toLowerCase());
    if (names.some(n => n.includes("joyful")))  return "praise";
    if (names.some(n => n.includes("solemn")))  return "worship";
    return null;
  };

  // Song click handler — selects song, clears previous slide immediately, auto-applies preset from tags
  const handleSongSelect = (song: Song) => {
    // Wipe ALL previous-song state in the same React batch:
    // sections + activeSlide + activeSection must be cleared here — NOT left to the
    // selectedSong useEffect — so old slides never appear on top of the new song.
    setSections([]);
    setActiveSlide(null);
    setActiveSectionState(null); // raw setter: skip the localStorage write for this transient clear
    setSelectedSong(song);
    // Persist selected song ID so it survives server restarts
    try { localStorage.setItem("lsv_selected_song_id", song.id); } catch {}
    const resolved = resolvePresetFromSong(song);
    if (resolved && resolved !== activePreset) {
      applyPreset(resolved);
      const label = resolved === "praise" ? "Praise" : "Worship";
      setAutoPresetToast(`⚡ Auto-switched to ${label} scene`);
      setTimeout(() => setAutoPresetToast(null), 3000);
    }
  };

  // Restore last selected song from allSongs once they are available (async load)
  // _restoredSelectedRef guards against double-restore (StrictMode / re-renders)
  useEffect(() => {
    if (_restoredSelectedRef.current) return;        // already restored
    if (allSongs.length === 0) return;               // songs not loaded yet
    _restoredSelectedRef.current = true;
    try {
      const savedId = localStorage.getItem("lsv_selected_song_id");
      if (!savedId) return;
      const song = allSongs.find(s => s.id === savedId);
      if (song) {
        // Restore silently — no OBS push, no preset auto-switch on restore
        setSelectedSong(song);
      }
    } catch { /* noop */ }
  }, [allSongs]); // eslint-disable-line

  // Restore fade screen background from IndexedDB on mount.
  // IDB is async so we can't read it in useState initializer — this effect patches
  // the state after mount. If localStorage already has a valid non-image value it's
  // used immediately; IDB overrides it if the user had uploaded an image.
  // IMPORTANT: After restoring, re-push to OBS if fade is active so OBS never
  // stays black after a hard refresh.
  useEffect(() => {
    idbGet<FadeScreenBg>("lsv_fade_screen").then(bg => {
      if (!bg) return;
      setFadeScreenBg(bg);
      setModalFadeScreenBg(bg);
      fadeScreenBgRef.current = bg;
      // Re-sync OBS with the restored background (small delay so React commits state first)
      if (fadeScreenActiveRef.current) {
        setTimeout(() => {
          fetch("/api/live-push", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fadeScreen: true, fadeScreenBg: bg, updatedAt: Date.now() }),
          }).catch(() => {});
        }, 200);
      }
    }).catch(() => {});
  }, []); // eslint-disable-line


  const openSettings = () => {
    settingsOpenRef.current = true;
    setSettingsOpen(true);
    // Normalize presets (old lsv_presets may not have bgVideo field)
    const normalizedPraise  = { ...presets.praise,  bgVideo: presets.praise.bgVideo  ?? null };
    const normalizedWorship = { ...presets.worship, bgVideo: presets.worship.bgVideo ?? null };
    // Migrate legacy lsv_bg_video to the active preset if not already set
    const legacyVideo = (() => { try { return JSON.parse(localStorage.getItem("lsv_bg_video") ?? "null"); } catch { return null; } })();
    if (legacyVideo && !normalizedPraise.bgVideo && activePreset === "praise")   normalizedPraise.bgVideo  = legacyVideo;
    if (legacyVideo && !normalizedWorship.bgVideo && activePreset === "worship") normalizedWorship.bgVideo = legacyVideo;
    // Clear stale legacy local video URLs that pointed to the old shared endpoint
    const isStaleLocalUrl = (v: LivePreset["bgVideo"]) =>
      v?.type === "local" && (v.url === "/api/live-bg-video" || !v.url.includes("/api/live-bg-video/"));
    if (isStaleLocalUrl(normalizedPraise.bgVideo))  normalizedPraise.bgVideo  = null;
    if (isStaleLocalUrl(normalizedWorship.bgVideo)) normalizedWorship.bgVideo = null;
    setModalDrafts({ praise: normalizedPraise, worship: normalizedWorship });
    setModalFadeScreenBg({ ...fadeScreenBg }); // snapshot current fade bg into draft
    setFadeImageUrlInput("");
    setYtInputs({ praise:"", worship:"" }); // clear YouTube inputs
    setSettingsTab(presetActivated ? activePreset : "praise");

  };

  const updateDraft = (preset: PresetName, key: keyof LivePreset, value: unknown) =>
    setModalDrafts(prev => ({ ...prev, [preset]: { ...prev[preset], [key]: value } }));

  // Auto-save to legacy key (backwards compat for OBS display page)
  useEffect(() => {
    localStorage.setItem("lsv_settings", JSON.stringify({ bgIdx, echoAlign, echoLines, echoLineHeight, animStyle: defaultAnimStyle }));
  }, [bgIdx, echoAlign, echoLines, echoLineHeight, defaultAnimStyle]);

  // ── applyPreset — pre-loads scene in OBS even while Fade Screen is active ───
  const applyPreset = (name: PresetName) => {
    const p = presets[name];
    // Always update internal state regardless of fade
    setActivePreset(name);
    setPresetActivated(true);
    setBgIdx(p.bgIdx);
    setEchoAlign(p.echoAlign);
    setEchoLines(p.echoLines);
    setEchoLineHeight(p.echoLineHeight);
    setLyricsScale(p.lyricsScale ?? 1.0);
    setLoopEnabled(p.loopEnabled ?? true);
    setDefaultAnimStyle(p.animStyle);
    setLoopInterval(p.loopInterval);
    setEchoApplied(p.animStyle === "echo");
    setBgVideo(p.bgVideo ?? null); // switch per-preset video background
    setSections(prev => prev.map(sec => ({ ...sec, slides: sec.slides.map(s => ({ ...s, animStyle: p.animStyle })) })));
    setActiveSlide(prev => prev ? { ...prev, animStyle: p.animStyle } : prev);
    localStorage.setItem("lsv_active_preset", name);
    if (fadeScreenActiveRef.current) {
      // Fade is active — pre-load the new scene behind the overlay (no transition flash)
      // Include fadeScreen:true so the overlay stays; display page updates background silently
      fetch("/api/live-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fadeScreen: true, fadeScreenBg,
          bgIdx: p.bgIdx, echoAlign: p.echoAlign, echoLines: p.echoLines,
          echoLineHeight: p.echoLineHeight, bgVideo: p.bgVideo ?? null,
          loopInterval: p.loopInterval, loopEnabled: p.loopEnabled ?? true, visible: false, lines: [], animStyle: p.animStyle,
          updatedAt: Date.now(),
        }),
      }).catch(() => {});
    } else {
      // Fade is off — trigger normal scene transition
      fetch("/api/live-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transitioning: true, updatedAt: Date.now() }),
      }).catch(() => {});
    }
  };

  // Save button — saves BOTH preset drafts + fade screen draft, then applies
  const saveSettings = () => {
    try {
      // Strip any large base64 local video from drafts before persisting
      // (local videos are served from server, no need to store binary in localStorage)
      const sanitizedDrafts: Record<PresetName, LivePreset> = {
        praise:  { ...modalDrafts.praise,  bgVideo: modalDrafts.praise.bgVideo  ?? null },
        worship: { ...modalDrafts.worship, bgVideo: modalDrafts.worship.bgVideo ?? null },
      };
      const newPresets = sanitizedDrafts;
      setPresets(newPresets);
      // Remove old shared video key to keep localStorage clean
      localStorage.removeItem("lsv_bg_video");
      localStorage.setItem("lsv_presets",       JSON.stringify(newPresets));
      localStorage.setItem("lsv_active_preset", activePreset);
      // Apply the active preset's draft to live state
      const live = newPresets[activePreset];
      setBgIdx(live.bgIdx);
      setEchoAlign(live.echoAlign);
      setEchoLines(live.echoLines);
      setEchoLineHeight(live.echoLineHeight);
      setLyricsScale(live.lyricsScale ?? 1.0);
      setLoopEnabled(live.loopEnabled ?? true);
      setDefaultAnimStyle(live.animStyle);
      setLoopInterval(live.loopInterval);
      setEchoApplied(live.animStyle === "echo");
      setBgVideo(live.bgVideo ?? null); // commit per-preset video BG
      setSections(prev => prev.map(sec => ({ ...sec, slides: sec.slides.map(s => ({ ...s, animStyle: live.animStyle })) })));
      setActiveSlide(prev => prev ? { ...prev, animStyle: live.animStyle } : prev);
      localStorage.setItem("lsv_settings", JSON.stringify({ bgIdx: live.bgIdx, echoAlign: live.echoAlign, echoLines: live.echoLines, echoLineHeight: live.echoLineHeight, animStyle: live.animStyle }));
      // Commit fade screen draft — route image-local to IDB, others to localStorage
      setFadeScreenBg(modalFadeScreenBg);
      fadeScreenBgRef.current = modalFadeScreenBg;
      if (modalFadeScreenBg.type === "image-local" || modalFadeScreenBg.type === "video-local") {
        idbSet("lsv_fade_screen", modalFadeScreenBg).catch(() => {});
        try { localStorage.removeItem("lsv_fade_screen"); } catch {}
      } else {
        try { localStorage.setItem("lsv_fade_screen", JSON.stringify(modalFadeScreenBg)); } catch {}
        idbSet("lsv_fade_screen", modalFadeScreenBg).catch(() => {});
      }
      // Push to OBS if fade is active — use the just-committed value
      if (fadeScreenActiveRef.current) {
        fetch("/api/live-push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fadeScreen: true, fadeScreenBg: modalFadeScreenBg, updatedAt: Date.now() }),
        }).catch(() => {});
      }
      setSettingsSaved(true);
      setTimeout(() => { setSettingsSaved(false); setSettingsOpen(false); }, 1500);
    } catch (err) {
      console.error("[saveSettings] Error:", err);
      // Still close the modal so the user isn't stuck
      setSettingsOpen(false);
    }
  };

  // ── No global bgVideo localStorage persistence — bgVideo lives in lsv_presets per-preset ──

  const pushToFirestore = (slide: LyricSlide | null) => {
    const payload = slide
      ? { songTitle: selectedSong?.title ?? "", lines: slide.lines, animStyle: slide.animStyle, visible: true,  bgIdx, echoAlign, echoLines, echoLineHeight, lyricsScale, loopEnabled, bgVideo, loopInterval }
      : { songTitle: "",                        lines: [],          animStyle: "word-fade",     visible: false, bgIdx, echoAlign, echoLines, echoLineHeight, lyricsScale, loopEnabled, bgVideo, loopInterval };
    if (fadeScreenActiveRef.current) {
      // Fade is active — pre-load scene data behind overlay, keep fadeScreen:true so overlay stays
      fetch("/api/live-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, fadeScreen: true, fadeScreenBg, updatedAt: Date.now() }),
      }).catch(() => {});
    } else {
      fetch("/api/live-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => {});
    }
  };

  // On mount: push initial fade screen so OBS starts black immediately
  useEffect(() => {
    const bg: FadeScreenBg = (() => { try { return JSON.parse(localStorage.getItem("lsv_fade_screen") ?? "null") ?? { type: "color", color: "#000000" }; } catch { return { type: "color", color: "#000000" }; } })();
    fetch("/api/live-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fadeScreen: true, fadeScreenBg: bg, updatedAt: Date.now() }),
    }).catch(() => {});
  }, []);

  useEffect(() => { pushToFirestore(activeSlide); }, [activeSlide, bgIdx, echoAlign, echoLines, echoLineHeight, bgVideo]); // eslint-disable-line

  useEffect(() => {
    // Always wipe sections first so old song slides are never visible during the parse
    setSections([]);
    setActiveSlide(null);
    setActiveSectionState(null);
    if (!selectedSong) return;
    const parsed = parseSections(selectedSong.lyrics);
    const withStyle = parsed.map(sec => ({ ...sec, slides: sec.slides.map(s => ({ ...s, animStyle: defaultAnimStyle })) }));
    setSections(withStyle);
  }, [selectedSong]); // eslint-disable-line

  const setSlideAnim = (slideId: string, anim: AnimStyle) => {
    setSections(prev => prev.map(sec => ({ ...sec, slides: sec.slides.map(s => s.id===slideId ? { ...s, animStyle: anim } : s) })));
    setActiveSlide(prev => prev?.id===slideId ? { ...prev, animStyle: anim } : prev);
  };

  const setAllAnim = (anim: AnimStyle) => {
    setDefaultAnimStyle(anim);
    setSections(prev => prev.map(sec => ({ ...sec, slides: sec.slides.map(s => ({ ...s, animStyle: anim })) })));
    setActiveSlide(prev => prev ? { ...prev, animStyle: anim } : prev);
  };

  // ── Scene playlist helpers ────────────────────────────────────────────────
  const addToScene = (song: Song) => {
    setSceneSongIds(prev => {
      if (prev.includes(song.id)) return prev;
      const next = [...prev, song.id];
      try { localStorage.setItem("lsv_scene_songs", JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const removeFromScene = (songId: string) => {
    setSceneSongIds(prev => {
      const next = prev.filter(id => id !== songId);
      try { localStorage.setItem("lsv_scene_songs", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const sceneSongs = sceneSongIds.map(id => allSongs.find(s => s.id === id)).filter(Boolean) as Song[];

  const filtered = query.trim()
    ? allSongs.filter(s => s.title.toLowerCase().includes(query.toLowerCase()) || (s.artist??"").toLowerCase().includes(query.toLowerCase()))
    : allSongs;

  // Keyboard nav — cross-section aware
  // All slides flattened in section order for seamless up/down navigation
  const allSectionSlides = sections.flatMap(sec => sec.slides);
  const sectionSlides = activeSection
    ? (sections.find(s => s.label === activeSection)?.slides ?? [])
    : (sections[0]?.slides ?? []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (!allSectionSlides.length) return;
      const globalIdx = activeSlide ? allSectionSlides.findIndex(s => s.id === activeSlide.id) : -1;
      if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (globalIdx < allSectionSlides.length - 1) {
          const next = allSectionSlides[globalIdx + 1];
          // If crossing into a new section, switch the active tab
          if (next.sectionLabel !== activeSlide?.sectionLabel) setActiveSection(next.sectionLabel);
          setActiveSlide(next);
        }
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        if (globalIdx <= 0) { setActiveSlide(null); return; }
        const prev = allSectionSlides[globalIdx - 1];
        if (prev.sectionLabel !== activeSlide?.sectionLabel) setActiveSection(prev.sectionLabel);
        setActiveSlide(prev);
      } else if (e.key === "Escape") {
        setActiveSlide(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allSectionSlides, activeSlide, activeSection]); // eslint-disable-line

  // Auto-scroll active slide card into view when changed by keyboard
  useEffect(() => {
    if (!activeSlide) return;
    const el = document.querySelector<HTMLElement>(`[data-slide-id="${activeSlide.id}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeSlide]);

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:"var(--wf-surface,#07090f)", color:"#fff", overflow:"hidden", fontFamily:"inherit" }}>

      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <div style={{ flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between", padding: isMobile ? "8px 12px" : "10px 20px", borderBottom:"1px solid rgba(255,255,255,0.07)", minHeight: isMobile ? 52 : 56 }}>
        <div style={{ display:"flex", alignItems:"center", gap: isMobile ? 9 : 12 }}>
          <Radio size={18} color="rgba(255,255,255,0.85)" />
          <div>
            <p style={{ fontSize: isMobile ? 13 : 14, fontWeight:700, margin:0, letterSpacing:"-0.01em" }}>Live Stage</p>
            {!isMobile && <p style={{ fontSize:11, color:"rgba(255,255,255,0.35)", margin:0 }}>LED wall · per-slide animation · centered lyrics</p>}
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap: isMobile ? 5 : 8 }}>
          {/* ── Fade in OBS Screen toggle (FIRST) ── */}
          <button onClick={toggleFadeScreen}
            title={fadeScreenActive ? "OBS Faded — click to reveal" : "Fade in OBS Screen"}
            style={isMobile ? {
              width:36, height:36, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
              cursor:"pointer", transition:"all 0.18s", flexShrink:0,
              border: fadeScreenActive ? "1.5px solid rgba(255,255,255,0.55)" : "1px solid rgba(255,255,255,0.15)",
              background: fadeScreenActive ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.85)"
            } : {
              display:"flex", alignItems:"center", gap:6, padding:"7px 13px", borderRadius:20,
              cursor:"pointer", transition:"all 0.18s", flexShrink:0,
              border: fadeScreenActive ? "1.5px solid rgba(255,255,255,0.55)" : "1px solid rgba(255,255,255,0.15)",
              background: fadeScreenActive ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.85)", fontSize:12, fontWeight:700
            }}>
            <EyeOff size={15} />
            {!isMobile && <span>{fadeScreenActive ? "Faded" : "Fade OBS Screen"}</span>}
          </button>
          {/* Divider */}
          <div style={{ width:1, height:20, background:"rgba(255,255,255,0.1)", flexShrink:0 }} />
          {/* ── Preset selector ── */}
          <div style={{ display:"flex", gap: isMobile ? 3 : 5 }}>
            {(["praise","worship"] as PresetName[]).map(name => {
              const p = presets[name];
              const isActive = presetActivated && activePreset === name;
              const Icon = name === "praise" ? Zap : Heart;
              return (
                <button key={name} onClick={() => applyPreset(name)}
                  title={p.name}
                  style={isMobile ? {
                    width:36, height:36, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
                    cursor:"pointer", transition:"all 0.18s", flexShrink:0,
                    border: isActive ? "1.5px solid rgba(255,255,255,0.55)" : "1px solid rgba(255,255,255,0.15)",
                    background: isActive ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.05)",
                    color: "rgba(255,255,255,0.85)"
                  } : {
                    display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:20,
                    cursor:"pointer", transition:"all 0.18s", flexShrink:0,
                    border: isActive ? "1.5px solid rgba(255,255,255,0.55)" : "1px solid rgba(255,255,255,0.15)",
                    background: isActive ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.05)",
                    color: "rgba(255,255,255,0.85)", fontSize:12, fontWeight:700
                  }}>
                  <Icon size={15} />
                  {!isMobile && <span>{p.name}</span>}
                </button>
              );
            })}
          </div>
          <button onClick={openSettings}
            style={{ display:"flex", alignItems:"center", gap:6, padding: isMobile ? "9px" : "8px 14px", borderRadius:10, background:"rgba(167,139,250,0.1)", border:"1px solid rgba(167,139,250,0.25)", color:"#a78bfa", fontSize:12, fontWeight:700, cursor:"pointer", transition:"all 0.15s" }}
            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background="rgba(167,139,250,0.2)"}
            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background="rgba(167,139,250,0.1)"}>
            <Settings size={isMobile ? 18 : 14} />
            {!isMobile && "Settings"}
          </button>
        </div>
      </div>

      {/* ── Mobile: song status strip ──────────────────────────────── */}
      {isMobile && selectedSong && (
        <div style={{ flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"7px 14px", borderBottom:"1px solid rgba(255,255,255,0.07)", background:"rgba(0,0,0,0.25)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, minWidth:0 }}>
            <span style={{ fontSize:12, color:"rgba(167,139,250,0.7)", flexShrink:0 }}>♪</span>
            <span style={{ fontSize:12, fontWeight:700, color:"rgba(255,255,255,0.85)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{selectedSong.title}</span>
            {selectedSong.artist && <span style={{ fontSize:11, color:"rgba(255,255,255,0.35)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>— {selectedSong.artist}</span>}
          </div>
          {activeSlide && (
            <div style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0, padding:"3px 8px", borderRadius:20, background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.3)" }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:"#ef4444", boxShadow:"0 0 6px #ef4444" }} />
              <span style={{ fontSize:10, fontWeight:700, color:"#f87171", letterSpacing:"0.08em" }}>LIVE</span>
            </div>
          )}
        </div>
      )}

      {/* ══ Settings Modal ══════════════════════════════════════════════════ */}
      {settingsOpen && (
        <div onClick={e => { if (e.target === e.currentTarget) { setModalFadeScreenBg({ ...fadeScreenBg }); settingsOpenRef.current = false; setSettingsOpen(false); } }}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", backdropFilter:"blur(6px)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ width: isMobile ? "min(92vw, 480px)" : 480, background:"#0d0f1c", border:"1px solid rgba(255,255,255,0.1)", borderRadius:20, boxShadow:"0 32px 80px rgba(0,0,0,0.9)", overflow:"hidden" }}>

            {/* Modal header */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 20px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                <div style={{ width:32, height:32, borderRadius:9, background:"rgba(167,139,250,0.15)", border:"1px solid rgba(167,139,250,0.3)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <Settings size={15} color="#a78bfa" />
                </div>
                <div>
                  <p style={{ margin:0, fontSize:14, fontWeight:700, color:"#fff" }}>Display Settings</p>
                  <p style={{ margin:0, fontSize:10, color:"rgba(255,255,255,0.35)" }}>Each scene saves independently</p>
                </div>
              </div>
              <button onClick={() => { setModalFadeScreenBg({ ...fadeScreenBg }); settingsOpenRef.current = false; setSettingsOpen(false); }}
                style={{ width:30, height:30, borderRadius:8, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.5)", fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
            </div>

            {/* Preset tabs */}
            <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
              {(["praise","worship"] as PresetName[]).map(tab => {
                const Icon = tab === "praise" ? Zap : Heart;
                const isActive = settingsTab === tab;
                return (
                  <button key={tab} onClick={() => setSettingsTab(tab)}
                    style={{ flex:1, padding:"12px 0", display:"flex", alignItems:"center", justifyContent:"center", gap:7,
                      fontSize:12, fontWeight:700, cursor:"pointer", border:"none", background:"transparent", transition:"all 0.18s",
                      color: isActive ? "#c4b5fd" : "rgba(255,255,255,0.35)",
                      borderBottom: isActive ? "2px solid #a78bfa" : "2px solid transparent" }}>
                    <Icon size={13} />{presets[tab].name}
                  </button>
                );
              })}
              {/* Fade Screen tab */}
              <button onClick={() => setSettingsTab("fade")}
                style={{ flex:1, padding:"12px 0", display:"flex", alignItems:"center", justifyContent:"center", gap:7,
                  fontSize:12, fontWeight:700, cursor:"pointer", border:"none", background:"transparent", transition:"all 0.18s",
                  color: settingsTab === "fade" ? "#fca5a5" : "rgba(255,255,255,0.35)",
                  borderBottom: settingsTab === "fade" ? "2px solid #f87171" : "2px solid transparent" }}>
                <EyeOff size={13} />Fade
              </button>
            </div>

            {/* Modal body */}
            <div style={{ padding:"20px", display:"flex", flexDirection:"column", gap:20, maxHeight:"60vh", overflowY:"auto" }}>
              {settingsTab === "fade" && (() => {
                  const isColor    = modalFadeScreenBg.type === "color";
                const isImgUrl   = modalFadeScreenBg.type === "image-url";
                const isImgLoc   = modalFadeScreenBg.type === "image-local";
                const isVidLoc   = modalFadeScreenBg.type === "video-local";
                const isVidYt    = modalFadeScreenBg.type === "video-youtube";
                const hasUrl     = isImgUrl || isImgLoc || isVidLoc;
                const bgUrl      = hasUrl ? (modalFadeScreenBg as {type:string;url:string}).url : "";
                const ytId       = isVidYt ? (modalFadeScreenBg as {type:string;videoId:string}).videoId : "";
                return (
                  <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
                    {/* Preview swatch */}
                    <div style={{ height:80, borderRadius:12, overflow:"hidden", border:"1px solid rgba(255,255,255,0.1)", position:"relative", flexShrink:0,
                      background: isColor ? (modalFadeScreenBg as {type:"color";color:string}).color : "#000",
                      display:"flex", alignItems:"center", justifyContent:"center" }}>
                      {(isImgUrl || isImgLoc) && bgUrl && (
                        <img src={bgUrl} alt="preview"
                          style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }}
                          onError={e => { (e.target as HTMLImageElement).style.display="none"; }} />
                      )}
                      {isVidLoc && bgUrl && (
                        <video src={bgUrl} muted autoPlay loop playsInline
                          style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} />
                      )}
                      {isVidYt && ytId && (
                        <iframe
                          src={`https://www.youtube.com/embed/${ytId}?autoplay=1&loop=1&playlist=${ytId}&mute=1&controls=0`}
                          style={{ position:"absolute", inset:0, width:"100%", height:"100%", border:"none", pointerEvents:"none" }}
                          allow="autoplay; encrypted-media" title="yt-preview" />
                      )}
                      <span style={{ fontSize:10, color:"rgba(255,255,255,0.3)", fontWeight:700, letterSpacing:"0.1em", position:"relative" }}>PREVIEW</span>
                    </div>

                    {/* Type selector — 2-row grid to fit 5 options */}
                    <div>
                      <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.35)", textTransform:"uppercase", letterSpacing:"0.12em", display:"block", marginBottom:10 }}>Background Type</span>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:4, background:"rgba(0,0,0,0.4)", borderRadius:12, padding:4 }}>
                        {([
                          ["color",          "Color"],
                          ["image-url",      "Image URL"],
                          ["image-local",    "Upload Image"],
                          ["video-local",    "Upload Video"],
                          ["video-youtube",  "YouTube"],
                        ] as [FadeScreenBg["type"], string][]).map(([t, label]) => {
                          const isActive = modalFadeScreenBg.type === t;
                          return (
                            <button key={t} onClick={() => {
                              if (t === "color")         saveFadeScreenBg({ type:"color",         color:   isColor  ? (modalFadeScreenBg as {type:"color";color:string}).color : "#000000" });
                              else if (t === "image-url")    saveFadeScreenBg({ type:"image-url",    url:     isImgUrl ? bgUrl : "" });
                              else if (t === "image-local")  saveFadeScreenBg({ type:"image-local",  url:     isImgLoc ? bgUrl : "" });
                              else if (t === "video-local")  saveFadeScreenBg({ type:"video-local",  url:     isVidLoc ? bgUrl : "" });
                              else                           saveFadeScreenBg({ type:"video-youtube", videoId: isVidYt  ? ytId  : "" });
                            }} style={{ padding:"9px 4px", borderRadius:9, fontSize:10, fontWeight:700, cursor:"pointer", transition:"all 0.18s", border:"none",
                              background: isActive ? "rgba(239,68,68,0.22)" : "transparent",
                              color:      isActive ? "#fca5a5"              : "rgba(255,255,255,0.35)",
                              boxShadow:  isActive ? "inset 0 0 0 1px rgba(239,68,68,0.4)" : "none" }}>
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Color picker */}
                    {isColor && (
                      <div>
                        <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.35)", textTransform:"uppercase", letterSpacing:"0.12em", display:"block", marginBottom:10 }}>Color</span>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <input type="color" value={(modalFadeScreenBg as {type:"color";color:string}).color}
                            onChange={e => saveFadeScreenBg({ type:"color", color: e.target.value })}
                            style={{ width:48, height:44, borderRadius:9, border:"1px solid rgba(255,255,255,0.1)", cursor:"pointer", background:"none", padding:2 }} />
                          <span style={{ fontSize:13, color:"rgba(255,255,255,0.6)", fontFamily:"monospace" }}>{(modalFadeScreenBg as {type:"color";color:string}).color}</span>
                        </div>
                        <div style={{ display:"flex", gap:6, marginTop:10, flexWrap:"wrap" }}>
                          {["#000000","#0a0a14","#1a003a","#001a00","#1a0a00","#ffffff"].map(c => (
                            <button key={c} onClick={() => saveFadeScreenBg({ type:"color", color:c })}
                              style={{ width:32, height:32, borderRadius:8, background:c,
                                border: (modalFadeScreenBg as {type:"color";color:string}).color===c ? "2px solid #fca5a5" : "1px solid rgba(255,255,255,0.15)",
                                cursor:"pointer", transition:"all 0.15s" }} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Image URL */}
                    {isImgUrl && (
                      <div>
                        <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.35)", textTransform:"uppercase", letterSpacing:"0.12em", display:"block", marginBottom:10 }}>Image URL</span>
                        <div style={{ display:"flex", gap:6 }}>
                          <input value={fadeImageUrlInput || (modalFadeScreenBg as {type:"image-url";url:string}).url} placeholder="https://…"
                            onChange={e => setFadeImageUrlInput(e.target.value)}
                            style={{ flex:1, padding:"9px 11px", borderRadius:8, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.09)", color:"#fff", fontSize:12, outline:"none" }} />
                          <button onClick={() => { if (fadeImageUrlInput) { saveFadeScreenBg({ type:"image-url", url: fadeImageUrlInput }); setFadeImageUrlInput(""); } }}
                            style={{ padding:"9px 14px", borderRadius:8, background:"rgba(239,68,68,0.2)", border:"1px solid rgba(239,68,68,0.35)", color:"#fca5a5", fontSize:11, fontWeight:700, cursor:"pointer" }}>Apply</button>
                        </div>
                      </div>
                    )}

                    {/* Local image upload */}
                    {isImgLoc && (
                      <div>
                        <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.35)", textTransform:"uppercase", letterSpacing:"0.12em", display:"block", marginBottom:10 }}>Upload Image</span>
                        <label style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderRadius:9, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", cursor:"pointer", fontSize:12, color:"rgba(255,255,255,0.6)" }}>
                          <ImageIcon size={13} />
                          {bgUrl ? "Replace image…" : "Upload image file…"}
                          <input type="file" accept="image/*" style={{ display:"none" }}
                            onChange={e => {
                              const file = e.target.files?.[0]; if (!file) return;
                              const reader = new FileReader();
                              reader.onload = ev => saveFadeScreenBg({ type:"image-local", url: ev.target?.result as string });
                              reader.readAsDataURL(file);
                            }} />
                        </label>
                        {bgUrl && <p style={{ fontSize:10, color:"#34d399", margin:"8px 0 0" }}>✓ Image saved ({(bgUrl.length / 1_000_000).toFixed(1)}MB)</p>}
                      </div>
                    )}

                    {/* Local video upload */}
                    {isVidLoc && (
                      <div>
                        <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.35)", textTransform:"uppercase", letterSpacing:"0.12em", display:"block", marginBottom:10 }}>Upload Video</span>
                        <label style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderRadius:9, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", cursor:"pointer", fontSize:12, color:"rgba(255,255,255,0.6)" }}>
                          <Video size={13} />
                          {bgUrl ? "Replace video…" : "Upload video file…"}
                          <input type="file" accept="video/*" style={{ display:"none" }}
                            onChange={e => {
                              const file = e.target.files?.[0]; if (!file) return;
                              const reader = new FileReader();
                              reader.onload = ev => saveFadeScreenBg({ type:"video-local", url: ev.target?.result as string });
                              reader.readAsDataURL(file);
                            }} />
                        </label>
                        {bgUrl && <p style={{ fontSize:10, color:"#34d399", margin:"8px 0 0" }}>✓ Video saved ({(bgUrl.length / 1_000_000).toFixed(1)}MB)</p>}
                        <p style={{ fontSize:10, color:"rgba(255,255,255,0.3)", margin:"6px 0 0" }}>Tip: Use compressed MP4 files for best performance. Loops automatically.</p>
                      </div>
                    )}

                    {/* YouTube video URL */}
                    {isVidYt && (
                      <div>
                        <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.35)", textTransform:"uppercase", letterSpacing:"0.12em", display:"block", marginBottom:10 }}>YouTube URL</span>
                        <div style={{ display:"flex", gap:6 }}>
                          <input value={fadeImageUrlInput || ytId} placeholder="https://youtube.com/watch?v=… or video ID"
                            onChange={e => setFadeImageUrlInput(e.target.value)}
                            style={{ flex:1, padding:"9px 11px", borderRadius:8, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.09)", color:"#fff", fontSize:12, outline:"none" }} />
                          <button onClick={() => {
                            if (!fadeImageUrlInput) return;
                            const id = (() => {
                              const m = fadeImageUrlInput.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/v\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
                              return m ? m[1] : fadeImageUrlInput.trim();
                            })();
                            saveFadeScreenBg({ type:"video-youtube", videoId: id });
                            setFadeImageUrlInput("");
                          }} style={{ padding:"9px 14px", borderRadius:8, background:"rgba(239,68,68,0.2)", border:"1px solid rgba(239,68,68,0.35)", color:"#fca5a5", fontSize:11, fontWeight:700, cursor:"pointer" }}>Apply</button>
                        </div>
                        {ytId && <p style={{ fontSize:10, color:"#34d399", margin:"8px 0 0" }}>✓ Video ID: {ytId} (plays muted, looping)</p>}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── Praise / Worship body — hidden on Fade tab ── */}
              {settingsTab !== "fade" && (() => {
                // Explicitly narrow to PresetName so all draft reads/writes are tab-isolated
                const tab: PresetName = settingsTab;
                const draft = modalDrafts[tab];
                return (<>

              {/* Apply Echo Style — Praise only */}
              {tab === "praise" && (() => { const isEcho = draft.animStyle === "echo"; return (
              <button onClick={() => updateDraft(tab, "animStyle", "echo")}
                style={{ width:"100%", padding:"13px 0", borderRadius:12, fontSize:13, fontWeight:700,
                  cursor:"pointer", transition:"all 0.2s",
                  border:   isEcho ? "1px solid rgba(52,211,153,0.6)" : "1px solid rgba(255,255,255,0.12)",
                  background: isEcho ? "rgba(52,211,153,0.18)" : "rgba(255,255,255,0.05)",
                  color:      isEcho ? "#6ee7b7" : "rgba(255,255,255,0.75)",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                <span style={{ fontSize:16, color: isEcho ? "#6ee7b7" : "#a78bfa" }}>✦</span>
                {isEcho ? "✓ Echo Style Activated" : "Apply Echo Style"}
              </button>); })()}

              <div style={{ height:1, background:"rgba(255,255,255,0.06)" }} />

              {/* Alignment */}
              <div>
                <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.35)", textTransform:"uppercase", letterSpacing:"0.12em", display:"block", marginBottom:10 }}>Alignment</span>
                <div style={{ display:"flex", gap:4, background:"rgba(0,0,0,0.4)", borderRadius:12, padding:4 }}>
                  {(["left","center"] as const).map(a => (
                    <button key={a} onClick={() => updateDraft(tab, "echoAlign", a)} style={{ flex:1, padding:"10px 0", borderRadius:9, fontSize:12, fontWeight:700, cursor:"pointer", transition:"all 0.18s", border:"none", outline:"none", display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                      background: draft.echoAlign===a ? "rgba(167,139,250,0.22)" : "transparent",
                      color:      draft.echoAlign===a ? "#c4b5fd" : "rgba(255,255,255,0.3)",
                      boxShadow:  draft.echoAlign===a ? "0 2px 12px rgba(0,0,0,0.6),inset 0 0 0 1px rgba(167,139,250,0.4)" : "none" }}>
                      {a === "left" ? <><AlignLeft size={13} /> Left</> : <><AlignCenter size={13} /> Center</>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lines */}
              <div>
                <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.35)", textTransform:"uppercase", letterSpacing:"0.12em", display:"block", marginBottom:10 }}>Lines per Slide</span>
                <div style={{ display:"flex", gap:4, background:"rgba(0,0,0,0.4)", borderRadius:12, padding:4 }}>
                  {(["auto","2","3"] as const).map(opt => (
                    <button key={opt} onClick={() => updateDraft(tab, "echoLines", opt)} style={{ flex:1, padding:"10px 0", borderRadius:9, fontSize:12, fontWeight:700, cursor:"pointer", transition:"all 0.18s", border:"none", outline:"none",
                      background: draft.echoLines===opt ? "rgba(52,211,153,0.2)" : "transparent",
                      color:      draft.echoLines===opt ? "#6ee7b7" : "rgba(255,255,255,0.3)",
                      boxShadow:  draft.echoLines===opt ? "0 2px 12px rgba(0,0,0,0.6),inset 0 0 0 1px rgba(52,211,153,0.4)" : "none" }}>
                      {opt === "auto" ? "Auto" : `${opt} Lines`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Line Spacing */}
              <div>
                <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.35)", textTransform:"uppercase", letterSpacing:"0.12em", display:"block", marginBottom:10 }}>Line Spacing</span>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <button onClick={() => updateDraft(tab, "echoLineHeight", Math.max(0.5, Math.round((draft.echoLineHeight-0.1)*10)/10))}
                    style={{ width:44, height:44, borderRadius:10, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", color:"#fff", fontSize:22, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>−</button>
                  <div style={{ flex:1, textAlign:"center", fontSize:22, fontWeight:800, color:"#fff", background:"rgba(255,255,255,0.05)", borderRadius:10, padding:"10px 0", border:"1px solid rgba(255,255,255,0.09)" }}>
                    {draft.echoLineHeight.toFixed(1)}
                  </div>
                  <button onClick={() => updateDraft(tab, "echoLineHeight", Math.min(5, Math.round((draft.echoLineHeight+0.1)*10)/10))}
                    style={{ width:44, height:44, borderRadius:10, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", color:"#fff", fontSize:22, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>+</button>
                  <button onClick={() => updateDraft(tab, "echoLineHeight", DEFAULT_PRESETS[tab].echoLineHeight)}
                    style={{ padding:"10px 16px", borderRadius:10, background:"transparent", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.35)", fontSize:11, fontWeight:700, cursor:"pointer", textTransform:"uppercase", letterSpacing:"0.06em" }}>Reset</button>
                </div>
              </div>

              {/* Lyrics Scale */}
              <div>
                <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.35)", textTransform:"uppercase", letterSpacing:"0.12em", display:"block", marginBottom:10 }}>Lyrics Scale</span>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <button onClick={() => updateDraft(tab, "lyricsScale", Math.max(0.5, Math.round(((draft.lyricsScale ?? 1.0) - 0.05) * 100) / 100))}
                    style={{ width:44, height:44, borderRadius:10, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", color:"#fff", fontSize:22, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>−</button>
                  <div style={{ flex:1, textAlign:"center", fontSize:22, fontWeight:800, color:"#fff", background:"rgba(255,255,255,0.05)", borderRadius:10, padding:"10px 0", border:"1px solid rgba(255,255,255,0.09)" }}>
                    {Math.round((draft.lyricsScale ?? 1.0) * 100)}%
                  </div>
                  <button onClick={() => updateDraft(tab, "lyricsScale", Math.min(2.0, Math.round(((draft.lyricsScale ?? 1.0) + 0.05) * 100) / 100))}
                    style={{ width:44, height:44, borderRadius:10, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", color:"#fff", fontSize:22, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>+</button>
                  <button onClick={() => updateDraft(tab, "lyricsScale", 1.0)}
                    style={{ padding:"10px 16px", borderRadius:10, background:"transparent", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.35)", fontSize:11, fontWeight:700, cursor:"pointer", textTransform:"uppercase", letterSpacing:"0.06em" }}>Reset</button>
                </div>
              </div>

              <div style={{ height:1, background:"rgba(255,255,255,0.06)" }} />

              {/* Loop Speed + Enable toggle */}
              <div>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                  <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.35)", textTransform:"uppercase", letterSpacing:"0.12em" }}>Repeat Animation</span>
                  {/* On/Off toggle */}
                  <button onClick={() => updateDraft(tab, "loopEnabled", !(draft.loopEnabled ?? true))}
                    style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", borderRadius:20, fontSize:11, fontWeight:700, cursor:"pointer", transition:"all 0.18s", border:"none",
                      background: (draft.loopEnabled ?? true) ? "rgba(167,139,250,0.22)" : "rgba(255,255,255,0.06)",
                      color:       (draft.loopEnabled ?? true) ? "#c4b5fd"               : "rgba(255,255,255,0.3)",
                      boxShadow:   (draft.loopEnabled ?? true) ? "inset 0 0 0 1px rgba(167,139,250,0.4)" : "inset 0 0 0 1px rgba(255,255,255,0.1)" }}>
                    <span style={{ width:8, height:8, borderRadius:"50%", background:(draft.loopEnabled ?? true) ? "#a78bfa" : "rgba(255,255,255,0.25)", display:"inline-block", flexShrink:0 }} />
                    {(draft.loopEnabled ?? true) ? "On" : "Off"}
                  </button>
                </div>
                <div style={{ display:"flex", gap:4, background:"rgba(0,0,0,0.35)", borderRadius:12, padding:4, opacity:(draft.loopEnabled ?? true) ? 1 : 0.35, pointerEvents:(draft.loopEnabled ?? true) ? "auto" : "none" }}>
                  {([[<><Timer size={12}/>&nbsp;Slow</>, 7000], [<><Music2 size={12}/>&nbsp;Normal</>, 3500], [<><Zap size={12}/>&nbsp;Fast</>, 2000]] as [React.ReactNode, number][]).map(([label, val]) => (
                    <button key={val} onClick={() => updateDraft(tab, "loopInterval", val)}
                      style={{ flex:1, padding:"10px 0", borderRadius:9, fontSize:11, fontWeight:700, cursor:"pointer", transition:"all 0.18s", border:"none",
                        background: draft.loopInterval === val ? "rgba(167,139,250,0.22)" : "transparent",
                        color: draft.loopInterval === val ? "#c4b5fd" : "rgba(255,255,255,0.3)",
                        boxShadow: draft.loopInterval === val ? "inset 0 0 0 1px rgba(167,139,250,0.4)" : "none" }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ height:1, background:"rgba(255,255,255,0.06)" }} />

              {/* Background */}
              <div>
                <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.35)", textTransform:"uppercase", letterSpacing:"0.12em", display:"block", marginBottom:10 }}>Background</span>
                <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                  {BG_PRESETS.map((bg,i) => (
                    <button key={i} onClick={() => updateDraft(tab, "bgIdx", i)} title={bg.label}
                      style={{ flex:1, height:44, borderRadius:10, background:bg.style,
                        border: draft.bgIdx===i ? "2px solid #a78bfa" : "2px solid transparent",
                        cursor:"pointer", transform: draft.bgIdx===i ? "scale(1.05)" : "scale(1)",
                        transition:"all 0.15s ease",
                        opacity: draft.bgVideo ? 0.4 : 1,
                        boxShadow: draft.bgIdx===i ? "0 0 0 3px rgba(167,139,250,0.2)" : "none" }} />
                  ))}
                </div>
                {/* Video BG — draft only, does NOT push to OBS until Save */}
                <div style={{ background:"rgba(255,255,255,0.03)", borderRadius:12, padding:14, border:"1px solid rgba(255,255,255,0.07)" }}>
                  <p style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.3)", textTransform:"uppercase", letterSpacing:"0.1em", margin:"0 0 10px" }}>Video Background</p>
                  <label style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderRadius:9, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", cursor:"pointer", fontSize:12, color:"rgba(255,255,255,0.6)", marginBottom:8 }}>
                    <Upload size={13} />
                    {draft.bgVideo?.type === "local" ? "Change video file…" : "Upload local video file…"}
                    <input type="file" accept="video/webm,video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/ogg,video/*" style={{ display:"none" }}
                      onChange={async e => {
                        const file = e.target.files?.[0]; if (!file) return;
                        const fd = new FormData(); fd.append("video", file);
                        // Upload to per-preset slot so Praise and Worship never share a video
                        const r = await fetch(`/api/live-bg-video/${tab}`, { method: "POST", body: fd });
                        if (!r.ok) { alert("Video upload failed"); return; }
                        // Cache-bust so browser doesn't serve the old video when preset is switched
                        updateDraft(tab, "bgVideo", { type:"local", url:`/api/live-bg-video/${tab}?t=${Date.now()}` });
                        // Reset input so the same file can be re-selected after removal
                        e.target.value = "";
                      }} />
                  </label>
                  <div style={{ display:"flex", gap:6 }}>
                    <input value={ytInputs[tab]} onChange={e => setYtInputs(prev => ({ ...prev, [tab]: e.target.value }))} placeholder="YouTube URL…"
                      onKeyDown={e => { if (e.key==="Enter") { const id=extractYtId(ytInputs[tab]); if(id){updateDraft(tab,"bgVideo",{type:"youtube",videoId:id});setYtInputs(prev=>({...prev,[tab]:""}));} } }}
                      style={{ flex:1, padding:"8px 11px", borderRadius:8, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.09)", color:"#fff", fontSize:12, outline:"none" }} />
                    <button onClick={() => { const id=extractYtId(ytInputs[tab]); if(id){updateDraft(tab,"bgVideo",{type:"youtube",videoId:id});setYtInputs(prev=>({...prev,[tab]:""}));} }}
                      style={{ padding:"8px 14px", borderRadius:8, background:"rgba(99,102,241,0.2)", border:"1px solid rgba(99,102,241,0.35)", color:"#818cf8", fontSize:11, fontWeight:700, cursor:"pointer" }}>Apply</button>
                  </div>
                  {draft.bgVideo && (
                    <div style={{ marginTop:10, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 11px", borderRadius:8, background:"rgba(52,211,153,0.08)", border:"1px solid rgba(52,211,153,0.2)" }}>
                      <span style={{ fontSize:11, color:"#34d399" }}>
                        {draft.bgVideo?.type === "local" ? `Local video (${tab})` : `YouTube: ${(draft.bgVideo as {type:"youtube";videoId:string})?.videoId}`}
                      </span>
                      <button onClick={async () => {
                          // If it's a local video, also clear it from the server slot
                          if (draft.bgVideo?.type === "local") {
                            await fetch(`/api/live-bg-video/${tab}`, { method: "DELETE" }).catch(() => {});
                          }
                          updateDraft(tab, "bgVideo", null);
                        }}
                        style={{ padding:"4px 10px", borderRadius:6, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.15)", color:"rgba(255,255,255,0.5)", fontSize:10, fontWeight:700, cursor:"pointer" }}>Remove</button>
                    </div>
                  )}
                </div>
              </div>

              </>);
              })()}

            </div>

            {/* Modal footer */}
            <div style={{ padding:"14px 20px", borderTop:"1px solid rgba(255,255,255,0.07)", display:"flex", justifyContent:"flex-end", gap:10 }}>
              {/* Cancel — reverts draft to live state, no OBS side effects */}
              <button
                onClick={() => {
                  setModalFadeScreenBg({ ...fadeScreenBg }); // revert draft
                  settingsOpenRef.current = false;
                  setSettingsOpen(false);
                }}
                style={{ padding:"10px 22px", borderRadius:10, fontSize:12, fontWeight:700, cursor:"pointer", transition:"all 0.2s",
                  background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.12)", color:"rgba(255,255,255,0.45)" }}>
                Cancel
              </button>
              <button onClick={() => { settingsOpenRef.current = false; saveSettings(); }}
                style={{ padding:"10px 28px", borderRadius:10, fontSize:12, fontWeight:700, cursor:"pointer", transition:"all 0.2s",
                  background: settingsSaved ? "rgba(52,211,153,0.25)" : "rgba(167,139,250,0.2)",
                  border:     settingsSaved ? "1px solid rgba(52,211,153,0.5)" : "1px solid rgba(167,139,250,0.4)",
                  color:      settingsSaved ? "#6ee7b7" : "#a78bfa" }}>
                {settingsSaved ? "✓ Saved!" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Two-Column Body ──────────────────────────────────────────────── */}
      <div style={{ flex:1, display:"flex", overflow:"hidden", minHeight:0 }}>

        {/* ── LEFT PANEL ──────────────────────────────────────────────── */}
        <div style={{ width: isMobile ? "100%" : 300, flexShrink:0, display: isMobile && mobileTab !== "slides" ? "none" : "flex", flexDirection:"column", borderRight: isMobile ? "none" : "1px solid rgba(255,255,255,0.07)", overflow:"hidden", background:"rgba(0,0,0,0.15)" }}>

          {/* Search — only shown on the initial song-browsing screen, hidden once a song is loaded */}
          {!selectedSong && (
            <div style={{ padding:"12px 12px 10px", borderBottom:"1px solid rgba(255,255,255,0.05)", flexShrink:0 }}>
              <div style={{ position:"relative" }}>
                <Search size={13} style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)", color:"rgba(255,255,255,0.25)", pointerEvents:"none" }} />
                <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search songs…"
                  style={{ width:"100%", paddingLeft:34, paddingRight:32, paddingTop:9, paddingBottom:9, borderRadius:10, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.09)", color:"#fff", fontSize:13, outline:"none", boxSizing:"border-box", transition:"border 0.15s" }}
                  onFocus={e=>(e.target as HTMLInputElement).style.border="1px solid rgba(167,139,250,0.4)"}
                  onBlur={e=>(e.target as HTMLInputElement).style.border="1px solid rgba(255,255,255,0.09)"} />
                {query && (
                  <button onClick={()=>setQuery("")} style={{ position:"absolute", right:9, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"rgba(255,255,255,0.3)", padding:0, display:"flex" }}>
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Fixed header: back button + song dropdown ── */}
          {selectedSong && (
            <div style={{ flexShrink:0, borderBottom:"1px solid rgba(255,255,255,0.07)", padding:"10px", display:"flex", flexDirection:"column", gap:6 }}>
              {/* Back to list button */}
              <button
                onClick={() => {
                  setSections([]);
                  setActiveSlide(null);
                  setActiveSectionState(null);
                  setSelectedSong(null);
                  try { localStorage.removeItem("lsv_selected_song_id"); } catch {}
                  _restoredSelectedRef.current = false; // allow restore again next time
                }}
                style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 10px", borderRadius:8, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", color:"rgba(255,255,255,0.45)", fontSize:11, fontWeight:700, cursor:"pointer", transition:"all 0.15s", width:"fit-content" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.09)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.04)"}>
                <ChevronLeft size={13} />
                Scene Playlist
              </button>

              {/* Dropdown trigger — song title box */}
              <button
                onClick={() => setSongDropdownOpen(prev => !prev)}
                style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", borderRadius: songDropdownOpen ? "10px 10px 0 0" : 10, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.09)", cursor:"pointer", width:"100%", textAlign:"left", transition:"all 0.18s" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.06)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.03)"}>
                <div style={{ minWidth:0 }}>
                  <p style={{ margin:0, fontSize:14, fontWeight:700, color:"#fff", letterSpacing:"-0.01em", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{selectedSong.title}</p>
                  {selectedSong.artist && <p style={{ margin:"2px 0 0", fontSize:11, color:"rgba(255,255,255,0.35)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{selectedSong.artist}</p>}
                </div>
                <div style={{ flexShrink:0, marginLeft:10, color:"rgba(255,255,255,0.45)", transition:"transform 0.2s", transform: songDropdownOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                  <ChevronDown size={16} />
                </div>
              </button>

              {/* Dropdown panel — scene songs list */}
              {songDropdownOpen && sceneSongs.length > 0 && (
                <div style={{ background:"rgba(10,10,20,0.97)", border:"1px solid rgba(255,255,255,0.09)", borderTop:"none", borderRadius:"0 0 10px 10px", overflow:"hidden" }}>
                  {sceneSongs.map(song => {
                    const isActive = song.id === selectedSong.id;
                    const resolved = resolvePresetFromSong(song);
                    const isPraise = resolved === "praise", isWorship = resolved === "worship";
                    return (
                      <button key={song.id}
                        onClick={() => { handleSongSelect(song); setSongDropdownOpen(false); }}
                        style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"9px 12px", background: isActive ? "rgba(99,102,241,0.18)" : "transparent", border:"none", borderTop:"1px solid rgba(255,255,255,0.05)", cursor:"pointer", textAlign:"left", transition:"background 0.15s" }}
                        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.06)"; }}
                        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background="transparent"; }}>
                        <div style={{ width:24, height:24, borderRadius:6, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
                          background: isPraise ? "rgba(250,204,21,0.12)" : isWorship ? "rgba(167,139,250,0.12)" : "rgba(99,102,241,0.10)",
                          border: isPraise ? "1px solid rgba(250,204,21,0.22)" : isWorship ? "1px solid rgba(167,139,250,0.22)" : "1px solid rgba(99,102,241,0.16)" }}>
                          {isPraise ? <Zap size={11} color="#fbbf24" /> : isWorship ? <Heart size={11} color="#a78bfa" /> : <Music2 size={11} color="#818cf8" />}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ margin:0, fontSize:12, fontWeight: isActive ? 700 : 600, color: isActive ? "#a5b4fc" : "rgba(255,255,255,0.75)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{song.title}</p>
                          {song.artist && <p style={{ margin:0, fontSize:10, color:"rgba(255,255,255,0.28)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{song.artist}</p>}
                        </div>
                        {isActive && <div style={{ width:6, height:6, borderRadius:"50%", background:"#818cf8", flexShrink:0 }} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}


          {/* ── Scrollable list area ── */}
          <div style={{ flex:1, overflowY:"auto", padding:"0 10px 10px 10px", display:"flex", flexDirection:"column", gap:4 }}>

            {/* Auto-preset toast */}
            {autoPresetToast && (
              <div style={{ padding:"9px 13px", borderRadius:10, background:"rgba(167,139,250,0.15)", border:"1px solid rgba(167,139,250,0.35)", fontSize:12, fontWeight:700, color:"#c4b5fd", textAlign:"center", marginBottom:4, letterSpacing:"0.01em", animation:"fadeIn 0.2s ease" }}>
                {autoPresetToast}
              </div>
            )}

            {/* ── Song selection list ── */}
            {!selectedSong ? (
              <>
                {!query.trim() ? (
                  /* Scene Playlist mode */
                  <>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                      <span style={{ fontSize:10, fontWeight:700, letterSpacing:"0.08em", color:"rgba(255,255,255,0.3)", textTransform:"uppercase" }}>Scene Playlist</span>
                      {sceneSongs.length > 0 && (
                        <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:20, background:"rgba(99,102,241,0.15)", border:"1px solid rgba(99,102,241,0.25)", color:"#818cf8" }}>
                          {sceneSongs.length} song{sceneSongs.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    {sceneSongs.length === 0 && (
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10, padding:"36px 16px", borderRadius:12, border:"1px dashed rgba(255,255,255,0.08)", background:"rgba(255,255,255,0.02)", marginTop:4 }}>
                        <Music2 size={24} color="rgba(255,255,255,0.12)" />
                        <p style={{ margin:0, fontSize:12, color:"rgba(255,255,255,0.2)", textAlign:"center", lineHeight:1.5 }}>
                          Search songs above<br/>and tap <strong style={{ color:"rgba(99,102,241,0.7)" }}>+</strong> to add them
                        </p>
                      </div>
                    )}
                    {sceneSongs.map(song => {
                      const resolved = resolvePresetFromSong(song);
                      const isPraise = resolved === "praise", isWorship = resolved === "worship";
                      return (
                        <div key={song.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 10px", borderRadius:10, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", transition:"all 0.15s" }}>
                          <div style={{ width:30, height:30, borderRadius:8, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
                            background: isPraise ? "rgba(250,204,21,0.12)" : isWorship ? "rgba(167,139,250,0.12)" : "rgba(99,102,241,0.10)",
                            border: isPraise ? "1px solid rgba(250,204,21,0.22)" : isWorship ? "1px solid rgba(167,139,250,0.22)" : "1px solid rgba(99,102,241,0.16)" }}>
                            {isPraise ? <Zap size={12} color="#fbbf24" /> : isWorship ? <Heart size={12} color="#a78bfa" /> : <Music2 size={12} color="#818cf8" />}
                          </div>
                          <button onClick={() => handleSongSelect(song)} style={{ flex:1, minWidth:0, background:"none", border:"none", cursor:"pointer", textAlign:"left", padding:0 }}>
                            <p style={{ margin:0, fontSize:13, fontWeight:600, color:"rgba(255,255,255,0.88)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{song.title}</p>
                            {song.artist && <p style={{ margin:0, fontSize:11, color:"rgba(255,255,255,0.28)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{song.artist}</p>}
                          </button>
                          <button onClick={e => { e.stopPropagation(); removeFromScene(song.id); }} title="Remove from scene"
                            style={{ flexShrink:0, width:26, height:26, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.18)", cursor:"pointer", transition:"all 0.15s" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background="rgba(239,68,68,0.22)"; (e.currentTarget as HTMLElement).style.borderColor="rgba(239,68,68,0.4)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background="rgba(239,68,68,0.08)"; (e.currentTarget as HTMLElement).style.borderColor="rgba(239,68,68,0.18)"; }}>
                            <Minus size={12} color="#f87171" />
                          </button>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  /* Search results mode */
                  <>
                    <div style={{ marginBottom:6 }}>
                      <span style={{ fontSize:10, fontWeight:700, letterSpacing:"0.08em", color:"rgba(255,255,255,0.3)", textTransform:"uppercase" }}>
                        {filtered.length} result{filtered.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {filtered.length === 0 && (
                      <p style={{ textAlign:"center", fontSize:12, color:"rgba(255,255,255,0.15)", padding:"40px 0" }}>No songs found</p>
                    )}
                    {filtered.map(song => {
                      const resolved = resolvePresetFromSong(song);
                      const isPraise = resolved === "praise", isWorship = resolved === "worship";
                      const inScene = sceneSongIds.includes(song.id);
                      return (
                        <div key={song.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 10px", borderRadius:10, transition:"all 0.15s",
                          background: inScene ? "rgba(99,102,241,0.07)" : "rgba(255,255,255,0.03)",
                          border: inScene ? "1px solid rgba(99,102,241,0.22)" : "1px solid rgba(255,255,255,0.05)" }}>
                          <div style={{ width:30, height:30, borderRadius:8, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
                            background: isPraise ? "rgba(250,204,21,0.12)" : isWorship ? "rgba(167,139,250,0.12)" : "rgba(99,102,241,0.10)",
                            border: isPraise ? "1px solid rgba(250,204,21,0.22)" : isWorship ? "1px solid rgba(167,139,250,0.22)" : "1px solid rgba(99,102,241,0.16)" }}>
                            {isPraise ? <Zap size={12} color="#fbbf24" /> : isWorship ? <Heart size={12} color="#a78bfa" /> : <Music2 size={12} color="#818cf8" />}
                          </div>
                          <button onClick={() => handleSongSelect(song)} style={{ flex:1, minWidth:0, background:"none", border:"none", cursor:"pointer", textAlign:"left", padding:0 }}>
                            <p style={{ margin:0, fontSize:13, fontWeight:600, color:"rgba(255,255,255,0.88)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{song.title}</p>
                            {song.artist && <p style={{ margin:0, fontSize:11, color:"rgba(255,255,255,0.28)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{song.artist}</p>}
                          </button>
                          {inScene ? (
                            <button onClick={e => { e.stopPropagation(); removeFromScene(song.id); }} title="Remove from scene"
                              style={{ flexShrink:0, width:26, height:26, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(99,102,241,0.2)", border:"1px solid rgba(99,102,241,0.4)", cursor:"pointer", transition:"all 0.15s" }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background="rgba(239,68,68,0.22)"; (e.currentTarget as HTMLElement).style.borderColor="rgba(239,68,68,0.4)"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background="rgba(99,102,241,0.2)"; (e.currentTarget as HTMLElement).style.borderColor="rgba(99,102,241,0.4)"; }}>
                              <CheckIcon size={12} color="#a5b4fc" />
                            </button>
                          ) : (
                            <button onClick={e => { e.stopPropagation(); addToScene(song); }} title="Add to scene"
                              style={{ flexShrink:0, width:26, height:26, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(99,102,241,0.1)", border:"1px solid rgba(99,102,241,0.22)", cursor:"pointer", transition:"all 0.15s" }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background="rgba(99,102,241,0.25)"; (e.currentTarget as HTMLElement).style.borderColor="rgba(99,102,241,0.5)"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background="rgba(99,102,241,0.1)"; (e.currentTarget as HTMLElement).style.borderColor="rgba(99,102,241,0.22)"; }}>
                              <PlusCircle size={13} color="#818cf8" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </>
            ) : (

              /* ── Slides only (back/song info/panel are in fixed header above) ── */
              <>
                {sections.length===0 && (
                  <p style={{ textAlign:"center", fontSize:12, color:"rgba(255,255,255,0.15)", padding:"28px 0" }}>No lyrics found</p>
                )}

                {/* ── Section tabs ────────────────────────────────────── */}
                {sections.length > 0 && (() => {
                  const visibleSec = activeSection
                    ? sections.filter(s => s.label === activeSection)
                    : sections.slice(0, 1); // default to first section
                  const tabSec = activeSection ?? sections[0]?.label;
                  return (
                    <>
                      {/* Tabs row — deduplicated | sticky so it stays visible while scrolling */}
                      <div style={{ display:"flex", gap:4, flexWrap:"wrap",
                        paddingTop:15, paddingBottom:15, paddingLeft:22, paddingRight:22,
                        margin:"0 -10px",
                        borderTop:"1px solid rgba(255,255,255,0.06)",
                        borderBottom:"1px solid rgba(255,255,255,0.06)",
                        background:"#131520",

                        position:"sticky", top:0, zIndex:10,
                      }}>
                        {[...new Set<string>(sections.map(s => s.label))].map((label, idx) => {
                          const col = sectionColor(label);
                          const isTab = tabSec === label;
                          return (
                            <button key={`tab-${idx}`} onClick={() => setActiveSection(label)}
                              style={{ padding:"4px 10px", borderRadius:20, fontSize:10, fontWeight:700, cursor:"pointer", transition:"all 0.15s ease",
                                border: isTab ? `1px solid ${col.accent}` : "1px solid rgba(255,255,255,0.08)",
                                background: isTab ? `${col.bg}` : "transparent",
                                color: isTab ? col.accent : "rgba(255,255,255,0.35)" }}>
                              {label}
                            </button>
                          );
                        })}
                      </div>

                      {/* Slides for active tab */}
                      {visibleSec.map(sec => {
                        const col = sectionColor(sec.label);
                        return (
                          <div key={sec.label} style={{ display:"flex", flexDirection:"column", gap:5 }}>
                            {sec.slides.map(slide => {
                              const isActive = activeSlide?.id===slide.id;
                              return (
                                <button key={slide.id} data-slide-id={slide.id}
                                  onClick={() => setActiveSlide(isActive ? null : slide)}
                                  style={{ width:"100%", textAlign:"left", cursor:"pointer", padding:"10px 12px", borderRadius:10,
                                    border:`1px solid ${isActive ? col.activeBorder : col.border}`,
                                    background: isActive ? col.active : col.bg,
                                    transition:"all 0.18s ease" }}>
                                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: slide.lines.length > 0 ? 5 : 0 }}>
                                    <span style={{ fontSize:10, color:col.accent, fontWeight:700, opacity:0.85 }}>
                                      {slide.totalSlides > 1 ? `Slide ${slide.slideNum} / ${slide.totalSlides}` : slide.sectionLabel}
                                    </span>
                                    {isActive && (
                                      <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, fontWeight:700, color:col.accent,
                                        border:`1px solid ${col.activeBorder}`, borderRadius:20, padding:"2px 7px", background:col.active }}>
                                        <Play size={8} fill={col.accent} color={col.accent} />LIVE
                                      </span>
                                    )}
                                  </div>
                                  {slide.lines.map((line, i) => (
                                    <p key={i} style={{ margin:0, fontSize:12, lineHeight:1.55, color:isActive?"rgba(255,255,255,0.92)":"rgba(255,255,255,0.45)", wordBreak:"break-word", whiteSpace:"normal" }}>{line}</p>
                                  ))}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </>
                  );
                })()}

                {/* Clear display */}
                {activeSlide && (
                  <button onClick={() => { setActiveSlide(null); pushToFirestore(null); }}
                    style={{ marginTop:6, padding:"9px", borderRadius:10, background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", color:"rgba(255,255,255,0.3)", fontSize:12, fontWeight:600, cursor:"pointer", width:"100%", transition:"all 0.15s ease" }}
                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background="rgba(239,68,68,0.08)"}
                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.02)"}>
                    ✕ Clear Display
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL — Screen preview ────────────────────────────── */}
        <div style={{ flex:1, display: isMobile && mobileTab !== "preview" ? "none" : "flex", flexDirection:"column", background:"#050709", overflow:"hidden" }}>



          {/* Toolbar — hidden entirely on mobile (no content there) */}
          {!isMobile && (
            <div style={{ flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 18px", borderBottom:"1px solid rgba(255,255,255,0.05)", minHeight:44 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.25)", textTransform:"uppercase", letterSpacing:"0.12em" }}>Output Display · 16:9</span>
                {selectedSong && (
                  <span style={{ fontSize:11, fontWeight:700, color:"rgba(167,139,250,0.7)", letterSpacing:"-0.01em" }}>
                    ♪ {selectedSong.title}{selectedSong.artist ? ` — ${selectedSong.artist}` : ""}
                  </span>
                )}
              </div>
              <span style={{ fontSize:10, color:"rgba(255,255,255,0.15)", fontStyle:"italic" }}>LED wall · {ANIM_LABELS[defaultAnimStyle]}</span>
            </div>
          )}

          {/* Canvas */}
          <div style={{ flex:1, overflow:"hidden", padding:16 }}>
            <Screen slide={activeSlide} bgStyle={BG_PRESETS[bgIdx].style} echoAlign={echoAlign} echoLines={echoLines} echoLineHeight={echoLineHeight} lyricsScale={lyricsScale} loopEnabled={loopEnabled} bgVideo={bgVideo} loopInterval={loopInterval} visible={!isMobile || mobileTab === "preview"} />
          </div>

          {/* Footer */}
          <div style={{ flexShrink:0, padding:"9px 18px", borderTop:"1px solid rgba(255,255,255,0.05)", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, minHeight:44 }}>
            <p style={{ margin:0, fontSize:11, color:"rgba(255,255,255,0.18)", letterSpacing:"0.01em" }}>
              Click a slide to display · <kbd style={{ background:"rgba(255,255,255,0.07)", borderRadius:4, padding:"1px 5px", fontSize:10 }}>Space</kbd> / <kbd style={{ background:"rgba(255,255,255,0.07)", borderRadius:4, padding:"1px 5px", fontSize:10 }}>↓</kbd> next · <kbd style={{ background:"rgba(255,255,255,0.07)", borderRadius:4, padding:"1px 5px", fontSize:10 }}>↑</kbd> prev · <kbd style={{ background:"rgba(255,255,255,0.07)", borderRadius:4, padding:"1px 5px", fontSize:10 }}>Esc</kbd> clear
            </p>
            <button
              onClick={() => {
                const url = `${window.location.origin}/live-display`;
                navigator.clipboard.writeText(url).then(() => { setObsUrlCopied(true); setTimeout(() => setObsUrlCopied(false), 2000); });
              }}
              title="Copy OBS Browser Source URL"
              style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:8, cursor:"pointer", fontSize:11, fontWeight:700, whiteSpace:"nowrap", flexShrink:0, transition:"all 0.15s ease",
                border: obsUrlCopied ? "1px solid rgba(52,211,153,0.5)" : "1px solid rgba(167,139,250,0.4)",
                background: obsUrlCopied ? "rgba(52,211,153,0.12)" : "rgba(167,139,250,0.12)",
                color: obsUrlCopied ? "#34d399" : "#a78bfa" }}>
              {obsUrlCopied ? <><CheckIcon size={12} /> Copied!</> : <><Copy size={12} /> OBS URL</>}
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile Bottom Tab Bar ──────────────────────────────── */}
      {isMobile && (
        <div style={{ flexShrink:0, display:"flex", borderTop:"1px solid rgba(255,255,255,0.12)", background:"rgba(7,9,15,0.97)", backdropFilter:"blur(12px)", zIndex:50 }}>
          {(["slides", "preview"] as const).map(tab => {
            const active = mobileTab === tab;
            return (
              <button key={tab} onClick={() => setMobileTab(tab)}
                style={{ flex:1, padding:"13px 0 11px", background:"none", border:"none", borderTop: active ? "2px solid #a78bfa" : "2px solid transparent", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:4, transition:"all 0.15s", color: active ? "#a78bfa" : "rgba(255,255,255,0.3)" }}>
                {tab === "slides" ? <Music2 size={18} /> : <Monitor size={18} />}
                <span style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em" }}>{tab === "slides" ? "Slides" : "Preview"}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

