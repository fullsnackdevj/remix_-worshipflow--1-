import React, { useState } from "react";
import { Copy, Check, Volume2, Info, ChevronLeft, ChevronRight, LayoutGrid, Square } from "lucide-react";
import PianoKeyboard from "./PianoKeyboard";
import { parsePianoVoicings, PianoVoicing } from "./utils/pianoUtils";

interface PianoVoicingViewerProps {
  key?: React.Key;
  content: string;
  label?: string;
}

const ACCENT_RH = "45,212,191";
const ACCENT_LH = "129,140,248";

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {
      /* noop */
    }
    document.body.removeChild(ta);
  }
};

export default function PianoVoicingViewer({ content, label }: PianoVoicingViewerProps) {
  const { voicings, patch } = parsePianoVoicings(content);
  const [activeStep, setActiveStep] = useState(0);
  const [viewMode, setViewMode] = useState<"card" | "grid">("card");
  const [copied, setCopied] = useState(false);

  const active = voicings[activeStep] ?? voicings[0] ?? null;

  const handleCopy = async () => {
    let summary = label ? `${label} · Piano Voicings\n` : "Piano Voicings\n";
    if (patch) summary += `Patch: ${patch}\n`;
    summary += "\n";

    voicings.forEach((v, i) => {
      summary += `${i + 1}. ${v.chord || "Chord"}\n`;
      if (v.leftHand.length) summary += `   LH: ${v.leftHand.join(" · ")}\n`;
      if (v.rightHand.length) summary += `   RH: ${v.rightHand.join(" · ")}\n`;
      if (v.patch) summary += `   Patch: ${v.patch}\n`;
      if (v.description) summary += `   Note: ${v.description}\n`;
      summary += "\n";
    });

    await copyText(summary.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!voicings.length) {
    return (
      <div className="p-8 text-center text-white/40 text-xs italic">
        No piano voicings entered yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Top Bar: Patch, View Toggle & Copy ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          {patch && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-white/[0.06] text-white/80 border border-white/[0.08]">
              <Volume2 size={13} className="text-teal-400" />
              {patch}
            </span>
          )}
          <span className="text-xs text-white/40 font-medium">
            {voicings.length} chord voicing{voicings.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg p-0.5 bg-white/[0.05] border border-white/[0.08]">
            <button
              type="button"
              onClick={() => setViewMode("card")}
              title="Single Card focus"
              className={`p-1 rounded-md text-xs transition-colors ${
                viewMode === "card" ? "bg-white/[0.12] text-white" : "text-white/40 hover:text-white/70"
              }`}
            >
              <Square size={13} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              title="All Chords overview"
              className={`p-1 rounded-md text-xs transition-colors ${
                viewMode === "grid" ? "bg-white/[0.12] text-white" : "text-white/40 hover:text-white/70"
              }`}
            >
              <LayoutGrid size={13} />
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            title="Copy Voicings Cheat Sheet"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all active:scale-95"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: copied ? "#34d399" : "rgba(255,255,255,0.75)",
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? "Copied" : "Copy Voicings"}</span>
          </button>
        </div>
      </div>

      {/* ── Steps Timeline Pills ── */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {voicings.map((v, i) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setActiveStep(i)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              activeStep === i
                ? "bg-teal-500/20 text-teal-300 border border-teal-500/50 shadow-sm"
                : "bg-white/[0.04] text-white/50 border border-white/[0.07] hover:text-white/80"
            }`}
          >
            <span className="opacity-40 text-[10px]">{i + 1}</span>
            <span>{v.chord || "Chord"}</span>
          </button>
        ))}
      </div>

      {/* ── Mode 1: Step Card Focus ── */}
      {viewMode === "card" && active && (
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0e1018] border border-white/[0.08] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-teal-400/70">
                  Step {activeStep + 1} of {voicings.length}
                </span>
                {active.patch && (
                  <span className="text-[11px] text-white/40 flex items-center gap-1">
                    · <Volume2 size={11} /> {active.patch}
                  </span>
                )}
              </div>
              <h4 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-0.5">
                {active.chord || "Chord"}
              </h4>
            </div>

            {/* Step navigation */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveStep(prev => Math.max(0, prev - 1))}
                disabled={activeStep === 0}
                className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white/70 disabled:opacity-20 transition-all"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => setActiveStep(prev => Math.min(voicings.length - 1, prev + 1))}
                disabled={activeStep === voicings.length - 1}
                className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white/70 disabled:opacity-20 transition-all"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Mini Piano Keyboard (Illuminated & Swipeable) */}
          <div className="py-1">
            <PianoKeyboard
              leftHand={active.leftHand}
              rightHand={active.rightHand}
              interactive={false}
              showJumpBar={true}
              autoScrollKey={active.id}
            />
          </div>

          {/* Hand Notes Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div
              className="p-3 rounded-xl flex items-center justify-between"
              style={{
                background: "rgba(129,140,248,0.06)",
                border: "1px solid rgba(129,140,248,0.2)",
              }}
            >
              <span className="text-xs font-bold" style={{ color: `rgb(${ACCENT_LH})` }}>
                Left Hand (LH)
              </span>
              <span className="text-sm font-mono font-bold text-white tracking-wide">
                {active.leftHand.length ? active.leftHand.join(" · ") : "—"}
              </span>
            </div>

            <div
              className="p-3 rounded-xl flex items-center justify-between"
              style={{
                background: "rgba(45,212,191,0.06)",
                border: "1px solid rgba(45,212,191,0.2)",
              }}
            >
              <span className="text-xs font-bold" style={{ color: `rgb(${ACCENT_RH})` }}>
                Right Hand (RH)
              </span>
              <span className="text-sm font-mono font-bold text-white tracking-wide">
                {active.rightHand.length ? active.rightHand.join(" · ") : "—"}
              </span>
            </div>
          </div>

          {/* Performance note tip */}
          {active.description && (
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-white/70">
              <Info size={14} className="text-teal-400 shrink-0 mt-0.5" />
              <span>{active.description}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Mode 2: All Chords Grid Overview ── */}
      {viewMode === "grid" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {voicings.map((v, i) => (
            <div
              key={v.id}
              className="p-3.5 rounded-xl bg-[#0e1018] border border-white/[0.07] space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-white/50">
                    #{i + 1}
                  </span>
                  <span className="text-lg font-bold text-white">{v.chord || "Chord"}</span>
                </div>
                {v.patch && (
                  <span className="text-[10px] text-white/40 truncate max-w-[120px]">{v.patch}</span>
                )}
              </div>

              {/* Compact Mini Keyboard (Swipeable) */}
              <PianoKeyboard
                leftHand={v.leftHand}
                rightHand={v.rightHand}
                interactive={false}
                compact={true}
                showJumpBar={false}
                autoScrollKey={v.id}
              />

              <div className="flex items-center justify-between text-xs font-mono pt-1 text-white/80 border-t border-white/[0.05]">
                <span className="text-indigo-400">LH: {v.leftHand.join(" ") || "—"}</span>
                <span className="text-teal-400">RH: {v.rightHand.join(" ") || "—"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
