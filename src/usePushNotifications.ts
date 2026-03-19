import { useEffect, useState, useCallback, useRef } from "react";
import { messaging, getToken, onMessage, VAPID_KEY } from "./firebase";

/**
 * usePushNotifications
 *
 * iOS Safari REQUIRES that Notification.requestPermission() is called from
 * a user gesture (tap/click). Auto-calling it on page load is silently blocked.
 *
 * Solution: expose a `requestPushPermission` function + `showPrompt` flag.
 * The App UI renders a banner with an "Enable" button — when tapped, it calls
 * `requestPushPermission()` which satisfies the iOS user-gesture requirement.
 */
export function usePushNotifications(userId: string | null, userRole: string | null) {
    const [showPrompt, setShowPrompt] = useState(false);
    const [pushEnabled, setPushEnabled] = useState(false);
    // Guard: only register the FCM token once per mount, not on every userId/userRole change.
    // Without this, re-renders (e.g. role loaded async) cause repeated token registrations.
    const registeredRef = useRef(false);

    // Determine if we should show the prompt
    useEffect(() => {
        if (!userId || !userRole) return;
        if (!("Notification" in window)) return; // browser doesn't support it
        if (!("serviceWorker" in navigator)) return;

        if (Notification.permission === "granted") {
            if (!registeredRef.current) {
                // Already granted — register silently once (covers re-login scenario)
                registeredRef.current = true;
                registerAndStoreToken(userId, userRole).catch(() => { });
            }
            setPushEnabled(true);
        } else if (Notification.permission === "default") {
            // Not yet asked — show our in-app banner after 2 seconds
            const t = setTimeout(() => setShowPrompt(true), 2000);
            return () => clearTimeout(t);
        }
        // If "denied" — do nothing, respect user's choice
    }, [userId, userRole]);

    // Called when user taps "Enable" in our banner — iOS user gesture satisfied ✅
    const requestPushPermission = useCallback(async () => {
        setShowPrompt(false);
        try {
            const permission = await Notification.requestPermission();
            if (permission === "granted") {
                setPushEnabled(true);
                await registerAndStoreToken(userId!, userRole!);
            }
        } catch (err) {
            console.warn("[Push] Permission request failed:", err);
        }
    }, [userId, userRole]);

    const dismissPrompt = useCallback(() => {
        setShowPrompt(false);
        // Re-show after 24 hours via localStorage
        localStorage.setItem("pushPromptDismissed", String(Date.now()));
    }, []);

    // Don't re-show if dismissed within last 24 hours
    useEffect(() => {
        const dismissed = localStorage.getItem("pushPromptDismissed");
        if (dismissed && Date.now() - Number(dismissed) < 86400000) {
            setShowPrompt(false);
        }
    }, []);

    // Listen for foreground messages (app open)
    // IMPORTANT: Use reg.showNotification() with the same `tag` as the service worker
    // so that if the SW also fires (ambiguous foreground/background state), the OS
    // deduplicates them and the user only ever sees ONE notification.
    useEffect(() => {
        if (!userId || !pushEnabled) return;
        const unsubscribe = onMessage(messaging, async (payload) => {
            const { title, body } = payload.notification || {};
            if (Notification.permission !== "granted" || !title) return;
            try {
                const reg = await navigator.serviceWorker.getRegistration("/");
                if (reg) {
                    // Show via the SW registration so `tag` deduplication applies
                    reg.showNotification(title, {
                        body: body || "",
                        icon: "/icon-192x192.png",
                        badge: "/favicon-32.png",
                        tag: "worshipflow-notif",  // same tag as firebase-messaging-sw.js
                        renotify: true,
                        data: payload.data || {},
                    } as NotificationOptions);
                } else {
                    // Fallback: no SW available
                    new Notification(title, { body: body || "", icon: "/icon-192x192.png" });
                }
            } catch {
                new Notification(title, { body: body || "", icon: "/icon-192x192.png" });
            }
        });
        return () => unsubscribe();
    }, [userId, pushEnabled]);

    return { showPrompt, pushEnabled, requestPushPermission, dismissPrompt };
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
