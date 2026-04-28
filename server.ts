import * as dotenv from "dotenv";
dotenv.config();

import express from "express";
import compression from "compression";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import { GoogleGenAI } from "@google/genai";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(compression()); // gzip all API responses
app.use(express.json({ limit: "50mb" }));


// Text formatting helpers
const toTitleCase = (str: string) =>
  str.trim().replace(/\b\w/g, (char) => char.toUpperCase());

/**
 * Normalize lyrics for comparison:
 *  - lowercase
 *  - strip section labels (Verse, Chorus, Bridge, etc.)
 *  - remove all non-alphanumeric characters
 */
function normalizeLyrics(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b(verse|chorus|bridge|pre[-\s]?chorus|outro|intro|tag|refrain|hook|interlude)\b/gi, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Returns true if two lyrics bodies are duplicates.
 * Strategy:
 *  1. Exact match after normalization.
 *  2. Jaccard similarity of significant words (>3 chars) ≥ 85%.
 */
function lyricsAreDuplicate(a: string, b: string): boolean {
  const na = normalizeLyrics(a);
  const nb = normalizeLyrics(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  // Word-bag Jaccard similarity
  const wordsOf = (s: string) =>
    new Set(s.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wa = wordsOf(a);
  const wb = wordsOf(b);
  const intersection = [...wa].filter(w => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return union > 0 && intersection / union >= 0.85;
}

// Firebase Initialization
let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
  if (!db) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      console.warn("Firebase environment variables are missing. CRUD operations will fail.");
      return null;
    }

    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
      });
    }
    db = admin.firestore();
    // preferRest: true forces HTTPS/REST instead of gRPC.
    // gRPC uses persistent TCP which is often blocked by mobile carriers / NAT.
    // REST uses standard port 443 (HTTPS) which always works on any network.
    db.settings({ ignoreUndefinedProperties: true, preferRest: true });
  }
  return db;
}

// Global 30-second timeout middleware — every API route must respond within 30s
// (30s allows for slow Firebase connections, e.g. mobile hotspot)
app.use('/api', (req, res, next) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      console.error(`[TIMEOUT] ${req.method} ${req.path} timed out after 30s`);
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
    }
  }, 30000);
  res.on('finish', () => clearTimeout(timeout));
  res.on('close', () => clearTimeout(timeout));
  next();
});

// ── Global crash guard ────────────────────────────────────────────────────────
// Prevents the server from crashing when a Firestore query completes AFTER the
// timeout middleware already sent a 503 response (ERR_HTTP_HEADERS_SENT).
// This is a known race condition when Firebase is slow (e.g. on a mobile hotspot).
process.on('uncaughtException', (err: any) => {
  if (err?.code === 'ERR_HTTP_HEADERS_SENT') {
    // Harmless — the timeout already responded, ignore the late Firestore reply
    console.warn('[WARN] Late Firestore response after timeout (harmless, suppressed)', err?.message);
    return;
  }
  // Any other uncaught exception IS serious — log it and exit
  console.error('[FATAL] Uncaught exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason: any) => {
  if (reason?.code === 'ERR_HTTP_HEADERS_SENT') {
    console.warn('[WARN] Late Firestore rejection after timeout (harmless, suppressed)', reason?.message);
    return;
  }
  console.error('[WARN] Unhandled rejection:', reason);
  // Do NOT exit — unhandled rejections are common with optional Firestore calls
});

// ── Notification helpers ────────────────────────────────────────────────────

// Send FCM push to relevant devices
async function sendPushNotification(firestore: admin.firestore.Firestore, payload: {
  title: string;
  body: string;
  actorUserId?: string;
  recipientUserId?: string;       // for "direct" audience — send only to this user
  targetAudience: "all" | "non_member" | "admin_only" | "direct";
  type?: string;
  resourceId?: string;
  resourceDate?: string;
}) {
  try {
    const tokensSnap = await firestore.collection("fcm_tokens").get();
    if (tokensSnap.empty) return;

    const tokens: string[] = [];
    tokensSnap.docs.forEach(doc => {
      const data = doc.data();
      const token: string = data.token;
      const role: string = data.role || "member";
      const tokenUserId: string = data.userId || "";
      if (!token) return;
      // Direct: only the specific recipient gets this push
      if (payload.targetAudience === "direct") {
        if (tokenUserId === payload.recipientUserId) tokens.push(token);
        return;
      }
      if (payload.actorUserId && tokenUserId === payload.actorUserId) return;
      if (payload.targetAudience === "admin_only" && role !== "admin") return;
      if (payload.targetAudience === "non_member" && role === "member") return;
      tokens.push(token);
    });

    if (tokens.length === 0) return;

    // Build deep-link URL for notification tap
    let deepLink = "/";
    if (payload.type === "new_song" && payload.resourceId) {
      deepLink = `/?notif=new_song&id=${payload.resourceId}`;
    } else if ((payload.type === "new_event" || payload.type === "updated_event") && payload.resourceId) {
      deepLink = `/?notif=${payload.type}&id=${payload.resourceId}${payload.resourceDate ? `&date=${payload.resourceDate}` : ""}`;
    } else if (payload.type === "access_request") {
      deepLink = "/?notif=access_request";
    }

    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500);
      const response = await admin.messaging().sendEachForMulticast({
        tokens: batch,
        // Data payload — passed to service worker for deep linking
        data: {
          type: payload.type || "",
          resourceId: payload.resourceId || "",
          resourceDate: payload.resourceDate || "",
          deepLink,
        },
        notification: { title: payload.title, body: payload.body },
        webpush: {
          notification: {
            title: payload.title,
            body: payload.body,
            icon: "/icon-192x192.png",
            badge: "/favicon-32.png",
            vibrate: [200, 100, 200],
          },
          fcmOptions: { link: deepLink },
        },
      });
      response.responses.forEach((r, idx) => {
        if (!r.success && (r.error?.code === "messaging/invalid-registration-token" || r.error?.code === "messaging/registration-token-not-registered")) {
          firestore.collection("fcm_tokens").where("token", "==", batch[idx]).get()
            .then(snap => snap.docs.forEach(d => d.ref.delete()))
            .catch(() => { });
        }
      });
    }
  } catch (e) {
    console.error("Failed to send push notification:", e);
  }
}

// ── Planner notification anti-spam ─────────────────────────────────────────
// Layer 3: Actor rate limit — max 10 notification triggers per actor per 60s
const actorRateMap = new Map<string, { count: number; since: number }>();
function checkActorRateLimit(actorId: string): boolean {
  const now = Date.now();
  const entry = actorRateMap.get(actorId);
  if (!entry || now - entry.since > 60_000) {
    actorRateMap.set(actorId, { count: 1, since: now }); return true;
  }
  if (entry.count >= 10) return false;
  entry.count++; return true;
}

// Layer 2: Cooldown windows (ms) per notification type
const NOTIF_COOLDOWNS_MS: Record<string, number> = {
  planner_comment:  5  * 60 * 1000,   // 5 min — rapid comments on same card
  planner_assigned: 10 * 60 * 1000,   // 10 min — reassignment spam
  planner_mention:  2  * 60 * 1000,   // 2 min — urgent but still protected
  planner_moved:    10 * 60 * 1000,   // 10 min — card bouncing between lists
  planner_due:      24 * 60 * 60 * 1000, // 24h — once per day max
};
async function isPlannerCoolingDown(
  firestore: admin.firestore.Firestore,
  recipientId: string, cardId: string, type: string
): Promise<boolean> {
  const cooldownMs = NOTIF_COOLDOWNS_MS[type] ?? 5 * 60 * 1000;
  const since = admin.firestore.Timestamp.fromDate(new Date(Date.now() - cooldownMs));
  try {
    const snap = await firestore.collection("notifications")
      .where("recipientId", "==", recipientId)
      .where("resourceId", "==", cardId)
      .where("type", "==", type)
      .where("createdAt", ">=", since)
      .limit(1).get();
    return !snap.empty;
  } catch { return false; }
}
function plannerTypeVerb(type: string): string {
  switch (type) {
    case "planner_comment":  return "commented on";
    case "planner_assigned": return "assigned you to";
    case "planner_mention":  return "mentioned you in";
    case "planner_moved":    return "moved";
    default: return "updated";
  }
}

async function writeNotification(firestore: admin.firestore.Firestore, payload: {
  type: "new_event" | "updated_event" | "new_song" | "access_request" | "team_note" | "note_resolved" | "note_done" | "note_acknowledged";
  message: string;
  subMessage: string;
  actorName: string;
  actorPhoto: string;
  actorUserId?: string;
  targetAudience: "all" | "non_member" | "admin_only";
  resourceId?: string;
  resourceType?: string;
  resourceDate?: string;
}) {
  try {
    // Write in-app notification to Firestore
    await firestore.collection("notifications").add({
      ...payload,
      readBy: [],
      deletedBy: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // Fire push notification to devices (fire-and-forget)
    sendPushNotification(firestore, {
      title: payload.message,
      body: payload.subMessage,
      actorUserId: payload.actorUserId,
      targetAudience: payload.targetAudience,
      type: payload.type,
      resourceId: payload.resourceId,
      resourceDate: payload.resourceDate,
    });
  } catch (e) {
    console.error("Failed to write notification:", e);
  }
}

// ── Live Stage SSE — real-time lyrics push to OBS Browser Source ─────────────
// No auth required — these endpoints are local-only (localhost:3000).
// The controller POSTs to /api/live-push; OBS subscribes to /api/live-sse.

let liveState: Record<string, unknown> = { visible: false, lines: [], songTitle: "", animStyle: "word-fade", updatedAt: 0 };
const sseClients = new Set<import("express").Response>();

// POST /api/live-push — controller writes the active slide
app.post("/api/live-push", (req, res) => {
  liveState = { ...req.body, updatedAt: Date.now() };
  // Broadcast to all connected SSE clients (OBS display pages)
  const payload = `data: ${JSON.stringify(liveState)}\n\n`;
  sseClients.forEach(client => { try { client.write(payload); } catch { sseClients.delete(client); } });
  res.json({ ok: true, clients: sseClients.size });
});

// GET /api/live-sse — OBS Browser Source subscribes here
app.get("/api/live-sse", (req, res) => {
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  // Send current state immediately so OBS has something on connect
  res.write(`data: ${JSON.stringify(liveState)}\n\n`);

  // Keep-alive ping every 25 s (prevents OBS from closing the connection)
  const ping = setInterval(() => { try { res.write(`: ping\n\n`); } catch { clearInterval(ping); } }, 25000);

  sseClients.add(res);
  req.on("close", () => { sseClients.delete(res); clearInterval(ping); });
});

// GET /api/live-state — simple polling fallback (more reliable in OBS CEF)
app.get("/api/live-state", (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache, no-store");
  res.json(liveState);
});

// ── Live background video — local file upload ──────────────────────────────────
// The app uploads the video here; OBS fetches /api/live-bg-video to play it.
// Blob: URLs only live in the source tab's process — OBS needs a real HTTP URL.
let liveBgVideoBuffer: Buffer | null = null;
let liveBgVideoMime   = "video/mp4";

// POST /api/live-bg-video — controller uploads the video file
app.post("/api/live-bg-video", multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } }).single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  liveBgVideoBuffer = req.file.buffer;
  liveBgVideoMime   = req.file.mimetype || "video/mp4";
  console.log(`[LiveBG] Video uploaded: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(1)} MB)`);
  res.json({ ok: true, url: "/api/live-bg-video" });
});

// GET /api/live-bg-video — OBS Browser Source fetches video from here
app.get("/api/live-bg-video", (_req, res) => {
  if (!liveBgVideoBuffer) return res.status(404).json({ error: "No video uploaded" });
  res.setHeader("Content-Type", liveBgVideoMime);
  res.setHeader("Content-Length", liveBgVideoBuffer.length);
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(liveBgVideoBuffer);
});

// DELETE /api/live-bg-video — clear stored video
app.delete("/api/live-bg-video", (_req, res) => {
  liveBgVideoBuffer = null;
  res.json({ ok: true });
});

// GET /api/playlist-manifest/:slug — dynamic PWA manifest for public playlist pages
// iOS Safari rejects blob: URLs for manifests; this real endpoint returns a manifest
// with start_url and scope set to /p/:slug so "Add to Home Screen" opens the right page.
app.get("/api/playlist-manifest/:slug", (req, res) => {
  const { slug } = req.params;
  const pageUrl = `/p/${slug}`;
  const manifest = {
    name: "WorshipFlow",
    short_name: "WorshipFlow",
    description: "Worship team scheduling, song & member management",
    start_url: pageUrl,
    scope: pageUrl,
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#6366f1",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  };
  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "no-store");
  res.json(manifest);
});

// POST /api/fcm-token — store FCM device token for a user

