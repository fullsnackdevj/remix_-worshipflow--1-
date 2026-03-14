import React, { useState, useEffect, useCallback } from "react";
import { db } from "./firebase";
import { doc, onSnapshot, setDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { X, ChevronLeft, ChevronRight, Music, Sun, ListMusic, Check } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface LineupTrack {
  songId: string;
  title: string;
  artist: string;
  videoUrl: string;
  mood: "joyful" | "solemn";
  eventName: string;
  eventDate: string;
  serviceType?: string;
}

export interface CurrentUser {
  uid: string;
  name: string;
  photo: string;
}

interface ListenEntry {
  userId: string;
  name: string;
  photo: string;
  listenedAt: string; // ISO
}

// ── Firestore key per track ───────────────────────────────────────────────────
function trackKey(t: LineupTrack) {
  return `${t.eventDate}_${t.songId}_${t.mood}`;
}

// ── YouTube embed ─────────────────────────────────────────────────────────────
function getEmbed(url: string): string {
  try {
    const u = new URL(url);
    let id = "";
    if (u.hostname === "youtu.be") id = u.pathname.slice(1);
    else if (u.hostname.includes("youtube.com")) id = u.searchParams.get("v") ?? u.pathname.split("/").pop() ?? "";
    if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
  } catch { /* noop */ }
  return url;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d: string) {
  try { return new Date(d + "T00:00:00").toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" }); }
  catch { return d; }
}

function MoodPill({ mood }: { mood: "joyful" | "solemn" }) {
  return mood === "joyful"
    ? <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400"><Sun size={8} /> Joyful</span>
    : <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400"><Music size={8} /> Solemn</span>;
}

// ── Avatar chip (tiny) ────────────────────────────────────────────────────────
function Avatar({ name, photo, size = 18 }: { name: string; photo: string; size?: number }) {
  const [err, setErr] = useState(false);
  const init = (name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const ok = photo?.startsWith("http") && !err;
  return ok
    ? <img src={photo} alt={name} title={name} onError={() => setErr(true)}
        style={{ width: size, height: size }}
        className="rounded-full object-cover border-2 border-gray-800 shrink-0" />
    : <div title={name} style={{ width: size, height: size }}
        className="rounded-full bg-indigo-600 border-2 border-gray-800 flex items-center justify-center text-[8px] font-bold text-white shrink-0">
        {init}
      </div>;
}

// ── "Listened" summary line ───────────────────────────────────────────────────
function ListenedBy({ entries, currentUserId }: { entries: ListenEntry[]; currentUserId: string }) {
  if (entries.length === 0) return null;
  const names = entries.map(e => e.userId === currentUserId ? "You" : e.name.split(" ")[0]);
  let label = "";
  if (names.length === 1) label = `${names[0]} listened`;
  else if (names.length === 2) label = `${names[0]} & ${names[1]} listened`;
  else label = `${names[0]}, ${names[1]} +${names.length - 2} listened`;

  return (
    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
      {/* avatar pile */}
      <div className="flex -space-x-1">
        {entries.slice(0, 4).map((e, i) => (
          <span key={e.userId + i}><Avatar name={e.name} photo={e.photo} size={16} /></span>
        ))}
      </div>
      <span className="text-[10px] text-gray-400 leading-none">{label}</span>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  tracks: LineupTrack[];
  currentUser: CurrentUser;
  onClose: () => void;
}

// ── LineupPlayer ──────────────────────────────────────────────────────────────
export default function LineupPlayer({ tracks, currentUser, onClose }: Props) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [mini, setMini] = useState(false);
  // Map of trackKey → ListenEntry[]
  const [listens, setListens] = useState<Record<string, ListenEntry[]>>({});
  // Optimistic "saving" flag per key
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const current = tracks[currentIdx];
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx < tracks.length - 1;

  // ── Subscribe to Firestore listen docs for all tracks ──────────────────────
  useEffect(() => {
    if (tracks.length === 0) return;
    const unsubs = tracks.map(t => {
      const key = trackKey(t);
      const ref = doc(db, "lineupListens", key);
      return onSnapshot(ref, snap => {
        const data = snap.data();
        setListens(prev => ({ ...prev, [key]: Array.isArray(data?.listens) ? data.listens : [] }));
      }, () => {
        // permission error — just set empty
        setListens(prev => ({ ...prev, [key]: [] }));
      });
    });
    return () => unsubs.forEach(u => u());
  }, [tracks]);

  // ── ESC to close/minimize ─────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { if (mini) setMini(false); else onClose(); } };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [mini, onClose]);

  // ── Toggle "I've listened" ─────────────────────────────────────────────────
  const toggleListened = useCallback(async (track: LineupTrack) => {
    const key = trackKey(track);
    const ref = doc(db, "lineupListens", key);
    const existing = listens[key] ?? [];
    const alreadyListened = existing.some(e => e.userId === currentUser.uid);

    // Optimistic update
    setSaving(prev => ({ ...prev, [key]: true }));
    const entry: ListenEntry = {
      userId: currentUser.uid,
      name: currentUser.name || "Team Member",
      photo: currentUser.photo || "",
      listenedAt: new Date().toISOString(),
    };

    if (alreadyListened) {
      // Remove — filter out this user
      const updated = existing.filter(e => e.userId !== currentUser.uid);
      setListens(prev => ({ ...prev, [key]: updated }));
      try {
        await updateDoc(ref, { listens: arrayRemove(existing.find(e => e.userId === currentUser.uid)) });
      } catch {
        // Doc might not exist yet — ignore remove errors
      }
    } else {
      // Add
      setListens(prev => ({ ...prev, [key]: [...existing, entry] }));
      try {
        await setDoc(ref, {
          songId: track.songId,
          songTitle: track.title,
          mood: track.mood,
          eventName: track.eventName,
          eventDate: track.eventDate,
          listens: arrayUnion(entry),
        }, { merge: true });
      } catch (e) {
        console.error("Failed to save listen:", e);
        // Revert optimistic
        setListens(prev => ({ ...prev, [key]: existing }));
      }
    }
    setSaving(prev => ({ ...prev, [key]: false }));
  }, [listens, currentUser]);

  // ── "I've Listened" button ────────────────────────────────────────────────
  function ListenButton({ track, compact = false }: { track: LineupTrack; compact?: boolean }) {
    const key = trackKey(track);
    const entries = listens[key] ?? [];
    const iListened = entries.some(e => e.userId === currentUser.uid);
    const isSaving = saving[key];
    return (
      <button
        onClick={(e) => { e.stopPropagation(); toggleListened(track); }}
        disabled={isSaving}
        title={iListened ? "Click to unmark" : "Mark as listened"}
        className={`flex items-center gap-1 transition-all rounded-full font-semibold shrink-0 ${
          compact
            ? "text-[10px] px-2 py-0.5"
            : "text-xs px-2.5 py-1"
        } ${
          iListened
            ? "bg-emerald-600/30 border border-emerald-500/50 text-emerald-400"
            : "bg-white/8 border border-white/15 text-gray-400 hover:text-white hover:border-white/30"
        } ${isSaving ? "opacity-60 cursor-wait" : ""}`}
      >
        <Check size={compact ? 9 : 11} className={iListened ? "text-emerald-400" : "text-gray-500"} />
        {iListened ? (compact ? "Listened" : "✓ Listened") : (compact ? "Listened?" : "I've Listened")}
      </button>
    );
  }

  if (!current) return null;

  // ── Mini player ───────────────────────────────────────────────────────────
  if (mini) {
    const key = trackKey(current);
    const entries = listens[key] ?? [];
    return (
      <div className="fixed bottom-4 right-4 z-[9999] w-72 rounded-2xl overflow-hidden shadow-2xl bg-gray-900 border border-white/10">
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-950/80">
          <ListMusic size={12} className="text-indigo-400 shrink-0" />
          <span className="text-xs text-white/60 truncate flex-1">Lineup · {currentIdx + 1}/{tracks.length}</span>
          <button onClick={() => setMini(false)} title="Expand" className="p-1 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"><X size={13} /></button>
        </div>
        <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
          <iframe key={current.videoUrl} src={getEmbed(current.videoUrl)}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen className="absolute inset-0 w-full h-full border-0" title={current.title} />
        </div>
        <div className="px-3 py-2 bg-gray-900 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{current.title}</p>
              <p className="text-[10px] text-gray-400 truncate">{current.eventName}</p>
            </div>
            <ListenButton track={current} compact />
          </div>
          <ListenedBy entries={entries} currentUserId={currentUser.uid} />
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentIdx(i => i - 1)} disabled={!hasPrev}
              className="p-1.5 rounded-full hover:bg-white/10 disabled:opacity-30 text-white/70 hover:text-white transition-colors flex-1 flex justify-center">
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => setCurrentIdx(i => i + 1)} disabled={!hasNext}
              className="p-1.5 rounded-full hover:bg-white/10 disabled:opacity-30 text-white/70 hover:text-white transition-colors flex-1 flex justify-center">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Full modal ────────────────────────────────────────────────────────────
  const currentKey = trackKey(current);
  const currentEntries = listens[currentKey] ?? [];

  return (
    <>
      <div className="fixed inset-0 z-[9998] bg-black/80 backdrop-blur-sm" onClick={() => setMini(true)} />
      <div className="fixed z-[9999] bg-gray-900 shadow-2xl rounded-2xl overflow-hidden"
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "min(95vw, 960px)", maxHeight: "90vh" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-gray-950/80 border-b border-white/10">
          <div className="flex items-center gap-2">
            <ListMusic size={16} className="text-indigo-400" />
            <span className="text-sm font-bold text-white">Lineup Playlist</span>
            <span className="text-xs text-white/40">· {tracks.length} song{tracks.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setMini(true)}
              className="p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors flex items-center gap-1.5 text-xs">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                <line x1="10" y1="14" x2="3" y2="21" /><line x1="21" y1="3" x2="14" y2="10" />
              </svg>
              Minimize
            </button>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"><X size={16} /></button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col md:flex-row" style={{ maxHeight: "calc(90vh - 57px)" }}>

          {/* Left: video + now playing bar */}
          <div className="flex flex-col flex-1 min-w-0">
            <div className="relative w-full bg-black" style={{ paddingBottom: "56.25%" }}>
              <iframe key={current.videoUrl} src={getEmbed(current.videoUrl)}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen className="absolute inset-0 w-full h-full border-0" title={current.title} />
            </div>

            {/* Now playing info */}
            <div className="px-5 py-3 bg-gray-900 border-t border-white/10 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <MoodPill mood={current.mood} />
                    <span className="text-[10px] text-gray-500">{fmtDate(current.eventDate)}</span>
                  </div>
                  <p className="text-sm font-bold text-white truncate">{current.title}</p>
                  {current.artist && <p className="text-xs text-gray-400 truncate">{current.artist}</p>}
                  <p className="text-[10px] text-indigo-400 mt-0.5 truncate">{current.eventName}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setCurrentIdx(i => i - 1)} disabled={!hasPrev}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white text-xs font-medium transition-colors">
                    <ChevronLeft size={14} /> Prev
                  </button>
                  <button onClick={() => setCurrentIdx(i => i + 1)} disabled={!hasNext}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white text-xs font-medium transition-colors">
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              {/* "I've Listened" row for current track */}
              <div className="flex items-center gap-3 pt-1 border-t border-white/8">
                <ListenButton track={current} />
                <ListenedBy entries={currentEntries} currentUserId={currentUser.uid} />
              </div>
            </div>
          </div>

          {/* Right: track list */}
          <div className="w-full md:w-64 lg:w-72 shrink-0 flex flex-col border-t md:border-t-0 md:border-l border-white/10 overflow-y-auto">
            <div className="px-4 py-2.5 border-b border-white/10 bg-gray-950/40">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Song Line-Up</p>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-white/5">
              {tracks.map((t, i) => {
                const key = trackKey(t);
                const entries = listens[key] ?? [];
                const iListened = entries.some(e => e.userId === currentUser.uid);
                return (
                  <button key={`${t.songId}-${t.mood}-${i}`} onClick={() => setCurrentIdx(i)}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                      i === currentIdx
                        ? "bg-indigo-600/20 border-l-2 border-indigo-500"
                        : "hover:bg-white/5 border-l-2 border-transparent"
                    }`}>
                    {/* Playing indicator or number */}
                    <div className="w-6 shrink-0 pt-0.5 flex items-center justify-center">
                      {i === currentIdx ? (
                        <div className="flex gap-0.5 items-end h-4">
                          <span className="w-0.5 bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms", height: "100%" }} />
                          <span className="w-0.5 bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms", height: "70%" }} />
                          <span className="w-0.5 bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms", height: "90%" }} />
                        </div>
                      ) : (
                        iListened
                          ? <Check size={13} className="text-emerald-400" />
                          : <span className="text-[11px] text-gray-500 font-mono">{i + 1}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <MoodPill mood={t.mood} />
                        {/* Small listen button inline */}
                        <span
                          role="button"
                          onClick={(e) => { e.stopPropagation(); toggleListened(t); }}
                          className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold transition-all ${
                            iListened
                              ? "bg-emerald-600/25 border-emerald-500/40 text-emerald-400"
                              : "border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300"
                          }`}>
                          {iListened ? "✓" : "+"}
                        </span>
                      </div>
                      <p className={`text-xs font-semibold truncate ${i === currentIdx ? "text-white" : "text-gray-200"}`}>{t.title}</p>
                      {t.artist && <p className="text-[10px] text-gray-500 truncate">{t.artist}</p>}
                      {/* Who's listened */}
                      {entries.length > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <div className="flex -space-x-0.5">
                            {entries.slice(0, 3).map((e, ei) => (
                              <span key={e.userId + ei}><Avatar name={e.name} photo={e.photo} size={14} /></span>
                            ))}
                          </div>
                          <span className="text-[9px] text-gray-500">
                            {entries.length === 1 ? entries[0].name.split(" ")[0] : `${entries.length} listened`}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
