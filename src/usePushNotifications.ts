import { useEffect } from "react";
import { messaging, getToken, onMessage, VAPID_KEY } from "./firebase";

/**
 * usePushNotifications
 * - Requests notification permission from the browser
 * - Gets FCM token and stores it in Firestore (via API)
 * - Listens for foreground messages and shows them as browser notifications
 */
export function usePushNotifications(userId: string | null, userRole: string | null) {
    useEffect(() => {
        if (!userId || !userRole) return;

        async function setupPush() {
            try {
                // 1. Check if browser supports notifications
                if (!("Notification" in window)) {
                    console.log("This browser does not support notifications.");
                    return;
                }

                // 2. Request permission
                const permission = await Notification.requestPermission();
                if (permission !== "granted") {
                    console.log("Notification permission denied.");
                    return;
                }

                // 3. Register service worker (our FCM background handler)
                const registration = await navigator.serviceWorker.register(
                    "/firebase-messaging-sw.js",
                    { scope: "/" }
                );

                // 4. Get FCM token
                const token = await getToken(messaging, {
                    vapidKey: VAPID_KEY,
                    serviceWorkerRegistration: registration,
                });

                if (!token) {
                    console.log("No FCM token received.");
                    return;
                }

                // 5. Store token in Firestore via API (linked to this user + role)
                await fetch("/api/fcm-token", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, role: userRole, token }),
                });

                console.log("✅ Push notifications enabled. FCM token stored.");

            } catch (err) {
                // Silently fail — push notifications are optional
                console.warn("Push notification setup failed:", err);
            }
        }

        setupPush();
    }, [userId, userRole]);

    // Listen for foreground messages (app is open)
    useEffect(() => {
        if (!userId) return;

        const unsubscribe = onMessage(messaging, (payload) => {
            const { title, body } = payload.notification || {};
            // Show native browser notification even when app is open
            if (Notification.permission === "granted" && title) {
                new Notification(title, {
                    body: body || "",
                    icon: "/icon-192x192.png",
                    badge: "/favicon-32.png",
                });
            }
        });

        return () => unsubscribe();
    }, [userId]);
}