app.post("/api/fcm-token", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.json({ success: true });
  const { userId, role, token, email } = req.body;
  if (!userId || !token) return res.status(400).json({ error: "userId and token required" });
  try {
    const docId = `${userId}_${token.slice(-20)}`;
    await firestore.collection("fcm_tokens").doc(docId).set({
      userId, email: (email || "").toLowerCase(), role: role || "member", token,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to store token" }); }
});

// ─── BIRTHDAY WISH ────────────────────────────────────────────────────────────

// GET /api/birthday-wish?memberId=&date= — fetch existing wishes for a celebrant
app.get("/api/birthday-wish", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.json({ wishes: [], wishers: [] });
  const memberId = (req.query.memberId as string) || "";
  const date = (req.query.date as string) || "";
  if (!memberId || !date) return res.status(400).json({ error: "memberId and date required" });
  try {
    const docId = `${memberId}_${date}`;
    const snap = await firestore.collection("birthday_reactions").doc(docId).get();
    if (!snap.exists) return res.json({ wishes: [], wishers: [] });
    const data = snap.data()!;
    return res.json({ wishes: data.wishes ?? [], wishers: data.wishers ?? [] });
  } catch (e) {
    return res.json({ wishes: [], wishers: [] });
  }
});

// POST /api/birthday-wish — send a birthday wish
app.post("/api/birthday-wish", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { memberId, memberName, memberEmail, date, senderUserId, senderName, senderPhoto, message } = req.body;
  if (!memberId || !date || !senderUserId || !senderName)
    return res.status(400).json({ error: "Missing required fields" });
  try {
    const docId = `${memberId}_${date}`;
    const ref = firestore.collection("birthday_reactions").doc(docId);
    const snap = await ref.get();
    const MAX_WISHES = 1;
    if (snap.exists) {
      const existingWishes: any[] = snap.data()?.wishes ?? [];
      const senderCount = existingWishes.filter((w: any) => w.userId === senderUserId).length;
      if (senderCount >= MAX_WISHES) return res.status(429).json({ error: `Wish limit reached (max ${MAX_WISHES} per day)` });
    }
    const wish = {
      userId: senderUserId,
      name: senderName,
      photo: senderPhoto || "",
      message: message?.trim() || "",
      sentAt: new Date().toISOString(),
    };
    if (!snap.exists) {
      await ref.set({ memberId, date, reactions: {}, wishers: [senderUserId], wisherNames: [senderName], wishes: [wish] });
    } else {
      await ref.update({
        wishers: admin.firestore.FieldValue.arrayUnion(senderUserId),
        wisherNames: admin.firestore.FieldValue.arrayUnion(senderName),
        wishes: admin.firestore.FieldValue.arrayUnion(wish),
      });
    }
    return res.json({ success: true });
  } catch (e) {
    console.error("birthday-wish POST failed:", e);
    return res.status(500).json({ error: "Failed to save wish" });
  }
});

// DELETE /api/birthday-wish — remove sender's own wish
app.delete("/api/birthday-wish", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { memberId, date, senderUserId } = req.body;
  if (!memberId || !date || !senderUserId)
    return res.status(400).json({ error: "memberId, date, senderUserId required" });
  try {
    const docId = `${memberId}_${date}`;
    const ref = firestore.collection("birthday_reactions").doc(docId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "No wishes found" });
    const data = snap.data()!;
    const wishes: any[] = data.wishes ?? [];
    const toRemove = wishes.find((w: any) => w.userId === senderUserId);
    if (!toRemove) return res.status(404).json({ error: "Wish not found" });
    await ref.update({
      wishes: admin.firestore.FieldValue.arrayRemove(toRemove),
      wishers: admin.firestore.FieldValue.arrayRemove(senderUserId),
      wisherNames: admin.firestore.FieldValue.arrayRemove(toRemove.name ?? ""),
    });
    return res.json({ success: true });
  } catch (e) {
    console.error("birthday-wish DELETE failed:", e);
    return res.status(500).json({ error: "Failed to delete wish" });
  }
});


// ── Team Chat ─────────────────────────────────────────────────────────────────

// GET /api/chat/messages?channelId=xxx — fetch last 50 messages
app.get("/api/chat/messages", async (req, res) => {
  if (res.headersSent) return;
  const firestore = getDb();
  if (!firestore) return res.json([]);
  const channelId = req.query.channelId as string;
  if (!channelId) return res.status(400).json({ error: "channelId required" });
  try {
    const snap = await firestore
      .collection("chat_channels")
      .doc(channelId)
      .collection("messages")
      .orderBy("createdAt", "asc")
      .limitToLast(50)
      .get();
    const messages = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        // Serialize Firestore Timestamp → ISO string for JSON
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
      };
    });
    res.json(messages);
  } catch (e) {
    console.error("chat GET failed:", e);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// POST /api/chat/message — send a message
app.post("/api/chat/message", async (req, res) => {
  if (res.headersSent) return;
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { channelId, userId, userName, userPhoto, text, replyTo, imageUrl } = req.body;
  if (!channelId || (!text?.trim() && !imageUrl) || !userId) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  try {
    const mentions = (text?.match(/@(\S+)/g) ?? []).map((m: string) => m.slice(1));
    const ref = await firestore
      .collection("chat_channels")
      .doc(channelId)
      .collection("messages")
      .add({
        userId,
        userName: userName || "",
        userPhoto: userPhoto || "",
        text: text?.trim() || "",
        mentions,
        ...(replyTo   ? { replyTo }   : {}),
        ...(imageUrl  ? { imageUrl }  : {}),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    res.json({ id: ref.id });
  } catch (e) {
    console.error("chat POST failed:", e);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// POST /api/chat/reaction — toggle emoji reaction on a message
app.post("/api/chat/reaction", async (req, res) => {
  if (res.headersSent) return;
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { channelId, messageId, emoji, userId, action } = req.body;
  if (!channelId || !messageId || !emoji || !userId || !action) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  try {
    await firestore
      .collection("chat_channels").doc(channelId)
      .collection("messages").doc(messageId)
      .update({
        [`reactions.${emoji}`]: action === "remove"
          ? admin.firestore.FieldValue.arrayRemove(userId)
          : admin.firestore.FieldValue.arrayUnion(userId),
      });
    res.json({ ok: true });
  } catch (e) {
    console.error("reaction toggle failed:", e);
    res.status(500).json({ error: "Failed to toggle reaction" });
  }
});

// POST /api/chat/pin — toggle pin on a message
app.post("/api/chat/pin", async (req, res) => {
  if (res.headersSent) return;
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { channelId, messageId, pinned } = req.body;
  if (!channelId || !messageId) return res.status(400).json({ error: "Missing fields" });
  try {
    await firestore
      .collection("chat_channels").doc(channelId)
      .collection("messages").doc(messageId)
      .update({ pinned: !!pinned });
    res.json({ ok: true });
  } catch (e) {
    console.error("pin toggle failed:", e);
    res.status(500).json({ error: "Failed to toggle pin" });
  }
});

// DELETE /api/chat/message/:id — delete a message
app.delete("/api/chat/message/:id", async (req, res) => {
  if (res.headersSent) return;
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { id } = req.params;
  const { channelId } = req.body;
  if (!id || !channelId) return res.status(400).json({ error: "Missing id or channelId" });
  try {
    await firestore
      .collection("chat_channels")
      .doc(channelId)
      .collection("messages")
      .doc(id)
      .delete();
    res.json({ ok: true });
  } catch (e) {
    console.error("chat DELETE failed:", e);
    res.status(500).json({ error: "Failed to delete message" });
  }
});

// PATCH /api/chat/message/:id — edit a message
app.patch("/api/chat/message/:id", async (req, res) => {
  if (res.headersSent) return;
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { id } = req.params;
  const { channelId, text, userId } = req.body;
  if (!id || !channelId || !text?.trim() || !userId) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  try {
    const msgRef = firestore
      .collection("chat_channels").doc(channelId)
      .collection("messages").doc(id);
    const snap = await msgRef.get();
    if (!snap.exists) return res.status(404).json({ error: "Message not found" });
    if (snap.data()?.userId !== userId) return res.status(403).json({ error: "Cannot edit another user's message" });
    await msgRef.update({
      text: text.trim(),
      editedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ ok: true });
  } catch (e) {
    console.error("chat PATCH failed:", e);
    res.status(500).json({ error: "Failed to edit message" });
  }
});

// ── Help KB read tracking ─────────────────────────────────────────────────────

// POST /api/help/read — mark an article as read for a user
app.post("/api/help/read", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.json({ ok: true });
  const { userId, userName, userEmail, userPhoto, articleId, articleTitle } = req.body;
  if (!userId || !articleId) return res.status(400).json({ error: "Missing fields" });
  try {
    const docId = `${userId}_${articleId}`;
    await firestore.collection("help_reads").doc(docId).set({
      userId,
      userName: userName || "",
      userEmail: (userEmail || "").toLowerCase(),
      userPhoto: userPhoto || "",
      articleId,
      articleTitle: articleTitle || "",
      readAt: new Date().toISOString(),
    }, { merge: true });
    return res.json({ ok: true });
  } catch (e) {
    return res.json({ ok: true }); // silent — never block the UI
  }
});

// GET /api/help/reads — get all reads (admin only)
app.get("/api/help/reads", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.json([]);
  try {
    const snap = await firestore.collection("help_reads").get();
    return res.json(snap.docs.map(d => d.data()));
  } catch (e) {
    return res.json([]);
  }
});

// GET /api/help/suggestions — get all guide suggestions
app.get("/api/help/suggestions", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.json([]);
  try {
    const snap = await firestore.collection("help_suggestions")
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
    return res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) {
    return res.json([]);
  }
});

// POST /api/help/suggestion — submit a new guide suggestion
app.post("/api/help/suggestion", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { userId, userName, userPhoto, text } = req.body;
  if (!userId || !text?.trim()) return res.status(400).json({ error: "Missing fields" });
  try {
    const ref = await firestore.collection("help_suggestions").add({
      userId,
      userName: userName || "",
      userPhoto: userPhoto || "",
      text: text.trim(),
      createdAt: new Date().toISOString(),
      status: "pending",
    });
    return res.json({ id: ref.id, ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to submit suggestion" });
  }
});

// PATCH /api/help/suggestion/:id — update status OR text
app.patch("/api/help/suggestion/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { id } = req.params;
  const { status, text } = req.body;
  const update: Record<string, string> = {};
  if (status !== undefined) {
    if (!["pending", "noted", "done"].includes(status)) return res.status(400).json({ error: "Invalid status" });
    update.status = status;
  }
  if (text !== undefined) {
    if (!text.trim()) return res.status(400).json({ error: "Text cannot be empty" });
    update.text = text.trim();
    update.editedAt = new Date().toISOString();
  }
  if (Object.keys(update).length === 0) return res.status(400).json({ error: "Nothing to update" });
  try {
    await firestore.collection("help_suggestions").doc(id).update(update);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to update suggestion" });
  }
});

// DELETE /api/help/suggestion/:id — remove a suggestion
app.delete("/api/help/suggestion/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { id } = req.params;
  try {
    await firestore.collection("help_suggestions").doc(id).delete();
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to delete suggestion" });
  }
});



// GET /api/user-flags?userId=xxx — get per-user boolean flags (cross-device)
app.get("/api/user-flags", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.json({});
  const userId = (req.query.userId as string) || "";
  if (!userId) return res.json({});
  try {
    const doc = await firestore.collection("user_flags").doc(userId).get();
    return res.json(doc.exists ? doc.data() : {});
  } catch (e) { res.json({}); }
});

// POST /api/user-flags — set a flag for a user
app.post("/api/user-flags", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.json({ success: true });
  const { userId, ...flags } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    await firestore.collection("user_flags").doc(userId).set(flags, { merge: true });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to set flag" }); }
});

// ── Broadcast / App Announcement endpoints ────────────────────────────────

// GET /api/broadcasts — check if there's an active broadcast for this user
app.get("/api/broadcasts", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.json(null);
  const email = (req.query.email as string) || "";
  if (!email) return res.json(null);
  try {
    // No composite index needed — filter active only, sort in memory
    const snap = await firestore.collection("broadcasts")
      .where("active", "==", true).get();
    const now = Date.now();
    const docs = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    for (const data of docs) {
      // ── Schedule window check ──────────────────────────────────────
      if (data.scheduledStart && new Date(data.scheduledStart).getTime() > now) continue; // not yet started
      if (data.scheduledEnd   && new Date(data.scheduledEnd).getTime()   < now) continue; // already expired
      // ── Audience check ────────────────────────────────────────────
      const targets: string[] = data.targetEmails || [];
      const isAll = targets.includes("__all__");
      const isTargeted = targets.includes(email);
      if (!isAll && !isTargeted) continue;
      if (data.type === "whats_new") {
        const dismissed: string[] = data.dismissedBy || [];
        if (dismissed.includes(email)) continue;
      }
      return res.json(data);
    }
    return res.json(null);
  } catch (e) { console.error("broadcasts fetch error:", e); res.status(500).json(null); }
});

// GET /api/broadcasts/all — admin list all broadcasts
app.get("/api/broadcasts/all", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.json([]);
  try {
    // No composite index — fetch all, sort in memory
    const snap = await firestore.collection("broadcasts").get();
    const sorted = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    return res.json(sorted);
  } catch (e) { res.status(500).json([]); }
});

// GET /api/release-notes — serve curated release notes from public/release-notes.json
app.get("/api/release-notes", async (_req, res) => {
  try {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "public", "release-notes.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);

    // Collect ALL highlights across all releases (newest first)
    const allHighlights: string[] = [];
    for (const release of (data.releases ?? [])) {
      for (const h of (release.highlights ?? [])) {
        allHighlights.push(h);
      }
    }

    // Return the latest batch (up to 8 bullet points — wow moments only)
    const bulletPoints = allHighlights.slice(0, 8);
    const today = new Date().toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" });

    res.json({
      title: data.title ?? `What's New — ${today}`,
      message: data.message ?? "Here's what's new in WorshipFlow:",
      bulletPoints,
    });
  } catch (e) {
    res.status(500).json({ error: "Could not load release notes" });
  }
});

// POST /api/broadcasts — create a new broadcast (admin only)
app.post("/api/broadcasts", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { type, title, message, bulletPoints, targetEmails, scheduledStart, scheduledEnd } = req.body;
  if (!type || !title || !targetEmails) return res.status(400).json({ error: "Missing fields" });
  try {
    const ref = await firestore.collection("broadcasts").add({
      type, title, message: message || "", bulletPoints: bulletPoints || [],
      targetEmails, active: true, dismissedBy: [],
      ...(scheduledStart ? { scheduledStart } : {}),
      ...(scheduledEnd   ? { scheduledEnd }   : {}),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ id: ref.id });
  } catch (e) { res.status(500).json({ error: "Failed to create" }); }
});

