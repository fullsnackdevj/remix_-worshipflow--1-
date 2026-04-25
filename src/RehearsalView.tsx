import React, { useState, useEffect, useRef, useCallback } from "react";
import {
    ChevronLeft, ChevronRight, Music, Headphones, BookOpen, Guitar,
    Minus, Plus, Pencil, Check, X, Undo2, Redo2, Loader2, ImagePlus,
    ZoomIn, ZoomOut, Maximize2, Minimize2,
} from "lucide-react";
import { Song, Schedule } from "./types";
import { LineupTrack } from "./LineupPlayer";

// ── Chord transposer ──────────────────────────────────────────────────────────
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


// ── Helpers ───────────────────────────────────────────────────────────────────
/** Returns ALL upcoming events that have at least one song in their lineup, sorted by date. */
function getUpcomingEventsWithLineup(schedules: Schedule[]): Schedule[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return schedules
        .filter(s => {
            const d = new Date(s.date + "T00:00:00");
            return d >= today && (s.songLineup?.joyful || s.songLineup?.solemn);
        })
        .sort((a, b) => a.date.localeCompare(b.date));
}

// ── useEditColumn — per-column edit state with undo/redo stack ────────────────
function useEditColumn(initialValue: string) {
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState(initialValue);
    const [history, setHistory] = useState<string[]>([initialValue]);
    const [historyIdx, setHistoryIdx] = useState(0);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Reset when initialValue changes (song switch)
    useEffect(() => {
        setDraft(initialValue);
        setHistory([initialValue]);
        setHistoryIdx(0);
        setIsEditing(false);
    }, [initialValue]);

    const pushHistory = useCallback((val: string) => {
        setHistory(prev => {
            const base = prev.slice(0, historyIdx + 1);
            return [...base, val];
        });
        setHistoryIdx(prev => prev + 1);
    }, [historyIdx]);

    const onChange = useCallback((val: string) => {
        setDraft(val);
        // Debounce history push — create a new checkpoint every 500ms of inactivity
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => pushHistory(val), 500);
    }, [pushHistory]);

    const undo = useCallback(() => {
        if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
        setHistoryIdx(prev => {
            const next = Math.max(0, prev - 1);
            setDraft(history[next] ?? "");
            return next;
        });
    }, [history]);

    const redo = useCallback(() => {
        setHistoryIdx(prev => {
            const next = Math.min(history.length - 1, prev + 1);
            setDraft(history[next] ?? "");
            return next;
        });
    }, [history]);

    const canUndo = historyIdx > 0;
    const canRedo = historyIdx < history.length - 1;
    const isDirty = draft !== initialValue;

    const startEdit = () => {
        setDraft(initialValue);
        setHistory([initialValue]);
        setHistoryIdx(0);
        setIsEditing(true);
    };

    const cancelEdit = () => {
        setDraft(initialValue);
        setIsEditing(false);
    };

    return { isEditing, draft, onChange, undo, redo, canUndo, canRedo, isDirty, startEdit, cancelEdit, setIsEditing };
}

