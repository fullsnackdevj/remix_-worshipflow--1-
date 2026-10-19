import React, { useRef, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeftRight } from "lucide-react";
import { noteToMidi } from "./utils/pianoUtils";

interface PianoKeyboardProps {
  leftHand: string[];
  rightHand: string[];
  startOctave?: number; // default 1 (C1)
  endOctave?: number;   // default 6 (C6, ends on C7)
  onToggleNote?: (note: string) => void;
  interactive?: boolean;
  compact?: boolean;
  showJumpBar?: boolean;
  autoScrollKey?: string;
}

const ACCENT_RH = "45,212,191";   // Teal (#2dd4bf)
const ACCENT_LH = "129,140,248";  // Indigo (#818cf8)

export default function PianoKeyboard({
  leftHand,
  rightHand,
  startOctave = 1,
  endOctave = 6,
  onToggleNote,
  interactive = true,
  compact = false,
  showJumpBar = true,
  autoScrollKey,
}: PianoKeyboardProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDownRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const hasMovedRef = useRef(false);

  // Normalize active notes to canonical notation for lookup
  const normalize = (n: string) =>
    n.toUpperCase().replace("DB", "C#").replace("EB", "D#").replace("GB", "F#").replace("AB", "G#").replace("BB", "A#");

  const lhSet = new Set(leftHand.map(normalize));
  const rhSet = new Set(rightHand.map(normalize));

  // Dynamic dimensions
  const whiteKeyW = compact ? 28 : 38;
  const whiteKeyH = compact ? 68 : 112;
  const blackKeyW = compact ? 18 : 24;
  const blackKeyH = compact ? 42 : 70;

  // Generate white and black keys for the full range (startOctave to endOctave)
  const whiteKeys: { note: string; pitch: string; oct: number; index: number }[] = [];
  const blackKeys: { note: string; pitch: string; oct: number; boundary: number }[] = [];

  for (let oct = startOctave; oct <= endOctave; oct++) {
    const o = oct - startOctave;
    const pitches = ["C", "D", "E", "F", "G", "A", "B"];
    pitches.forEach((p, pi) => {
      whiteKeys.push({ note: `${p}${oct}`, pitch: p, oct, index: o * 7 + pi });
    });

    const blacks = [
      { pitch: "C#", b: o * 7 + 1 },
      { pitch: "D#", b: o * 7 + 2 },
      { pitch: "F#", b: o * 7 + 4 },
      { pitch: "G#", b: o * 7 + 5 },
      { pitch: "A#", b: o * 7 + 6 },
    ];
    blacks.forEach(k => {
      blackKeys.push({ note: `${k.pitch}${oct}`, pitch: k.pitch, oct, boundary: k.b });
    });
  }

  // Top final C note (e.g. C7)
  const topOct = endOctave + 1;
  whiteKeys.push({ note: `C${topOct}`, pitch: "C", oct: topOct, index: whiteKeys.length });

  const totalWidth = whiteKeys.length * whiteKeyW;

  // ── Scroll to center active notes ──
  const scrollToActiveNotes = useCallback((smooth = true) => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const allNotes = [...leftHand, ...rightHand];

    let targetX: number;
    if (allNotes.length > 0) {
      // Find average position of active notes
      const indices: number[] = [];
      allNotes.forEach(n => {
        const canonical = normalize(n);
        const wIdx = whiteKeys.findIndex(k => k.note === canonical);
        if (wIdx !== -1) indices.push(wIdx);
        const bIdx = blackKeys.find(k => k.note === canonical);
        if (bIdx) indices.push(bIdx.boundary - 0.5);
      });

      if (indices.length > 0) {
        const avgIndex = indices.reduce((a, b) => a + b, 0) / indices.length;
        targetX = avgIndex * whiteKeyW - el.clientWidth / 2 + whiteKeyW / 2;
      } else {
        // Fallback to Middle C (C4)
        targetX = (3 * 7) * whiteKeyW - el.clientWidth / 2;
      }
    } else {
      // Default to Middle C (C4, index 21)
      targetX = (3 * 7) * whiteKeyW - el.clientWidth / 2;
    }

    el.scrollTo({
      left: Math.max(0, targetX),
      behavior: smooth ? "smooth" : "auto",
    });
  }, [leftHand, rightHand, whiteKeyW, whiteKeys, blackKeys]);

  // Initial scroll into view on mount or chord change
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToActiveNotes(true);
    }, 60);
    return () => clearTimeout(timer);
  }, [autoScrollKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to a specific octave
  const jumpToOctave = (oct: number) => {
    if (!scrollRef.current) return;
    const o = oct - startOctave;
    const targetX = (o * 7) * whiteKeyW - 16;
    scrollRef.current.scrollTo({
      left: Math.max(0, targetX),
      behavior: "smooth",
    });
  };

  const scrollByDelta = (delta: number) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: delta, behavior: "smooth" });
  };

  // ── Desktop Drag-to-Scroll handlers ──
  const onMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    isDownRef.current = true;
    startXRef.current = e.pageX - scrollRef.current.offsetLeft;
    scrollLeftRef.current = scrollRef.current.scrollLeft;
    hasMovedRef.current = false;
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDownRef.current || !scrollRef.current) return;
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 1.3;
    if (Math.abs(x - startXRef.current) > 5) {
      hasMovedRef.current = true;
      scrollRef.current.scrollLeft = scrollLeftRef.current - walk;
    }
  };

  const onMouseUp = () => {
    isDownRef.current = false;
  };

  const onMouseLeave = () => {
    isDownRef.current = false;
  };

  const handleKeyClick = (note: string) => {
    if (hasMovedRef.current) return; // Ignore click if user was dragging/swiping
    onToggleNote?.(note);
  };

  return (
    <div className="flex flex-col w-full select-none space-y-2">
      {/* ── Optional Octave Jump Bar & Swipe Hint ── */}
      {showJumpBar && !compact && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
          <div className="flex items-center gap-1 overflow-x-auto max-w-full pb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/35 mr-1 shrink-0">
              Jump:
            </span>
            {[
              { oct: 1, label: "C1 Sub" },
              { oct: 2, label: "C2 Bass" },
              { oct: 3, label: "C3 Low" },
              { oct: 4, label: "C4 Mid" },
              { oct: 5, label: "C5 Treble" },
              { oct: 6, label: "C6 High" },
            ].map(j => (
              <button
                key={j.oct}
                type="button"
                onClick={() => jumpToOctave(j.oct)}
                className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold transition-all bg-white/[0.04] text-white/60 hover:text-white hover:bg-white/[0.09] active:scale-95 shrink-0"
              >
                {j.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 ml-auto text-white/40 text-[11px] shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px]">
              <ChevronsLeftRight size={12} className="text-teal-400" />
              Swipe / drag horizontally
            </span>
            <button
              type="button"
              onClick={() => scrollByDelta(-whiteKeyW * 7)}
              title="Scroll 1 octave left"
              className="p-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-white/70 active:scale-95"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              type="button"
              onClick={() => scrollByDelta(whiteKeyW * 7)}
              title="Scroll 1 octave right"
              className="p-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-white/70 active:scale-95"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* ── Outer Bed Container (Horizontal Swipe) ── */}
      <div
        className="relative w-full rounded-2xl overflow-hidden shadow-inner p-1"
        style={{
          background: "#08090f",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "inset 0 4px 16px rgba(0,0,0,0.7)",
        }}
      >
        {/* Horizontal Scroll Window */}
        <div
          ref={scrollRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          className="relative w-full overflow-x-auto scroll-smooth cursor-grab active:cursor-grabbing pb-1.5"
          style={{
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(255,255,255,0.2) transparent",
          }}
        >
          {/* Piano Key Bed (Absolute pixel width for all 43 white keys) */}
          <div
            className="relative flex"
            style={{
              width: totalWidth,
              height: whiteKeyH,
              minWidth: totalWidth,
            }}
          >
            {/* ── White Keys ── */}
            {whiteKeys.map(k => {
              const inLh = lhSet.has(k.note);
              const inRh = rhSet.has(k.note);
              const active = inLh || inRh;
              const isMiddleC = k.note === "C4";

              let bg = "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 82%, #cbd5e1 100%)";
              let textColor = "#475569";
              let glow = "none";
              let border = "1px solid rgba(0,0,0,0.25)";

              if (inLh && inRh) {
                bg = `linear-gradient(180deg, rgba(${ACCENT_LH},0.92) 0%, rgba(${ACCENT_RH},0.92) 100%)`;
                textColor = "#ffffff";
                glow = `0 0 12px rgba(${ACCENT_RH},0.55)`;
                border = `1.5px solid rgb(${ACCENT_RH})`;
              } else if (inRh) {
                bg = `linear-gradient(180deg, rgba(${ACCENT_RH},0.9) 0%, rgba(13,148,136,0.95) 100%)`;
                textColor = "#ffffff";
                glow = `0 0 12px rgba(${ACCENT_RH},0.55)`;
                border = `1.5px solid rgb(${ACCENT_RH})`;
              } else if (inLh) {
                bg = `linear-gradient(180deg, rgba(${ACCENT_LH},0.9) 0%, rgba(99,102,241,0.95) 100%)`;
                textColor = "#ffffff";
                glow = `0 0 12px rgba(${ACCENT_LH},0.55)`;
                border = `1.5px solid rgb(${ACCENT_LH})`;
              }

              return (
                <button
                  key={k.note}
                  type="button"
                  disabled={!interactive}
                  onClick={() => handleKeyClick(k.note)}
                  className={`relative flex flex-col justify-end items-center rounded-b-md transition-all shrink-0 ${
                    interactive ? "cursor-pointer active:brightness-95 hover:brightness-105" : "cursor-default"
                  }`}
                  style={{
                    width: whiteKeyW,
                    height: "100%",
                    background: bg,
                    border,
                    borderTop: "none",
                    boxShadow: glow,
                    paddingBottom: compact ? 2 : 4,
                    zIndex: 1,
                  }}
                  title={k.note + (isMiddleC ? " (Middle C)" : "")}
                >
                  {/* Middle C indicator dot */}
                  {isMiddleC && !active && !compact && (
                    <span
                      className="absolute top-2 w-1.5 h-1.5 rounded-full"
                      style={{ background: "rgba(13,148,136,0.5)" }}
                    />
                  )}

                  {/* Hand Indicator badge when pressed */}
                  {active && !compact && (
                    <span
                      className="text-[9px] font-black uppercase tracking-tighter rounded px-1 mb-0.5 leading-none"
                      style={{
                        background: "rgba(0,0,0,0.4)",
                        color: "#ffffff",
                      }}
                    >
                      {inLh && inRh ? "LR" : inRh ? "RH" : "LH"}
                    </span>
                  )}

                  {/* Note Label */}
                  <span
                    className="font-bold leading-none select-none"
                    style={{
                      fontSize: compact ? 8 : 10,
                      color: textColor,
                      fontWeight: active || k.pitch === "C" ? 800 : 600,
                    }}
                  >
                    {k.pitch === "C" ? k.note : compact ? "" : k.pitch}
                  </span>
                </button>
              );
            })}

            {/* ── Black Keys (Positioned Absolutely) ── */}
            {blackKeys.map(k => {
              const inLh = lhSet.has(k.note);
              const inRh = rhSet.has(k.note);
              const active = inLh || inRh;

              const leftPx = k.boundary * whiteKeyW - blackKeyW / 2;

              let bg = "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)";
              let glow = "none";
              let border = "1px solid rgba(255,255,255,0.15)";
              let dotColor = "transparent";

              if (inLh && inRh) {
                bg = `linear-gradient(180deg, rgba(${ACCENT_LH},0.95) 0%, rgba(${ACCENT_RH},0.95) 100%)`;
                glow = `0 0 10px rgba(${ACCENT_RH},0.6)`;
                border = `1.5px solid rgb(${ACCENT_RH})`;
                dotColor = "#ffffff";
              } else if (inRh) {
                bg = `linear-gradient(180deg, rgba(${ACCENT_RH},0.95) 0%, rgba(13,148,136,1) 100%)`;
                glow = `0 0 10px rgba(${ACCENT_RH},0.6)`;
                border = `1.5px solid rgb(${ACCENT_RH})`;
                dotColor = "#ffffff";
              } else if (inLh) {
                bg = `linear-gradient(180deg, rgba(${ACCENT_LH},0.95) 0%, rgba(99,102,241,1) 100%)`;
                glow = `0 0 10px rgba(${ACCENT_LH},0.6)`;
                border = `1.5px solid rgb(${ACCENT_LH})`;
                dotColor = "#ffffff";
              }

              return (
                <button
                  key={k.note}
                  type="button"
                  disabled={!interactive}
                  onClick={e => {
                    e.stopPropagation();
                    handleKeyClick(k.note);
                  }}
                  className={`absolute top-0 flex flex-col justify-end items-center rounded-b-md transition-all shadow-md shrink-0 ${
                    interactive ? "cursor-pointer active:brightness-95 hover:brightness-110" : "cursor-default"
                  }`}
                  style={{
                    left: leftPx,
                    width: blackKeyW,
                    height: blackKeyH,
                    background: bg,
                    border,
                    borderTop: "none",
                    boxShadow: active ? glow : "0 3px 6px rgba(0,0,0,0.7)",
                    zIndex: 10,
                    paddingBottom: 3,
                  }}
                  title={k.note}
                >
                  {active && (
                    <span
                      className="rounded-full shrink-0 mb-0.5"
                      style={{
                        width: compact ? 3 : 5,
                        height: compact ? 3 : 5,
                        background: dotColor,
                      }}
                    />
                  )}
                  {!compact && (
                    <span
                      className="font-bold leading-none select-none text-[8px]"
                      style={{
                        color: active ? "#ffffff" : "rgba(255,255,255,0.45)",
                      }}
                    >
                      {k.pitch}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