// PATCH /api/broadcasts/:id — activate or deactivate
app.patch("/api/broadcasts/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { id } = req.params;
  const { active } = req.body;
  try {
    await firestore.collection("broadcasts").doc(id).update({ active });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to update" }); }
});

// DELETE /api/broadcasts/:id — delete a broadcast
app.delete("/api/broadcasts/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  try {
    await firestore.collection("broadcasts").doc(req.params.id).delete();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to delete" }); }
});

// PUT /api/broadcasts/:id — edit an existing broadcast (title, message, bullets, targets)
app.put("/api/broadcasts/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { title, message, bulletPoints, targetEmails, type, scheduledStart, scheduledEnd } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title is required" });
  try {
    const update: Record<string, any> = {
      title: title.trim(), message: message || "", bulletPoints: bulletPoints || [],
      targetEmails: targetEmails || ["__all__"], type: type,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    // Persist schedule fields — use FieldValue.delete() to clear if not provided
    update.scheduledStart = scheduledStart || admin.firestore.FieldValue.delete();
    update.scheduledEnd   = scheduledEnd   || admin.firestore.FieldValue.delete();
    await firestore.collection("broadcasts").doc(req.params.id).update(update);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to update broadcast" }); }
});

// POST /api/broadcasts/:id/dismiss — user dismissed "What's New"
app.post("/api/broadcasts/:id/dismiss", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Missing email" });
  try {
    await firestore.collection("broadcasts").doc(req.params.id).update({
      dismissedBy: admin.firestore.FieldValue.arrayUnion(email),
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to dismiss" }); }
});

// GET /api/notifications

app.get("/api/notifications", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.json([]);
  const role = (req.query.role as string) || "member";
  const userId = (req.query.userId as string) || "";
  try {
    const snap = await firestore.collection("notifications")
      .orderBy("createdAt", "desc").limit(50).get();
    const all = snap.docs.map(d => {
      const data = d.data() as Record<string, any>;
      const readBy: string[] = data.readBy || [];
      const deletedBy: string[] = data.deletedBy || [];
      return { id: d.id, ...data, isRead: readBy.includes(userId), createdAt: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(), _deletedBy: deletedBy } as Record<string, any>;
    });
    const filtered = all.filter(n => {
      // Self-exclusion: actor should not see their own notification
      if (userId && n["actorUserId"] === userId) return false;
      // Soft-deleted for this user
      if (n["_deletedBy"].includes(userId)) return false;
      // Personal / targeted notification — only visible to the specific user
      if (n["targetUserId"]) return n["targetUserId"] === userId;
      // Audience filter
      if (n["targetAudience"] === "all") return true;
      if (n["targetAudience"] === "admin_only") return role === "admin";
      if (n["targetAudience"] === "non_member") return role !== "member";
      // Direct (Planner): only the specific recipient sees this
      if (n["targetAudience"] === "direct") return n["recipientId"] === userId;
      return false;
    });
    if (res.headersSent) return; // timeout already responded
    res.json(filtered);
  } catch (e) { if (!res.headersSent) res.json([]); }
});

// PATCH /api/notifications/read — mark one or all as read
app.patch("/api/notifications/read", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.json({ success: true });
  const { userId, notifId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    if (notifId) {
      await firestore.collection("notifications").doc(notifId).update({ readBy: admin.firestore.FieldValue.arrayUnion(userId) });
    } else {
      const snap = await firestore.collection("notifications").get();
      const batch = firestore.batch();
      snap.docs.forEach(d => batch.update(d.ref, { readBy: admin.firestore.FieldValue.arrayUnion(userId) }));
      await batch.commit();
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to mark read" }); }
});

// PATCH /api/notifications/unread — mark one as unread
app.patch("/api/notifications/unread", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.json({ success: true });
  const { userId, notifId } = req.body;
  if (!userId || !notifId) return res.status(400).json({ error: "userId and notifId required" });
  try {
    await firestore.collection("notifications").doc(notifId).update({ readBy: admin.firestore.FieldValue.arrayRemove(userId) });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to mark unread" }); }
});

// DELETE /api/notifications/:id — soft-delete for this user
app.delete("/api/notifications/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.json({ success: true });
  const { id } = req.params;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    await firestore.collection("notifications").doc(id).update({ deletedBy: admin.firestore.FieldValue.arrayUnion(userId) });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to delete" }); }
});

// POST /api/planner/notify — batch anti-spam directed notifications for Planner events
// Accepts recipientIds (array) or recipientId (string, backward compat).
// Loops per-recipient server-side so the frontend only sends 1 request for N members.
app.post("/api/planner/notify", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.json({ ok: true, skipped: true, reason: "no-db" });

  const { actorId, actorName, actorPhoto,
          recipientId, recipientIds,           // accept both forms
          type, cardId, cardTitle, boardName } = req.body as Record<string, any>;

  if (!actorId || !type || !cardId)
    return res.status(400).json({ error: "Missing required fields" });

  // Normalise to array — support single recipientId for backward compat
  const targets: string[] = Array.isArray(recipientIds)
    ? recipientIds
    : recipientId ? [recipientId] : [];

  if (!targets.length)
    return res.status(400).json({ error: "No recipients specified" });

  // ── Layer 3: Actor rate limit (once per batch, not per recipient) ──────────
  if (!checkActorRateLimit(actorId))
    return res.json({ ok: true, skipped: true, reason: "rate-limit" });

  const verb  = plannerTypeVerb(type);
  const title = `${actorName} ${verb} "${cardTitle || "a card"}"`.slice(0, 100);
  const body  = boardName || "Planner";

  const results = await Promise.allSettled(targets.map(async (recipientId) => {
    // ── Layer 1: Self-suppression ────────────────────────────────────────────
    if (actorId === recipientId) return { skipped: true, reason: "self" };

    // ── Layer 2: Per-recipient cooldown check ────────────────────────────────
    if (await isPlannerCoolingDown(firestore, recipientId, cardId, type))
      return { skipped: true, reason: "cooldown" };

    // ✅ Write notification for this recipient
    await firestore.collection("notifications").add({
      type,
      message: title,
      subMessage: body,
      actorName:     actorName     || "Someone",
      actorPhoto:    actorPhoto    || "",
      actorUserId:   actorId,
      recipientId,
      targetAudience: "direct",
      resourceId:    cardId,
      resourceDate:  "",
      readBy:    [],
      deletedBy: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Push to this recipient's devices (fire-and-forget)
    sendPushNotification(firestore, {
      title, body,
      targetAudience: "direct",
      recipientUserId: recipientId,
      type,
      resourceId: cardId,
    });

    return { skipped: false };
  }));

  const sent    = results.filter(r => r.status === "fulfilled" && !(r.value as any).skipped).length;
  const skipped = results.length - sent;
  res.json({ ok: true, sent, skipped });
});

// DELETE /api/notifications — soft-delete all visible for this user
app.delete("/api/notifications", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.json({ success: true });
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const snap = await firestore.collection("notifications").get();
    const batch = firestore.batch();
    snap.docs.forEach(d => batch.update(d.ref, { deletedBy: admin.firestore.FieldValue.arrayUnion(userId) }));
    await batch.commit();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to clear" }); }
});

// API Routes
app.get("/api/songs", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });

  const search = req.query.search as string;
  const tagId = req.query.tagId as string;
  const sortBy = req.query.sortBy as string; // 'title', 'newest', 'joyful', 'solemn', 'english', 'tagalog'

  try {
    let query = firestore.collection("songs") as admin.firestore.Query;

    const snapshot = await query.get();
    let songs = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        created_at: data.created_at?.toDate?.()?.toISOString() || data.created_at,
        updated_at: data.updated_at?.toDate?.()?.toISOString() || data.updated_at
      } as any;
    });

    // Populate tags for filtering/sorting
    const tagsSnapshot = await firestore.collection("tags").get();
    const allTags = tagsSnapshot.docs.reduce((acc, doc) => {
      acc[doc.id] = { id: doc.id, ...doc.data() };
      return acc;
    }, {} as any);

    songs = songs.map(song => ({
      ...song,
      tags: (song.tagIds || []).map((id: string) => allTags[id]).filter(Boolean)
    }));

    // Client-side filtering
    if (search) {
      const s = search.toLowerCase();
      songs = songs.filter(song =>
        song.title?.toLowerCase().includes(s) ||
        song.artist?.toLowerCase().includes(s) ||
        song.lyrics?.toLowerCase().includes(s) ||
        song.chords?.toLowerCase().includes(s) ||
        song.tags?.some((t: any) => t.name?.toLowerCase().includes(s))
      );
    }

    if (tagId) {
      songs = songs.filter(song => song.tagIds?.includes(tagId));
    }

    // Sorting logic
    // Default: Sort by title
    songs.sort((a, b) => (a.title || "").localeCompare(b.title || ""));

    res.json(songs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch songs" });
  }
});

app.get("/api/songs/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });

  const { id } = req.params;
  try {
    const doc = await firestore.collection("songs").doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Song not found" });
    }

    const song = doc.data();
    const songWithId = {
      id: doc.id,
      ...song,
      created_at: song.created_at?.toDate?.()?.toISOString() || song.created_at,
      updated_at: song.updated_at?.toDate?.()?.toISOString() || song.updated_at
    } as any;

    // Populate tags
    const tagsSnapshot = await firestore.collection("tags").get();
    const allTags = tagsSnapshot.docs.reduce((acc, doc) => {
      acc[doc.id] = { id: doc.id, ...doc.data() };
      return acc;
    }, {} as any);

    res.json({
      ...songWithId,
      tags: (songWithId.tagIds || []).map((id: string) => allTags[id]).filter(Boolean)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch song" });
  }
});

app.post("/api/songs", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });

  const { title, artist, lyrics, chords, tags, video_url } = req.body;

  // Required field validation
  const missingFields: string[] = [];
  if (!title?.trim()) missingFields.push("Title");
  if (!artist?.trim()) missingFields.push("Artist");
  if (!lyrics?.trim()) missingFields.push("Lyrics");
  if (!tags || tags.length === 0) missingFields.push("Tags (at least one)");
  if (missingFields.length > 0) {
    return res.status(400).json({
      error: `The following required fields are missing: ${missingFields.join(", ")}.`,
    });
  }

  try {
    // Duplicate check: same title+artist OR highly similar lyrics
    const existing = await firestore.collection("songs").get();
    const normalizedTitle = title.trim().toLowerCase();
    const normalizedArtist = artist.trim().toLowerCase();
    const incomingLyrics = lyrics.trim();

    const duplicate = existing.docs.find((doc) => {
      const d = doc.data();
      const sameTA =
        (d.title || "").trim().toLowerCase() === normalizedTitle &&
        (d.artist || "").trim().toLowerCase() === normalizedArtist;
      const sameLyrics = lyricsAreDuplicate(incomingLyrics, d.lyrics || "");
      return sameTA || sameLyrics;
    });

    if (duplicate) {
      const d = duplicate.data();
      const matchedTitle = d.title || title;
      const matchedArtist = d.artist || artist;
      return res.status(409).json({
        error: `Duplicate song detected! This appears to be the same song as "${matchedTitle}" by "${matchedArtist}" already in the database. Please check the existing entry before adding.`,
      });
    }

    const docRef = await firestore.collection("songs").add({
      title: toTitleCase(title),
      artist: toTitleCase(artist),
      lyrics: lyrics.trim().toUpperCase(),
      chords: chords || "",
      tagIds: tags,
      video_url: video_url || "",
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    // Fire-and-forget notification
    const { actorName = "Someone", actorPhoto = "", actorUserId = "" } = req.body;
    writeNotification(firestore, {
      type: "new_song",
      message: `${actorName} added a new song`,
      subMessage: `🎵 "${toTitleCase(title)}" by ${toTitleCase(artist)}`,
      actorName, actorPhoto, actorUserId,
      targetAudience: "non_member",
      resourceId: docRef.id,
      resourceType: "song",
    });

    res.status(201).json({ id: docRef.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create song" });
  }
});

app.put("/api/songs/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });

  const { id } = req.params;
  const { title, artist, lyrics, chords, tags, video_url } = req.body;

  // Required field validation
  const missingFields: string[] = [];
  if (!title?.trim()) missingFields.push("Title");
  if (!artist?.trim()) missingFields.push("Artist");
  if (!lyrics?.trim()) missingFields.push("Lyrics");
  if (!tags || tags.length === 0) missingFields.push("Tags (at least one)");
  if (missingFields.length > 0) {
    return res.status(400).json({
      error: `The following required fields are missing: ${missingFields.join(", ")}.`,
    });
  }

  try {
    // Duplicate check: same title+artist OR highly similar lyrics (excluding self)
    const existing = await firestore.collection("songs").get();
    const normalizedTitle = title.trim().toLowerCase();
    const normalizedArtist = artist.trim().toLowerCase();
    const incomingLyrics = lyrics.trim();

    const duplicate = existing.docs.find((doc) => {
      if (doc.id === id) return false; // skip self
      const d = doc.data();
      const sameTA =
        (d.title || "").trim().toLowerCase() === normalizedTitle &&
        (d.artist || "").trim().toLowerCase() === normalizedArtist;
      const sameLyrics = lyricsAreDuplicate(incomingLyrics, d.lyrics || "");
      return sameTA || sameLyrics;
    });

    if (duplicate) {
      const d = duplicate.data();
      const matchedTitle = d.title || title;
      const matchedArtist = d.artist || artist;
      return res.status(409).json({
        error: `Duplicate song detected! This appears to be the same song as "${matchedTitle}" by "${matchedArtist}" already in the database. Please check the existing entry before adding.`,
      });
    }

    await firestore.collection("songs").doc(id).update({
      title: toTitleCase(title),
      artist: toTitleCase(artist),
      lyrics: lyrics.trim().toUpperCase(),
      chords: chords || "",
      tagIds: tags,
      video_url: video_url || "",
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update song" });
  }
});

app.delete("/api/songs/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });

  const { id } = req.params;
  try {
    await firestore.collection("songs").doc(id).delete();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete song" });
  }
});

app.get("/api/tags", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });

  try {
    const snapshot = await firestore.collection("tags").orderBy("name").get();
    let tags = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

    // Ensure default tags exist and remove duplicates
    const defaultTags = [
      { name: "English, Solemn", color: "bg-violet-100 text-violet-700" },
      { name: "English, Joyful", color: "bg-emerald-100 text-emerald-700" },
      { name: "Tagalog, Solemn", color: "bg-rose-100 text-rose-700" },
      { name: "Tagalog, Joyful", color: "bg-amber-100 text-amber-700" },
    ];

    let changed = false;

    // Check for duplicates and remove them
    const seenNames = new Set();
    const uniqueTags = [];
    for (const tag of tags) {
      if (seenNames.has(tag.name)) {
        await firestore.collection("tags").doc(tag.id).delete();
        changed = true;
      } else {
        seenNames.add(tag.name);
        uniqueTags.push(tag);
      }
    }
    tags = uniqueTags;

    for (const defTag of defaultTags) {
      if (!tags.some((t: any) => t.name === defTag.name)) {
        const docRef = await firestore.collection("tags").add(defTag);
        tags.push({ id: docRef.id, ...defTag });
        changed = true;
      }
    }

    if (changed) {
      tags.sort((a: any, b: any) => a.name.localeCompare(b.name));
    }

    res.json(tags);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch tags" });
  }
});

