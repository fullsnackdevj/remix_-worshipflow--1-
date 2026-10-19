import React, { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Trash2, Copy, Sparkles, ChevronLeft, ChevronRight, Wand2, Music2, Volume2 } from "lucide-react";
import PianoKeyboard from "./PianoKeyboard";
import {
  PianoVoicing,
  parsePianoVoicings,
  serializePianoVoicings,
  detectChord,
  sortNotesByPitch,
  newVoicingId,
  defaultPianoVoicings,
} from "./utils/pianoUtils";

interface PianoVoicingEditorProps {
  key?: React.Key;
  initialContent: string;
  onChange: (content: string) => void;
}

const ACCENT_RH = "45,212,191";   // Teal
const ACCENT_LH = "129,140,248";  // Indigo

export default function PianoVoicingEditor({ initialContent, onChange }: PianoVoicingEditorProps) {
  const [voicings, setVoicings] = useState<PianoVoicing[]>(() => {
    const parsed = parsePianoVoicings(initialContent);
    return parsed.voicings.length ? parsed.voicings : defaultPianoVoicings();
  });
  const [globalPatch, setGlobalPatch] = useState<string>(() => {
    return parsePianoVoicings(initialContent).patch ?? "";
  });

  const [activeId, setActiveId] = useState<string>(() => voicings[0]?.id ?? "");
  const [activeHand, setActiveHand] = useState<"LH" | "RH">("LH");

  const dirtyRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!dirtyRef.current) return;
    onChangeRef.current(serializePianoVoicings(voicings, globalPatch));
  }, [voicings, globalPatch]);

  // Keep activeId valid
  const active = voicings.find(v => v.id === activeId) ?? voicings[0] ?? null;
  useEffect(() => {
    if (active && active.id !== activeId) setActiveId(active.id);
  }, [active, activeId]);

  const updateVoicing = useCallback((id: string, patch: Partial<PianoVoicing>) => {
    dirtyRef.current = true;
    setVoicings(prev => prev.map(v => (v.id === id ? { ...v, ...patch } : v)));
  }, []);

  const addVoicing = () => {
    dirtyRef.current = true;
    const newV: PianoVoicing = {
      id: newVoicingId(),
      chord: "",
      leftHand: [],
      rightHand: [],
    };
    setVoicings(prev => [...prev, newV]);
    setActiveId(newV.id);
  };

  const duplicateVoicing = () => {
    if (!active) return;
    dirtyRef.current = true;
    const copy: PianoVoicing = {
      ...active,
      id: newVoicingId(),
      chord: active.chord ? `${active.chord} (copy)` : "",
    };
    const idx = voicings.findIndex(v => v.id === active.id);
    const next = [...voicings.slice(0, idx + 1), copy, ...voicings.slice(idx + 1)];
    setVoicings(next);
    setActiveId(copy.id);
  };

  const deleteVoicing = () => {
    if (voicings.length <= 1) return;
    dirtyRef.current = true;
    const idx = voicings.findIndex(v => v.id === active?.id);
    const next = voicings.filter(v => v.id !== active?.id);
    setVoicings(next);
    setActiveId(next[Math.max(0, idx - 1)]?.id ?? next[0].id);
  };

  const moveVoicing = (dir: -1 | 1) => {
    if (!active) return;
    const idx = voicings.findIndex(v => v.id === active.id);
    const target = idx + dir;
    if (target < 0 || target >= voicings.length) return;
    dirtyRef.current = true;
    const next = [...voicings];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    setVoicings(next);
  };

  // Toggle key note on active voicing
  const handleToggleNote = (note: string) => {
    if (!active) return;
    dirtyRef.current = true;
    const isLh = activeHand === "LH";
    const currentNotes = isLh ? active.leftHand : active.rightHand;
    const canonical = note.toUpperCase();

    const exists = currentNotes.some(n => n.toUpperCase() === canonical);
    let nextNotes: string[];

    if (exists) {
      nextNotes = currentNotes.filter(n => n.toUpperCase() !== canonical);
    } else {
      nextNotes = sortNotesByPitch([...currentNotes, note]);
    }

    if (isLh) {
      updateVoicing(active.id, { leftHand: nextNotes });
    } else {
      updateVoicing(active.id, { rightHand: nextNotes });
    }
  };

  // Auto-detect chord from active notes
  const handleAutoDetect = () => {
    if (!active) return;
    const detected = detectChord(active.leftHand, active.rightHand);
    if (detected) {
      updateVoicing(active.id, { chord: detected });
    }
  };

  const detectedSuggestion = active ? detectChord(active.leftHand, active.rightHand) : "";

  return (
    <div className="space-y-4">
      {/* ── Global Patch & Voicing Steps Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.07]">
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 sm:pb-0">
          {voicings.map((v, i) => {
            const isSelected = v.id === active?.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setActiveId(v.id)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={
                  isSelected
                    ? {
                        background: `rgba(${ACCENT_RH},0.2)`,
                        border: `1px solid rgba(${ACCENT_RH},0.5)`,
                        color: `rgb(${ACCENT_RH})`,
                        boxShadow: `0 0 10px rgba(${ACCENT_RH},0.25)`,
                      }
                    : {
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "rgba(255,255,255,0.65)",
                      }
                }
              >
                <span className="opacity-50 text-[10px]">{i + 1}.</span>
                <span>{v.chord.trim() || "Untitled"}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={addVoicing}
            className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white/50 border border-dashed border-white/20 hover:text-white/80 transition-all active:scale-95"
          >
            <Plus size={13} /> Add Chord
          </button>
        </div>

        {/* Global Patch Tag */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto mt-1 sm:mt-0">
          <Volume2 size={13} className="text-white/40 shrink-0" />
          <input
            value={globalPatch}
            onChange={e => {
              dirtyRef.current = true;
              setGlobalPatch(e.target.value);
            }}
            placeholder="Sound Patch (e.g. Grand Piano + Warm Pad)"
            className="w-full sm:w-64 px-2.5 py-1 text-xs rounded-lg outline-none bg-white/[0.04] border border-white/[0.08] text-white/90 placeholder:text-white/30"
          />
        </div>
      </div>

      {active && (
        <div className="p-4 rounded-2xl bg-[#0f111a] border border-white/[0.08] space-y-4">
          {/* ── Active Voicing Controls & Metadata ── */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
              <div className="relative flex-1 sm:max-w-xs">
                <input
                  value={active.chord}
                  onChange={e => updateVoicing(active.id, { chord: e.target.value })}
                  placeholder="Chord Name (e.g. Cmaj7, G/B)"
                  className="w-full px-3 py-1.5 text-sm font-bold rounded-xl outline-none bg-white/[0.05] border border-white/[0.12] text-white placeholder:text-white/30"
                />
              </div>

              {/* Auto-detect button */}
              <button
                type="button"
                onClick={handleAutoDetect}
                disabled={!active.leftHand.length && !active.rightHand.length}
                title="Identify chord name from the active keys"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  background: `rgba(${ACCENT_RH},0.12)`,
                  border: `1px solid rgba(${ACCENT_RH},0.3)`,
                  color: `rgb(${ACCENT_RH})`,
                }}
              >
                <Sparkles size={13} />
                <span>Auto-Detect</span>
              </button>

              {detectedSuggestion && detectedSuggestion !== active.chord && (
                <button
                  type="button"
                  onClick={() => updateVoicing(active.id, { chord: detectedSuggestion })}
                  className="text-xs px-2 py-1 rounded-lg bg-teal-500/10 text-teal-300 border border-teal-500/30 hover:bg-teal-500/20 transition-colors"
                >
                  Suggestion: <b>{detectedSuggestion}</b>
                </button>
              )}
            </div>

            {/* Step Tools (Duplicate, Move, Delete) */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => moveVoicing(-1)}
                title="Move chord step left"
                className="p-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white/60 hover:text-white transition-all"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => moveVoicing(1)}
                title="Move chord step right"
                className="p-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white/60 hover:text-white transition-all"
              >
                <ChevronRight size={14} />
              </button>
              <button
                type="button"
                onClick={duplicateVoicing}
                title="Duplicate this chord step"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/[0.05] border border-white/[0.08] text-white/70 hover:text-white transition-all"
              >
                <Copy size={13} /> Duplicate
              </button>
              <button
                type="button"
                onClick={deleteVoicing}
                disabled={voicings.length <= 1}
                title="Delete this chord step"
                className="p-1.5 rounded-lg text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* ── Hand Selector: Left Hand on the left, Right Hand on the right ── */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-2 rounded-xl bg-black/40 border border-white/[0.06]">
            {/* Hand Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 mr-1">Assign to:</span>
              <button
                type="button"
                onClick={() => setActiveHand("LH")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={
                  activeHand === "LH"
                    ? {
                        background: `rgba(${ACCENT_LH},0.22)`,
                        border: `1.5px solid rgb(${ACCENT_LH})`,
                        color: `rgb(${ACCENT_LH})`,
                        boxShadow: `0 0 12px rgba(${ACCENT_LH},0.35)`,
                      }
                    : {
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "rgba(255,255,255,0.5)",
                      }
                }
              >
                <span className="w-2 h-2 rounded-full" style={{ background: `rgb(${ACCENT_LH})` }} />
                Left Hand (LH)
              </button>

              <button
                type="button"
                onClick={() => setActiveHand("RH")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={
                  activeHand === "RH"
                    ? {
                        background: `rgba(${ACCENT_RH},0.22)`,
                        border: `1.5px solid rgb(${ACCENT_RH})`,
                        color: `rgb(${ACCENT_RH})`,
                        boxShadow: `0 0 12px rgba(${ACCENT_RH},0.35)`,
                      }
                    : {
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "rgba(255,255,255,0.5)",
                      }
                }
              >
                <span className="w-2 h-2 rounded-full" style={{ background: `rgb(${ACCENT_RH})` }} />
                Right Hand (RH)
              </button>
            </div>

            <span className="text-[11px] text-white/40 italic">
              Tap a hand, then tap keys on the piano to assign notes
            </span>
          </div>

          {/* ── Interactive Swipe-able Piano Keyboard ── */}
          <div className="py-1">
            <PianoKeyboard
              leftHand={active.leftHand}
              rightHand={active.rightHand}
              onToggleNote={handleToggleNote}
              interactive={true}
              showJumpBar={true}
              autoScrollKey={active.id}
            />
          </div>

          {/* ── Active Notes Summary & Quick Remove ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {/* Left Hand Notes */}
            <div
              className="p-3 rounded-xl flex flex-col justify-between"
              style={{
                background: "rgba(129,140,248,0.04)",
                border: "1px solid rgba(129,140,248,0.18)",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: `rgb(${ACCENT_LH})` }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: `rgb(${ACCENT_LH})` }} />
                  Left Hand (LH Bass)
                </span>
                {active.leftHand.length > 0 && (
                  <button
                    type="button"
                    onClick={() => updateVoicing(active.id, { leftHand: [] })}
                    className="text-[10px] font-semibold text-white/40 hover:text-red-400 transition-colors"
                  >
                    Clear LH
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 min-h-[28px] items-center">
                {active.leftHand.length ? (
                  active.leftHand.map(note => (
                    <button
                      key={note}
                      type="button"
                      onClick={() => handleToggleNote(note)}
                      title="Click to remove note"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono font-bold transition-all active:scale-95"
                      style={{
                        background: `rgba(${ACCENT_LH},0.2)`,
                        border: `1px solid rgba(${ACCENT_LH},0.45)`,
                        color: "#ffffff",
                      }}
                    >
                      {note} <span className="opacity-60 text-[10px]">✕</span>
                    </button>
                  ))
                ) : (
                  <span className="text-xs text-white/30 italic">No notes assigned (tap keys above)</span>
                )}
              </div>
            </div>

            {/* Right Hand Notes */}
            <div
              className="p-3 rounded-xl flex flex-col justify-between"
              style={{
                background: "rgba(45,212,191,0.04)",
                border: "1px solid rgba(45,212,191,0.18)",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: `rgb(${ACCENT_RH})` }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: `rgb(${ACCENT_RH})` }} />
                  Right Hand (RH Voicing)
                </span>
                {active.rightHand.length > 0 && (
                  <button
                    type="button"
                    onClick={() => updateVoicing(active.id, { rightHand: [] })}
                    className="text-[10px] font-semibold text-white/40 hover:text-red-400 transition-colors"
                  >
                    Clear RH
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 min-h-[28px] items-center">
                {active.rightHand.length ? (
                  active.rightHand.map(note => (
                    <button
                      key={note}
                      type="button"
                      onClick={() => handleToggleNote(note)}
                      title="Click to remove note"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono font-bold transition-all active:scale-95"
                      style={{
                        background: `rgba(${ACCENT_RH},0.2)`,
                        border: `1px solid rgba(${ACCENT_RH},0.45)`,
                        color: "#ffffff",
                      }}
                    >
                      {note} <span className="opacity-60 text-[10px]">✕</span>
                    </button>
                  ))
                ) : (
                  <span className="text-xs text-white/30 italic">No notes assigned (tap keys above)</span>
                )}
              </div>
            </div>
          </div>

          {/* ── Optional Tips / Performance Notes ── */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-white/40 shrink-0">Performance notes:</span>
            <input
              value={active.description ?? ""}
              onChange={e => updateVoicing(active.id, { description: e.target.value })}
              placeholder="e.g. Inversion notes, arpeggiated rhythm, hold 4 beats"
              className="flex-1 px-3 py-1.5 text-xs rounded-lg outline-none bg-white/[0.04] border border-white/[0.08] text-white/80 placeholder:text-white/25"
            />
          </div>
        </div>
      )}
    </div>
  );
}
