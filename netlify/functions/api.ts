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

const toTitleCase = (str: string) =>
    str.trim().replace(/\b\w/g, (char) => char.toUpperCase());

function normalizeLyrics(text: string): string {
    return text
        .toLowerCase()
        .replace(/\b(verse|chorus|bridge|pre[-\s]?chorus|outro|intro|tag|refrain|hook|interlude)\b/gi, "")
        .replace(/[^a-z0-9]/g, "");
}

function lyricsAreDuplicate(a: string, b: string): boolean {
    const na = normalizeLyrics(a);
    const nb = normalizeLyrics(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    const wordsOf = (s: string) => new Set(s.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const wa = wordsOf(a);
    const wb = wordsOf(b);
    const intersection = [...wa].filter(w => wb.has(w)).length;
    const union = new Set([...wa, ...wb]).size;
    return union > 0 && intersection / union >= 0.85;
}

// ── Notification helper ─────────────────────────────────────────────────────
// Send FCM push to relevant devices
async function sendPush(firestore: FirebaseFirestore.Firestore | null, payload: {
    title: string; body: string; actorUserId?: string; targetAudience: string;
    type?: string; resourceId?: string; resourceDate?: string;
}) {
    if (!firestore) return;
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
            if (payload.actorUserId && tokenUserId === payload.actorUserId) return;
            if (payload.targetAudience === "admin_only" && role !== "admin") return;
            if (payload.targetAudience === "non_member" && role === "member") return;
            tokens.push(token);
        });
        if (tokens.length === 0) return;

        // Build deep-link URL
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
                data: {
                    type: payload.type || "",
                    resourceId: payload.resourceId || "",
                    resourceDate: payload.resourceDate || "",
                    deepLink,
                },
                notification: { title: payload.title, body: payload.body },
                webpush: {
                    notification: { title: payload.title, body: payload.body, icon: "/icon-192x192.png", badge: "/favicon-32.png", vibrate: [200, 100, 200] },
                    fcmOptions: { link: deepLink },
                },
            });
            response.responses.forEach((r, idx) => {
                if (!r.success && (r.error?.code === "messaging/invalid-registration-token" || r.error?.code === "messaging/registration-token-not-registered")) {
                    firestore.collection("fcm_tokens").where("token", "==", batch[idx]).get()
                        .then(snap => snap.docs.forEach(d => d.ref.delete())).catch(() => { });
                }
            });
        }
    } catch (e) { console.error("Push send failed:", e); }
}

