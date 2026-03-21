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

    // Determine which prompt to show
    useEffect(() => {
        if (!userId || !userRole) return;
        if (!("Notification" in window)) return;
        if (!("serviceWorker" in navigator)) return;

        if (Notification.permission === "granted") {
            if (!registeredRef.current) {
                registeredRef.current = true;
                registerAndStoreToken(userId, userRole).catch(() => { });
            }
            setPushEnabled(true);
            return;
        }

        if (Notification.permission === "denied") return; // respect hard block

        // permission === "default" — user hasn't decided yet
        const skipCount = getSkipCount();

        if (skipCount >= 2) {
            // Persistent: show blocking modal every session after 2 skips
            const t = setTimeout(() => setShowForcedModal(true), 1500);
            return () => clearTimeout(t);
        }

        // Gentle banner — re-show after 3 days if dismissed
        const cooldownMs = 3 * 24 * 60 * 60 * 1000;
        const dismissed = localStorage.getItem("pushPromptDismissed");
        if (dismissed && Date.now() - Number(dismissed) < cooldownMs) return;

        const t = setTimeout(() => setShowPrompt(true), 2000);
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
                await registerAndStoreToken(userId!, userRole!);
            }
        } catch (err) {
            console.warn("[Push] Permission request failed:", err);
        }
    }, [userId, userRole]);

    // "Skip for now" — gentle banner dismiss, tracks skip count
    const dismissPrompt = useCallback(() => {
        setShowPrompt(false);
        bumpSkipCount();
        try { localStorage.setItem("pushPromptDismissed", String(Date.now())); } catch { /* noop */ }
    }, []);

    // "Maybe later" — forced modal dismiss (no bump needed, already at 2+)
    const dismissForcedModal = useCallback(() => {
        setShowForcedModal(false);
    }, []);

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
                        tag: "worshipflow-notif",
                        renotify: true,
                        data: payload.data || {},
                    } as NotificationOptions);
                } else {
                    new Notification(title, { body: body || "", icon: "/icon-192x192.png" });
                }
            } catch {
                new Notification(title, { body: body || "", icon: "/icon-192x192.png" });
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

    await fetch("/api/fcm-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: userRole, token }),
    });
}
