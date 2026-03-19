import React, { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, Music, ArrowUpDown, Headphones, Minus, Plus } from "lucide-react";
import { Song, Schedule } from "./types";
import { LineupTrack } from "./LineupPlayer";

// ── Chord transposer (same logic as App.tsx) ─────────────────────────────────
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ENHARMONIC: Record<string, string> = {
    'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
};
function transposeChords(text: string, steps: number): string {
    if (!steps || !text) return text;
    const n = ((steps % 12) + 12) % 12;
    return text.replace(
        /(?<![A-Za-z])([A-G][#b]?)(m(?:aj\d*)?|maj\d*|min\d*|dim\d*|aug\d*|sus[24]?\d*|add\d+|\d+)?(?![a-z])/g,
        (_: string, root: string, quality: string | undefined) => {
            const normalized = ENHARMONIC[root] ?? root;
            const idx = CHROMATIC.indexOf(normalized);
            if (idx === -1) return _;
            return CHROMATIC[(idx + n) % 12] + (quality ?? '');
        }
    );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getNextEventWithLineup(schedules: Schedule[]): Schedule | null {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = schedules
        .filter(s => {
            const d = new Date(s.date + "T00:00:00");
            return d >= today && (s.songLineup?.joyful || s.songLineup?.solemn);
        })
        .sort((a, b) => a.date.localeCompare(b.date));
    return upcoming[0] ?? null;
}

// ── ScrollablePane ────────────────────────────────────────────────────────────
function ScrollablePane({ title, content, accent }: { title: string; content: string; accent: string }) {
    if (!content?.trim()) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 py-16">
                <Music size={32} className="opacity-30" />
                <p className="text-sm">No {title.toLowerCase()} available for this song.</p>
            </div>
        );
    }
    return (
        <div className="h-full overflow-y-auto">
            <div className="sticky top-0 z-10 px-4 py-2 backdrop-blur-md bg-gray-50/80 dark:bg-gray-900/80 border-b border-gray-200 dark:border-gray-800">
                <span className={`text-[11px] font-bold uppercase tracking-widest ${accent}`}>{title}</span>
            </div>
            <pre className="font-mono text-sm leading-7 text-gray-800 dark:text-gray-200 px-4 py-4 whitespace-pre-wrap break-words">
                {content}
            </pre>
        </div>
    );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface RehearsalViewProps {
    allSchedules: Schedule[];
    allSongs: Song[];
    lineupTracks: LineupTrack[];
    onOpenLineup: () => void;
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function RehearsalView({ allSchedules, allSongs, lineupTracks, onOpenLineup }: RehearsalViewProps) {

    // Which song is active: "joyful" or "solemn"
    const [activeSong, setActiveSong] = useState<"joyful" | "solemn">("joyful");

    // Transpose offset per song (joyful / solemn), in semitones
    const [transpose, setTranspose] = useState<{ joyful: number; solemn: number }>({ joyful: 0, solemn: 0 });

    // Mobile row order: 0 = lyrics top, chords bottom | 1 = chords top, lyrics bottom
    const [chordsOnTop, setChordsOnTop] = useState<boolean>(() => {
        try { return localStorage.getItem("wf_rehearsal_row_order") === "chords_top"; } catch { return false; }
    });

    // Swipe gesture tracking
    const touchStartX = useRef<number>(0);
    const touchStartY = useRef<number>(0);

    const songs: ("joyful" | "solemn")[] = [];
    const event = getNextEventWithLineup(allSchedules);
    if (event?.songLineup?.joyful) songs.push("joyful");
    if (event?.songLineup?.solemn) songs.push("solemn");

    const joyfulSong = event?.songLineup?.joyful ? allSongs.find(s => s.id === event.songLineup!.joyful) : null;
    const solemnSong = event?.songLineup?.solemn ? allSongs.find(s => s.id === event.songLineup!.solemn) : null;
    const currentSong = activeSong === "joyful" ? joyfulSong : solemnSong;

    const canPrev = songs.indexOf(activeSong) > 0;
    const canNext = songs.indexOf(activeSong) < songs.length - 1;

    const goNext = useCallback(() => {
        const idx = songs.indexOf(activeSong);
        if (idx < songs.length - 1) setActiveSong(songs[idx + 1]);
    }, [activeSong, songs]);

    const goPrev = useCallback(() => {
        const idx = songs.indexOf(activeSong);
        if (idx > 0) setActiveSong(songs[idx - 1]);
    }, [activeSong, songs]);

    // Touch swipe handler
    const onTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
    };
    const onTouchEnd = (e: React.TouchEvent) => {
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
        if (Math.abs(dx) > 60 && dy < 40) {
            if (dx < 0) goNext(); else goPrev();
        }
    };

    const toggleRowOrder = () => {
        setChordsOnTop(v => {
            const next = !v;
            try { localStorage.setItem("wf_rehearsal_row_order", next ? "chords_top" : "lyrics_top"); } catch { /* noop */ }
            return next;
        });
    };

    const adjustTranspose = (delta: number) => {
        setTranspose(prev => ({ ...prev, [activeSong]: prev[activeSong] + delta }));
    };

    const resetTranspose = () => {
        setTranspose(prev => ({ ...prev, [activeSong]: 0 }));
    };

    const transposedChords = currentSong?.chords
        ? transposeChords(currentSong.chords, transpose[activeSong])
        : "";
    const currentTranspose = transpose[activeSong];

    // ── Empty state ─────────────────────────────────────────────────────────
    if (!event) {
        return (
            <div className="flex flex-col items-center justify-center h-full py-24 gap-4 text-gray-400">
                <div className="w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                    <Music size={28} className="text-indigo-500" />
                </div>
                <div className="text-center">
                    <p className="text-base font-semibold text-gray-600 dark:text-gray-300">No upcoming lineup</p>
                    <p className="text-sm text-gray-400 mt-1">Add a song lineup to an upcoming event in Scheduling to use Rehearsal mode.</p>
                </div>
            </div>
        );
    }

    if (songs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full py-24 gap-3 text-gray-400">
                <Music size={32} className="opacity-30" />
                <p className="text-sm">No songs assigned to the next event's lineup yet.</p>
            </div>
        );
    }

    // ── Song navigator header ────────────────────────────────────────────────
    const songNavBar = (
        <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            {/* Prev */}
            <button
                onClick={goPrev}
                disabled={!canPrev}
                className="p-2 rounded-xl text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                title="Previous song"
            >
                <ChevronLeft size={20} />
            </button>

            {/* Song pills */}
            <div className="flex-1 flex items-center justify-center gap-2 overflow-hidden">
                {songs.map(key => {
                    const song = key === "joyful" ? joyfulSong : solemnSong;
                    const isActive = activeSong === key;
                    return (
                        <button
                            key={key}
                            onClick={() => setActiveSong(key)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all truncate max-w-[180px] ${isActive
                                ? key === "joyful"
                                    ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                                    : "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400"
                                : "text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                            }`}
                        >
                            <span className={`text-xs font-bold uppercase tracking-wider opacity-70 ${isActive ? "" : "hidden sm:inline"}`}>
                                {key === "joyful" ? "🙌" : "🕊️"}
                            </span>
                            <span className="truncate">{song?.title ?? (key === "joyful" ? "Joyful" : "Solemn")}</span>
                        </button>
                    );
                })}
            </div>

            {/* Next */}
            <button
                onClick={goNext}
                disabled={!canNext}
                className="p-2 rounded-xl text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                title="Next song"
            >
                <ChevronRight size={20} />
            </button>

            {/* Listen to Lineup */}
            {lineupTracks.length > 0 && (
                <button
                    onClick={onOpenLineup}
                    className="flex items-center gap-1.5 p-2 rounded-xl text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all"
                    title="Listen to Lineup"
                >
                    <Headphones size={18} />
                </button>
            )}
        </div>
    );

    // ── Transpose controls ───────────────────────────────────────────────────
    const transposeControls = (
        <div className="flex items-center gap-1">
            <button
                onClick={() => adjustTranspose(-1)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all"
                title="Transpose down"
            >
                <Minus size={14} />
            </button>
            <button
                onClick={resetTranspose}
                className={`min-w-[36px] text-center text-xs font-bold rounded-lg px-1.5 py-1 transition-all ${currentTranspose === 0
                    ? "text-gray-400"
                    : "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30"
                }`}
                title="Reset transpose"
            >
                {currentTranspose > 0 ? `+${currentTranspose}` : currentTranspose === 0 ? "0" : currentTranspose}
            </button>
            <button
                onClick={() => adjustTranspose(1)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all"
                title="Transpose up"
            >
                <Plus size={14} />
            </button>
        </div>
    );

    // ── Desktop / Tablet: 2-column layout ───────────────────────────────────
    const desktopLayout = (
        <div
            className="hidden md:flex flex-col h-full"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
        >
            {/* Single shared header row — one border-b, no alignment gap possible */}
            <div className="flex shrink-0 border-b border-gray-200 dark:border-gray-800">
                <div className="w-1/2 flex items-center px-4 py-2">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-rose-500">Lyrics</span>
                </div>
                <div className="w-1/2 flex items-center justify-between px-4 py-2 border-l border-gray-200 dark:border-gray-800">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-500">Chords</span>
                    {transposeControls}
                </div>
            </div>

            {/* Scrollable content — two columns side by side */}
            <div className="flex flex-1 overflow-hidden min-h-0">
                {/* Lyrics */}
                <div className="w-1/2 overflow-y-auto border-r border-gray-200 dark:border-gray-800">
                    {currentSong?.lyrics?.trim() ? (
                        <pre className="font-mono text-sm leading-7 text-gray-800 dark:text-gray-200 px-5 py-4 whitespace-pre-wrap break-words">
                            {currentSong.lyrics}
                        </pre>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
                            <Music size={28} className="opacity-30" />
                            <p className="text-sm">No lyrics available.</p>
                        </div>
                    )}
                </div>

                {/* Chords */}
                <div className="w-1/2 overflow-y-auto">
                    {transposedChords?.trim() ? (
                        <pre className="font-mono text-sm leading-7 text-gray-800 dark:text-gray-200 px-5 py-4 whitespace-pre-wrap break-words">
                            {transposedChords}
                        </pre>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
                            <Music size={28} className="opacity-30" />
                            <p className="text-sm">No chords available.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );



    // ── Mobile: 2-row layout with swap ──────────────────────────────────────
    const mobileRow = (type: "lyrics" | "chords", isTop: boolean) => {
        const isLyrics = type === "lyrics";
        const accent = isLyrics ? "text-rose-500" : "text-indigo-500";
        const label = isLyrics ? "Lyrics" : "Chords";
        const content = isLyrics ? (currentSong?.lyrics ?? "") : transposedChords;

        return (
            <div className="flex flex-col overflow-hidden" style={{ flex: 1 }}>
                <div className="flex items-center justify-between px-4 py-2 shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                    <span className={`text-[11px] font-bold uppercase tracking-widest ${accent}`}>{label}</span>
                    <div className="flex items-center gap-2">
                        {!isLyrics && transposeControls}
                        {/* Row swap icon — only show on top row */}
                        {isTop && (
                            <button
                                onClick={toggleRowOrder}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all"
                                title={chordsOnTop ? "Move chords below lyrics" : "Move chords above lyrics"}
                            >
                                <ArrowUpDown size={15} />
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {content?.trim() ? (
                        <pre className="font-mono text-sm leading-7 text-gray-800 dark:text-gray-200 px-4 py-4 whitespace-pre-wrap break-words">
                            {content}
                        </pre>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400 py-8">
                            <Music size={24} className="opacity-30" />
                            <p className="text-xs">No {label.toLowerCase()} available.</p>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const mobileLayout = (
        <div
            className="flex md:hidden flex-col h-full divide-y divide-gray-200 dark:divide-gray-800"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
        >
            {chordsOnTop ? (
                <>
                    {mobileRow("chords", true)}
                    {mobileRow("lyrics", false)}
                </>
            ) : (
                <>
                    {mobileRow("lyrics", true)}
                    {mobileRow("chords", false)}
                </>
            )}
        </div>
    );

    return (
        <div className="flex flex-col h-full overflow-hidden -m-4 sm:-m-6">
            {/* Event label */}
            <div className="shrink-0 px-4 py-2 bg-indigo-600 dark:bg-indigo-700 text-white">
                <p className="text-xs font-semibold opacity-80 uppercase tracking-wider">
                    🎵 {event.eventName ?? "Worship Service"} &middot;{" "}
                    {new Date(event.date + "T00:00:00").toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}
                </p>
            </div>

            {/* Song navigator */}
            {songNavBar}

            {/* Artist + key info */}
            {currentSong && (
                <div className="shrink-0 px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        <span className="font-semibold text-gray-700 dark:text-gray-200">{currentSong.title}</span>
                        {currentSong.artist && <span> · {currentSong.artist}</span>}
                    </p>
                </div>
            )}

            {/* Content area */}
            <div className="flex-1 overflow-hidden">
                {desktopLayout}
                {mobileLayout}
            </div>
        </div>
    );
}
