import { useState, useEffect, useCallback, useRef } from "react";
import type { TeamNote } from "./NotesPanel";

/**
 * useRealtimeNotes — smart HTTP polling with optimistic-safe merge
 *
 * Strategy:
 *  • Instant seed from localStorage cache (no blank flash)
 *  • Background 30s poll always running (keeps unread badge fresh)
 *  • 5s fast poll when panel is OPEN (near-live note feed)
 *  • SMART MERGE: polling never overwrites in-flight optimistic changes
 *    (reactions, resolved, type) until server confirms them
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

  // IDs that have been optimistically deleted — polls skip these
  const deletedIdsRef = useRef<Set<string>>(new Set());

  // Tracks per-note fields that are in-flight (not yet confirmed by server)
  // Structure: { [noteId]: { reactions?: true, resolved?: true, type?: true } }
  const pendingRef = useRef<Record<string, Set<string>>>({});

  const fastIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slowIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Mark / clear a field as pending ──────────────────────────────────────
  const markPending = useCallback((id: string, field: string) => {
    if (!pendingRef.current[id]) pendingRef.current[id] = new Set();
    pendingRef.current[id].add(field);
  }, []);

  const clearPending = useCallback((id: string, field: string) => {
    pendingRef.current[id]?.delete(field);
    if (pendingRef.current[id]?.size === 0) delete pendingRef.current[id];
  }, []);

  // ── Smart fetch: merges server data without clobbering optimistic state ──
  const fetchNotes = useCallback(async (silent = true) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/notes");
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;

      setNotes(prev => {
        const prevMap = Object.fromEntries(prev.map(n => [n.id, n]));
        const filtered = data
          .filter((n: TeamNote) => !deletedIdsRef.current.has(n.id))
          .map((serverNote: TeamNote) => {
            const local = prevMap[serverNote.id];
            if (!local) return serverNote; // new note from server — use as-is

            const pending = pendingRef.current[serverNote.id];
            if (!pending || pending.size === 0) return serverNote; // no in-flight — safe to update

            // Selectively preserve in-flight optimistic fields
            return {
              ...serverNote,
              ...(pending.has("reactions") ? { reactions: local.reactions } : {}),
              ...(pending.has("resolved")  ? { resolved: local.resolved, resolvedBy: local.resolvedBy } : {}),
              ...(pending.has("type")      ? { type: local.type } : {}),
            };
          });

        try {
          localStorage.setItem("wf_notes_cache", JSON.stringify({ data: filtered, ts: Date.now() }));
        } catch { /* noop */ }
        return filtered;
      });
    } catch { /* keep existing notes on network error */ }
    finally { if (!silent) setLoading(false); }
  }, []);

  // ── Initial fetch on mount ────────────────────────────────────────────────
  useEffect(() => {
    fetchNotes(notes.length > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Background 30s poll ────────────────────────────────────────────────────
  useEffect(() => {
    slowIntervalRef.current = setInterval(() => fetchNotes(true), 30_000);
    return () => { if (slowIntervalRef.current) clearInterval(slowIntervalRef.current); };
  }, [fetchNotes]);

  // ── Fast 5s poll — only when panel is open ─────────────────────────────────
  useEffect(() => {
    if (fastIntervalRef.current) { clearInterval(fastIntervalRef.current); fastIntervalRef.current = null; }
    if (open) {
      fetchNotes(true); // immediate refresh on open
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
