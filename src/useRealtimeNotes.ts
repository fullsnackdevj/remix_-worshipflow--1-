import { useState, useEffect } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import type { TeamNote } from "./NotesPanel";

/**
 * useRealtimeNotes
 *
 * Replaces the 60-second poll + fetch-on-open pattern in NotesPanel
 * with a Firestore onSnapshot listener. Any note change from ANY team
 * member propagates to all connected clients within ~200ms.
 *
 * Only streams non-deleted notes (deletedAt == null).
 * Optimistic UI (instant local add/edit/delete) is fully preserved —
 * just keep calling setNotes directly for those operations.
 */
export function useRealtimeNotes(userId: string | null | undefined) {
  const [notes, setNotes] = useState<TeamNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Query: all notes without a deletedAt, newest first
    // Note: Firestore requires a composite index for (deletedAt == null, orderBy createdAt)
    // As a fallback we filter in JS — `where("deletedAt","==",null)` would need an index.
    // Instead we fetch all and filter client-side so no index setup is required.
    const q = query(
      collection(db, "team_notes"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const all: TeamNote[] = snap.docs
          .map((d) => {
            const data = d.data();
            // Normalize Firestore Timestamps → ISO strings
            const normalize = (v: unknown) =>
              v instanceof Timestamp
                ? v.toDate().toISOString()
                : (v as string | null | undefined) ?? null;

            return {
              id: d.id,
              authorId: data.authorId ?? "",
              authorName: data.authorName ?? "",
              authorPhoto: data.authorPhoto ?? "",
              type: data.type ?? "general",
              content: data.content ?? "",
              imageData: data.imageData ?? null,
              videoData: data.videoData ?? null,
              createdAt: normalize(data.createdAt) ?? new Date().toISOString(),
              updatedAt: normalize(data.updatedAt),
              deletedAt: normalize(data.deletedAt),
              resolved: data.resolved ?? false,
              resolvedBy: data.resolvedBy ?? null,
              reactions: data.reactions ?? {},
            } as TeamNote;
          })
          // Filter out soft-deleted notes (deletedAt != null)
          .filter((n) => !n.deletedAt);

        setNotes(all);
        setLoading(false);
      },
      (err) => {
        console.warn("[useRealtimeNotes] onSnapshot error:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []); // userId not in deps — notes are team-wide

  return { notes, setNotes, loading };
}
