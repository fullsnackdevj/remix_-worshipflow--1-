import { useState, useEffect, useCallback, useRef } from "react";
import type { TeamNote } from "./NotesPanel";

/**
 * useRealtimeNotes — smart HTTP polling with optimistic-safe merge
 *
 * Polling: 30s background always, 5s fast when panel is open.
 *
 * Stale-fetch guard (fixes oscillation bug):
 *  - markPending(id, field) stamps a timestamp when optimistic update is made.
 *  - fetchNotes captures fetchStartTime = Date.now() before the fetch begins.
 *  - If fetchStartTime < pendingTimestamp for a note, that fetch response pre-dates
 *    the optimistic update → discard server data for that note entirely.
 *  - If fetchStartTime >= pendingTimestamp, use normal pending-field merge.
 *  - clearPending() lifts the lock after the server confirms the change.
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

  // Timestamp when each note's pending was last marked — used to discard stale fetches
  const pendingTsRef = useRef<Record<string, number>>({});

  const fastIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slowIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Pending helpers ───────────────────────────────────────────────────────
  const markPending = useCallback((id: string, field: string) => {
    if (!pendingRef.current[id]) pendingRef.current[id] = new Set();
    pendingRef.current[id].add(field);
    pendingTsRef.current[id] = Date.now(); // stamp when this optimistic update was made
  }, []);

  const clearPending = useCallback((id: string, field: string) => {
    pendingRef.current[id]?.delete(field);
    if (!pendingRef.current[id] || pendingRef.current[id].size === 0) {
      delete pendingRef.current[id];
      delete pendingTsRef.current[id];
    }
  }, []);

  // ── Smart fetch with stale-response guard ─────────────────────────────────
  const fetchNotes = useCallback(async (silent = true) => {
    if (!silent) setLoading(true);

    // Record when this fetch STARTS — used to detect stale responses
    const fetchStartTime = Date.now();

    try {
      const res = await fetch("/api/notes");
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;

      setNotes(prev => {
        const prevMap = Object.fromEntries(prev.map(n => [n.id, n]));

        const filtered = data
          .filter((n: TeamNote) => !deletedIdsRef.current.has(n.id))
          .map((serverNote: TeamNote): TeamNote => {
            const local = prevMap[serverNote.id];
            if (!local) return serverNote; // new note from server — accept as-is

            const pendingTs = pendingTsRef.current[serverNote.id];
            const pending   = pendingRef.current[serverNote.id];

            // ── Stale-fetch guard ──────────────────────────────────────────
            // This fetch started BEFORE the optimistic update was made, so
            // the server response reflects pre-click data. Keep local entirely.
            if (pendingTs && fetchStartTime < pendingTs) {
              return local;
            }

            // ── Normal pending-field merge ─────────────────────────────────
            // Fetch started after the optimistic update — merge selectively.
            if (pending && pending.size > 0) {
              return {
                ...serverNote,
                ...(pending.has("reactions") ? { reactions: local.reactions } : {}),
                ...(pending.has("resolved")  ? { resolved: local.resolved, resolvedBy: local.resolvedBy } : {}),
                ...(pending.has("type")      ? { type: local.type } : {}),
              };
            }

            // No pending — accept server data fully
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