app.post("/api/tags", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });

  const { name, color } = req.body;
  try {
    const docRef = await firestore.collection("tags").add({
      name,
      color: color || "bg-gray-100 text-gray-800"
    });
    res.status(201).json({ id: docRef.id, name, color });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create tag" });
  }
});

app.delete("/api/tags/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });

  const { id } = req.params;
  try {
    await firestore.collection("tags").doc(id).delete();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete tag" });
  }
});

// ─── Members API ────────────────────────────────────────────────────────────

app.get("/api/members", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });

  try {
    const snapshot = await firestore.collection("members").orderBy("name").get();
    const members = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        created_at: data.created_at?.toDate?.()?.toISOString() || data.created_at,
        updated_at: data.updated_at?.toDate?.()?.toISOString() || data.updated_at,
      };
    });
    if (!res.headersSent) res.json(members);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.status(500).json({ error: "Failed to fetch members" });
  }
});

app.post("/api/members", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });

  const { name, phone, email, photo, roles, status, notes } = req.body;

  const missingFields: string[] = [];
  if (!name?.trim()) missingFields.push("Name");
  if (!phone?.trim()) missingFields.push("Phone");
  if (missingFields.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missingFields.join(", ")}.` });
  }

  try {
    const savedName = toTitleCase(name);
    const docRef = await firestore.collection("members").add({
      name: savedName,
      phone: phone.trim(),
      email: (email || "").trim().toLowerCase(),
      photo: photo || "",
      roles: roles || [],
      status: status || "active",
      notes: notes || "",
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.status(201).json({
      id: docRef.id,
      name: savedName,
      phone: phone.trim(),
      email: (email || "").trim().toLowerCase(),
      photo: photo || "",
      roles: roles || [],
      status: status || "active",
      notes: notes || "",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create member" });
  }
});

app.put("/api/members/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });

  const { id } = req.params;
  const { name, phone, email, photo, roles, status, notes } = req.body;

  const missingFields: string[] = [];
  if (!name?.trim()) missingFields.push("Name");
  if (!phone?.trim()) missingFields.push("Phone");
  if (missingFields.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missingFields.join(", ")}.` });
  }

  try {
    await firestore.collection("members").doc(id).update({
      name: toTitleCase(name),
      phone: phone.trim(),
      email: (email || "").trim().toLowerCase(),
      photo: photo || "",
      roles: roles || [],
      status: status || "active",
      notes: notes || "",
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update member" });
  }
});

app.delete("/api/members/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });

  const { id } = req.params;
  try {
    await firestore.collection("members").doc(id).delete();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete member" });
  }
});

// PATCH /api/members/:id/planner-access ── toggle the Plan Lead tag ─────────
app.patch("/api/members/:id/planner-access", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });
  const { id } = req.params;
  const { plannerAccess } = req.body;
  if (typeof plannerAccess !== "boolean")
    return res.status(400).json({ error: "plannerAccess must be a boolean" });
  try {
    await firestore.collection("members").doc(id).update({
      plannerAccess,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ success: true });
  } catch (e) {
    console.error("planner-access PATCH:", e);
    res.status(500).json({ error: "Failed to update planner access" });
  }
});

// PATCH /api/members/:id/events-access ── toggle the Event Lead tag ──────────
app.patch("/api/members/:id/events-access", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });
  const { id } = req.params;
  const { eventsAccess } = req.body;
  if (typeof eventsAccess !== "boolean")
    return res.status(400).json({ error: "eventsAccess must be a boolean" });
  try {
    await firestore.collection("members").doc(id).update({
      eventsAccess,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ success: true });
  } catch (e) {
    console.error("events-access PATCH:", e);
    res.status(500).json({ error: "Failed to update events access" });
  }
});

// ─── Scheduling ──────────────────────────────────────────────────────────────

app.get("/api/schedules", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });
  try {
    const snap = await firestore.collection("schedules").orderBy("date", "asc").get();
    const schedules = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(schedules);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch schedules" });
  }
});

// Strip base64 photo from schedule member objects before writing to Firestore
// (photos are stored in the members collection; re-hydrated on client via memberId)
function stripPhoto(member: any) {
  if (!member) return null;
  const { photo, ...rest } = member;
  return rest;
}

app.post("/api/schedules", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });
  const { date, serviceType, worshipLeader, backupSingers, musicians, songLineup, notes, eventName, customTeamMembers, assignments } = req.body;
  if (!date) return res.status(400).json({ error: "Date is required." });
  try {
    const docRef = await firestore.collection("schedules").add({
      date,
      serviceType: serviceType || "sunday",
      eventName: eventName || "",
      customTeamMembers: (customTeamMembers || []).map(stripPhoto),
      assignments: (assignments || []).map((a: any) => ({ role: a.role, members: (a.members || []).map(stripPhoto) })),
      worshipLeader: stripPhoto(worshipLeader),
      backupSingers: (backupSingers || []).map(stripPhoto),
      musicians: (musicians || []).map(stripPhoto),
      songLineup: songLineup || { joyful: "", solemn: "" },
      notes: notes || "",
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Fire-and-forget notification
    const { actorName: aN1 = "Someone", actorPhoto: aP1 = "", actorUserId: aU1 = "" } = req.body;
    const dateLabel1 = new Date(date + "T00:00:00").toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    writeNotification(firestore, {
      type: "new_event",
      message: `${aN1} created a new event`,
      subMessage: `📅 ${eventName || "Event"} — ${dateLabel1}`,
      actorName: aN1, actorPhoto: aP1, actorUserId: aU1,
      targetAudience: "all",
      resourceId: docRef.id,
      resourceType: "event",
      resourceDate: date,
    });

    res.status(201).json({ id: docRef.id, date, serviceType: serviceType || "sunday", eventName: eventName || "", assignments: assignments || [], worshipLeader: worshipLeader || null, backupSingers: backupSingers || [], musicians: musicians || [], songLineup: songLineup || { joyful: "", solemn: "" }, notes: notes || "" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create schedule" });
  }
});

app.put("/api/schedules/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });
  const { id } = req.params;
  const { date, serviceType, worshipLeader, backupSingers, musicians, songLineup, notes, eventName, customTeamMembers, assignments } = req.body;
  if (!date) return res.status(400).json({ error: "Date is required." });
  try {
    await firestore.collection("schedules").doc(id).update({
      date,
      serviceType: serviceType || "sunday",
      eventName: eventName || "",
      customTeamMembers: (customTeamMembers || []).map(stripPhoto),
      assignments: (assignments || []).map((a: any) => ({ role: a.role || "", members: (a.members || []).map((m: any) => stripPhoto(m)).filter(Boolean) })),
      worshipLeader: stripPhoto(worshipLeader),
      backupSingers: (backupSingers || []).map(stripPhoto),
      musicians: (musicians || []).map(stripPhoto),
      songLineup: songLineup || { joyful: "", solemn: "" },
      notes: notes || "",
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // ── Update is SILENT — no bell, no push. Author sees toast on frontend only.
    // Notifications only fire on create and the manual "Notify Team" button.
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update schedule" });
  }
});

// POST /api/schedules/:id/notify — "Notify Team" manual email (local dev)
app.post("/api/schedules/:id/notify", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });
  const { id } = req.params;
  try {
    const docSnap = await firestore.collection("schedules").doc(id).get();
    if (!docSnap.exists) return res.status(404).json({ error: "Schedule not found" });
    const ev = docSnap.data() as any;

    // 24-hour cooldown guard
    const lastNotified = ev.lastNotifiedAt?.toDate?.() as Date | undefined;
    if (lastNotified) {
      const hoursSince = (Date.now() - lastNotified.getTime()) / 3_600_000;
      if (hoursSince < 24) {
        const at = lastNotified.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", hour12: true });
        return res.status(429).json({ error: `Team was already notified today at ${at}. Please wait 24 hours before notifying again.` });
      }
    }

    // Record timestamp to enforce cooldown
    await firestore.collection("schedules").doc(id).update({
      lastNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Note: actual email sending happens via Netlify in production.
    // In local dev we skip SMTP but still update cooldown + write notification.
    const { actorName = "Someone" } = req.body;
    const dateLabel = new Date((ev.date as string) + "T00:00:00").toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    writeNotification(firestore, {
      type: "updated_event",
      message: `${actorName} notified the team`,
      subMessage: `📅 ${ev.eventName || "Event"} — ${dateLabel}`,
      actorName, actorPhoto: "", actorUserId: "",
      targetAudience: "all",
      resourceId: id,
      resourceType: "event",
      resourceDate: ev.date,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("[notify]", error);
    res.status(500).json({ error: "Failed to send notification" });
  }
});

app.delete("/api/schedules/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });
  const { id } = req.params;
  try {
    await firestore.collection("schedules").doc(id).delete();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete schedule" });
  }
});


// ─── Auth API ────────────────────────────────────────────────────────────────
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "jayfullsnackdev@gmail.com";

app.get("/api/auth/check", async (req, res) => {
  const email = req.query.email as string;
  if (!email) return res.status(400).json({ error: "Missing email" });
  if (email === ADMIN_EMAIL) return res.json({ approved: true, role: "admin" });
  const firestore = getDb();
  if (!firestore) return res.json({ approved: false });
  try {
    const doc = await firestore.collection("approved_users").doc(email).get();
    if (doc.exists) return res.json({ approved: true, role: doc.data()?.role ?? "member" });
    return res.json({ approved: false });
  } catch { return res.json({ approved: false }); }
});

app.post("/api/auth/approve", async (req, res) => {
  const { email, role = "member" } = req.body;
  if (!email) return res.status(400).json({ error: "Missing email" });
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });
  await firestore.collection("approved_users").doc(email).set({ email, role, approvedAt: new Date().toISOString() });
  await firestore.collection("pending_users").doc(email).delete().catch(() => { });
  return res.json({ success: true });
});

app.post("/api/auth/request", async (req, res) => {
  const { email, name = "", photo = "" } = req.body;
  if (!email) return res.status(400).json({ error: "Missing email" });
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });
  const existing = await firestore.collection("approved_users").doc(email).get();
  if (existing.exists) return res.json({ skipped: true });
  await firestore.collection("pending_users").doc(email).set({ email, name, photo, requestedAt: new Date().toISOString() });

  // Notify admin of new access request
  writeNotification(firestore, {
    type: "access_request",
    message: `New access request`,
    subMessage: `${name || email} is requesting access to WorshipFlow`,
    actorName: name || email,
    actorPhoto: photo,
    targetAudience: "admin_only",
  });

  return res.json({ success: true });
});

app.get("/api/auth/pending", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.json([]);
  const snap = await firestore.collection("pending_users").orderBy("requestedAt", "desc").get();
  return res.json(snap.docs.map(d => d.data()));
});

app.get("/api/auth/users", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.json([]);
  const snap = await firestore.collection("approved_users").get();
  return res.json(snap.docs.map(d => d.data()));
});

app.delete("/api/auth/revoke", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Missing email" });
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });
  await firestore.collection("approved_users").doc(email).delete();
  return res.json({ success: true });
});

app.delete("/api/auth/revoke-pending", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Missing email" });
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });
  await firestore.collection("pending_users").doc(email).delete();
  return res.json({ success: true });
});

// NEW: Change the role of an already-approved user
app.put("/api/auth/update-role", async (req, res) => {
  const { email, role } = req.body;
  if (!email || !role) return res.status(400).json({ error: "Missing email or role" });
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });
  try {
    await firestore.collection("approved_users").doc(email).update({ role });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update role" });
  }
});


// ── TEAM NOTES ───────────────────────────────────────────────────────────────

