import * as dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

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
  }
  return db;
}

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
    // Duplicate check: same title (case-insensitive) AND same artist (case-insensitive)
    const existing = await firestore.collection("songs").get();
    const normalizedTitle = title.trim().toLowerCase();
    const normalizedArtist = artist.trim().toLowerCase();
    const duplicate = existing.docs.find((doc) => {
      const d = doc.data();
      return (
        (d.title || "").trim().toLowerCase() === normalizedTitle &&
        (d.artist || "").trim().toLowerCase() === normalizedArtist
      );
    });
    if (duplicate) {
      return res.status(409).json({
        error: `Duplicate song detected! "${title}" by "${artist}" already exists in the database.`,
      });
    }

    const docRef = await firestore.collection("songs").add({
      title: title.trim(),
      artist: artist.trim(),
      lyrics: lyrics.trim(),
      chords: chords || "",
      tagIds: tags,
      video_url: video_url || "",
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
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

  try {
    await firestore.collection("songs").doc(id).update({
      title,
      artist: artist || "",
      lyrics: lyrics || "",
      chords: chords || "",
      tagIds: tags || [],
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
      { name: "Joyful", color: "bg-yellow-100 text-yellow-800" },
      { name: "Solemn", color: "bg-indigo-100 text-indigo-800" },
      { name: "English", color: "bg-blue-100 text-blue-800" },
      { name: "Tagalog", color: "bg-red-100 text-red-800" }
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
