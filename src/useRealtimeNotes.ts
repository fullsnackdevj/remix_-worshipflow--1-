import { useState, useEffect, useCallback, useRef } from "react";
import type { TeamNote } from "./NotesPanel";

/**
 * useRealtimeNotes — smart HTTP polling
 *
 * Strategy:
 *  • Instant seed from localStorage cache (no blank flash)
 *  • Background 30s poll always running (keeps unread badge fresh)
 *  • 5s fast poll when panel is OPEN (near-live note feed)
 *  • Optimistic UI preserved: setNotes() still works for instant updates
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
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const fastIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slowIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotes = useCallback(async (silent = true) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/notes");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        const filtered = data.filter((n: TeamNote) => !deletedIdsRef.current.has(n.id));
        setNotes(filtered);
        try {
          localStorage.setItem("wf_notes_cache", JSON.stringify({ data: filtered, ts: Date.now() }));
        } catch { /* noop */ }
      }
    } catch { /* keep existing notes on network error */ }
    finally { if (!silent) setLoading(false); }
  }, []);

  // ── Initial fetch on mount ──────────────────────────────────────────────
  useEffect(() => {
    fetchNotes(notes.length > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Background 30s poll — always on, keeps unread badge count fresh ────
  useEffect(() => {
    slowIntervalRef.current = setInterval(() => fetchNotes(true), 30_000);
    return () => {
      if (slowIntervalRef.current) clearInterval(slowIntervalRef.current);
    };
  }, [fetchNotes]);

  // ── Fast 5s poll — only when panel is open ─────────────────────────────
  useEffect(() => {
    if (fastIntervalRef.current) {
      clearInterval(fastIntervalRef.current);
      fastIntervalRef.current = null;
    }
    if (open) {
      fetchNotes(true); // immediate refresh on open
      fastIntervalRef.current = setInterval(() => fetchNotes(true), 5_000);
    }
    return () => {
      if (fastIntervalRef.current) clearInterval(fastIntervalRef.current);
    };
  }, [open, fetchNotes]);

  return {
    notes,
    setNotes,
    loading,
    deletedIdsRef,
    onOpen: () => setOpen(true),
    onClose: () => setOpen(false),
  };
}
