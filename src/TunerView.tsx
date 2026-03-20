import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Guitar } from "lucide-react";

// ── Note & frequency data ─────────────────────────────────────────────────────
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const A4_HZ = 440;
const A4_MIDI = 69;

function freqToMidi(freq: number): number {
  return 12 * Math.log2(freq / A4_HZ) + A4_MIDI;
}
function midiToFreq(midi: number): number {
  return A4_HZ * Math.pow(2, (midi - A4_MIDI) / 12);
}
function freqToNote(freq: number): { note: string; octave: number; cents: number; targetFreq: number } {
  const midi = freqToMidi(freq);
  const roundedMidi = Math.round(midi);
  const cents = (midi - roundedMidi) * 100;
  const note = NOTE_NAMES[((roundedMidi % 12) + 12) % 12];
  const octave = Math.floor(roundedMidi / 12) - 1;
  const targetFreq = midiToFreq(roundedMidi);
  return { note, octave, cents, targetFreq };
}

// ── Autocorrelation pitch detector ───────────────────────────────────────────
function detectPitch(buffer: Float32Array, sampleRate: number): { freq: number; clarity: number } | null {
  const SIZE = buffer.length;
  const MAX_SAMPLES = Math.floor(SIZE / 2);

  // RMS gate — ignore if signal is too quiet
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return null;

  // Autocorrelation
  const corr = new Float32Array(MAX_SAMPLES);
  for (let lag = 0; lag < MAX_SAMPLES; lag++) {
    let sum = 0;
    for (let i = 0; i < MAX_SAMPLES; i++) {
      sum += buffer[i] * buffer[i + lag];
    }
    corr[lag] = sum;
  }

  // Find first local minimum, then first peak after it
  let d = 0;
  while (d < MAX_SAMPLES - 1 && corr[d] > corr[d + 1]) d++;
  let maxVal = -Infinity;
  let maxLag = -1;
  for (let i = d; i < MAX_SAMPLES; i++) {
    if (corr[i] > maxVal) {
      maxVal = corr[i];
      maxLag = i;
    }
  }
  if (maxLag === -1 || maxLag === 0) return null;

  // Parabolic interpolation for sub-sample accuracy
  const x1 = corr[maxLag - 1] ?? 0;
  const x2 = corr[maxLag];
  const x3 = corr[maxLag + 1] ?? 0;
  const shift = (x3 - x1) / (2 * (2 * x2 - x1 - x3));
  const refinedLag = maxLag + shift;

  const freq = sampleRate / refinedLag;
  const clarity = maxVal / corr[0];

  return { freq, clarity };
}

// ── Tuning presets ────────────────────────────────────────────────────────────
const TUNING_PRESETS: Record<string, { label: string; strings: { name: string; freq: number }[] }> = {
  guitar_standard: {
    label: "Guitar — Standard (EADGBe)",
    strings: [
      { name: "E2",  freq: 82.41  },
      { name: "A2",  freq: 110.00 },
      { name: "D3",  freq: 146.83 },
      { name: "G3",  freq: 196.00 },
      { name: "B3",  freq: 246.94 },
      { name: "E4",  freq: 329.63 },
    ],
  },
  guitar_drop_d: {
    label: "Guitar — Drop D",
    strings: [
      { name: "D2",  freq: 73.42  },
      { name: "A2",  freq: 110.00 },
      { name: "D3",  freq: 146.83 },
      { name: "G3",  freq: 196.00 },
      { name: "B3",  freq: 246.94 },
      { name: "E4",  freq: 329.63 },
    ],
  },
  bass: {
    label: "Bass Guitar (EADg)",
    strings: [
      { name: "E1",  freq: 41.20  },
      { name: "A1",  freq: 55.00  },
      { name: "D2",  freq: 73.42  },
      { name: "G2",  freq: 98.00  },
    ],
  },
  ukulele: {
    label: "Ukulele — Standard (GCEa)",
    strings: [
      { name: "G4",  freq: 392.00 },
      { name: "C4",  freq: 261.63 },
      { name: "E4",  freq: 329.63 },
      { name: "A4",  freq: 440.00 },
    ],
  },
  chromatic: {
    label: "Chromatic",
    strings: [],
  },
};

