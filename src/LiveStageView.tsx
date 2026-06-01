import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Music2, Layers, Play, Wand2, AlignCenter, AlignLeft, Video, Upload, Copy, Check as CheckIcon, Settings, Zap, Heart, EyeOff, Image as ImageIcon, Timer, PlusCircle, Minus, FolderOpen, Tent, ShieldCheck, AlertTriangle, RefreshCw, Volume2, VolumeX } from "lucide-react";
import LyricsGridModal from "./LyricsGridModal";
import CampReadinessModal from "./CampReadinessModal";
import MediaLibraryModal, { type MediaItem, type MediaTarget } from "./MediaLibraryModal";
import type { Song } from "./types";
import gsap from "gsap";
import { storage, db } from "./firebase";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { collection, addDoc } from "firebase/firestore";


type AnimStyle = "word-fade" | "word-bounce" | "typewriter" | "blur-in" | "fade" | "none" | "echo" | "breathe";
type BgVideo   = { type: "local"; url: string } | { type: "firebase"; url: string; localUrl?: string } | { type: "image-firebase"; url: string; localUrl?: string } | { type: "youtube"; videoId: string };

type FadeScreenBg =
  | { type: "color"; color: string }
  | { type: "image-url"; url: string }
  | { type: "image-local"; url: string }                           // legacy base64 — stays in IDB only, never sent to Firestore
  | { type: "image-firebase"; url: string; localUrl?: string }    // Firebase Storage URL + optional local disk copy
  | { type: "video-local"; url: string; muted?: boolean }          // legacy base64 — stays in IDB only, never sent to Firestore
  | { type: "video-firebase"; url: string; localUrl?: string; muted?: boolean }    // Firebase Storage URL + optional local disk copy
  | { type: "video-youtube"; videoId: string; muted?: boolean };

// Returns a Firestore-safe version of a FadeScreenBg.
// image-local / video-local are base64 blobs (often >1MB) that exceed Firestore's 1MB doc limit
// and are not accessible from OBS anyway (session-scoped blob URL). Substitute black.
const toFiresafeFadeBg = (bg: FadeScreenBg): FadeScreenBg =>
  bg.type === "image-local" || bg.type === "video-local"
    ? { type: "color", color: "#000000" }
    : bg;

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

