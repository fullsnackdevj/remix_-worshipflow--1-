import React, { useCallback, useEffect, useRef, useState } from "react";
import { Undo2, Redo2, Plus, Minus, Copy as CopyIcon, Trash2, Delete, ArrowLeft, ArrowRight } from "lucide-react";
import type { TabInstrument } from "./types";
import {
  TabGrid, emptyGrid, emptyMeasure, parseTab, serializeGrid, MAX_TOKEN_LEN,
} from "./utils/tabUtils";

const ACCENT = "45,212,191"; // teal — distinguishes Tabs from indigo Lyrics / purple Chords
const CELL_H = 30;
const HEADER_H = 18;
const TECHNIQUES = ["h", "p", "/", "\\", "b", "~", "x"] as const;
const TECH_LABELS: Record<string, string> = { h: "hammer-on", p: "pull-off", "/": "slide up", "\\": "slide down", b: "bend", "~": "vibrato", x: "mute" };

const PIANO_NOTES = ["C", "D", "E", "F", "G", "A", "B"] as const;
const PIANO_MODIFIERS = ["♯", "♭", "3", "4", "5", "m", "7"] as const;

interface Sel { m: number; c: number; s: number }
interface History { past: TabGrid[]; present: TabGrid; future: TabGrid[] }

interface Props {
  key?: React.Key;
  /** ASCII tab read once on mount — remount (change `key`) to load different content. */
  initialContent: string;
  tuning: string[];
  onChange: (content: string) => void;
  instrument?: TabInstrument;
}

const isDigit = (ch: string) => ch >= "0" && ch <= "9";
const isTech = (ch: string) => (TECHNIQUES as readonly string[]).includes(ch) && ch !== "x";
const isNote = (ch: string) => /^[a-g]$/i.test(ch);

function setCell(grid: TabGrid, sel: Sel, token: string): TabGrid {
  return grid.map((measure, m) =>
    m !== sel.m ? measure : measure.map((col, c) =>
      c !== sel.c ? col : col.map((t, s) => (s === sel.s ? token : t)),
    ),
  );
}

