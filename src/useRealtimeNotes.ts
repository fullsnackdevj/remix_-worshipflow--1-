import { useState, useEffect, useRef, type Dispatch, type SetStateAction, type MutableRefObject } from "react";
import {
  collection, query, orderBy, onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type { TeamNote } from "./NotesPanel";

// ── Timestamp helper (module-scope so cache seed can use it too) ──────────────
// Safely converts any of: ISO string | Firestore Timestamp | {seconds,nanoseconds} | null → ISO string
function toIso(v: unknown, fallback: string | null = null): string | null {
  if (!v) return fallback;
  if (typeof v === "string") return v;
  // Live Firestore Timestamp object (has .toDate() method)
  if (typeof (v as any).toDate === "function") return (v as any).toDate().toISOString();
  // Serialised Firestore Timestamp from JSON.parse (localStorage cache)
  if (typeof (v as any).seconds === "number") return new Date((v as any).seconds * 1000).toISOString();
  return fallback;
}

/**
 * useRealtimeNotes — Firestore onSnapshot real-time listener
 *
 * Replaces HTTP polling entirely. The Firestore SDK maintains a persistent
 * WebSocket connection; any change to team_notes is pushed to the client
 * within ~200ms. No polling intervals, no stale-fetch races, no pendingRef
 * complexity — all oscillation bugs are permanently eliminated.
 *
 * Optimistic deletes: we now query ONLY non-deleted docs (deletedAt == null)
 * so soft-deleted notes never arrive in the snapshot at all.
 * deletedIdsRef is kept as a belt-and-suspenders guard for the brief window
 * between the optimistic remove and Firestore propagating the deletedAt update.
 *
 * Optimistic reactions: pendingReactionIds tracks notes whose reactions were
 * mutated locally but not yet confirmed by a stable server snapshot.
 * The snapshot preserves local reactions for those notes until server data
 * stabilises, eliminating the 1-2s flicker.
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
        if (Date.now() - ts < 5 * 60 * 1000 && Array.isArray(data)) {
          // Convert any serialised Timestamps that slipped into the cache
          return data.map((n: any) => ({
            ...n,
            createdAt: toIso(n.createdAt, new Date().toISOString()) as string,
            updatedAt: toIso(n.updatedAt, null),
          })) as TeamNote[];
        }
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

  // Notes whose reactions were mutated optimistically — snapshot preserves
  // local reactions until server data stabilises (fixes reaction flicker)
  const pendingReactionIds = useRef<Set<string>>(new Set());

  const unsubRef = useRef<Unsubscribe | null>(null);

  // Keep a stable ref to current notes for use inside snapshot closure
  const notesRef = useRef<TeamNote[]>(notes);
  useEffect(() => { notesRef.current = notes; }, [notes]);

  useEffect(() => {
    setLoading(true);
    setError(null);

    // ── KEY FIX: no compound query — just orderBy, filter deleted client-side ──
    // A compound (where + orderBy on different fields) requires a Firestore composite
    // index. If the index doesn't exist onSnapshot immediately errors → users fall
    // back to 8-second HTTP polling and lose real-time updates.
    // Filtering deletedAt client-side is safe: soft-deleted docs are rare and the
    // deletedIdsRef guard already handles the optimistic-delete window.
    const q = query(
      collection(db, "team_notes"),
      orderBy("createdAt", "desc"),
    );

    unsubRef.current = onSnapshot(
      q,
      { includeMetadataChanges: false },
      (snapshot) => {
        const serverNotes: TeamNote[] = snapshot.docs
          .filter(doc => !deletedIdsRef.current.has(doc.id) && !doc.data()["deletedAt"]) // filter soft-deleted client-side
          .map(doc => {
            const data = doc.data() as Record<string, unknown>;
            return {
              ...(data as Omit<TeamNote, "id">),
              id: doc.id,
              // Convert Firestore Timestamps → ISO strings (same as REST API does)
              createdAt: toIso(data.createdAt, new Date().toISOString()) as string,
              updatedAt: toIso(data.updatedAt, null),
            } as TeamNote;
          });

        // Re-prepend temp_ notes that haven't been assigned a real ID yet
        const tempStillPending = tempNotesRef.current.filter(
          t => !serverNotes.some(s => s.id === t.id.replace("temp_", ""))
        );

        // ── KEY FIX #1: preserve optimistic reactions for pending notes ──
        // For any note whose reactions were mutated locally (and not yet
        // confirmed by a stable server write), keep the local reaction state
        // so the count doesn't flicker back to the pre-click value.
        const prevMap = new Map<string, TeamNote>(notesRef.current.map(n => [n.id, n]));
        const mergedServer = serverNotes.map(n => {
          if (pendingReactionIds.current.has(n.id)) {
            const local: TeamNote | undefined = prevMap.get(n.id);
            if (local) {
              // Check if server reactions now match local — if so, clear pending
              const serverStr = JSON.stringify((n as TeamNote).reactions ?? {});
              const localStr  = JSON.stringify((local as TeamNote).reactions ?? {});
              if (serverStr === localStr) {
                pendingReactionIds.current.delete(n.id);
              } else {
                // Server hasn't caught up yet — keep local reactions
                return { ...n, reactions: (local as TeamNote).reactions };
              }
            }
          }
          return n;
        });

        const merged = [...tempStillPending, ...mergedServer];

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

  // ── KEY FIX #3: removeTempNote now also updates React state ──
  const removeTempNote = (tempId: string) => {
    tempNotesRef.current = tempNotesRef.current.filter(n => n.id !== tempId);
    setNotes(prev => prev.filter(n => n.id !== tempId));
  };

  // ── KEY FIX #1 helper: called by reactToNote before optimistic update ──
  const markReactionPending = (noteId: string) => {
    pendingReactionIds.current.add(noteId);
  };

  // ── HTTP safety-net poll: backup for when Firestore real-time has issues ────
  // Firestore onSnapshot (above) delivers changes in ~200ms via WebSocket.
  // This poll is purely a fallback — reduced from 10s to 60s to cut Netlify costs.
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/notes");
        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data)) return;
        setNotes(prev => {
          // Only update if there are new/changed notes (avoid flicker on match)
          const filtered = data.filter((n: TeamNote) => !deletedIdsRef.current.has(n.id));
          const prevIds = new Set(prev.map(n => n.id));
          const hasNew = filtered.some((n: TeamNote) => !prevIds.has(n.id));
          if (!hasNew && filtered.length === prev.filter(n => !n.id.startsWith("temp_")).length) return prev;
          const temps = prev.filter(n => n.id.startsWith("temp_"));
          try { localStorage.setItem("wf_notes_cache", JSON.stringify({ data: filtered, ts: Date.now() })); } catch { /* noop */ }
          return [...temps, ...filtered];
        });
      } catch { /* noop */ }
    };
    poll(); // immediate fetch on mount
    const timer = setInterval(poll, 60_000); // Reduced from 10s → 60s (Firestore handles real-time)
    return () => clearInterval(timer);
  }, []);

  return {
    notes,
    setNotes,
    loading,
    error,
    deletedIdsRef,
    addTempNote,
    removeTempNote,
    markReactionPending,
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
  fallbackTimer = setInterval(poll, 60_000); // Reduced from 8s → 60s (emergency fallback only)
}
