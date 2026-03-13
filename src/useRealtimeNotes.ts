import { useState, useEffect, useCallback, useRef } from "react";
import type { TeamNote } from "./NotesPanel";

/**
 * useRealtimeNotes — smart HTTP polling with optimistic-safe merge
 *
 * Polling: 30s background always, 5s fast when panel is open.
 *
 * Oscillation fix — why snapshots are required:
 *   pendingRef is a mutable Ref. setNotes accepts a callback that React may
 *   schedule and run asynchronously. If clearPending() is called between when
 *   fetchNotes() resolves and when React runs the setNotes updater, the ref
 *   will already be empty inside the updater — the pending guard silently
 *   fails and stale poll data overwrites optimistic state.
 *
 *   Solution: snapshot pendingRef + pendingTsRef SYNCHRONOUSLY right after the
 *   fetch completes (before calling setNotes). The updater closes over these
 *   immutable snapshots — clearPending cannot corrupt them mid-flight.
 */
export function useRealtimeNotes(userId: string | null | undefined) {
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

  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // IDs removed optimistically — polls skip these
  const deletedIdsRef = useRef<Set<string>>(new Set());

  // Per-note, per-field optimistic lock
  const pendingRef = useRef<Record<string, Set<string>>>({});

  // Timestamp when each note's pending was last marked
  const pendingTsRef = useRef<Record<string, number>>({});

  const fastIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slowIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Pending helpers ───────────────────────────────────────────────────────
  const markPending = useCallback((id: string, field: string) => {
    if (!pendingRef.current[id]) pendingRef.current[id] = new Set();
    pendingRef.current[id].add(field);
    pendingTsRef.current[id] = Date.now();
  }, []);

  const clearPending = useCallback((id: string, field: string) => {
    pendingRef.current[id]?.delete(field);
    if (!pendingRef.current[id] || pendingRef.current[id].size === 0) {
      delete pendingRef.current[id];
      delete pendingTsRef.current[id];
    }
  }, []);

  // ── Smart fetch with snapshot-based stale guard ───────────────────────────
  const fetchNotes = useCallback(async (silent = true) => {
    if (!silent) setLoading(true);

    const fetchStartTime = Date.now();

    try {
      const res = await fetch("/api/notes");
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;

      // ── SNAPSHOT refs SYNCHRONOUSLY here, before setNotes is called ───────
      // React may schedule the setNotes updater asynchronously. If clearPending()
      // runs between now and when React executes the updater, reading the refs
      // inside the updater would see the already-cleared state and fail to protect
      // in-flight optimistic updates. Snapshots are immutable closures — safe.
      const pendingSnapshot: Record<string, Set<string>> = {};
      const pendingTsSnapshot: Record<string, number> = {};
      for (const id of Object.keys(pendingRef.current)) {
        pendingSnapshot[id] = new Set<string>(pendingRef.current[id]);
      }
      Object.assign(pendingTsSnapshot, pendingTsRef.current);
      const deletedSnapshot = new Set(deletedIdsRef.current);
      // ─────────────────────────────────────────────────────────────────────

      setNotes(prev => {
        const prevMap = Object.fromEntries(prev.map(n => [n.id, n]));

        const filtered = data
          .filter((n: TeamNote) => !deletedSnapshot.has(n.id))
          .map((serverNote: TeamNote): TeamNote => {
            const local = prevMap[serverNote.id];
            if (!local) return serverNote;

            const pendingTs = pendingTsSnapshot[serverNote.id];
            const pending   = pendingSnapshot[serverNote.id];

            // Stale-fetch guard: this fetch started before the optimistic update
            // was made — discard the server data for this note entirely.
            if (pendingTs && fetchStartTime < pendingTs) {
              return local;
            }

            // Normal pending merge: fetch started after optimistic update,
            // selectively preserve in-flight fields.
            if (pending && pending.size > 0) {
              return {
                ...serverNote,
                ...(pending.has("reactions") ? { reactions: local.reactions } : {}),
                ...(pending.has("resolved")  ? { resolved: local.resolved, resolvedBy: local.resolvedBy } : {}),
                ...(pending.has("type")      ? { type: local.type } : {}),
              };
            }

            return serverNote;
          });

        try {
          localStorage.setItem("wf_notes_cache", JSON.stringify({ data: filtered, ts: Date.now() }));
        } catch { /* noop */ }

        return filtered;
      });
    } catch { /* keep existing notes on network error */ }
    finally { if (!silent) setLoading(false); }
  }, []);

  // ── Initial fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetchNotes(notes.length > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 30s background poll ───────────────────────────────────────────────────
  useEffect(() => {
    slowIntervalRef.current = setInterval(() => fetchNotes(true), 30_000);
    return () => { if (slowIntervalRef.current) clearInterval(slowIntervalRef.current); };
  }, [fetchNotes]);

  // ── 5s fast poll when panel open ─────────────────────────────────────────
  useEffect(() => {
    if (fastIntervalRef.current) { clearInterval(fastIntervalRef.current); fastIntervalRef.current = null; }
    if (open) {
      fetchNotes(true);
      fastIntervalRef.current = setInterval(() => fetchNotes(true), 5_000);
    }
    return () => { if (fastIntervalRef.current) clearInterval(fastIntervalRef.current); };
  }, [open, fetchNotes]);

  return {
    notes,
    setNotes,
    loading,
    deletedIdsRef,
    markPending,
    clearPending,
    onOpen:  () => setOpen(true),
    onClose: () => setOpen(false),
    refetch: () => fetchNotes(false),
  };
}
