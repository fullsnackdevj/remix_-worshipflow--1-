import { useState, useEffect, useRef, type Dispatch, type SetStateAction, type MutableRefObject } from "react";
import {
  collection, query, orderBy, onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type { TeamNote } from "./NotesPanel";

/**
 * useRealtimeNotes — Firestore onSnapshot real-time listener
 *
 * Replaces HTTP polling entirely. The Firestore SDK maintains a persistent
 * WebSocket connection; any change to team_notes is pushed to the client
 * within ~200ms. No polling intervals, no stale-fetch races, no pendingRef
 * complexity — all oscillation bugs are permanently eliminated.
 *
 * Optimistic deletes: deletedIdsRef filters notes that the user has
 * just deleted locally, preventing a brief ghost while the server write
 * and subsequent snapshot propagate.
 *
 * New (temp_*) notes: prepended from local state until the POST confirms
 * the server ID and the snapshot picks up the real document.
 */
export function useRealtimeNotes(_userId: string | null | undefined) {
  // Seed instantly from cache — avoids blank flash before first snapshot
  const [notes, setNotes] = useState<TeamNote[]>(() => {
    try {
      const raw = localStorage.getItem("wf_notes_cache");
      if (raw) {
        const { data, ts } = JSON.parse(raw);
        if (Date.now() - ts < 5 * 60 * 1000) return Array.isArray(data) ? data : [];
      }
    } catch { /* noop */ }
    return [];
  });

  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  // Optimistically-deleted IDs — filter from snapshot until server confirms
  const deletedIdsRef = useRef<Set<string>>(new Set());

  // Temp_ notes (optimistic creates) — kept until snapshot returns real doc
  const tempNotesRef = useRef<TeamNote[]>([]);

  const unsubRef = useRef<Unsubscribe | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const q = query(
      collection(db, "team_notes"),
      orderBy("createdAt", "desc"),
    );

    unsubRef.current = onSnapshot(
      q,
      { includeMetadataChanges: false },
      (snapshot) => {
        const serverNotes: TeamNote[] = snapshot.docs
          .filter(doc => !deletedIdsRef.current.has(doc.id))
          .map(doc => ({ id: doc.id, ...(doc.data() as Omit<TeamNote, "id">) }));

        // Re-prepend temp_ notes that haven't been assigned a real ID yet
        const tempStillPending = tempNotesRef.current.filter(
          t => !serverNotes.some(s => s.id === t.id.replace("temp_", ""))
        );
        const merged = [...tempStillPending, ...serverNotes];

        setNotes(merged);
        setLoading(false);

        try {
          const cacheable = merged.filter(n => !n.id.startsWith("temp_"));
          localStorage.setItem("wf_notes_cache", JSON.stringify({ data: cacheable, ts: Date.now() }));
        } catch { /* noop */ }
      },
      (err) => {
        console.error("[useRealtimeNotes] onSnapshot error:", err);
        setError(err.message);
        setLoading(false);
        // Fall back to HTTP polling if Firestore rules haven't been updated yet
        fallbackPoll(setNotes, deletedIdsRef, tempNotesRef);
      },
    );

    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, []);

  // Expose a way for NotesPanel to register/deregister temp notes
  const addTempNote = (note: TeamNote) => {
    tempNotesRef.current = [note, ...tempNotesRef.current];
    setNotes(prev => [note, ...prev.filter(n => !n.id.startsWith("temp_") || n.id === note.id)]);
  };

  const removeTempNote = (tempId: string) => {
    tempNotesRef.current = tempNotesRef.current.filter(n => n.id !== tempId);
  };

  return {
    notes,
    setNotes,
    loading,
    error,
    deletedIdsRef,
    addTempNote,
    removeTempNote,
    // No-op stubs — kept so NotesPanel callers don't need changing for now
    markPending:  (_id: string, _field: string) => {},
    clearPending: (_id: string, _field: string) => {},
    onOpen:  () => {},
    onClose: () => {},
    refetch: () => {},
  };
}

// ── Fallback HTTP poll (used only if onSnapshot permission denied) ─────────
let fallbackTimer: ReturnType<typeof setInterval> | null = null;
function fallbackPoll(
  setNotes: Dispatch<SetStateAction<TeamNote[]>>,
  deletedIdsRef: MutableRefObject<Set<string>>,
  tempNotesRef: MutableRefObject<TeamNote[]>,
) {
  if (fallbackTimer) return; // already running
  const poll = async () => {
    try {
      const res = await fetch("/api/notes");
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;
      const filtered = data.filter((n: TeamNote) => !deletedIdsRef.current.has(n.id));
      const merged = [...tempNotesRef.current, ...filtered];
      setNotes(merged);
      try {
        localStorage.setItem("wf_notes_cache", JSON.stringify({ data: filtered, ts: Date.now() }));
      } catch { /* noop */ }
    } catch { /* noop */ }
  };
  poll();
  fallbackTimer = setInterval(poll, 8_000);
}