const ANIM_OPTIONS: AnimStyle[] = ["word-fade","word-bounce","typewriter","blur-in","fade","none","echo","breathe"];
const ANIM_LABELS:  Record<AnimStyle, string> = { "word-fade":"Word Fade","word-bounce":"Bounce","typewriter":"Type","blur-in":"Blur","fade":"Fade","none":"None","echo":"Echo","breathe":"Breathe" };

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
  if      (style==="none")        { gsap.set(el,{opacity:1}); gsap.set([...ws,...cs,...ls],{opacity:1,y:0,scale:1,filter:"none"}); return; }
  else if (style==="fade")        gsap.fromTo(el,{opacity:0},{opacity:1,duration:0.8,ease:"power2.out"});
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
  // "none" style: no looping — just return a no-op cleanup
  if (style === "none") return () => {};
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
              {(bgVideo.type === "local" || bgVideo.type === "firebase") ? (
                <video
                  key={(bgVideo.type === "firebase" && bgVideo.localUrl) ? bgVideo.localUrl : bgVideo.url}
                  src={(bgVideo.type === "firebase" && bgVideo.localUrl) ? bgVideo.localUrl : bgVideo.url}
                  autoPlay loop muted playsInline
                  style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              ) : bgVideo.type === "youtube" ? (
                <iframe key={bgVideo.videoId}
                  src={`https://www.youtube.com/embed/${bgVideo.videoId}?autoplay=1&loop=1&playlist=${bgVideo.videoId}&mute=1&muted=1&controls=0&disablekb=1&fs=0&modestbranding=1&iv_load_policy=3&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`}
                  style={{ width:"100%", height:"100%", border:"none", pointerEvents:"none" }}
                  allow="autoplay; encrypted-media" title="video-bg"
                  onLoad={e => {
                    const fw = (e.target as HTMLIFrameElement).contentWindow;
                    if (fw) {
                      fw.postMessage('{"event":"command","func":"mute","args":""}', '*');
                      fw.postMessage('{"event":"command","func":"setVolume","args":[0]}', '*');
                    }
                  }} />
              ) : (
                /* image-firebase — render as <img> or <video> based on url extension */
                <video
                  key={(bgVideo as {localUrl?: string}).localUrl || (bgVideo as {url?: string}).url}
                  src={(bgVideo as {localUrl?: string}).localUrl || (bgVideo as {url?: string}).url}
                  autoPlay loop muted playsInline
                  style={{ width:"100%", height:"100%", objectFit:"cover" }} />
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
  // ── Echo advanced settings ───────────────────────────────────────────────
  echoSacredScale:  number;  // size multiplier for sacred words  (default 1.75)
  echoContentScale: number;  // size multiplier for content words (default 1.30)
  echoFuncScale:    number;  // size multiplier for function words(default 0.62)
  echoAnimDuration: number;  // entry animation duration ms       (default 400)
  echoBounce:       number;  // back.out overshoot factor          (default 2.8)
  echoMarquee:      boolean; // show/hide background scrolling text
  bigSmallFont:     boolean; // alternate big/small word sizes across all anim styles
}
const DEFAULT_PRESETS: Record<PresetName, LivePreset> = {
  praise:  { name:"Praise",  animStyle:"word-fade", loopInterval:3500, loopEnabled:true, bgIdx:1, echoAlign:"center", echoLines:"auto", echoLineHeight:1.0, lyricsScale:1.0, bgVideo:null, echoSacredScale:1.75, echoContentScale:1.30, echoFuncScale:0.62, echoAnimDuration:400, echoBounce:2.8, echoMarquee:true, bigSmallFont:false },
  worship: { name:"Worship", animStyle:"breathe",   loopInterval:5000, loopEnabled:true, bgIdx:3, echoAlign:"center", echoLines:"auto", echoLineHeight:1.3, lyricsScale:1.0, bgVideo:null, echoSacredScale:1.75, echoContentScale:1.30, echoFuncScale:0.62, echoAnimDuration:400, echoBounce:2.8, echoMarquee:true, bigSmallFont:false },
};

interface Props { allSongs: Song[]; isAdmin: boolean; onToast: (t:string, m:string) => void; onSongUpdated?: (song: Song) => void; }

export default function LiveStageView({ allSongs, onToast, onSongUpdated }: Props) {

  const [sceneSongIds, setSceneSongIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("lsv_scene_songs") ?? "[]") ?? []; } catch { return []; }
  });
  // Cache of full song objects — used as fallback when allSongs hasn't loaded yet (async)
  const [cachedSceneSongObjects, setCachedSceneSongObjects] = useState<Song[]>(() => {
    try { return JSON.parse(localStorage.getItem("lsv_scene_song_objects") ?? "[]") ?? []; } catch { return []; }
  });
  const [selectedSong, setSelectedSong_] = useState<Song | null>(null);
  // Ref mirrors state — pushToFirestore must always read the CURRENT song even when
  // called from a stale closure (e.g. arrow-key effect fires before React re-render).
  const selectedSongRef = useRef<Song | null>(null);
  const setSelectedSong = (song: Song | null) => { selectedSongRef.current = song; setSelectedSong_(song); };
  // In-session lyrics overrides: when the user edits lyrics from the modal,
  // we keep the new text here so reopening the modal shows the updated version
  // even before Firestore syncs (which may not happen when offline).
  const [lyricOverrides, setLyricOverrides] = useState<Record<string, string>>({});
  const [sections, setSections_]         = useState<LyricSection[]>([]);
  // Ref mirrors sections — keyboard handler must always use current sections even
  // when it fires between React renders (stale closure window).
  const sectionsRef = useRef<LyricSection[]>([]);
  const setSections = (v: LyricSection[] | ((prev: LyricSection[]) => LyricSection[])) => {
    setSections_(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      sectionsRef.current = next;
      return next;
    });
  };
  const [activeSlide, setActiveSlide_]   = useState<LyricSlide | null>(null);
  // Ref mirrors activeSlide — keyboard handler reads this to avoid stale globalIdx
  const activeSlideRef = useRef<LyricSlide | null>(null);
  const setActiveSlide = (v: LyricSlide | null | ((prev: LyricSlide | null) => LyricSlide | null)) => {
    setActiveSlide_(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      activeSlideRef.current = next;
      return next;
    });
  };
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
  // Always-current ref — used by auto-sync useEffect (empty-dep closure) to avoid
  // reading stale presets state when the online event fires after a long session.
  const presetsRef = React.useRef(presets);
  presetsRef.current = presets;
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
  // ── Echo advanced settings state ───────────────────────────────────────────────
  const [echoSacredScale,  setEchoSacredScale]  = useState<number>(_cur.echoSacredScale  ?? 1.75);
  const [echoContentScale, setEchoContentScale] = useState<number>(_cur.echoContentScale ?? 1.30);
  const [echoFuncScale,    setEchoFuncScale]    = useState<number>(_cur.echoFuncScale    ?? 0.62);
  const [echoAnimDuration, setEchoAnimDuration] = useState<number>(_cur.echoAnimDuration ?? 400);
  const [echoBounce,       setEchoBounce]       = useState<number>(_cur.echoBounce       ?? 2.8);
  const [echoMarquee,      setEchoMarquee]      = useState<boolean>(_cur.echoMarquee     ?? true);
  const [bigSmallFont,     setBigSmallFont]     = useState<boolean>(_cur.bigSmallFont    ?? false);
  // Refs that always hold the latest values — used by toggleFadeScreen to avoid stale closures
  const bgIdxRef   = useRef<number>(_cur.bgIdx);
  const bgVideoRef = useRef<BgVideo | null>(_cur.bgVideo ?? null);
  const setBgIdx   = (v: number)           => { bgIdxRef.current   = v; setBgIdxState(v); };
  const setBgVideo = (v: BgVideo | null)   => { bgVideoRef.current = v; setBgVideoState(v); };

  // ── Song-specific background meta ───────────────────────────────────────────
  // Declared early so applySongBackground (called by handleSongSelect) can reference them.
  type SongBgMeta = { firebaseUrl: string; mediaId: string; mediaType: 'image' | 'video' };
  const [songBgMeta, setSongBgMeta] = useState<Record<string, SongBgMeta>>(() => {
    try { return JSON.parse(localStorage.getItem("lsv_song_bgs") ?? "{}") ?? {}; } catch { return {}; }
  });
  const songBgMetaRef = useRef<Record<string, SongBgMeta>>({});
  songBgMetaRef.current = songBgMeta;
  const songBgBlobUrlRef = useRef<string | null>(null);


  /** Apply the song-specific background (or restore preset BG if none assigned).
   *  Pulls IDB blob for offline-safe localUrl, then pushes bgVideo to OBS. */
  const applySongBackground = async (song: Song) => {
    if (songBgBlobUrlRef.current) {
      URL.revokeObjectURL(songBgBlobUrlRef.current);
      songBgBlobUrlRef.current = null;
    }
    const meta = songBgMetaRef.current[song.id];
    if (!meta) return; // no song BG assigned — leave current preset BG unchanged

    // Step 1 — push immediately with Firebase URL so display updates NOW
    const bgValImmediate: BgVideo = meta.mediaType === 'video'
      ? { type: 'firebase' as const, url: meta.firebaseUrl }
      : { type: 'image-firebase' as const, url: meta.firebaseUrl };
    setBgVideo(bgValImmediate);
    fetch('/api/live-push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _bgOnly: true, bgVideo: bgValImmediate, bgIdx: bgIdxRef.current, updatedAt: Date.now() }),
    }).catch(() => {});

    // Step 1b — re-push at 600ms to WIN over applyPreset's 550ms setTimeout that may overwrite us
    // applyPreset (triggered by auto-preset switch on song tags) fires its bgVideo push at 550ms.
    // Our 600ms push fires 50ms later and guarantees the song-specific background always wins.
    setTimeout(() => {
      if (selectedSongRef.current?.id !== song.id) return; // user switched song — don't overwrite
      const curBg = bgVideoRef.current;
      if (curBg) {
        setBgVideo(curBg); // re-assert current song bg in React state
        fetch('/api/live-push', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _bgOnly: true, bgVideo: curBg, bgIdx: bgIdxRef.current, updatedAt: Date.now() }),
        }).catch(() => {});
      }
    }, 600);

    // Step 2 — check if server-disk copy exists (uploaded during assignment)
    // Use /api/live-bg-video/song_<id> as localUrl — real HTTP URL, not blob:
    const presetKey = `song_${song.id}`;
    const serverLocalUrl = `/api/live-bg-video/${presetKey}`;
    try {
      const check = await fetch(serverLocalUrl, { method: 'HEAD' });
      if (check.ok) {
        const bgValLocal: BgVideo = meta.mediaType === 'video'
          ? { type: 'firebase' as const, url: meta.firebaseUrl, localUrl: serverLocalUrl }
          : { type: 'image-firebase' as const, url: meta.firebaseUrl, localUrl: serverLocalUrl };
        setBgVideo(bgValLocal);
        fetch('/api/live-push', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _bgOnly: true, bgVideo: bgValLocal, bgIdx: bgIdxRef.current, updatedAt: Date.now() }),
        }).catch(() => {});
        return; // done — server disk has it
      }
    } catch { /* server not running offline — firebase URL already pushed */ }

    // Step 3 — server doesn't have it yet: upload from IDB blob now
    try {
      const blob = await idbGet<Blob>(`media_blob_${meta.mediaId}`);
      if (blob instanceof Blob) {
        const fd = new FormData();
        const ext = meta.mediaType === 'video' ? 'mp4' : 'jpg';
        fd.append('video', blob, `${presetKey}.${ext}`);
        const uploadRes = await fetch(`/api/live-bg-video/${presetKey}`, { method: 'POST', body: fd });
        if (uploadRes.ok) {
          const bgValLocal: BgVideo = meta.mediaType === 'video'
            ? { type: 'firebase' as const, url: meta.firebaseUrl, localUrl: serverLocalUrl }
            : { type: 'image-firebase' as const, url: meta.firebaseUrl, localUrl: serverLocalUrl };
          setBgVideo(bgValLocal);
          fetch('/api/live-push', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ _bgOnly: true, bgVideo: bgValLocal, bgIdx: bgIdxRef.current, updatedAt: Date.now() }),
          }).catch(() => {});
        }
      }
    } catch { /* IDB miss — Firebase URL already pushed above */ }
  };



  const [ytInputs, setYtInputs] = useState<Record<PresetName, string>>({ praise:"", worship:"" });

  const [settingsOpen,  setSettingsOpen]  = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  // Ref so saveFadeScreenBg closure can read settingsOpen without stale capture
  const settingsOpenRef = useRef(false);
  // Default View has been removed — Grid View (LyricsGridModal) is now the sole view.
  const [echoApplied, setEchoApplied]  = useState(() => _cur.animStyle === "echo");
  const isMobile = useWindowWidth() <= 700;

  // ── Modal draft state — edits both presets before committing on Save ────────
  const [settingsTab,     setSettingsTab]     = useState<"praise" | "worship" | "fade">("praise");
  const [modalDrafts,     setModalDrafts]     = useState<Record<PresetName, LivePreset>>({ ...DEFAULT_PRESETS });
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  // mediaPicker: when set, a compact picker opens inside settings to pick media for a specific target
  const [mediaPicker, setMediaPicker] = useState<MediaTarget | null>(null);
  const [videoUploading,  setVideoUploading]  = useState<Record<PresetName, boolean>>({ praise: false, worship: false });
  const [videoProgress,   setVideoProgress]   = useState<Record<PresetName, number>>({ praise: 0, worship: 0 });
  // Local-only video upload (no Firebase) — for fully offline use
  const [localOnlyUploading, setLocalOnlyUploading] = useState<Record<PresetName, boolean>>({ praise: false, worship: false });
  const [localOnlyProgress,  setLocalOnlyProgress]  = useState<Record<PresetName, number>>({ praise: 0, worship: 0 });
  // Fade screen background upload progress
  const [fadeImgUploading, setFadeImgUploading] = useState(false);
  const [fadeImgProgress,  setFadeImgProgress]  = useState(0);
  const [fadeVidUploading, setFadeVidUploading] = useState(false);
  const [fadeVidProgress,  setFadeVidProgress]  = useState(0);

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
      ? { songTitle: selectedSong?.title ?? "", lines: slide.lines, animStyle: slide.animStyle, visible: true,  bgIdx: curBgIdx, echoAlign, echoLines, echoLineHeight, lyricsScale, loopEnabled, bgVideo: curBgVideo, loopInterval, echoSacredScale, echoContentScale, echoFuncScale, echoAnimDuration, echoBounce, echoMarquee, bigSmallFont }
      : { songTitle: "",                        lines: [],          animStyle: "word-fade",     visible: false, bgIdx: curBgIdx, echoAlign, echoLines, echoLineHeight, lyricsScale, loopEnabled, bgVideo: curBgVideo, loopInterval, echoSacredScale, echoContentScale, echoFuncScale, echoAnimDuration, echoBounce, echoMarquee, bigSmallFont };

    if (next) {
      // ── ACTIVATE fade ────────────────────────────────────────────────────────
      // Push FULL scene + fadeScreen:true so the server retains all scene data.
      // OBS display will show the overlay AND pre-load the scene behind it — no flash.
      fetch("/api/live-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // toFiresafeFadeBg strips image-local/video-local base64 (Firestore 1MB limit)
        body: JSON.stringify({ ...sceneBase, fadeScreen: true, fadeScreenBg: toFiresafeFadeBg(fadeScreenBgRef.current) }),
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
    // Large local types (base64) live in IDB only — never in Firestore.
    // Firebase types are just URLs — store in localStorage (tiny payload).
    // Strip any session-scoped blob: localUrl before persisting — blob: URLs are
    // invalid after a page refresh and would leave OBS with a broken image on next load.
    const safeBg: FadeScreenBg = (bg as { localUrl?: string }).localUrl?.startsWith("blob:")
      ? ({ ...bg, localUrl: undefined } as FadeScreenBg)
      : bg;
    if (safeBg.type === "image-local" || safeBg.type === "video-local") {
      idbSet("lsv_fade_screen", safeBg).catch(e =>
        console.warn("[LiveStage] IDB write failed:", e)
      );
      try { localStorage.removeItem("lsv_fade_screen"); } catch {}
    } else {
      try { localStorage.setItem("lsv_fade_screen", JSON.stringify(safeBg)); } catch (e) {
        console.warn("[LiveStage] localStorage write failed:", e);
      }
      idbSet("lsv_fade_screen", safeBg).catch(() => {});
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
          body: JSON.stringify({ fadeScreen: true, fadeScreenBg: toFiresafeFadeBg(bg), updatedAt: Date.now() }),
        }).catch(() => {});
      }
    }
  };

  // ── Resolve preset from song tags ───────────────────────────────────
  // Rules: any tag whose name contains 'joyful' or 'praise'  → praise scene
  //        any tag whose name contains 'solemn' or 'worship' → worship scene
  //        otherwise → null (no auto-switch)
  const resolvePresetFromSong = (song: Song): PresetName | null => {
    const names = (song.tags ?? []).map(t => t.name.toLowerCase());
    if (names.some(n => n.includes("joyful") || n.includes("praise")))  return "praise";
    if (names.some(n => n.includes("solemn") || n.includes("worship"))) return "worship";
    return null;
  };

  // Song click handler — selects song, clears previous slide immediately, auto-applies preset from tags
  const handleSongSelect = (song: Song) => {
    // Wipe ALL previous-song state in the same React batch:
    setSections([]);
    setActiveSlide(null);
    setSelectedSong(song);
    // Persist selected song ID so it survives server restarts
    try { localStorage.setItem("lsv_selected_song_id", song.id); } catch {}
    // Auto-switch preset from song tags (praise/worship)
    const resolved = resolvePresetFromSong(song);
    if (resolved && resolved !== activePreset) {
      applyPreset(resolved);
      const label = resolved === "praise" ? "Praise" : "Worship";
      onToast('info', `⚡ Auto-switched to ${label} scene`);
    }
    // Apply song-specific background (async — pulls IDB blob for offline)
    applySongBackground(song);
  };

  // Restore last selected song from allSongs once they are available (async load)
  // _restoredSelectedRef guards against double-restore (StrictMode / re-renders)
  useEffect(() => {
    if (_restoredSelectedRef.current) return;        // already restored
    if (allSongs.length === 0) return;               // songs not loaded yet
    _restoredSelectedRef.current = true;
    try {
      const savedId = localStorage.getItem("lsv_selected_song_id");
      // Only restore if the user explicitly saved a song — never auto-select allSongs[0]
      // (that would make the Praise button glow before the user picks anything this session)
      const song = savedId ? (allSongs.find(s => s.id === savedId) ?? null) : null;
      if (song) {
        setSelectedSong(song);
        // Restore preset settings silently — intentionally NOT calling applyPreset()
        // so setPresetActivated stays false. Buttons only highlight when the user
        // explicitly clicks them (or selects a song) this session.
        const resolved = resolvePresetFromSong(song);
        if (resolved) {
          const p = presets[resolved];
          setActivePreset(resolved);
          setBgIdx(p.bgIdx);
          setEchoAlign(p.echoAlign);
          setEchoLines(p.echoLines);
          setEchoLineHeight(p.echoLineHeight);
          setLyricsScale(p.lyricsScale ?? 1.0);
          setLoopEnabled(p.loopEnabled ?? true);
          setDefaultAnimStyle(p.animStyle);
          setLoopInterval(p.loopInterval);
          setBgVideo(p.bgVideo ?? null);
        }
      }
    } catch { /* noop */ }
  }, [allSongs]); // eslint-disable-line

  // ── Force fade screen ON every time the Live Stage module is first loaded ───
  // This ensures OBS always starts in a safe faded/black state on each session.
  useEffect(() => {
    // Always force fade ON regardless of localStorage
    setFadeScreenActive(true);
    fadeScreenActiveRef.current = true;
    localStorage.setItem("lsv_fade_active", "1");
    // Push fade-on to OBS — _bgOnly:true so we ONLY activate the overlay without
    // wiping the existing bgVideo in liveState (bgVideoRef.current may be null at mount
    // if localStorage hasn't loaded yet, which would erase the active background from OBS).
    fetch("/api/live-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        _bgOnly: true,
        visible: false, lines: [], songTitle: "",
        fadeScreen: true, fadeScreenBg: toFiresafeFadeBg(fadeScreenBgRef.current),
        updatedAt: Date.now(),
      }),
    }).catch(() => {});
  }, []); // mount-only — runs once when Live Stage opens

  // Restore fade screen background from IndexedDB on mount.
  // IDB is async so we can't read it in useState initializer — this effect patches
  // the state after mount. If localStorage already has a valid non-image value it's
  // used immediately; IDB overrides it if the user had uploaded an image.
  // IMPORTANT: After restoring, re-push to OBS if fade is active so OBS never
  // stays black after a hard refresh.
  useEffect(() => {
    idbGet<FadeScreenBg>("lsv_fade_screen").then(idbBg => {
      // If IDB has data (image/video local), prefer it over localStorage value
      if (idbBg) {
        setFadeScreenBg(idbBg);
        setModalFadeScreenBg(idbBg);
        fadeScreenBgRef.current = idbBg;
      }
      // Sync OBS if fade was active — use best available bg (IDB or already-read localStorage)
      // This covers the common case where the bg is a plain color stored only in localStorage.
      if (fadeScreenActiveRef.current) {
        const rawBg = idbBg ?? fadeScreenBgRef.current;
        // Never send image-local / video-local base64 to Firestore — exceeds 1MB limit.
        const safeBg = toFiresafeFadeBg(rawBg);
        setTimeout(() => {
          fetch("/api/live-push", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fadeScreen: true, fadeScreenBg: safeBg, updatedAt: Date.now() }),
          }).catch(() => {});
        }, 200);
      }
    }).catch(() => {});
  }, []); // eslint-disable-line

  // ── Auto-sync: upload pending local-only videos to Firebase when internet returns ──
  // When the user uploads a video offline via "Use Local Video (No Internet)…", the
  // raw File blob is saved in IDB under lsv_pending_sync_blob_<preset> and the
  // metadata in lsv_pending_sync_meta_<preset>.
  // This effect picks those up and uploads to Firebase Storage + Firestore media_library,
  // then upgrades the preset bgVideo from { type:"local" } → { type:"firebase" } automatically.
  useEffect(() => {
    const attemptSync = async () => {
      if (!navigator.onLine) return;
      const PRESETS: PresetName[] = ["praise", "worship"];
      for (const preset of PRESETS) {
        const file = await idbGet<File>(`lsv_pending_sync_blob_${preset}`);
        const meta = await idbGet<{ name: string; mimeType: string; sizeBytes: number; localUrl: string }>(`lsv_pending_sync_meta_${preset}`);
        if (!file || !meta) continue;

        // Check the preset's current bgVideo — only sync if it's still type:"local"
        // Use presetsRef (always-current) instead of presets (stale closure from mount)
        const currentBgVideo = presetsRef.current[preset]?.bgVideo;
        if (!currentBgVideo || currentBgVideo.type !== "local") {
          // Already upgraded or removed — clear the queue entries
          await idbSet(`lsv_pending_sync_blob_${preset}`, null).catch(() => {});
          await idbSet(`lsv_pending_sync_meta_${preset}`, null).catch(() => {});
          continue;
        }

        console.log(`[AutoSync] Pending local-only video for "${preset}" — syncing to Firebase…`);
        try {
          const { name, mimeType, sizeBytes, localUrl } = meta;
          const ext = name.split(".").pop() || "mp4";
          const path = `live-bg-videos/${preset}.${ext}`;

          // Upload to Firebase Storage
          const sRef = storageRef(storage, path);
          const task = uploadBytesResumable(sRef, file);
          const firebaseUrl = await new Promise<string>((resolve, reject) => {
            task.on("state_changed", undefined, reject, async () => {
              resolve(await getDownloadURL(task.snapshot.ref));
            });
          });

          // Add to Firestore media_library so it appears in the Media Library modal
          await addDoc(collection(db, "media_library"), {
            name, type: "video",
            firebaseUrl, storagePath: path,
            uploadedAt: Date.now(), sizeBytes, mimeType,
          });

          // Upgrade preset bgVideo: local → firebase (keep localUrl as offline fallback)
          const upgradedBg: BgVideo = { type: "firebase", url: firebaseUrl, localUrl };
          setPresets(prev => {
            const updated = { ...prev, [preset]: { ...prev[preset], bgVideo: upgradedBg } };
            try { localStorage.setItem("lsv_presets", JSON.stringify(updated)); } catch {}
            return updated;
          });
          // Apply to live state if this is the active preset
          if (activePreset === preset) setBgVideo(upgradedBg);

          // Clear IDB queue — sync complete
          await idbSet(`lsv_pending_sync_blob_${preset}`, null).catch(() => {});
          await idbSet(`lsv_pending_sync_meta_${preset}`, null).catch(() => {});
          onToast("success", `☁️ "${name}" auto-synced to cloud for "${preset}" preset!`);
          console.log(`[AutoSync] ✅ "${preset}" video synced → ${firebaseUrl}`);
        } catch (err) {
          console.warn(`[AutoSync] Failed to sync "${preset}" video:`, err);
          // Don't clear IDB — will retry on the next online event
        }
      }
    };

    // Run immediately in case we're already online when the component mounts
    attemptSync();
    window.addEventListener("online", attemptSync);
    return () => window.removeEventListener("online", attemptSync);
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
    // Note: we intentionally do NOT strip type:"local" bgVideos here.
    // The auto-sync useEffect will upgrade them to type:"firebase" when internet returns.
    // Stripping them would cause the user to lose their offline-uploaded video
    // if they reopen settings while online.

    setModalDrafts({
      praise:  { ...DEFAULT_PRESETS.praise,  ...normalizedPraise  },
      worship: { ...DEFAULT_PRESETS.worship, ...normalizedWorship },
    });
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
    setEchoSacredScale(p.echoSacredScale   ?? 1.75);
    setEchoContentScale(p.echoContentScale ?? 1.30);
    setEchoFuncScale(p.echoFuncScale       ?? 0.62);
    setEchoAnimDuration(p.echoAnimDuration ?? 400);
    setEchoBounce(p.echoBounce             ?? 2.8);
    setEchoMarquee(p.echoMarquee           ?? true);
    setBigSmallFont(p.bigSmallFont          ?? false);
    setSections(prev => prev.map(sec => ({ ...sec, slides: sec.slides.map(s => ({ ...s, animStyle: p.animStyle })) })));
    setActiveSlide(prev => prev ? { ...prev, animStyle: p.animStyle } : prev);
    localStorage.setItem("lsv_active_preset", name);
    if (fadeScreenActiveRef.current) {
      // Fade is active — pre-load the new scene behind the overlay (no transition flash)
      fetch("/api/live-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fadeScreen: true, fadeScreenBg: toFiresafeFadeBg(fadeScreenBgRef.current),
          bgIdx: p.bgIdx, echoAlign: p.echoAlign, echoLines: p.echoLines,
          echoLineHeight: p.echoLineHeight, bgVideo: p.bgVideo ?? null,
          lyricsScale: p.lyricsScale ?? 1.0,
          loopInterval: p.loopInterval, loopEnabled: p.loopEnabled ?? true, visible: false, lines: [], animStyle: p.animStyle,
          echoSacredScale: p.echoSacredScale ?? 1.75, echoContentScale: p.echoContentScale ?? 1.30,
          echoFuncScale: p.echoFuncScale ?? 0.62, echoAnimDuration: p.echoAnimDuration ?? 400,
          echoBounce: p.echoBounce ?? 2.8, echoMarquee: p.echoMarquee ?? true, bigSmallFont: p.bigSmallFont ?? false,
          updatedAt: Date.now(),
        }),
      }).catch(() => {});
    } else {
      // Fade is off — flash black then immediately push the full new scene
      fetch("/api/live-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transitioning: true, updatedAt: Date.now() }),
      }).catch(() => {});
      // Follow up with full new scene so OBS gets all updated settings
      setTimeout(() => {
        fetch("/api/live-push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bgIdx: p.bgIdx, echoAlign: p.echoAlign, echoLines: p.echoLines,
            echoLineHeight: p.echoLineHeight, bgVideo: p.bgVideo ?? null,
            lyricsScale: p.lyricsScale ?? 1.0,
            loopInterval: p.loopInterval, loopEnabled: p.loopEnabled ?? true,
            visible: false, lines: [], animStyle: p.animStyle,
            echoSacredScale: p.echoSacredScale ?? 1.75, echoContentScale: p.echoContentScale ?? 1.30,
            echoFuncScale: p.echoFuncScale ?? 0.62, echoAnimDuration: p.echoAnimDuration ?? 400,
            echoBounce: p.echoBounce ?? 2.8, echoMarquee: p.echoMarquee ?? true, bigSmallFont: p.bigSmallFont ?? false,
            updatedAt: Date.now(),
          }),
        }).catch(() => {});
      }, 550); // after the 0.5s fade-to-black completes
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
      setEchoSacredScale(live.echoSacredScale   ?? 1.75);
      setEchoContentScale(live.echoContentScale ?? 1.30);
      setEchoFuncScale(live.echoFuncScale       ?? 0.62);
      setEchoAnimDuration(live.echoAnimDuration ?? 400);
      setEchoBounce(live.echoBounce             ?? 2.8);
      setEchoMarquee(live.echoMarquee           ?? true);
      setBigSmallFont(live.bigSmallFont          ?? false);
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
      // Push to OBS if fade is active — convert local base64 to black fallback (Firestore 1MB limit)
      if (fadeScreenActiveRef.current) {
        fetch("/api/live-push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fadeScreen: true, fadeScreenBg: toFiresafeFadeBg(modalFadeScreenBg), updatedAt: Date.now() }),
        }).catch(() => {});
      }
      // Explicitly re-push full scene to OBS so ALL settings (lyricsScale, loopInterval, etc.) take effect
      // Do it inside a timeout so all the above setState calls have settled
      setTimeout(() => {
        const activeSlideSnap = activeSlide ? { ...activeSlide, animStyle: live.animStyle } : null;
        const fullPayload = activeSlideSnap
          ? { songTitle: selectedSong?.title ?? "", lines: activeSlideSnap.lines, animStyle: live.animStyle, visible: true,
              bgIdx: live.bgIdx, echoAlign: live.echoAlign, echoLines: live.echoLines, echoLineHeight: live.echoLineHeight,
              lyricsScale: live.lyricsScale ?? 1.0, loopEnabled: live.loopEnabled ?? true,
              bgVideo: live.bgVideo ?? null, loopInterval: live.loopInterval,
              echoSacredScale: live.echoSacredScale ?? 1.75, echoContentScale: live.echoContentScale ?? 1.30,
              echoFuncScale: live.echoFuncScale ?? 0.62, echoAnimDuration: live.echoAnimDuration ?? 400,
              echoBounce: live.echoBounce ?? 2.8, echoMarquee: live.echoMarquee ?? true, bigSmallFont: live.bigSmallFont ?? false,
              updatedAt: Date.now() }
          : { songTitle: "", lines: [], animStyle: live.animStyle, visible: false,
              bgIdx: live.bgIdx, echoAlign: live.echoAlign, echoLines: live.echoLines, echoLineHeight: live.echoLineHeight,
              lyricsScale: live.lyricsScale ?? 1.0, loopEnabled: live.loopEnabled ?? true,
              bgVideo: live.bgVideo ?? null, loopInterval: live.loopInterval,
              echoSacredScale: live.echoSacredScale ?? 1.75, echoContentScale: live.echoContentScale ?? 1.30,
              echoFuncScale: live.echoFuncScale ?? 0.62, echoAnimDuration: live.echoAnimDuration ?? 400,
              echoBounce: live.echoBounce ?? 2.8, echoMarquee: live.echoMarquee ?? true, bigSmallFont: live.bigSmallFont ?? false,
              updatedAt: Date.now() };
        if (fadeScreenActiveRef.current) {
          fetch("/api/live-push", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...fullPayload, fadeScreen: true, fadeScreenBg: toFiresafeFadeBg(modalFadeScreenBg) }) }).catch(() => {});
        } else {
          fetch("/api/live-push", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fullPayload) }).catch(() => {});
        }
      }, 50);
      setSettingsSaved(true);
      setTimeout(() => { setSettingsSaved(false); closeSettings(); }, 1500);
    } catch (err) {
      console.error("[saveSettings] Error:", err);
      // Still close the modal so the user isn't stuck
      closeSettings();
    }
  };

  // Closes the Settings modal.
  // Note: LyricsGridModal is always mounted (keep-alive via CSS display:none),
  // so we never need to re-open it here \u2014 it was never closed.
  const closeSettings = () => {
    settingsOpenRef.current = false;
    setSettingsOpen(false);
  };

  // ── No global bgVideo localStorage persistence — bgVideo lives in lsv_presets per-preset ──

  const pushToFirestore = (slide: LyricSlide | null) => {
    // ⚠️ Always read from selectedSongRef (not selectedSong state) — arrow-key
    // handler can fire before React re-renders after a song switch, so the state
    // closure would still hold the OLD song. The ref is always current.
    const currentSong = selectedSongRef.current;
    const payload = slide
      ? { songTitle: currentSong?.title ?? "", lines: slide.lines, animStyle: slide.animStyle, visible: true,  bgIdx, echoAlign, echoLines, echoLineHeight, lyricsScale, loopEnabled, bgVideo, loopInterval, echoSacredScale, echoContentScale, echoFuncScale, echoAnimDuration, echoBounce, echoMarquee, bigSmallFont }
      : { songTitle: "",                        lines: [],          animStyle: "word-fade",     visible: false, bgIdx, echoAlign, echoLines, echoLineHeight, lyricsScale, loopEnabled, bgVideo, loopInterval, echoSacredScale, echoContentScale, echoFuncScale, echoAnimDuration, echoBounce, echoMarquee, bigSmallFont };
    if (fadeScreenActiveRef.current) {
      // Fade is active — pre-load scene data behind overlay, keep fadeScreen:true so overlay stays
      // Use fadeScreenBgRef.current (not state) to avoid stale closure captures
      fetch("/api/live-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, fadeScreen: true, fadeScreenBg: toFiresafeFadeBg(fadeScreenBgRef.current), updatedAt: Date.now() }),
      }).catch(() => {});
    } else {
      fetch("/api/live-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, updatedAt: Date.now() }) }).catch(() => {});
    }
  };



  useEffect(() => { pushToFirestore(activeSlide); }, [activeSlide, bgIdx, echoAlign, echoLines, echoLineHeight, bgVideo, lyricsScale, loopEnabled, loopInterval, echoSacredScale, echoContentScale, echoFuncScale, echoAnimDuration, echoBounce, echoMarquee, bigSmallFont]); // eslint-disable-line

  useEffect(() => {
    // Always wipe sections first so old song slides are never visible during the parse
    setSections([]);
    setActiveSlide(null);
    if (!selectedSong) return;
    const parsed = parseSections(selectedSong.lyrics);
    const withStyle = parsed.map(sec => ({ ...sec, slides: sec.slides.map(s => ({ ...s, animStyle: defaultAnimStyle })) }));
    setSections(withStyle);
  }, [selectedSong]); // eslint-disable-line

  // When lyrics are edited from the grid modal, update sections in-place
  // WITHOUT clearing activeSlide or going through selectedSong state.
  // This is the single source of truth for in-session lyric edits.
  useEffect(() => {
    if (!selectedSong) return;
    const override = lyricOverrides[selectedSong.id];
    if (!override) return;
    const parsed = parseSections(override);
    const withStyle = parsed.map(sec => ({ ...sec, slides: sec.slides.map(s => ({ ...s, animStyle: defaultAnimStyle })) }));
    setSections(withStyle);
    // Keep selectedSong.lyrics in sync so other code (OBS push, etc.) reads correct text
    selectedSongRef.current = { ...selectedSongRef.current!, lyrics: override };
  }, [lyricOverrides, selectedSong?.id]); // eslint-disable-line

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
    // Also persist the full song object so dropdown works on next load before allSongs arrives
    setCachedSceneSongObjects(prev => {
      if (prev.some(s => s.id === song.id)) return prev;
      const next = [...prev, song];
      try { localStorage.setItem("lsv_scene_song_objects", JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const removeFromScene = (songId: string) => {
    setSceneSongIds(prev => {
      const next = prev.filter(id => id !== songId);
      try { localStorage.setItem("lsv_scene_songs", JSON.stringify(next)); } catch {}
      return next;
    });
    setCachedSceneSongObjects(prev => {
      const next = prev.filter(s => s.id !== songId);
      try { localStorage.setItem("lsv_scene_song_objects", JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const reorderScene = (newIds: string[]) => {
    setSceneSongIds(newIds);
    try { localStorage.setItem("lsv_scene_songs", JSON.stringify(newIds)); } catch {}
    // Reorder cachedSceneSongObjects to match new order
    setCachedSceneSongObjects(prev => {
      const byId = new Map(prev.map(s => [s.id, s]));
      const next = newIds.map(id => byId.get(id)).filter(Boolean) as typeof prev;
      try { localStorage.setItem("lsv_scene_song_objects", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // Derive sceneSongs: use allSongs when loaded, fall back to cached objects on initial render
  const sceneSongs = sceneSongIds
    .map(id => allSongs.find(s => s.id === id) ?? cachedSceneSongObjects.find(s => s.id === id))
    .filter(Boolean) as Song[];
  // Keep cachedSceneSongObjects in sync once allSongs arrives
  // (updates stale cached data with fresh Firestore data)
  React.useEffect(() => {
    if (allSongs.length === 0) return;
    const updated = sceneSongIds
      .map(id => allSongs.find(s => s.id === id))
      .filter(Boolean) as Song[];
    if (updated.length === 0) return;
    setCachedSceneSongObjects(updated);
    try { localStorage.setItem("lsv_scene_song_objects", JSON.stringify(updated)); } catch {}
  }, [allSongs, sceneSongIds]); // eslint-disable-line

  // ── Auto-upload song backgrounds when playlist changes ────────────────────
  // Ensures every song background is cached on local disk even before the song
  // is selected, so OBS has local fallback at camp when offline.
  useEffect(() => {
    const bgs = songBgMetaRef.current;
    for (const songId of sceneSongIds) {
      const meta = bgs[songId];
      if (!meta) continue;
      const presetKey = `song_${songId}`;
      const serverUrl = `/api/live-bg-video/${presetKey}`;
      // Check if already on disk — skip if so
      fetch(serverUrl, { method: "HEAD" })
        .then(r => {
          if (r.ok) return; // already cached
          // Not on disk — upload from IDB blob (non-blocking, fire-and-forget)
          idbGet<Blob>(`media_blob_${meta.mediaId}`).then(blob => {
            if (!(blob instanceof Blob)) return;
            const fd = new FormData();
            const ext = meta.mediaType === "video" ? "mp4" : "jpg";
            fd.append("video", blob, `${presetKey}.${ext}`);
            fetch(serverUrl, { method: "POST", body: fd }).catch(() => {});
          }).catch(() => {});
        })
        .catch(() => {}); // server offline — skip
    }
  }, [sceneSongIds]); // eslint-disable-line



  // Keyboard nav — cross-section aware
  // All slides flattened in section order for seamless up/down navigation
  // Keyboard navigation is handled internally by LyricsGridModal.

  // ── Camp Readiness Check ──────────────────────────────────────────────
  const [showCampReady, setShowCampReady] = useState(false);

  // ── Network / OBS status tracking ────────────────────────────────────────
  // Tracks whether the local SSE connection is live (confirms OBS is receiving)
  const [obsStatus, setObsStatus] = useState<"connecting"|"live"|"lost">("connecting");
  const obsLastPingRef = useRef<number>(Date.now());
  useEffect(() => {
    const es = new EventSource("/api/live-sse");
    const onMsg = () => { obsLastPingRef.current = Date.now(); setObsStatus("live"); };
    es.addEventListener("message", onMsg);
    es.onerror = () => setObsStatus("lost");
    es.onopen  = () => setObsStatus("live");
    // Watchdog: if no message for 8s, mark as lost
    const watchdog = setInterval(() => {
      if (Date.now() - obsLastPingRef.current > 8000) setObsStatus("lost");
      else setObsStatus("live");
    }, 3000);
    return () => { es.close(); clearInterval(watchdog); };
  }, []); // eslint-disable-line

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:"var(--wf-surface,#07090f)", color:"#fff", overflow:"hidden", fontFamily:"inherit" }}>

      {/* ── Camp Readiness Modal ─────────────────────────────────────── */}
      {showCampReady && <CampReadinessModal onClose={() => setShowCampReady(false)} songsCount={allSongs.length} sceneSongs={sceneSongs} songBgMeta={songBgMeta} />}

      {/* ══ Settings Modal ══════════════════════════════════════════════════ */}
      {settingsOpen && (
        <div onClick={e => { if (e.target === e.currentTarget) { setModalFadeScreenBg({ ...fadeScreenBg }); closeSettings(); } }}
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
              <button onClick={() => { setModalFadeScreenBg({ ...fadeScreenBg }); closeSettings(); }}
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
                // Source metadata for status bar
                const fbg     = modalFadeScreenBg;
                const fbgUrl  = (fbg as {url?:string}).url ?? "";
                const fbgYtId = (fbg as {videoId?:string}).videoId ?? "";
                const isLibrary = fbg.type === "image-firebase" || fbg.type === "video-firebase";
                const isLocalUp = fbg.type === "image-local"   || fbg.type === "video-local";
                const isYt      = fbg.type === "video-youtube";
                const isImgType = fbg.type === "image-firebase" || fbg.type === "image-local" || fbg.type === "image-url";
                const hasMedia  = isLibrary || isLocalUp || isYt || fbg.type === "image-url";
                const fadeFileName = (() => {
                  try {
                    const raw = decodeURIComponent(fbgUrl.split("/o/")[1]?.split("?")[0] ?? "");
                    const name = raw.split("/").pop() ?? "";
                    return name.length > 32 ? name.slice(0, 29) + "…" : name;
                  } catch { return ""; }
                })();
                const sourceLabel = isLibrary
                  ? `🗂 Media Library — ${isImgType ? "image" : "video"}${fadeFileName ? `: ${fadeFileName}` : ""}`
                  : isLocalUp
                  ? `💻 Local Computer — ${isImgType ? "image" : "video"}${fadeFileName ? `: ${fadeFileName}` : ""}`
                  : isYt ? `▶ YouTube — ${fbgYtId}`
                  : fbg.type === "image-url" ? `🔗 Image URL (fade screen)`
                  : null;
                const statusBg     = isLibrary ? "rgba(167,139,250,0.10)" : isLocalUp ? "rgba(96,165,250,0.10)" : "rgba(248,113,113,0.10)";
                const statusBorder = isLibrary ? "rgba(167,139,250,0.3)"  : isLocalUp ? "rgba(96,165,250,0.3)"  : "rgba(248,113,113,0.3)";
                const statusColor  = isLibrary ? "#c4b5fd"                : isLocalUp ? "#93c5fd"               : "#fca5a5";
                return (
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.35)", textTransform:"uppercase", letterSpacing:"0.12em" }}>
                      Video / Image Background
                    </span>
                    {/* 1 — Choose from Media Library */}
                    <button
                      onClick={() => setMediaPicker("fade-screen")}
                      style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"11px 14px", borderRadius:9,
                        background:"rgba(167,139,250,0.12)", border:"1px solid rgba(167,139,250,0.35)",
                        color:"#c4b5fd", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                      <FolderOpen size={13} /> Choose from Media Library
                    </button>
                    {/* 2 — Upload local file (image or video → Firebase) */}
                    <label style={{ display:"flex", alignItems:"center", gap:8, padding:"11px 14px", borderRadius:9,
                      background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)",
                      cursor:(fadeImgUploading||fadeVidUploading) ? "not-allowed" : "pointer",
                      fontSize:12, color:"rgba(255,255,255,0.6)" }}>
                      <Upload size={13} />
                      {(fadeImgUploading||fadeVidUploading)
                        ? `Uploading ${fadeImgUploading ? fadeImgProgress : fadeVidProgress}%…`
                        : (hasMedia && !isYt ? "Change file…" : "Upload image or video file…")}
                      <input type="file" accept="image/*,video/*" style={{ display:"none" }}
                        disabled={fadeImgUploading||fadeVidUploading}
                        onChange={async e => {
                          const file = e.target.files?.[0]; if (!file) return;
                          const isImg = file.type.startsWith("image/");
                          try {
                            if (isImg) { setFadeImgUploading(true); setFadeImgProgress(0); }
                            else       { setFadeVidUploading(true); setFadeVidProgress(0); }
                            const ext = file.name.split(".").pop() || (isImg ? "jpg" : "mp4");
                            const sRef = storageRef(storage, `live-fade-bg/${isImg ? "image" : "video"}.${ext}`);
                            const task = uploadBytesResumable(sRef, file);
                            await new Promise<void>((resolve, reject) => {
                              task.on("state_changed",
                                snap => {
                                  const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
                                  if (isImg) setFadeImgProgress(pct); else setFadeVidProgress(pct);
                                }, reject, resolve);
                            });
                            const url = await getDownloadURL(task.snapshot.ref);
                            const newBg: FadeScreenBg = isImg
                              ? { type: "image-firebase", url }
                              : { type: "video-firebase", url };
                            saveFadeScreenBg(newBg);
                            idbSet("lsv_fade_screen", newBg).catch(() => {});
                            try { localStorage.setItem("lsv_fade_screen", JSON.stringify(newBg)); } catch {}
                            onToast("success", `✅ ${isImg ? "Image" : "Video"} uploaded to Firebase`);
                          } catch {
                            onToast("error", "Upload failed — try again.");
                          } finally {
                            if (isImg) { setFadeImgUploading(false); e.target.value = ""; }
                            else       { setFadeVidUploading(false); e.target.value = ""; }
                          }
                        }} />
                    </label>
                    {/* 3 — YouTube URL */}
                    <div style={{ display:"flex", gap:6 }}>
                      <input
                        value={fadeImageUrlInput}
                        onChange={e => setFadeImageUrlInput(e.target.value)}
                        placeholder="YouTube URL…"
                        onKeyDown={e => {
                          if (e.key === "Enter" && fadeImageUrlInput) {
                            const m = fadeImageUrlInput.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/v\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
                            const id = m ? m[1] : fadeImageUrlInput.trim();
                            saveFadeScreenBg({ type:"video-youtube", videoId: id });
                            setFadeImageUrlInput("");
                          }
                        }}
                        style={{ flex:1, padding:"9px 11px", borderRadius:8,
                          background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.09)",
                          color:"#fff", fontSize:12, outline:"none" }} />
                      <button
                        onClick={() => {
                          if (!fadeImageUrlInput) return;
                          const m = fadeImageUrlInput.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/v\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
                          const id = m ? m[1] : fadeImageUrlInput.trim();
                          saveFadeScreenBg({ type:"video-youtube", videoId: id });
                          setFadeImageUrlInput("");
                        }}
                        style={{ padding:"9px 14px", borderRadius:8,
                          background:"rgba(99,102,241,0.2)", border:"1px solid rgba(99,102,241,0.35)",
                          color:"#818cf8", fontSize:11, fontWeight:700, cursor:"pointer" }}>Apply</button>
                    </div>
                    {/* 4 — Source status bar */}
                    {sourceLabel && (
                      <div style={{ display:"flex", flexDirection:"column", gap:10,
                        padding:"12px", borderRadius:8, background:statusBg, border:`1px solid ${statusBorder}` }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                          <span style={{ fontSize:11, fontWeight:700, color:statusColor, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"75%" }}>{sourceLabel}</span>
                          <button
                            onClick={() => saveFadeScreenBg({ type:"color", color:"#000000" })}
                            style={{ padding:"4px 10px", borderRadius:6, background:"rgba(255,255,255,0.07)",
                              border:"1px solid rgba(255,255,255,0.15)", color:"rgba(255,255,255,0.5)",
                              fontSize:10, fontWeight:700, cursor:"pointer" }}>Remove</button>
                        </div>
                        
                        {/* Audio control for video files only */}
                        {(fbg.type === "video-local" || fbg.type === "video-firebase" || fbg.type === "video-youtube") && (
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", paddingTop:"6px", borderTop:"1px solid rgba(255,255,255,0.05)" }}>
                            <span style={{ fontSize:11, color:"rgba(255,255,255,0.45)" }}>Sound Option</span>
                            <button
                              onClick={() => {
                                const isCurrentlyMuted = fbg.muted !== false;
                                const updatedBg = { ...fbg, muted: isCurrentlyMuted ? false : true };
                                setModalFadeScreenBg(updatedBg);
                              }}
                              style={{
                                display: "flex", alignItems: "center", gap: 5,
                                padding:"4px 10px", borderRadius:6,
                                background: fbg.muted === false ? "rgba(239,68,68,0.12)" : "rgba(52,211,153,0.12)",
                                border: fbg.muted === false ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(52,211,153,0.3)",
                                color: fbg.muted === false ? "#f87171" : "#34d399",
                                fontSize:10, fontWeight:700, cursor:"pointer"
                              }}
                            >
                              {fbg.muted === false ? <Volume2 size={12} /> : <VolumeX size={12} />}
                              <span>{fbg.muted === false ? "Sound ON (OBS)" : "Muted (OBS)"}</span>
                            </button>
                          </div>
                        )}
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

              {/* Animation Style Picker */}
              <div>
                <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.35)", textTransform:"uppercase", letterSpacing:"0.12em", display:"block", marginBottom:10 }}>Text Animation Style</span>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:4 }}>
                  {(["word-fade","word-bounce","blur-in","fade","none","typewriter","breathe","echo"] as const).map(a => {
                    const active = draft.animStyle === a;
                    const isEcho = a === "echo";
                    return (
                      <button key={a} onClick={() => updateDraft(tab, "animStyle", a)}
                        style={{ padding:"9px 4px", borderRadius:9, fontSize:11, fontWeight:700, cursor:"pointer", transition:"all 0.18s",
                          border: active ? (isEcho ? "1px solid rgba(52,211,153,0.7)" : "1px solid rgba(167,139,250,0.6)") : "1px solid rgba(255,255,255,0.08)",
                          background: active ? (isEcho ? "rgba(52,211,153,0.18)" : "rgba(167,139,250,0.16)") : "rgba(255,255,255,0.04)",
                          color: active ? (isEcho ? "#6ee7b7" : "#c4b5fd") : "rgba(255,255,255,0.4)" }}>
                        {isEcho ? "✦ Echo" : ANIM_LABELS[a]}
                      </button>
                    );
                  })}
                </div>
                {draft.animStyle === "echo" && (
                  <p style={{ fontSize:11, color:"rgba(52,211,153,0.7)", margin:"8px 0 0", textAlign:"center" }}>
                    ✦ Echo active — control the scrolling marquee in Echo Advanced below
                  </p>
                )}
              </div>

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

              {/* ── Text Format — Big & Small Font ───────────────────────────────── */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", background:"rgba(139,92,246,0.06)", borderRadius:12, border:"1px solid rgba(139,92,246,0.18)" }}>
                <div>
                  <p style={{ margin:0, fontSize:12, fontWeight:700, color:"rgba(255,255,255,0.85)" }}>
                    <span style={{ marginRight:6, fontSize:15 }}>Aa</span>Big &amp; Small Font
                  </p>
                  <p style={{ margin:0, fontSize:10, color:"rgba(255,255,255,0.4)" }}>Alternate large &amp; small words — works with any animation</p>
                </div>
                <button onClick={() => updateDraft(tab, "bigSmallFont", !(draft.bigSmallFont ?? false))}
                  style={{ position:"relative", width:44, height:24, borderRadius:12, border:"none", cursor:"pointer", transition:"all 0.2s", flexShrink:0,
                    background: (draft.bigSmallFont ?? false) ? "#a78bfa" : "rgba(255,255,255,0.1)" }}>
                  <span style={{ position:"absolute", top:3, left: (draft.bigSmallFont ?? false) ? 23 : 3, width:18, height:18, borderRadius:"50%", background:"#fff", transition:"left 0.2s", display:"block" }} />
                </button>
              </div>

              <div style={{ height:1, background:"rgba(255,255,255,0.06)" }} />

              {/* ── Echo Advanced Settings — shows when Echo style is selected ── */}
              {tab === "praise" && draft.animStyle === "echo" && (<>
                <div style={{ background:"rgba(52,211,153,0.05)", border:"1px solid rgba(52,211,153,0.15)", borderRadius:14, padding:"14px 14px 10px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:14 }}>
                    <span style={{ fontSize:16, color:"#6ee7b7" }}>✦</span>
                    <span style={{ fontSize:10, fontWeight:800, color:"#6ee7b7", textTransform:"uppercase", letterSpacing:"0.12em" }}>Echo Advanced</span>
                  </div>

                  {/* Scrolling Marquee toggle */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, padding:"10px 12px", background:"rgba(0,0,0,0.3)", borderRadius:10, border:"1px solid rgba(255,255,255,0.07)" }}>
                    <div>
                      <p style={{ margin:0, fontSize:12, fontWeight:700, color:"rgba(255,255,255,0.75)" }}>Scrolling Marquee</p>
                      <p style={{ margin:0, fontSize:10, color:"rgba(255,255,255,0.3)" }}>Moving background text behind lyrics</p>
                    </div>
                    <button onClick={() => updateDraft(tab, "echoMarquee", !(draft.echoMarquee ?? true))}
                      style={{ position:"relative", width:44, height:24, borderRadius:12, border:"none", cursor:"pointer", transition:"all 0.2s", flexShrink:0,
                        background: (draft.echoMarquee ?? true) ? "#10b981" : "rgba(255,255,255,0.1)" }}>
                      <span style={{ position:"absolute", top:3, left: (draft.echoMarquee ?? true) ? 23 : 3, width:18, height:18, borderRadius:"50%", background:"#fff", transition:"left 0.2s", display:"block" }} />
                    </button>
                  </div>

                  {/* Word Size Ratios */}
                  <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.35)", textTransform:"uppercase", letterSpacing:"0.12em", display:"block", marginBottom:8 }}>Word Size Ratios</span>
                  {([
                    ["✦ Sacred",   "echoSacredScale",  0.50, 3.0, 0.05, "rgba(255,220,80,0.2)",  "#facc15"],
                    ["⬛ Content",  "echoContentScale", 0.50, 2.5, 0.05, "rgba(255,255,255,0.06)","rgba(255,255,255,0.65)"],
                    ["· Function", "echoFuncScale",    0.20, 1.2, 0.05, "rgba(255,255,255,0.03)","rgba(255,255,255,0.35)"],
                  ] as [string, keyof LivePreset, number, number, number, string, string][]).map(([label, key, mn, mx, step, bg, col]) => {
                    const val = (draft[key] as number) ?? 1.0;
                    const def = DEFAULT_PRESETS.praise[key] as number;
                    return (
                      <div key={key as string} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:7 }}>
                        <span style={{ fontSize:10, color:col, fontWeight:700, width:70, flexShrink:0 }}>{label}</span>
                        <button onClick={() => updateDraft(tab, key, Math.max(mn, Math.round((val - step)*100)/100))}
                          style={{ width:30, height:30, borderRadius:8, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", color:"#fff", fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>−</button>
                        <div style={{ flex:1, textAlign:"center", fontSize:15, fontWeight:800, color:"#fff", background:bg, borderRadius:8, padding:"5px 0", border:"1px solid rgba(255,255,255,0.07)" }}>
                          {val.toFixed(2)}×
                        </div>
                        <button onClick={() => updateDraft(tab, key, Math.min(mx, Math.round((val + step)*100)/100))}
                          style={{ width:30, height:30, borderRadius:8, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", color:"#fff", fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>+</button>
                        <button onClick={() => updateDraft(tab, key, def)}
                          style={{ padding:"5px 8px", borderRadius:7, background:"transparent", border:"1px solid rgba(255,255,255,0.08)", color:"rgba(255,255,255,0.25)", fontSize:10, fontWeight:700, cursor:"pointer" }}>↺</button>
                      </div>
                    );
                  })}

                  {/* Animation Speed */}
                  <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.35)", textTransform:"uppercase", letterSpacing:"0.12em", display:"block", marginTop:10, marginBottom:8 }}>Anim Speed (ms)</span>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                    <button onClick={() => updateDraft(tab, "echoAnimDuration", Math.max(100, (draft.echoAnimDuration ?? 400) - 50))}
                      style={{ width:44, height:44, borderRadius:10, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", color:"#fff", fontSize:22, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>−</button>
                    <div style={{ flex:1, textAlign:"center", fontSize:20, fontWeight:800, color:"#fff", background:"rgba(255,255,255,0.05)", borderRadius:10, padding:"9px 0", border:"1px solid rgba(255,255,255,0.09)" }}>
                      {draft.echoAnimDuration ?? 400}<span style={{ fontSize:11, fontWeight:400, color:"rgba(255,255,255,0.4)" }}>ms</span>
                    </div>
                    <button onClick={() => updateDraft(tab, "echoAnimDuration", Math.min(2000, (draft.echoAnimDuration ?? 400) + 50))}
                      style={{ width:44, height:44, borderRadius:10, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", color:"#fff", fontSize:22, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>+</button>
                    <button onClick={() => updateDraft(tab, "echoAnimDuration", 400)}
                      style={{ padding:"10px 12px", borderRadius:10, background:"transparent", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.35)", fontSize:11, fontWeight:700, cursor:"pointer", textTransform:"uppercase" }}>Reset</button>
                  </div>

                  {/* Bounce Intensity */}
                  <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.35)", textTransform:"uppercase", letterSpacing:"0.12em", display:"block", marginBottom:8 }}>Bounce Intensity</span>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <button onClick={() => updateDraft(tab, "echoBounce", Math.max(0, Math.round(((draft.echoBounce ?? 2.8) - 0.2)*10)/10))}
                      style={{ width:44, height:44, borderRadius:10, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", color:"#fff", fontSize:22, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>−</button>
                    <div style={{ flex:1, textAlign:"center", fontSize:22, fontWeight:800, color:"#fff", background:"rgba(255,255,255,0.05)", borderRadius:10, padding:"10px 0", border:"1px solid rgba(255,255,255,0.09)" }}>
                      {(draft.echoBounce ?? 2.8).toFixed(1)}
                    </div>
                    <button onClick={() => updateDraft(tab, "echoBounce", Math.min(6, Math.round(((draft.echoBounce ?? 2.8) + 0.2)*10)/10))}
                      style={{ width:44, height:44, borderRadius:10, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", color:"#fff", fontSize:22, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>+</button>
                    <button onClick={() => updateDraft(tab, "echoBounce", 2.8)}
                      style={{ padding:"10px 12px", borderRadius:10, background:"transparent", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.35)", fontSize:11, fontWeight:700, cursor:"pointer", textTransform:"uppercase" }}>Reset</button>
                  </div>
                </div>
                <div style={{ height:1, background:"rgba(255,255,255,0.06)" }} />
              </>)}

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
                  <p style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.3)", textTransform:"uppercase", letterSpacing:"0.1em", margin:"0 0 10px" }}>Video / Image Background</p>
                  {/* ── Choose from Media Library ── */}
                  <button
                    onClick={() => setMediaPicker(tab === "praise" ? "praise-bg" : "worship-bg")}
                    style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"10px 12px", borderRadius:9,
                      background:"rgba(167,139,250,0.1)", border:"1px solid rgba(167,139,250,0.35)",
                      color:"#c4b5fd", fontSize:12, fontWeight:700, cursor:"pointer", marginBottom:8 }}>
                    <FolderOpen size={13} /> Choose from Media Library
                  </button>
                  {/* ── Upload to Firebase + local (requires internet) ── */}
                  <label style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderRadius:9, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", cursor:"pointer", fontSize:12, color:"rgba(255,255,255,0.6)", marginBottom:6 }}>
                    <Upload size={13} />
                    {videoUploading[tab] ? `Uploading ${videoProgress[tab]}%…` : (draft.bgVideo?.type === "firebase" ? "Change video (Cloud + Local)…" : "Upload to Cloud + Local…")}
                    <input type="file" accept="video/webm,video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/ogg,video/*" style={{ display:"none" }}
                      onChange={async e => {
                        const file = e.target.files?.[0]; if (!file) return;
                        try {
                          setVideoUploading(prev => ({ ...prev, [tab]: true }));
                          setVideoProgress(prev => ({ ...prev, [tab]: 0 }));
                          const ext = file.name.split(".").pop() || "mp4";

                          // ── Step 1: Upload to local server for offline playback ────
                          let localUrl: string | undefined;
                          try {
                            const fd = new FormData();
                            fd.append("video", file);
                            const localRes = await fetch(`/api/live-bg-video/${tab}`, { method: "POST", body: fd });
                            if (localRes.ok) {
                              const localJson = await localRes.json();
                              localUrl = localJson.url as string; // e.g. /api/live-bg-video/praise
                            }
                          } catch { /* local upload failed — ok, firebase only */ }

                          // ── Step 2: Upload to Firebase Storage for cloud/prod ──────
                          const sRef = storageRef(storage, `live-bg-videos/${tab}.${ext}`);
                          const task = uploadBytesResumable(sRef, file);
                          await new Promise<void>((resolve, reject) => {
                            task.on(
                              "state_changed",
                              snap => setVideoProgress(prev => ({ ...prev, [tab]: Math.round((snap.bytesTransferred / snap.totalBytes) * 100) })),
                              reject,
                              resolve
                            );
                          });
                          const url = await getDownloadURL(task.snapshot.ref);
                          // Store both: firebase URL for cloud, localUrl for offline fallback
                          updateDraft(tab, "bgVideo", { type: "firebase", url, ...(localUrl ? { localUrl } : {}) });
                        } catch {
                          onToast("Video upload failed — please try again.", "error");
                        } finally {
                          setVideoUploading(prev => ({ ...prev, [tab]: false }));
                          e.target.value = "";
                        }
                      }} />
                  </label>

                  {/* ── Local Only upload (NO internet required) ── */}
                  <label
                    title="Upload video only to this computer — works 100% offline. No Firebase needed."
                    style={{
                      display:"flex", alignItems:"center", gap:8, padding:"10px 12px",
                      borderRadius:9, cursor: localOnlyUploading[tab] ? "not-allowed" : "pointer",
                      fontSize:12, fontWeight:700, marginBottom:8,
                      background: draft.bgVideo?.type === "local"
                        ? "rgba(96,165,250,0.12)" : "rgba(52,211,153,0.07)",
                      border: draft.bgVideo?.type === "local"
                        ? "1px solid rgba(96,165,250,0.4)" : "1px solid rgba(52,211,153,0.3)",
                      color: draft.bgVideo?.type === "local" ? "#93c5fd" : "#6ee7b7",
                      opacity: videoUploading[tab] ? 0.45 : 1,
                      pointerEvents: videoUploading[tab] ? "none" : "auto",
                    }}
                  >
                    {/* Offline badge */}
                    <span style={{
                      fontSize:9, fontWeight:800, letterSpacing:"0.08em",
                      background:"rgba(52,211,153,0.18)", border:"1px solid rgba(52,211,153,0.4)",
                      borderRadius:4, padding:"2px 5px", color:"#34d399", flexShrink:0,
                    }}>OFFLINE</span>
                    {localOnlyUploading[tab]
                      ? <><span style={{ flex:1 }}>Saving to disk… {localOnlyProgress[tab]}%</span>
                          <span style={{ fontSize:10, color:"rgba(255,255,255,0.35)" }}>No cloud</span></>
                      : draft.bgVideo?.type === "local"
                        ? <><span style={{ flex:1 }}>Change Local-Only Video…</span>
                            <span style={{ fontSize:9, color:"rgba(52,211,153,0.7)", fontWeight:600 }}>✓ Active</span></>
                        : <span style={{ flex:1 }}>Use Local Video (No Internet)…</span>
                    }
                    <input
                      type="file"
                      accept="video/webm,video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/ogg,video/*"
                      style={{ display:"none" }}
                      disabled={videoUploading[tab] || localOnlyUploading[tab]}
                      onChange={async e => {
                        const file = e.target.files?.[0]; if (!file) return;
                        try {
                          setLocalOnlyUploading(prev => ({ ...prev, [tab]: true }));
                          setLocalOnlyProgress(prev => ({ ...prev, [tab]: 0 }));

                          // XHR so we can track upload progress to local server
                          const localUrl = await new Promise<string>((resolve, reject) => {
                            const xhr = new XMLHttpRequest();
                            xhr.open("POST", `/api/live-bg-video/${tab}`);
                            xhr.upload.onprogress = ev => {
                              if (ev.lengthComputable)
                                setLocalOnlyProgress(prev => ({ ...prev, [tab]: Math.round(ev.loaded / ev.total * 100) }));
                            };
                            xhr.onload = () => {
                              if (xhr.status >= 200 && xhr.status < 300) {
                                try { resolve(JSON.parse(xhr.responseText).url as string); }
                                catch { reject(new Error("Bad response")); }
                              } else {
                                reject(new Error(`HTTP ${xhr.status}`));
                              }
                            };
                            xhr.onerror = () => reject(new Error("Network error"));
                            const fd = new FormData();
                            fd.append("video", file);
                            xhr.send(fd);
                          });

                          // type:"local" — no Firebase URL at all, served from local disk only
                          const newBgVideo: BgVideo = { type: "local", url: localUrl };
                          updateDraft(tab, "bgVideo", newBgVideo);

                          // ── Immediately apply to live preset + push to OBS ─────────
                          // Don't wait for the user to click Save — the file is already
                          // on disk and ready to serve. Apply it now so OBS reflects it.
                          setPresets(prev => {
                            const updated = { ...prev, [tab]: { ...prev[tab], bgVideo: newBgVideo } };
                            try { localStorage.setItem("lsv_presets", JSON.stringify(updated)); } catch {}
                            return updated;
                          });
                          if (tab === activePreset) {
                            setBgVideo(newBgVideo);
                            // setBgVideo triggers the pushToFirestore useEffect, but we also
                            // send an explicit _bgOnly push so the video appears immediately
                            // even if no slide is currently active.
                            fetch("/api/live-push", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ _bgOnly: true, bgVideo: newBgVideo, bgIdx: bgIdxRef.current, updatedAt: Date.now() }),
                            }).catch(() => {});
                          }

                          // ── Queue for auto-sync when internet returns ──────────────
                          // Store the raw File (blob) and metadata separately in IDB.
                          await idbSet(`lsv_pending_sync_blob_${tab}`, file);
                          await idbSet(`lsv_pending_sync_meta_${tab}`, { name: file.name, mimeType: file.type, sizeBytes: file.size, localUrl });
                          onToast(`✅ "${file.name}" saved locally for ${tab} — will auto-sync to cloud when online!`, "success");
                        } catch (err) {
                          console.error("[LocalOnly] Upload failed:", err);
                          onToast("Local upload failed — is the dev server running?", "error");
                        } finally {
                          setLocalOnlyUploading(prev => ({ ...prev, [tab]: false }));
                          setLocalOnlyProgress(prev => ({ ...prev, [tab]: 0 }));
                          e.target.value = "";
                        }
                      }}
                    />
                  </label>
                  <div style={{ display:"flex", gap:6 }}>
                    <input value={ytInputs[tab]} onChange={e => setYtInputs(prev => ({ ...prev, [tab]: e.target.value }))} placeholder="YouTube URL…"
                      onKeyDown={e => { if (e.key==="Enter") { const id=extractYtId(ytInputs[tab]); if(id){updateDraft(tab,"bgVideo",{type:"youtube",videoId:id});setYtInputs(prev=>({...prev,[tab]:""}));} } }}
                      style={{ flex:1, padding:"8px 11px", borderRadius:8, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.09)", color:"#fff", fontSize:12, outline:"none" }} />
                    <button onClick={() => { const id=extractYtId(ytInputs[tab]); if(id){updateDraft(tab,"bgVideo",{type:"youtube",videoId:id});setYtInputs(prev=>({...prev,[tab]:""}));} }}
                      style={{ padding:"8px 14px", borderRadius:8, background:"rgba(99,102,241,0.2)", border:"1px solid rgba(99,102,241,0.35)", color:"#818cf8", fontSize:11, fontWeight:700, cursor:"pointer" }}>Apply</button>
                  </div>
                  {draft.bgVideo && (() => {
                    const bv = draft.bgVideo!;
                    const isLibrary = bv.type === "firebase" || bv.type === "image-firebase";
                    const isLocal   = bv.type === "local";
                    const isYt      = bv.type === "youtube";
                    const isImg     = bv.type === "image-firebase";
                    const bvUrl = (bv as {url?:string}).url ?? "";
                    const bgFileName = (() => {
                      try {
                        const raw = decodeURIComponent(bvUrl.split("/o/")[1]?.split("?")[0] ?? "");
                        const name = raw.split("/").pop() ?? "";
                        return name.length > 32 ? name.slice(0, 29) + "…" : name;
                      } catch { return ""; }
                    })();
                    const sourceLabel = isLibrary
                      ? `🗂 Media Library — ${isImg ? "image" : "video"}${bgFileName ? `: ${bgFileName}` : ""}`
                      : isLocal
                      ? `💻 Local Computer — video${bgFileName ? `: ${bgFileName}` : ""}`
                      : `▶ YouTube — ${(bv as {type:"youtube";videoId:string}).videoId}`;
                    const bgColor = isLibrary
                      ? "rgba(167,139,250,0.10)"
                      : isLocal
                      ? "rgba(96,165,250,0.10)"
                      : "rgba(248,113,113,0.10)";
                    const borderColor = isLibrary
                      ? "rgba(167,139,250,0.3)"
                      : isLocal
                      ? "rgba(96,165,250,0.3)"
                      : "rgba(248,113,113,0.3)";
                    const textColor = isLibrary ? "#c4b5fd" : isLocal ? "#93c5fd" : "#fca5a5";
                    return (
                      <div style={{ marginTop:10, display:"flex", alignItems:"center", justifyContent:"space-between",
                        padding:"8px 11px", borderRadius:8, background:bgColor, border:`1px solid ${borderColor}` }}>
                        <span style={{ fontSize:11, fontWeight:700, color:textColor }}>{sourceLabel}</span>
                        <button onClick={() => updateDraft(tab, "bgVideo", null)}
                          style={{ padding:"4px 10px", borderRadius:6, background:"rgba(255,255,255,0.07)",
                            border:"1px solid rgba(255,255,255,0.15)", color:"rgba(255,255,255,0.5)",
                            fontSize:10, fontWeight:700, cursor:"pointer" }}>Remove</button>
                      </div>
                    );
                  })()}
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
                  closeSettings();
                }}
                style={{ padding:"10px 22px", borderRadius:10, fontSize:12, fontWeight:700, cursor:"pointer", transition:"all 0.2s",
                  background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.12)", color:"rgba(255,255,255,0.45)" }}>
                Cancel
              </button>
              <button onClick={() => { saveSettings(); }}
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


      {/* ── Lyrics Grid Facility — always mounted, always visible ───────────────
           Settings and MediaLibrary use position:fixed, so they render on
           top without needing to unmount this component. */}
        <LyricsGridModal
          songs={allSongs.map(s => lyricOverrides[s.id] ? { ...s, lyrics: lyricOverrides[s.id] } : s)}
          onClose={() => {/* Grid View is always active — no default view to return to */}}
          initialSongTitle={selectedSong?.title}
          onToast={onToast}
          onSongLyricsUpdate={(songId, newLyrics) => {
            // 1. Store override — lyricOverrides effect re-parses sections for default view
            setLyricOverrides(prev => ({ ...prev, [songId]: newLyrics }));
            // 2. Patch allSongs in App.tsx so grid shows correct lyrics when reopened
            const songToUpdate = allSongs.find(s => s.id === songId);
            if (songToUpdate) {
              onSongUpdated?.({ ...songToUpdate, lyrics: newLyrics });
            }
            // Re-push active slide to OBS if the edited song is currently displayed
            const curSlide = activeSlideRef.current;
            const currentSong = selectedSongRef.current as Song | null;
            if (curSlide && currentSong?.id === songId) {
              const newSections = parseSections(newLyrics);
              const newAllSlides = newSections.flatMap(sec => sec.slides);
              const oldAllSlides = sectionsRef.current.flatMap(sec => sec.slides);
              const oldIdx = oldAllSlides.findIndex(s => s.id === curSlide.id);
              const updatedSlide = oldIdx >= 0 && oldIdx < newAllSlides.length
                ? { ...newAllSlides[oldIdx], animStyle: curSlide.animStyle }
                : curSlide;
              fetch("/api/live-push", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  songTitle: currentSong?.title ?? "",
                  lines: updatedSlide.lines,
                  animStyle: updatedSlide.animStyle,
                  visible: true,
                  bgIdx: bgIdxRef.current,
                  echoAlign, echoLines, echoLineHeight, lyricsScale, loopEnabled,
                  bgVideo: bgVideoRef.current,
                  loopInterval,
                }),
              }).catch(() => {});
            }
          }}
          fadeScreenActive={fadeScreenActive}
          fadeScreenBg={fadeScreenBg}
          onToggleFade={toggleFadeScreen}
          activePreset={activePreset}
          presetActivated={presetActivated}
          onApplyPreset={applyPreset}
          sceneSongs={sceneSongs}
          sceneSongIds={sceneSongIds}
          onAddToScene={addToScene}
          onRemoveFromScene={removeFromScene}
          onReorderScene={reorderScene}
          liveSettings={{ bgIdx, echoAlign, echoLines, echoLineHeight, lyricsScale, loopEnabled, bgVideo, loopInterval, animStyle: defaultAnimStyle, echoMarquee, bigSmallFont, echoSacredScale, echoContentScale, echoFuncScale, echoAnimDuration, echoBounce }}
          onOpenSettings={() => { openSettings(); }}
          onOpenMediaLibrary={() => setMediaLibraryOpen(true)}
          onCopyObsUrl={() => {
            const url = `${window.location.origin}/live-display`;
            navigator.clipboard.writeText(url).catch(() => {});
          }}
          onCopyObsLocalUrl={() => {
            const url = `${window.location.origin}/live-display-local`;
            navigator.clipboard.writeText(url).catch(() => {});
          }}
          onOpenCampReadiness={() => setShowCampReady(true)}
          onResetLiveBg={() => {
            // 1. Clear preset bgVideos (praise + worship) from React state and localStorage
            setPresets(prev => {
              const cleared = {
                ...prev,
                praise:  { ...prev.praise,  bgVideo: null },
                worship: { ...prev.worship, bgVideo: null },
              };
              try { localStorage.setItem("lsv_presets", JSON.stringify(cleared)); } catch {}
              return cleared;
            });
            setBgVideo(null);
            // 2. Clear song-specific backgrounds — this was the main source of the
            // "keeps coming back" bug: clicking any song that had lsv_song_bgs assigned
            // would call applySongBackground → push the old video to OBS immediately.
            setSongBgMeta({});
            try { localStorage.setItem("lsv_song_bgs", JSON.stringify({})); } catch {}
            // 3. Clear server liveState, .meta.json, Firestore, and broadcast to SSE
            fetch("/api/reset-live-bg", { method: "POST" }).catch(() => {});
          }}
          isInline={true}
        />


      {/* ── Inline Media Picker (inside Display Settings) ── */}
      {mediaPicker && (
        <MediaLibraryModal
          onClose={() => setMediaPicker(null)}
          onToast={(msg, type) => onToast(type as 'success'|'error'|'info'|'warning', msg)}
          pickMode
          pickTarget={mediaPicker}
          onAssign={(item: MediaItem, target: MediaTarget, blobUrl: string | null) => {
            const url = blobUrl ?? item.firebaseUrl;
            const fUrl = item.firebaseUrl;
            // Evict this URL from every OTHER target so only one scene is ever ACTIVE
            const clearOtherAssignments = (assignedTo: MediaTarget) => {
              if (assignedTo !== 'praise-bg' && assignedTo !== 'worship-bg') {
                // Assigned to fade-screen → clear from both bgVideo presets
                setPresets(prev => {
                  const p = { ...prev };
                  let dirty = false;
                  for (const k of ['praise', 'worship'] as const) {
                    if ((p[k]?.bgVideo as { url?: string })?.url === fUrl) {
                      p[k] = { ...p[k], bgVideo: undefined as unknown as BgVideo };
                      dirty = true;
                    }
                  }
                  if (dirty) try { localStorage.setItem('lsv_presets', JSON.stringify(p)); } catch {}
                  return dirty ? p : prev;
                });
              }
              if (assignedTo !== 'fade-screen') {
                // Assigned to praise/worship → clear from fade screen
                if ((fadeScreenBg as { url?: string })?.url === fUrl) {
                  const cleared: FadeScreenBg = { type: 'color' as const, color: '#000000' };
                  setFadeScreenBg(cleared);
                  setModalFadeScreenBg(cleared);
                  fadeScreenBgRef.current = cleared;
                  idbSet('lsv_fade_screen', cleared).catch(() => {});
                  try { localStorage.setItem('lsv_fade_screen', JSON.stringify(cleared)); } catch {}
                }
              }
              if (assignedTo !== 'praise-bg' && assignedTo !== 'worship-bg') return; // done above
              // Also clear from the OTHER bgVideo preset (e.g. assigning to worship → clear praise)
              const other = assignedTo === 'praise-bg' ? 'worship' : 'praise';
              setPresets(prev => {
                if ((prev[other]?.bgVideo as { url?: string })?.url !== fUrl) return prev;
                const p = { ...prev, [other]: { ...prev[other], bgVideo: undefined as unknown as BgVideo } };
                try { localStorage.setItem('lsv_presets', JSON.stringify(p)); } catch {}
                return p;
              });
            };
            if (target === 'praise-bg' || target === 'worship-bg') {
              const preset: PresetName = target === 'praise-bg' ? 'praise' : 'worship';
              // Strip blob: URLs — blob: URLs are session-scoped to this browser tab.
              // OBS Browser Source runs in a SEPARATE context and cannot load blob: URLs.
              // We push without localUrl first, then update after disk-cache confirms a real HTTP path.
              const safeBlobUrl = (blobUrl && !blobUrl.startsWith('blob:')) ? blobUrl : undefined;
              const bgVal: BgVideo = item.type === 'video'
                ? { type: 'firebase' as const, url: item.firebaseUrl, localUrl: safeBlobUrl }
                : { type: 'image-firebase' as const, url: item.firebaseUrl, localUrl: safeBlobUrl };
              setModalDrafts(prev => ({ ...prev, [preset]: { ...prev[preset], bgVideo: bgVal } }));
              setPresets(prev => {
                const updated = { ...prev, [preset]: { ...prev[preset], bgVideo: bgVal } };
                try { localStorage.setItem('lsv_presets', JSON.stringify(updated)); } catch {}
                return updated;
              });
              clearOtherAssignments(target);
              if (activePreset === preset) setBgVideo(bgVal);
              if (activePreset === preset && !fadeScreenActiveRef.current) {
                fetch('/api/live-push', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    _bgOnly: true,
                    bgVideo: bgVal,
                    bgIdx: bgIdxRef.current,
                    echoAlign, echoLines, echoLineHeight, lyricsScale, loopEnabled, loopInterval,
                    animStyle: defaultAnimStyle, updatedAt: Date.now(),
                  }),
                }).catch(() => {});
              }
              // ── Cache to disk then follow-up push with real localUrl so OBS works offline ──
              // blobUrl is readable here (same browser session / IDB). POST it to the local
              // server to get a real HTTP path (/api/live-bg-video/praise), then re-push so
              // OBS can load the video over localhost even when internet is disconnected.
              if (item.type === 'video' || item.type === 'image') {
                (async () => {
                  try {
                    const serverLocalUrl = `/api/live-bg-video/${preset}`;
                    // Tier 1: use blobUrl from this session (covers local uploads)
                    // Tier 2: IDB blob cached by MediaLibraryModal on item selection
                    // Tier 3: Firebase Storage URL (online fallback only)
                    let srcBlob: Blob | null = null;
                    if (blobUrl) {
                      const r = await fetch(blobUrl).catch(() => null);
                      if (r?.ok) srcBlob = await r.blob();
                    }
                    if (!srcBlob) {
                      const cached = await idbGet<Blob>(`media_blob_${item.id}`);
                      if (cached instanceof Blob) srcBlob = cached;
                    }
                    if (!srcBlob) {
                      const r = await fetch(item.firebaseUrl);
                      srcBlob = await r.blob();
                    }
                    const fd = new FormData();
                    fd.append('video', srcBlob, item.name);
                    fd.append('firebaseUrl', item.firebaseUrl);
                    const uploadRes = await fetch(serverLocalUrl, { method: 'POST', body: fd });
                    if (uploadRes.ok) {
                      // Real HTTP localUrl — OBS can load this offline (no Firebase needed)
                      const bgValWithLocal: BgVideo = item.type === 'video'
                        ? { type: 'firebase' as const, url: item.firebaseUrl, localUrl: serverLocalUrl }
                        : { type: 'image-firebase' as const, url: item.firebaseUrl, localUrl: serverLocalUrl };
                      setPresets(prev => {
                        const updated = { ...prev, [preset]: { ...prev[preset], bgVideo: bgValWithLocal } };
                        try { localStorage.setItem('lsv_presets', JSON.stringify(updated)); } catch {}
                        return updated;
                      });
                      if (activePreset === preset) setBgVideo(bgValWithLocal);
                      // Follow-up push: OBS receives the corrected localUrl and loads it offline
                      fetch('/api/live-push', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          _bgOnly: true,
                          bgVideo: bgValWithLocal,
                          bgIdx: bgIdxRef.current,
                          echoAlign, echoLines, echoLineHeight, lyricsScale, loopEnabled, loopInterval,
                          animStyle: defaultAnimStyle, updatedAt: Date.now(),
                        }),
                      }).catch(() => {});
                      console.log(`[LiveStage] ${preset} media cached — OBS updated with local URL`);
                    }
                  } catch (e) { console.warn(`[LiveStage] Could not cache ${preset} media locally:`, e); }
                })();
              }
              onToast('success', `✅ Applied to ${preset} background — hit Save to lock in`);
            } else if (target === 'fade-screen') {
              // Strip blob: localUrl before persisting — blob: URLs are session-scoped and invalid after refresh.
              // OBS will fall back to the Firebase URL until the local disk copy is ready.
              const fadeBg: FadeScreenBg = item.type === 'image'
                ? { type: 'image-firebase' as const, url: item.firebaseUrl }
                : { type: 'video-firebase' as const, url: item.firebaseUrl };
              setFadeScreenBg(fadeBg);
              setModalFadeScreenBg(fadeBg);
              fadeScreenBgRef.current = fadeBg;
              idbSet('lsv_fade_screen', fadeBg).catch(() => {});
              try { localStorage.setItem('lsv_fade_screen', JSON.stringify(fadeBg)); } catch {}
              clearOtherAssignments(target);
              // Initial push so OBS knows the new fade screen was assigned.
              if (fadeScreenActiveRef.current) {
                fetch('/api/live-push', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ _bgOnly: true, fadeScreen: true, fadeScreenBg: fadeBg, updatedAt: Date.now() }),
                }).catch(() => {});
              }
              // ── Upload to local server disk so OBS can load the image offline ──
              // After upload completes, send a FOLLOW-UP push with localUrl='/api/live-fade-image'
              // so OBS immediately switches to the locally-served copy (no Firebase needed).
              if (item.type === 'image') {
                (async () => {
                  try {
                    const sourceUrl = blobUrl ?? item.firebaseUrl;
                    const resp  = await fetch(sourceUrl);
                    const blob  = await resp.blob();
                    const fd    = new FormData();
                    fd.append('image', blob, item.name);
                    fd.append('firebaseUrl', item.firebaseUrl); // lets server verify URL match before injecting localUrl
                    const uploadRes = await fetch('/api/live-fade-image', { method: 'POST', body: fd });
                    if (uploadRes.ok) {
                      // Update state with the local server URL so OBS can load it offline
                      const localFadeBg: FadeScreenBg = { ...fadeBg, localUrl: '/api/live-fade-image' } as FadeScreenBg;
                      setFadeScreenBg(localFadeBg);
                      setModalFadeScreenBg(localFadeBg);
                      fadeScreenBgRef.current = localFadeBg;
                      idbSet('lsv_fade_screen', localFadeBg).catch(() => {});
                      try { localStorage.setItem('lsv_fade_screen', JSON.stringify(localFadeBg)); } catch {}
                      // Follow-up push: OBS now gets the local server URL
                      fetch('/api/live-push', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ _bgOnly: true, fadeScreen: fadeScreenActiveRef.current, fadeScreenBg: localFadeBg, updatedAt: Date.now() }),
                      }).catch(() => {});
                      console.log('[LiveStage] Fade image cached — OBS updated with local URL');
                    }
                  } catch (e) { console.warn('[LiveStage] Could not cache fade image locally:', e); }
                })();
              }
              onToast('success', `✅ "${item.name}" set as Fade Screen`);
            }
            void url; // suppress unused-variable warning
            setMediaPicker(null);
          }}
          activeAssignments={{
            'praise-bg':   (presets.praise?.bgVideo as { url?: string })?.url ?? undefined,
            'worship-bg':  (presets.worship?.bgVideo as { url?: string })?.url ?? undefined,
            'fade-screen': (fadeScreenBg as { url?: string })?.url ?? undefined,
          }}
        />
      )}

      {/* ── Media Library Modal (standalone, opened from toolbar) ── */}
      {mediaLibraryOpen && (
        <MediaLibraryModal
          onClose={() => setMediaLibraryOpen(false)}
          onToast={(msg, type) => onToast(type as 'success'|'error'|'info'|'warning', msg)}
          onAssign={(item: MediaItem, target: MediaTarget, blobUrl: string | null) => {
            const url = blobUrl ?? item.firebaseUrl;
            const fUrl = item.firebaseUrl;
            // Evict this URL from every OTHER target — one item, one scene
            const clearOtherAssignments = (assignedTo: MediaTarget) => {
              if (assignedTo !== 'praise-bg' && assignedTo !== 'worship-bg') {
                setPresets(prev => {
                  const p = { ...prev };
                  let dirty = false;
                  for (const k of ['praise', 'worship'] as const) {
                    if ((p[k]?.bgVideo as { url?: string })?.url === fUrl) {
                      p[k] = { ...p[k], bgVideo: undefined as unknown as BgVideo };
                      dirty = true;
                    }
                  }
                  if (dirty) try { localStorage.setItem('lsv_presets', JSON.stringify(p)); } catch {}
                  return dirty ? p : prev;
                });
              }
              if (assignedTo !== 'fade-screen') {
                if ((fadeScreenBg as { url?: string })?.url === fUrl) {
                  const cleared: FadeScreenBg = { type: 'color' as const, color: '#000000' };
                  setFadeScreenBg(cleared);
                  setModalFadeScreenBg(cleared);
                  fadeScreenBgRef.current = cleared;
                  idbSet('lsv_fade_screen', cleared).catch(() => {});
                  try { localStorage.setItem('lsv_fade_screen', JSON.stringify(cleared)); } catch {}
                }
              }
              if (assignedTo !== 'praise-bg' && assignedTo !== 'worship-bg') return;
              const other = assignedTo === 'praise-bg' ? 'worship' : 'praise';
              setPresets(prev => {
                if ((prev[other]?.bgVideo as { url?: string })?.url !== fUrl) return prev;
                const p = { ...prev, [other]: { ...prev[other], bgVideo: undefined as unknown as BgVideo } };
                try { localStorage.setItem('lsv_presets', JSON.stringify(p)); } catch {}
                return p;
              });
            };
            if (target === 'praise-bg' || target === 'worship-bg') {
              const preset: PresetName = target === 'praise-bg' ? 'praise' : 'worship';
              // Strip blob: URLs — blob: URLs are session-scoped to this browser tab.
              // OBS Browser Source runs in a SEPARATE context and cannot load blob: URLs.
              // We push without localUrl first, then update after disk-cache confirms a real HTTP path.
              const safeBlobUrl = (blobUrl && !blobUrl.startsWith('blob:')) ? blobUrl : undefined;
              const bgVal: BgVideo = item.type === 'video'
                ? { type: 'firebase' as const, url: item.firebaseUrl, localUrl: safeBlobUrl }
                : { type: 'image-firebase' as const, url: item.firebaseUrl, localUrl: safeBlobUrl };
              setModalDrafts(prev => ({ ...prev, [preset]: { ...prev[preset], bgVideo: bgVal } }));
              setPresets(prev => {
                const updated = { ...prev, [preset]: { ...prev[preset], bgVideo: bgVal } };
                try { localStorage.setItem('lsv_presets', JSON.stringify(updated)); } catch {}
                return updated;
              });
              clearOtherAssignments(target);
              if (activePreset === preset) setBgVideo(bgVal);
              if (activePreset === preset && !fadeScreenActiveRef.current) {
                fetch('/api/live-push', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    _bgOnly: true,
                    bgVideo: bgVal,
                    bgIdx: bgIdxRef.current,
                    echoAlign, echoLines, echoLineHeight, lyricsScale, loopEnabled, loopInterval,
                    animStyle: defaultAnimStyle, updatedAt: Date.now(),
                  }),
                }).catch(() => {});
              }
              // ── Cache to disk then follow-up push with real localUrl so OBS works offline ──
              if (item.type === 'video' || item.type === 'image') {
                (async () => {
                  try {
                    const serverLocalUrl = `/api/live-bg-video/${preset}`;
                    // Tier 1: use blobUrl from this session (covers local uploads)
                    // Tier 2: IDB blob cached by MediaLibraryModal on item selection
                    // Tier 3: Firebase Storage URL (online fallback only)
                    let srcBlob: Blob | null = null;
                    if (blobUrl) {
                      const r = await fetch(blobUrl).catch(() => null);
                      if (r?.ok) srcBlob = await r.blob();
                    }
                    if (!srcBlob) {
                      const cached = await idbGet<Blob>(`media_blob_${item.id}`);
                      if (cached instanceof Blob) srcBlob = cached;
                    }
                    if (!srcBlob) {
                      const r = await fetch(item.firebaseUrl);
                      srcBlob = await r.blob();
                    }
                    const fd = new FormData();
                    fd.append('video', srcBlob, item.name);
                    fd.append('firebaseUrl', item.firebaseUrl);
                    const uploadRes = await fetch(serverLocalUrl, { method: 'POST', body: fd });
                    if (uploadRes.ok) {
                      // Real HTTP localUrl — OBS can load this offline (no Firebase needed)
                      const bgValWithLocal: BgVideo = item.type === 'video'
                        ? { type: 'firebase' as const, url: item.firebaseUrl, localUrl: serverLocalUrl }
                        : { type: 'image-firebase' as const, url: item.firebaseUrl, localUrl: serverLocalUrl };
                      setPresets(prev => {
                        const updated = { ...prev, [preset]: { ...prev[preset], bgVideo: bgValWithLocal } };
                        try { localStorage.setItem('lsv_presets', JSON.stringify(updated)); } catch {}
                        return updated;
                      });
                      if (activePreset === preset) setBgVideo(bgValWithLocal);
                      // Follow-up push: OBS receives the corrected localUrl and loads it offline
                      fetch('/api/live-push', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          _bgOnly: true,
                          bgVideo: bgValWithLocal,
                          bgIdx: bgIdxRef.current,
                          echoAlign, echoLines, echoLineHeight, lyricsScale, loopEnabled, loopInterval,
                          animStyle: defaultAnimStyle, updatedAt: Date.now(),
                        }),
                      }).catch(() => {});
                      console.log(`[LiveStage] ${preset} media cached — OBS updated with local URL`);
                    }
                  } catch (e) { console.warn(`[LiveStage] Could not cache ${preset} media locally:`, e); }
                })();
              }
              onToast('success', `✅ "${item.name}" → ${preset === 'praise' ? 'Praise' : 'Worship'} Background`);
            } else if (target === 'fade-screen') {
              // Strip blob: localUrl before persisting — blob: URLs are session-scoped and invalid after refresh.
              // OBS will fall back to the Firebase URL until the local disk copy is ready.
              const fadeBg: FadeScreenBg = item.type === 'image'
                ? { type: 'image-firebase' as const, url: item.firebaseUrl }
                : { type: 'video-firebase' as const, url: item.firebaseUrl };
              setFadeScreenBg(fadeBg);
              setModalFadeScreenBg(fadeBg);
              fadeScreenBgRef.current = fadeBg;
              idbSet('lsv_fade_screen', fadeBg).catch(() => {});
              try { localStorage.setItem('lsv_fade_screen', JSON.stringify(fadeBg)); } catch {}
              clearOtherAssignments(target);
              // Initial push so OBS knows the new fade screen was assigned.
              fetch('/api/live-push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ _bgOnly: true, fadeScreen: fadeScreenActiveRef.current, fadeScreenBg: fadeBg, updatedAt: Date.now() }),
              }).catch(() => {});
              // ── Upload to local server disk so OBS can load the image offline ──
              // After upload completes, send a FOLLOW-UP push with localUrl='/api/live-fade-image'
              // so OBS immediately switches to the locally-served copy (no Firebase needed).
              if (item.type === 'image') {
                (async () => {
                  try {
                    const sourceUrl = blobUrl ?? item.firebaseUrl;
                    const resp  = await fetch(sourceUrl);
                    const blob  = await resp.blob();
                    const fd    = new FormData();
                    fd.append('image', blob, item.name);
                    fd.append('firebaseUrl', item.firebaseUrl); // lets server verify URL match before injecting localUrl
                    const uploadRes = await fetch('/api/live-fade-image', { method: 'POST', body: fd });
                    if (uploadRes.ok) {
                      // Update state with the local server URL so OBS can load it offline
                      const localFadeBg: FadeScreenBg = { ...fadeBg, localUrl: '/api/live-fade-image' } as FadeScreenBg;
                      setFadeScreenBg(localFadeBg);
                      setModalFadeScreenBg(localFadeBg);
                      fadeScreenBgRef.current = localFadeBg;
                      idbSet('lsv_fade_screen', localFadeBg).catch(() => {});
                      try { localStorage.setItem('lsv_fade_screen', JSON.stringify(localFadeBg)); } catch {}
                      // Follow-up push: OBS now gets the local server URL
                      fetch('/api/live-push', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ _bgOnly: true, fadeScreen: fadeScreenActiveRef.current, fadeScreenBg: localFadeBg, updatedAt: Date.now() }),
                      }).catch(() => {});
                      console.log('[LiveStage] Fade image cached — OBS updated with local URL');
                    }
                  } catch (e) { console.warn('[LiveStage] Could not cache fade image locally:', e); }
                })();
              }
              onToast('success', `✅ "${item.name}" set as Fade Screen`);
            }
            void url; // suppress unused-variable warning
          }}
          activeAssignments={{
            'praise-bg':   (presets.praise?.bgVideo as { url?: string })?.url ?? undefined,
            'worship-bg':  (presets.worship?.bgVideo as { url?: string })?.url ?? undefined,
            'fade-screen': (fadeScreenBg as { url?: string })?.url ?? undefined,
          }}
        />
      )}
    </div>
  );
}