// ── Needle SVG gauge ──────────────────────────────────────────────────────────
function NeedleGauge({ cents, isInTune }: { cents: number; isInTune: boolean }) {
  // cents: -50 to +50 maps to -90° to +90° rotation from center
  const angleDeg = Math.max(-90, Math.min(90, cents * 1.8));
  const angleRad = (angleDeg * Math.PI) / 180;

  // Needle tip position (from center 100,100, radius 80)
  const nx = 100 + 80 * Math.sin(angleRad);
  const ny = 100 - 80 * Math.cos(angleRad);

  // Color based on in-tune
  const needleColor = isInTune ? "#10b981" : cents > 0 ? "#f59e0b" : "#f59e0b";
  const glowColor = isInTune ? "drop-shadow(0 0 8px #10b981)" : "none";

  return (
    <svg viewBox="0 0 200 110" className="w-full max-w-xs mx-auto select-none">
      {/* Arc background */}
      <path
        d="M 15 100 A 85 85 0 0 1 185 100"
        fill="none"
        stroke="#1e293b"
        strokeWidth="18"
        strokeLinecap="round"
      />
      {/* Flat side (red) */}
      <path
        d="M 15 100 A 85 85 0 0 1 100 15"
        fill="none"
        stroke="#7f1d1d"
        strokeWidth="8"
        strokeLinecap="round"
        opacity="0.5"
      />
      {/* Sharp side (red) */}
      <path
        d="M 100 15 A 85 85 0 0 1 185 100"
        fill="none"
        stroke="#7f1d1d"
        strokeWidth="8"
        strokeLinecap="round"
        opacity="0.5"
      />
      {/* In-tune center zone */}
      <path
        d="M 87 18 A 85 85 0 0 1 113 18"
        fill="none"
        stroke={isInTune ? "#10b981" : "#065f46"}
        strokeWidth="8"
        strokeLinecap="round"
        opacity={isInTune ? 1 : 0.6}
      />

      {/* Tick marks */}
      {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((t) => {
        const a = (t / 4) * (Math.PI / 2);
        const r1 = 72, r2 = 82;
        const x1 = 100 + r1 * Math.sin(a);
        const y1 = 100 - r1 * Math.cos(a);
        const x2 = 100 + r2 * Math.sin(a);
        const y2 = 100 - r2 * Math.cos(a);
        return (
          <line
            key={t}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={t === 0 ? "#10b981" : "#334155"}
            strokeWidth={t === 0 ? "2.5" : "1.5"}
          />
        );
      })}

      {/* Needle */}
      <line
        x1="100" y1="100"
        x2={nx} y2={ny}
        stroke={needleColor}
        strokeWidth="2.5"
        strokeLinecap="round"
        style={{ filter: glowColor, transition: "all 0.08s ease-out" }}
      />
      {/* Needle pivot */}
      <circle cx="100" cy="100" r="5" fill={needleColor} />
      <circle cx="100" cy="100" r="2.5" fill="#0f172a" />

      {/* Labels */}
      <text x="10"  y="108" fill="#f87171" fontSize="9" fontWeight="bold" textAnchor="middle">♭</text>
      <text x="190" y="108" fill="#f87171" fontSize="9" fontWeight="bold" textAnchor="middle">♯</text>
    </svg>
  );
}

