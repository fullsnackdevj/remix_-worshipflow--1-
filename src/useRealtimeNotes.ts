import { useState, useEffect, useCallback, useRef } from "react";
import type { TeamNote } from "./NotesPanel";

/**
 * useRealtimeNotes — HTTP smart-polling strategy
 *
 * WHY NOT Firestore onSnapshot?
 *   Firestore security rules restrict client SDK reads on `team_notes`.
 *   The server uses admin SDK (bypasses rules) via /api/notes — always works.
 *
 * STRATEGY:
 *   • On mount: fetch once immediately (seeds from wf_notes_cache if fresh)
 *   • When panel is open: poll every 5s for near-live updates
 *   • When panel closes: stop polling (saves bandwidth)
 *   • Optimistic UI: setNotes is returned and still works instantly
 */
export function useRealtimeNotes(userId: string | null | undefined) {
  const [notes, setNotes] = useState<TeamNote[]>(() => {
    // Seed from cache on first render to avoid blank flash
    try {
      const raw = localStorage.getItem("wf_notes_cache");
      if (raw) {
        const { data, ts } = JSON.parse(raw);
        if (Date.now() - ts < 2 * 60 * 1000) return Array.isArray(data) ? data : [];
      }
    } catch { /* noop */ }
    return [];
  });
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotes = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/notes");
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

  // Initial fetch on mount (silent if we already have cached data)
  useEffect(() => {
    fetchNotes(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Smart polling: 5s when Notes panel is open, stopped when closed
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (open) {
      fetchNotes(true); // immediate refresh on open
      intervalRef.current = setInterval(() => fetchNotes(true), 5_000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
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