// ── Confirmation dialog ───────────────────────────────────────────────────────
interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}
function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", danger, onConfirm, onCancel }: ConfirmDialogProps) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="rounded-2xl shadow-2xl max-w-sm w-full p-6"
                style={{ background: "#13151f", border: "1px solid rgba(255,255,255,0.09)" }}>
                <h2 className="text-base font-bold text-white mb-1">{title}</h2>
                <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.5)" }}>{message}</p>
                <div className="flex gap-3 justify-end">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                        style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.09)" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                        style={{
                            background: danger
                                ? "linear-gradient(135deg,#ef4444,#dc2626)"
                                : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                            boxShadow: danger
                                ? "0 4px 12px rgba(239,68,68,0.3)"
                                : "0 4px 12px rgba(99,102,241,0.35)"
                        }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface RehearsalViewProps {
    allSchedules: Schedule[];
    allSongs: Song[];
    lineupTracks: LineupTrack[];
    onOpenLineup: () => void;
    isLineupOpen?: boolean;
    isLibraryOpen?: boolean;
    currentUser?: { displayName?: string | null; photoURL?: string | null } | null;
    canEditSong?: boolean;
    onSongUpdated?: (updatedSong: Song) => void;
    showToast?: (type: string, message: string) => void;
    onFullscreenChange?: (isFullscreen: boolean) => void;
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function RehearsalView({
    allSchedules, allSongs, lineupTracks, onOpenLineup, isLineupOpen = false, isLibraryOpen = false,
    currentUser, canEditSong = false, onSongUpdated, showToast, onFullscreenChange,
}: RehearsalViewProps) {

    const [selectedEventIdx, setSelectedEventIdx] = useState(0);
    const [activeSong, setActiveSong] = useState<"joyful" | "solemn">("joyful");
    const [transpose, setTranspose] = useState<{ joyful: number; solemn: number }>({ joyful: 0, solemn: 0 });
    const [chordsOnTop, setChordsOnTop] = useState<boolean>(() => {
        try { return localStorage.getItem("wf_rehearsal_row_order") === "chords_top"; } catch { return false; }
    });
    // Mobile tab: which panel is shown (Lyrics or Chords)
    const [mobileTab, setMobileTab] = useState<"lyrics" | "chords">("lyrics");
    // Mobile fullscreen overlay — notify parent when it changes so top header can be hidden
    const [mobileFullscreen, setMobileFullscreen] = useState<boolean>(false);
    useEffect(() => { onFullscreenChange?.(mobileFullscreen); }, [mobileFullscreen, onFullscreenChange]);

    // ── Font-size zoom (11 → 24 px, step 1, persisted) ───────────────────────
    const FONT_SIZES = [11, 12, 13, 14, 15, 16, 18, 20, 22, 24];
    const [fontSizeIdx, setFontSizeIdx] = useState<number>(() => {
        try {
            const saved = Number(localStorage.getItem("wf_rehearsal_font_idx"));
            if (!isNaN(saved) && saved >= 0 && saved < FONT_SIZES.length) return saved;
        } catch { /* noop */ }
        return 3; // default → 14px
    });
    const fontSize = FONT_SIZES[fontSizeIdx];

    const zoomIn  = () => setFontSizeIdx(prev => { const next = Math.min(FONT_SIZES.length - 1, prev + 1); try { localStorage.setItem("wf_rehearsal_font_idx", String(next)); } catch { /* noop */ } return next; });
    const zoomOut = () => setFontSizeIdx(prev => { const next = Math.max(0, prev - 1); try { localStorage.setItem("wf_rehearsal_font_idx", String(next)); } catch { /* noop */ } return next; });

    const zoomControls = (
        <div className="flex items-center gap-1">
            <button onClick={zoomOut} disabled={fontSizeIdx === 0} title="Decrease text size"
                className="w-9 h-9 md:w-7 md:h-7 flex items-center justify-center rounded-xl md:rounded-lg disabled:opacity-20 disabled:cursor-not-allowed transition-all active:scale-95"
                style={{ color: "rgba(255,255,255,0.4)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "rgba(99,102,241,0.9)")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
                <ZoomOut size={18} className="md:hidden" />
                <ZoomOut size={14} className="hidden md:block" />
            </button>
            <span className="min-w-[36px] md:min-w-[28px] text-center text-xs md:text-[10px] font-bold tabular-nums select-none"
                style={{ color: "rgba(255,255,255,0.35)" }}>{fontSize}px</span>
            <button onClick={zoomIn} disabled={fontSizeIdx === FONT_SIZES.length - 1} title="Increase text size"
                className="w-9 h-9 md:w-7 md:h-7 flex items-center justify-center rounded-xl md:rounded-lg disabled:opacity-20 disabled:cursor-not-allowed transition-all active:scale-95"
                style={{ color: "rgba(255,255,255,0.4)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "rgba(99,102,241,0.9)")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
                <ZoomIn size={18} className="md:hidden" />
                <ZoomIn size={14} className="hidden md:block" />
            </button>
        </div>
    );

    // Swipe gesture tracking
    const touchStartX = useRef<number>(0);
    const touchStartY = useRef<number>(0);

    // OCR screenshot upload
    const ocrFileRef = useRef<HTMLInputElement>(null);
    const ocrColRef = useRef<"lyrics" | "chords">("chords"); // tracks which column triggered the upload
    const [isOcrLoading, setIsOcrLoading] = useState(false);

    const handleOcrUpload = async (file: File) => {
        if (!file) return;
        setIsOcrLoading(true);
        try {
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve, reject) => {
                reader.onload = () => {
                    const result = reader.result as string;
                    resolve(result.split(",")[1] ?? "");
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            const res = await fetch("/api/ocr", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ base64Data: base64, mimeType: file.type, type: ocrColRef.current }),
            });
            if (!res.ok) throw new Error("OCR failed");
            const { text } = await res.json();
            // Route to the correct column
            if (ocrColRef.current === "lyrics") lyricsEdit.onChange(text ?? "");
            else chordsEdit.onChange(text ?? "");
            showToast?.("success", `${ocrColRef.current === "lyrics" ? "Lyrics" : "Chords"} extracted from image!`);
        } catch {
            showToast?.("error", "Could not extract text from image. Try a clearer photo.");
        } finally {
            setIsOcrLoading(false);
            if (ocrFileRef.current) ocrFileRef.current.value = "";
        }
    };

    const upcomingEvents = getUpcomingEventsWithLineup(allSchedules);
    // Clamp selectedEventIdx so it's never out-of-range after a data refresh
    const clampedEventIdx = Math.min(selectedEventIdx, Math.max(0, upcomingEvents.length - 1));
    const event = upcomingEvents[clampedEventIdx] ?? null;

    const songs: ("joyful" | "solemn")[] = [];
    if (event?.songLineup?.joyful) songs.push("joyful");
    if (event?.songLineup?.solemn) songs.push("solemn");

    // ── Fix: if activeSong ("joyful") isn't available for this event (e.g. Midweek
    // only has "solemn"), fall back to the first song the event actually has.
    // This prevents showing "No lyrics/chords" on first load without any tab navigation.
    const safeActiveSong: "joyful" | "solemn" = songs.includes(activeSong)
        ? activeSong
        : (songs[0] ?? "joyful");

    const joyfulSong = event?.songLineup?.joyful ? allSongs.find(s => s.id === event.songLineup!.joyful) : null;
    const solemnSong = event?.songLineup?.solemn ? allSongs.find(s => s.id === event.songLineup!.solemn) : null;
    const currentSong = safeActiveSong === "joyful" ? joyfulSong : solemnSong;

    const canPrev = songs.indexOf(safeActiveSong) > 0;
    const canNext = songs.indexOf(safeActiveSong) < songs.length - 1;

    const goNext = useCallback(() => {
        const idx = songs.indexOf(safeActiveSong);
        if (idx < songs.length - 1) setActiveSong(songs[idx + 1]);
    }, [safeActiveSong, songs]);

    const goPrev = useCallback(() => {
        const idx = songs.indexOf(safeActiveSong);
        if (idx > 0) setActiveSong(songs[idx - 1]);
    }, [safeActiveSong, songs]);

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
        setTranspose(prev => ({ ...prev, [safeActiveSong]: prev[safeActiveSong] + delta }));
    };
    const resetTranspose = () => {
        setTranspose(prev => ({ ...prev, [safeActiveSong]: 0 }));
    };

    const transposedChords = currentSong?.chords
        ? transposeChords(currentSong.chords, transpose[safeActiveSong])
        : "";
    const currentTranspose = transpose[safeActiveSong];

    // ── Per-column edit state ─────────────────────────────────────────────────
    const lyricsEdit = useEditColumn(currentSong?.lyrics ?? "");
    const chordsEdit = useEditColumn(currentSong?.chords ?? "");

    // Saving state
    const [isSavingLyrics, setIsSavingLyrics] = useState(false);
    const [isSavingChords, setIsSavingChords] = useState(false);

    // Dialogs
    const [confirmSave, setConfirmSave] = useState<"lyrics" | "chords" | null>(null);
    const [confirmDiscard, setConfirmDiscard] = useState<"lyrics" | "chords" | null>(null);

    // Request to exit edit — show discard dialog if dirty, else exit immediately
    const requestExitEdit = (col: "lyrics" | "chords") => {
        const edit = col === "lyrics" ? lyricsEdit : chordsEdit;
        if (edit.isDirty) {
            setConfirmDiscard(col);
        } else {
            edit.cancelEdit();
        }
    };

    // Attempt save — show confirm dialog first
    const requestSave = (col: "lyrics" | "chords") => {
        setConfirmSave(col);
    };

    // Actually perform the save after confirmation
    const performSave = async (col: "lyrics" | "chords") => {
        if (!currentSong) return;
        const edit = col === "lyrics" ? lyricsEdit : chordsEdit;
        const setIsSaving = col === "lyrics" ? setIsSavingLyrics : setIsSavingChords;
        const label = col === "lyrics" ? "Lyrics" : "Chords";

        setConfirmSave(null);
        setIsSaving(true);
        try {
            // Use PATCH — partial update, only the edited field.
            // No need to send tags/title/artist — the server only touches what's provided.
            const payload: Record<string, string> = {
                [col]: edit.draft,
                actorName: currentUser?.displayName ?? "Rehearsal Edit",
                actorPhoto: currentUser?.photoURL ?? "",
            };

            const res = await fetch(`/api/songs/${currentSong.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error ?? "Failed to save");
            }

            // Reflect changes locally immediately
            const updatedSong: Song = {
                ...currentSong,
                lyrics: col === "lyrics" ? edit.draft : (currentSong.lyrics ?? ""),
                chords: col === "chords" ? edit.draft : (currentSong.chords ?? ""),
                updated_at: new Date().toISOString(),
                updated_by_name: currentUser?.displayName ?? undefined,
                updated_by_photo: currentUser?.photoURL ?? undefined,
            };
            onSongUpdated?.(updatedSong);
            edit.setIsEditing(false);
            showToast?.("success", `${label} saved for "${currentSong.title}"`);
        } catch (err: any) {
            showToast?.("error", `Save failed: ${err.message}`);
        } finally {
            setIsSaving(false);
        }
    };


    // ── Edit toolbar for a column ─────────────────────────────────────────────
    const editToolbar = (col: "lyrics" | "chords") => {
        const edit = col === "lyrics" ? lyricsEdit : chordsEdit;
        const isSaving = col === "lyrics" ? isSavingLyrics : isSavingChords;
        const label = col === "lyrics" ? "Lyrics" : "Chords";
        const accentColor = col === "lyrics" ? "rgba(244,63,94,0.9)" : "rgba(168,85,247,0.9)";

        const iconBtn = (icon: React.ReactNode, onClick: () => void, disabled: boolean, title: string, danger = false) => (
            <button
                onClick={onClick}
                disabled={disabled}
                title={title}
                className="w-10 h-10 md:w-7 md:h-7 flex items-center justify-center rounded-xl md:rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
                style={{ color: danger ? "rgba(239,68,68,0.7)" : "rgba(255,255,255,0.4)" }}
                onMouseEnter={e => { if (!disabled) e.currentTarget.style.color = danger ? "rgba(239,68,68,1)" : accentColor; }}
                onMouseLeave={e => { e.currentTarget.style.color = danger ? "rgba(239,68,68,0.7)" : "rgba(255,255,255,0.4)"; }}
            >
                {icon}
            </button>
        );

        return (
            <div className="flex items-center gap-1">
                {iconBtn(<><Undo2 size={18} className="md:hidden" /><Undo2 size={13} className="hidden md:block" /></>, edit.undo, !edit.canUndo, "Undo")}
                {iconBtn(<><Redo2 size={18} className="md:hidden" /><Redo2 size={13} className="hidden md:block" /></>, edit.redo, !edit.canRedo, "Redo")}
                <div className="w-px h-5 mx-1" style={{ background: "rgba(255,255,255,0.09)" }} />
                {iconBtn(
                    isOcrLoading
                        ? <><Loader2 size={18} className="animate-spin md:hidden" /><Loader2 size={13} className="animate-spin hidden md:block" /></>
                        : <><ImagePlus size={18} className="md:hidden" /><ImagePlus size={13} className="hidden md:block" /></>,
                    () => { ocrColRef.current = col; ocrFileRef.current?.click(); },
                    isOcrLoading,
                    "Upload a screenshot — AI will extract the text"
                )}
                <div className="w-px h-5 mx-1" style={{ background: "rgba(255,255,255,0.09)" }} />
                {iconBtn(
                    isSaving
                        ? <><Loader2 size={18} className="animate-spin md:hidden" /><Loader2 size={13} className="animate-spin hidden md:block" /></>
                        : <><Check size={18} className="md:hidden" /><Check size={13} className="hidden md:block" /></>,
                    () => requestSave(col),
                    !edit.isDirty || isSaving,
                    `Save ${label}`
                )}
                {iconBtn(<><X size={18} className="md:hidden" /><X size={13} className="hidden md:block" /></>, () => requestExitEdit(col), false, "Cancel editing", true)}
            </div>
        );
    };

    // Pencil button — shown when NOT editing (if user has permission)
    const pencilBtn = (col: "lyrics" | "chords") => {
        if (!canEditSong || !currentSong) return null;
        const edit = col === "lyrics" ? lyricsEdit : chordsEdit;
        if (edit.isEditing) return null;
        return (
            <button
                onClick={edit.startEdit}
                title={`Edit ${col}`}
                className="w-10 h-10 md:w-7 md:h-7 flex items-center justify-center rounded-xl md:rounded-lg transition-all active:scale-95"
                style={{ color: "rgba(255,255,255,0.3)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "rgba(99,102,241,0.9)")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
            >
                <Pencil size={18} className="md:hidden" />
                <Pencil size={13} className="hidden md:block" />
            </button>
        );
    };

    // ── Transpose controls ────────────────────────────────────────────────────
    const transposeControls = (
        <div className="flex items-center gap-1">
            <button onClick={() => adjustTranspose(-1)}
                className="w-10 h-10 md:w-7 md:h-7 flex items-center justify-center rounded-xl md:rounded-lg transition-all active:scale-95"
                style={{ color: "rgba(168,85,247,0.8)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "rgba(192,132,252,1)")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(168,85,247,0.8)")}
                title="Transpose down">
                <Minus size={18} className="md:hidden" />
                <Minus size={14} className="hidden md:block" />
            </button>
            <button
                onClick={resetTranspose}
                className="min-w-[36px] text-center text-xs font-bold rounded-lg px-1.5 py-1 transition-all"
                style={currentTranspose === 0 ? {
                    color: "rgba(255,255,255,0.3)"
                } : {
                    color: "rgba(192,132,252,0.95)",
                    background: "rgba(168,85,247,0.18)",
                }}
                title="Reset transpose"
            >
                {currentTranspose > 0 ? `+${currentTranspose}` : currentTranspose === 0 ? "0" : currentTranspose}
            </button>
            <button onClick={() => adjustTranspose(1)}
                className="p-1.5 rounded-lg transition-all"
                style={{ color: "rgba(168,85,247,0.8)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "rgba(192,132,252,1)")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(168,85,247,0.8)")}
                title="Transpose up">
                <Plus size={14} />
            </button>
        </div>
    );

    // ── Empty states ──────────────────────────────────────────────────────────
    if (upcomingEvents.length === 0) {
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
                <p className="text-sm">No songs assigned to the selected event's lineup yet.</p>
            </div>
        );
    }

    // ── Event picker (only when multiple events have lineups) ─────────────────
    const eventPickerBar = upcomingEvents.length > 1 ? (
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-2 overflow-x-auto no-scrollbar"
            style={{ background: "#0e1018", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="text-[10px] font-bold uppercase tracking-widest shrink-0 mr-1" style={{ color: "rgba(255,255,255,0.3)" }}>Event:</span>
            {upcomingEvents.map((ev, idx) => {
                const evName = (ev as any).eventName || (ev.serviceType === "sunday" ? "Sunday Service" : "Midweek Service");
                const dateLabel = new Date(ev.date + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric" });
                const songCount = [ev.songLineup?.joyful, ev.songLineup?.solemn].filter(Boolean).length;
                const isActive = idx === clampedEventIdx;
                return (
                    <button
                        key={ev.id ?? idx}
                        onClick={() => { setSelectedEventIdx(idx); setActiveSong(ev.songLineup?.joyful ? "joyful" : "solemn"); }}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0"
                        style={isActive ? {
                            background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                            color: "#fff",
                        } : {
                            background: "rgba(255,255,255,0.05)",
                            color: "rgba(255,255,255,0.45)",
                            border: "1px solid rgba(255,255,255,0.08)",
                        }}
                    >
                        <span>{evName}</span>
                        <span className="text-[10px] px-1 py-0.5 rounded-full font-bold"
                            style={{ background: isActive ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)", color: isActive ? "#fff" : "rgba(255,255,255,0.4)" }}
                        >{songCount}</span>
                        <span className="text-[10px] opacity-70">{dateLabel}</span>
                    </button>
                );
            })}
        </div>
    ) : null;

    // ── Song navigator header ─────────────────────────────────────────────────
    const songNavBar = (
        <div className="shrink-0 flex items-center gap-2 px-4 py-3"
            style={{ background: "#13151f", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <button onClick={goPrev} disabled={!canPrev}
                className="p-2 rounded-xl transition-all disabled:opacity-20 disabled:cursor-not-allowed active:scale-95"
                style={{ color: "rgba(255,255,255,0.4)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "rgba(99,102,241,0.9)")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}
                title="Previous song">
                <ChevronLeft size={20} />
            </button>

            <div className="flex-1 flex items-center justify-center gap-2 overflow-hidden">
                {songs.map(key => {
                    const song = key === "joyful" ? joyfulSong : solemnSong;
                    const isActive = safeActiveSong === key;
                    return (
                        <button
                            key={key}
                            onClick={() => setActiveSong(key)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all truncate max-w-[180px]"
                            style={isActive ? {
                                background: key === "joyful" ? "rgba(16,185,129,0.18)" : "rgba(99,102,241,0.18)",
                                color: key === "joyful" ? "rgba(52,211,153,0.95)" : "rgba(129,140,248,0.95)",
                            } : {
                                color: "rgba(255,255,255,0.35)",
                            }}
                        >
                            <span className={`text-xs font-bold uppercase tracking-wider opacity-70 ${isActive ? "" : "hidden sm:inline"}`}>
                                {key === "joyful" ? "🙌" : "🕊️"}
                            </span>
                            <span className="truncate">{song?.title ?? (key === "joyful" ? "Joyful" : "Solemn")}</span>
                        </button>
                    );
                })}
            </div>

            <button onClick={goNext} disabled={!canNext}
                className="p-2 rounded-xl transition-all disabled:opacity-20 disabled:cursor-not-allowed active:scale-95"
                style={{ color: "rgba(255,255,255,0.4)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "rgba(99,102,241,0.9)")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}
                title="Next song">
                <ChevronRight size={20} />
            </button>

            {lineupTracks.length > 0 && (
                <div className="relative group">
                    {!isLineupOpen && !isLibraryOpen && <span className="absolute inset-0 rounded-full bg-indigo-500/30 animate-ping" />}
                    <button
                        onClick={isLineupOpen || isLibraryOpen ? undefined : onOpenLineup}
                        disabled={isLineupOpen || isLibraryOpen}
                        className={`relative w-9 h-9 flex items-center justify-center rounded-full transition-transform ${
                            isLineupOpen || isLibraryOpen
                                ? "cursor-not-allowed"
                                : "shadow-lg hover:scale-110 active:scale-95"
                        }`}
                        style={isLineupOpen || isLibraryOpen ? {
                            background: "rgba(255,255,255,0.08)",
                            color: "rgba(255,255,255,0.3)",
                        } : {
                            background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                            color: "#fff",
                        }}
                    >
                        <Headphones size={15} />
                    </button>
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-xl">
                        {isLineupOpen ? "Now Playing" : isLibraryOpen ? "Close Library Player first" : "Lineup Available"}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                    </div>
                </div>
            )}
        </div>
    );

    // ── Column content renderer (read or edit) ────────────────────────────────
    const columnContent = (col: "lyrics" | "chords") => {
        const edit = col === "lyrics" ? lyricsEdit : chordsEdit;
        const readValue = col === "lyrics" ? (currentSong?.lyrics ?? "") : transposedChords;
        const noContentMsg = col === "lyrics" ? "No lyrics available." : "No chords available.";

        if (edit.isEditing) {
            return (
                <textarea
                    autoFocus
                    className="w-full min-h-[60vh] font-mono leading-[1.75] resize-none px-5 py-4 outline-none transition-colors"
                    style={{ fontSize, background: "rgba(255,255,255,0.02)", color: "rgba(255,255,255,0.85)", caretColor: col === "lyrics" ? "#f43f5e" : "#6366f1" }}
                    value={edit.draft}
                    onChange={e => edit.onChange(e.target.value)}
                    spellCheck={false}
                    placeholder={`Enter ${col} here…`}
                />
            );
        }

        if (readValue?.trim()) {
            return (
                <pre
                    className="font-mono leading-[1.75] px-5 py-4 whitespace-pre-wrap break-words overflow-x-hidden w-full transition-[font-size] duration-150"
                    style={{ fontSize, color: "rgba(255,255,255,0.82)" }}
                >
                    {readValue}
                </pre>
            );
        }

        return (
            <div className="flex flex-col items-center justify-center py-16 gap-2" style={{ color: "rgba(255,255,255,0.25)" }}>
                <Music size={28} className="opacity-30" />
                <p className="text-sm">{noContentMsg}</p>
            </div>
        );
    };

    // ── Desktop layout ────────────────────────────────────────────────────────
    const desktopLayout = (
        <div
            className="hidden md:flex flex-col h-full"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
        >
            {/* Single shared header row */}
            <div className="flex items-center shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                {/* Lyrics header */}
                <div className="flex-1 flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: "rgba(244,63,94,0.9)", boxShadow: "0 0 6px rgba(244,63,94,0.6)" }} />
                        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "rgba(244,63,94,0.9)" }}>Lyrics</span>
                        {!lyricsEdit.isEditing && !chordsEdit.isEditing && zoomControls}
                    </div>
                    <div className="flex items-center gap-1">
                        {lyricsEdit.isEditing ? editToolbar("lyrics") : pencilBtn("lyrics")}
                    </div>
                </div>
                {/* Vertical divider */}
                <div className="w-px self-stretch shrink-0" style={{ background: "rgba(255,255,255,0.07)" }} />
                {/* Chords header */}
                <div className="flex-1 flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: "rgba(99,102,241,0.9)", boxShadow: "0 0 6px rgba(99,102,241,0.6)" }} />
                        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "rgba(99,102,241,0.9)" }}>Chords</span>
                    </div>
                    <div className="flex items-center gap-1">
                        {chordsEdit.isEditing ? editToolbar("chords") : (
                            <div className="flex items-center gap-1">
                                {pencilBtn("chords")}
                                {!chordsEdit.isEditing && transposeControls}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Scrollable content */}
            <div className="flex flex-1 min-h-0 overflow-hidden">
                <div className={`flex-1 flex flex-col ${lyricsEdit.isEditing ? "overflow-hidden" : "overflow-y-auto"}`}>
                    {columnContent("lyrics")}
                </div>
                {/* Vertical divider */}
                <div className="w-px shrink-0" style={{ background: "rgba(255,255,255,0.07)" }} />
                <div className={`flex-1 flex flex-col ${chordsEdit.isEditing ? "overflow-hidden" : "overflow-y-auto"}`}>
                    {columnContent("chords")}
                </div>
            </div>
        </div>
    );

    // ── Mobile: tab-switcher layout (Lyrics / Chords) ─────────────────────────
    const mobileLayout = (
        <div
            className="flex md:hidden flex-col h-full overflow-hidden"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
        >
            {/* ── Tab bar ── */}
            <div className="shrink-0 flex items-center gap-2 px-3 py-2" style={{ background: "#13151f", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex flex-1 rounded-2xl p-1 gap-1" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <button
                        onClick={() => setMobileTab("lyrics")}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all active:scale-95`}
                        style={mobileTab === "lyrics" ? { background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff" } : { color: "rgba(255,255,255,0.4)" }}
                    >
                        <BookOpen size={16} />
                        Lyrics
                    </button>
                    <button
                        onClick={() => setMobileTab("chords")}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all active:scale-95`}
                        style={mobileTab === "chords" ? { background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff" } : { color: "rgba(255,255,255,0.4)" }}
                    >
                        <Guitar size={16} />
                        Chords
                    </button>
                </div>
            </div>

            {/* ── Panel header with controls ── */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2" style={{ background: "#13151f", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full"
                        style={{ background: mobileTab === "lyrics" ? "rgba(244,63,94,0.9)" : "rgba(99,102,241,0.9)",
                                 boxShadow: mobileTab === "lyrics" ? "0 0 6px rgba(244,63,94,0.5)" : "0 0 6px rgba(99,102,241,0.5)" }} />
                    <span className="text-[11px] font-bold uppercase tracking-widest"
                        style={{ color: mobileTab === "lyrics" ? "rgba(251,113,133,0.9)" : "rgba(129,140,248,0.9)" }}>
                        {mobileTab === "lyrics" ? "Lyrics" : "Chords"}
                    </span>
                    {!(mobileTab === "lyrics" ? lyricsEdit : chordsEdit).isEditing && zoomControls}
                </div>
                <div className="flex items-center gap-1">
                    {(mobileTab === "lyrics" ? lyricsEdit : chordsEdit).isEditing
                        ? editToolbar(mobileTab)
                        : (
                            <>
                                {mobileTab === "chords" && transposeControls}
                                {pencilBtn(mobileTab)}
                                <button
                                    onClick={() => setMobileFullscreen(true)}
                                    title="Full screen"
                                    className="w-10 h-10 flex items-center justify-center rounded-xl transition-all active:scale-95"
                                    style={{ color: "rgba(255,255,255,0.35)" }}
                                    onMouseEnter={e => (e.currentTarget.style.color = "rgba(99,102,241,0.9)")}
                                    onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}>
                                    <Maximize2 size={18} />
                                </button>
                            </>
                        )
                    }
                </div>
            </div>

            {/* ── Scrollable content ── */}
            <div className="flex-1 overflow-y-auto min-h-0">
                {columnContent(mobileTab)}
            </div>
        </div>
    );

    // ── Mobile fullscreen overlay ───────────────────────────────────────────
    // Covers the full viewport (z-50) when mobileFullscreen is true.
    const fullscreenOverlay = mobileFullscreen ? (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-gray-950"
            style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>

            {/* Song title row */}
            {currentSong && (
                <div className="shrink-0 px-4 py-2.5 bg-gray-900 border-b border-gray-800/60 flex items-center justify-center">
                    <p className="text-sm font-bold text-white text-center truncate">
                        {currentSong.title}
                        <span className="ml-1.5 text-xs font-medium text-gray-400">
                            ({safeActiveSong === "joyful" ? "Joyful" : "Solemn"})
                        </span>
                    </p>
                </div>
            )}

            {/* Overlay controls */}
            <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
                <div className="flex items-center gap-3">
                    <span className={`text-[11px] font-bold uppercase tracking-widest ${
                        mobileTab === "lyrics" ? "text-rose-400" : "text-indigo-400"
                    }`}>
                        {mobileTab === "lyrics" ? "Lyrics" : "Chords"}
                    </span>
                    {/* Zoom controls */}
                    {zoomControls}
                </div>
                <div className="flex items-center gap-1">
                    {/* Transpose (chords only) */}
                    {mobileTab === "chords" && transposeControls}
                    {/* Collapse button */}
                    <button
                        onClick={() => setMobileFullscreen(false)}
                        title="Exit full screen"
                        className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-400 hover:text-white hover:bg-gray-700 transition-all active:scale-95 ml-1"
                    >
                        <Minimize2 size={20} />
                    </button>
                </div>
            </div>

            {/* Scrollable content — with floating carousel arrows */}
            <div className="flex-1 relative overflow-hidden min-h-0">
                {/* ‹ Left carousel arrow */}
                {canPrev && (
                    <button
                        onClick={goPrev}
                        title="Previous song"
                        className="absolute left-5 top-1/2 -translate-y-1/2 z-10 w-12 h-12 flex items-center justify-center rounded-full transition-all active:scale-90"
                        style={{
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            color: "rgba(255,255,255,0.28)",
                        }}
                    >
                        <ChevronLeft size={26} />
                    </button>
                )}

                {/* › Right carousel arrow */}
                {canNext && (
                    <button
                        onClick={goNext}
                        title="Next song"
                        className="absolute right-5 top-1/2 -translate-y-1/2 z-10 w-12 h-12 flex items-center justify-center rounded-full transition-all active:scale-90"
                        style={{
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            color: "rgba(255,255,255,0.28)",
                        }}
                    >
                        <ChevronRight size={26} />
                    </button>
                )}

                {/* Scrollable text — padded so text doesn't go under arrows */}
                <div className="h-full overflow-y-auto">
                    <pre
                        className="font-mono leading-[1.9] text-white px-16 py-6 whitespace-pre-wrap break-words overflow-x-hidden w-full transition-[font-size] duration-150"
                        style={{ fontSize }}
                    >
                        {mobileTab === "lyrics"
                            ? (currentSong?.lyrics?.trim() ? currentSong.lyrics : "No lyrics available.")
                            : (transposedChords?.trim() ? transposedChords : "No chords available.")
                        }
                    </pre>
                </div>
            </div>

            {/* Bottom tab switcher */}
            <div className="shrink-0 flex gap-1 px-3 py-2 bg-gray-900 border-t border-gray-800">
                <button
                    onClick={() => setMobileTab("lyrics")}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                        mobileTab === "lyrics" ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-200 hover:bg-gray-800"
                    }`}>
                    <BookOpen size={16} /> Lyrics
                </button>
                <button
                    onClick={() => setMobileTab("chords")}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                        mobileTab === "chords" ? "bg-purple-600 text-white" : "text-gray-500 hover:text-gray-200 hover:bg-gray-800"
                    }`}>
                    <Guitar size={16} /> Chords
                </button>
            </div>
        </div>
    ) : null;

    return (
        <div className="flex flex-col h-full overflow-hidden -m-4 sm:-m-6">
            {/* Event label banner */}
            <div className="shrink-0 px-4 py-2.5" style={{ background: "linear-gradient(90deg,#6366f1,#7c3aed)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <p className="text-xs font-semibold uppercase tracking-wider text-white/80">
                    🎵 {(event as any).eventName ?? "Worship Service"} &middot;{" "}
                    {new Date(event.date + "T00:00:00").toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}
                    {upcomingEvents.length > 1 && (
                        <span className="ml-2 opacity-70">· {clampedEventIdx + 1} of {upcomingEvents.length} events</span>
                    )}
                </p>
            </div>

            {/* Event picker */}
            {eventPickerBar}

            {/* Song navigator */}
            {songNavBar}

            {/* Artist + key info */}
            {currentSong && (
                <div className="shrink-0 px-4 py-2" style={{ background: "#0e1018", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
                        <span className="font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>{currentSong.title}</span>
                        {currentSong.artist && <span> · {currentSong.artist}</span>}
                        {(currentSong.updated_by_name) && (
                            <span className="ml-2" style={{ color: "rgba(255,255,255,0.35)" }}>
                                · last edited by <span style={{ color: "rgba(129,140,248,0.85)" }} className="font-medium">{currentSong.updated_by_name}</span>
                            </span>
                        )}
                    </p>
                </div>
            )}

            {/* Content area */}
            <div className="flex-1 overflow-hidden min-h-0">
                {desktopLayout}
                {mobileLayout}
            </div>

            {/* Mobile fullscreen overlay — rendered above everything else */}
            {fullscreenOverlay}

            {/* ── Dialogs ─── */}

            {/* Save confirmation */}
            <ConfirmDialog
                open={confirmSave !== null}
                title={`Save ${confirmSave === "lyrics" ? "Lyrics" : "Chords"}`}
                message={`Save changes to "${currentSong?.title}"? This will update the ${confirmSave} for this song across the entire app.`}
                confirmLabel="Save"
                cancelLabel="Keep Editing"
                onConfirm={() => confirmSave && performSave(confirmSave)}
                onCancel={() => setConfirmSave(null)}
            />

            {/* Discard confirmation */}
            <ConfirmDialog
                open={confirmDiscard !== null}
                title="Discard changes?"
                message="You have unsaved changes. Are you sure you want to discard them?"
                confirmLabel="Discard"
                cancelLabel="Keep Editing"
                danger
                onConfirm={() => {
                    if (confirmDiscard === "lyrics") lyricsEdit.cancelEdit();
                    else chordsEdit.cancelEdit();
                    setConfirmDiscard(null);
                }}
                onCancel={() => setConfirmDiscard(null)}
            />
            {/* Hidden input for OCR chord screenshot upload */}
            <input
                ref={ocrFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleOcrUpload(f); }}
            />
        </div>

    );
}