// GET /api/notes — fetch all notes ordered by newest first
app.get("/api/notes", async (_req, res) => {
  const firestore = getDb();
  if (!firestore) return res.json([]);
  try {
    const snap = await firestore.collection("team_notes").orderBy("createdAt", "desc").get();
    if (res.headersSent) return; // timeout already responded
    const notes = snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(), updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() ?? null }));
    res.json(notes);
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: "Failed to fetch notes" }); }
});

// POST /api/notes — create a new note
app.post("/api/notes", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { authorId, authorName, authorPhoto, type, content, imageData, videoData } = req.body;
  if (!authorId || !content?.trim()) return res.status(400).json({ error: "Missing required fields" });
  try {
    const ref = await firestore.collection("team_notes").add({
      authorId, authorName: authorName || "Unknown", authorPhoto: authorPhoto || "",
      type: type || "general", content: content.trim(),
      imageData: imageData || null,
      videoData: videoData || null,
      reactions: {},
      resolved: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      // updatedAt intentionally NOT set on create — only set on actual edits
      // so the NoteCard '(edited)' label is accurate
      updatedAt: null,
      deletedAt: null,
    });

    // Notify all team members that a new note was posted
    const typeLabel = type === "bug" ? "🐞 Bug" : type === "feature" ? "💡 Feature" : "📝 Note";
    writeNotification(firestore, {
      type: "team_note",
      message: `${authorName || "Someone"} posted a ${typeLabel}`,
      subMessage: content.trim().slice(0, 80) + (content.trim().length > 80 ? "…" : ""),
      actorName: authorName || "Unknown",
      actorPhoto: authorPhoto || "",
      actorUserId: authorId,
      targetAudience: "all",
    });

    res.status(201).json({ id: ref.id });
  } catch (e) { res.status(500).json({ error: "Failed to create note" }); }
});


// PUT /api/notes/:id — edit note (author only)
app.put("/api/notes/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { authorId, content, type, imageData } = req.body;
  if (!authorId || !content?.trim()) return res.status(400).json({ error: "Missing required fields" });
  try {
    const doc = await firestore.collection("team_notes").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Note not found" });
    if (doc.data()?.authorId !== authorId) return res.status(403).json({ error: "Not your note" });
    await firestore.collection("team_notes").doc(req.params.id).update({
      content: content.trim(), type: type || "general",
      imageData: imageData ?? doc.data()?.imageData ?? null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to update note" }); }
});

// DELETE /api/notes/:id — delete note (author only)
app.delete("/api/notes/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { authorId } = req.body;
  if (!authorId) return res.status(400).json({ error: "Missing authorId" });
  try {
    const doc = await firestore.collection("team_notes").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Note not found" });
    if (doc.data()?.authorId !== authorId) return res.status(403).json({ error: "Not your note" });
    await firestore.collection("team_notes").doc(req.params.id).delete();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to delete note" }); }
});

// PATCH /api/notes/:id/react — toggle an emoji reaction
app.patch("/api/notes/:id/react", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { userId, emoji } = req.body;
  if (!userId || !emoji) return res.status(400).json({ error: "Missing userId or emoji" });
  try {
    const ref = firestore.collection("team_notes").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Note not found" });
    const reactions = doc.data()?.reactions || {};
    const users: string[] = reactions[emoji] || [];
    const already = users.includes(userId);
    reactions[emoji] = already ? users.filter((u: string) => u !== userId) : [...users, userId];
    await ref.update({ reactions });
    res.json({ success: true, reactions });
  } catch (e) { res.status(500).json({ error: "Failed to react" }); }
});

// PATCH /api/notes/:id/resolve — mark/unmark resolved (author or admin)
app.patch("/api/notes/:id/resolve", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { userId, resolved } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing userId" });
  try {
    const ref = firestore.collection("team_notes").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Note not found" });
    // Allow author or admin-role users (role check is frontend-enforced for now)
    await ref.update({ resolved: !!resolved, resolvedBy: resolved ? userId : null });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to resolve" }); }
});

// PATCH /api/notes/:id/retype — admin/leader/qa can reclassify note type
app.patch("/api/notes/:id/retype", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { userRole, newType } = req.body;
  const isPrivileged = userRole === "admin" || userRole === "leader" || userRole === "qa_specialist";
  if (!isPrivileged) return res.status(403).json({ error: "Only admins can reclassify notes" });
  if (!["bug", "feature", "general"].includes(newType)) return res.status(400).json({ error: "Invalid note type" });
  try {
    const ref = firestore.collection("team_notes").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Note not found" });
    await ref.update({ type: newType });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to reclassify note" }); }
});

// Stored in users/{userId}/personalNotes subcollection — structurally private.

// GET /api/personal-notes?userId=...
app.get("/api/personal-notes", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const userId = req.query.userId as string;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const snap = await firestore.collection("users").doc(userId)
      .collection("personalNotes").orderBy("createdAt", "desc").limit(200).get();
    const notes = snap.docs.filter(d => !d.data().deletedAt).map(d => ({ id: d.id, ...d.data() }));
    res.json(notes);
  } catch (e) { res.status(500).json({ error: "Failed to fetch personal notes" }); }
});

// POST /api/personal-notes
app.post("/api/personal-notes", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { userId, title, body: noteBody, category } = req.body;
  if (!userId || !title || !noteBody) return res.status(400).json({ error: "Missing fields" });
  try {
    const ref = await firestore.collection("users").doc(userId)
      .collection("personalNotes").add({
        title, body: noteBody,
        category: category || "personal",
        pinned: false,
        createdAt: new Date().toISOString(),
      });
    res.status(200).json({ id: ref.id });
  } catch (e) { res.status(500).json({ error: "Failed to create personal note" }); }
});

// PUT /api/personal-notes/:id
app.put("/api/personal-notes/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { userId, title, body: noteBody, category } = req.body;
  if (!userId || !title || !noteBody) return res.status(400).json({ error: "Missing fields" });
  try {
    await firestore.collection("users").doc(userId)
      .collection("personalNotes").doc(req.params.id)
      .update({ title, body: noteBody, category: category || "personal", updatedAt: new Date().toISOString() });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to update personal note" }); }
});

// DELETE /api/personal-notes/:id
app.delete("/api/personal-notes/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    await firestore.collection("users").doc(userId)
      .collection("personalNotes").doc(req.params.id).delete();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to delete personal note" }); }
});

// PATCH /api/personal-notes/:id/pin
app.patch("/api/personal-notes/:id/pin", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { userId, pinned } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    await firestore.collection("users").doc(userId)
      .collection("personalNotes").doc(req.params.id)
      .update({ pinned: !!pinned });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to pin/unpin personal note" }); }
});

// ── TEAM NOTES (meeting recaps) ───────────────────────────────────────────────

// GET /api/team-notes
app.get("/api/team-notes", async (_req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  try {
    const snap = await firestore.collection("teamNotes").orderBy("createdAt", "desc").limit(100).get();
    const notes = snap.docs.filter(d => !d.data().deletedAt).map(d => ({ id: d.id, ...d.data() }));
    res.json(notes);
  } catch (e) { res.status(500).json({ error: "Failed to fetch team notes" }); }
});

// POST /api/team-notes
app.post("/api/team-notes", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { authorId, authorName, authorPhoto, title, body: noteBody, category } = req.body;
  if (!authorId || !title || !noteBody) return res.status(400).json({ error: "Missing fields" });
  try {
    const ref = await firestore.collection("teamNotes").add({
      authorId, authorName: authorName || "Unknown", authorPhoto: authorPhoto || "",
      title, body: noteBody, category: category || "general",
      pinned: false, createdAt: new Date().toISOString(),
    });
    res.status(200).json({ id: ref.id });
  } catch (e) { res.status(500).json({ error: "Failed to create team note" }); }
});

// PUT /api/team-notes/:id
app.put("/api/team-notes/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { title, body: noteBody, category } = req.body;
  if (!title || !noteBody) return res.status(400).json({ error: "Missing fields" });
  try {
    await firestore.collection("teamNotes").doc(req.params.id)
      .update({ title, body: noteBody, category: category || "general", updatedAt: new Date().toISOString() });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to update team note" }); }
});

// DELETE /api/team-notes/:id
app.delete("/api/team-notes/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  try {
    await firestore.collection("teamNotes").doc(req.params.id).delete();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to delete team note" }); }
});

// PATCH /api/team-notes/:id/pin
app.patch("/api/team-notes/:id/pin", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { pinned } = req.body;
  try {
    await firestore.collection("teamNotes").doc(req.params.id).update({ pinned: !!pinned });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to pin/unpin team note" }); }
});

// PATCH /api/team-notes/:id/like
app.patch("/api/team-notes/:id/like", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { userId, liked } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const admin = await import("firebase-admin");
    const update = liked
      ? { likes: admin.firestore.FieldValue.arrayUnion(userId) }
      : { likes: admin.firestore.FieldValue.arrayRemove(userId) };
    await firestore.collection("teamNotes").doc(req.params.id).update(update);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to update like" }); }
});

app.post("/api/ocr", async (req, res) => {
  try {
    const { base64Data, mimeType, type } = req.body;
    if (!base64Data || !mimeType || !type) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!process.env.GEMINI_API_KEY) {
      console.error("OCR Error: GEMINI_API_KEY is not configured");
      return res.status(500).json({ error: "OCR service is not configured (missing API key)" });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            },
            {
              text: `You are a precise music document transcriber. Transcribe ALL visible text from this image EXACTLY as it appears, preserving:\n- Every section label (e.g. "Verse:", "Chorus:", "Bridge:", "Pre Chorus:", etc.)\n- Every tag or annotation (e.g. "//JOYFUL", "(3x)", "(Jesus...)")\n- Every song title or header at the top\n- Every chord or lyric line, in the correct order\n- Empty lines between sections for spacing\n\nRules:\n- Do NOT skip any line of text you can see.\n- Do NOT add, invent, or summarize anything.\n- Do NOT use Markdown formatting (no **, no ##, no bullets).\n- Output ONLY the plain text transcription, nothing else.`,
            },
          ],
        },
      ],
    });

    // In @google/genai v1.x, response.text throws when candidates are empty or
    // content is safety-filtered. Safely extract from candidates with a fallback.
    let rawText = "";
    try {
      rawText =
        response.candidates?.[0]?.content?.parts
          ?.filter((p: any) => typeof p.text === "string")
          ?.map((p: any) => p.text as string)
          ?.join("") ?? "";
      if (!rawText) rawText = (response as any).text ?? "";
    } catch {
      // response.text threw — no usable text in this response
    }

    const cleanText = rawText.replace(/\*\*/g, "");
    res.json({ text: cleanText });
  } catch (error: any) {
    console.error("OCR Error:", error?.message ?? error);
    res.status(500).json({ error: error?.message ?? "Failed to extract text from image" });
  }
});

// ── PLAYGROUND TRELLO ───────────────────────────────────────────────────────

// POST /api/planner/upload  — supports base64 JSON or multipart form-data
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
app.post("/api/planner/upload", upload.single("file"), async (req, res) => {
  try {
    getDb();
    if (admin.apps.length === 0) return res.status(503).json({ error: "Storage unavailable" });
    const bucket = admin.storage().bucket();
    const { v4: uuidv4 } = await import("uuid") as any;
    const id = uuidv4 ? uuidv4() : Date.now().toString();

    // Support both base64 JSON body (Netlify-compatible) and multipart/form-data (legacy)
    let buffer: Buffer;
    let originalName: string;
    let mimeType: string;
    let cardId: string;

    if (req.body?.base64) {
      // New: base64 JSON payload
      buffer = Buffer.from(req.body.base64, "base64");
      originalName = req.body.name || "file";
      mimeType = req.body.contentType || "application/octet-stream";
      cardId = req.body.cardId || "unknown";
    } else if (req.file) {
      // Legacy: multipart/form-data
      buffer = req.file.buffer;
      originalName = req.file.originalname;
      mimeType = req.file.mimetype;
      cardId = req.body.cardId || "unknown";
    } else {
      return res.status(400).json({ error: "No file data" });
    }

    const destPath = `planner/attachments/${cardId}/${id}_${originalName}`;
    const file = bucket.file(destPath);
    await file.save(buffer, { metadata: { contentType: mimeType } });
    await file.makePublic();
    const url = `https://storage.googleapis.com/${bucket.name}/${destPath}`;
    res.json({ url, name: originalName, type: mimeType });
  } catch (e: any) {
    console.error("Upload error:", e?.message);
    res.status(500).json({ error: "Upload failed: " + (e?.message ?? "unknown") });
  }
});

// GET /api/planner/boards  (add ?archived=true to get archived boards)
app.get("/api/planner/boards", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  try {
    const s = await firestore.collection("pg_boards").orderBy("createdAt", "desc").get();
    if (res.headersSent) return;
    const showArchived = req.query.archived === 'true';
    const docs = s.docs
      .map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null } as any))
      .filter((b: any) => showArchived ? !!b.archived : !b.archived);
    res.json(docs);
  } catch (e: any) { if (!res.headersSent) res.status(500).json({ error: "Failed" }); }
});

// GET /api/planner/boards/archived — kept for backwards compat, delegates to query param
app.get("/api/planner/boards/archived", async (_req, res) => {
  res.redirect('/api/planner/boards?archived=true');
});

