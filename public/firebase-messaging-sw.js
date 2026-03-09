// WorshipFlow — Firebase Cloud Messaging Service Worker
// This handles push notifications when the app is in the background or closed.

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

// Handle background messages (app is closed or in background)
messaging.onBackgroundMessage((payload) => {
    console.log("[firebase-messaging-sw.js] Background message received:", payload);

    const { title, body, icon } = payload.notification || {};
    const notificationTitle = title || "WorshipFlow";
    const notificationOptions = {
        body: body || "",
        icon: icon || "/icon-192x192.png",
        badge: "/favicon-32.png",
        data: payload.data || {},
        tag: "worshipflow-notif", // replaces previous if same tag (avoids stacking)
        renotify: true,
        vibrate: [200, 100, 200],
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click — open the app
self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
            // If app is already open, focus it
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && "focus" in client) {
                    return client.focus();
                }
            }
            // Otherwise open a new window
            if (clients.openWindow) {
                return clients.openWindow("/");
            }
        })
    );
});
