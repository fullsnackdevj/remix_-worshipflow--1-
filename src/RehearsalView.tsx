import React, { useState, useEffect, useRef, useCallback } from "react";
import {
    ChevronLeft, ChevronRight, Music, ArrowUpDown, Headphones,
    Minus, Plus, Pencil, Check, X, Undo2, Redo2, Loader2, ImagePlus
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
        <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-gray-200 dark:border-gray-700">
                <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1">{title}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">{message}</p>
                <div className="flex gap-3 justify-end">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors ${danger
                            ? "bg-red-500 hover:bg-red-600"
                            : "bg-indigo-600 hover:bg-indigo-700"
                        }`}
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
    currentUser?: { displayName?: string | null; photoURL?: string | null } | null;
    canEditSong?: boolean;
    onSongUpdated?: (updatedSong: Song) => void;
    showToast?: (type: string, message: string) => void;
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function RehearsalView({
    allSchedules, allSongs, lineupTracks, onOpenLineup,
    currentUser, canEditSong = false, onSongUpdated, showToast,
}: RehearsalViewProps) {

    const [activeSong, setActiveSong] = useState<"joyful" | "solemn">("joyful");
    const [transpose, setTranspose] = useState<{ joyful: number; solemn: number }>({ joyful: 0, solemn: 0 });
    const [chordsOnTop, setChordsOnTop] = useState<boolean>(() => {
        try { return localStorage.getItem("wf_rehearsal_row_order") === "chords_top"; } catch { return false; }
    });

    // Swipe gesture tracking
    const touchStartX = useRef<number>(0);
    const touchStartY = useRef<number>(0);

    // OCR screenshot upload
    const ocrFileRef = useRef<HTMLInputElement>(null);
    const [isOcrLoading, setIsOcrLoading] = useState(false);

    const handleOcrUpload = async (file: File) => {
        if (!file) return;
        setIsOcrLoading(true);
        try {
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve, reject) => {
                reader.onload = () => {
                    const result = reader.result as string;
                    // Strip the data:image/...;base64, prefix
                    resolve(result.split(",")[1] ?? "");
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            const res = await fetch("/api/ocr", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ base64Data: base64, mimeType: file.type, type: "chords" }),
            });
            if (!res.ok) throw new Error("OCR failed");
            const { text } = await res.json();
            chordsEdit.onChange(text ?? "");
            showToast?.("success", "Chords extracted from image!");
        } catch {
            showToast?.("error", "Could not extract chords from image. Try a clearer photo.");
        } finally {
            setIsOcrLoading(false);
            // Reset input so the same file can be re-selected
            if (ocrFileRef.current) ocrFileRef.current.value = "";
        }
    };


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
        const accent = col === "lyrics" ? "text-rose-500" : "text-indigo-500";
        const label = col === "lyrics" ? "Lyrics" : "Chords";

        return (
            <div className="flex items-center gap-0.5">
                {/* Undo */}
                <button
                    onClick={edit.undo}
                    disabled={!edit.canUndo}
                    title="Undo"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                    <Undo2 size={13} />
                </button>
                {/* Redo */}
                <button
                    onClick={edit.redo}
                    disabled={!edit.canRedo}
                    title="Redo"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                    <Redo2 size={13} />
                </button>

                {/* Divider */}
                <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />

                {/* Screenshot / OCR — chords column only */}
                {col === "chords" && (
                    <button
                        onClick={() => ocrFileRef.current?.click()}
                        disabled={isOcrLoading}
                        title="Upload a chord sheet screenshot (AI will extract the chords)"
                        className="p-1.5 rounded-lg text-violet-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                        {isOcrLoading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                    </button>
                )}

                {/* Divider */}
                <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />

                {/* Save */}
                <button
                    onClick={() => requestSave(col)}
                    disabled={!edit.isDirty || isSaving}
                    title={`Save ${label}`}
                    className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                    {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                </button>

                {/* Cancel edit */}
                <button
                    onClick={() => requestExitEdit(col)}
                    title="Cancel editing"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                >
                    <X size={13} />
                </button>
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
                className="p-1.5 rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all"
            >
                <Pencil size={13} />
            </button>
        );
    };

    // ── Transpose controls ────────────────────────────────────────────────────
    const transposeControls = (
        <div className="flex items-center gap-1">
            <button onClick={() => adjustTranspose(-1)} className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all" title="Transpose down">
                <Minus size={14} />
            </button>
            <button
                onClick={resetTranspose}
                className={`min-w-[36px] text-center text-xs font-bold rounded-lg px-1.5 py-1 transition-all ${currentTranspose === 0 ? "text-gray-400" : "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30"}`}
                title="Reset transpose"
            >
                {currentTranspose > 0 ? `+${currentTranspose}` : currentTranspose === 0 ? "0" : currentTranspose}
            </button>
            <button onClick={() => adjustTranspose(1)} className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all" title="Transpose up">
                <Plus size={14} />
            </button>
        </div>
    );

    // ── Empty states ──────────────────────────────────────────────────────────
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

    // ── Song navigator header ─────────────────────────────────────────────────
    const songNavBar = (
        <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <button onClick={goPrev} disabled={!canPrev}
                className="p-2 rounded-xl text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-20 disabled:cursor-not-allowed transition-all" title="Previous song">
                <ChevronLeft size={20} />
            </button>

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

            <button onClick={goNext} disabled={!canNext}
                className="p-2 rounded-xl text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-20 disabled:cursor-not-allowed transition-all" title="Next song">
                <ChevronRight size={20} />
            </button>

            {lineupTracks.length > 0 && (
                <button onClick={onOpenLineup}
                    className="flex items-center gap-1.5 p-2 rounded-xl text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all" title="Listen to Lineup">
                    <Headphones size={18} />
                </button>
            )}
        </div>
    );

    // ── Column content renderer (read or edit) ────────────────────────────────
    const columnContent = (col: "lyrics" | "chords") => {
        const edit = col === "lyrics" ? lyricsEdit : chordsEdit;
        // For chords we show transposed version when reading, raw when editing
        const readValue = col === "lyrics" ? (currentSong?.lyrics ?? "") : transposedChords;
        const noContentMsg = col === "lyrics" ? "No lyrics available." : "No chords available.";

        if (edit.isEditing) {
            return (
                <textarea
                    autoFocus
                    className="w-full h-full flex-1 font-mono text-sm leading-7 text-gray-800 dark:text-gray-200 bg-transparent resize-none px-5 py-4 outline-none focus:bg-indigo-50/30 dark:focus:bg-indigo-900/10 transition-colors"
                    value={edit.draft}
                    onChange={e => edit.onChange(e.target.value)}
                    spellCheck={false}
                    placeholder={`Enter ${col} here…`}
                />
            );
        }

        if (readValue?.trim()) {
            return (
                <pre className="font-mono text-sm leading-7 text-gray-800 dark:text-gray-200 px-5 py-4 whitespace-pre-wrap break-words">
                    {readValue}
                </pre>
            );
        }

        return (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
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
            <div className="flex items-center shrink-0 border-b border-gray-200 dark:border-gray-800">
                {/* Lyrics header */}
                <div className="flex-1 flex items-center justify-between px-4 py-2">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-rose-500">Lyrics</span>
                    <div className="flex items-center gap-1">
                        {lyricsEdit.isEditing ? editToolbar("lyrics") : pencilBtn("lyrics")}
                    </div>
                </div>
                {/* Vertical divider */}
                <div className="w-px self-stretch bg-gray-200 dark:bg-gray-800 shrink-0" />
                {/* Chords header */}
                <div className="flex-1 flex items-center justify-between px-4 py-2">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-500">Chords</span>
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
                <div className="w-px bg-gray-200 dark:bg-gray-800 shrink-0" />
                <div className={`flex-1 flex flex-col ${chordsEdit.isEditing ? "overflow-hidden" : "overflow-y-auto"}`}>
                    {columnContent("chords")}
                </div>
            </div>
        </div>
    );

    // ── Mobile: 2-row layout with swap ────────────────────────────────────────
    const mobileRow = (col: "lyrics" | "chords", isTop: boolean) => {
        const isLyrics = col === "lyrics";
        const accent = isLyrics ? "text-rose-500" : "text-indigo-500";
        const label = isLyrics ? "Lyrics" : "Chords";
        const edit = isLyrics ? lyricsEdit : chordsEdit;

        return (
            <div className="flex flex-col overflow-hidden" style={{ flex: 1 }}>
                <div className="flex items-center justify-between px-4 py-2 shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                    <span className={`text-[11px] font-bold uppercase tracking-widest ${accent}`}>{label}</span>
                    <div className="flex items-center gap-1">
                        {edit.isEditing ? editToolbar(col) : (
                            <>
                                {!isLyrics && !edit.isEditing && transposeControls}
                                {pencilBtn(col)}
                                {isTop && (
                                    <button
                                        onClick={toggleRowOrder}
                                        className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all"
                                        title={chordsOnTop ? "Move chords below lyrics" : "Move chords above lyrics"}
                                    >
                                        <ArrowUpDown size={15} />
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
                <div className={`flex flex-1 flex-col ${edit.isEditing ? "overflow-hidden" : "overflow-y-auto"}`}>
                    {columnContent(col)}
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
                        {(currentSong.updated_by_name) && (
                            <span className="ml-2 text-gray-400">
                                · last edited by <span className="text-indigo-400 font-medium">{currentSong.updated_by_name}</span>
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
