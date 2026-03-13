import { useState, useEffect, useCallback, useRef } from "react";
import type { TeamNote } from "./NotesPanel";

/**
 * useRealtimeNotes — smart HTTP polling with optimistic-safe merge
 *
 * Polling: 30s background always, 5s fast when panel is open.
 *
 * Stale-fetch guard — final design:
 *
 *   The core problem: when the panel opens, an immediate fetchNotes() is dispatched.
 *   If the user clicks a reaction *before* that fetch completes, the PATCH may finish
 *   faster (~700ms) and call clearPending(). The panel-open fetch then completes with
 *   pre-click server data. By then pendingTsRef is already empty → stale guard can't fire
 *   → pre-click data overwrites optimistic state → reaction disappears for ~4s.
 *
 *   Fix: pendingTsRef is NOT cleared by clearPending(). It stays alive as a "settling
 *   window" until the FIRST poll that started AFTER the optimistic update completes
 *   successfully. Only that post-update poll is allowed to delete pendingTsRef.
 *
 *   Any fetch that started BEFORE pendingTsRef[id] → uses local state, no exceptions.
 *   Only fetches that started AFTER pendingTsRef[id] → apply server data and clean up.
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

  // IDs removed optimistically — polls skip these
  const deletedIdsRef = useRef<Set<string>>(new Set());

  // Per-note, per-field pending lock — cleared by clearPending
  const pendingRef = useRef<Record<string, Set<string>>>({});

  // Per-note "last optimistic update" timestamp — NOT cleared by clearPending.
  // Cleared only when a post-update poll successfully lands (see fetchNotes merge).
  const pendingTsRef = useRef<Record<string, number>>({});

  const fastIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slowIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Pending helpers ──────────────────────────────────────────────────────
  const markPending = useCallback((id: string, field: string) => {
    if (!pendingRef.current[id]) pendingRef.current[id] = new Set();
    pendingRef.current[id].add(field);
    pendingTsRef.current[id] = Date.now(); // stamp optimistic update time
  }, []);

  const clearPending = useCallback((id: string, field: string) => {
    pendingRef.current[id]?.delete(field);
    if (!pendingRef.current[id] || pendingRef.current[id].size === 0) {
      delete pendingRef.current[id];
      // ⚠️  Intentionally do NOT delete pendingTsRef[id] here.
      // pendingTsRef acts as a settling window that outlives the field lock.
      // It is cleaned up inside fetchNotes once a post-update poll lands.
    }
  }, []);

  // ── Smart fetch ──────────────────────────────────────────────────────────
  const fetchNotes = useCallback(async (silent = true) => {
    if (!silent) setLoading(true);

    const fetchStartTime = Date.now(); // record when THIS fetch started

    try {
      const res = await fetch("/api/notes");
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;

      // Snapshot refs synchronously after fetch resolves, before setNotes.
      // React may batch/delay the setNotes updater; snapshots protect against
      // concurrent mutations to the live refs.
      const pendingSnap:   Record<string, Set<string>> = {};
      const pendingTsSnap: Record<string, number>      = {};
      for (const id of Object.keys(pendingRef.current)) {
        pendingSnap[id] = new Set<string>(pendingRef.current[id]);
      }
      Object.assign(pendingTsSnap, pendingTsRef.current);
      const deletedSnap = new Set(deletedIdsRef.current);

      // IDs in pendingTsSnap that started BEFORE this fetch — this fetch clears them
      // after successfully applying fresh server data.
      const toExpire: string[] = [];

      setNotes(prev => {
        const prevMap = Object.fromEntries(prev.map(n => [n.id, n]));

        const filtered = data
          .filter((n: TeamNote) => !deletedSnap.has(n.id))
          .map((serverNote: TeamNote): TeamNote => {
            const local     = prevMap[serverNote.id];
            if (!local) return serverNote;

            const pendingTs = pendingTsSnap[serverNote.id];
            const pending   = pendingSnap[serverNote.id];

            // ── Stale-fetch guard ────────────────────────────────────────
            // This fetch started BEFORE the optimistic update — discard it.
            if (pendingTs && fetchStartTime < pendingTs) {
              return local;
            }

            // ── Settling window — post-update fetch, eligible to expire ──
            if (pendingTs && fetchStartTime >= pendingTs) {
              // This fetch started after the optimistic update.
              // It brings authoritative, post-click server data.
              // Schedule the pendingTs cleanup outside the updater.
              toExpire.push(serverNote.id);
            }

            // ── Field-level pending merge ────────────────────────────────
            // Any in-flight fields that haven't confirmed yet are preserved.
            if (pending && pending.size > 0) {
              return {
                ...serverNote,
                ...(pending.has("reactions") ? { reactions: local.reactions }                        : {}),
                ...(pending.has("resolved")  ? { resolved: local.resolved, resolvedBy: local.resolvedBy } : {}),
                ...(pending.has("type")      ? { type: local.type }                                  : {}),
              };
            }

            return serverNote;
          });

        try {
          localStorage.setItem("wf_notes_cache", JSON.stringify({ data: filtered, ts: Date.now() }));
        } catch { /* noop */ }

        return filtered;
      });

      // Clean up settled timestamps (post-update polls that successfully landed)
      for (const id of toExpire) {
        delete pendingTsRef.current[id];
      }

    } catch { /* keep existing notes on network error */ }
    finally { if (!silent) setLoading(false); }
  }, []);

  // ── Initial fetch ────────────────────────────────────────────────────────
  useEffect(() => {
    fetchNotes(notes.length > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 30s background poll ──────────────────────────────────────────────────
  useEffect(() => {
    slowIntervalRef.current = setInterval(() => fetchNotes(true), 30_000);
    return () => { if (slowIntervalRef.current) clearInterval(slowIntervalRef.current); };
  }, [fetchNotes]);

  // ── 5s fast poll when panel open ────────────────────────────────────────
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
