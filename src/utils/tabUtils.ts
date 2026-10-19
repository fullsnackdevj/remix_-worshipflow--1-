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
    { name: "Standard (EADGBE)", tuning: ["e", "B", "G", "D", "A", "E"] },
    { name: "Drop D",            tuning: ["e", "B", "G", "D", "A", "D"] },
    { name: "Half-step down",    tuning: ["eb", "Bb", "Gb", "Db", "Ab", "Eb"] },
    { name: "DADGAD",            tuning: ["d", "A", "G", "D", "A", "D"] },
  ],
  bass: [
    { name: "Standard (EADG)", tuning: ["G", "D", "A", "E"] },
    { name: "Drop D",          tuning: ["G", "D", "A", "D"] },
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
  return `Custom (${[...tuning].reverse().join("")})`;
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

/** Change the number of strings. When shrinking we keep the LOWEST strings (bottom rows). */
export function resizeGridStrings(grid: TabGrid, from: number, to: number): TabGrid {
  if (from === to) return grid;
  return grid.map(measure =>
    measure.map(col =>
      to < from ? col.slice(from - to) : [...Array<string>(to - from).fill(""), ...col],
    ),
  );
}

/** True when shrinking from `from` to `to` strings would discard written notes. */
export function wouldLoseNotes(grid: TabGrid, from: number, to: number): boolean {
  if (to >= from) return false;
  const dropped = from - to; // top rows are dropped
  return grid.some(m => m.some(c => c.slice(0, dropped).some(t => t !== "")));
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
