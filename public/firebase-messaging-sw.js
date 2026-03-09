// WorshipFlow — Firebase Cloud Messaging Service Worker
// Handles push notifications when the app is in the background or closed.
// Also handles deep-linking when the user taps a notification.

importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

firebase.initializeApp({
    apiKey: "AIzaSyDiFuHQ3qUTdvZ7qppCqJRlCBgxJM3vhw0",
    authDomain: "worshipflow-1fbe0.firebaseapp.com",
    projectId: "worshipflow-1fbe0",
    storageBucket: "worshipflow-1fbe0.firebasestorage.app",
    messagingSenderId: "1007052719455",
    appId: "1:1007052719455:web:e0d6c338a503cdefcfe2ea",
});

const messaging = firebase.messaging();

// ── Background message handler ───────────────────────────────────────────────
// Called when app is closed or in background
messaging.onBackgroundMessage((payload) => {
    console.log("[FCM SW] Background message received:", payload);

    const { title, body, icon } = payload.notification || {};
    const notificationTitle = title || "WorshipFlow";

    // Pass FCM data payload into the notification so we can read it on tap
    const notificationOptions = {
        body: body || "",
        icon: icon || "/icon-192x192.png",
        badge: "/favicon-32.png",
        data: payload.data || {},   // ← deep-link data lives here
        tag: "worshipflow-notif",   // replaces previous notification (no stacking)
        renotify: true,
        vibrate: [200, 100, 200],
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

// ── Notification tap handler ─────────────────────────────────────────────────
// Called when user taps the notification banner or lock screen notification
self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    // Read the deep-link data we attached above
    const data = event.notification.data || {};
    let targetUrl = "/";

    if (data.deepLink) {
        // Use the pre-built deep link from the server
        targetUrl = data.deepLink;
    } else if (data.type === "new_song" && data.resourceId) {
        targetUrl = `/?notif=new_song&id=${data.resourceId}`;
    } else if ((data.type === "new_event" || data.type === "updated_event") && data.resourceId) {
        targetUrl = `/?notif=${data.type}&id=${data.resourceId}${data.resourceDate ? `&date=${data.resourceDate}` : ""}`;
    } else if (data.type === "access_request") {
        targetUrl = "/?notif=access_request";
    }

    const fullUrl = self.location.origin + targetUrl;

    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
            // If app window already open — navigate it to the right page and focus
            for (const client of clientList) {
                if (client.url.startsWith(self.location.origin) && "navigate" in client) {
                    client.navigate(fullUrl);
                    return client.focus();
                }
            }
            // App is fully closed — open a new window at the right URL
            if (clients.openWindow) {
                return clients.openWindow(fullUrl);
            }
        })
    );
});