// ── Main TunerView ────────────────────────────────────────────────────────────
export default function TunerView() {
  const [isListening, setIsListening] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [detectedNote, setDetectedNote] = useState<string | null>(null);
  const [detectedOctave, setDetectedOctave] = useState<number | null>(null);
  const [detectedFreq, setDetectedFreq]  = useState<number | null>(null);
  const [cents, setCents]             = useState(0);
  const [sensitivity, setSensitivity] = useState(0.82); // clarity threshold
  const [selectedPreset, setSelectedPreset] = useState<keyof typeof TUNING_PRESETS>("guitar_standard");
  const [lockedString, setLockedString] = useState<number | null>(null); // index into preset strings

  const audioCtxRef    = useRef<AudioContext | null>(null);
  const analyserRef    = useRef<AnalyserNode | null>(null);
  const streamRef      = useRef<MediaStream | null>(null);
  const filterRef      = useRef<BiquadFilterNode | null>(null);
  const rafRef         = useRef<number | null>(null);
  const bufferRef      = useRef<Float32Array | null>(null);

  const preset = TUNING_PRESETS[selectedPreset];
  const isInTune = Math.abs(cents) < 5;

  const getNoteColor = () => {
    if (!isListening || detectedNote === null) return "text-gray-500 dark:text-gray-500";
    if (isInTune) return "text-emerald-400";
    if (Math.abs(cents) < 15) return "text-amber-400";
    return "text-rose-400";
  };

  const getCentsLabel = () => {
    if (!detectedNote) return "";
    if (isInTune) return "In Tune ✓";
    return cents > 0 ? `+${cents.toFixed(0)}¢ Sharp` : `${cents.toFixed(0)}¢ Flat`;
  };

  const stopTuner = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (audioCtxRef.current) audioCtxRef.current.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    streamRef.current   = null;
    filterRef.current   = null;
    bufferRef.current   = null;
    setIsListening(false);
    setDetectedNote(null);
    setDetectedOctave(null);
    setDetectedFreq(null);
    setCents(0);
  }, []);

  const startTuner = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);

      // Bandpass filter — focus on instrument range
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 350; // center around guitar/bass range
      filter.Q.value = 0.5;         // wide Q to cover full range
      filterRef.current = filter;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096; // high resolution for low notes
      analyserRef.current = analyser;

      source.connect(filter);
      filter.connect(analyser);

      bufferRef.current = new Float32Array(analyser.fftSize);
      setIsListening(true);
    } catch (e: any) {
      setError("Microphone access denied. Please allow mic access and try again.");
      stopTuner();
    }
  }, [stopTuner]);

  // ── Analysis loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isListening) return;

    let lastValidNote: string | null = null;
    let lastValidCents = 0;
    let sameNoteCount = 0;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const analyser = analyserRef.current;
      const buffer   = bufferRef.current;
      const ctx      = audioCtxRef.current;
      if (!analyser || !buffer || !ctx) return;

      analyser.getFloatTimeDomainData(buffer);
      const result = detectPitch(buffer, ctx.sampleRate);

      if (!result || result.clarity < sensitivity) {
        // Fade out after a short delay — don't snap to "nothing" immediately
        sameNoteCount = 0;
        return;
      }

      const { freq, clarity: _clarity } = result;

      // Restrict to instrument frequency range based on preset
      let minFreq = 60, maxFreq = 1400;
      if (selectedPreset === "bass")    { minFreq = 30; maxFreq = 400; }
      if (selectedPreset === "ukulele") { minFreq = 200; maxFreq = 1600; }

      if (freq < minFreq || freq > maxFreq) return;

      const { note, octave, cents: c, targetFreq: _tf } = freqToNote(freq);
      const fullNote = `${note}${octave}`;

      // If locked to a specific string, only show if near that target
      if (lockedString !== null && preset.strings.length > 0) {
        const target = preset.strings[lockedString];
        if (target) {
          const diff = Math.abs(freqToMidi(freq) - freqToMidi(target.freq));
          if (diff > 1.5) return; // more than 1.5 semitones away — ignore
        }
      }

      if (fullNote === lastValidNote) {
        sameNoteCount++;
      } else {
        sameNoteCount = 1;
        lastValidNote = fullNote;
        lastValidCents = c;
      }

      // Require 2+ consecutive same-note readings for stability
      if (sameNoteCount >= 2) {
        setDetectedNote(note);
        setDetectedOctave(octave);
        setDetectedFreq(freq);
        setCents(Math.round(c));
        lastValidCents = c;
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isListening, sensitivity, selectedPreset, lockedString, preset.strings]);

  useEffect(() => () => stopTuner(), [stopTuner]);

  // ── Pitch bar ─────────────────────────────────────────────────────────────
  const pitchBarPos = Math.max(0, Math.min(100, 50 + cents)); // 0-100

  return (
    <div className="flex flex-col items-center w-full h-full overflow-y-auto py-6 px-4 gap-6">
      {/* ── Header ── */}
      <div className="w-full max-w-md">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Guitar size={20} className="text-emerald-500" />
          Instrument Tuner
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Hold your instrument close to the mic and play a single note.
        </p>
      </div>

      {/* ── Tuning Preset picker ── */}
      <div className="w-full max-w-md">
        <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">
          Instrument / Tuning
        </label>
        <select
          value={selectedPreset}
          onChange={e => { setSelectedPreset(e.target.value as keyof typeof TUNING_PRESETS); setLockedString(null); }}
          className="w-full text-sm px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {Object.entries(TUNING_PRESETS).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
      </div>

      {/* ── String reference buttons ── */}
      {preset.strings.length > 0 && (
        <div className="w-full max-w-md">
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 block">
            Target String <span className="normal-case font-normal">(tap to lock)</span>
          </label>
          <div className="flex gap-2 flex-wrap">
            {preset.strings.map((s, i) => (
              <button
                key={i}
                onClick={() => setLockedString(lockedString === i ? null : i)}
                className={`px-3 py-2 rounded-xl text-sm font-bold transition-all border ${
                  lockedString === i
                    ? "bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/30"
                    : "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-emerald-500/50 hover:text-emerald-500"
                }`}
                title={`${s.name} — ${s.freq.toFixed(2)} Hz`}
              >
                {s.name}
              </button>
            ))}
            {lockedString !== null && (
              <button
                onClick={() => setLockedString(null)}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-rose-400 transition-colors"
              >
                × Clear
              </button>
            )}
          </div>
          {lockedString !== null && (
            <p className="text-xs text-emerald-500 mt-1.5 font-medium">
              🎯 Locked to {preset.strings[lockedString]?.name} — {preset.strings[lockedString]?.freq.toFixed(2)} Hz
            </p>
          )}
        </div>
      )}

      {/* ── Main display ── */}
      <div className="w-full max-w-md bg-gray-900 dark:bg-gray-950 rounded-3xl border border-gray-700 dark:border-gray-800 p-6 flex flex-col items-center gap-4 shadow-2xl">

        {/* Note name */}
        <div className="text-center">
          <div className={`text-8xl font-black leading-none transition-all duration-100 ${getNoteColor()}`}>
            {detectedNote ?? (isListening ? "—" : "—")}
          </div>
          {detectedOctave !== null && (
            <div className="text-sm text-gray-500 -mt-1">
              Octave {detectedOctave}
              {detectedFreq !== null && (
                <span className="ml-2 text-emerald-400 font-mono font-semibold">
                  {detectedFreq.toFixed(1)} Hz
                </span>
              )}
            </div>
          )}
        </div>

        {/* Needle gauge */}
        <div className="w-full">
          <NeedleGauge cents={detectedNote ? cents : 0} isInTune={!!detectedNote && isInTune} />
        </div>

        {/* Pitch bar */}
        <div className="w-full">
          <div className="flex justify-between text-[10px] text-gray-500 mb-1 px-1">
            <span className="text-rose-400 font-bold">♭ Flat</span>
            <span className={`font-bold transition-colors ${isInTune && detectedNote ? "text-emerald-400" : "text-gray-500"}`}>
              {getCentsLabel() || "In Tune"}
            </span>
            <span className="text-rose-400 font-bold">Sharp ♯</span>
          </div>
          <div className="relative w-full h-3 rounded-full overflow-hidden bg-gradient-to-r from-rose-900/60 via-emerald-800/60 to-rose-900/60">
            {/* In-tune zone highlight */}
            <div className="absolute inset-y-0 left-[45%] w-[10%] bg-emerald-500/20 rounded-full" />
            {/* Moving dot */}
            {detectedNote && (
              <div
                className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full shadow-lg transition-all duration-75 ${
                  isInTune ? "bg-emerald-400 shadow-emerald-400/60" : "bg-amber-400 shadow-amber-400/40"
                }`}
                style={{ left: `${pitchBarPos}%` }}
              />
            )}
          </div>
        </div>

        {/* Mic status */}
        <div className="flex items-center gap-2 text-sm">
          {isListening ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-400 font-medium">Listening…</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-gray-600" />
              <span className="text-gray-500">Microphone off</span>
            </>
          )}
        </div>
      </div>

      {/* ── Error message ── */}
      {error && (
        <div className="w-full max-w-md bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl px-4 py-3 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}

      {/* ── Start / Stop button ── */}
      <button
        onClick={isListening ? stopTuner : startTuner}
        className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm transition-all shadow-lg ${
          isListening
            ? "bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/30"
            : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/30"
        }`}
      >
        {isListening ? <MicOff size={18} /> : <Mic size={18} />}
        {isListening ? "Stop Tuner" : "Start Tuner"}
      </button>

      {/* ── Sensitivity ── */}
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Noise Filter Strictness
          </label>
          <span className="text-xs text-emerald-400 font-mono font-semibold">
            {Math.round(sensitivity * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="0.6"
          max="0.97"
          step="0.01"
          value={sensitivity}
          onChange={e => setSensitivity(parseFloat(e.target.value))}
          className="w-full accent-emerald-500"
        />
        <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
          <span>Relaxed (noisy room)</span>
          <span>Strict (quiet room)</span>
        </div>
      </div>

      {/* ── Tips ── */}
      <div className="w-full max-w-md bg-gray-50 dark:bg-gray-800/50 rounded-xl px-4 py-3 text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <p className="font-semibold text-gray-700 dark:text-gray-300 text-[11px] uppercase tracking-wider mb-1">Tips for best results</p>
        <p>🎸 Hold your instrument <strong>close to your device</strong> mic</p>
        <p>🤫 Pluck <strong>one string at a time</strong> — let it ring clearly</p>
        <p>🔇 If noisy environment, <strong>increase filter strictness</strong></p>
        <p>🎯 Tap a string button to <strong>lock detection</strong> to that string</p>
      </div>
    </div>
  );
}
