import { useState, useEffect, useRef } from "react";
import { Search, X, ChevronRight, Radio, Music2, Layers, Play, Wand2, AlignCenter, AlignLeft, Video, Upload } from "lucide-react";
import type { Song } from "./types";
import gsap from "gsap";

type AnimStyle = "word-fade" | "word-bounce" | "typewriter" | "blur-in" | "fade" | "slide-up" | "echo";
type BgVideo   = { type: "local"; url: string } | { type: "youtube"; videoId: string };

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

const ANIM_OPTIONS: AnimStyle[] = ["word-fade","word-bounce","typewriter","blur-in","fade","slide-up","echo"];
const ANIM_LABELS: Record<AnimStyle, string> = { "word-fade":"Word Fade","word-bounce":"Bounce","typewriter":"Type","blur-in":"Blur","fade":"Fade","slide-up":"Slide Up","echo":"Echo" };

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
  let gIdx = 0;
  return rawSecs.map(sec => {
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

// ─ Echo: two font sizes, same font, random-ish assignment ─────────────────────
const FUNC_WORDS = new Set(['a','an','the','to','of','in','at','by','for','on','and','or','but','is','are','was','were','i','we','he','she','it','my','our','your','his','her','its']);
function echoWordSm(word: string, gIdx: number): number {
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
  else if (style==="word-fade")   { gsap.set(ws,{opacity:0}); gsap.to(ws,{opacity:1,duration:0.4,ease:"power2.out",stagger:0.07}); }
  else if (style==="word-bounce") { gsap.set(ws,{opacity:0,y:22,scale:0.65}); gsap.to(ws,{opacity:1,y:0,scale:1,duration:0.5,ease:"back.out(2.2)",stagger:0.065}); }
  else if (style==="typewriter")  { gsap.set(cs,{opacity:0}); gsap.to(cs,{opacity:1,duration:0.01,stagger:0.03,ease:"none"}); }
  else if (style==="blur-in")     gsap.fromTo(ws,{opacity:0,filter:"blur(18px)",scale:1.06},{opacity:1,filter:"blur(0px)",scale:1,duration:0.65,ease:"power2.out",stagger:0.07});
  // Echo: words pop in individually with a punch — Instagram lyric feel
  else if (style==="echo") {
    gsap.set(el, { opacity:1 });
    gsap.set(ws, { opacity:0, scale:0.35, y:20 });
    gsap.to(ws,  { opacity:1, scale:1, y:0, duration:0.4, ease:"back.out(2.8)", stagger:{ amount:0.55 } });
  }
}

// ── Screen — strict 16:9, ResizeObserver-based font sizing ───────────────────
function Screen({ slide, bgStyle, echoAlign, echoLines, bgVideo }: {
  slide: LyricSlide | null; bgStyle: string;
  echoAlign: "center" | "centered-left" | "left";
  echoLines: "auto" | "2" | "3";
  bgVideo: BgVideo | null;
}) {
  const wrapperRef  = useRef<HTMLDivElement>(null);
  const lyricsRef   = useRef<HTMLDivElement>(null);
  const keyRef      = useRef("");
  const [box, setBox] = useState({ w: 0, h: 0 });
  // Marquee echo refs
  const marqueeRef  = useRef<HTMLDivElement>(null);
  const echoTL      = useRef<gsap.core.Timeline|null>(null);
  const echoTimer   = useRef<ReturnType<typeof setTimeout>|null>(null);
  const [echoText, setEchoText] = useState<string>("");

  // Compute strict 16:9 box that fits inside the wrapper
  useEffect(() => {
    const el = wrapperRef.current; if (!el) return;
    const measure = () => {
      const pw = el.clientWidth, ph = el.clientHeight;
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

  // GSAP animation when slide changes
  useEffect(() => {
    const el = lyricsRef.current; if (!el) return;
    const key = slide?.id ?? "clear";
    if (key === keyRef.current) return;
    keyRef.current = key;
    // Kill any in-progress animation to prevent glitch
    gsap.killTweensOf(el);
    gsap.killTweensOf(Array.from(el.querySelectorAll(".pw,.pc,.pl")));
    if (!slide) { gsap.to(el, { opacity: 0, duration: 0.35, ease:"power2.out" }); return; }
    // No fade-out — snap to visible and animate new content straight in
    gsap.set(el, { opacity: 1 });
    requestAnimationFrame(() => animIn(el, slide.animStyle));
  }, [slide]);

  // ── Marquee Echo effect ────────────────────────────────────────────────────────
  // Full-screen scrolling rows of outline text, alternating directions
  const NUM_ROWS = 5; // fills the canvas height with big text
  useEffect(() => {
    if (echoTL.current)    { echoTL.current.kill(); echoTL.current = null; }
    if (echoTimer.current) clearTimeout(echoTimer.current);
    if (lyricsRef.current) gsap.set(lyricsRef.current, { scale:1 });
    if (marqueeRef.current) gsap.set(marqueeRef.current, { opacity:0 });
    setEchoText("");
    if (!slide || slide.animStyle !== "echo") return;

    // Set echo text immediately so rows render, then start marquee after intro
    setEchoText(slide.lines[0] ?? "");
    echoTimer.current = setTimeout(() => {
      const container = marqueeRef.current;
      if (!container) return;
      const tracks = Array.from(container.querySelectorAll<HTMLElement>(".mqtrack"));

      // Fade marquee container in
      gsap.to(container, { opacity:1, duration:0.7, ease:"power2.out" });

      // Each row scrolls in alternating direction at slightly different speeds
      tracks.forEach((track, i) => {
        const goLeft = i % 2 === 0;
        const dur = 18 + i * 2.5; // staggered speeds: 18s, 20.5s, 23s ...
        // Start each row at a different phase so they don't all start at same position
        const startFrac = (i * 0.13) % 0.5;
        if (goLeft) {
          gsap.fromTo(track, { x: `-${startFrac * 100}%` }, { x:"-50%", duration: dur * (0.5 - startFrac), ease:"none",
            onComplete: () => gsap.fromTo(track, { x:"0%" }, { x:"-50%", duration:dur, ease:"none", repeat:-1 })
          });
        } else {
          gsap.fromTo(track, { x:`-${(0.5 - startFrac) * 100}%` }, { x:"0%", duration: dur * (0.5 - startFrac), ease:"none",
            onComplete: () => gsap.fromTo(track, { x:"-50%" }, { x:"0%", duration:dur, ease:"none", repeat:-1 })
          });
        }
      });

      // Subtle breathing on main lyrics
      if (lyricsRef.current)
        gsap.to(lyricsRef.current, { scale:1.018, duration:5, ease:"sine.inOut", yoyo:true, repeat:-1, transformOrigin:"center" });
    }, 550);

    return () => {
      if (echoTL.current)    { echoTL.current.kill(); echoTL.current = null; }
      if (echoTimer.current) clearTimeout(echoTimer.current);
      const container = marqueeRef.current;
      if (container) {
        gsap.killTweensOf(container);
        gsap.set(container, { opacity:0 });
        const tracks = Array.from(container.querySelectorAll<HTMLElement>(".mqtrack"));
        gsap.killTweensOf(tracks);
      }
      if (lyricsRef.current) gsap.set(lyricsRef.current, { scale:1 });
      setEchoText("");
    };
  }, [slide]);

  const renderLine = (line: string, style: AnimStyle) => {
    if (style === "typewriter")
      return line.split("").map((ch, i) => <span key={i} className="pc" style={{ display:"inline" }}>{ch === " " ? "\u00a0" : ch}</span>);
    return splitWords(line).map((tok, i) =>
      tok.trim() ? <span key={i} className="pw" style={{ display:"inline-block", marginRight:"0.22em" }}>{tok}</span>
                 : <span key={i}>&nbsp;</span>
    );
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

          {/* Section label — top left */}
          {slide && (
            <div style={{ position:"absolute", top:Math.round(box.h*0.03), left:Math.round(box.w*0.03), zIndex:10, display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:Math.max(9, Math.round(box.w*0.012)), fontWeight:700, color:"rgba(255,255,255,0.3)", letterSpacing:"0.12em", textTransform:"uppercase" }}>{slide.sectionLabel}</span>
              {slide.totalSlides > 1 && <span style={{ fontSize:Math.max(8, Math.round(box.w*0.011)), color:"rgba(255,255,255,0.18)" }}>{slide.slideNum}/{slide.totalSlides}</span>}
              <span style={{ fontSize:Math.max(8, Math.round(box.w*0.010)), color:"rgba(255,255,255,0.2)", fontStyle:"italic" }}>{ANIM_LABELS[slide.animStyle]}</span>
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
                      color: "transparent",
                      // paintOrder ensures stroke renders behind the fill — no broken/jagged edges
                      paintOrder: "stroke fill",
                      WebkitTextStroke: `${Math.max(2, Math.round(fs * 0.028))}px rgba(255,255,255,0.28)`,
                      userSelect: "none",
                    }}>{track}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Lyrics — centered inside safe zone */}
          <div ref={lyricsRef} style={{ opacity:0, position:"relative", zIndex:1, width:"100%", textAlign:"center" }}>
            {slide ? (
              slide.animStyle === "echo" ? (
                // ─ Echo: content-aware font sizing — never clips ──────────────
                (() => {
                  const allWords = slide.lines.flatMap(l => l.split(/\s+/).filter(Boolean));
                  const lineCount = echoLines === "auto" ? null : parseInt(echoLines);
                  const jc = echoAlign === "center" ? "center" : "flex-start";
                  const ml = echoAlign === "left" ? "0" : "0 auto";

                  // Empirical char-width / fontSize ratio for bold uppercase ≈ 0.63
                  // Gap between words = fontSize × GAP_R
                  const CHAR_W = 0.63;
                  const GAP_R  = 0.18;
                  const maxPx  = box.w * 0.88; // safe container width

                  // Compute the largest font size that keeps every row within maxPx.
                  // desiredFs is the target we'd love; returns the clamped safe value.
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
                    // Floor: never go below 80% of base fs (keeps text readable)
                    return Math.round(Math.max(safe, fs * 0.80));
                  };

                  const makeSpan = (word: string, gIdx: number, efs: number) => {
                    const sm = echoWordSm(word, gIdx);
                    return (
                      <span key={gIdx} className="pw" style={{
                        fontSize:      Math.round(efs * sm),
                        fontWeight:    900,
                        letterSpacing: sm > 1 ? "-0.03em" : "-0.01em",
                        lineHeight:    0.9,
                        color:         "#fff",
                        textShadow:    "0 3px 40px rgba(0,0,0,0.99)",
                        textTransform: "uppercase",
                        display:       "inline-block",
                        verticalAlign: "baseline",
                      }}>{word}</span>
                    );
                  };

                  if (lineCount) {
                    // ── Forced N rows ──────────────────────────────────────────
                    const rowSize = Math.ceil(allWords.length / lineCount);
                    const rows: string[][] = [];
                    for (let i = 0; i < allWords.length; i += rowSize) rows.push(allWords.slice(i, i + rowSize));

                    // Desired scale: bigger as line count grows, but capped by content
                    const desired = fs * (lineCount === 2 ? 1.25 : 1.45);
                    const echoFs  = safeFsForRows(rows, desired);
                    let gIdx = 0;
                    return (
                      <div style={{
                        display: "flex", flexDirection: "column",
                        alignItems: echoAlign === "center" ? "center" : "flex-start",
                        gap: `${Math.round(echoFs * 0.06)}px`,
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

                  // ── Auto: natural flex-wrap, single-word overflow guard ────
                  // Ensure the largest single word at BIG scale fits in ~80% of container
                  const maxWordLen = allWords.reduce((m, w) => Math.max(m, w.length), 0);
                  const maxFsWord  = maxWordLen > 0 ? (maxPx * 0.80) / (maxWordLen * CHAR_W * 1.30) : fs;
                  const autoFs     = Math.round(Math.min(fs, maxFsWord));
                  return (
                    <div style={{
                      display: "flex", flexWrap: "wrap",
                      justifyContent: jc,
                      alignItems: "baseline",
                      gap: `${Math.round(autoFs * 0.05)}px ${Math.round(autoFs * 0.18)}px`,
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
                    margin:`0 0 ${Math.round(fs * 0.18)}px`,
                    lineHeight: 1.15, fontSize: fs, fontWeight: 900,
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
          </div>
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

interface Props { allSongs: Song[]; isAdmin: boolean; onToast: (t:string, m:string) => void; }

export default function LiveStageView({ allSongs }: Props) {
  const [query, setQuery]               = useState("");
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [sections, setSections]         = useState<LyricSection[]>([]);
  const [activeSlide, setActiveSlide]   = useState<LyricSlide | null>(null);
  const [bgIdx, setBgIdx]               = useState(0);
  const [echoAlign, setEchoAlign]       = useState<"center" | "centered-left" | "left">("center");
  const [echoLines, setEchoLines]       = useState<"auto" | "2" | "3">("auto");
  const [bgVideo, setBgVideo]           = useState<BgVideo | null>(null);
  const [showVideoPanel, setShowVideoPanel] = useState(false);
  const [ytInput, setYtInput]           = useState("");

  useEffect(() => {
    if (!selectedSong) { setSections([]); setActiveSlide(null); return; }
    setSections(parseSections(selectedSong.lyrics)); setActiveSlide(null);
  }, [selectedSong]);

  // Update animation for a specific slide
  const setSlideAnim = (slideId: string, anim: AnimStyle) => {
    setSections(prev => prev.map(sec => ({
      ...sec,
      slides: sec.slides.map(s => s.id===slideId ? { ...s, animStyle: anim } : s),
    })));
    setActiveSlide(prev => prev?.id===slideId ? { ...prev, animStyle: anim } : prev);
  };

  // Apply one animation to every slide in the song at once
  const setAllAnim = (anim: AnimStyle) => {
    setSections(prev => prev.map(sec => ({ ...sec, slides: sec.slides.map(s => ({ ...s, animStyle: anim })) })));
    setActiveSlide(prev => prev ? { ...prev, animStyle: anim } : prev);
  };

  const filtered = query.trim()
    ? allSongs.filter(s => s.title.toLowerCase().includes(query.toLowerCase()) || (s.artist??"").toLowerCase().includes(query.toLowerCase())).slice(0,12)
    : allSongs.slice(0,12);

  // Flatten all slides for keyboard navigation
  const allSlides = sections.flatMap(s => s.slides);

  // ↓ / Space / Enter = next slide   ↑ = previous slide
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't intercept when typing in the search box
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (!allSlides.length) return;
      const idx = activeSlide ? allSlides.findIndex(s => s.id === activeSlide.id) : -1;
      if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        const next = allSlides[Math.min(idx + 1, allSlides.length - 1)];
        if (next && next.id !== activeSlide?.id) setActiveSlide(next);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        if (idx <= 0) { setActiveSlide(null); return; }
        const prev = allSlides[idx - 1];
        if (prev) setActiveSlide(prev);
      } else if (e.key === "Escape") {
        setActiveSlide(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allSlides, activeSlide]);

  // Auto-scroll active slide card into view when changed by keyboard
  useEffect(() => {
    if (!activeSlide) return;
    const el = document.querySelector<HTMLElement>(`[data-slide-id="${activeSlide.id}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeSlide]);

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:"#07090f", color:"#fff", overflow:"hidden", fontFamily:"inherit" }}>

      {/* Top Bar */}
      <div style={{ flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 20px", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:32, height:32, borderRadius:10, background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.3)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Radio size={14} color="#f87171" />
          </div>
          <div>
            <p style={{ fontSize:13, fontWeight:700, margin:0 }}>Live Stage</p>
            <p style={{ fontSize:10, color:"rgba(255,255,255,0.3)", margin:0 }}>LED wall mode · per-slide animation · centered lyrics</p>
          </div>
        </div>
        {/* Top Bar right side: BG swatches + Video BG */}
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          {/* BG swatches */}
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:9, color:"rgba(255,255,255,0.2)", textTransform:"uppercase", letterSpacing:"0.1em" }}>Background:</span>
            {BG_PRESETS.map((bg,i) => (
              <button key={i} onClick={() => setBgIdx(i)} title={bg.label}
                style={{ width:20, height:20, borderRadius:5, background:bg.style, border:bgIdx===i?"2px solid #a78bfa":"2px solid transparent", cursor:"pointer", transform:bgIdx===i?"scale(1.15)":"scale(1)", transition:"all 0.15s", opacity: bgVideo ? 0.35 : 1 }} />
            ))}
          </div>

          {/* Video BG control */}
          <div style={{ position:"relative" }}>
            <button onClick={() => setShowVideoPanel(p => !p)}
              style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 10px", borderRadius:8, cursor:"pointer", fontSize:10, fontWeight:600, transition:"all 0.15s",
                border: bgVideo ? "1px solid rgba(52,211,153,0.5)" : "1px solid rgba(255,255,255,0.1)",
                background: bgVideo ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.04)",
                color: bgVideo ? "#34d399" : "rgba(255,255,255,0.5)" }}>
              <Video size={11} />{bgVideo ? "Video ✓" : "Video BG"}
            </button>

            {showVideoPanel && (
              <div style={{ position:"absolute", right:0, top:"calc(100% + 8px)", width:272, background:"#0e1120", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, padding:14, zIndex:200, boxShadow:"0 12px 40px rgba(0,0,0,0.9)" }}>
                {/* Local file */}
                <p style={{ fontSize:9, fontWeight:700, color:"rgba(255,255,255,0.3)", textTransform:"uppercase", letterSpacing:"0.1em", margin:"0 0 7px" }}>Local File</p>
                <label style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 10px", borderRadius:8, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", cursor:"pointer", fontSize:11, color:"rgba(255,255,255,0.65)" }}>
                  <Upload size={12} />
                  {bgVideo?.type === "local" ? "Change video file…" : "Upload video file…"}
                  <input type="file" accept="video/webm,video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/ogg,video/*" style={{ display:"none" }}
                    onChange={e => {
                      const file = e.target.files?.[0]; if (!file) return;
                      if (bgVideo?.type === "local") URL.revokeObjectURL(bgVideo.url);
                      setBgVideo({ type:"local", url:URL.createObjectURL(file) });
                    }} />
                </label>

                {/* YouTube */}
                <p style={{ fontSize:9, fontWeight:700, color:"rgba(255,255,255,0.3)", textTransform:"uppercase", letterSpacing:"0.1em", margin:"12px 0 7px" }}>YouTube Link</p>
                <div style={{ display:"flex", gap:5 }}>
                  <input value={ytInput} onChange={e => setYtInput(e.target.value)}
                    placeholder="https://youtube.com/watch?v=…"
                    onKeyDown={e => { if (e.key==="Enter") { const id=extractYtId(ytInput); if(id){setBgVideo({type:"youtube",videoId:id});setYtInput("");} } }}
                    style={{ flex:1, padding:"6px 9px", borderRadius:7, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.09)", color:"#fff", fontSize:11, outline:"none" }} />
                  <button onClick={() => { const id=extractYtId(ytInput); if(id){setBgVideo({type:"youtube",videoId:id});setYtInput("");} }}
                    style={{ padding:"6px 11px", borderRadius:7, background:"rgba(99,102,241,0.2)", border:"1px solid rgba(99,102,241,0.35)", color:"#818cf8", fontSize:11, fontWeight:700, cursor:"pointer" }}>Apply</button>
                </div>
                {!extractYtId(ytInput) && ytInput.length > 3 && <p style={{ margin:"4px 0 0", fontSize:9, color:"#f87171" }}>⚠ Couldn't find a video ID — check the URL</p>}

                {/* Active video status + remove */}
                {bgVideo && (
                  <>
                    <div style={{ marginTop:10, padding:"6px 9px", borderRadius:7, background:"rgba(52,211,153,0.08)", border:"1px solid rgba(52,211,153,0.2)", fontSize:10, color:"#34d399" }}>
                      ✓ {bgVideo.type === "local" ? "Local video looping" : `YouTube looping: ${bgVideo.videoId}`}
                    </div>
                    <button onClick={() => { if(bgVideo.type==="local") URL.revokeObjectURL(bgVideo.url); setBgVideo(null); }}
                      style={{ marginTop:6, width:"100%", padding:"6px", borderRadius:7, background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.2)", color:"#f87171", fontSize:11, fontWeight:600, cursor:"pointer" }}>
                      Remove Video
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Two Column */}
      <div style={{ flex:1, display:"flex", overflow:"hidden", minHeight:0 }}>

        {/* LEFT */}
        <div style={{ width:300, flexShrink:0, display:"flex", flexDirection:"column", borderRight:"1px solid rgba(255,255,255,0.06)", overflow:"hidden" }}>
          {/* Search */}
          <div style={{ padding:"10px 12px", borderBottom:"1px solid rgba(255,255,255,0.05)", flexShrink:0 }}>
            <div style={{ position:"relative" }}>
              <Search size={12} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"rgba(255,255,255,0.25)", pointerEvents:"none" }} />
              <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search songs…"
                style={{ width:"100%", paddingLeft:30, paddingRight:28, paddingTop:7, paddingBottom:7, borderRadius:10, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.08)", color:"#fff", fontSize:13, outline:"none", boxSizing:"border-box" }} />
              {query && <button onClick={()=>setQuery("")} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"rgba(255,255,255,0.3)", padding:0 }}><X size={12} /></button>}
            </div>
          </div>

          <div style={{ flex:1, overflowY:"auto", padding:"10px", display:"flex", flexDirection:"column", gap:4 }}>
            {!selectedSong ? (
              <>
                {filtered.length===0 && <p style={{ textAlign:"center", fontSize:12, color:"rgba(255,255,255,0.15)", padding:"32px 0" }}>No songs found</p>}
                {filtered.map(song => (
                  <button key={song.id} onClick={()=>setSelectedSong(song)}
                    style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 10px", borderRadius:10, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.05)", cursor:"pointer", textAlign:"left", width:"100%", transition:"all 0.15s" }}
                    onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.07)";}}
                    onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.03)";}}>
                    <div style={{ width:28, height:28, borderRadius:8, background:"rgba(99,102,241,0.12)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <Music2 size={12} color="#818cf8" />
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ margin:0, fontSize:12, fontWeight:600, color:"rgba(255,255,255,0.8)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{song.title}</p>
                      {song.artist && <p style={{ margin:0, fontSize:10, color:"rgba(255,255,255,0.25)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{song.artist}</p>}
                    </div>
                    <ChevronRight size={12} color="rgba(255,255,255,0.2)" />
                  </button>
                ))}
              </>
            ) : (
              <>
                <button onClick={()=>{setSelectedSong(null);setActiveSlide(null);}}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 8px", borderRadius:8, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.06)", cursor:"pointer", marginBottom:4, width:"100%", color:"rgba(255,255,255,0.45)", fontSize:11, fontWeight:600 }}>
                  <X size={11} />Back to songs
                </button>
                <div style={{ padding:"8px 10px", marginBottom:6, borderRadius:10, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.05)" }}>
                  <p style={{ margin:0, fontSize:13, fontWeight:700, color:"#fff" }}>{selectedSong.title}</p>
                  {selectedSong.artist && <p style={{ margin:0, fontSize:10, color:"rgba(255,255,255,0.3)" }}>{selectedSong.artist}</p>}
                </div>

                {/* ── Global Controls ───────────────────────────────── */}
                <div style={{ padding:"6px 8px 8px", marginBottom:6, borderRadius:10, background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:5 }}>
                    <Wand2 size={9} color="rgba(255,255,255,0.25)" />
                    <span style={{ fontSize:9, fontWeight:700, color:"rgba(255,255,255,0.25)", textTransform:"uppercase", letterSpacing:"0.1em" }}>Apply to All Slides</span>
                  </div>
                  <div style={{ display:"flex", gap:2, flexWrap:"wrap", marginBottom:6 }}>
                    {ANIM_OPTIONS.map(a => (
                      <button key={a} onClick={() => setAllAnim(a)}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.1)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.04)"}
                        style={{ padding:"3px 7px", borderRadius:5, fontSize:8, fontWeight:600, cursor:"pointer",
                          border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)",
                          color:"rgba(255,255,255,0.5)", transition:"all 0.12s" }}>
                        {ANIM_LABELS[a]}
                      </button>
                    ))}
                  </div>
                  {/* Echo text align toggle */}
                  <div style={{ display:"flex", alignItems:"center", gap:4, borderTop:"1px solid rgba(255,255,255,0.04)", paddingTop:5, marginBottom:4 }}>
                    <span style={{ fontSize:9, color:"rgba(255,255,255,0.2)", fontWeight:600, whiteSpace:"nowrap" }}>Echo align:</span>
                    {(["center", "centered-left", "left"] as const).map(opt => (
                      <button key={opt} onClick={() => setEchoAlign(opt)}
                        style={{ display:"flex", alignItems:"center", gap:3, padding:"2px 6px", borderRadius:5, fontSize:8, fontWeight:600, cursor:"pointer", transition:"all 0.12s",
                          border: echoAlign===opt ? "1px solid #a78bfa" : "1px solid rgba(255,255,255,0.08)",
                          background: echoAlign===opt ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.02)",
                          color: echoAlign===opt ? "#a78bfa" : "rgba(255,255,255,0.3)" }}>
                        {opt === "center" && <><AlignCenter size={8} />Center</>}
                        {opt === "centered-left" && <><AlignLeft size={8} />C-Left</>}
                        {opt === "left" && <><AlignLeft size={8} />Left</>}
                      </button>
                    ))}
                  </div>
                  {/* Echo lines toggle — controls how many rows words are split into */}
                  <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                    <span style={{ fontSize:9, color:"rgba(255,255,255,0.2)", fontWeight:600, whiteSpace:"nowrap" }}>Lines:</span>
                    {(["auto", "2", "3"] as const).map(opt => (
                      <button key={opt} onClick={() => setEchoLines(opt)}
                        style={{ padding:"2px 8px", borderRadius:5, fontSize:8, fontWeight:600, cursor:"pointer", transition:"all 0.12s",
                          border: echoLines===opt ? "1px solid #34d399" : "1px solid rgba(255,255,255,0.08)",
                          background: echoLines===opt ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.02)",
                          color: echoLines===opt ? "#34d399" : "rgba(255,255,255,0.3)" }}>
                        {opt === "auto" ? "Auto" : `${opt} Lines`}
                      </button>
                    ))}
                    {echoLines !== "auto" && <span style={{ fontSize:8, color:"rgba(52,211,153,0.5)", fontStyle:"italic" }}>↑ bigger</span>}
                  </div>
                </div>

                {sections.length===0 && <p style={{ textAlign:"center", fontSize:11, color:"rgba(255,255,255,0.15)", padding:"24px 0" }}>No lyrics found</p>}

                {sections.map((sec,si) => {
                  const col = sectionColor(sec.label);
                  return (
                    <div key={si} style={{ marginBottom:8 }}>
                      {/* Section header */}
                      <div style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 6px", marginBottom:3 }}>
                        <Layers size={10} color={col.accent} />
                        <span style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", color:col.accent }}>{sec.label}</span>
                        <span style={{ fontSize:9, color:"rgba(255,255,255,0.15)" }}>{sec.slides.length} slide{sec.slides.length>1?"s":""}</span>
                      </div>

                      {/* Slides */}
                      <div style={{ display:"flex", flexDirection:"column", gap:4, paddingLeft:4 }}>
                        {sec.slides.map(slide => {
                          const isActive = activeSlide?.id===slide.id;
                          return (
                            <div key={slide.id} data-slide-id={slide.id} style={{ borderRadius:10, border:`1px solid ${isActive?col.activeBorder:col.border}`, background:isActive?col.active:col.bg, overflow:"hidden", transition:"all 0.18s" }}>
                              {/* Slide click area */}
                              <button onClick={()=>setActiveSlide(isActive?null:slide)}
                                style={{ width:"100%", textAlign:"left", background:"none", border:"none", cursor:"pointer", padding:"8px 10px" }}>
                                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                                  <span style={{ fontSize:9, color:col.accent, fontWeight:700, opacity:0.75 }}>
                                    Slide {slide.slideNum}{slide.totalSlides>1?` / ${slide.totalSlides}`:""}
                                  </span>
                                  {isActive && (
                                    <span style={{ display:"flex", alignItems:"center", gap:3, fontSize:9, fontWeight:700, color:col.accent }}>
                                      <Play size={7} fill={col.accent} color={col.accent} />DISPLAYING
                                    </span>
                                  )}
                                </div>
                                {slide.lines.map((line,i) => (
                                  <p key={i} style={{ margin:0, fontSize:11, lineHeight:1.5, color:isActive?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.4)", fontStyle:"italic", wordBreak:"break-word", whiteSpace:"normal" }}>{line}</p>
                                ))}
                              </button>
                              {/* Per-slide animation picker */}
                              <div style={{ display:"flex", gap:2, padding:"4px 8px 6px", flexWrap:"wrap", borderTop:"1px solid rgba(255,255,255,0.05)" }}>
                                {ANIM_OPTIONS.map(a => (
                                  <button key={a} onClick={()=>setSlideAnim(slide.id,a)}
                                    style={{ padding:"2px 6px", borderRadius:5, fontSize:8, fontWeight:600, cursor:"pointer",
                                      border: slide.animStyle===a?`1px solid ${col.accent}`:"1px solid rgba(255,255,255,0.08)",
                                      background: slide.animStyle===a?"rgba(255,255,255,0.1)":"rgba(255,255,255,0.02)",
                                      color: slide.animStyle===a?col.accent:"rgba(255,255,255,0.3)", transition:"all 0.12s" }}>
                                    {ANIM_LABELS[a]}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {activeSlide && (
                  <button onClick={()=>setActiveSlide(null)}
                    style={{ marginTop:4, padding:"8px", borderRadius:10, background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", color:"rgba(255,255,255,0.25)", fontSize:11, fontWeight:600, cursor:"pointer", width:"100%" }}>
                    ✕ Clear Display
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* RIGHT — Screen */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", background:"#050709", overflow:"hidden" }}>
          {/* Toolbar */}
          <div style={{ flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 16px", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
            <span style={{ fontSize:9, fontWeight:700, color:"rgba(255,255,255,0.2)", textTransform:"uppercase", letterSpacing:"0.12em" }}>Output Display · 16:9</span>
            <span style={{ fontSize:9, color:"rgba(255,255,255,0.1)" }}>10% safe zone · LED wall mode · per-slide animation</span>
          </div>
          {/* Canvas area — fills remaining space, Screen handles 16:9 letterboxing internally */}
          <div style={{ flex:1, overflow:"hidden", padding:16 }}>
            <Screen slide={activeSlide} bgStyle={BG_PRESETS[bgIdx].style} echoAlign={echoAlign} echoLines={echoLines} bgVideo={bgVideo} />
          </div>
          {/* Footer */}
          <div style={{ flexShrink:0, padding:"6px 16px", borderTop:"1px solid rgba(255,255,255,0.04)", display:"flex", justifyContent:"space-between" }}>
            <p style={{ margin:0, fontSize:9, color:"rgba(255,255,255,0.1)" }}>← Click a slide on the left to display</p>
            <p style={{ margin:0, fontSize:9, color:"rgba(255,255,255,0.12)" }}>OBS: <span style={{ color:"rgba(167,139,250,0.4)" }}>/live-display</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}
