import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Check, Copy, Guitar, Piano, Grid3x3, FileText, AlertTriangle, Minus, Music, X } from "lucide-react";
import type { SongTab, TabInstrument } from "./types";
import TabGridEditor from "./TabGridEditor";
import PianoVoicingEditor from "./PianoVoicingEditor";
import PianoVoicingViewer from "./PianoVoicingViewer";
import {
  INSTRUMENTS, TUNING_PRESETS, tuningName, newTab, parseTab, serializeGrid, emptyGrid,
  resizeGridStrings, wouldLoseNotes, addBottomString, addTopString, removeStringAtIndex, stringHasNotes,
} from "./utils/tabUtils";
import { defaultPianoVoicings, serializePianoVoicings } from "./utils/pianoUtils";

const ACCENT = "45,212,191";
const MAX_TABS = 10;

const copyText = async (text: string) => {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch { /* noop */ }
    document.body.removeChild(ta);
  }
};

const fieldStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
  color: "rgba(255,255,255,0.88)", borderRadius: 10, outline: "none",
};
const labelCls = "block text-[10px] font-bold uppercase tracking-widest mb-1";
const labelStyle: React.CSSProperties = { color: "rgba(255,255,255,0.35)" };

/** One-line summary e.g. "Guitar · Drop D · Capo 2" or "Piano / Keys · Voicings" */
const tabSubtitle = (t: SongTab) => {
  if (t.instrument === "piano") {
    return "Piano / Keys · Chord Voicings";
  }
  return [
    INSTRUMENTS[t.instrument]?.label ?? "Guitar",
    tuningName(t.instrument, t.tuning),
    t.capo > 0 ? `Capo ${t.capo}` : null,
  ].filter(Boolean).join(" · ");
};

