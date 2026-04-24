// One-time cleanup: delete an accidentally created sharedPlaylists document
import admin  from "firebase-admin";
import dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(process.cwd(), ".env") });

const slug = process.argv[2] ?? "worship-concert";

const projectId   = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("❌ Missing Firebase env vars"); process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
const db = admin.firestore();
db.settings({ preferRest: true });

const ref = db.collection("sharedPlaylists").doc(slug);
const doc = await ref.get();
if (!doc.exists) { console.log(`ℹ️  Nothing to delete — sharedPlaylists/${slug} doesn't exist.`); process.exit(0); }

await ref.delete();
console.log(`✅ Deleted sharedPlaylists/${slug}`);
process.exit(0);