// POST /api/planner/boards
app.post("/api/planner/boards", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { title, color = "#6366f1", description = "", createdBy } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title required" });
  try {
    const r = await firestore.collection("pg_boards").add({
      title: title.trim(), color, description, archived: false, customFieldDefs: [],
      ...(createdBy ? { createdBy } : {}),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.status(201).json({ id: r.id });
  } catch { res.status(500).json({ error: "Failed" }); }
});

// PUT /api/planner/boards/:id  — update (title, color, description, archived, customFieldDefs)
app.put("/api/planner/boards/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { title, color, description, archived, customFieldDefs } = req.body;
  const patch: Record<string, any> = {};
  if (title !== undefined) patch.title = title;
  if (color !== undefined) patch.color = color;
  if (description !== undefined) patch.description = description;
  if (archived !== undefined) patch.archived = archived;
  if (customFieldDefs !== undefined) patch.customFieldDefs = customFieldDefs;
  try {
    await firestore.collection("pg_boards").doc(req.params.id).set(patch, { merge: true });
    res.json({ success: true });
  } catch (e: any) {
    console.error("[PUT board] Firestore error:", e?.message ?? e);
    res.status(500).json({ error: "Failed", detail: e?.message });
  }
});

// DELETE /api/planner/boards/:id  — cascade-delete lists + cards
app.delete("/api/planner/boards/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const bid = req.params.id;
  try {
    const [ls, cs] = await Promise.all([
      firestore.collection("pg_lists").where("boardId", "==", bid).get(),
      firestore.collection("pg_cards").where("boardId", "==", bid).get(),
    ]);
    const batch = firestore.batch();
    ls.docs.forEach(d => batch.delete(d.ref));
    cs.docs.forEach(d => batch.delete(d.ref));
    batch.delete(firestore.collection("pg_boards").doc(bid));
    await batch.commit();
    res.json({ success: true });
  } catch { res.status(500).json({ error: "Failed" }); }
});

// GET /api/planner/boards/:id/lists
app.get("/api/planner/boards/:id/lists", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const includeArchived = req.query.includeArchived === "true";
  try {
    const s = await firestore.collection("pg_lists").where("boardId", "==", req.params.id).get();
    const docs = s.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter((d: any) => includeArchived || !d.archived)
      .sort((a: any, b: any) => a.pos - b.pos);
    res.json(docs);
  } catch { res.status(500).json({ error: "Failed" }); }
});

// POST /api/planner/boards/:id/lists
app.post("/api/planner/boards/:id/lists", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const bid = req.params.id;
  const { title } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title required" });
  try {
    const ex = await firestore.collection("pg_lists").where("boardId", "==", bid).get();
    const maxPos = ex.docs.reduce((m, d) => Math.max(m, (d.data().pos ?? 0)), 0);
    const r = await firestore.collection("pg_lists").add({
      boardId: bid, title: title.trim(), pos: maxPos + 16384, archived: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.status(201).json({ id: r.id });
  } catch { res.status(500).json({ error: "Failed" }); }
});

// PUT /api/planner/lists/:id
app.put("/api/planner/lists/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { title, archived, pos } = req.body;
  const patch: Record<string, any> = {};
  if (title !== undefined) patch.title = title;
  if (archived !== undefined) patch.archived = archived;
  if (pos !== undefined) patch.pos = pos;
  try {
    await firestore.collection("pg_lists").doc(req.params.id).set(patch, { merge: true });
    res.json({ success: true });
  } catch (e: any) {
    console.error("[PUT list] Firestore error:", e?.message ?? e);
    res.status(500).json({ error: "Failed", detail: e?.message });
  }
});

// DELETE /api/planner/lists/:id  — cascade-delete cards in this list
app.delete("/api/planner/lists/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const lid = req.params.id;
  try {
    const cs = await firestore.collection("pg_cards").where("listId", "==", lid).get();
    const batch = firestore.batch();
    cs.docs.forEach(d => batch.delete(d.ref));
    batch.delete(firestore.collection("pg_lists").doc(lid));
    await batch.commit();
    res.json({ success: true });
  } catch { res.status(500).json({ error: "Failed" }); }
});

// GET /api/planner/boards/:id/cards  (add ?archived=true to get archived cards)
app.get("/api/planner/boards/:id/cards", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  try {
    const showArchived = req.query.archived === 'true';
    const s = await firestore.collection("pg_cards").where("boardId", "==", req.params.id).get();
    const docs = s.docs
      .map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null } as any))
      .filter((d: any) => showArchived ? !!d.archived : !d.archived)
      .sort((a: any, b: any) => showArchived ? 0 : a.pos - b.pos);
    res.json(docs);
  } catch { res.status(500).json({ error: "Failed" }); }
});

// GET /api/planner/boards/:id/cards/archived
app.get("/api/planner/boards/:id/cards/archived", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  try {
    const s = await firestore.collection("pg_cards").where("boardId", "==", req.params.id).get();
    const docs = s.docs
      .map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null } as any))
      .filter((d: any) => !!d.archived);
    res.json(docs);
  } catch { res.status(500).json({ error: "Failed" }); }
});

// POST /api/planner/cards
app.post("/api/planner/cards", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { boardId, listId, title, createdBy } = req.body;
  if (!boardId || !listId || !title?.trim()) return res.status(400).json({ error: "boardId, listId, title required" });
  try {
    const ex = await firestore.collection("pg_cards").where("listId", "==", listId).get();
    const maxPos = ex.docs.reduce((m, d) => Math.max(m, (d.data().pos ?? 0)), 0);
    const r = await firestore.collection("pg_cards").add({
      boardId, listId, title: title.trim(), description: "", pos: maxPos + 16384,
      members: [], labels: [], dueDate: null, checklists: [], customFields: {},
      archived: false,
      ...(createdBy ? { createdBy } : {}),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.status(201).json({ id: r.id });
  } catch { res.status(500).json({ error: "Failed" }); }
});

// GET /api/planner/cards/:id
app.get("/api/planner/cards/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  try {
    const d = await firestore.collection("pg_cards").doc(req.params.id).get();
    if (res.headersSent) return;
    return d.exists ? res.json({ id: d.id, ...d.data() }) : res.status(404).json({ error: "Not found" });
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: "Failed" }); }
});

// PUT /api/planner/cards/:id  — partial update
app.put("/api/planner/cards/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { title, description, members, labels, dueDate, startDate, dueTime, reminder, checklists, customFields, archived, listId, pos, completed, attachments } = req.body;
  const patch: Record<string, any> = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  if (title !== undefined) patch.title = title;
  if (description !== undefined) patch.description = description;
  if (members !== undefined) patch.members = members;
  if (labels !== undefined) patch.labels = labels;
  if (dueDate !== undefined) patch.dueDate = dueDate;
  if (startDate !== undefined) patch.startDate = startDate;
  if (dueTime !== undefined) patch.dueTime = dueTime;
  if (reminder !== undefined) patch.reminder = reminder;
  if (checklists !== undefined) patch.checklists = checklists;
  if (customFields !== undefined) patch.customFields = customFields;
  if (archived !== undefined) patch.archived = archived;
  if (listId !== undefined) patch.listId = listId;
  if (pos !== undefined) patch.pos = pos;
  if (completed !== undefined) patch.completed = completed;
  if (attachments !== undefined) patch.attachments = attachments;
  try {
    // Use set+merge so missing fields (e.g. 'attachments' on older cards) don't throw
    await firestore.collection("pg_cards").doc(req.params.id).set(patch, { merge: true });
    if (res.headersSent) return;
    res.json({ success: true });
  } catch (e: any) {
    console.error("[PUT card] Firestore error:", e?.message ?? e);
    if (!res.headersSent) res.status(500).json({ error: "Failed", detail: e?.message });
  }
});

// DELETE /api/planner/cards/:id
app.delete("/api/planner/cards/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  try {
    await firestore.collection("pg_cards").doc(req.params.id).delete();
    if (res.headersSent) return;
    res.json({ success: true });
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: "Failed" }); }
});

// PATCH /api/planner/cards/:id/move  — fractional-index repositioning
app.patch("/api/planner/cards/:id/move", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const cid = req.params.id;
  const { boardId, listId, position } = req.body;
  try {
    const s = await firestore.collection("pg_cards").where("listId", "==", listId).get();
    const cards = s.docs
      .filter(d => d.id !== cid && !d.data().archived)
      .sort((a, b) => a.data().pos - b.data().pos);
    let newPos: number;
    if (position === "top" || cards.length === 0) {
      newPos = (cards[0]?.data().pos ?? 16384) / 2;
    } else if (position === "bottom") {
      newPos = (cards[cards.length - 1]?.data().pos ?? 0) + 16384;
    } else {
      const idx = Math.max(0, Math.min(Number(position) - 1, cards.length));
      if (idx === 0) newPos = (cards[0]?.data().pos ?? 16384) / 2;
      else if (idx >= cards.length) newPos = (cards[cards.length - 1]?.data().pos ?? 0) + 16384;
      else newPos = (cards[idx - 1].data().pos + cards[idx].data().pos) / 2;
    }
    await firestore.collection("pg_cards").doc(cid).set({
      listId, boardId, pos: newPos,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    res.json({ success: true, pos: newPos });
  } catch (e: any) {
    console.error("[PATCH card/move] Firestore error:", e?.message ?? e);
    res.status(500).json({ error: "Failed to move" });
  }
});

// ── PLAYGROUND COMMENTS ─────────────────────────────────────────────────────

// GET /api/planner/cards/:id/comments
app.get("/api/planner/cards/:id/comments", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  try {
    const s = await firestore.collection("pg_cards").doc(req.params.id)
      .collection("comments").orderBy("createdAt", "asc").get();
    if (res.headersSent) return;
    res.json(s.docs.map(d => ({
      id: d.id, ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
    })));
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: "Failed" }); }
});

// POST /api/planner/cards/:id/comments
app.post("/api/planner/cards/:id/comments", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { authorName, authorPhoto, text, attachments } = req.body;
  if (!text?.trim() && (!attachments || attachments.length === 0)) return res.status(400).json({ error: "text or attachment required" });
  try {
    const ref = await firestore.collection("pg_cards").doc(req.params.id)
      .collection("comments").add({
        authorName: authorName || "Unknown",
        authorPhoto: authorPhoto || "",
        text: text?.trim() || "",
        attachments: attachments || [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    // Write activity entry non-blocking so it doesn't delay or double-respond
    firestore.collection("pg_cards").doc(req.params.id)
      .collection("activity").add({
        type: "comment",
        actorName: authorName || "Unknown",
        actorPhoto: authorPhoto || "",
        text: text?.trim() ? `commented: "${text.trim().slice(0, 60)}${text.trim().length > 60 ? "\u2026" : ""}"` : "added an attachment",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
    if (res.headersSent) return;
    res.status(201).json({ id: ref.id });
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: "Failed" }); }
});

// DELETE /api/planner/cards/:id/comments/:cid
app.delete("/api/planner/cards/:id/comments/:cid", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  try {
    await firestore.collection("pg_cards").doc(req.params.id)
      .collection("comments").doc(req.params.cid).delete();
    if (res.headersSent) return;
    res.json({ success: true });
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: "Failed" }); }
});

// PATCH /api/planner/cards/:id/comments/:cid/reactions
// Body: { emoji: string, userName: string }  — toggles user on/off for that emoji
app.patch("/api/planner/cards/:id/comments/:cid/reactions", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { emoji, userName } = req.body;
  if (!emoji || !userName) return res.status(400).json({ error: "emoji and userName required" });
  try {
    const ref = firestore.collection("pg_cards").doc(req.params.id)
      .collection("comments").doc(req.params.cid);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Comment not found" });
    const reactions: Record<string, string[]> = snap.data()?.reactions ?? {};
    const users = reactions[emoji] ?? [];
    const already = users.includes(userName);
    reactions[emoji] = already
      ? users.filter(u => u !== userName)     // un-react
      : [...users, userName];                 // react
    if (reactions[emoji].length === 0) delete reactions[emoji];
    await ref.update({ reactions });
    if (res.headersSent) return;
    res.json({ reactions });
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: "Failed" }); }
});

// ── PLAYGROUND ACTIVITY ─────────────────────────────────────────────────────

// GET /api/planner/cards/:id/activity
app.get("/api/planner/cards/:id/activity", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  try {
    const s = await firestore.collection("pg_cards").doc(req.params.id)
      .collection("activity").orderBy("createdAt", "desc").limit(50).get();
    if (res.headersSent) return;
    res.json(s.docs.map(d => ({
      id: d.id, ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
    })));
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: "Failed" }); }
});

// POST /api/planner/cards/:id/activity  — write an activity entry
app.post("/api/planner/cards/:id/activity", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { type, actorName, actorPhoto, text } = req.body;
  try {
    await firestore.collection("pg_cards").doc(req.params.id)
      .collection("activity").add({
        type: type || "update",
        actorName: actorName || "Unknown",
        actorPhoto: actorPhoto || "",
        text: text || "",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    if (res.headersSent) return;
    res.status(201).json({ success: true });
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: "Failed" }); }
});

