/**
 * Piano & Keyboard Voicing Utilities for WorshipFlow
 * Supports interactive chord voicings, hand assignments (LH / RH),
 * automatic chord detection, and clean round-trip text serialization.
 */

export interface PianoVoicing {
  id: string;
  chord: string;          // e.g. "Cmaj7", "G/B", "Intro Hook"
  patch?: string;          // e.g. "Acoustic Piano + Warm Pad"
  description?: string;    // e.g. "Hold 4 beats, root in bass"
  leftHand: string[];     // e.g. ["C2", "G2"]
  rightHand: string[];    // e.g. ["E4", "G4", "B4"]
}

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export function noteToMidi(note: string): number | null {
  const m = note.trim().match(/^([A-Ga-g][#b]?)(-?\d+)$/);
  if (!m) return null;
  let name = m[1].toUpperCase();
  const octave = parseInt(m[2], 10);
  if (name === "DB") name = "C#";
  if (name === "EB") name = "D#";
  if (name === "GB") name = "F#";
  if (name === "AB") name = "G#";
  if (name === "BB") name = "A#";
  const idx = (NOTE_NAMES as readonly string[]).indexOf(name);
  if (idx === -1) return null;
  return (octave + 1) * 12 + idx;
}

export function midiToNote(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  return `${name}${octave}`;
}

export function sortNotesByPitch(notes: string[]): string[] {
  return [...notes].sort((a, b) => {
    const ma = noteToMidi(a) ?? 0;
    const mb = noteToMidi(b) ?? 0;
    return ma - mb;
  });
}

// ── Chord Detection ──────────────────────────────────────────────────────────

const CHORD_PATTERNS: { name: string; intervals: number[] }[] = [
  { name: "maj9", intervals: [0, 2, 4, 7, 11] },
  { name: "m9",   intervals: [0, 2, 3, 7, 10] },
  { name: "maj7", intervals: [0, 4, 7, 11] },
  { name: "7",    intervals: [0, 4, 7, 10] },
  { name: "m7",   intervals: [0, 3, 7, 10] },
  { name: "add9", intervals: [0, 2, 4, 7] },
  { name: "sus4", intervals: [0, 5, 7] },
  { name: "sus2", intervals: [0, 2, 7] },
  { name: "dim7", intervals: [0, 3, 6, 9] },
  { name: "dim",  intervals: [0, 3, 6] },
  { name: "aug",  intervals: [0, 4, 8] },
  { name: "",     intervals: [0, 4, 7] },  // Major
  { name: "m",    intervals: [0, 3, 7] },  // Minor
  { name: "5",    intervals: [0, 7] },
];

export function detectChord(leftHand: string[], rightHand: string[]): string {
  const allNotes = [...leftHand, ...rightHand];
  if (!allNotes.length) return "";

  const midis = allNotes.map(n => noteToMidi(n)).filter((m): m is number => m !== null);
  if (!midis.length) return "";

  const pcs = Array.from(new Set(midis.map(m => ((m % 12) + 12) % 12)));
  if (!pcs.length) return "";

  // Identify bass note (lowest in leftHand, or lowest overall)
  const bassPool = leftHand.length ? leftHand : rightHand;
  let lowestMidi = Infinity;
  let bassPc: number | null = null;
  for (const n of bassPool) {
    const m = noteToMidi(n);
    if (m !== null && m < lowestMidi) {
      lowestMidi = m;
      bassPc = ((m % 12) + 12) % 12;
    }
  }

  // Check each pitch class as root candidate
  for (const root of pcs) {
    const rootName = NOTE_NAMES[root];
    const relative = pcs.map(p => (p - root + 12) % 12);
    for (const pat of CHORD_PATTERNS) {
      if (pat.intervals.every(iv => relative.includes(iv))) {
        const chordName = `${rootName}${pat.name}`;
        const slash = bassPc !== null && bassPc !== root ? `/${NOTE_NAMES[bassPc]}` : "";
        return `${chordName}${slash}`;
      }
    }
  }

  // Fallback: single note or simple pitch name
  if (pcs.length === 1) return NOTE_NAMES[pcs[0]];
  return "";
}

// ── Serialization & Parsing ──────────────────────────────────────────────────

export const newVoicingId = () => `v_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function defaultPianoVoicings(): PianoVoicing[] {
  return [
    {
      id: newVoicingId(),
      chord: "C",
      leftHand: ["C2"],
      rightHand: ["E4", "G4", "C5"],
      description: "Root in bass, full right hand chord",
    },
  ];
}

/** Serialize piano voicings into clean, readable text. */
export function serializePianoVoicings(voicings: PianoVoicing[], globalPatch?: string): string {
  if (!voicings.length) return "";
  const blocks: string[] = [];
  if (globalPatch?.trim()) {
    blocks.push(`// Patch: ${globalPatch.trim()}`);
  }

  for (let i = 0; i < voicings.length; i++) {
    const v = voicings[i];
    const lines: string[] = [
      `[Chord ${i + 1}: ${v.chord.trim() || "Untitled"}]`,
    ];
    if (v.leftHand.length) lines.push(`LH: ${sortNotesByPitch(v.leftHand).join(" ")}`);
    if (v.rightHand.length) lines.push(`RH: ${sortNotesByPitch(v.rightHand).join(" ")}`);
    if (v.patch?.trim()) lines.push(`Patch: ${v.patch.trim()}`);
    if (v.description?.trim()) lines.push(`Notes: ${v.description.trim()}`);
    blocks.push(lines.join("\n"));
  }

  return blocks.join("\n\n");
}

/** Parse human-readable piano voicing text into structured PianoVoicing array. */
export function parsePianoVoicings(text: string): { voicings: PianoVoicing[]; patch?: string } {
  const voicings: PianoVoicing[] = [];
  let globalPatch: string | undefined;

  const rawBlocks = text.split(/\n\s*\n/);
  for (const block of rawBlocks) {
    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    // Check for global patch comment
    if (lines[0].startsWith("//") && /patch:/i.test(lines[0])) {
      globalPatch = lines[0].replace(/^\/\/\s*patch:\s*/i, "").trim();
      continue;
    }

    let chord = "";
    let patch: string | undefined;
    let description: string | undefined;
    const leftHand: string[] = [];
    const rightHand: string[] = [];

    for (const line of lines) {
      // Header: [Chord 1: Cmaj7] or [Voicing: Cmaj7] or [Cmaj7]
      const headerMatch = line.match(/^\[(?:Chord\s*\d*:\s*|Voicing:\s*)?([^\]]+)\]$/i);
      if (headerMatch) {
        chord = headerMatch[1].trim();
        continue;
      }

      // LH: C2 G2
      const lhMatch = line.match(/^LH:\s*(.*)$/i);
      if (lhMatch) {
        const tokens = lhMatch[1].split(/[\s,·\-|]+/).filter(Boolean);
        for (const t of tokens) {
          if (noteToMidi(t) !== null) leftHand.push(t);
        }
        continue;
      }

      // RH: E4 G4 B4
      const rhMatch = line.match(/^RH:\s*(.*)$/i);
      if (rhMatch) {
        const tokens = rhMatch[1].split(/[\s,·\-|]+/).filter(Boolean);
        for (const t of tokens) {
          if (noteToMidi(t) !== null) rightHand.push(t);
        }
        continue;
      }

      // Patch: Warm Pad
      const patchMatch = line.match(/^Patch:\s*(.*)$/i);
      if (patchMatch) {
        patch = patchMatch[1].trim();
        continue;
      }

      // Notes: Arpeggiate
      const noteMatch = line.match(/^(?:Notes?|Tip):\s*(.*)$/i);
      if (noteMatch) {
        description = noteMatch[1].trim();
        continue;
      }
    }

    if (chord || leftHand.length || rightHand.length) {
      voicings.push({
        id: newVoicingId(),
        chord: chord || detectChord(leftHand, rightHand) || "Chord",
        patch,
        description,
        leftHand: sortNotesByPitch(leftHand),
        rightHand: sortNotesByPitch(rightHand),
      });
    }
  }

  return {
    voicings: voicings.length ? voicings : defaultPianoVoicings(),
    patch: globalPatch,
  };
}
