import { useEffect, useRef } from "react";

/**
 * useSessionTracking
 * ------------------
 * Tracks the current user's session for the Admin Activity Monitor.
 *
 * On mount  → POST /api/activity/heartbeat  (action: "start")
 * Every 60s → POST /api/activity/heartbeat  (action: "ping")
 * On unmount / beforeunload → POST /api/activity/heartbeat (action: "end")
 *
 * Only runs when the user is authenticated (userId is non-null).
 */
export function useSessionTracking(
    userId: string | null,
    userName: string | null,
    userEmail: string | null,
    userRole: string | null,
    userPhoto: string | null,
    currentView?: string | null,   // ← the tab/view the user is on right now
) {
    const sessionIdRef = useRef<string>(
        `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    );
    const startedRef = useRef(false);

    useEffect(() => {
        if (!userId || !userEmail) return;

        const sessionId = sessionIdRef.current;

        const ping = (action: "start" | "ping" | "end") => {
            // Don't ping when tab is hidden (user minimized browser or switched apps)
            // This eliminates costs during long mini-player listening sessions
            if (action === "ping" && document.visibilityState === "hidden") return;

            const payload = {
                userId,
                sessionId,
                name: userName || userEmail,
                email: userEmail,
                role: userRole || "member",
                photo: userPhoto || "",
                action,
                // Track what section the user is in so admin can see their last action
                lastView: currentView || "dashboard",
            };
            // Use navigator.sendBeacon for "end" so it survives tab close
            if (action === "end" && navigator.sendBeacon) {
                const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
                navigator.sendBeacon("/api/activity/heartbeat", blob);
            } else {
                fetch("/api/activity/heartbeat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                }).catch(() => { /* silent fail */ });
            }
        };

        // Start session (only once per mount)
        if (!startedRef.current) {
            startedRef.current = true;
            ping("start");
        }

        // Heartbeat every 5 minutes — reduced from 2 min to cut Netlify invocations by ~60%
        // Tab-hidden guard above means zero cost while mini-player runs in background
        const interval = setInterval(() => ping("ping"), 300_000);

        // End session on cleanup / tab close
        const handleUnload = () => ping("end");
        window.addEventListener("beforeunload", handleUnload);

        return () => {
            clearInterval(interval);
            window.removeEventListener("beforeunload", handleUnload);
            ping("end");
        };
    }, [userId, userEmail]); // Only restart if user changes (login/logout)
}
