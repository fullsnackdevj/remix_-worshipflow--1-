import * as dotenv from "dotenv";
dotenv.config();

import express from "express";
import compression from "compression";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import { GoogleGenAI } from "@google/genai";

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
      });
    }
    db = admin.firestore();
    // Set a connection timeout so Firestore calls don't hang indefinitely
    db.settings({ ignoreUndefinedProperties: true });
  }
  return db;
}

// Global 10-second timeout middleware — every API route must respond within 10s
app.use('/api', (req, res, next) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      console.error(`[TIMEOUT] ${req.method} ${req.path} timed out after 10s`);
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
    }
  }, 10000);
  res.on('finish', () => clearTimeout(timeout));
  res.on('close', () => clearTimeout(timeout));
  next();
});

// ── Notification helpers ────────────────────────────────────────────────────
async function writeNotification(firestore: admin.firestore.Firestore, payload: {
  type: "new_event" | "updated_event" | "new_song" | "access_request";
  message: string;
  subMessage: string;
  actorName: string;
  actorPhoto: string;
  targetAudience: "all" | "non_member" | "admin_only";
  resourceId?: string;
  resourceType?: string;
  resourceDate?: string;
}) {
  try {
    await firestore.collection("notifications").add({
      ...payload,
      readBy: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error("Failed to write notification:", e);
  }
}

// GET /api/notifications — fetch notifications for a given role+userId
app.get("/api/notifications", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.json([]);
  const role = (req.query.role as string) || "member";
  const userId = (req.query.userId as string) || "";
  try {
    const snap = await firestore.collection("notifications")
      .orderBy("createdAt", "desc")
      .limit(30)
      .get();
    const all = snap.docs.map(d => {
      const data = d.data() as Record<string, any>;
      const readBy: string[] = data.readBy || [];
      return { id: d.id, ...data, isRead: readBy.includes(userId), createdAt: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString() } as Record<string, any>;
    });
    // Filter by targetAudience
    const filtered = all.filter(n => {
      if (n["targetAudience"] === "all") return true;
      if (n["targetAudience"] === "admin_only") return role === "admin";
      if (n["targetAudience"] === "non_member") return role !== "member";
      return false;
    });
    res.json(filtered);
  } catch (e) {
    res.json([]);
  }
});

// PATCH /api/notifications/read — mark one or all as read for a userId
app.patch("/api/notifications/read", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.json({ success: true });
  const { userId, notifId } = req.body; // notifId optional = mark all
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    if (notifId) {
      await firestore.collection("notifications").doc(notifId).update({
        readBy: admin.firestore.FieldValue.arrayUnion(userId),
      });
    } else {
      const snap = await firestore.collection("notifications").get();
      const batch = firestore.batch();
      snap.docs.forEach(d => batch.update(d.ref, { readBy: admin.firestore.FieldValue.arrayUnion(userId) }));
      await batch.commit();
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to mark read" });
  }
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
    const { actorName = "Someone", actorPhoto = "" } = req.body;
    writeNotification(firestore, {
      type: "new_song",
      message: `${actorName} added a new song`,
      subMessage: `🎵 "${toTitleCase(title)}" by ${toTitleCase(artist)}`,
      actorName, actorPhoto,
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
    res.json(members);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch members" });
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
  const { date, serviceType, worshipLeader, backupSingers, musicians, songLineup, notes, eventName, customTeamMembers } = req.body;
  if (!date) return res.status(400).json({ error: "Date is required." });
  try {
    const docRef = await firestore.collection("schedules").add({
      date,
      serviceType: serviceType || "sunday",
      eventName: eventName || "",
      customTeamMembers: (customTeamMembers || []).map(stripPhoto),
      worshipLeader: stripPhoto(worshipLeader),
      backupSingers: (backupSingers || []).map(stripPhoto),
      musicians: (musicians || []).map(stripPhoto),
      songLineup: songLineup || { joyful: "", solemn: "" },
      notes: notes || "",
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Fire-and-forget notification
    const { actorName: aN1 = "Someone", actorPhoto: aP1 = "" } = req.body;
    const dateLabel1 = new Date(date + "T00:00:00").toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    writeNotification(firestore, {
      type: "new_event",
      message: `${aN1} created a new event`,
      subMessage: `📅 ${eventName || "Event"} — ${dateLabel1}`,
      actorName: aN1, actorPhoto: aP1,
      targetAudience: "all",
      resourceId: docRef.id,
      resourceType: "event",
      resourceDate: date,
    });

    res.status(201).json({ id: docRef.id, date, serviceType: serviceType || "sunday", eventName: eventName || "", worshipLeader: worshipLeader || null, backupSingers: backupSingers || [], musicians: musicians || [], songLineup: songLineup || { joyful: "", solemn: "" }, notes: notes || "" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create schedule" });
  }
});

app.put("/api/schedules/:id", async (req, res) => {
  const firestore = getDb();
  if (!firestore) return res.status(500).json({ error: "Firebase not configured" });
  const { id } = req.params;
  const { date, serviceType, worshipLeader, backupSingers, musicians, songLineup, notes, eventName, customTeamMembers } = req.body;
  if (!date) return res.status(400).json({ error: "Date is required." });
  try {
    await firestore.collection("schedules").doc(id).update({
      date,
      serviceType: serviceType || "sunday",
      eventName: eventName || "",
      customTeamMembers: (customTeamMembers || []).map(stripPhoto),
      worshipLeader: stripPhoto(worshipLeader),
      backupSingers: (backupSingers || []).map(stripPhoto),
      musicians: (musicians || []).map(stripPhoto),
      songLineup: songLineup || { joyful: "", solemn: "" },
      notes: notes || "",
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Fire-and-forget notification
    const { actorName: aN2 = "Someone", actorPhoto: aP2 = "" } = req.body;
    const dateLabel2 = new Date(date + "T00:00:00").toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    writeNotification(firestore, {
      type: "updated_event",
      message: `${aN2} updated an event`,
      subMessage: `📅 ${eventName || "Event"} — ${dateLabel2}`,
      actorName: aN2, actorPhoto: aP2,
      targetAudience: "all",
      resourceId: id,
      resourceType: "event",
      resourceDate: date,
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update schedule" });
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

app.post("/api/ocr", async (req, res) => {
  try {
    const { base64Data, mimeType, type } = req.body;
    if (!base64Data || !mimeType || !type) {
      return res.status(400).json({ error: "Missing required fields" });
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
              text: `You are a precise music document transcriber. Transcribe ALL visible text from this image EXACTLY as it appears, preserving:
- Every section label (e.g. "Verse:", "Chorus:", "Bridge:", "Pre Chorus:", etc.)
- Every tag or annotation (e.g. "//JOYFUL", "(3x)", "(Jesus...)")
- Every song title or header at the top
- Every chord or lyric line, in the correct order
- Empty lines between sections for spacing

Rules:
- Do NOT skip any line of text you can see.
- Do NOT add, invent, or summarize anything.
- Do NOT use Markdown formatting (no **, no ##, no bullets).
- Output ONLY the plain text transcription, nothing else.`,
            },
          ],
        },
      ],
    });

    res.json({ text: response.text });
  } catch (error) {
    console.error("OCR Error:", error);
    res.status(500).json({ error: "Failed to extract text from image" });
  }
});

// Vite middleware setup
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
