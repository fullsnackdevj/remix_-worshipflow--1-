import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import admin from "firebase-admin";
import { GoogleGenAI } from "@google/genai";
import { Resend } from "resend";

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

// ── Email Notifications via Resend ────────────────────────────────────────────
async function sendScheduleEmail(
    firestore: FirebaseFirestore.Firestore,
    opts: {
        action: "created" | "updated";
        eventName: string;
        date: string;
        serviceType: string;
        worshipLeader?: { name: string; role?: string } | null;
        backupSingers?: { name: string; role?: string }[];
        musicians?: { name: string; role?: string }[];
        songLineup?: { joyful?: string; solemn?: string } | null;
        actorName: string;
        scheduleId: string;
    }
) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return; // silently skip if not configured

    try {
        const resend = new Resend(apiKey);
        // Fetch all approved members with emails
        const snap = await firestore.collection("approved_users").get();
        const emails: string[] = [];
        snap.forEach(doc => {
            const email = doc.data().email as string | undefined;
            if (email && email.includes("@")) emails.push(email);
        });
        if (emails.length === 0) return;

        const dateLabel = new Date(opts.date + "T00:00:00").toLocaleDateString("en", {
            weekday: "long", year: "numeric", month: "long", day: "numeric"
        });
        const serviceLabel = opts.serviceType === "sunday" ? "Sunday Service" :
            opts.serviceType === "special" ? "Special Event" :
            opts.serviceType === "midweek" ? "Mid-Week Service" :
            opts.serviceType.charAt(0).toUpperCase() + opts.serviceType.slice(1);
        const actionLabel = opts.action === "created" ? "New Event Scheduled" : "Event Updated";
        const emoji = opts.action === "created" ? "🎉" : "📝";

        const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);border:1px solid #e2e8f0;">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#6d28d9,#4f46e5);padding:32px 32px 28px;text-align:center;">
            <div style="font-size:38px;margin-bottom:10px;">🎵</div>
            <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px;">WorshipFlow</h1>
            <p style="color:#ddd6fe;margin:6px 0 0;font-size:13px;letter-spacing:0.5px;">TEAM SCHEDULE UPDATE</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:28px 32px 24px;">
            <p style="color:#475569;margin:0 0 20px;font-size:15px;line-height:1.5;">${emoji} <strong style="color:#1e293b;">${opts.actorName}</strong> ${opts.action === "created" ? "has scheduled a new event for your team." : "has updated a team event."}</p>
            <!-- Event Card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
              <tr><td style="padding:20px 22px;">
                <p style="margin:0 0 3px;font-size:11px;color:#6d28d9;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;">${serviceLabel}</p>
                <h2 style="margin:0 0 18px;color:#0f172a;font-size:20px;font-weight:800;">${opts.eventName || "Worship Service"}</h2>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:10px 0;border-top:1px solid #e2e8f0;">
                      <span style="color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">📅 Date</span>
                      <p style="margin:4px 0 0;color:#1e293b;font-size:15px;font-weight:600;">${dateLabel}</p>
                    </td>
                  </tr>
                  ${opts.worshipLeader ? `<tr><td style="padding:10px 0;border-top:1px solid #e2e8f0;"><span style="color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">🎤 Worship Leader</span><p style="margin:4px 0 0;color:#1e293b;font-size:15px;font-weight:600;">${opts.worshipLeader.name}</p></td></tr>` : ""}
                  ${opts.backupSingers && opts.backupSingers.length > 0 ? `<tr><td style="padding:10px 0;border-top:1px solid #e2e8f0;"><span style="color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">🎙️ Backup Singers</span>${opts.backupSingers.map(m => `<p style="margin:4px 0 0;color:#1e293b;font-size:14px;font-weight:500;">${m.name}${m.role ? ` <span style="color:#7c3aed;font-size:12px;font-weight:600;">(${m.role})</span>` : ""}</p>`).join("")}</td></tr>` : ""}
                  ${opts.musicians && opts.musicians.length > 0 ? `<tr><td style="padding:10px 0;border-top:1px solid #e2e8f0;"><span style="color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">🎸 Musicians</span>${opts.musicians.map(m => `<p style="margin:4px 0 0;color:#1e293b;font-size:14px;font-weight:500;">${m.name}${m.role ? ` <span style="color:#0891b2;font-size:12px;font-weight:600;">(${m.role})</span>` : ""}</p>`).join("")}</td></tr>` : ""}
                  ${opts.songLineup && (opts.songLineup.solemn || opts.songLineup.joyful) ? `<tr><td style="padding:10px 0;border-top:1px solid #e2e8f0;"><span style="color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">🎵 Song Lineup</span>${opts.songLineup.solemn ? `<p style="margin:6px 0 0;color:#1e293b;font-size:14px;font-weight:500;"><span style="display:inline-block;background:#ede9fe;color:#6d28d9;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:2px 7px;border-radius:4px;margin-right:6px;">Solemn</span>${opts.songLineup.solemn}</p>` : ""}${opts.songLineup.joyful ? `<p style="margin:6px 0 0;color:#1e293b;font-size:14px;font-weight:500;"><span style="display:inline-block;background:#dcfce7;color:#166534;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:2px 7px;border-radius:4px;margin-right:6px;">Joyful</span>${opts.songLineup.joyful}</p>` : ""}</td></tr>` : ""}
                </table>
              </td></tr>
            </table>
            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
              <tr><td align="center">
                <a href="https://worshipflow.dev" style="display:inline-block;background:linear-gradient(135deg,#6d28d9,#4f46e5);color:#fff;text-decoration:none;padding:13px 36px;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.2px;">View Schedule →</a>
              </td></tr>
            </table>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #e2e8f0;background:#f8fafc;text-align:center;">
            <p style="color:#94a3b8;font-size:12px;margin:0;">WorshipFlow · <a href="https://worshipflow.dev" style="color:#6d28d9;text-decoration:none;">worshipflow.dev</a> · You're receiving this because you're part of the worship team.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

        // Use Resend batch API — all in ONE call, avoids Netlify 30s timeout
        const subject = `${emoji} ${actionLabel}: ${opts.eventName || "Worship Service"} — ${dateLabel}`;
        await resend.batch.send(
            emails.map(email => ({
                from: "WorshipFlow <no-reply@worshipflow.dev>",
                to: [email],
                subject,
                html: htmlBody,
            }))
        );
    } catch (err) {
        console.error("[Resend] Failed to send schedule email:", err);
    }
}

// ── Welcome Email ─────────────────────────────────────────────────────────────
async function sendWelcomeEmail(
    email: string,
    firstName: string,
) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;
    try {
        const resend = new Resend(apiKey);
        const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#6d28d9,#4f46e5);padding:32px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:26px;font-weight:700;">🎵 WorshipFlow</h1>
            <p style="color:#c4b5fd;margin:8px 0 0;font-size:14px;font-style:normal;">Glorify God In Every Flow</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="color:#f1f5f9;font-size:20px;font-weight:700;margin:0 0 4px;">Hi ${firstName}! 👋</p>
            <p style="color:#94a3b8;font-size:14px;margin:0 0 24px;">Great news — your access to <strong style="color:#e2e8f0;">WorshipFlow</strong> has been approved!</p>

            <p style="color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Here's what you can do inside the app:</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:12px;border:1px solid #334155;">
              <tr><td style="padding:20px 24px;">
                <p style="margin:0 0 10px;color:#e2e8f0;font-size:14px;">👤 See who's leading worship each service</p>
                <p style="margin:0 0 10px;color:#e2e8f0;font-size:14px;">🎸 Check musician assignments and instruments</p>
                <p style="margin:0 0 10px;color:#e2e8f0;font-size:14px;">🎵 View the song lineup for every service</p>
                <p style="margin:0 0 10px;color:#e2e8f0;font-size:14px;">📝 Read special notes from the team</p>
                <p style="margin:0;color:#e2e8f0;font-size:14px;">🔥 Stay updated on upcoming events</p>
              </td></tr>
            </table>

            <p style="color:#94a3b8;font-size:14px;margin:24px 0 8px;">Whenever a new schedule is posted, you'll receive a notification email — so you'll always know what's coming up <strong style="color:#e2e8f0;">before Sunday arrives</strong>.</p>
            <p style="color:#94a3b8;font-size:14px;margin:0 0 24px;">No more chasing updates in group chats! 🙌</p>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr><td align="center">
                <a href="https://worshipflow.dev" style="display:inline-block;background:linear-gradient(135deg,#6d28d9,#4f46e5);color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">Open WorshipFlow →</a>
              </td></tr>
            </table>

            <!-- Closing -->
            <p style="color:#e2e8f0;font-size:14px;text-align:center;margin:0;">Blessings, The WorshipFlow Team 🎵</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #334155;text-align:center;">
            <p style="color:#475569;font-size:12px;margin:0;">WorshipFlow · worshipflow.dev · You're receiving this because you joined the worship team.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
        await resend.emails.send({
            from: "WorshipFlow <no-reply@worshipflow.dev>",
            to: [email],
            subject: "🎵 Welcome to WorshipFlow — You're In!",
            html,
        });
    } catch (err) {
        console.error("[Resend] Failed to send welcome email:", err);
    }
}

function json(statusCode: number, body: unknown, extraHeaders: Record<string, string> = {}) {
    return {
        statusCode,
        headers: { "Content-Type": "application/json", ...extraHeaders },
        body: JSON.stringify(body),
    };
}

const toTitleCase = (str: string) =>
    str.trim().replace(/\b\w/g, (char) => char.toUpperCase());

// ── Duplicate-detection helpers ─────────────────────────────────────────────

function normalizeText(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

/** Jaccard similarity on character trigrams — robust to minor spelling/spacing differences */
function trigramSimilarity(a: string, b: string): number {
    const trigrams = (s: string): Set<string> => {
        const set = new Set<string>();
        for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3));
        return set;
    };
    const ta = trigrams(normalizeText(a));
    const tb = trigrams(normalizeText(b));
    if (ta.size === 0 && tb.size === 0) return 1;
    if (ta.size === 0 || tb.size === 0) return 0;
    const intersection = [...ta].filter(t => tb.has(t)).length;
    const union = new Set([...ta, ...tb]).size;
    return intersection / union;
}

/** Lyrics containment: what fraction of the SHORTER song's key words appear in the longer one.
 *  This catches "I copied lyrics and added extra verses" — Jaccard would miss it. */
function lyricsContainment(a: string, b: string): number {
    const sectionHeaders = /\b(verse|chorus|bridge|pre[-\s]?chorus|outro|intro|tag|refrain|hook|interlude)\b/gi;
    const keyWords = (s: string): string[] =>
        s.toLowerCase()
         .replace(sectionHeaders, "")
         .split(/\s+/)
         .filter(w => w.length > 3);
    const wa = keyWords(a);
    const wb = keyWords(b);
    if (wa.length === 0 || wb.length === 0) return 0;
    const smaller = wa.length <= wb.length ? wa : wb;
    const largerSet = new Set(wa.length <= wb.length ? wb : wa);
    const matches = smaller.filter(w => largerSet.has(w)).length;
    return matches / smaller.length;
}