async function writeNotif(firestore: FirebaseFirestore.Firestore | null, payload: {
    type: string; message: string; subMessage: string;
    actorName: string; actorPhoto: string; actorUserId?: string; targetAudience: string;
    resourceId?: string; resourceType?: string; resourceDate?: string;
}) {
    if (!firestore) return;
    try {
        await firestore.collection("notifications").add({
            ...payload, readBy: [], deletedBy: [],
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        sendPush(firestore, { title: payload.message, body: payload.subMessage, actorUserId: payload.actorUserId, targetAudience: payload.targetAudience, type: payload.type, resourceId: payload.resourceId, resourceDate: payload.resourceDate });
    } catch (e) { console.error("notif write failed", e); }
}

export const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
    // Parse path: strip /.netlify/functions/api OR /api prefix
    const rawPath = event.path
        .replace(/^\/\.netlify\/functions\/api/, "")
        .replace(/^\/api/, "") || "/";
    const method = event.httpMethod;
    const body = event.body ? JSON.parse(event.body) : {};

    const firestore = getDb();

    // ─── AUTH ────────────────────────────────────────────────────────────────────
    if (rawPath === "/auth/check" && method === "GET") {
        const email = event.queryStringParameters?.email ?? "";
        if (!email) return json(400, { error: "Missing email" });
        const ADMIN_EMAIL = "jayfullsnackdev@gmail.com";
        if (email === ADMIN_EMAIL) return json(200, { approved: true, role: "admin" });
        try {
            const doc = await firestore?.collection("approved_users").doc(email).get();
            if (doc?.exists) return json(200, { approved: true, role: doc.data()?.role ?? "member" });
            return json(200, { approved: false });
        } catch { return json(200, { approved: false }); }
    }

    if (rawPath === "/auth/approve" && method === "POST") {
        const { email, role = "member" } = body;
        if (!email) return json(400, { error: "Missing email" });
        await firestore?.collection("approved_users").doc(email).set({ email, role, approvedAt: new Date().toISOString() });
        // Remove from pending once approved
        await firestore?.collection("pending_users").doc(email).delete().catch(() => { });
        return json(200, { success: true });
    }

    if (rawPath === "/auth/request" && method === "POST") {
        const { email, name = "", photo = "" } = body;
        if (!email) return json(400, { error: "Missing email" });
        // Only log if not already approved
        const existing = await firestore?.collection("approved_users").doc(email).get();
        if (existing?.exists) return json(200, { skipped: true });
        await firestore?.collection("pending_users").doc(email).set({
            email, name, photo,
            requestedAt: new Date().toISOString(),
        });
        // Notify admin
        writeNotif(firestore, {
            type: "access_request",
            message: "New access request",
            subMessage: `${name || email} is requesting access to WorshipFlow`,
            actorName: name || email, actorPhoto: photo,
            targetAudience: "admin_only",
        });
        return json(200, { success: true });
    }

    // GET /notifications
    if (rawPath === "/notifications" && method === "GET") {
        const role = event.queryStringParameters?.role || "member";
        const userId = event.queryStringParameters?.userId || "";
        try {
            const snap = await firestore?.collection("notifications").orderBy("createdAt", "desc").limit(50).get();
            const all = (snap?.docs || []).map(d => {
                const data = d.data() as Record<string, any>;
                const readBy: string[] = data.readBy || [];
                const deletedBy: string[] = data.deletedBy || [];
                return { id: d.id, ...data, isRead: readBy.includes(userId), _deletedBy: deletedBy, createdAt: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString() } as Record<string, any>;
            });
            const filtered = all.filter(n => {
                if (userId && n["actorUserId"] === userId) return false; // self-exclusion
                if (n["_deletedBy"].includes(userId)) return false; // soft-deleted
                if (n["targetAudience"] === "all") return true;
                if (n["targetAudience"] === "admin_only") return role === "admin";
                if (n["targetAudience"] === "non_member") return role !== "member";
                return false;
            });
            return json(200, filtered);
        } catch { return json(200, []); }
    }

    // PATCH /notifications/read
    if (rawPath === "/notifications/read" && method === "PATCH") {
        const { userId, notifId } = body;
        if (!userId) return json(400, { error: "userId required" });
        try {
            if (notifId) {
                await firestore?.collection("notifications").doc(notifId).update({ readBy: admin.firestore.FieldValue.arrayUnion(userId) });
            } else {
                const snap = await firestore?.collection("notifications").get();
                const batch = firestore?.batch();
                snap?.docs.forEach(d => batch?.update(d.ref, { readBy: admin.firestore.FieldValue.arrayUnion(userId) }));
                await batch?.commit();
            }
            return json(200, { success: true });
        } catch { return json(500, { error: "Failed" }); }
    }

    // PATCH /notifications/unread
    if (rawPath === "/notifications/unread" && method === "PATCH") {
        const { userId, notifId } = body;
        if (!userId || !notifId) return json(400, { error: "userId and notifId required" });
        try {
            await firestore?.collection("notifications").doc(notifId).update({ readBy: admin.firestore.FieldValue.arrayRemove(userId) });
            return json(200, { success: true });
        } catch { return json(500, { error: "Failed" }); }
    }

    // DELETE /notifications/clear-all — soft delete all for user
    if (rawPath === "/notifications/clear-all" && method === "DELETE") {
        const { userId } = body;
        if (!userId) return json(400, { error: "userId required" });
        try {
            const snap = await firestore?.collection("notifications").get();
            const batch = firestore?.batch();
            snap?.docs.forEach(d => batch?.update(d.ref, { deletedBy: admin.firestore.FieldValue.arrayUnion(userId) }));
            await batch?.commit();
            return json(200, { success: true });
        } catch { return json(500, { error: "Failed" }); }
    }

    // DELETE /notifications/:id — soft delete one for user
    const notifDeleteMatch = rawPath.match(/^\/notifications\/([^/]+)$/);
    if (notifDeleteMatch && method === "DELETE") {
        const id = notifDeleteMatch[1];
        const { userId } = body;
        if (!userId) return json(400, { error: "userId required" });
        try {
            await firestore?.collection("notifications").doc(id).update({ deletedBy: admin.firestore.FieldValue.arrayUnion(userId) });
            return json(200, { success: true });
        } catch { return json(500, { error: "Failed" }); }
    }

    // POST /fcm-token — store FCM push token for a user
    if (rawPath === "/fcm-token" && method === "POST") {
        const { userId, role, token } = body;
        if (!userId || !token) return json(400, { error: "userId and token required" });
        try {
            await firestore?.collection("fcm_tokens").doc(userId).set({
                userId, role: role || "member", token,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return json(200, { success: true });
        } catch (e) { return json(500, { error: "Failed to store token" }); }
    }

    if (rawPath === "/auth/pending" && method === "GET") {
        const snap = await firestore?.collection("pending_users").orderBy("requestedAt", "desc").get();
        const users = snap?.docs.map(d => d.data()) ?? [];
        return json(200, users);
    }

    if (rawPath === "/auth/revoke" && method === "DELETE") {
        const { email } = body;
        if (!email) return json(400, { error: "Missing email" });
        await firestore?.collection("approved_users").doc(email).delete();
        return json(200, { success: true });
    }

    if (rawPath === "/auth/revoke-pending" && method === "DELETE") {
        const { email } = body;
        if (!email) return json(400, { error: "Missing email" });
        await firestore?.collection("pending_users").doc(email).delete();
        return json(200, { success: true });
    }

    if (rawPath === "/auth/users" && method === "GET") {
        const snap = await firestore?.collection("approved_users").get();
        const users = snap?.docs.map(d => d.data()) ?? [];
        return json(200, users);
    }

    if (rawPath === "/auth/update-role" && method === "PUT") {
        const { email, role } = body;
        if (!email || !role) return json(400, { error: "Missing email or role" });
        try {
            await firestore?.collection("approved_users").doc(email).update({ role });
            return json(200, { success: true });
        } catch (err) {
            console.error(err);
            return json(500, { error: "Failed to update role" });
        }
    }

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
        const { title, artist, lyrics, chords, tags, video_url } = body;

        // Required field validation
        const missingFields: string[] = [];
        if (!title?.trim()) missingFields.push("Title");
        if (!artist?.trim()) missingFields.push("Artist");
        if (!lyrics?.trim()) missingFields.push("Lyrics");
        if (!tags || tags.length === 0) missingFields.push("Tags (at least one)");
        if (missingFields.length > 0) {
            return json(400, { error: `The following required fields are missing: ${missingFields.join(", ")}.` });
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
                return json(409, {
                    error: `Duplicate song detected! This appears to be the same song as "${d.title}" by "${d.artist}" already in the database. Please check the existing entry before adding.`,
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
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            const { actorName = "Someone", actorPhoto = "", actorUserId = "" } = body;
            writeNotif(firestore, {
                type: "new_song",
                message: `${actorName} added a new song`,
                subMessage: `🎵 "${toTitleCase(title)}" by ${toTitleCase(artist)}`,
                actorName, actorPhoto, actorUserId, targetAudience: "non_member",
                resourceId: docRef.id, resourceType: "song",
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
            const { title, artist, lyrics, chords, tags, video_url } = body;

            // Required field validation
            const missingFields: string[] = [];
            if (!title?.trim()) missingFields.push("Title");
            if (!artist?.trim()) missingFields.push("Artist");
            if (!lyrics?.trim()) missingFields.push("Lyrics");
            if (!tags || tags.length === 0) missingFields.push("Tags (at least one)");
            if (missingFields.length > 0) {
                return json(400, { error: `The following required fields are missing: ${missingFields.join(", ")}.` });
            }

            try {
                // Duplicate check: same title+artist OR highly similar lyrics (excluding self)
                const existing = await firestore.collection("songs").get();
                const normalizedTitle = title.trim().toLowerCase();
                const normalizedArtist = artist.trim().toLowerCase();
                const incomingLyrics = lyrics.trim();

                const duplicate = existing.docs.find((doc) => {
                    if (doc.id === id) return false;
                    const d = doc.data();
                    const sameTA =
                        (d.title || "").trim().toLowerCase() === normalizedTitle &&
                        (d.artist || "").trim().toLowerCase() === normalizedArtist;
                    const sameLyrics = lyricsAreDuplicate(incomingLyrics, d.lyrics || "");
                    return sameTA || sameLyrics;
                });

                if (duplicate) {
                    const d = duplicate.data();
                    return json(409, {
                        error: `Duplicate song detected! This appears to be the same song as "${d.title}" by "${d.artist}" already in the database. Please check the existing entry before adding.`,
                    });
                }

                await firestore.collection("songs").doc(id).update({
                    title: toTitleCase(title),
                    artist: toTitleCase(artist),
                    lyrics: lyrics.trim().toUpperCase(),
                    chords: chords || "",
                    tagIds: tags,
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
                { name: "English, Solemn", color: "bg-violet-100 text-violet-700" },
                { name: "English, Joyful", color: "bg-emerald-100 text-emerald-700" },
                { name: "Tagalog, Solemn", color: "bg-rose-100 text-rose-700" },
                { name: "Tagalog, Joyful", color: "bg-amber-100 text-amber-700" },
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

    // ─── MEMBERS ────────────────────────────────────────────────────────────────
    // GET /members
    if (rawPath === "/members" && method === "GET") {
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
            return json(200, members);
        } catch (err) {
            console.error(err);
            return json(500, { error: "Failed to fetch members" });
        }
    }

    // POST /members
    if (rawPath === "/members" && method === "POST") {
        const { name, phone, email, photo, roles, status, notes } = body;
        const missingFields: string[] = [];
        if (!name?.trim()) missingFields.push("Name");
        if (!phone?.trim()) missingFields.push("Phone");
        if (missingFields.length > 0) {
            return json(400, { error: `Missing required fields: ${missingFields.join(", ")}.` });
        }
        try {
            const docRef = await firestore.collection("members").add({
                name: toTitleCase(name),
                phone: phone.trim(),
                email: (email || "").trim().toLowerCase(),
                photo: photo || "",
                roles: roles || [],
                status: status || "active",
                notes: notes || "",
                created_at: admin.firestore.FieldValue.serverTimestamp(),
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            return json(201, { id: docRef.id });
        } catch (err) {
            console.error(err);
            return json(500, { error: "Failed to create member" });
        }
    }

    // PUT /members/:id  &  DELETE /members/:id
    const memberMatch = rawPath.match(/^\/members\/([^/]+)$/);
    if (memberMatch) {
        const id = memberMatch[1];

        if (method === "PUT") {
            const { name, phone, email, photo, roles, status, notes } = body;
            const missingFields: string[] = [];
            if (!name?.trim()) missingFields.push("Name");
            if (!phone?.trim()) missingFields.push("Phone");
            if (missingFields.length > 0) {
                return json(400, { error: `Missing required fields: ${missingFields.join(", ")}.` });
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
                return json(200, { success: true });
            } catch (err) {
                return json(500, { error: "Failed to update member" });
            }
        }

        if (method === "DELETE") {
            try {
                await firestore.collection("members").doc(id).delete();
                return json(200, { success: true });
            } catch (err) {
                return json(500, { error: "Failed to delete member" });
            }
        }
    }

    // ─── SCHEDULES ───────────────────────────────────────────────────────────────
    // GET /schedules
    if (rawPath === "/schedules" && method === "GET") {
        try {
            const snapshot = await firestore.collection("schedules").orderBy("date").get();
            const schedules = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    created_at: data.created_at?.toDate?.()?.toISOString() || data.created_at,
                    updated_at: data.updated_at?.toDate?.()?.toISOString() || data.updated_at,
                };
            });
            return json(200, schedules);
        } catch (err) {
            console.error(err);
            return json(500, { error: "Failed to fetch schedules" });
        }
    }

    // POST /schedules
    if (rawPath === "/schedules" && method === "POST") {
        const { date, serviceType, worshipLeader, backupSingers, musicians, songLineup, notes, eventName, assignments } = body;
        if (!date) return json(400, { error: "Date is required." });
        const stripPhoto = (m: any) => m ? { memberId: m.memberId, name: m.name, role: m.role || "" } : null;
        try {
            const docRef = await firestore.collection("schedules").add({
                date,
                serviceType: serviceType || "sunday",
                eventName: eventName || "",
                worshipLeader: stripPhoto(worshipLeader),
                backupSingers: (backupSingers || []).map(stripPhoto),
                musicians: (musicians || []).map(stripPhoto),
                assignments: (assignments || []).map((a: any) => ({ role: a.role, members: (a.members || []).map(stripPhoto) })),
                songLineup: songLineup || { joyful: "", solemn: "" },
                notes: notes || "",
                created_at: admin.firestore.FieldValue.serverTimestamp(),
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            const { actorName: aN1 = "Someone", actorPhoto: aP1 = "", actorUserId: aU1 = "" } = body;
            const dl1 = new Date(date + "T00:00:00").toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
            writeNotif(firestore, { type: "new_event", message: `${aN1} created a new event`, subMessage: `📅 ${eventName || "Event"} — ${dl1}`, actorName: aN1, actorPhoto: aP1, actorUserId: aU1, targetAudience: "all", resourceId: docRef.id, resourceType: "event", resourceDate: date });
            return json(201, { id: docRef.id });
        } catch (err) {
            console.error(err);
            return json(500, { error: "Failed to create schedule" });
        }
    }

    // PUT /schedules/:id  &  DELETE /schedules/:id
    const schedMatch = rawPath.match(/^\/schedules\/([^/]+)$/);
    if (schedMatch) {
        const id = schedMatch[1];
        const stripPhoto = (m: any) => m ? { memberId: m.memberId, name: m.name, role: m.role || "" } : null;

        if (method === "PUT") {
            const { date, serviceType, worshipLeader, backupSingers, musicians, songLineup, notes, eventName, assignments } = body;
            if (!date) return json(400, { error: "Date is required." });
            try {
                await firestore.collection("schedules").doc(id).update({
                    date,
                    serviceType: serviceType || "sunday",
                    eventName: eventName || "",
                    worshipLeader: stripPhoto(worshipLeader),
                    backupSingers: (backupSingers || []).map(stripPhoto),
                    musicians: (musicians || []).map(stripPhoto),
                    assignments: (assignments || []).map((a: any) => ({ role: a.role, members: (a.members || []).map(stripPhoto) })),
                    songLineup: songLineup || { joyful: "", solemn: "" },
                    notes: notes || "",
                    updated_at: admin.firestore.FieldValue.serverTimestamp(),
                });
                const { actorName: aN2 = "Someone", actorPhoto: aP2 = "", actorUserId: aU2 = "" } = body;
                const dl2 = new Date(date + "T00:00:00").toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
                writeNotif(firestore, { type: "updated_event", message: `${aN2} updated an event`, subMessage: `📅 ${eventName || "Event"} — ${dl2}`, actorName: aN2, actorPhoto: aP2, actorUserId: aU2, targetAudience: "all", resourceId: id, resourceType: "event", resourceDate: date });
                return json(200, { success: true });
            } catch (err) {
                console.error(err);
                return json(500, { error: "Failed to update schedule" });
            }
        }

        if (method === "DELETE") {
            try {
                await firestore.collection("schedules").doc(id).delete();
                return json(200, { success: true });
            } catch (err) {
                console.error(err);
                return json(500, { error: "Failed to delete schedule" });
            }
        }
    }

    return json(404, { error: "Not found" });
};

