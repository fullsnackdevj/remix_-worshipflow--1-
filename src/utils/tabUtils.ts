import type { SongTab, TabInstrument } from "../types";

/** measures[m][col][stringIndex] = token typed in that cell ("" = empty). */
export type TabGrid = string[][][];

export const DEFAULT_COLS = 8;
export const MEASURES_PER_LINE = 4;
export const MAX_TOKEN_LEN = 7;

export const INSTRUMENTS: Record<TabInstrument, { label: string; defaultTuning: string[] }> = {
  guitar: { label: "Guitar",       defaultTuning: ["e", "B", "G", "D", "A", "E"] },
  bass:   { label: "Bass",         defaultTuning: ["G", "D", "A", "E"] },
  piano:  { label: "Piano / Keys", defaultTuning: ["RH", "LH"] },
};

export const TUNING_PRESETS: Record<TabInstrument, { name: string; tuning: string[] }[]> = {
  guitar: [
    // 6-String
    { name: "6-String: Standard (EADGBE)",     tuning: ["e", "B", "G", "D", "A", "E"] },
    { name: "6-String: Drop D",                tuning: ["e", "B", "G", "D", "A", "D"] },
    { name: "6-String: Half-step down",        tuning: ["eb", "Bb", "Gb", "Db", "Ab", "Eb"] },
    { name: "6-String: DADGAD",                tuning: ["d", "A", "G", "D", "A", "D"] },
    { name: "6-String: Open D",                tuning: ["d", "A", "F#", "D", "A", "D"] },
    { name: "6-String: Open G",                tuning: ["d", "B", "G", "D", "G", "D"] },
    // 7-String
    { name: "7-String: Standard (BEADGBE)",    tuning: ["e", "B", "G", "D", "A", "E", "B"] },
    { name: "7-String: Drop A (AEADGBE)",      tuning: ["e", "B", "G", "D", "A", "E", "A"] },
    // 8-String
    { name: "8-String: Standard (F#BEADGBE)",  tuning: ["e", "B", "G", "D", "A", "E", "B", "F#"] },
    { name: "8-String: Drop E (EBEADGBE)",     tuning: ["e", "B", "G", "D", "A", "E", "B", "E"] },
  ],
  bass: [
    // 4-String
    { name: "4-String: Standard (EADG)",       tuning: ["G", "D", "A", "E"] },
    { name: "4-String: Drop D",                tuning: ["G", "D", "A", "D"] },
    { name: "4-String: Half-step down",        tuning: ["Gb", "Db", "Ab", "Eb"] },
    // 5-String
    { name: "5-String: Standard (BEADG)",      tuning: ["G", "D", "A", "E", "B"] },
    { name: "5-String: Tenor / High C (EADGC)",tuning: ["C", "G", "D", "A", "E"] },
    { name: "5-String: Drop A",                tuning: ["G", "D", "A", "E", "A"] },
    // 6-String
    { name: "6-String: Standard (BEADGC)",     tuning: ["C", "G", "D", "A", "E", "B"] },
    // 7-String
    { name: "7-String: Standard (BEADGCF)",    tuning: ["F", "C", "G", "D", "A", "E", "B"] },
  ],
  piano: [
    { name: "Hands (RH / LH)",            tuning: ["RH", "LH"] },
    { name: "Grand Staff (4-Octave)",     tuning: ["RH 5", "RH 4", "LH 3", "LH 2"] },
    { name: "Lead / Treble (RH only)",    tuning: ["RH"] },
    { name: "Accompaniment (LH only)",    tuning: ["LH"] },
  ],
};

export function tuningName(instrument: TabInstrument, tuning: string[]): string {
  const key = tuning.join(",");
  const hit = TUNING_PRESETS[instrument]?.find(p => p.tuning.join(",") === key);
  if (hit) return hit.name;
  if (instrument === "piano") return tuning.join(" / ");
  return `Custom ${tuning.length}-Str (${[...tuning].reverse().join("")})`;
}

