// ── Playlist utility helpers ──────────────────────────────────────────────────
// localStorage is no longer the source of truth — Firestore is.
// loadPlaylists() is kept ONLY for one-time migration on first Firestore login.

import { db } from "./firebase";
import {
  collection, doc, setDoc, deleteDoc, writeBatch, getDocs,
} from "firebase/firestore";

export interface Playlist {
  id: string;
  name: string;
  songIds: string[];
  createdAt: string;
  updatedAt: string;
  emoji?: string;
  publishedSlug?: string; // set when the playlist has an active public link
  bannerUrl?: string;     // cover art / banner shown in internal + public view
  accentColor?: string;   // theme accent color
  description?: string;   // optional description
}

const STORAGE_KEY = "wf_playlists_v1";

// ── MIGRATION ONLY: read from localStorage ────────────────────────────────────
export function loadPlaylists(): Playlist[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Playlist[];
  } catch { return []; }
}

// ── MIGRATION ONLY: remove localStorage key after migration ───────────────────
export function clearLocalPlaylists(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { }
}

// ── Firestore path helper ─────────────────────────────────────────────────────
export function playlistsCol(uid: string) {
  return collection(db, "users", uid, "playlists");
}
export function playlistDoc(uid: string, playlistId: string) {
  return doc(db, "users", uid, "playlists", playlistId);
}

// ── Write a single playlist to Firestore ─────────────────────────────────────
export async function savePlaylistToFirestore(uid: string, pl: Playlist): Promise<void> {
  await setDoc(playlistDoc(uid, pl.id), pl);
}

// ── Delete a single playlist from Firestore ───────────────────────────────────
export async function deletePlaylistFromFirestore(uid: string, playlistId: string): Promise<void> {
  await deleteDoc(playlistDoc(uid, playlistId));
}

// ── Migrate: push all local playlists to Firestore, then clear localStorage ───
export async function migrateLocalPlaylistsToFirestore(uid: string): Promise<number> {
  const local = loadPlaylists();
  if (local.length === 0) return 0;

  // Check if Firestore already has data (don't overwrite)
  const snap = await getDocs(playlistsCol(uid));
  if (!snap.empty) {
    // Firestore already has playlists — don't overwrite, just clean up localStorage
    clearLocalPlaylists();
    return 0;
  }

  const batch = writeBatch(db);
  local.forEach(pl => batch.set(playlistDoc(uid, pl.id), pl));
  await batch.commit();
  clearLocalPlaylists();
  return local.length;
}

// ── Add a song to a playlist in Firestore ─────────────────────────────────────
// Returns "added" | "already" | "not_found"
export async function addSongToPlaylistFirestore(
  uid: string,
  playlistId: string,
  songId: string,
  allPlaylists: Playlist[],
): Promise<"added" | "already" | "not_found"> {
  const pl = allPlaylists.find(p => p.id === playlistId);
  if (!pl) return "not_found";
  if (pl.songIds.includes(songId)) return "already";
  const updated: Playlist = {
    ...pl,
    songIds: [...pl.songIds, songId],
    updatedAt: new Date().toISOString(),
  };
  await setDoc(playlistDoc(uid, playlistId), updated);
  return "added";
}

// ── Create a new playlist in Firestore and add a song ─────────────────────────
export async function createPlaylistWithSong(
  uid: string,
  name: string,
  songId: string,
): Promise<Playlist> {
  const pl: Playlist = {
    id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    emoji: "🎵",
    songIds: [songId],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await setDoc(playlistDoc(uid, pl.id), pl);
  return pl;
}

// ── Legacy savePlaylists — kept so existing import sites don't break ──────────
// @deprecated Use savePlaylistToFirestore instead
export function savePlaylists(_list: Playlist[]): void {
  // no-op — Firestore is now the source of truth
}

// ── Legacy addSongToPlaylist (sync localStorage) — kept for import compat ──────
// @deprecated Use addSongToPlaylistFirestore instead
export function addSongToPlaylist(
  _playlistId: string,
  _songId: string,
): "added" | "already" | "not_found" {
  // No-op stub — callers in SongsView now use addSongToPlaylistFirestore
  return "not_found";
}
