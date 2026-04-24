// One-time script: patch accentColor on a sharedPlaylists document
// Uses the same env vars as server.ts
import admin   from "firebase-admin";
import dotenv  from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(process.cwd(), ".env") });

const slug  = process.argv[2] ?? "yc2026-worship-concert";
const color = process.argv[3] ?? "#f97316"; // orange by default

const projectId   = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("❌ Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY in .env");
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
const db  = admin.firestore();
db.settings({ preferRest: true });

const ref = db.collection("sharedPlaylists").doc(slug);
const doc = await ref.get();
if (!doc.exists) { console.error(`❌ No document: sharedPlaylists/${slug}`); process.exit(1); }

await ref.update({ accentColor: color });
console.log(`✅  sharedPlaylists/${slug}.accentColor = ${color}`);
process.exit(0);