/** Multi-signal duplicate score: returns 0-1. ≥ 0.65 → flag as duplicate. */
function songDuplicateScore(
    incoming: { title: string; artist: string; tags: string[]; lyrics: string },
    existing:  { title: string; artist: string; tags: string[]; lyrics: string }
): number {
    // Title (35%): fuzzy via trigrams
    const titleScore = trigramSimilarity(incoming.title, existing.title);
    // Artist (25%): fuzzy via trigrams
    const artistScore = trigramSimilarity(incoming.artist, existing.artist);
    // Tags (15%): intersection ratio over union
    const ta = new Set(incoming.tags.map((t: string) => t.toLowerCase()));
    const tb = new Set(existing.tags.map((t: string) => t.toLowerCase()));
    const tagIntersect = [...ta].filter(t => tb.has(t)).length;
    const tagUnion = new Set([...ta, ...tb]).size;
    const tagScore = tagUnion > 0 ? tagIntersect / tagUnion : 0;
    // Lyrics (25%): containment — catches added-lines duplicates
    const lyricsScore = lyricsContainment(incoming.lyrics, existing.lyrics);

    return titleScore * 0.35 + artistScore * 0.25 + tagScore * 0.15 + lyricsScore * 0.25;
}

function duplicateSignalSummary(score: number, t: number, a: number, tag: number, l: number): string {
    const parts: string[] = [];
    if (t >= 0.8)   parts.push("title");
    if (a >= 0.8)   parts.push("artist");
    if (tag >= 0.8) parts.push("tags");
    if (l >= 0.75)  parts.push("lyrics");
    return parts.length ? parts.join(", ") : "overall similarity";
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
        // Read pending doc FIRST (before deleting) so we have the user's name for the welcome email
        const pendingDoc = firestore
            ? await firestore.collection("pending_users").doc(email).get().catch(() => null)
            : null;
        const pendingName = (pendingDoc?.data()?.name as string) || "";
        await firestore?.collection("approved_users").doc(email).set({ email, role, approvedAt: new Date().toISOString() });
        // Remove from pending once approved
        await firestore?.collection("pending_users").doc(email).delete().catch(() => { });
        // Send auto-welcome email to the newly approved member
        const firstName = pendingName.split(" ")[0] || email.split("@")[0];
        sendWelcomeEmail(email, firstName); // fire-and-forget
        return json(200, { success: true });
    }

    if (rawPath === "/welcome-blast" && method === "POST") {
        if (!firestore) return json(500, { error: "DB unavailable" });
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) return json(500, { error: "Email not configured" });
        const resend = new Resend(apiKey);
        const snap = await firestore.collection("approved_users").get();

        // Build welcome email HTML for a given first name
        const buildHtml = (firstName: string) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#6d28d9,#4f46e5);padding:32px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:26px;font-weight:700;">🎵 WorshipFlow</h1>
          <p style="color:#c4b5fd;margin:8px 0 0;font-size:14px;">Glorify God In Every Flow</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="color:#f1f5f9;font-size:20px;font-weight:700;margin:0 0 4px;">Hi ${firstName}! 👋</p>
          <p style="color:#94a3b8;font-size:14px;margin:0 0 24px;">Great news — your access to <strong style="color:#e2e8f0;">WorshipFlow</strong> has been approved!</p>
          <p style="color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Here's what you can do inside the app:</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:12px;border:1px solid #334155;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 10px;color:#e2e8f0;font-size:14px;">👤 See who's leading worship each service</p>
              <p style="margin:0 0 10px;color:#e2e8f0;font-size:14px;">🎸 Check musician assignments and instruments</p>
              <p style="margin:0 0 10px;color:#e2e8f0;font-size:14px;">🎵 View the song lineup for every service</p>
              <p style="margin:0 0 10px;color:#e2e8f0;font-size:14px;">📝 Read special notes from the team</p>
              <p style="margin:0;color:#e2e8f0;font-size:14px;">🔥 Stay updated on upcoming events</p>
            </td></tr>
          </table>
          <p style="color:#94a3b8;font-size:14px;margin:24px 0 8px;">Whenever a new schedule is posted, you'll receive a notification email — so you'll always know what's coming up <strong style="color:#e2e8f0;">before Sunday arrives</strong>.</p>
          <p style="color:#94a3b8;font-size:14px;margin:0 0 24px;">No more chasing updates in group chats! 🙌</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td align="center">
              <a href="https://worshipflow.dev" style="display:inline-block;background:linear-gradient(135deg,#6d28d9,#4f46e5);color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">Open WorshipFlow →</a>
            </td></tr>
          </table>
          <p style="color:#e2e8f0;font-size:14px;text-align:center;margin:0;">Blessings, The WorshipFlow Team 🎵</p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #334155;text-align:center;">
          <p style="color:#475569;font-size:12px;margin:0;">WorshipFlow · worshipflow.dev · You're receiving this because you joined the worship team.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

        // Build one payload per recipient, then send all in a SINGLE batch call
        const batch: Parameters<typeof resend.batch.send>[0] = [];
        snap.forEach(doc => {
            const em = doc.data().email as string | undefined;
            const nm = doc.data().name as string | undefined;
            if (em && em.includes("@")) {
                const firstName = nm ? nm.split(" ")[0] : em.split("@")[0];
                batch.push({
                    from: "WorshipFlow <no-reply@worshipflow.dev>",
                    to: [em],
                    subject: "🎵 Welcome to WorshipFlow — You're In!",
                    html: buildHtml(firstName),
                });
            }
        });

        if (batch.length === 0) return json(200, { success: true, sent: 0 });
        await resend.batch.send(batch);
        return json(200, { success: true, sent: batch.length });
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

    // ── POST /assembly-call ─────────────────────────────────────────────────────
    // Admin-only: blast a high-priority push to ALL registered devices + writes
    // a permanent in-app notification. 5-minute cooldown enforced server-side.
    // testMode=true → only sends to the caller's own FCM token, no cooldown.
    if (rawPath === "/assembly-call" && method === "POST") {
        const { callerName, callerPhoto, callerId, message, testMode } = body;
        if (!callerId) return json(401, { error: "Unauthorized" });

        try {
            const isTest = testMode === true;
            const alertMessage = message?.trim() ||
                "Guys, we're starting practice now. Where are you? Please go to the worship hall already!";
            const now = admin.firestore.FieldValue.serverTimestamp();

            // ── Cooldown check — skipped in test mode ───────────────────────
            if (!isTest) {
                const cooldownDoc = await firestore?.collection("assembly_cooldown").doc("global").get();
                if (cooldownDoc?.exists) {
                    const lastAt = cooldownDoc.data()?.lastCalledAt?.toMillis?.() ?? 0;
                    const diffMs = Date.now() - lastAt;
                    if (diffMs < 1 * 60 * 1000) {
                        const remaining = Math.ceil((1 * 60 * 1000 - diffMs) / 1000);
                        return json(429, { error: `Assembly call on cooldown. Try again in ${remaining}s.`, remaining });
                    }
                }
            }

            // ── Fetch tokens + write cooldown in parallel (independent ops) ──
            const [tokensSnap] = await Promise.all([
                firestore?.collection("fcm_tokens").get(),
                isTest
                    ? Promise.resolve()
                    : firestore?.collection("assembly_cooldown").doc("global").set({
                          lastCalledAt: now, callerId, callerName,
                      }),
            ]);

            const tokens: string[] = [];
            tokensSnap?.docs.forEach(doc => {
                const data = doc.data();
                const t: string = data.token;
                if (!t) return;
                if (isTest && data.userId !== callerId) return; // test: my token only
                tokens.push(t);
            });

            const notifTitle = isTest ? "🧪 TEST — Assembly Call" : "🚨 ASSEMBLY CALL";

            // ── Fire FCM + write in-app notif in parallel ────────────────────
            const fcmPromise = tokens.length > 0
                ? (async () => {
                    for (let i = 0; i < tokens.length; i += 500) {
                        const batch = tokens.slice(i, i + 500);
                        const resp = await admin.messaging().sendEachForMulticast({
                            tokens: batch,
                            notification: { title: notifTitle, body: alertMessage },
                            android: {
                                priority: "high",
                                notification: {
                                    channelId: "assembly_call",
                                    priority: "max",
                                    defaultSound: true,
                                    defaultVibrateTimings: true,
                                },
                            },
                            apns: {
                                headers: { "apns-priority": "10" },
                                payload: { aps: { sound: "default", badge: 1 } },
                            },
                            webpush: {
                                notification: {
                                    title: notifTitle,
                                    body: alertMessage,
                                    icon: "/icon-192x192.png",
                                    badge: "/favicon-32.png",
                                    vibrate: [300, 100, 300, 100, 300, 100, 300],
                                    requireInteraction: true,
                                },
                                fcmOptions: { link: "/" },
                            },
                            data: { type: "assembly_call", deepLink: "/" },
                        });
                        // Prune dead tokens (fire-and-forget)
                        resp.responses.forEach((r, idx) => {
                            if (!r.success && (
                                r.error?.code === "messaging/invalid-registration-token" ||
                                r.error?.code === "messaging/registration-token-not-registered"
                            )) {
                                firestore?.collection("fcm_tokens")
                                    .where("token", "==", batch[idx]).get()
                                    .then(snap => snap.docs.forEach(d => d.ref.delete()))
                                    .catch(() => {});
                            }
                        });
                    }
                })()
                : Promise.resolve();

            const notifPromise = firestore?.collection("notifications").add({
                type: "assembly_call",
                message: notifTitle,
                subMessage: isTest ? `[TEST] ${alertMessage}` : alertMessage,
                actorName: callerName || "Admin",
                actorPhoto: callerPhoto || "",
                actorUserId: callerId,
                targetAudience: isTest ? "admin_only" : "all",
                readBy: [], deletedBy: [],
                createdAt: now,
            });

            // Both fire simultaneously — respond as soon as both settle
            await Promise.all([fcmPromise, notifPromise]);

            return json(200, { success: true, pushed: tokens.length, testMode: isTest });
        } catch (e: any) {
            console.error("Assembly call failed:", e);
            return json(500, { error: "Failed to send assembly call" });
        }
    }

    // GET /assembly-cooldown — check remaining cooldown seconds for the UI countdown
    if (rawPath === "/assembly-cooldown" && method === "GET") {
        try {
            const doc = await firestore?.collection("assembly_cooldown").doc("global").get();
            if (!doc?.exists) return json(200, { remaining: 0 });
            const lastAt = doc.data()?.lastCalledAt?.toMillis?.() ?? 0;
            const remaining = Math.max(0, Math.ceil((1 * 60 * 1000 - (Date.now() - lastAt)) / 1000));
            return json(200, { remaining });
        } catch { return json(200, { remaining: 0 }); }
    }

    // GET /assembly-token-check?userId=... — count how many FCM tokens exist for a specific user
    // Used by the Assembly Bell diagnostic panel so admins can confirm their phone is registered.
    if (rawPath === "/assembly-token-check" && method === "GET") {
        const uid = event.queryStringParameters?.userId || "";
        if (!uid) return json(400, { error: "userId required" });
        try {
            const snap = await firestore?.collection("fcm_tokens")
                .where("userId", "==", uid).get();
            return json(200, { count: snap?.size ?? 0 });
        } catch { return json(200, { count: 0 }); }
    }

    // GET /push-status — admin view: cross-reference approved_users with fcm_tokens + prompt status
    if (rawPath === "/push-status" && method === "GET") {
        if (!firestore) return json(500, { error: "DB unavailable" });
        try {
            const [usersSnap, tokensSnap, promptSnap] = await Promise.all([
                firestore.collection("approved_users").get(),
                firestore.collection("fcm_tokens").get(),
                firestore.collection("push_prompt_status").get(),
            ]);

            // userId → device count
            const tokensByUserId: Record<string, number> = {};
            tokensSnap.docs.forEach(doc => {
                const uid: string = doc.data().userId || "";
                if (uid) tokensByUserId[uid] = (tokensByUserId[uid] || 0) + 1;
            });

            // email → userId fallback (tokens store userId)
            const emailToUserId: Record<string, string> = {};
            tokensSnap.docs.forEach(doc => {
                const d = doc.data();
                if (d.email && d.userId) emailToUserId[d.email] = d.userId;
            });

            // userId → prompt interaction data
            const promptByUserId: Record<string, any> = {};
            promptSnap.docs.forEach(doc => {
                promptByUserId[doc.id] = doc.data();
            });

            const results = usersSnap.docs.map(doc => {
                const d = doc.data();
                const email: string = d.email || doc.id;
                const userId: string = d.userId || emailToUserId[email] || "";
                const deviceCount = userId ? (tokensByUserId[userId] || 0) : 0;
                const prompt = userId ? (promptByUserId[userId] || null) : null;
                return {
                    email,
                    userId,
                    name: d.name || "",
                    photo: d.photo || "",
                    role: d.role || "member",
                    deviceCount,
                    promptStatus: prompt?.status || "never_prompted",
                    skipCount: prompt?.skipCount || 0,
                    lastSeenAt: prompt?.lastSeenAt || null,
                    lastPromptType: prompt?.lastPromptType || null, // "banner" | "forced_modal"
                    browserBlocked: prompt?.browserBlocked || false,
                };
            });

            // Sort: blocked first, then 0-device skippers, then covered
            results.sort((a, b) => {
                const score = (u: typeof a) => {
                    if (u.browserBlocked) return 0;
                    if (u.deviceCount === 0 && u.skipCount >= 2) return 1;
                    if (u.deviceCount === 0) return 2;
                    return 3;
                };
                const diff = score(a) - score(b);
                if (diff !== 0) return diff;
                return a.email.localeCompare(b.email);
            });

            return json(200, results);
        } catch (e) {
            console.error("push-status error:", e);
            return json(500, { error: "Failed to fetch push status" });
        }
    }

    // POST /push-prompt-status — record how a user interacted with the notification prompt
    // Called from usePushNotifications on every skip/enable/blocked event
    if (rawPath === "/push-prompt-status" && method === "POST") {
        if (!firestore) return json(500, { error: "DB unavailable" });
        const { userId, status, skipCount, lastPromptType, browserBlocked } = body;
        if (!userId) return json(400, { error: "userId required" });
        try {
            await firestore.collection("push_prompt_status").doc(userId).set({
                userId,
                status,                  // "enabled" | "skipped" | "blocked" | "never_prompted"
                skipCount: skipCount || 0,
                lastPromptType: lastPromptType || null,  // "banner" | "forced_modal"
                browserBlocked: browserBlocked || false,
                lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            return json(200, { success: true });
        } catch (e) {
            return json(500, { error: "Failed to save prompt status" });
        }
    }

    // POST /poke — admin sends a poke to a specific online user
    // Stores the poke in Firestore AND sends an FCM push to their devices
    if (rawPath === "/poke" && method === "POST") {
        if (!firestore) return json(500, { error: "DB unavailable" });
        const { fromName, fromPhoto, fromId, toUserId, toName, message } = body;
        if (!fromId || !toUserId) return json(400, { error: "fromId and toUserId required" });

        const pokeMessages = [
            "👉 Poke! Are you still there?",
            "👋 Hey, someone's looking for you!",
            "😄 You just got poked!",
            "🎉 Surprise! Someone poked you!",
            "🙃 Wake up! You've been poked!",
        ];
        const pokeMsg = message?.trim() || pokeMessages[Math.floor(Math.random() * pokeMessages.length)];

        try {
            // Store poke in Firestore so the user's app can pick it up via polling
            await firestore.collection("pokes").add({
                fromId,
                fromName: fromName || "Admin",
                fromPhoto: fromPhoto || "",
                toUserId,
                toName: toName || "",
                message: pokeMsg,
                seen: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Also blast an FCM push to all that user's devices (instant if app is closed)
            const tokensSnap = await firestore.collection("fcm_tokens")
                .where("userId", "==", toUserId).get();
            const tokens: string[] = tokensSnap.docs.map(d => d.data().token).filter(Boolean);

            if (tokens.length > 0) {
                await admin.messaging().sendEachForMulticast({
                    tokens,
                    notification: { title: `👉 ${fromName || "Admin"} poked you!`, body: pokeMsg },
                    data: { type: "poke", fromId, fromName: fromName || "" },
                    webpush: {
                        notification: {
                            icon: fromPhoto || "/icon-192x192.png",
                            badge: "/favicon-32.png",
                            tag: "worshipflow-poke",
                        },
                    },
                });
            }

            return json(200, { success: true, message: pokeMsg });
        } catch (e) {
            console.error("poke error:", e);
            return json(500, { error: "Failed to send poke" });
        }
    }

    // GET /poke/pending?userId= — fetch unseen pokes for a user, then mark them seen
    if (rawPath === "/poke/pending" && method === "GET") {
        if (!firestore) return json(500, { error: "DB unavailable" });
        const uid = event.queryStringParameters?.userId || "";
        if (!uid) return json(400, { error: "userId required" });
        try {
            // Query only on toUserId (auto-indexed single field — no composite index needed).
            // Filter seen=false in-memory to avoid any index requirements.
            const snap = await firestore.collection("pokes")
                .where("toUserId", "==", uid)
                .get();
            if (snap.empty) return json(200, []);

            const unseenDocs = snap.docs.filter(d => d.data().seen === false);
            if (unseenDocs.length === 0) return json(200, []);

            const pokes = unseenDocs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a: any, b: any) => (a.createdAt?._seconds ?? 0) - (b.createdAt?._seconds ?? 0));

            // Mark all unseen as seen
            const batch = firestore.batch();
            unseenDocs.forEach(d => batch.update(d.ref, { seen: true }));
            await batch.commit();

            return json(200, pokes);
        } catch (e) {
            console.error("[poke/pending] error:", e);
            return json(200, []);
        }
    }

    // POST /fcm-token — store FCM push token for a user
    // IMPORTANT: each device gets its own document so all devices receive pushes.
    // Doc ID = first 40 chars of token (unique per device) — avoids overwriting
    // the previous device's token when a new one registers.
    if (rawPath === "/fcm-token" && method === "POST") {
        const { userId, role, token } = body;
        if (!userId || !token) return json(400, { error: "userId and token required" });
        try {
            // Use a stable slice of the token as the doc key so:
            //   • Same device re-registering → updates (upserts) → no duplicates
            //   • Different device of same user → separate doc → multiple devices ✅
            const docId = `${userId}_${token.slice(-20)}`;
            await firestore?.collection("fcm_tokens").doc(docId).set({
                userId,
                role: role || "member",
                token,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return json(200, { success: true });
        } catch (e) { return json(500, { error: "Failed to store token" }); }
    }


    // GET /api/user-flags — cross-device user flags stored in Firestore
    if (rawPath === "/user-flags" && method === "GET") {
        const userId = event.queryStringParameters?.userId || "";
        if (!userId) return json(200, {});
        try {
            const doc = await firestore?.collection("user_flags").doc(userId).get();
            return json(200, doc?.exists ? doc.data() : {});
        } catch (e) { return json(200, {}); }
    }

    if (rawPath === "/user-flags" && method === "POST") {
        const { userId, ...flags } = body;
        if (!userId) return json(400, { error: "userId required" });
        try {
            await firestore?.collection("user_flags").doc(userId).set(flags, { merge: true });
            return json(200, { success: true });
        } catch (e) { return json(500, { error: "Failed to set flag" }); }
    }

    // ── Broadcasts ─────────────────────────────────────────────────────────
    if (rawPath === "/broadcasts" && method === "GET") {
        const email = event.queryStringParameters?.email || "";
        if (!email) return json(200, null);
        try {
            // No composite index — filter active only, sort in memory
            const snap = await firestore?.collection("broadcasts").where("active", "==", true).get();
            const docs = (snap?.docs || [])
                .map(d => { const data = d.data(); return { id: d.id, ...data, createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null } as any; })
                .sort((a: any, b: any) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
            for (const data of docs) {
                const targets: string[] = data.targetEmails || [];
                if (!targets.includes("__all__") && !targets.includes(email)) continue;
                if (data.type === "whats_new" && (data.dismissedBy || []).includes(email)) continue;
                return json(200, data);
            }
            return json(200, null);
        } catch (e) { console.error("broadcast fetch error:", e); return json(200, null); }
    }

    if (rawPath === "/broadcasts/all" && method === "GET") {
        try {
            // No composite index — fetch all, sort in memory
            const snap = await firestore?.collection("broadcasts").get();
            const sorted = (snap?.docs || [])
                .map(d => { const data = d.data(); return { id: d.id, ...data, createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null } as any; })
                .sort((a: any, b: any) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
            return json(200, sorted);
        } catch (e) { return json(200, []); }
    }


    // GET /api/release-notes — auto-generate What's New from latest GitHub commits via Gemini AI
    // ?topic=  (optional) — if set, focus the content on that topic and refine it into a headline
    if (rawPath === "/release-notes" && method === "GET") {
        try {
            const REPO = "fullsnackdevj/remix_-worshipflow--1-";
            const topic = (event.queryStringParameters?.topic ?? "").trim();

            // 1. Fetch recent commits from public GitHub API
            const ghRes = await fetch(
                `https://api.github.com/repos/${REPO}/commits?per_page=40`,
                { headers: { "Accept": "application/vnd.github.v3+json", "User-Agent": "WorshipFlow/1.0" } }
            );
            if (!ghRes.ok) throw new Error(`GitHub API returned ${ghRes.status}`);
            const commits: any[] = await ghRes.json();

            // 2. Clean + filter commit messages (skip merges, reverts, chores, version bumps)
            const skipPatterns = /^(merge|revert|bump|chore|wip|ci:|docs:|style:|test:|refactor:)/i;
            const messages = commits
                .map((c: any) => c.commit.message.split("\n")[0].trim())
                .filter((msg: string) => msg.length > 5 && !skipPatterns.test(msg))
                .slice(0, 20);

            if (messages.length === 0) throw new Error("No meaningful commits found");

            // 3. Build prompt — topic-focused OR general big-changes mode
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const prompt = topic
                ? `You are writing a "What's New" announcement for WorshipFlow, a church worship team management app used by worship team members.

The admin wants to announce this feature or module: "${topic}"

Use these recent git commits as clues to identify specific capabilities:
${messages.map((m: string, i: number) => `${i + 1}. ${m}`).join("\n")}

Your tasks:
1. Refine "${topic}" into a punchy, exciting headline (6-8 words max). Think of it like a product launch headline.
2. Write one engaging sentence that introduces the feature to users.
3. Write 4 to 6 bullet points that describe what users CAN DO with this feature — its capabilities and value. Think: "What will a worship team member actually use this for?" Use the commits to find specific features, and use your own knowledge to fill in what makes sense for a worship app context.

Bullet point style:
- Each bullet should describe a specific capability or interaction (e.g. "View song lyrics and chords side by side while rehearsing")
- Do NOT say "was added", "was updated", "was improved" — describe the feature as it EXISTS today
- Start each bullet with a present-tense verb or a capability noun phrase
- Under 20 words per bullet, no jargon

Rules for ALL output:
- Do NOT use emojis anywhere
- Do NOT use markdown (no **, ##, dashes, or asterisks)
- Write for non-technical church team members

Output ONLY in this exact format:
TITLE: [exciting headline]
MESSAGE: [one-sentence intro]
BULLET: [capability 1]
BULLET: [capability 2]
BULLET: [...]`

                : `You are writing a "What's New" announcement for WorshipFlow, a church worship team management app.

Based on these recent git commit messages, identify the biggest visible changes only:
${messages.map((m: string, i: number) => `${i + 1}. ${m}`).join("\n")}

Include ONLY: new modules, major features, meaningful UI/UX changes, new capabilities.
Skip entirely: bug fixes, perf tweaks, refactors, minor adjustments, anything prefixed fix:/style:/hotfix.

Rules:
- Write 3 to 5 bullets — only for big user-visible updates
- Do NOT use emojis
- Do NOT use markdown
- Bullets start with a past-tense verb, under 15 words

Output ONLY in this exact format:
TITLE: What's New in WorshipFlow
MESSAGE: Here's what's been added and improved for your team:
BULLET: [first major update]
BULLET: [second major update]
BULLET: [...]`;

            const aiRes = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [{ role: "user", parts: [{ text: prompt }] }],
            });

            const raw = aiRes.text ?? "";
            const titleMatch  = raw.match(/^TITLE:\s*(.+)$/m);
            const messageMatch = raw.match(/^MESSAGE:\s*(.+)$/m);
            const bullets = [...raw.matchAll(/^BULLET:\s*(.+)$/gm)].map((m: RegExpMatchArray) => m[1].trim());

            const today = new Date().toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" });
            return json(200, {
                title:        titleMatch?.[1]?.trim()  ?? `What's New — ${today}`,
                message:      messageMatch?.[1]?.trim() ?? "Here's what's new in WorshipFlow:",
                bulletPoints: bullets.length ? bullets : ["Various updates and improvements have been applied."],
            });
        } catch (e) {
            console.error("Release notes error:", e);
            return json(500, { error: "Could not generate release notes" });
        }
    }


    // ── GET /api/lineup-listens?key=...&key=... — fetch listen data for track keys
    if (rawPath === "/lineup-listens" && method === "GET") {
        const keys = event.multiValueQueryStringParameters?.key ?? event.queryStringParameters?.key?.split(",") ?? [];
        if (!keys.length) return json(200, {});
        try {
            const result: Record<string, any[]> = {};
            await Promise.all(keys.map(async (k: string) => {
                const snap = await firestore?.collection("lineupListens").doc(k).get();
                result[k] = Array.isArray(snap?.data()?.listens) ? snap!.data()!.listens : [];
            }));
            return json(200, result);
        } catch (e) { return json(500, { error: "Failed to fetch listens" }); }
    }

    // ── POST /api/lineup-listens — add or remove a listen entry
    if (rawPath === "/lineup-listens" && method === "POST") {
        const { key, action, entry, songId, songTitle, mood, eventName, eventDate } = body;
        if (!key || !action || !entry?.userId) return json(400, { error: "Missing fields" });
        try {
            const ref = firestore?.collection("lineupListens").doc(key);
            const snap = await ref?.get();
            const current: any[] = Array.isArray(snap?.data()?.listens) ? snap!.data()!.listens : [];
            let updated: any[];
            if (action === "add") {
                // Remove any existing entry for this user first, then add fresh
                updated = [...current.filter((e: any) => e.userId !== entry.userId), entry];
            } else {
                // remove
                updated = current.filter((e: any) => e.userId !== entry.userId);
            }
            await ref?.set({ songId, songTitle, mood, eventName, eventDate, listens: updated }, { merge: true });
            return json(200, { success: true, count: updated.length });
        } catch (e) { return json(500, { error: "Failed to update listen" }); }
    }

    if (rawPath === "/broadcasts" && method === "POST") {
        const { type, title, message, bulletPoints, targetEmails } = body;
        if (!type || !title || !targetEmails) return json(400, { error: "Missing fields" });
        try {
            const ref = await firestore?.collection("broadcasts").add({
                type, title, message: message || "", bulletPoints: bulletPoints || [],
                targetEmails, active: true, dismissedBy: [],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return json(201, { id: ref?.id });
        } catch (e) { return json(500, { error: "Failed to create" }); }
    }

    const broadcastMatch = rawPath.match(/^\/broadcasts\/([^/]+)$/);
    if (broadcastMatch) {
        const bId = broadcastMatch[1];
        if (method === "PATCH") {
            try { await firestore?.collection("broadcasts").doc(bId).update({ active: body.active }); return json(200, { success: true }); }
            catch (e) { return json(500, { error: "Failed" }); }
        }
        if (method === "PUT") {
            const { title, message, bulletPoints, targetEmails, type } = body;
            if (!title?.trim()) return json(400, { error: "Title is required" });
            try {
                await firestore?.collection("broadcasts").doc(bId).update({
                    title: title.trim(), message: message || "", bulletPoints: bulletPoints || [],
                    targetEmails: targetEmails || ["__all__"], type,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                return json(200, { success: true });
            } catch (e) { return json(500, { error: "Failed to update broadcast" }); }
        }
        if (method === "DELETE") {
            try { await firestore?.collection("broadcasts").doc(bId).delete(); return json(200, { success: true }); }
            catch (e) { return json(500, { error: "Failed" }); }
        }
    }

    const dismissMatch = rawPath.match(/^\/broadcasts\/([^/]+)\/dismiss$/);
    if (dismissMatch && method === "POST") {
        const bId = dismissMatch[1];
        const { email } = body;
        if (!email) return json(400, { error: "Missing email" });
        try {
            await firestore?.collection("broadcasts").doc(bId).update({ dismissedBy: admin.firestore.FieldValue.arrayUnion(email) });
            return json(200, { success: true });
        } catch (e) { return json(500, { error: "Failed" }); }
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

    // ─── BIRTHDAY WISH ───────────────────────────────────────────────────────────
    if (rawPath === "/birthday-wish" && method === "POST") {
        const { memberId, memberName, date, senderUserId, senderName, senderPhoto, message } = body;
        if (!memberId || !date || !senderUserId || !senderName) return json(400, { error: "Missing required fields" });
        if (!firestore) return json(500, { error: "DB unavailable" });
        try {
            const docId = `${memberId}_${date}`;
            const ref = firestore.collection("birthday_reactions").doc(docId);
            const snap = await ref.get();
            // ── Enforce per-sender wish limit (3 per day) ────────────────────
            const MAX_WISHES = 1;
            if (snap.exists) {
                const existingWishes: any[] = snap.data()?.wishes ?? [];
                const senderCount = existingWishes.filter((w: any) => w.userId === senderUserId).length;
                if (senderCount >= MAX_WISHES) {
                    return json(429, { error: `Wish limit reached (max ${MAX_WISHES} per day)` });
                }
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
            // Notify the whole team so the celebrant sees it in their bell
            const firstName = memberName?.split(" ")[0] || memberName || "your teammate";
            await writeNotif(firestore, {
                type: "birthday_wish",
                message: `🎂 Birthday Greetings for ${firstName}!`,
                subMessage: `${senderName}: "${(message?.trim() || "Happy Birthday!").slice(0, 60)}"`,
                actorName: senderName,
                actorPhoto: senderPhoto?.startsWith("http") ? senderPhoto : "",
                actorUserId: senderUserId,
                targetAudience: "all",
            });
            return json(200, { success: true });
        } catch (e) {
            console.error("birthday-wish failed:", e);
            return json(500, { error: "Failed to save wish" });
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

            return json(200, songs, { "Cache-Control": "no-store" });
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
            // Duplicate check — multi-signal scoring (title 35%, artist 25%, tags 15%, lyrics containment 25%)
            const existing = await firestore.collection("songs").get();
            const incomingTags: string[] = Array.isArray(body.tags) ? body.tags : [];

            let duplicate: FirebaseFirestore.QueryDocumentSnapshot | undefined;
            let dupScore = 0;
            for (const doc of existing.docs) {
                const d = doc.data();
                const score = songDuplicateScore(
                    { title, artist, tags: incomingTags, lyrics: lyrics.trim() },
                    { title: d.title || "", artist: d.artist || "", tags: d.tags || [], lyrics: d.lyrics || "" }
                );
                if (score >= 0.65 && score > dupScore) { duplicate = doc; dupScore = score; }
            }

            if (duplicate) {
                const d = duplicate.data();
                return json(409, {
                    error: `Possible duplicate detected! "${d.title}" by "${d.artist}" already exists in the database with very similar title, artist, tags, and/or lyrics. Please review the existing entry before saving.`,
                });
            }

            const { actorName = "Someone", actorPhoto = "", actorUserId = "" } = body;
            const docRef = await firestore.collection("songs").add({
                title: toTitleCase(title),
                artist: toTitleCase(artist),
                lyrics: lyrics.trim().toUpperCase(),
                chords: chords || "",
                tagIds: tags,
                video_url: video_url || "",
                created_by_name: actorName,
                created_by_photo: actorPhoto,
                updated_by_name: actorName,
                updated_by_photo: actorPhoto,
                created_at: admin.firestore.FieldValue.serverTimestamp(),
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
            });
// Bell notification skipped for new_song — not critical enough for team-wide alert
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
                // Duplicate check — multi-signal scoring, excluding self
                const existing2 = await firestore.collection("songs").get();
                const incomingTags2: string[] = Array.isArray(body.tags) ? body.tags : [];

                let duplicate2: FirebaseFirestore.QueryDocumentSnapshot | undefined;
                let dupScore2 = 0;
                for (const doc of existing2.docs) {
                    if (doc.id === id) continue; // don't flag a song as duplicate of itself
                    const d = doc.data();
                    const score = songDuplicateScore(
                        { title, artist, tags: incomingTags2, lyrics: lyrics.trim() },
                        { title: d.title || "", artist: d.artist || "", tags: d.tags || [], lyrics: d.lyrics || "" }
                    );
                    if (score >= 0.65 && score > dupScore2) { duplicate2 = doc; dupScore2 = score; }
                }

                if (duplicate2) {
                    const d = duplicate2.data();
                    return json(409, {
                        error: `Possible duplicate detected! "${d.title}" by "${d.artist}" already exists with very similar title, artist, tags, and/or lyrics. Please review before saving.`,
                    });
                }

                const { actorName = "Someone", actorPhoto = "" } = body;
                await firestore.collection("songs").doc(id).update({
                    title: toTitleCase(title),
                    artist: toTitleCase(artist),
                    lyrics: lyrics.trim().toUpperCase(),
                    chords: chords || "",
                    tagIds: tags,
                    video_url: video_url || "",
                    updated_by_name: actorName,
                    updated_by_photo: actorPhoto,
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

        // PATCH /songs/:id — partial update (lyrics/chords only, no full validation)
        // Used by the Rehearsal module to update just lyrics or chords without
        // requiring the full song payload (title, artist, tags, etc.).
        if (method === "PATCH") {
            try {
                const doc = await firestore.collection("songs").doc(id).get();
                if (!doc.exists) return json(404, { error: "Song not found" });

                const updates: Record<string, any> = {
                    updated_at: admin.firestore.FieldValue.serverTimestamp(),
                };

                if (typeof body.lyrics === "string") {
                    updates.lyrics = body.lyrics.trim().toUpperCase();
                }
                if (typeof body.chords === "string") {
                    updates.chords = body.chords;
                }
                if (typeof body.actorName === "string") {
                    updates.updated_by_name = body.actorName;
                }
                if (typeof body.actorPhoto === "string") {
                    updates.updated_by_photo = body.actorPhoto;
                }

                if (Object.keys(updates).length === 1) {
                    // only updated_at — nothing to patch
                    return json(400, { error: "No patchable fields provided" });
                }

                await firestore.collection("songs").doc(id).update(updates);
                return json(200, { success: true });
            } catch (err) {
                console.error(err);
                return json(500, { error: "Failed to patch song" });
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
            return json(200, members, { "Cache-Control": "public, max-age=0, s-maxage=300" });
        } catch (err) {
            console.error(err);
            return json(500, { error: "Failed to fetch members" });
        }
    }

    // POST /members
    if (rawPath === "/members" && method === "POST") {
        const { name, firstName, middleInitial, lastName, phone, email, photo, roles, status, notes, birthdate, gender } = body;

        // Accept either a combined `name` OR separate `firstName` / `lastName`
        // (ProfileSetupModal sends the structured fields, the admin panel sends `name`)
        const resolvedName = name?.trim() || [firstName, middleInitial, lastName].filter(Boolean).join(" ").trim();

        const missingFields: string[] = [];
        if (!resolvedName) missingFields.push("Name");
        if (!phone?.trim()) missingFields.push("Phone");
        if (missingFields.length > 0) {
            return json(400, { error: `Missing required fields: ${missingFields.join(", ")}.` });
        }
        try {
            const docRef = await firestore.collection("members").add({
                name: toTitleCase(resolvedName),
                firstName: firstName?.trim() || resolvedName.split(" ")[0] || "",
                middleInitial: middleInitial?.trim() || "",
                lastName: lastName?.trim() || resolvedName.split(" ").slice(1).join(" ") || "",
                phone: phone.trim(),
                email: (email || "").trim().toLowerCase(),
                photo: photo || "",
                roles: roles || [],
                status: status || "active",
                notes: notes || "",
                birthdate: birthdate || null,
                gender: gender || "",
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
            const { name, phone, email, photo, roles, status, notes, birthdate, firstName, middleInitial, lastName } = body;
            const missingFields: string[] = [];
            if (!name?.trim()) missingFields.push("Name");
            if (!phone?.trim()) missingFields.push("Phone");
            if (missingFields.length > 0) {
                return json(400, { error: `Missing required fields: ${missingFields.join(", ")}.` });
            }
            try {
                const updateData: any = {
                    name: toTitleCase(name),
                    phone: phone.trim(),
                    email: (email || "").trim().toLowerCase(),
                    photo: photo || "",
                    roles: roles || [],
                    status: status || "active",
                    notes: notes || "",
                    updated_at: admin.firestore.FieldValue.serverTimestamp(),
                };
                // Preserve birthdate — do not wipe if not provided
                if (birthdate !== undefined) updateData.birthdate = birthdate || null;
                // Structured name fields
                if (firstName !== undefined) updateData.firstName = firstName || "";
                if (middleInitial !== undefined) updateData.middleInitial = middleInitial || "";
                if (lastName !== undefined) updateData.lastName = lastName || "";
                await firestore.collection("members").doc(id).update(updateData);
                return json(200, { success: true });
            } catch (err) {
                return json(500, { error: "Failed to update member" });
            }
        }

        // PATCH /members/:id — lightweight partial update (e.g., birthdate-only from onboarding prompt)
        if (method === "PATCH") {
            try {
                const patchData: any = { updated_at: admin.firestore.FieldValue.serverTimestamp() };
                if (body.birthdate !== undefined) patchData.birthdate = body.birthdate || null;
                await firestore.collection("members").doc(id).update(patchData);
                return json(200, { success: true });
            } catch (err) {
                return json(500, { error: "Failed to patch member" });
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
            const [schedSnap, membersSnap] = await Promise.all([
                firestore.collection("schedules").orderBy("date").get(),
                firestore.collection("members").get(),
            ]);

            // Build a fast lookup: memberId → photo URL
            const photoById: Record<string, string> = {};
            const photoByName: Record<string, string> = {};
            membersSnap.docs.forEach(d => {
                const p = d.data().photo || "";
                if (p.startsWith("http")) {
                    photoById[d.id] = p;
                    const nameLower = (d.data().name || "").toLowerCase().trim();
                    if (nameLower) photoByName[nameLower] = p;
                }
            });

            // Inject photo back into a ScheduleMember-shaped object
            const hydrate = (m: any): any => {
                if (!m) return m;
                const resolved =
                    (m.photo?.startsWith("http") ? m.photo : "") ||
                    photoById[m.memberId] ||
                    photoByName[(m.name || "").toLowerCase().trim()] ||
                    "";
                return { ...m, photo: resolved };
            };

            const schedules = schedSnap.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    worshipLeader: hydrate(data.worshipLeader),
                    backupSingers: (data.backupSingers ?? []).map(hydrate),
                    musicians: (data.musicians ?? []).map(hydrate),
                    assignments: (data.assignments ?? []).map((a: any) => ({
                        ...a,
                        members: (a.members ?? []).map(hydrate),
                    })),
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
        const { actorName: aN1 = "Someone", actorPhoto: aP1 = "", actorUserId: aU1 = "" } = body;
            const dl1 = new Date(date + "T00:00:00").toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
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
                created_by_name: aN1,
                created_by_photo: aP1,
                created_at: admin.firestore.FieldValue.serverTimestamp(),
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
            });
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

    // ── POST /schedules/:id/notify — manual "Notify Team" email ──────────────
    const notifyMatch = rawPath.match(/^\/schedules\/([^/]+)\/notify$/);
    if (notifyMatch && method === "POST") {
        const id = notifyMatch[1];
        try {
            const docSnap = await firestore.collection("schedules").doc(id).get();
            if (!docSnap.exists) return json(404, { error: "Schedule not found" });
            const ev = docSnap.data() as any;

            // 24-hour cooldown guard
            const lastNotified = ev.lastNotifiedAt?.toDate?.() as Date | undefined;
            if (lastNotified) {
                const hoursSince = (Date.now() - lastNotified.getTime()) / 3_600_000;
                if (hoursSince < 24) {
                    const at = lastNotified.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", hour12: true });
                    return json(429, { error: `Team was already notified today at ${at}. Please wait 24 hours before notifying again.` });
                }
            }

            const { actorName = "Someone" } = body;

            // ── Resolve songLineup IDs → song titles ──────────────────────────
            // songLineup stores Firestore document IDs, not titles.
            // We must look up each song by ID and use its title for the email.
            let resolvedSongLineup: { joyful?: string; solemn?: string } | null = null;
            if (ev.songLineup && (ev.songLineup.solemn || ev.songLineup.joyful)) {
                const songIds = [ev.songLineup.solemn, ev.songLineup.joyful].filter(Boolean) as string[];
                const songDocs = await Promise.all(
                    songIds.map((sid: string) => firestore.collection("songs").doc(sid).get())
                );
                const songTitleById: Record<string, string> = {};
                songDocs.forEach(snap => {
                    if (snap.exists) {
                        songTitleById[snap.id] = (snap.data() as any).title || snap.id;
                    }
                });
                resolvedSongLineup = {
                    solemn: ev.songLineup.solemn ? (songTitleById[ev.songLineup.solemn] ?? ev.songLineup.solemn) : undefined,
                    joyful: ev.songLineup.joyful ? (songTitleById[ev.songLineup.joyful] ?? ev.songLineup.joyful) : undefined,
                };
            }

            await sendScheduleEmail(firestore, {
                action: "created",
                eventName: ev.eventName || "",
                date: ev.date,
                serviceType: ev.serviceType || "sunday",
                worshipLeader: ev.worshipLeader ?? null,
                backupSingers: ev.backupSingers ?? [],
                musicians: ev.musicians ?? [],
                songLineup: resolvedSongLineup,
                actorName,
                scheduleId: id,
            });

            // Record timestamp to enforce cooldown
            await firestore.collection("schedules").doc(id).update({
                lastNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            return json(200, { success: true });
        } catch (err) {
            console.error("[notify]", err);
            return json(500, { error: "Failed to send notification" });
        }
    }

    // ── TEAM NOTES ────────────────────────────────────────────────────────────

    // GET /notes
    if (rawPath === "/notes" && method === "GET") {
        try {
            const snap = await firestore?.collection("team_notes").orderBy("createdAt", "desc").get();
            const notes = snap?.docs
                .filter(d => !d.data().deletedAt)
                .map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(), updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() ?? null })) ?? [];
            return json(200, notes);
        } catch (e) { return json(500, { error: "Failed to fetch notes" }); }
    }

    // GET /notes/trash — items soft-deleted within 15 days
    if (rawPath === "/notes/trash" && method === "GET") {
        try {
            const cutoff = Date.now() - 15 * 24 * 60 * 60 * 1000;
            const snap = await firestore?.collection("team_notes").get();
            const notes = snap?.docs
                .filter(d => {
                    const deletedAt = d.data().deletedAt;
                    if (!deletedAt) return false;
                    const deletedMs = deletedAt.toDate?.()?.getTime() ?? 0;
                    return deletedMs > cutoff;
                })
                .map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(), updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() ?? null, deletedAt: d.data().deletedAt?.toDate?.()?.toISOString() ?? null }))
                .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? "")) ?? [];
            return json(200, notes);
        } catch (e) { return json(500, { error: "Failed to fetch trash" }); }
    }

    // POST /notes
    if (rawPath === "/notes" && method === "POST") {
        const { authorId, authorName, authorPhoto, type, content, imageData, videoData } = body;
        if (!authorId || !content?.trim()) return json(400, { error: "Missing required fields" });
        try {
            const ref = await firestore?.collection("team_notes").add({
                authorId, authorName: authorName || "Unknown", authorPhoto: authorPhoto || "",
                type: type || "general", content: content.trim(),
                imageData: imageData || null,
                videoData: videoData || null,
                reactions: {},
                resolved: false,
                deletedAt: null,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                // updatedAt NOT set on create — only set on actual edits
                updatedAt: null,
            });

// Bell notification skipped for team notes — not critical enough for team-wide alert
            return json(201, { id: ref?.id });
        } catch (e) { return json(500, { error: "Failed to create note" }); }
    }

    // ── TRASH ROUTES — checked before noteMatch so /notes/trash isn't caught as /notes/:id ──

    // POST /notes/trash/restore/:id
    const restoreMatch = rawPath.match(/^\/notes\/trash\/restore\/([^/]+)$/);
    if (restoreMatch && method === "POST") {
        const nid = restoreMatch[1];
        try {
            await firestore?.collection("team_notes").doc(nid).update({ deletedAt: null, deletedBy: null });
            return json(200, { success: true });
        } catch (e) { return json(500, { error: "Failed to restore note" }); }
    }

    // DELETE /notes/trash/:id — permanently hard-delete single trash item
    const trashItemMatch = rawPath.match(/^\/notes\/trash\/([^/]+)$/);
    if (trashItemMatch && method === "DELETE") {
        const nid = trashItemMatch[1];
        try {
            await firestore?.collection("team_notes").doc(nid).delete();
            return json(200, { success: true });
        } catch (e) { return json(500, { error: "Failed to permanently delete note" }); }
    }

    // DELETE /notes/trash — bulk hard-delete by ids, or purge all expired (>15 days)
    if (rawPath === "/notes/trash" && method === "DELETE") {
        const { ids } = body;
        try {
            const batch = firestore?.batch();
            if (ids && Array.isArray(ids) && ids.length > 0) {
                ids.forEach((id: string) => batch?.delete(firestore!.collection("team_notes").doc(id)));
            } else {
                const cutoff = Date.now() - 15 * 24 * 60 * 60 * 1000;
                const snap = await firestore?.collection("team_notes").get();
                snap?.docs.filter(d => {
                    const at = d.data().deletedAt;
                    return at && (at.toDate?.()?.getTime() ?? 0) < cutoff;
                }).forEach(d => batch?.delete(d.ref));
            }
            await batch?.commit();
            return json(200, { success: true });
        } catch (e) { return json(500, { error: "Failed to bulk delete" }); }
    }

    // PUT /notes/:id  &  DELETE /notes/:id (soft-delete → moves to trash)
    const noteMatch = rawPath.match(/^\/notes\/([^/]+)$/);
    if (noteMatch) {
        const nid = noteMatch[1];
        if (method === "PUT") {
            const { authorId, content, type, imageData, videoData } = body;
            if (!authorId || !content?.trim()) return json(400, { error: "Missing required fields" });
            try {
                const doc = await firestore?.collection("team_notes").doc(nid).get();
                if (!doc?.exists) return json(404, { error: "Note not found" });
                if (doc.data()?.authorId !== authorId) return json(403, { error: "Not your note" });
                await firestore?.collection("team_notes").doc(nid).update({
                    content: content.trim(), type: type || "general",
                    imageData: imageData ?? doc.data()?.imageData ?? null,
                    videoData: videoData ?? doc.data()?.videoData ?? null,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                return json(200, { success: true });
            } catch (e) { return json(500, { error: "Failed to update note" }); }
        }
        if (method === "DELETE") {
            // Soft delete — move to trash
            const { authorId, userRole } = body;
            if (!authorId) return json(400, { error: "Missing authorId" });
            try {
                const doc = await firestore?.collection("team_notes").doc(nid).get();
                if (!doc?.exists) return json(404, { error: "Note not found" });
                const isAdmin = userRole === "admin" || userRole === "leader";
                if (doc.data()?.authorId !== authorId && !isAdmin) return json(403, { error: "Not your note" });
                await firestore?.collection("team_notes").doc(nid).update({
                    deletedAt: admin.firestore.FieldValue.serverTimestamp(),
                    deletedBy: authorId,
                });
                return json(200, { success: true });
            } catch (e) { return json(500, { error: "Failed to delete note" }); }
        }
    }

    // PATCH /notes/:id/react
    const reactMatch = rawPath.match(/^\/notes\/([^/]+)\/react$/);
    if (reactMatch && method === "PATCH") {
        const nid = reactMatch[1];
        const { userId, emoji } = body;
        if (!userId || !emoji) return json(400, { error: "Missing userId or emoji" });
        try {
            const ref = firestore!.collection("team_notes").doc(nid);
            let reactions: Record<string, string[]> = {};
            // runTransaction ensures concurrent fast-clicks each see the latest committed
            // state before applying their toggle — prevents reaction count resets
            await firestore!.runTransaction(async (tx) => {
                const doc = await tx.get(ref);
                if (!doc.exists) throw new Error("not_found");
                reactions = { ...(doc.data()?.reactions || {}) };
                const users: string[] = reactions[emoji] || [];
                const already = users.includes(userId);
                reactions[emoji] = already ? users.filter((u: string) => u !== userId) : [...users, userId];
                tx.update(ref, { reactions });
            });
            return json(200, { success: true, reactions });
        } catch (e: any) {
            if (e?.message === "not_found") return json(404, { error: "Note not found" });
            return json(500, { error: "Failed to react" });
        }
    }

    // PATCH /notes/:id/resolve
    const resolveMatch = rawPath.match(/^\/notes\/([^/]+)\/resolve$/);
    if (resolveMatch && method === "PATCH") {
        const nid = resolveMatch[1];
        const { userId, resolved } = body;
        if (!userId) return json(400, { error: "Missing userId" });
        try {
            const ref = firestore?.collection("team_notes").doc(nid);
            const doc = await ref?.get();
            if (!doc?.exists) return json(404, { error: "Note not found" });
            await ref?.update({ resolved: !!resolved, resolvedBy: resolved ? userId : null });
            return json(200, { success: true });
        } catch (e) { return json(500, { error: "Failed to resolve" }); }
    }

    // PATCH /notes/:id/retype  — Admin / Leader only
    const retypeMatch = rawPath.match(/^\/notes\/([^/]+)\/retype$/);
    if (retypeMatch && method === "PATCH") {
        const nid = retypeMatch[1];
        const { userId, userRole, newType } = body;
        const isAdmin = userRole === "admin" || userRole === "leader";
        if (!isAdmin) return json(403, { error: "Only admins can reclassify notes" });
        if (!["bug", "feature", "general"].includes(newType)) return json(400, { error: "Invalid note type" });
        try {
            const ref = firestore?.collection("team_notes").doc(nid);
            const doc = await ref?.get();
            if (!doc?.exists) return json(404, { error: "Note not found" });
            await ref?.update({ type: newType });
            return json(200, { success: true });
        } catch (e) { return json(500, { error: "Failed to reclassify note" }); }
    }

    // ─── PERSONAL NOTES (private, per-user) ──────────────────────────────────
    // Stored in users/{userId}/personalNotes subcollection — structurally private.

    // GET /personal-notes?userId=...
    if (rawPath === "/personal-notes" && method === "GET") {
        const userId = event.queryStringParameters?.userId;
        if (!userId) return json(400, { error: "userId required" });
        try {
            const snap = await firestore
                .collection("users").doc(userId)
                .collection("personalNotes")
                .orderBy("createdAt", "desc")
                .limit(200)
                .get();
            const notes = snap.docs
                .filter(d => !d.data().deletedAt)
                .map(d => ({ id: d.id, ...d.data() }));
            return json(200, notes);
        } catch (e) { return json(500, { error: "Failed to fetch personal notes" }); }
    }

    // POST /personal-notes
    if (rawPath === "/personal-notes" && method === "POST") {
        const { userId, title, body: noteBody, category } = body || {};
        if (!userId || !title || !noteBody) return json(400, { error: "Missing fields" });
        try {
            const ref = await firestore
                .collection("users").doc(userId)
                .collection("personalNotes")
                .add({
                    title, body: noteBody,
                    category: category || "personal",
                    pinned: false,
                    createdAt: new Date().toISOString(),
                });
            return json(200, { id: ref.id });
        } catch (e) { return json(500, { error: "Failed to create personal note" }); }
    }

    // PUT /personal-notes/:id  (body must include userId)
    const personalNoteEditMatch = rawPath.match(/^\/personal-notes\/([^/]+)$/);
    if (personalNoteEditMatch && method === "PUT") {
        const id = personalNoteEditMatch[1];
        const { userId, title, body: noteBody, category } = body || {};
        if (!userId || !title || !noteBody) return json(400, { error: "Missing fields" });
        try {
            await firestore
                .collection("users").doc(userId)
                .collection("personalNotes").doc(id)
                .update({ title, body: noteBody, category: category || "personal", updatedAt: new Date().toISOString() });
            return json(200, { success: true });
        } catch (e) { return json(500, { error: "Failed to update personal note" }); }
    }

    // DELETE /personal-notes/:id  (body must include userId)
    if (personalNoteEditMatch && method === "DELETE") {
        const id = personalNoteEditMatch[1];
        const { userId } = body || {};
        if (!userId) return json(400, { error: "userId required" });
        try {
            await firestore
                .collection("users").doc(userId)
                .collection("personalNotes").doc(id)
                .delete();
            return json(200, { success: true });
        } catch (e) { return json(500, { error: "Failed to delete personal note" }); }
    }

    // PATCH /personal-notes/:id/pin  (body must include userId)
    const personalNotePinMatch = rawPath.match(/^\/personal-notes\/([^/]+)\/pin$/);
    if (personalNotePinMatch && method === "PATCH") {
        const id = personalNotePinMatch[1];
        const { userId, pinned } = body || {};
        if (!userId) return json(400, { error: "userId required" });
        try {
            await firestore
                .collection("users").doc(userId)
                .collection("personalNotes").doc(id)
                .update({ pinned: !!pinned });
            return json(200, { success: true });
        } catch (e) { return json(500, { error: "Failed to pin/unpin personal note" }); }
    }

    // ─── TEAM NOTES (meeting recaps) ─────────────────────────────────────────
    // GET /team-notes

    if (rawPath === "/team-notes" && method === "GET") {
        try {
            const snap = await firestore.collection("teamNotes")
                .orderBy("createdAt", "desc")
                .limit(100)
                .get();
            const notes = snap.docs
                .filter(d => !d.data().deletedAt)
                .map(d => ({ id: d.id, ...d.data() }));
            return json(200, notes);
        } catch (e) { return json(500, { error: "Failed to fetch team notes" }); }
    }

    // POST /team-notes
    if (rawPath === "/team-notes" && method === "POST") {
        try {
            const { authorId, authorName, authorPhoto, title, body: noteBody, category } = body || {};
            if (!authorId || !title || !noteBody) return json(400, { error: "Missing fields" });
            const ref = await firestore.collection("teamNotes").add({
                authorId, authorName: authorName || "Unknown", authorPhoto: authorPhoto || "",
                title, body: noteBody, category: category || "general",
                pinned: false, createdAt: new Date().toISOString(),
            });
            // ── Notify everyone in the bell ───────────────────────────────────────
            const categoryLabels: Record<string, string> = {
                meeting: "Meeting Recap", announcement: "Announcement",
                decision: "Decision", general: "General Note",
            };
            const catLabel = categoryLabels[category] ?? "Note";
            await writeNotif(firestore, {
                type: "team_note",
                message: `${authorName || "Someone"} posted a Team Note`,
                subMessage: `[${catLabel}] ${title}`,
                actorName: authorName || "Unknown",
                actorPhoto: authorPhoto || "",
                actorUserId: authorId,
                targetAudience: "all",
                resourceId: ref.id,
                resourceType: "team_note",
            });
            return json(200, { id: ref.id });
        } catch (e) { return json(500, { error: "Failed to create team note" }); }
    }

    // PUT /team-notes/:id
    const teamNoteEditMatch = rawPath.match(/^\/team-notes\/([^/]+)$/);
    if (teamNoteEditMatch && method === "PUT") {
        const id = teamNoteEditMatch[1];
        try {
            const { title, body: noteBody, category } = body || {};
            if (!title || !noteBody) return json(400, { error: "Missing fields" });
            await firestore.collection("teamNotes").doc(id).update({
                title, body: noteBody, category: category || "general", updatedAt: new Date().toISOString(),
            });
            return json(200, { success: true });
        } catch (e) { return json(500, { error: "Failed to update team note" }); }
    }

    // DELETE /team-notes/:id
    if (teamNoteEditMatch && method === "DELETE") {
        const id = teamNoteEditMatch[1];
        try {
            await firestore.collection("teamNotes").doc(id).delete();
            return json(200, { success: true });
        } catch (e) { return json(500, { error: "Failed to delete team note" }); }
    }

    // PATCH /team-notes/:id/pin
    const teamNotePinMatch = rawPath.match(/^\/team-notes\/([^/]+)\/pin$/);
    if (teamNotePinMatch && method === "PATCH") {
        const id = teamNotePinMatch[1];
        try {
            const { pinned } = body || {};
            await firestore.collection("teamNotes").doc(id).update({ pinned: !!pinned });
            return json(200, { success: true });
        } catch (e) { return json(500, { error: "Failed to pin/unpin note" }); }
    }

    // ─── VERSE OF THE DAY ────────────────────────────────────────────────────────

    // GET /verse-of-day?date=YYYY-MM-DD
    if (rawPath === "/verse-of-day" && method === "GET") {
        // Default date: Philippines time (UTC+8) so midnight PH = new verse/reactions
        const phDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
        const phKey = `${phDate.getFullYear()}-${String(phDate.getMonth() + 1).padStart(2, "0")}-${String(phDate.getDate()).padStart(2, "0")}`;
        const date = event.queryStringParameters?.date || phKey;
        try {
            const doc = await firestore.collection("verseOfDay").doc(date).get();
            if (!doc.exists) return json(200, { reactions: {}, notes: [] });
            const d = doc.data() as any;
            return json(200, { reactions: d.reactions ?? {}, notes: d.notes ?? [] });
        } catch { return json(200, { reactions: {}, notes: [] }); }
    }

    // PATCH /verse-of-day/react  { date, userId, key }
    if (rawPath === "/verse-of-day/react" && method === "PATCH") {
        const { date, userId, key, verseRef } = body;
        if (!date || !userId || !key) return json(400, { error: "Missing date, userId or key" });
        try {
            const ref = firestore.collection("verseOfDay").doc(date);
            const snap = await ref.get();
            const existing = snap.exists ? (snap.data() as any) : { verse: verseRef || "", reactions: {}, notes: [] };
            const users: string[] = existing.reactions?.[key] || [];
            const already = users.includes(userId);
            const updated = already ? users.filter((u: string) => u !== userId) : [...users, userId];
            if (snap.exists) {
                await ref.update({ [`reactions.${key}`]: updated });
            } else {
                await ref.set({ verse: verseRef || "", reactions: { [key]: updated }, notes: [] });
            }
            return json(200, { success: true, users: updated });
        } catch (e) { return json(500, { error: "Failed to save reaction" }); }
    }

    // POST /verse-of-day/note  { date, note: { uid, name, photo, text, createdAt }, verseRef }
    if (rawPath === "/verse-of-day/note" && method === "POST") {
        const { date, note, verseRef } = body;
        if (!date || !note?.uid || !note?.text) return json(400, { error: "Missing date or note" });
        try {
            const ref = firestore.collection("verseOfDay").doc(date);
            const snap = await ref.get();
            if (snap.exists) {
                await ref.update({ notes: admin.firestore.FieldValue.arrayUnion(note) });
            } else {
                await ref.set({ verse: verseRef || "", reactions: {}, notes: [note] });
            }
            return json(200, { success: true });
        } catch (e) { return json(500, { error: "Failed to save note" }); }
    }

    // PATCH /verse-of-day/note/edit  { date, noteId, userId, text }
    if (rawPath === "/verse-of-day/note/edit" && method === "PATCH") {
        const { date, noteId, userId: uid, text } = body;
        if (!date || !noteId || !uid || !text?.trim()) return json(400, { error: "Missing fields" });
        try {
            const ref = firestore.collection("verseOfDay").doc(date);
            const snap = await ref.get();
            if (!snap.exists) return json(404, { error: "Not found" });
            const notes = (snap.data() as any).notes || [];
            const idx = notes.findIndex((n: any) => n.id === noteId);
            if (idx === -1) return json(404, { error: "Comment not found" });
            if (notes[idx].uid !== uid) return json(403, { error: "Not your comment" });
            notes[idx] = { ...notes[idx], text: text.trim(), updatedAt: new Date().toISOString() };
            await ref.update({ notes });
            return json(200, { success: true });
        } catch { return json(500, { error: "Failed to edit comment" }); }
    }

    // DELETE /verse-of-day/note/delete  { date, noteId, userId }
    if (rawPath === "/verse-of-day/note/delete" && method === "DELETE") {
        const { date, noteId, userId: uid } = body;
        if (!date || !noteId || !uid) return json(400, { error: "Missing fields" });
        try {
            const ref = firestore.collection("verseOfDay").doc(date);
            const snap = await ref.get();
            if (!snap.exists) return json(404, { error: "Not found" });
            const notes = ((snap.data() as any).notes || []).filter((n: any) => n.id !== noteId);
            await ref.update({ notes });
            return json(200, { success: true });
        } catch { return json(500, { error: "Failed to delete comment" }); }
    }

    // POST /verse-of-day/note/reply  { date, noteId, reply }
    if (rawPath === "/verse-of-day/note/reply" && method === "POST") {
        const { date, noteId, reply } = body;
        if (!date || !noteId || !reply?.uid || !reply?.text) return json(400, { error: "Missing fields" });
        try {
            const ref = firestore.collection("verseOfDay").doc(date);
            const snap = await ref.get();
            if (!snap.exists) return json(404, { error: "Not found" });
            const notes = (snap.data() as any).notes || [];
            const idx = notes.findIndex((n: any) => n.id === noteId);
            if (idx === -1) return json(404, { error: "Comment not found" });
            notes[idx].replies = [...(notes[idx].replies || []), reply];
            await ref.update({ notes });
            return json(200, { success: true });
        } catch { return json(500, { error: "Failed to add reply" }); }
    }

    // PATCH /verse-of-day/note/reply/edit  { date, noteId, replyId, userId, text }
    if (rawPath === "/verse-of-day/note/reply/edit" && method === "PATCH") {
        const { date, noteId, replyId, userId: uid, text } = body;
        if (!date || !noteId || !replyId || !uid || !text?.trim()) return json(400, { error: "Missing fields" });
        try {
            const ref = firestore.collection("verseOfDay").doc(date);
            const snap = await ref.get();
            if (!snap.exists) return json(404, { error: "Not found" });
            const notes = (snap.data() as any).notes || [];
            const ni = notes.findIndex((n: any) => n.id === noteId);
            if (ni === -1) return json(404, { error: "Comment not found" });
            const replies = notes[ni].replies || [];
            const ri = replies.findIndex((r: any) => r.id === replyId);
            if (ri === -1) return json(404, { error: "Reply not found" });
            if (replies[ri].uid !== uid) return json(403, { error: "Not your reply" });
            replies[ri] = { ...replies[ri], text: text.trim(), updatedAt: new Date().toISOString() };
            notes[ni].replies = replies;
            await ref.update({ notes });
            return json(200, { success: true });
        } catch { return json(500, { error: "Failed to edit reply" }); }
    }

    // DELETE /verse-of-day/note/reply/delete  { date, noteId, replyId, userId }
    if (rawPath === "/verse-of-day/note/reply/delete" && method === "DELETE") {
        const { date, noteId, replyId, userId: uid } = body;
        if (!date || !noteId || !replyId || !uid) return json(400, { error: "Missing fields" });
        try {
            const ref = firestore.collection("verseOfDay").doc(date);
            const snap = await ref.get();
            if (!snap.exists) return json(404, { error: "Not found" });
            const notes = (snap.data() as any).notes || [];
            const ni = notes.findIndex((n: any) => n.id === noteId);
            if (ni === -1) return json(404, { error: "Not found" });
            notes[ni].replies = (notes[ni].replies || []).filter((r: any) => r.id !== replyId);
            await ref.update({ notes });
            return json(200, { success: true });
        } catch { return json(500, { error: "Failed to delete reply" }); }
    }

    // ─── PLAYGROUND TRELLO ─────────────────────────────────────────────────────
    // Boards
    if (rawPath === "/playground/boards" && method === "GET") {
        try { const s = await firestore.collection("pg_boards").orderBy("createdAt","desc").get(); return json(200, s.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null }))); }
        catch { return json(500, { error: "Failed" }); }
    }
    if (rawPath === "/playground/boards" && method === "POST") {
        const { title, color="#6366f1", description="" } = body;
        if (!title?.trim()) return json(400, { error: "Title required" });
        try { const r = await firestore.collection("pg_boards").add({ title: title.trim(), color, description, archived: false, customFieldDefs: [], createdAt: admin.firestore.FieldValue.serverTimestamp() }); return json(201, { id: r.id }); }
        catch { return json(500, { error: "Failed" }); }
    }
    const _pgBM = rawPath.match(/^\/playground\/boards\/([^/]+)$/);
    if (_pgBM) {
        const bid = _pgBM[1];
        if (method === "PUT") { try { const { title, color, description, archived, customFieldDefs } = body; await firestore.collection("pg_boards").doc(bid).update({ ...(title!==undefined && {title}), ...(color!==undefined && {color}), ...(description!==undefined && {description}), ...(archived!==undefined && {archived}), ...(customFieldDefs!==undefined && {customFieldDefs}) }); return json(200, { success: true }); } catch { return json(500, { error: "Failed" }); } }
        if (method === "DELETE") { try { const ls = await firestore.collection("pg_lists").where("boardId","==",bid).get(); const cs = await firestore.collection("pg_cards").where("boardId","==",bid).get(); const b = firestore.batch(); ls.docs.forEach(d=>b.delete(d.ref)); cs.docs.forEach(d=>b.delete(d.ref)); b.delete(firestore.collection("pg_boards").doc(bid)); await b.commit(); return json(200, { success: true }); } catch { return json(500, { error: "Failed" }); } }
    }
    // Lists
    const _pgBL = rawPath.match(/^\/playground\/boards\/([^/]+)\/lists$/);
    if (_pgBL && method === "GET") { const bid = _pgBL[1]; try { const s = await firestore.collection("pg_lists").where("boardId","==",bid).get(); const docs = s.docs.map(d=>({id:d.id,...d.data()} as any)).filter((d:any)=>!d.archived).sort((a:any,b:any)=>a.pos-b.pos); return json(200, docs); } catch { return json(500, { error: "Failed" }); } }
    if (_pgBL && method === "POST") { const bid = _pgBL[1]; const { title } = body; if (!title?.trim()) return json(400, { error: "Title required" }); try { const ex = await firestore.collection("pg_lists").where("boardId","==",bid).get(); const maxPos = ex.docs.reduce((m,d)=>Math.max(m,(d.data().pos??0)),0); const pos = maxPos + 16384; const r = await firestore.collection("pg_lists").add({ boardId: bid, title: title.trim(), pos, archived: false, createdAt: admin.firestore.FieldValue.serverTimestamp() }); return json(201, { id: r.id }); } catch { return json(500, { error: "Failed" }); } }
    const _pgLM = rawPath.match(/^\/playground\/lists\/([^/]+)$/);
    if (_pgLM) {
        const lid = _pgLM[1];
        if (method === "PUT") { try { const { title, archived, pos } = body; await firestore.collection("pg_lists").doc(lid).update({ ...(title!==undefined && {title}), ...(archived!==undefined && {archived}), ...(pos!==undefined && {pos}) }); return json(200, { success: true }); } catch { return json(500, { error: "Failed" }); } }
        if (method === "DELETE") { try { const cs = await firestore.collection("pg_cards").where("listId","==",lid).get(); const b = firestore.batch(); cs.docs.forEach(d=>b.delete(d.ref)); b.delete(firestore.collection("pg_lists").doc(lid)); await b.commit(); return json(200, { success: true }); } catch { return json(500, { error: "Failed" }); } }
    }
    // Cards
    const _pgBC = rawPath.match(/^\/playground\/boards\/([^/]+)\/cards$/);
    if (_pgBC && method === "GET") { const bid = _pgBC[1]; try { const s = await firestore.collection("pg_cards").where("boardId","==",bid).get(); const docs = s.docs.map(d=>({id:d.id,...d.data(), createdAt:(d.data().createdAt?.toDate?.()?.toISOString()??null)} as any)).filter((d:any)=>!d.archived).sort((a:any,b:any)=>a.pos-b.pos); return json(200, docs); } catch { return json(500, { error: "Failed" }); } }
    if (rawPath === "/playground/cards" && method === "POST") {
        const { boardId, listId, title } = body;
        if (!boardId || !listId || !title?.trim()) return json(400, { error: "boardId, listId, title required" });
        try { const ex = await firestore.collection("pg_cards").where("listId","==",listId).get(); const maxPos = ex.docs.reduce((m,d)=>Math.max(m,(d.data().pos??0)),0); const pos = maxPos + 16384; const r = await firestore.collection("pg_cards").add({ boardId, listId, title: title.trim(), description: "", pos, members: [], labels: [], dueDate: null, checklists: [], customFields: {}, archived: false, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }); return json(201, { id: r.id }); }
        catch { return json(500, { error: "Failed" }); }
    }
    const _pgCM = rawPath.match(/^\/playground\/cards\/([^/]+)$/);
    if (_pgCM) {
        const cid = _pgCM[1];
        if (method === "GET") { try { const d = await firestore.collection("pg_cards").doc(cid).get(); return d.exists ? json(200, { id: d.id, ...d.data() }) : json(404, { error: "Not found" }); } catch { return json(500, { error: "Failed" }); } }
        if (method === "PUT") { try { const { title, description, members, labels, dueDate, checklists, customFields, archived, listId, pos } = body; await firestore.collection("pg_cards").doc(cid).update({ ...(title!==undefined&&{title}), ...(description!==undefined&&{description}), ...(members!==undefined&&{members}), ...(labels!==undefined&&{labels}), ...(dueDate!==undefined&&{dueDate}), ...(checklists!==undefined&&{checklists}), ...(customFields!==undefined&&{customFields}), ...(archived!==undefined&&{archived}), ...(listId!==undefined&&{listId}), ...(pos!==undefined&&{pos}), updatedAt: admin.firestore.FieldValue.serverTimestamp() }); return json(200, { success: true }); } catch { return json(500, { error: "Failed" }); } }
        if (method === "DELETE") { try { await firestore.collection("pg_cards").doc(cid).delete(); return json(200, { success: true }); } catch { return json(500, { error: "Failed" }); } }
    }
    // Move card (fractional indexing)
    const _pgMV = rawPath.match(/^\/playground\/cards\/([^/]+)\/move$/);
    if (_pgMV && method === "PATCH") {
        const cid = _pgMV[1];
        const { boardId, listId, position } = body;
        try {
            const s = await firestore.collection("pg_cards").where("listId","==",listId).get();
            const cards = s.docs.filter(d => d.id !== cid && !d.data().archived).sort((a,b)=>a.data().pos-b.data().pos);
            let newPos: number;
            if (position === "top" || cards.length === 0) { newPos = (cards[0]?.data().pos ?? 16384) / 2; }
            else if (position === "bottom") { newPos = (cards[cards.length-1]?.data().pos ?? 0) + 16384; }
            else { const idx = Math.max(0, Math.min(Number(position)-1, cards.length)); if (idx === 0) newPos = (cards[0]?.data().pos ?? 16384) / 2; else if (idx >= cards.length) newPos = (cards[cards.length-1]?.data().pos ?? 0) + 16384; else newPos = (cards[idx-1].data().pos + cards[idx].data().pos) / 2; }
            await firestore.collection("pg_cards").doc(cid).update({ listId, boardId, pos: newPos, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            return json(200, { success: true, pos: newPos });
        } catch { return json(500, { error: "Failed to move" }); }
    }

    // ── POST /activity/heartbeat — session tracking for Admin Activity Monitor ──
    if (rawPath === "/activity/heartbeat" && method === "POST") {
        const { userId, sessionId, name, email, role, photo, action } = body;
        if (!userId || !sessionId || !action) return json(400, { error: "Missing fields" });
        if (!firestore) return json(200, { ok: true }); // Silently pass if DB unavailable

        const now = admin.firestore.FieldValue.serverTimestamp();
        const nowIso = new Date().toISOString();

        try {
            if (action === "start") {
                // Write live presence doc (also stores lastLogin so we avoid a
                // separate per-session collection that grows forever)
                await firestore.collection("user_presence").doc(userId).set({
                    userId, sessionId, name: name || email, email, role, photo,
                    isOnline: true,
                    sessionStart: nowIso,
                    lastSeen: nowIso,
                    lastLogin: nowIso,    // upsert — one doc per user, no collection growth
                    lastView: body.lastView || "dashboard",
                }, { merge: false });

            } else if (action === "ping") {
                // Update lastSeen + lastView on every heartbeat
                await firestore.collection("user_presence").doc(userId).set(
                    { isOnline: true, lastSeen: nowIso, lastView: body.lastView || "dashboard" },
                    { merge: true }
                );

            } else if (action === "end") {
                // Mark offline — preserve lastView as the final section they were in
                await firestore.collection("user_presence").doc(userId).set(
                    { isOnline: false, lastSeen: nowIso, lastView: body.lastView || "dashboard" },
                    { merge: true }
                );
            }


            return json(200, { ok: true });
        } catch (e) {
            console.error("[activity/heartbeat] error:", e);
            return json(200, { ok: true }); // Don't break the app if tracking fails
        }
    }

    // ── GET /activity/sessions — Admin Activity Monitor data ────────────────────
    // Only reads user_presence (one doc per user, bounded) — no more growing user_sessions log.
    if (rawPath === "/activity/sessions" && method === "GET") {
        if (!firestore) return json(200, { online: [], lastLogins: [] });
        try {
            // Auto-expire presence docs whose lastSeen is > 2 min ago
            const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

            const presenceSnap = await firestore.collection("user_presence").get();

            // Mark stale presence docs as offline (fire-and-forget batch)
            const batch = firestore.batch();
            let hasStaleDocs = false;
            presenceSnap.docs.forEach(doc => {
                const lastSeen = doc.data().lastSeen as string | undefined;
                if (lastSeen && lastSeen < twoMinAgo && doc.data().isOnline) {
                    batch.update(doc.ref, { isOnline: false });
                    hasStaleDocs = true;
                }
            });
            if (hasStaleDocs) batch.commit().catch(() => {});

            const allPresence = presenceSnap.docs.map(d => d.data());

            const online = allPresence
                .filter(d => d.isOnline && (d.lastSeen || "") >= twoMinAgo)
                .sort((a, b) => (a.sessionStart || "").localeCompare(b.sessionStart || ""));

            // lastLogins — OFFLINE users only, sorted by lastLogin desc
            // Online users are already shown in the "Live Now" section above.
            // Including them here too is redundant and confusing.
            const lastLogins = allPresence
                .filter(d => !d.isOnline && (d.lastLogin || d.lastSeen))
                .sort((a, b) => ((b.lastLogin || b.lastSeen) || "").localeCompare((a.lastLogin || a.lastSeen) || ""));

            return json(200, { online, lastLogins });
        } catch (e) {
            console.error("[activity/sessions] error:", e);
            return json(200, { online: [], lastLogins: [] });
        }
    }

    return json(404, { error: "Not found" });
};

// ─── PLAYGROUND TRELLO (appended below closing brace intentionally via script) ─