// ── BIBLE GATEWAY PROXY ───────────────────────────────────────────────────────
// GET /api/bible/gateway?book=John&chapter=3&version=MBBTAG
// Proxies BibleGateway print interface and returns clean verse JSON.
app.get("/api/bible/gateway", async (req: any, res: any) => {
  if (res.headersSent) return;
  const { book, chapter, version } = req.query as Record<string, string>;
  if (!book || !chapter) return res.status(400).json({ error: "Missing book or chapter" });

  try {
    const search = encodeURIComponent(`${book} ${chapter}`);
    const ver    = (version || "MBBTAG").replace(/[^A-Z0-9]/gi, "");
    const url    = `https://www.biblegateway.com/passage/?search=${search}&version=${ver}&interface=print`;

    const bgRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9,tl;q=0.8",
      },
    });
    if (!bgRes.ok) return res.status(502).json({ error: "BibleGateway unavailable" });

    let html = await bgRes.text();

    // 1. Strip all non-verse sup elements (footnotes, cross-references, etc.)
    html = html.replace(/<sup[^>]*class="footnote"[^>]*>[\s\S]*?<\/sup>/gi, "");
    html = html.replace(/<sup[^>]*data-fn[^>]*>[\s\S]*?<\/sup>/gi, "");
    html = html.replace(/<sup[^>]*class="crossreference"[^>]*>[\s\S]*?<\/sup>/gi, "");

    // 2. Mark chapter-start (verse 1) — <span class="chapternum">3 </span>
    html = html.replace(/<span[^>]*class="chapternum"[^>]*>\d+\s*<\/span>/gi, "||VERSE_1||");

    // 3. Mark verse numbers — <sup class="versenum">N </sup>
    html = html.replace(/<sup[^>]*class="versenum"[^>]*>(\d+)\s*<\/sup>/gi, "||VERSE_$1||");

    // 4. Strip all remaining tags
    html = html.replace(/<[^>]+>/g, " ");

    // 5. Decode common HTML entities
    html = html
      .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
      .replace(/&ldquo;/g, "\u201c").replace(/&rdquo;/g, "\u201d")
      .replace(/&lsquo;/g, "\u2018").replace(/&rsquo;/g, "\u2019")
      .replace(/&mdash;/g, "\u2014").replace(/&ndash;/g, "\u2013")
      .replace(/&#039;/g, "'").replace(/&quot;/g, '"');

    // 6. Clean up any surviving orphaned cross-reference letters like (A), (B), (AB), (AC)...
    html = html.replace(/\s*\(\s*[A-Z]+\s*\)\s*/g, " ");

    // 7. Split by verse markers and collect
    const parts  = html.split(/\|\|VERSE_(\d+)\|\|/);
    const verses: { verse: number; text: string }[] = [];
    for (let i = 1; i < parts.length; i += 2) {
      const verseNum = parseInt(parts[i], 10);
      const text     = (parts[i + 1] || "").replace(/\s+/g, " ").trim();
      if (text) verses.push({ verse: verseNum, text });
    }

    if (verses.length === 0) return res.status(404).json({ error: "No verses parsed" });
    verses.sort((a, b) => a.verse - b.verse);
    return res.json({ verses });
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: "Proxy error" });
  }
});

// ── BIBLE SEARCH PROXY ────────────────────────────────────────────────────────
// GET /api/bible/search?q=born+again&version=NIV&page=1
// Proxies BibleGateway quicksearch and returns parsed verse results.
app.get("/api/bible/search", async (req: any, res: any) => {
  if (res.headersSent) return;
  const { q, version, page } = req.query as Record<string, string>;
  if (!q || q.trim().length < 2) return res.status(400).json({ error: "Query too short" });

  try {
    const ver      = (version || "NIV").replace(/[^A-Z0-9]/gi, "");
    const pageNum  = Math.max(1, parseInt(page || "1", 10));
    const startAt  = (pageNum - 1) * 25 + 1;
    const url      = `https://www.biblegateway.com/quicksearch/?search=${encodeURIComponent(q.trim())}&version=${ver}&resultspp=25&startnum=${startAt}&interface=print`;

    const bgRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9,tl;q=0.8",
      },
    });
    if (!bgRes.ok) return res.status(502).json({ error: "BibleGateway unavailable" });

    const html = await bgRes.text();

    // Parse total results count — "N Bible Results"
    const totalMatch = html.match(/(\d[\d,]*)\s+(?:Bible\s+)?Results?/i);
    const total = totalMatch ? parseInt(totalMatch[1].replace(/,/g, ""), 10) : 0;

    // Each result is an <li class="row bible-item" data-osis="...">
    // Reference: <a class="bible-item-title">Genesis 5:22</a>
    // Text: <div class="bible-item-text ...">...</div>
    const results: { reference: string; text: string }[] = [];

    const liReg = /<li[^>]*class="[^"]*bible-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liReg.exec(html)) !== null) {
      const cell = liMatch[1];

      // Reference from .bible-item-title link text
      const refMatch = cell.match(/<a[^>]*bible-item-title[^>]*>([^<]+)<\/a>/i);
      const reference = refMatch ? refMatch[1].trim() : "";

      // Text from .bible-item-text — strip <b> bold wrappers (highlighting), other tags, extras
      let textRaw = cell.replace(/<b>/gi, "").replace(/<\/b>/gi, "");
      const textBlockMatch = textRaw.match(/<div[^>]*bible-item-text[^>]*>([\s\S]*?)<div[^>]*bible-item-extras/i);
      let text = (textBlockMatch ? textBlockMatch[1] : textRaw)
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
        .replace(/&ldquo;/g, "\u201c").replace(/&rdquo;/g, "\u201d")
        .replace(/&lsquo;/g, "\u2018").replace(/&rsquo;/g, "\u2019")
        .replace(/&mdash;/g, "\u2014").replace(/&ndash;/g, "\u2013")
        .replace(/&#039;/g, "'").replace(/&quot;/g, '"')
        .replace(/\s*\(\s*[A-Z]+\s*\)\s*/g, " ")
        .replace(/\s+/g, " ").trim();

      if (reference && text && text.length > 5) results.push({ reference, text });
    }

    return res.json({ results, total, page: pageNum, perPage: 25 });
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: "Search proxy error" });
  }
});

// ── PREACHING DRAFTS ──────────────────────────────────────────────────────────


// GET /api/preaching-drafts?userId=... — list user's drafts, newest first
app.get("/api/preaching-drafts", async (req, res) => {
  const firestore = getDb();
  const userId = req.query.userId as string;
  if (!firestore || !userId) return res.json([]);
  try {
    // No orderBy — avoids needing a composite Firestore index; sort in-memory instead
    const snap = await firestore.collection("preachingDrafts")
      .where("authorId", "==", userId)
      .limit(100)
      .get();
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
    docs.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    res.json(docs);
  } catch (e: any) {
    console.error("[preaching-drafts GET]", e?.message ?? e);
    if (!res.headersSent) res.status(500).json({ error: "Failed", detail: e?.message });
  }
});

// POST /api/preaching-drafts — create new draft
app.post("/api/preaching-drafts", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  try {
    const { id, ...rest } = req.body;
    const now = new Date().toISOString();
    if (id) {
      await firestore.collection("preachingDrafts").doc(id).set({ ...rest, id, createdAt: now, updatedAt: now });
      res.json({ id });
    } else {
      const ref = await firestore.collection("preachingDrafts").add({ ...rest, createdAt: now, updatedAt: now });
      res.json({ id: ref.id });
    }
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: "Failed" }); }
});

// PUT /api/preaching-drafts/:id — update existing draft
app.put("/api/preaching-drafts/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  try {
    const ref = firestore.collection("preachingDrafts").doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Draft not found" });
    await ref.update({ ...req.body, updatedAt: new Date().toISOString() });
    res.json({ ok: true });
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: "Failed" }); }
});

// DELETE /api/preaching-drafts/:id — remove draft
app.delete("/api/preaching-drafts/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  try {
    await firestore.collection("preachingDrafts").doc(req.params.id).delete();
    res.json({ ok: true });
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: "Failed" }); }
});

// PATCH /api/preaching-drafts/:id/status — submit or recall a draft
// body: { status: 'submitted' | 'draft', submittedBy?: string, submittedByName?: string }
app.patch("/api/preaching-drafts/:id/status", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  try {
    const ref = firestore.collection("preachingDrafts").doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Draft not found" });
    const { status, submittedBy, submittedByName } = req.body as {
      status: string; submittedBy?: string; submittedByName?: string;
    };
    const updateData: Record<string, any> = {
      status,
      updatedAt: new Date().toISOString(),
    };
    if (status === "submitted") {
      updateData.submittedAt = new Date().toISOString();
      updateData.submittedBy = submittedBy ?? "";
      updateData.submittedByName = submittedByName ?? "";
      // Increment version counter each time submitted
      const prevVersion: number = (snap.data()?.submissionVersion ?? 0) as number;
      updateData.submissionVersion = prevVersion + 1;
      await ref.update(updateData);

      // 🔔 Notify Audio/Tech + Admin + Leaders a new design request is in the queue
      const draftTitle = (snap.data()?.title as string) || "Untitled Sermon";
      const preacherName = submittedByName || "A preacher";
      const isResubmission = prevVersion >= 1;
      const notifMessage = isResubmission
        ? `📋 Updated sermon from ${preacherName}`
        : `🎨 New Design Request from ${preacherName}`;
      const notifSubMessage = isResubmission
        ? `"${draftTitle}" has been updated — check Design Requests for the latest version.`
        : `"${draftTitle}" is ready for slides. Head to Design Requests to volunteer!`;

      // Write in-app notification
      firestore.collection("notifications").add({
        type: "new_design_request",
        message: notifMessage,
        subMessage: notifSubMessage,
        actorName: preacherName,
        actorPhoto: "",
        actorUserId: submittedBy ?? "",
        targetAudience: "non_member", // Audio/Tech + Admin + Leader; not basic Members
        resourceId: req.params.id,
        readBy: [],
        deletedBy: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => { /* silent */ });

      // FCM push to all non-member devices (fire-and-forget)
      sendPushNotification(firestore, {
        title: notifMessage,
        body: notifSubMessage,
        actorUserId: submittedBy ?? "",
        targetAudience: "non_member",
        type: "new_design_request",
        resourceId: req.params.id,
      });
    } else {
      // recalled back to draft — clear submission metadata but keep version counter
      // so the next re-submit still shows 'Latest Version' badge
      updateData.submittedAt = null;
      updateData.submittedBy = null;
      updateData.submittedByName = null;
      await ref.update(updateData);
    }
    res.json({ ok: true, submissionVersion: updateData.submissionVersion });
  } catch (e: any) {
    console.error("[preaching-drafts PATCH status]", e?.message ?? e);
    if (!res.headersSent) res.status(500).json({ error: "Failed" });
  }
});


// GET /api/preaching-drafts/submitted — all submitted drafts (Audio/Tech + Admin view)
app.get("/api/preaching-drafts/submitted", async (_req, res) => {
  const firestore = getDb();
  if (!firestore) return res.json([]);
  try {
    const snap = await firestore.collection("preachingDrafts")
      .where("status", "==", "submitted")
      .limit(100)
      .get();
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
    docs.sort((a, b) => (b.submittedAt ?? b.updatedAt ?? "").localeCompare(a.submittedAt ?? a.updatedAt ?? ""));
    res.json(docs);
  } catch (e: any) {
    console.error("[preaching-drafts/submitted GET]", e?.message ?? e);
    if (!res.headersSent) res.status(500).json({ error: "Failed" });
  }
});

// PATCH /api/preaching-drafts/:id/claim — Audio/Tech volunteer to design (first-claim-wins)
app.patch("/api/preaching-drafts/:id/claim", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const draftId = req.params.id;
  const { designerId, designerName, designerPhoto = "" } = req.body as {
    designerId: string; designerName: string; designerPhoto?: string;
  };
  if (!designerId || !designerName) return res.status(400).json({ error: "designerId and designerName required" });
  try {
    const ref = firestore.collection("preachingDrafts").doc(draftId);
    const result = await firestore.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { error: "not_found" };
      const data = snap.data() as Record<string, any>;
      if (data.designStatus === "in_design" || data.designStatus === "design_done") {
        return { error: "already_claimed", existingDesigner: data.designerName };
      }
      tx.update(ref, {
        designStatus: "in_design",
        designerId,
        designerName,
        designerPhoto,
        designClaimedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return { ok: true, authorId: data.authorId, title: data.title };
    });

    if (result.error === "not_found") return res.status(404).json({ error: "Draft not found" });
    if (result.error === "already_claimed") return res.status(409).json({ error: "already_claimed", existingDesigner: result.existingDesigner });

    // In-app notification for the preacher
    if (result.authorId) {
      firestore.collection("notifications").add({
        type: "design_claimed",
        message: "Your slides are being designed! 🎨",
        subMessage: `${designerName} has volunteered to design the slides for "${result.title || "your sermon"}".`,
        actorName: designerName,
        actorPhoto: designerPhoto,
        actorUserId: designerId,
        targetAudience: "direct",
        targetUserId: result.authorId,
        resourceId: draftId,
        readBy: [],
        deletedBy: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => { /* silent */ });

      // FCM push to the preacher's device(s)
      sendPushNotification(firestore, {
        title: "Your slides are being designed! 🎨",
        body: `${designerName} is working on slides for "${result.title || "your sermon"}".`,
        actorUserId: designerId,
        recipientUserId: result.authorId,
        targetAudience: "direct",
        type: "design_claimed",
        resourceId: draftId,
      });
    }

    res.json({ ok: true });
  } catch (e: any) {
    console.error("[claim]", e?.message);
    if (!res.headersSent) res.status(500).json({ error: "Failed to claim" });
  }
});

