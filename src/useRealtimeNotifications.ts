import { useState, useEffect, useRef } from "react";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export interface RealtimeNotification {
  id: string;
  type: "new_event" | "updated_event" | "new_song" | "access_request";
  message: string;
  subMessage: string;
  actorName: string;
  actorPhoto: string;
  actorUserId?: string;
  targetAudience: "all" | "non_member" | "admin_only";
  resourceId?: string;
  resourceType?: string;
  resourceDate?: string;
  readBy: string[];
  deletedBy: string[];
  createdAt: string;
  // Computed client-side
  isRead: boolean;
}

/**
 * useRealtimeNotifications
 *
 * Replaces the 60-second polling interval with a Firestore onSnapshot listener.
 * Fires within ~200ms of any write to the `notifications` collection.
 * Works in both local dev (Express) and Netlify production.
 *
 * @param userId  - Current user's UID (for read/delete filtering)
 * @param userRole - Current effective role (for audience filtering)
 */
export function useRealtimeNotifications(
  userId: string | null | undefined,
  userRole: string | null | undefined
) {
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);
  // Track new arrivals to trigger bell animation
  const [hasNewArrival, setHasNewArrival] = useState(false);
  const prevCountRef = useRef(0);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, "notifications"),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const role = userRole ?? "member";

        const all: RealtimeNotification[] = snap.docs.map((d) => {
          const data = d.data();
          const readBy: string[] = data.readBy ?? [];
          const deletedBy: string[] = data.deletedBy ?? [];
          // Convert Firestore Timestamp → ISO string
          const createdAt =
            data.createdAt instanceof Timestamp
              ? data.createdAt.toDate().toISOString()
              : data.createdAt?.toDate?.()?.toISOString?.() ??
                new Date().toISOString();

          return {
            id: d.id,
            ...(data as Omit<RealtimeNotification, "id" | "isRead" | "createdAt">),
            createdAt,
            readBy,
            deletedBy,
            isRead: readBy.includes(userId),
          };
        });

        const filtered = all.filter((n) => {
          // Never show actor their own notification
          if (n.actorUserId && n.actorUserId === userId) return false;
          // Soft-deleted for this user
          if (n.deletedBy.includes(userId)) return false;
          // Audience filtering
          if (n.targetAudience === "all") return true;
          if (n.targetAudience === "admin_only") return role === "admin";
          if (n.targetAudience === "non_member") return role !== "member";
          return false;
        });

        setNotifications(filtered);

        // Detect brand-new unread arrivals (not on first load)
        const unreadCount = filtered.filter((n) => !n.isRead).length;
        if (initializedRef.current && unreadCount > prevCountRef.current) {
          setHasNewArrival(true);
          // Auto-clear animation flag after 1.2s
          setTimeout(() => setHasNewArrival(false), 1200);
        }
        prevCountRef.current = unreadCount;
        initializedRef.current = true;
      },
      (err) => {
        console.warn("[useRealtimeNotifications] onSnapshot error:", err);
      }
    );

    return () => unsub();
  }, [userId, userRole]);

  return { notifications, setNotifications, hasNewArrival };
}