export default function TabGridEditor({ initialContent, tuning, onChange, instrument = "guitar" }: Props) {
  const strings = tuning.length;
  const isPiano = instrument === "piano";

  const [hist, setHist] = useState<History>(() => {
    const parsed = initialContent.trim() ? parseTab(initialContent) : null;
    const grid = parsed && parsed.tuning.length === strings ? parsed.grid : emptyGrid(strings);
    return { past: [], present: grid, future: [] };
  });
  const [sel, setSel] = useState<Sel>({ m: 0, c: 0, s: 0 });
  const grid = hist.present;

  const wrapRef = useRef<HTMLDivElement>(null);
  const lastTypeRef = useRef<{ t: number; key: string }>({ t: 0, key: "" });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Push serialized ASCII to the parent only after the user has actually edited the grid.
  // (Opening a tab — or React StrictMode's double effect — must never rewrite stored content.)
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!dirtyRef.current) return;
    onChangeRef.current(serializeGrid(grid, tuning));
  }, [grid, tuning]);

  // Keep selection valid when the grid shrinks
  useEffect(() => {
    setSel(prev => {
      const m = Math.min(prev.m, grid.length - 1);
      const c = Math.min(prev.c, grid[m].length - 1);
      const s = Math.min(prev.s, strings - 1);
      return m === prev.m && c === prev.c && s === prev.s ? prev : { m, c, s };
    });
  }, [grid, strings]);

  const commit = useCallback((next: TabGrid) => {
    dirtyRef.current = true;
    setHist(h => ({ past: [...h.past.slice(-99), h.present], present: next, future: [] }));
  }, []);
  const undo = useCallback(() => setHist(h => h.past.length
    ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h), []);
  const redo = useCallback(() => setHist(h => h.future.length
    ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h), []);

  const token = grid[sel.m]?.[sel.c]?.[sel.s] ?? "";

  // ── Input ──────────────────────────────────────────────────────────────────
  const typeKey = useCallback((key: string) => {
    const prev = grid[sel.m][sel.c][sel.s];
    const now = Date.now();
    const quick = now - lastTypeRef.current.t < 900 && lastTypeRef.current.key === `${sel.m}.${sel.c}.${sel.s}`;
    let next = prev;

    if (isPiano) {
      if (key === "#" || key === "♯") {
        if (prev && !prev.endsWith("#") && !prev.endsWith("b")) next = prev + "#";
        else return;
      } else if ((key === "b" || key === "♭") && prev && /[A-Ga-g]$/.test(prev)) {
        next = prev + "b";
      } else if (isNote(key)) {
        const note = key.toUpperCase();
        if (quick && prev.length < 5) next = prev + note; // e.g. C then E then G -> CEG chord
        else next = note;
      } else if (isDigit(key) || key === "m" || key === "7") {
        if (prev && prev.length < 6) next = prev + key;
        else if (isDigit(key)) next = key;
        else return;
      } else if (key === "-" || key === "x") {
        next = key;
      } else return;
    } else {
      if (isDigit(key)) {
        const last = prev.slice(-1);
        const trailingDigits = prev.match(/\d+$/)?.[0] ?? "";
        if (quick && trailingDigits.length === 1 && Number(trailingDigits + key) <= 24) next = prev + key;   // 1 then 2 → 12
        else if (isTech(last)) next = prev + key;                                                          // 5h → 5h7
        else next = key;
      } else if (key === "x") {
        next = "x";
      } else if (isTech(key)) {
        if (/\d$/.test(prev)) next = prev + key;
        else if (isTech(prev.slice(-1))) next = prev.slice(0, -1) + key;
        else return; // nothing to attach the technique to
      } else return;
    }

    if (next.length > MAX_TOKEN_LEN) return;
    lastTypeRef.current = { t: now, key: `${sel.m}.${sel.c}.${sel.s}` };
    if (next !== prev) commit(setCell(grid, sel, next));
  }, [grid, sel, commit, isPiano]);

  const backspace = useCallback(() => {
    const prev = grid[sel.m][sel.c][sel.s];
    if (prev) commit(setCell(grid, sel, prev.slice(0, -1)));
  }, [grid, sel, commit]);

  const clearCell = useCallback(() => {
    if (grid[sel.m][sel.c][sel.s]) commit(setCell(grid, sel, ""));
  }, [grid, sel, commit]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const moveCol = useCallback((dir: 1 | -1) => {
    setSel(p => {
      let { m, c } = p;
      c += dir;
      if (c >= grid[m].length) { if (m < grid.length - 1) { m++; c = 0; } else c = grid[m].length - 1; }
      else if (c < 0) { if (m > 0) { m--; c = grid[m].length - 1; } else c = 0; }
      return { ...p, m, c };
    });
  }, [grid]);
  const moveString = useCallback((dir: 1 | -1) => {
    setSel(p => ({ ...p, s: Math.max(0, Math.min(strings - 1, p.s + dir)) }));
  }, [strings]);

  // ── Structure edits ────────────────────────────────────────────────────────
  const addMeasure = () => {
    const next = [...grid.slice(0, sel.m + 1), emptyMeasure(strings), ...grid.slice(sel.m + 1)];
    commit(next);
    setSel({ m: sel.m + 1, c: 0, s: sel.s });
  };
  const duplicateMeasure = () => {
    const copy = grid[sel.m].map(col => [...col]);
    commit([...grid.slice(0, sel.m + 1), copy, ...grid.slice(sel.m + 1)]);
    setSel({ m: sel.m + 1, c: 0, s: sel.s });
  };
  const deleteMeasure = () => {
    if (grid.length <= 1) return;
    commit(grid.filter((_, i) => i !== sel.m));
    setSel(p => ({ ...p, m: Math.max(0, p.m - 1), c: 0 }));
  };
  const addColumn = () => {
    const blank = Array<string>(strings).fill("");
    commit(grid.map((measure, m) => m !== sel.m ? measure
      : [...measure.slice(0, sel.c + 1), [...blank], ...measure.slice(sel.c + 1)]));
    setSel(p => ({ ...p, c: p.c + 1 }));
  };
  const deleteColumn = () => {
    if (grid[sel.m].length <= 1) return;
    commit(grid.map((measure, m) => m !== sel.m ? measure : measure.filter((_, c) => c !== sel.c)));
  };

  // ── Keyboard (desktop) ─────────────────────────────────────────────────────
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
      return;
    }
    if (e.altKey) return;
    switch (e.key) {
      case "ArrowRight": case "Enter": e.preventDefault(); moveCol(1); return;
      case "ArrowLeft":  e.preventDefault(); moveCol(-1); return;
      case "ArrowUp":    e.preventDefault(); moveString(-1); return;
      case "ArrowDown":  e.preventDefault(); moveString(1); return;
      case "Backspace":  e.preventDefault(); backspace(); return;
      case "Delete": case " ": e.preventDefault(); clearCell(); return;
    }

    if (isPiano) {
      if (e.key.length === 1) {
        const k = e.key;
        if (isNote(k)) {
          e.preventDefault();
          const curTok = grid[sel.m]?.[sel.c]?.[sel.s] ?? "";
          if (k.toLowerCase() === "b" && curTok && /[A-Ga-g]$/.test(curTok)) {
            typeKey("b");
          } else {
            typeKey(k.toUpperCase());
          }
          return;
        }
        if (k === "#" || k === "♯") { e.preventDefault(); typeKey("#"); return; }
        if (isDigit(k) || k === "m" || k === "7" || k === "x" || k === "-") {
          e.preventDefault();
          typeKey(k);
          return;
        }
      }
    } else {
      if (e.key.length === 1 && (isDigit(e.key) || e.key === "x" || isTech(e.key))) {
        e.preventDefault();
        typeKey(e.key);
      }
    }
  };

  const colWidth = (col: string[]) => Math.max(38, Math.max(...col.map(t => t.length)) * 9 + 20);

  // keypad buttons must not steal focus from the editor
  const noFocus = (e: React.MouseEvent) => e.preventDefault();
  const padBtn = "h-10 rounded-lg text-sm font-semibold font-mono active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed";
  const padStyle: React.CSSProperties = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.85)" };
  const toolBtn = "flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed";
  const toolStyle: React.CSSProperties = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.65)" };

  return (
    <div className="space-y-3">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={toolBtn} style={toolStyle} onMouseDown={noFocus} onClick={addMeasure} title="Add a measure after the selected one"><Plus size={13} />Measure</button>
        <button type="button" className={toolBtn} style={toolStyle} onMouseDown={noFocus} onClick={duplicateMeasure} title="Duplicate the selected measure"><CopyIcon size={13} />Duplicate</button>
        <button type="button" className={toolBtn} style={toolStyle} onMouseDown={noFocus} onClick={deleteMeasure} disabled={grid.length <= 1} title="Delete the selected measure"><Trash2 size={13} />Measure</button>
        <div className="w-px h-5 mx-1" style={{ background: "rgba(255,255,255,0.1)" }} />
        <button type="button" className={toolBtn} style={toolStyle} onMouseDown={noFocus} onClick={addColumn} title="Insert a beat column after the selected one"><Plus size={13} />Column</button>
        <button type="button" className={toolBtn} style={toolStyle} onMouseDown={noFocus} onClick={deleteColumn} disabled={grid[sel.m]?.length <= 1} title="Delete the selected column"><Minus size={13} />Column</button>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className={toolBtn} style={toolStyle} onMouseDown={noFocus} onClick={undo} disabled={!hist.past.length} title="Undo (Ctrl+Z)"><Undo2 size={13} /></button>
          <button type="button" className={toolBtn} style={toolStyle} onMouseDown={noFocus} onClick={redo} disabled={!hist.future.length} title="Redo (Ctrl+Y)"><Redo2 size={13} /></button>
        </div>
      </div>

      {/* ── Grid ── */}
      <div
        ref={wrapRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="outline-none rounded-xl overflow-x-auto"
        style={{ background: "#0e1018", border: "1px solid rgba(255,255,255,0.08)", WebkitOverflowScrolling: "touch" }}
        aria-label={isPiano ? "Piano tablature grid. Select a cell, then tap or type notes." : "Tablature grid. Select a cell, then type a fret number."}
      >
        <div className="flex" style={{ minWidth: "max-content", padding: "10px 12px 10px 4px" }}>
          {/* line labels */}
          <div className="flex flex-col sticky left-0 z-10 pr-2 pl-2" style={{ background: "#0e1018" }}>
            <div style={{ height: HEADER_H }} />
            {tuning.map((label, s) => (
              <div key={s} className="flex items-center justify-end font-mono text-xs font-bold"
                style={{ height: CELL_H, minWidth: 26, color: sel.s === s ? `rgb(${ACCENT})` : "rgba(255,255,255,0.4)" }}>
                {label}
              </div>
            ))}
          </div>

          {grid.map((measure, m) => (
            <div key={m} className="flex flex-col" style={{ borderLeft: "2px solid rgba(255,255,255,0.35)" }}>
              <button type="button" onMouseDown={noFocus} onClick={() => { setSel(p => ({ ...p, m, c: 0 })); wrapRef.current?.focus(); }}
                className="text-left text-[10px] font-bold pl-1.5 leading-none"
                style={{ height: HEADER_H, color: sel.m === m ? `rgb(${ACCENT})` : "rgba(255,255,255,0.25)" }}>
                {m + 1}
              </button>
              <div className="flex">
                {measure.map((col, c) => {
                  const w = colWidth(col);
                  const colSelected = sel.m === m && sel.c === c;
                  return (
                    <div key={c} className="flex flex-col" style={{ width: w, background: colSelected ? `rgba(${ACCENT},0.06)` : "transparent" }}>
                      {col.map((tok, s) => {
                        const selected = colSelected && sel.s === s;
                        return (
                          <div
                            key={s}
                            role="gridcell"
                            aria-selected={selected}
                            onClick={() => { setSel({ m, c, s }); wrapRef.current?.focus(); }}
                            className="relative flex items-center justify-center cursor-pointer select-none"
                            style={{ height: CELL_H }}
                          >
                            {/* staff/string line */}
                            <div className="absolute left-0 right-0 pointer-events-none" style={{ top: "50%", height: 1, background: "rgba(255,255,255,0.2)" }} />
                            {selected && (
                              <div className="absolute inset-y-0.5 inset-x-1 rounded-md pointer-events-none"
                                style={{ border: `2px solid rgb(${ACCENT})`, boxShadow: `0 0 12px rgba(${ACCENT},0.45)`, background: `rgba(${ACCENT},0.1)` }} />
                            )}
                            {tok && (
                              <span className="relative z-[1] font-mono text-[13px] font-semibold px-1 rounded"
                                style={{ background: "#0e1018", color: tok === "x" ? "rgba(248,113,113,0.95)" : "rgba(255,255,255,0.92)" }}>
                                {tok}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div style={{ borderLeft: "2px solid rgba(255,255,255,0.35)", marginTop: HEADER_H }} />
        </div>
      </div>

      {/* ── Keypad ── */}
      {isPiano ? (
        <div className="space-y-1.5 select-none">
          {/* Natural notes with crisp piano-key aesthetic */}
          <div className="grid grid-cols-7 gap-1.5">
            {PIANO_NOTES.map(n => (
              <button
                key={n}
                type="button"
                className={padBtn}
                style={{
                  background: "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.08) 100%)",
                  border: "1px solid rgba(255,255,255,0.22)",
                  color: "#ffffff",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
                }}
                onMouseDown={noFocus}
                onClick={() => typeKey(n)}
              >
                {n}
              </button>
            ))}
          </div>
          {/* Accidentals & Modifiers */}
          <div className="grid grid-cols-7 gap-1.5">
            {PIANO_MODIFIERS.map(m => {
              const isAccidental = m === "♯" || m === "♭";
              return (
                <button
                  key={m}
                  type="button"
                  className={padBtn}
                  style={
                    isAccidental
                      ? {
                          ...padStyle,
                          background: `rgba(${ACCENT},0.12)`,
                          border: `1px solid rgba(${ACCENT},0.35)`,
                          color: `rgb(${ACCENT})`,
                          fontSize: 16,
                        }
                      : padStyle
                  }
                  onMouseDown={noFocus}
                  onClick={() => typeKey(m === "♯" ? "#" : m === "♭" ? "b" : m)}
                  title={m === "♯" ? "Sharp (#)" : m === "♭" ? "Flat (b)" : m === "m" ? "Minor" : undefined}
                >
                  {m}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <button type="button" className={padBtn} style={padStyle} onMouseDown={noFocus} onClick={() => moveCol(-1)} title="Previous column"><ArrowLeft size={16} className="mx-auto" /></button>
            <button type="button" className={padBtn} style={padStyle} onMouseDown={noFocus} onClick={() => moveCol(1)} title="Next column"><ArrowRight size={16} className="mx-auto" /></button>
            <button type="button" className={padBtn} style={padStyle} onMouseDown={noFocus} onClick={backspace} title="Backspace"><Delete size={16} className="mx-auto" /></button>
            <button type="button" className={padBtn} style={padStyle} onMouseDown={noFocus} onClick={clearCell} title="Clear cell">Clear</button>
          </div>
          <p className="text-[11px] leading-snug" style={{ color: "rgba(255,255,255,0.28)" }}>
            Tap a cell, then a note (<b>C</b>, <b>D</b>, <b>E</b>, <b>F</b>, <b>G</b>, <b>A</b>, <b>B</b>).
            Add <span className="font-mono">♯</span> or <span className="font-mono">♭</span> for accidentals, or digits for octaves (e.g. <span className="font-mono">C#4</span>).
            Tap notes quickly to build chords (e.g. <span className="font-mono">CEG</span>).
            Desktop: type note letters directly, arrow keys move, Enter/→ next column.
            {token ? <> Selected: <span className="font-mono" style={{ color: `rgb(${ACCENT})` }}>{token}</span></> : null}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5 select-none">
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
            {"0123456789".split("").map(d => (
              <button key={d} type="button" className={padBtn} style={padStyle} onMouseDown={noFocus} onClick={() => typeKey(d)}>{d}</button>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {TECHNIQUES.map(t => (
              <button key={t} type="button" title={TECH_LABELS[t]} className={padBtn}
                style={{ ...padStyle, background: `rgba(${ACCENT},0.08)`, border: `1px solid rgba(${ACCENT},0.2)`, color: `rgb(${ACCENT})` }}
                onMouseDown={noFocus} onClick={() => typeKey(t)}>{t}</button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <button type="button" className={padBtn} style={padStyle} onMouseDown={noFocus} onClick={() => moveCol(-1)} title="Previous column"><ArrowLeft size={16} className="mx-auto" /></button>
            <button type="button" className={padBtn} style={padStyle} onMouseDown={noFocus} onClick={() => moveCol(1)} title="Next column"><ArrowRight size={16} className="mx-auto" /></button>
            <button type="button" className={padBtn} style={padStyle} onMouseDown={noFocus} onClick={backspace} title="Backspace"><Delete size={16} className="mx-auto" /></button>
            <button type="button" className={padBtn} style={padStyle} onMouseDown={noFocus} onClick={clearCell} title="Clear cell">Clear</button>
          </div>
          <p className="text-[11px] leading-snug" style={{ color: "rgba(255,255,255,0.28)" }}>
            Tap a cell, then a fret number (type <b>1</b> then <b>2</b> quickly for 12). Add a technique after a number —
            <span className="font-mono"> h</span> hammer-on, <span className="font-mono">p</span> pull-off, <span className="font-mono">/ \</span> slides, <span className="font-mono">b</span> bend, <span className="font-mono">~</span> vibrato, <span className="font-mono">x</span> mute.
            Desktop: arrow keys move, Enter/→ next column, Backspace edits.
            {token ? <> Selected: <span className="font-mono" style={{ color: `rgb(${ACCENT})` }}>{token}</span></> : null}
          </p>
        </div>
      )}
    </div>
  );
}
