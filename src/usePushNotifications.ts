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

        // Small delay so the app fully loads before showing the permission dialog
        const timer = setTimeout(async () => {
            try {
                // 1. Check if browser supports notifications
                if (!("Notification" in window)) {
                    console.log("[Push] Browser does not support notifications.");
                    return;
                }

                console.log("[Push] Current permission:", Notification.permission);

                // 2. Request permission (shows the dialog to user)
                const permission = await Notification.requestPermission();
                console.log("[Push] Permission response:", permission);

                if (permission !== "granted") {
                    console.log("[Push] Permission not granted.");
                    return;
                }

                // 3. Register the Firebase messaging service worker
                if (!("serviceWorker" in navigator)) {
                    console.log("[Push] Service workers not supported.");
                    return;
                }

                const registration = await navigator.serviceWorker.register(
                    "/firebase-messaging-sw.js",
                    { scope: "/" }
                );
                console.log("[Push] Service worker registered:", registration.scope);

                // Wait for service worker to be ready
                await navigator.serviceWorker.ready;

                // 4. Get FCM token
                const token = await getToken(messaging, {
                    vapidKey: VAPID_KEY,
                    serviceWorkerRegistration: registration,
                });

                if (!token) {
                    console.log("[Push] No FCM token received.");
                    return;
                }

                console.log("[Push] FCM token obtained, storing...");

                // 5. Store token in Firestore via API
                await fetch("/api/fcm-token", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, role: userRole, token }),
                });

                console.log("✅ [Push] Push notifications fully enabled!");

            } catch (err) {
                console.warn("[Push] Setup failed (non-critical):", err);
            }
        }, 3000); // 3 second delay after login

        return () => clearTimeout(timer);
    }, [userId, userRole]);

    // Listen for foreground messages (app is open and in focus)
    useEffect(() => {
        if (!userId) return;

        const unsubscribe = onMessage(messaging, (payload) => {
            console.log("[Push] Foreground message received:", payload);
            const { title, body } = payload.notification || {};
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
