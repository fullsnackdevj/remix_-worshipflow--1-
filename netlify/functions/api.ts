import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import admin from "firebase-admin";
import { GoogleGenAI } from "@google/genai";

// Firebase init
function getDb(): FirebaseFirestore.Firestore | null {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!projectId || !clientEmail || !privateKey) return null;

    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        });
    }
    return admin.firestore();
}

function json(statusCode: number, body: unknown) {
    return {
        statusCode,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    };
}

export const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
    // Parse path: strip /.netlify/functions/api OR /api prefix
    const rawPath = event.path
        .replace(/^\/.netlify\/functions\/api/, "")
        .replace(/^\/api/, "") || "/";
    const method = event.httpMethod;
    const body = event.body ? JSON.parse(event.body) : {};

    const firestore = getDb();

    // ─── OCR ────────────────────────────────────────────────────────────────────
    if (rawPath === "/ocr" && method === "POST") {
        try {
            const { base64Data, mimeType, type } = body;
            if (!base64Data || !mimeType || !type) return json(400, { error: "Missing required fields" });

            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [
                    {
                        role: "user",
                        parts: [
                            { inlineData: { data: base64Data, mimeType } },
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
            return json(200, { text: response.text });
        } catch (err: any) {
            console.error("OCR Error:", err);
            return json(500, { error: "Failed to extract text from image" });
        }
    }

    if (!firestore) return json(500, { error: "Firebase not configured" });

    // ─── SONGS ──────────────────────────────────────────────────────────────────
    // GET /songs
    if (rawPath === "/songs" && method === "GET") {
        try {
            const search = event.queryStringParameters?.search || "";
            const tagId = event.queryStringParameters?.tagId || "";

            const snapshot = await firestore.collection("songs").get();
            const tagsSnap = await firestore.collection("tags").get();
            const allTags = tagsSnap.docs.reduce((acc, doc) => {
                acc[doc.id] = { id: doc.id, ...doc.data() };
                return acc;
            }, {} as any);

            let songs = snapshot.docs.map((doc) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    tags: (data.tagIds || []).map((id: string) => allTags[id]).filter(Boolean),
                    created_at: data.created_at?.toDate?.()?.toISOString() || data.created_at,
                    updated_at: data.updated_at?.toDate?.()?.toISOString() || data.updated_at,
                };
            });

            if (search) {
                const s = search.toLowerCase();
                songs = songs.filter(
                    (song: any) =>
                        song.title?.toLowerCase().includes(s) ||
                        song.artist?.toLowerCase().includes(s) ||
                        song.lyrics?.toLowerCase().includes(s) ||
                        song.chords?.toLowerCase().includes(s) ||
                        song.tags?.some((t: any) => t.name?.toLowerCase().includes(s))
                );
            }
            if (tagId) songs = songs.filter((song: any) => song.tagIds?.includes(tagId));
            songs.sort((a: any, b: any) => (a.title || "").localeCompare(b.title || ""));

            return json(200, songs);
        } catch (err) {
            console.error(err);
            return json(500, { error: "Failed to fetch songs" });
        }
    }

    // POST /songs
    if (rawPath === "/songs" && method === "POST") {
        try {
            const { title, artist, lyrics, chords, tags, video_url } = body;
            const docRef = await firestore.collection("songs").add({
                title,
                artist: artist || "",
                lyrics: lyrics || "",
                chords: chords || "",
                tagIds: tags || [],
                video_url: video_url || "",
                created_at: admin.firestore.FieldValue.serverTimestamp(),
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            return json(201, { id: docRef.id });
        } catch (err) {
            console.error(err);
            return json(500, { error: "Failed to create song" });
        }
    }

    // GET /songs/:id
    const songMatch = rawPath.match(/^\/songs\/([^/]+)$/);
    if (songMatch) {
        const id = songMatch[1];

        if (method === "GET") {
            try {
                const doc = await firestore.collection("songs").doc(id).get();
                if (!doc.exists) return json(404, { error: "Song not found" });
                const data = doc.data()!;
                const tagsSnap = await firestore.collection("tags").get();
                const allTags = tagsSnap.docs.reduce((acc, d) => {
                    acc[d.id] = { id: d.id, ...d.data() };
                    return acc;
                }, {} as any);
                return json(200, {
                    id: doc.id,
                    ...data,
                    tags: (data.tagIds || []).map((tid: string) => allTags[tid]).filter(Boolean),
                    created_at: data.created_at?.toDate?.()?.toISOString() || data.created_at,
                    updated_at: data.updated_at?.toDate?.()?.toISOString() || data.updated_at,
                });
            } catch (err) {
                return json(500, { error: "Failed to fetch song" });
            }
        }

        if (method === "PUT") {
            try {
                const { title, artist, lyrics, chords, tags, video_url } = body;
                await firestore.collection("songs").doc(id).update({
                    title,
                    artist: artist || "",
                    lyrics: lyrics || "",
                    chords: chords || "",
                    tagIds: tags || [],
                    video_url: video_url || "",
                    updated_at: admin.firestore.FieldValue.serverTimestamp(),
                });
                return json(200, { success: true });
            } catch (err) {
                return json(500, { error: "Failed to update song" });
            }
        }

        if (method === "DELETE") {
            try {
                await firestore.collection("songs").doc(id).delete();
                return json(200, { success: true });
            } catch (err) {
                return json(500, { error: "Failed to delete song" });
            }
        }
    }

    // ─── TAGS ───────────────────────────────────────────────────────────────────
    // GET /tags
    if (rawPath === "/tags" && method === "GET") {
        try {
            const snapshot = await firestore.collection("tags").orderBy("name").get();
            let tags = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as any[];

            const defaultTags = [
                { name: "Joyful", color: "bg-yellow-100 text-yellow-800" },
                { name: "Solemn", color: "bg-indigo-100 text-indigo-800" },
                { name: "English", color: "bg-blue-100 text-blue-800" },
                { name: "Tagalog", color: "bg-red-100 text-red-800" },
            ];

            const seenNames = new Set<string>();
            const uniqueTags: any[] = [];
            for (const tag of tags) {
                if (seenNames.has(tag.name)) {
                    await firestore.collection("tags").doc(tag.id).delete();
                } else {
                    seenNames.add(tag.name);
                    uniqueTags.push(tag);
                }
            }
            tags = uniqueTags;

            let changed = false;
            for (const defTag of defaultTags) {
                if (!tags.some((t) => t.name === defTag.name)) {
                    const docRef = await firestore.collection("tags").add(defTag);
                    tags.push({ id: docRef.id, ...defTag });
                    changed = true;
                }
            }
            if (changed) tags.sort((a, b) => a.name.localeCompare(b.name));

            return json(200, tags);
        } catch (err) {
            console.error(err);
            return json(500, { error: "Failed to fetch tags" });
        }
    }

    // POST /tags
    if (rawPath === "/tags" && method === "POST") {
        try {
            const { name, color } = body;
            const docRef = await firestore.collection("tags").add({ name, color: color || "bg-gray-100 text-gray-800" });
            return json(201, { id: docRef.id, name, color });
        } catch (err) {
            return json(500, { error: "Failed to create tag" });
        }
    }

    // DELETE /tags/:id
    const tagMatch = rawPath.match(/^\/tags\/([^/]+)$/);
    if (tagMatch && method === "DELETE") {
        try {
            await firestore.collection("tags").doc(tagMatch[1]).delete();
            return json(200, { success: true });
        } catch (err) {
            return json(500, { error: "Failed to delete tag" });
        }
    }

    return json(404, { error: "Not found" });
};
