// ── Playlist utility helpers — kept in a separate file so that PlaylistView.tsx
// can export ONLY a React component (required for Vite fast-refresh / HMR). ──

export interface Playlist {
  id: string;
  name: string;
  songIds: string[];
  createdAt: string;
  updatedAt: string;
  emoji?: string;
  publishedSlug?: string; // set when the playlist has an active public link
}

const STORAGE_KEY = "wf_playlists_v1";

export function loadPlaylists(): Playlist[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Playlist[];
  } catch { return []; }
}

export function savePlaylists(list: Playlist[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { }
}

export function addSongToPlaylist(
  playlistId: string,
  songId: string,
): "added" | "already" | "not_found" {
  const list = loadPlaylists();
  const pl = list.find(p => p.id === playlistId);
  if (!pl) return "not_found";
  if (pl.songIds.includes(songId)) return "already";
  pl.songIds = [...pl.songIds, songId];
  pl.updatedAt = new Date().toISOString();
  savePlaylists(list);
  return "added";
}
