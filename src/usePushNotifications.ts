import { useEffect, useState, useCallback, useRef } from "react";
import { messaging, getToken, onMessage, VAPID_KEY } from "./firebase";

/**
 * usePushNotifications
 *
 * iOS Safari REQUIRES that Notification.requestPermission() is called from
 * a user gesture (tap/click). Auto-calling it on page load is silently blocked.
 *
 * Strategy:
 *   - First 2 dismissals → show a gentle top banner (re-shows after 3 days)
 *   - 3rd+ open          → show a full-screen blocking modal every session
 *     until they actually enable (or the browser hard-blocks) notifications
 */
export function usePushNotifications(userId: string | null, userRole: string | null) {
    const [showPrompt, setShowPrompt] = useState(false);
    const [showForcedModal, setShowForcedModal] = useState(false);
    const [pushEnabled, setPushEnabled] = useState(false);
    // Guard: only register the FCM token once per mount
    const registeredRef = useRef(false);

    const getSkipCount = () => {
        try { return parseInt(localStorage.getItem("pushSkipCount") || "0", 10); } catch { return 0; }
    };
    const bumpSkipCount = () => {
        try { localStorage.setItem("pushSkipCount", String(getSkipCount() + 1)); } catch { /* noop */ }
    };

    // Save prompt interaction to backend so admin can see it in Push Coverage
    const savePromptStatus = (userId: string, status: string, skipCount: number, lastPromptType: string | null, browserBlocked = false) => {
        fetch("/api/push-prompt-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, status, skipCount, lastPromptType, browserBlocked }),
        }).catch(() => { /* silent — non-critical */ });
    };

    // Determine which prompt to show
    useEffect(() => {
        if (!userId || !userRole) return;
        if (!("Notification" in window)) return;
        if (!("serviceWorker" in navigator)) return;

        if (Notification.permission === "granted") {
            if (!registeredRef.current) {
                registeredRef.current = true;
                // sessionStorage guard: only register the token once per browser session
                // (prevents duplicate token docs from re-registration on every mount/page-load)
                const sessionKey = `wf_fcm_registered_${userId}`;
                if (!sessionStorage.getItem(sessionKey)) {
                    sessionStorage.setItem(sessionKey, "1");
                    registerAndStoreToken(userId, userRole).catch(() => { });
                }
            }
            setPushEnabled(true);
            return;
        }

        if (Notification.permission === "denied") {
            // Browser-level block — record it once
            savePromptStatus(userId, "blocked", getSkipCount(), null, true);
            return;
        }

        // permission === "default" — user hasn't decided yet
        const skipCount = getSkipCount();

        if (skipCount >= 2) {
            // Persistent: show blocking modal every session after 2 skips
            const t = setTimeout(() => {
                setShowForcedModal(true);
                // Record that the forced modal was shown
                savePromptStatus(userId, "skipped", skipCount, "forced_modal");
            }, 1500);
            return () => clearTimeout(t);
        }

        // Gentle banner — re-show after 3 days if dismissed
        const cooldownMs = 3 * 24 * 60 * 60 * 1000;
        const dismissed = localStorage.getItem("pushPromptDismissed");
        if (dismissed && Date.now() - Number(dismissed) < cooldownMs) return;

        const t = setTimeout(() => {
            setShowPrompt(true);
            // Record that the banner was shown (but not yet interacted with)
            if (skipCount > 0) savePromptStatus(userId, "skipped", skipCount, "banner");
        }, 2000);
        return () => clearTimeout(t);
    }, [userId, userRole]);

    // Called when user taps "Enable" in either the banner or the forced modal ✅
    const requestPushPermission = useCallback(async () => {
        setShowPrompt(false);
        setShowForcedModal(false);
        try {
            const permission = await Notification.requestPermission();
            if (permission === "granted") {
                setPushEnabled(true);
                // Clear all skip/dismiss tracking on success
                try {
                    localStorage.removeItem("pushSkipCount");
                    localStorage.removeItem("pushPromptDismissed");
                } catch { /* noop */ }
                if (userId) savePromptStatus(userId, "enabled", 0, null);
                await registerAndStoreToken(userId!, userRole!);
            } else if (permission === "denied") {
                if (userId) savePromptStatus(userId, "blocked", getSkipCount(), null, true);
            }
        } catch (err) {
            console.warn("[Push] Permission request failed:", err);
        }
    }, [userId, userRole]);

    // "Skip for now" — gentle banner dismiss, tracks skip count
    const dismissPrompt = useCallback(() => {
        setShowPrompt(false);
        bumpSkipCount();
        const newCount = getSkipCount();
        try { localStorage.setItem("pushPromptDismissed", String(Date.now())); } catch { /* noop */ }
        if (userId) savePromptStatus(userId, "skipped", newCount, "banner");
    }, [userId]);

    // "Maybe later" — forced modal dismiss
    const dismissForcedModal = useCallback(() => {
        setShowForcedModal(false);
        if (userId) savePromptStatus(userId, "skipped", getSkipCount(), "forced_modal");
    }, [userId]);

    // Listen for foreground messages (app open)
    // Use reg.showNotification() with same `tag` as service worker → deduplication
    useEffect(() => {
        if (!userId || !pushEnabled) return;
        const unsubscribe = onMessage(messaging, async (payload) => {
            const { title, body } = payload.notification || {};
            if (Notification.permission !== "granted" || !title) return;
            try {
                const reg = await navigator.serviceWorker.getRegistration("/");
                if (reg) {
                    reg.showNotification(title, {
                        body: body || "",
                        icon: "/icon-192x192.png",
                        badge: "/favicon-32.png",
                        // Use a type-scoped tag so different event types don't overwrite each other
                        // while still preventing same-type duplicates from stacking
                        tag: `worshipflow-${payload.data?.type || "notif"}`,
                        renotify: true,
                        data: payload.data || {},
                    } as NotificationOptions);
                } else {
                    // Must include tag so OS deduplicates these raw fallback notifications
                    new Notification(title, { body: body || "", icon: "/icon-192x192.png", tag: `worshipflow-${payload.data?.type || "notif"}` });
                }
            } catch {
                new Notification(title, { body: body || "", icon: "/icon-192x192.png", tag: `worshipflow-${(payload as any).data?.type || "notif"}` });
            }
        });
        return () => unsubscribe();
    }, [userId, pushEnabled]);

    return { showPrompt, showForcedModal, pushEnabled, requestPushPermission, dismissPrompt, dismissForcedModal };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function registerAndStoreToken(userId: string, userRole: string) {
    const registration = await navigator.serviceWorker.register(
        "/firebase-messaging-sw.js",
        { scope: "/" }
    );
    await navigator.serviceWorker.ready;

    const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
    });

    if (!token) return;

    // Include email so the backend can look up a user's UID from their email
    // (used for targeted notifications like birthday wishes)
    const { getAuth } = await import("firebase/auth");
    const email = getAuth().currentUser?.email || "";

    await fetch("/api/fcm-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: userRole, token, email }),
    });
}
