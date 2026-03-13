import { useState, useEffect, useCallback, useRef } from "react";
import type { TeamNote } from "./NotesPanel";

/**
 * useRealtimeNotes — smart HTTP polling with optimistic-safe merge
 *
 * Two classes of optimistic ops, two protection strategies:
 *
 * 1. TEMP NOTES (newly created, pending server ID):
 *    - temp_* notes only exist locally until the server confirms a real ID.
 *    - Every poll merge re-prepends all temp_ notes so they are never lost.
 *
 * 2. IN-PLACE MUTATIONS (react, resolve, retype):
 *    - markPending(id, field) stamps pendingTsRef[id] = Date.now().
 *    - Polls whose fetchStartTime < pendingTs are considered stale and their
 *      data for that note is discarded (local state wins).
 *    - clearPending() clears the field lock but NEVER clears pendingTsRef.
 *    - pendingTsRef[id] is only deleted by the FIRST poll whose fetchStartTime
 *      >= pendingTs, ensuring all pre-mutation in-flight polls are blocked.
 *
 * Polling: 30 s background always, 5 s fast while panel is open.
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
  const [open, setOpen]       = useState(false);

  const deletedIdsRef = useRef<Set<string>>(new Set());
  const pendingRef    = useRef<Record<string, Set<string>>>({});   // field-level lock
  const pendingTsRef  = useRef<Record<string, number>>({});        // settling window timestamp

  const fastIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slowIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Mark / clear optimistic field locks ─────────────────────────────────
  const markPending = useCallback((id: string, field: string) => {
    if (!pendingRef.current[id]) pendingRef.current[id] = new Set();
    pendingRef.current[id].add(field);
    pendingTsRef.current[id] = Date.now(); // stamp settling window — survives clearPending
  }, []);

  const clearPending = useCallback((id: string, field: string) => {
    pendingRef.current[id]?.delete(field);
    if (!pendingRef.current[id] || pendingRef.current[id].size === 0) {
      delete pendingRef.current[id];
    }
    // ⚠️ Do NOT delete pendingTsRef[id] here — it must outlive the field lock.
    // It is cleaned up in fetchNotes once a post-mutation poll lands.
  }, []);

  // ── Smart fetch with two-tier merge ─────────────────────────────────────
  const fetchNotes = useCallback(async (silent = true) => {
    if (!silent) setLoading(true);
    const fetchStartTime = Date.now();

    try {
      const res = await fetch("/api/notes");
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;

      // Snapshot mutable refs synchronously, before setNotes, so React's
      // async scheduling can't let concurrent clearPending() corrupt the guard.
      const pendingSnap:   Record<string, Set<string>> = {};
      const pendingTsSnap: Record<string, number>      = {};
      for (const id of Object.keys(pendingRef.current)) {
        pendingSnap[id] = new Set<string>(pendingRef.current[id]);
      }
      Object.assign(pendingTsSnap, pendingTsRef.current);
      const deletedSnap = new Set(deletedIdsRef.current);

      // Track which note IDs had a settling window cleared by this (post-mutation) fetch
      const expiredTs: string[] = [];

      setNotes(prev => {
        // ── Tier 1: preserve temp_ notes (optimistic creates not yet server-confirmed)
        const tempNotes = prev.filter(n => n.id.startsWith("temp_"));

        const prevMap = Object.fromEntries(prev.map(n => [n.id, n]));

        // ── Tier 2: merge server notes with settling-window + field-level guards
        const serverNotes = data
          .filter((n: TeamNote) => !deletedSnap.has(n.id))
          .map((serverNote: TeamNote): TeamNote => {
            const local     = prevMap[serverNote.id];
            const pendingTs = pendingTsSnap[serverNote.id];
            const pending   = pendingSnap[serverNote.id];

            if (!local) return serverNote; // net-new note from server

            // Stale-fetch guard: this fetch started before the mutation — discard.
            if (pendingTs !== undefined && fetchStartTime < pendingTs) {
              return local;
            }

            // Post-mutation fetch: schedule settling window cleanup.
            if (pendingTs !== undefined && fetchStartTime >= pendingTs) {
              expiredTs.push(serverNote.id);
            }

            // Field-level pending merge: preserve any still-in-flight fields.
            if (pending && pending.size > 0) {
              return {
                ...serverNote,
                ...(pending.has("reactions") ? { reactions: local.reactions }                             : {}),
                ...(pending.has("resolved")  ? { resolved: local.resolved, resolvedBy: local.resolvedBy } : {}),
                ...(pending.has("type")      ? { type: local.type }                                        : {}),
              };
            }

            return serverNote;
          });

        const merged = [...tempNotes, ...serverNotes];

        try {
          // Cache without temp_ notes (they have no stable ID yet)
          const cacheable = merged.filter(n => !n.id.startsWith("temp_"));
          localStorage.setItem("wf_notes_cache", JSON.stringify({ data: cacheable, ts: Date.now() }));
        } catch { /* noop */ }

        return merged;
      });

      // Clean up settling windows that a post-mutation poll has now settled
      for (const id of expiredTs) {
        delete pendingTsRef.current[id];
      }

    } catch { /* keep existing notes on network error */ }
    finally { if (!silent) setLoading(false); }
  }, []);

  // ── Initial fetch ──────────────────────────────────────────────────────
  useEffect(() => {
    fetchNotes(notes.length > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 30 s background poll ───────────────────────────────────────────────
  useEffect(() => {
    slowIntervalRef.current = setInterval(() => fetchNotes(true), 30_000);
    return () => { if (slowIntervalRef.current) clearInterval(slowIntervalRef.current); };
  }, [fetchNotes]);

  // ── 5 s fast poll when panel open ─────────────────────────────────────
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
