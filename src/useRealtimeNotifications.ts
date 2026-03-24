import { useState, useEffect, useCallback, useRef } from "react";

export interface RealtimeNotification {
  id: string;
  type: string;
  message: string;
  subMessage: string;
  actorName: string;
  actorPhoto: string;
  actorUserId?: string;
  targetAudience: "all" | "non_member" | "admin_only";
  resourceId?: string;
  resourceType?: string;
  resourceDate?: string;
  createdAt: string;
  isRead: boolean;
}

/**
 * useRealtimeNotifications — HTTP smart-polling + window focus strategy
 *
 * WHY NOT Firestore onSnapshot?
 *   Firestore security rules restrict client SDK reads on `notifications`.
 *   The server admin SDK bypasses rules via /api/notifications — always works.
 *
 * STRATEGY:
 *   • 10s background poll always running (near-live for everyone)
 *   • Immediate re-fetch on window focus (user switches tabs → instant update)
 *   • Immediate re-fetch after marking read/delete (UI stays consistent)
 *   • hasNewArrival flag for bell ring animation on count increase
 */
export function useRealtimeNotifications(
  userId: string | null | undefined,
  userRole: string | null | undefined
) {
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);
  const [hasNewArrival, setHasNewArrival] = useState(false);
  const prevUnreadRef = useRef(0);
  const initializedRef = useRef(false);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/notifications?role=${userRole ?? "member"}&userId=${userId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setNotifications(data);

        // Detect new unread arrivals (skip first load)
        const unreadCount = data.filter((n: RealtimeNotification) => !n.isRead).length;
        if (initializedRef.current && unreadCount > prevUnreadRef.current) {
          setHasNewArrival(true);
          setTimeout(() => setHasNewArrival(false), 1200);
        }
        prevUnreadRef.current = unreadCount;
        initializedRef.current = true;
      }
    } catch { /* silent — keep existing notifications on network error */ }
  }, [userId, userRole]);

  // ── Initial fetch ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // ── Background 60s poll — tab focus/visibility listeners give instant updates on switch ──
  // Reduced from 10s to 60s to cut Netlify function invocations by ~83%
  useEffect(() => {
    const id = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  // ── Window focus — instant update when user switches back to tab ─────────
  useEffect(() => {
    const onFocus = () => fetchNotifications();
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchNotifications();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchNotifications]);

  return { notifications, setNotifications, hasNewArrival, refetch: fetchNotifications };
}
