#!/usr/bin/env node
// Generates public/firebase-messaging-sw.js from the template file,
// substituting environment variables so the actual key is never in git.

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, "..");

// Load .env.local for local dev (Netlify sets vars via dashboard)
config({ path: join(root, ".env.local") });

const template = readFileSync(join(root, "public", "firebase-messaging-sw.template.js"), "utf8");

const vars = {
    __VITE_FIREBASE_API_KEY__:            process.env.VITE_FIREBASE_API_KEY            || "",
    __VITE_FIREBASE_AUTH_DOMAIN__:        process.env.VITE_FIREBASE_AUTH_DOMAIN        || "",
    __VITE_FIREBASE_PROJECT_ID__:         process.env.VITE_FIREBASE_PROJECT_ID         || "",
    __VITE_FIREBASE_STORAGE_BUCKET__:     process.env.VITE_FIREBASE_STORAGE_BUCKET     || "",
    __VITE_FIREBASE_MESSAGING_SENDER_ID__: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    __VITE_FIREBASE_APP_ID__:             process.env.VITE_FIREBASE_APP_ID             || "",
};

let output = template;
for (const [placeholder, value] of Object.entries(vars)) {
    output = output.replaceAll(placeholder, value);
}

writeFileSync(join(root, "public", "firebase-messaging-sw.js"), output, "utf8");
console.log("✅ firebase-messaging-sw.js generated from template");