// ══════════════════════════════════════════════════════════════════════════════
// EDITOR
// ══════════════════════════════════════════════════════════════════════════════
export function TabsEditorPanel({ tabs, onChange }: { tabs: SongTab[]; onChange: (tabs: SongTab[]) => void }) {
  const [activeId, setActiveId] = useState<string | null>(tabs[0]?.id ?? null);
  const [mode, setMode] = useState<"grid" | "text">("grid");
  const [copied, setCopied] = useState(false);
  const [editingStringIdx, setEditingStringIdx] = useState<number | null>(null);
  const [editingStringVal, setEditingStringVal] = useState("");

  const active = tabs.find(t => t.id === activeId) ?? tabs[0] ?? null;

  // keep activeId valid
  useEffect(() => {
    if (active && active.id !== activeId) setActiveId(active.id);
    if (!active && activeId) setActiveId(null);
  }, [active, activeId]);

  const update = (id: string, patch: Partial<SongTab>) =>
    onChange(tabs.map(t => (t.id === id ? { ...t, ...patch } : t)));

  const addTab = () => {
    if (tabs.length >= MAX_TABS) return;
    const t = newTab(`Tab ${tabs.length + 1}`);
    onChange([...tabs, t]);
    setActiveId(t.id);
    setMode("grid");
  };

  const deleteTab = (t: SongTab) => {
    if (t.content.trim() && !window.confirm(`Delete "${t.label || "this tab"}"? This can't be undone.`)) return;
    const rest = tabs.filter(x => x.id !== t.id);
    onChange(rest);
    setActiveId(rest[0]?.id ?? null);
  };

  /** Re-label / re-size the lines of an existing guitar/bass tab while keeping its notes. */
  const retune = (t: SongTab, instrument: TabInstrument, tuning: string[]) => {
    const parsed = t.content.trim() ? parseTab(t.content) : null;
    let content = t.content;
    if (parsed) {
      const from = parsed.tuning.length;
      if (wouldLoseNotes(parsed.grid, from, tuning.length) &&
          !window.confirm(`Switching to ${tuning.length} strings will remove notes on the removed string(s). Continue?`)) {
        return;
      }
      content = serializeGrid(resizeGridStrings(parsed.grid, from, tuning.length), tuning);
    }
    update(t.id, { instrument, tuning, content });
  };

  /** Add a lower pitch string at the bottom (e.g. 7th string B, 8th string F#, 5th string bass B) */
  const handleAddBottomString = (t: SongTab) => {
    if (t.tuning.length >= 12) return;
    const parsed = t.content.trim() ? parseTab(t.content) : null;
    const grid = parsed ? parsed.grid : emptyGrid(t.tuning.length);
    const res = addBottomString(grid, t.tuning);
    const content = t.content.trim() ? serializeGrid(res.grid, res.tuning) : "";
    update(t.id, { tuning: res.tuning, content });
  };

  /** Add a higher pitch string at the top (e.g. High C for 6-string bass, or high a) */
  const handleAddTopString = (t: SongTab) => {
    if (t.tuning.length >= 12) return;
    const parsed = t.content.trim() ? parseTab(t.content) : null;
    const grid = parsed ? parsed.grid : emptyGrid(t.tuning.length);
    const res = addTopString(grid, t.tuning);
    const content = t.content.trim() ? serializeGrid(res.grid, res.tuning) : "";
    update(t.id, { tuning: res.tuning, content });
  };

  /** Remove a specific string by index */
  const handleRemoveString = (t: SongTab, idx: number) => {
    if (t.tuning.length <= 2) {
      alert("A tab staff must have at least 2 strings.");
      return;
    }
    const parsed = t.content.trim() ? parseTab(t.content) : null;
    if (parsed && stringHasNotes(parsed.grid, idx)) {
      const stringName = t.tuning[idx] || `String #${idx + 1}`;
      if (!window.confirm(`String #${idx + 1} (${stringName}) contains written notes. Deleting it will remove those notes. Continue?`)) {
        return;
      }
    }
    const grid = parsed ? parsed.grid : emptyGrid(t.tuning.length);
    const res = removeStringAtIndex(grid, t.tuning, idx);
    const content = t.content.trim() ? serializeGrid(res.grid, res.tuning) : "";
    update(t.id, { tuning: res.tuning, content });
  };

  /** Edit a single string's tuning label */
  const handleEditStringLabel = (t: SongTab, idx: number, newLabel: string) => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    const nextTuning = [...t.tuning];
    nextTuning[idx] = trimmed;
    const parsed = t.content.trim() ? parseTab(t.content) : null;
    let content = t.content;
    if (parsed) {
      content = serializeGrid(parsed.grid, nextTuning);
    }
    update(t.id, { tuning: nextTuning, content });
  };

  const onInstrument = (t: SongTab, instrument: TabInstrument) => {
    if (instrument === t.instrument) return;

    if (instrument === "piano") {
      const isAlreadyPiano = t.content.includes("LH:") || t.content.includes("RH:") || t.content.includes("[Chord");
      const content = isAlreadyPiano ? t.content : serializePianoVoicings(defaultPianoVoicings());
      update(t.id, { instrument: "piano", tuning: ["RH", "LH"], capo: 0, content });
      return;
    }

    retune(t, instrument, [...INSTRUMENTS[instrument].defaultTuning]);
  };

  const isPiano = active?.instrument === "piano";

  // Grid view of pasted text with a different line count → adopt that tuning (guitar/bass only)
  const parsedForGrid = useMemo(() => (!isPiano && active?.content.trim() ? parseTab(active.content) : null), [active?.id, mode, isPiano]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isPiano || mode !== "grid" || !active || !parsedForGrid) return;
    if (parsedForGrid.tuning.length !== active.tuning.length) {
      const inst: TabInstrument = active.instrument === "bass" || parsedForGrid.tuning.length <= 5 ? active.instrument : "guitar";
      update(active.id, { instrument: inst, tuning: parsedForGrid.tuning });
    }
  }, [mode, active?.id, parsedForGrid, isPiano]); // eslint-disable-line react-hooks/exhaustive-deps

  const unreadable = !isPiano && mode === "grid" && !!active && active.content.trim() !== "" && !parsedForGrid;

  const insertTemplate = (t: SongTab) => {
    if (t.instrument === "piano") {
      const tpl = serializePianoVoicings(defaultPianoVoicings());
      update(t.id, { content: t.content.trim() ? `${t.content.trim()}\n\n${tpl}` : tpl });
      return;
    }
    const tpl = serializeGrid([...emptyGrid(t.tuning.length), ...emptyGrid(t.tuning.length)], t.tuning, { force: true });
    update(t.id, { content: t.content.trim() ? `${t.content.replace(/\s+$/, "")}\n\n${tpl}` : tpl });
  };

  // ── Empty state ──
  if (!active) {
    return (
      <div className="flex flex-col items-center text-center py-10 px-4 rounded-xl"
        style={{ border: `1.5px dashed rgba(${ACCENT},0.3)`, background: `rgba(${ACCENT},0.04)` }}>
        <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: `rgba(${ACCENT},0.12)` }}>
          <Music size={22} style={{ color: `rgb(${ACCENT})` }} />
        </div>
        <p className="text-sm font-semibold text-white">No tabs or voicings yet</p>
        <p className="text-xs mt-1 mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>
          Create a guitar/bass tab or piano chord voicing chart for this song.
        </p>
        <button type="button" onClick={addTab}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white active:scale-95 transition-all"
          style={{ background: `linear-gradient(135deg, rgb(13,148,136), rgb(${ACCENT}))`, boxShadow: `0 4px 14px rgba(${ACCENT},0.3)` }}>
          <Plus size={15} /> Create a tab
        </button>
      </div>
    );
  }

  const presets = TUNING_PRESETS[active.instrument] ?? [];
  const currentTuningName = tuningName(active.instrument, active.tuning);
  const isCustom = !presets.some(p => p.tuning.join(",") === active.tuning.join(","));

  return (
    <div className="space-y-3">
      {/* Tab pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {tabs.map(t => {
          const Icon = t.instrument === "piano" ? Piano : Guitar;
          return (
            <button key={t.id} type="button" onClick={() => setActiveId(t.id)}
              className="shrink-0 flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-semibold transition-all"
              style={t.id === active.id
                ? { background: `rgba(${ACCENT},0.18)`, color: `rgb(${ACCENT})`, border: `1px solid rgba(${ACCENT},0.45)` }
                : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <Icon size={12} className="opacity-75" />
              {t.label.trim() || "Untitled"}
            </button>
          );
        })}
        {tabs.length < MAX_TABS && (
          <button type="button" onClick={addTab}
            className="shrink-0 flex items-center gap-1 px-3 h-8 rounded-full text-xs font-semibold transition-all active:scale-95"
            style={{ background: "transparent", color: "rgba(255,255,255,0.45)", border: "1px dashed rgba(255,255,255,0.18)" }}>
            <Plus size={12} /> Add tab
          </button>
        )}
      </div>

      {/* Settings */}
      <div className={`grid ${isPiano ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-4"} gap-2.5`}>
        <div>
          <label className={labelCls} style={labelStyle}>Label</label>
          <input value={active.label} maxLength={40} onChange={e => update(active.id, { label: e.target.value })}
            placeholder={isPiano ? "Intro Piano Voicings" : "Intro Riff"} className="w-full px-3 h-9 text-sm" style={fieldStyle} />
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>Instrument</label>
          <select value={active.instrument} onChange={e => onInstrument(active, e.target.value as TabInstrument)}
            className="w-full px-2.5 h-9 text-sm" style={fieldStyle}>
            {(Object.keys(INSTRUMENTS) as TabInstrument[]).map(k => (
              <option key={k} value={k} style={{ background: "#13151f" }}>{INSTRUMENTS[k].label}</option>
            ))}
          </select>
        </div>
        {!isPiano && (
          <>
            <div>
              <label className={labelCls} style={labelStyle}>Tuning</label>
              <select
                value={isCustom ? "__custom" : currentTuningName}
                onChange={e => {
                  const p = presets.find(x => x.name === e.target.value);
                  if (p) retune(active, active.instrument, [...p.tuning]);
                }}
                className="w-full px-2.5 h-9 text-sm" style={fieldStyle}>
                {presets.map(p => <option key={p.name} value={p.name} style={{ background: "#13151f" }}>{p.name}</option>)}
                {isCustom && <option value="__custom" style={{ background: "#13151f" }}>{currentTuningName}</option>}
              </select>
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Capo</label>
              <select value={active.capo} onChange={e => update(active.id, { capo: Number(e.target.value) })}
                className="w-full px-2.5 h-9 text-sm" style={fieldStyle}>
                <option value={0} style={{ background: "#13151f" }}>No capo</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n} style={{ background: "#13151f" }}>Fret {n}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {/* Extended range & Strings bar for guitar and bass */}
      {!isPiano && (
        <div className="rounded-xl p-3 space-y-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.45)" }}>
                Strings ({active.tuning.length}):
              </span>
              {/* Stepper */}
              <div className="flex items-center rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)" }}>
                <button
                  type="button"
                  title="Remove bottom string"
                  disabled={active.tuning.length <= 2}
                  onClick={() => handleRemoveString(active, active.tuning.length - 1)}
                  className="w-6 h-6 flex items-center justify-center transition-colors disabled:opacity-25"
                  style={{ color: "rgba(255,255,255,0.7)" }}
                >
                  <Minus size={11} />
                </button>
                <span className="px-2 text-xs font-mono font-bold select-none" style={{ color: `rgb(${ACCENT})` }}>
                  {active.tuning.length}
                </span>
                <button
                  type="button"
                  title="Add low string (bottom)"
                  disabled={active.tuning.length >= 12}
                  onClick={() => handleAddBottomString(active)}
                  className="w-6 h-6 flex items-center justify-center transition-colors disabled:opacity-25"
                  style={{ color: "rgba(255,255,255,0.7)" }}
                >
                  <Plus size={11} />
                </button>
              </div>
            </div>

            {/* Quick Add Buttons */}
            <div className="flex items-center gap-1.5 ml-auto">
              <button
                type="button"
                disabled={active.tuning.length >= 12}
                onClick={() => handleAddTopString(active)}
                className="flex items-center gap-1 px-2.5 h-6 rounded-md text-[11px] font-semibold transition-colors disabled:opacity-30"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)" }}
                title="Add higher-pitch string to top of staff (e.g. High C for 6-string bass, or high a for guitar)"
              >
                <Plus size={10} style={{ color: `rgb(${ACCENT})` }} /> + High String
              </button>
              <button
                type="button"
                disabled={active.tuning.length >= 12}
                onClick={() => handleAddBottomString(active)}
                className="flex items-center gap-1 px-2.5 h-6 rounded-md text-[11px] font-semibold transition-colors disabled:opacity-30"
                style={{ background: `rgba(${ACCENT},0.15)`, border: `1px solid rgba(${ACCENT},0.35)`, color: `rgb(${ACCENT})` }}
                title="Add lower-pitch string to bottom of staff (e.g. 7th string B, 8th string F#, 5-string bass B)"
              >
                <Plus size={10} /> + Low String
              </button>
            </div>
          </div>

          {/* Interactive String Tuning Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {active.tuning.map((strLabel, idx) => {
              const isEditing = editingStringIdx === idx;
              return (
                <div
                  key={idx}
                  className="group relative flex items-center rounded-lg border transition-all shrink-0"
                  style={{
                    background: isEditing ? `rgba(${ACCENT},0.15)` : "rgba(255,255,255,0.04)",
                    borderColor: isEditing ? `rgba(${ACCENT},0.5)` : "rgba(255,255,255,0.09)",
                  }}
                >
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editingStringVal}
                      onChange={e => setEditingStringVal(e.target.value.slice(0, 5))}
                      onBlur={() => {
                        if (editingStringVal.trim()) {
                          handleEditStringLabel(active, idx, editingStringVal);
                        }
                        setEditingStringIdx(null);
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          if (editingStringVal.trim()) {
                            handleEditStringLabel(active, idx, editingStringVal);
                          }
                          setEditingStringIdx(null);
                        } else if (e.key === "Escape") {
                          setEditingStringIdx(null);
                        }
                      }}
                      className="w-12 h-7 px-1 text-center font-mono text-xs font-bold rounded outline-none"
                      style={{ color: `rgb(${ACCENT})`, background: "#0e1018" }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingStringIdx(idx);
                        setEditingStringVal(strLabel);
                      }}
                      title={`Click to edit tuning of string #${idx + 1} (${strLabel})`}
                      className="flex items-center gap-1.5 px-2 h-7 text-xs font-mono font-bold transition-colors"
                      style={{ color: "rgba(255,255,255,0.9)" }}
                    >
                      <span className="text-[9px] font-sans font-normal opacity-40">#{idx + 1}</span>
                      <span>{strLabel}</span>
                    </button>
                  )}

                  {active.tuning.length > 2 && !isEditing && (
                    <button
                      type="button"
                      title={`Remove string #${idx + 1} (${strLabel})`}
                      onClick={() => handleRemoveString(active, idx)}
                      className="w-5 h-7 flex items-center justify-center opacity-40 hover:opacity-100 hover:text-red-400 transition-all pr-1"
                      style={{ color: "rgba(255,255,255,0.5)" }}
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quick presets row */}
          <div className="flex items-center gap-1.5 overflow-x-auto pt-0.5">
            <span className="text-[9px] uppercase tracking-wider shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>Presets:</span>
            {presets.map(p => {
              const isCurrent = p.tuning.join(",") === active.tuning.join(",");
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => retune(active, active.instrument, [...p.tuning])}
                  className="shrink-0 px-2 py-0.5 rounded text-[10px] font-medium transition-all"
                  style={isCurrent
                    ? { background: `rgba(${ACCENT},0.2)`, color: `rgb(${ACCENT})`, border: `1px solid rgba(${ACCENT},0.45)` }
                    : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  {p.name.split(":")[0]} ({p.tuning.length}-Str)
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mode toggle + delete */}
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg p-0.5" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {([["grid", isPiano ? "Visual Keys" : "Grid", isPiano ? Piano : Grid3x3], ["text", "Text", FileText]] as const).map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => setMode(k)}
              className="flex items-center gap-1.5 px-3 h-7 rounded-md text-xs font-semibold transition-all"
              style={mode === k ? { background: `rgba(${ACCENT},0.2)`, color: `rgb(${ACCENT})` } : { color: "rgba(255,255,255,0.45)" }}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => deleteTab(active)}
          className="ml-auto flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold transition-all hover:bg-red-500/10"
          style={{ color: "rgba(248,113,113,0.8)", border: "1px solid rgba(248,113,113,0.2)" }}>
          <Trash2 size={13} /> Delete tab
        </button>
      </div>

      {/* Editor */}
      {isPiano ? (
        mode === "grid" ? (
          <PianoVoicingEditor
            key={active.id}
            initialContent={active.content}
            onChange={content => update(active.id, { content })}
          />
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => insertTemplate(active)}
                className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.65)" }}>
                <Plus size={13} /> Insert chord template
              </button>
              <span className="ml-auto text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>{active.content.length} chars</span>
            </div>
            <textarea
              value={active.content}
              onChange={e => update(active.id, { content: e.target.value })}
              wrap="off" spellCheck={false} rows={12}
              placeholder={"[Chord 1: Cmaj7]\nLH: C2\nRH: E4 G4 B4\nPatch: Grand Piano\nNotes: Root in LH, arpeggiate\n\n[Chord 2: G/B]\nLH: B2\nRH: D4 G4 B4"}
              className="w-full px-3 py-2.5 text-xs font-mono outline-none rounded-xl overflow-x-auto whitespace-pre"
              style={{ background: "#0e1018", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.85)", caretColor: `rgb(${ACCENT})`, resize: "vertical" }}
            />
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.28)" }}>
              Specify chords with <span className="font-mono">[Chord: ...]</span>, <span className="font-mono">LH:</span> notes, and <span className="font-mono">RH:</span> notes. Switch back to <b>Visual Keys</b> to see and edit the interactive mini piano keyboard.
            </p>
          </div>
        )
      ) : (
        mode === "grid" ? (
          <>
            {unreadable && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs"
                style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", color: "rgba(253,224,71,0.9)" }}>
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>This text isn't in a format the grid can read, so it's shown blank. Your original is untouched until you edit the grid — switch to <b>Text</b> to fix it.</span>
              </div>
            )}
            <TabGridEditor
              key={`${active.id}|${active.tuning.join("")}`}
              initialContent={active.content}
              tuning={active.tuning}
              onChange={content => update(active.id, { content })}
              instrument={active.instrument}
            />
            {/* Live ASCII preview */}
            <div className="rounded-xl overflow-hidden" style={{ background: "#0e1018", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>Live ASCII preview</span>
                <button type="button" disabled={!active.content.trim()}
                  onClick={async () => { await copyText(active.content); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                  className="flex items-center gap-1 text-[11px] font-semibold disabled:opacity-30"
                  style={{ color: copied ? "#34d399" : "rgba(255,255,255,0.5)" }}>
                  {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="px-3 py-2.5 text-xs font-mono overflow-x-auto whitespace-pre" style={{ color: "rgba(255,255,255,0.7)", minHeight: 40 }}>
                {active.content.trim() || <span style={{ color: "rgba(255,255,255,0.2)" }}>Notes you enter above appear here as text…</span>}
              </pre>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => insertTemplate(active)}
                className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.65)" }}>
                <Plus size={13} /> Insert blank staff
              </button>
              <span className="ml-auto text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>{active.content.length} chars</span>
            </div>
            <textarea
              value={active.content}
              onChange={e => update(active.id, { content: e.target.value })}
              wrap="off" spellCheck={false} rows={12}
              placeholder={"Paste an ASCII tab, e.g.\ne|-----0-----|\nB|---1---1---|\nG|-0-------0-|\nD|-----------|\nA|-----------|\nE|-----------|"}
              className="w-full px-3 py-2.5 text-xs font-mono outline-none rounded-xl overflow-x-auto whitespace-pre"
              style={{ background: "#0e1018", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.85)", caretColor: `rgb(${ACCENT})`, resize: "vertical" }}
            />
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.28)" }}>
              Use a monospace layout — string label, <span className="font-mono">|</span>, then dashes and fret numbers. Switch back to Grid to edit it visually.
            </p>
          </div>
        )
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// VIEWER
// ══════════════════════════════════════════════════════════════════════════════
export function TabsViewer({ tabs }: { tabs: SongTab[]; key?: React.Key }) {
  const visible = tabs.filter(t => t.content.trim());
  const [activeId, setActiveId] = useState<string | null>(visible[0]?.id ?? null);
  const [fontSize, setFontSize] = useState(13);
  const [copied, setCopied] = useState(false);

  const active = visible.find(t => t.id === activeId) ?? visible[0] ?? null;
  const isPiano = active?.instrument === "piano";

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background: "#13151f", border: "1px solid rgba(255,255,255,0.07)" }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: `rgb(${ACCENT})`, boxShadow: `0 0 6px rgba(${ACCENT},0.7)` }} />
          <h3 className="font-bold tracking-widest text-[11px] uppercase" style={{ color: "rgba(255,255,255,0.6)" }}>
            {isPiano ? "PIANO VOICINGS" : "TABS"}
          </h3>
          {active && <span className="text-[11px] truncate" style={{ color: "rgba(255,255,255,0.3)" }}>{tabSubtitle(active)}</span>}
        </div>
        {active && !isPiano && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setFontSize(s => Math.max(10, s - 1))} title="Smaller text"
              className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: `rgba(${ACCENT},0.85)`, background: `rgba(${ACCENT},0.08)` }}><Minus size={13} /></button>
            <span className="text-[11px] font-semibold w-8 text-center" style={{ color: "rgba(255,255,255,0.4)" }}>{fontSize}px</span>
            <button onClick={() => setFontSize(s => Math.min(24, s + 1))} title="Larger text"
              className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: `rgba(${ACCENT},0.85)`, background: `rgba(${ACCENT},0.08)` }}><Plus size={13} /></button>
            <div className="w-px h-4 mx-1" style={{ background: "rgba(255,255,255,0.1)" }} />
            <button title="Copy tab"
              onClick={async () => {
                await copyText(`${active.label ? active.label + "\n" : ""}${tabSubtitle(active)}\n\n${active.content}`);
                setCopied(true); setTimeout(() => setCopied(false), 1500);
              }}
              className="p-1.5 rounded-lg transition-colors" style={{ color: copied ? "#34d399" : "rgba(255,255,255,0.3)" }}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>
        )}
      </div>

      {/* Tab pills */}
      {visible.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto px-4 sm:px-5 pt-3">
          {visible.map(t => {
            const Icon = t.instrument === "piano" ? Piano : Guitar;
            return (
              <button key={t.id} onClick={() => setActiveId(t.id)}
                className="shrink-0 flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-semibold transition-all"
                style={t.id === active?.id
                  ? { background: `rgba(${ACCENT},0.18)`, color: `rgb(${ACCENT})`, border: `1px solid rgba(${ACCENT},0.45)` }
                  : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <Icon size={12} className="opacity-75" />
                {t.label.trim() || "Untitled"}
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      <div className="p-4 sm:p-5 flex-1">
        {active ? (
          isPiano ? (
            <PianoVoicingViewer content={active.content} label={active.label} />
          ) : (
            <>
              {active.label.trim() && (
                <p className="text-sm font-bold mb-2" style={{ color: "rgba(255,255,255,0.8)" }}>{active.label}</p>
              )}
              <div className="overflow-x-auto rounded-xl px-3 py-3" style={{ background: "#0e1018", border: "1px solid rgba(255,255,255,0.05)", WebkitOverflowScrolling: "touch" }}>
                <pre className="font-mono whitespace-pre leading-snug" style={{ fontSize, color: "rgba(255,255,255,0.88)", margin: 0 }}>{active.content}</pre>
              </div>
            </>
          )
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-12">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: `rgba(${ACCENT},0.1)` }}>
              <Music size={22} style={{ color: `rgba(${ACCENT},0.6)` }} />
            </div>
            <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>No tabs or voicings added</p>
            <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>Edit the song and open the Tabs tab to create one</p>
          </div>
        )}
      </div>
    </div>
  );
}