export const newTabId = () => `tab_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function newTab(label: string, instrument: TabInstrument = "guitar"): SongTab {
  return {
    id: newTabId(),
    label,
    instrument,
    tuning: [...INSTRUMENTS[instrument].defaultTuning],
    capo: 0,
    content: "",
  };
}

// ── Grid helpers ──────────────────────────────────────────────────────────────

export const emptyMeasure = (strings: number, cols = DEFAULT_COLS): string[][] =>
  Array.from({ length: cols }, () => Array<string>(strings).fill(""));

export const emptyGrid = (strings: number): TabGrid => [emptyMeasure(strings)];

export const gridHasNotes = (grid: TabGrid): boolean =>
  grid.some(m => m.some(c => c.some(t => t !== "")));

/** Check if any column has written notes on the specified string index */
export function stringHasNotes(grid: TabGrid, stringIndex: number): boolean {
  return grid.some(m => m.some(c => Boolean(c[stringIndex]?.trim())));
}

/** Change the number of strings. Appends rows to the bottom or trims from the bottom. */
export function resizeGridStrings(grid: TabGrid, from: number, to: number): TabGrid {
  if (from === to) return grid;
  return grid.map(measure =>
    measure.map(col =>
      to < from ? col.slice(0, to) : [...col, ...Array<string>(to - from).fill("")],
    ),
  );
}

/** True when shrinking from `from` to `to` strings would discard written notes on bottom rows. */
export function wouldLoseNotes(grid: TabGrid, from: number, to: number): boolean {
  if (to >= from) return false;
  return grid.some(m => m.some(c => c.slice(to).some(t => Boolean(t?.trim()))));
}
const LOWER_STRING_MAP: Record<string, string> = {
  "E": "B", "e": "B",
  "B": "F#", "b": "F#",
  "F#": "C#", "f#": "C#",
  "C#": "G#", "c#": "G#",
  "D": "A", "d": "A",
  "A": "E", "a": "E",
  "G": "D", "g": "D",
  "C": "G", "c": "G",
  "Eb": "Bb", "eb": "Bb",
  "Bb": "F", "bb": "F",
};

const HIGHER_STRING_MAP: Record<string, string> = {
  "G": "C", "g": "c",
  "C": "F", "c": "f",
  "F": "Bb", "f": "Bb",
  "e": "a", "E": "A",
  "b": "e", "B": "E",
  "d": "g", "D": "G",
  "A": "D", "a": "d",
};

/**
 * Add a string to the bottom of the staff (low string).
 * For 6-str guitar -> default 'B' (7-str), for 7-str -> 'F#' (8-str).
 * For 4-str bass -> default 'B' (5-str), for 5-str -> 'F#' (6-str).
 */
export function addBottomString(grid: TabGrid, tuning: string[], customLabel?: string): { grid: TabGrid; tuning: string[] } {
  let label = customLabel?.trim();
  if (!label) {
    const last = tuning[tuning.length - 1] ?? "E";
    label = LOWER_STRING_MAP[last] ?? "B";
  }
  const nextTuning = [...tuning, label];
  const nextGrid = grid.map(measure => measure.map(col => [...col, ""]));
  return { grid: nextGrid, tuning: nextTuning };
}

/**
 * Add a string to the top of the staff (high string).
 * For 4/5-str bass -> default 'C' (high C / tenor).
 */
export function addTopString(grid: TabGrid, tuning: string[], customLabel?: string): { grid: TabGrid; tuning: string[] } {
  let label = customLabel?.trim();
  if (!label) {
    const first = tuning[0] ?? "G";
    label = HIGHER_STRING_MAP[first] ?? "C";
  }
  const nextTuning = [label, ...tuning];
  const nextGrid = grid.map(measure => measure.map(col => ["", ...col]));
  return { grid: nextGrid, tuning: nextTuning };
}

/** Remove a string at a specific index */
export function removeStringAtIndex(grid: TabGrid, tuning: string[], index: number): { grid: TabGrid; tuning: string[] } {
  if (tuning.length <= 1) return { grid, tuning };
  const nextTuning = tuning.filter((_, i) => i !== index);
  const nextGrid = grid.map(measure => measure.map(col => col.filter((_, i) => i !== index)));
  return { grid: nextGrid, tuning: nextTuning };
}

// ── Serialize: grid → ASCII ───────────────────────────────────────────────────
// Layout contract (parseTab relies on it to round-trip, including empty columns):
//   measure  = "-" + column*  + "|"
//   column   = token padded with "-" to the column width + "--"
// An empty column therefore takes exactly 3 dashes ("-" + "--").

export function serializeGrid(
  grid: TabGrid,
  tuning: string[],
  opts: { force?: boolean; perLine?: number } = {},
): string {
  if (!opts.force && !gridHasNotes(grid)) return "";
  const perLine = opts.perLine ?? MEASURES_PER_LINE;
  const labelW = Math.max(1, ...tuning.map(t => t.length));
  const blocks: string[] = [];

  for (let i = 0; i < grid.length; i += perLine) {
    const rows = tuning.map(l => l.padEnd(labelW) + "|");
    for (const measure of grid.slice(i, i + perLine)) {
      for (let s = 0; s < tuning.length; s++) rows[s] += "-";
      for (const col of measure) {
        const w = Math.max(1, ...col.map(t => t.length));
        for (let s = 0; s < tuning.length; s++) rows[s] += (col[s] ?? "").padEnd(w, "-") + "--";
      }
      for (let s = 0; s < tuning.length; s++) rows[s] += "|";
    }
    blocks.push(rows.join("\n"));
  }
  return blocks.join("\n\n");
}

// ── Parse: ASCII → grid ───────────────────────────────────────────────────────

const LINE_RE = /^\s*([A-Za-z0-9#b\s/]{1,8}?)\s*\|(.*)$/;

type Row = { label: string; body: string };

function parseSegment(body: string[], a: number, b: number, n: number, isTok: (p: number) => boolean): string[][] {
  const cols: string[][] = [];
  const pushEmpty = (k: number) => { for (let i = 0; i < k; i++) cols.push(Array<string>(n).fill("")); };
  let p = a;
  let prevEnd = a;
  let first = true;

  while (p < b) {
    if (!isTok(p)) { p++; continue; }
    let q = p;
    while (q < b && isTok(q)) q++;
    const gap = p - prevEnd;
    pushEmpty(Math.max(0, Math.round((first ? gap - 1 : gap - 2) / 3)));
    cols.push(body.map(r => r.slice(p, q).replace(/[-|]/g, "")));
    prevEnd = q;
    first = false;
    p = q;
  }

  if (first) pushEmpty(Math.max(1, Math.round((b - a - 1) / 3)));
  else pushEmpty(Math.max(0, Math.round((b - prevEnd - 2) / 3)));
  return cols;
}

function parseSystem(rows: Row[]): TabGrid {
  const n = rows.length;
  const len = Math.max(...rows.map(r => r.body.length));
  const body = rows.map(r => r.body.padEnd(len, "-"));
  const isBar = (p: number) => body.every(r => r[p] === "|");
  const isTok = (p: number) => !isBar(p) && body.some(r => r[p] !== "-" && r[p] !== "|");

  const measures: TabGrid = [];
  let start = 0;
  for (let p = 0; p <= len; p++) {
    if (p === len || isBar(p)) {
      if (p > start) measures.push(parseSegment(body, start, p, n, isTok));
      start = p + 1;
    }
  }
  return measures;
}

/**
 * Reads ASCII tab text (our own output or pasted classic tabs) into a grid.
 * Returns null when no tab staff could be recognised.
 */
export function parseTab(text: string): { tuning: string[]; grid: TabGrid } | null {
  const blocks: Row[][] = [];
  let cur: Row[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(LINE_RE);
    if (m && (m[2].match(/-/g) || []).length >= 2) {
      cur.push({ label: m[1].trim(), body: m[2].replace(/\s/g, "-") });
    } else {
      if (cur.length) blocks.push(cur);
      cur = [];
    }
  }
  if (cur.length) blocks.push(cur);
  if (!blocks.length) return null;

  const n = blocks[0].length;
  if (n < 1 || n > 12) return null;
  const tuning = blocks[0].map(r => r.label);

  const grid: TabGrid = [];
  for (const block of blocks) {
    if (block.length % n !== 0) continue;
    for (let i = 0; i < block.length; i += n) grid.push(...parseSystem(block.slice(i, i + n)));
  }
  return grid.length ? { tuning, grid } : null;
}