// PATCH /api/preaching-drafts/:id/complete — designer marks slides as done
app.patch("/api/preaching-drafts/:id/complete", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const draftId = req.params.id;
  const { designerId, designerName, designerPhoto = "" } = req.body as {
    designerId: string; designerName: string; designerPhoto?: string;
  };
  try {
    const ref = firestore.collection("preachingDrafts").doc(draftId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Draft not found" });
    const data = snap.data() as Record<string, any>;
    if (data.designerId && data.designerId !== designerId) {
      return res.status(403).json({ error: "Only the assigned designer can mark this as done" });
    }
    await ref.update({
      designStatus: "design_done",
      designCompletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // In-app notification for the preacher
    if (data.authorId) {
      firestore.collection("notifications").add({
        type: "design_done",
        message: "Slides are ready! ✅",
        subMessage: `${designerName} has finished designing the slides for "${data.title || "your sermon"}". You're all set for Sunday!`,
        actorName: designerName,
        actorPhoto: designerPhoto,
        actorUserId: designerId,
        targetAudience: "direct",
        targetUserId: data.authorId,
        resourceId: draftId,
        readBy: [],
        deletedBy: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => { /* silent */ });

      // FCM push to the preacher's device(s)
      sendPushNotification(firestore, {
        title: "Slides are ready! ✅",
        body: `${designerName} finished the slides for "${data.title || "your sermon"}". You're all set!`,
        actorUserId: designerId,
        recipientUserId: data.authorId,
        targetAudience: "direct",
        type: "design_done",
        resourceId: draftId,
      });
    }

    res.json({ ok: true });
  } catch (e: any) {
    console.error("[complete]", e?.message);
    if (!res.headersSent) res.status(500).json({ error: "Failed to mark complete" });
  }
});

// ── FREEDOM WALL ─────────────────────────────────────────────────────────────


// GET /api/freedom-wall — fetch all notes, newest first
app.get("/api/freedom-wall", async (_req, res) => {
  const firestore = getDb();
  if (!firestore) return res.json([]);
  try {
    const snap = await firestore.collection("freedomWall").orderBy("createdAt", "desc").limit(200).get();
    const notes = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
    }));
    res.json(notes);
  } catch (e) { res.status(500).json({ error: "Failed to fetch freedom wall notes" }); }
});

// POST /api/freedom-wall — create anonymous note
app.post("/api/freedom-wall", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { message, color, rotation, x, y, authorSessionToken } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "message required" });
  try {
    const ref = await firestore.collection("freedomWall").add({
      message: message.trim(), // no character limit — allow stories
      color: color || "#fef9c3",
      rotation: typeof rotation === "number" ? rotation : 0,
      x: typeof x === "number" ? x : 10,
      y: typeof y === "number" ? y : 10,
      reactions: {},
      userReactions: [],
      authorSessionToken: authorSessionToken || "", // stored for author self-delete
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.status(201).json({ id: ref.id });
  } catch (e) { res.status(500).json({ error: "Failed to create note" }); }
});

// PATCH /api/freedom-wall/:id/react — toggle emoji reaction by session token
app.patch("/api/freedom-wall/:id/react", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { emoji, sessionToken } = req.body;
  if (!emoji || !sessionToken) return res.status(400).json({ error: "emoji and sessionToken required" });
  try {
    const ref = firestore.collection("freedomWall").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Note not found" });

    const data = doc.data()!;
    const reactions: Record<string, number> = { ...(data.reactions || {}) };
    const userReactions: string[] = [...(data.userReactions || [])];
    const reactionKey = `${sessionToken}:${emoji}`;
    const alreadyReacted = userReactions.includes(reactionKey);

    if (alreadyReacted) {
      reactions[emoji] = Math.max(0, (reactions[emoji] ?? 1) - 1);
      if (reactions[emoji] === 0) delete reactions[emoji];
      const newUserReactions = userReactions.filter(r => r !== reactionKey);
      await ref.update({ reactions, userReactions: newUserReactions });
    } else {
      reactions[emoji] = (reactions[emoji] ?? 0) + 1;
      userReactions.push(reactionKey);
      await ref.update({ reactions, userReactions });
    }

    res.json({ success: true, reactions });
  } catch (e) { res.status(500).json({ error: "Failed to react" }); }
});

// PATCH /api/freedom-wall/:id — author-only message edit
app.patch("/api/freedom-wall/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { message, sessionToken } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "message required" });
  try {
    const ref = firestore.collection("freedomWall").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Note not found" });
    const data = doc.data()!;
    const isAuthor = sessionToken && data.authorSessionToken && data.authorSessionToken === sessionToken;
    if (!isAuthor) return res.status(403).json({ error: "Not authorised to edit this note" });
    await ref.update({ message: message.trim(), editedAt: new Date().toISOString() });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to update note" }); }
});

// DELETE /api/freedom-wall/:id — admin OR note author (matched by session token)
app.delete("/api/freedom-wall/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { isAdmin: callerIsAdmin, sessionToken } = req.body;
  try {
    const doc = await firestore.collection("freedomWall").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Note not found" });
    const data = doc.data()!;
    const isAuthor = sessionToken && data.authorSessionToken && data.authorSessionToken === sessionToken;
    if (!callerIsAdmin && !isAuthor) {
      return res.status(403).json({ error: "Not authorised to delete this note" });
    }
    await firestore.collection("freedomWall").doc(req.params.id).delete();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to delete note" }); }
});

// PATCH /api/freedom-wall/:id/move — anyone can reposition notes (drag is open to all)
// Edit and delete remain author/admin restricted.
app.patch("/api/freedom-wall/:id/move", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { x, y } = req.body;
  if (typeof x !== "number" || typeof y !== "number") {
    return res.status(400).json({ error: "x and y are required numbers" });
  }
  try {
    const doc = await firestore.collection("freedomWall").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Note not found" });
    await firestore.collection("freedomWall").doc(req.params.id).update({ x, y });
    res.json({ success: true });
  } catch { res.status(500).json({ error: "Failed to move note" }); }
});

// Normalise any dueDate value to a plain "YYYY-MM-DD" string.
// Planner cards may store dates as ISO strings, Firestore Timestamps, or display
// strings (e.g. "Apr 17, 2026"). The scheduling calendar compares with YYYY-MM-DD
// strings, so we must normalise before returning.
function normalizeDueDate(d: any): string | null {
  if (!d) return null;
  // Firestore Timestamp object
  if (typeof d === "object" && typeof d.toDate === "function") {
    return d.toDate().toISOString().slice(0, 10);
  }
  if (typeof d === "string") {
    // Already YYYY-MM-DD (possibly with time)
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    // Phrased date like "Apr 17, 2026"
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return null;
}

// GET /api/planner/my-cards — calendar integration
// Cards store members as display names. We support both memberName and userEmail queries
// and merge the results to handle mixed-format data in Firestore.
app.get("/api/planner/my-cards", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });

  const userEmail  = (req.query.userEmail  as string || "").trim().toLowerCase();
  const memberName = (req.query.memberName as string || "").trim();

  if (!userEmail && !memberName) return res.status(400).json({ error: "userEmail or memberName is required" });

  try {
    // Run both queries in parallel and merge — cards may store name OR email in members[]
    const queries: Promise<FirebaseFirestore.QuerySnapshot>[] = [];
    if (memberName) {
      queries.push(
        firestore.collection("pg_cards")
          .where("members", "array-contains", memberName)
          .where("archived", "==", false)
          .get()
      );
    }
    if (userEmail) {
      queries.push(
        firestore.collection("pg_cards")
          .where("members", "array-contains", userEmail)
          .where("archived", "==", false)
          .get()
      );
    }

    const snaps = await Promise.all(queries);

    // Merge and deduplicate by card ID
    const seenIds = new Set<string>();
    const allDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    for (const snap of snaps) {
      for (const doc of snap.docs) {
        if (!seenIds.has(doc.id)) {
          seenIds.add(doc.id);
          allDocs.push(doc);
        }
      }
    }

    // Filter to only cards with a parseable dueDate
    const cards = allDocs
      .map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null } as any))
      .filter((c: any) => !!c.dueDate && !c.archived)
      .map((c: any) => ({ ...c, dueDate: normalizeDueDate(c.dueDate) }))
      .filter((c: any) => !!c.dueDate); // drop cards where date couldn't be parsed

    if (cards.length === 0) return res.json([]);

    // Batch-fetch unique board titles
    const boardIds = [...new Set(cards.map((c: any) => c.boardId as string))];
    const boardSnaps = await Promise.all(
      boardIds.map((bid: string) => firestore!.collection("pg_boards").doc(bid).get())
    );
    const boardTitleMap: Record<string, string> = {};
    boardSnaps.forEach(bs => { if (bs.exists) boardTitleMap[bs.id] = (bs.data() as any).title || "Board"; });

    // Batch-fetch list titles to determine completed status
    // Cards have no `completed` field — done-ness is determined by the list name (DONE/COMPLETED column)
    const listIds = [...new Set(cards.map((c: any) => c.listId as string))];
    const listSnaps = await Promise.all(
      listIds.map((lid: string) => firestore!.collection("pg_lists").doc(lid).get())
    );
    const listTitleMap: Record<string, string> = {};
    listSnaps.forEach(ls => { if (ls.exists) listTitleMap[ls.id] = (ls.data() as any).title || ""; });

    const result = cards.map((c: any) => {
      const listTitle = listTitleMap[c.listId] || "";
      const isDoneList = /done|complete/i.test(listTitle);
      return {
        id: c.id,
        boardId: c.boardId,
        boardTitle: boardTitleMap[c.boardId] || "Ministry Hub",
        listId: c.listId,
        listTitle,
        title: c.title,
        dueDate: c.dueDate,
        startDate: c.startDate ?? null,
        completed: isDoneList || c.completed === true,
        members: c.members ?? [],
      };
    });

    res.json(result);
  } catch (e: any) {
    console.error("[GET /api/planner/my-cards]", e?.message);
    res.status(500).json({ error: "Failed to fetch assigned cards" });
  }
});




// ── PUBLIC PLAYLIST ───────────────────────────────────────────────────────────

// GET /api/public-playlist/check-slug?slug=... — check if slug is taken
// Must be defined BEFORE the :slug wildcard route
app.get("/api/public-playlist/check-slug", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const slug = (req.query.slug as string || "").trim();
  if (!slug) return res.status(400).json({ error: "slug required" });
  try {
    const doc = await firestore.collection("sharedPlaylists").doc(slug).get();
    res.json({ available: !doc.exists });
  } catch { res.json({ available: true }); }
});

// POST /api/public-playlist/sync-name — lightweight name/emoji update (no song refresh)
// Called automatically when the user renames a published playlist inside the app.
app.post("/api/public-playlist/sync-name", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { slug, name, emoji } = req.body as { slug: string; name: string; emoji?: string };
  if (!slug || !name) return res.status(400).json({ error: "slug and name required" });
  try {
    const ref = firestore.collection("sharedPlaylists").doc(slug);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Playlist not found" });
    await ref.update({ name, emoji: emoji ?? "🎵", updatedAt: new Date().toISOString() });
    res.json({ success: true });
  } catch (e: any) {
    console.error("[public-playlist/sync-name]", e?.message);
    res.status(500).json({ error: "Failed to sync name" });
  }
});

// GET /api/public-playlist/:slug — public, no auth required
app.get("/api/public-playlist/:slug", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { slug } = req.params;
  try {
    const doc = await firestore.collection("sharedPlaylists").doc(slug).get();
    if (!doc.exists) return res.status(404).json({ error: "Playlist not found" });

    const data = doc.data() as any;
    const storedSongs: any[] = data.songs ?? [];

    // ── Live-enrich songs with current video_url from the songs collection ──
    // This ensures playback works even if the playlist was published before
    // YouTube URLs were added to the songs in Song Management.
    if (storedSongs.length > 0) {
      const songIds = storedSongs.map((s: any) => s.id).filter(Boolean);
      // Firestore IN query supports up to 30 items; batch if needed
      const chunks: string[][] = [];
      for (let i = 0; i < songIds.length; i += 30) chunks.push(songIds.slice(i, i + 30));

      const liveMap: Record<string, string> = {};
      await Promise.all(chunks.map(async chunk => {
        const snap = await firestore!.collection("songs").where(admin.firestore.FieldPath.documentId(), "in", chunk).get();
        snap.docs.forEach(d => {
          const v = (d.data() as any).video_url ?? "";
          if (v) liveMap[d.id] = v;
        });
      }));

      data.songs = storedSongs.map((s: any) => ({
        ...s,
        // Prefer live value; fall back to stored value
        youtubeUrl: liveMap[s.id] ?? s.youtubeUrl ?? "",
      }));
    }

    res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
    res.json(data);
  } catch (e: any) {
    console.error("[public-playlist GET]", e?.message);
    res.status(500).json({ error: "Failed to load playlist" });
  }
});

// POST /api/public-playlist/publish — publish or unpublish
app.post("/api/public-playlist/publish", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(503).json({ error: "DB unavailable" });
  const { slug, playlist: pl, songs, unpublish } = req.body as {
    slug: string;
    playlist: { name: string; emoji: string; description?: string; bannerUrl?: string; accentColor?: string };
    songs: Array<{ id: string; title: string; artist?: string; youtubeUrl?: string; lyrics?: string; chords?: string }>;
    unpublish?: boolean;
  };
  if (!slug) return res.status(400).json({ error: "slug required" });
  if (!/^[a-z0-9-]{3,80}$/.test(slug))
    return res.status(400).json({ error: "Invalid slug. Use only lowercase letters, numbers and hyphens (3–80 chars)." });
  try {
    const ref = firestore.collection("sharedPlaylists").doc(slug);
    if (unpublish) {
      await ref.delete();
      return res.json({ success: true, unpublished: true });
    }
    await ref.set({
      name:        pl.name,
      emoji:       pl.emoji ?? "🎵",
      description: pl.description ?? "",
      bannerUrl:   pl.bannerUrl ?? "",
      accentColor: pl.accentColor || null,
      songs:       (songs ?? []).map(s => ({
        id: s.id, title: s.title, artist: s.artist ?? "",
        youtubeUrl: s.youtubeUrl ?? "", lyrics: s.lyrics ?? "", chords: s.chords ?? "",
      })),
      publishedAt: new Date().toISOString(),
    });
    res.json({ success: true, slug });
  } catch (e: any) {
    console.error("[public-playlist PUBLISH]", e?.message);
    res.status(500).json({ error: "Failed to publish playlist" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
