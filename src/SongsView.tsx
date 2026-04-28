import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { toSafeTitle } from "./utils/textFormatting";
import { createPortal } from "react-dom";
import { getAuth } from "firebase/auth";
import AutoTextarea from "./AutoTextarea";
import { Song, Tag } from "./types";
import { Music, Search, Plus, Edit, Trash2, X, Save, Tag as TagIcon, ChevronLeft, ChevronRight,
  ChevronDown, ImagePlus, Loader2, ExternalLink, Printer, CheckSquare, Check, Filter, Users,
  Calendar, Phone, UserPlus, Camera, LayoutGrid, List, BookOpen, Mic2, Copy, Pencil,
  Shield, Mail, Guitar, Sliders, Palette, Lock, AlertTriangle, CheckCircle, BookMarked,
  HandMetal, Headphones, HelpCircle, Undo2, Redo2, Play, ListMusic, BookmarkPlus, BarChart2 } from "lucide-react";
import SongsLibraryPlayer, { LibraryTrack } from "./SongsLibraryPlayer";
import { loadPlaylists, addSongToPlaylist, Playlist,
  addSongToPlaylistFirestore, createPlaylistWithSong,
  playlistsCol } from "./PlaylistView";
import { useAuth } from "./AuthContext";
import { onSnapshot } from "firebase/firestore";

// ── Module-level helpers ──────────────────────────────────────────────────────
const CustomYoutubeIcon = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <circle cx="12" cy="12" r="10" fill="#FF0000" />
    <path d="M10 8.5L15 12L10 15.5V8.5Z" fill="white" />
  </svg>
);

const CustomVideoBtnIcon = ({ size = 20, className = "" }: { size?: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect x="2" y="4" width="20" height="16" rx="4" fill="#FF0000" />
    <path d="M10 8.5L15 12L10 15.5V8.5Z" fill="white" />
  </svg>
);

// ── Add-to-Playlist popover ───────────────────────────────────────────────────
// Uses createPortal so the dropdown renders at <body> level — never clipped or
// hidden behind other cards. Position is calculated SYNCHRONOUSLY on click.
function AddToPlaylistBtn({ song, showToast, variant }: { song: Song; showToast: (type: string, msg: string) => void; variant?: "detail" }) {
  const { user } = useAuth();
  const [open, setOpen]       = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [creating, setCreating]   = useState(false);
  const [newName, setNewName]     = useState("");
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});

  const btnRef   = useRef<HTMLButtonElement>(null);
  const dropRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const DROPDOWN_W = 240;

  // Live-sync playlist list from Firestore when user is available
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(playlistsCol(user.uid), snap => {
      const pls = snap.docs.map(d => d.data() as Playlist);
      pls.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setPlaylists(pls);
    });
    return () => unsub();
  }, [user]);

  // ── Open / close ────────────────────────────────────────────────────────
  const openDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (open) { setOpen(false); return; }

    setCreating(false);
    setNewName("");

    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      let left = rect.right - DROPDOWN_W;
      if (left < 8) left = 8;
      if (left + DROPDOWN_W > window.innerWidth - 8) left = window.innerWidth - DROPDOWN_W - 8;
      // Initial estimate — refined after render via ResizeObserver
      setDropStyle({ position: "fixed", top: rect.bottom + 6, left, width: DROPDOWN_W, zIndex: 99999 });
    }

    setOpen(true);
  };

  // Reposition once the dropdown has rendered and we know its real height
  useEffect(() => {
    if (!open || !dropRef.current || !btnRef.current) return;
    const reposition = () => {
      if (!dropRef.current || !btnRef.current) return;
      const btnRect    = btnRef.current.getBoundingClientRect();
      const dropH      = dropRef.current.offsetHeight;
      const spaceAbove = btnRect.top;
      const spaceBelow = window.innerHeight - btnRect.bottom;
      let top: number;
      if (spaceAbove >= dropH + 8) {
        top = btnRect.top - dropH - 6;  // prefer above
      } else if (spaceBelow >= dropH + 8) {
        top = btnRect.bottom + 6;       // fall back below
      } else {
        top = Math.max(8, btnRect.top - dropH - 6);
      }
      let left = btnRect.right - DROPDOWN_W;
      if (left < 8) left = 8;
      if (left + DROPDOWN_W > window.innerWidth - 8) left = window.innerWidth - DROPDOWN_W - 8;
      setDropStyle({ position: "fixed", top, left, width: DROPDOWN_W, zIndex: 99999 });
    };
    const ro = new ResizeObserver(reposition);
    ro.observe(dropRef.current);
    reposition();
    return () => ro.disconnect();
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || dropRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [open]);

  // Close on any scroll (so dropdown doesn't drift)
  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    window.addEventListener("scroll", handler, true);
    return () => window.removeEventListener("scroll", handler, true);
  }, [open]);

  // Focus new-playlist input when creating
  useEffect(() => {
    if (creating) setTimeout(() => inputRef.current?.focus(), 40);
  }, [creating]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleAdd = async (playlistId: string, playlistName: string) => {
    if (!user) return;
    const result = await addSongToPlaylistFirestore(user.uid, playlistId, song.id, playlists);
    if (result === "added")        showToast("success", `Added to "${playlistName}"`);
    else if (result === "already") showToast("info", `"${song.title}" is already in "${playlistName}" ✓`);
    setOpen(false);
  };

  const handleCreateAndAdd = async () => {
    const name = newName.trim();
    if (!name || !user) return;
    try {
      await createPlaylistWithSong(user.uid, name, song.id);
      showToast("success", `Created "${name}" and added song!`);
    } catch { showToast("error", "Failed to create playlist."); }
    setOpen(false);
  };

  const inPlaylistIds = new Set(playlists.filter(p => p.songIds.includes(song.id)).map(p => p.id));

  // ── Dropdown content (portal) ────────────────────────────────────────────
  const dropdown = open ? createPortal(
    <div
      ref={dropRef}
      style={dropStyle}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      className="bg-white dark:bg-[#1a1f2e] border border-gray-200 dark:border-gray-700/80 rounded-2xl shadow-2xl overflow-hidden"
    >
      <div className="p-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-3 py-2 select-none">
          Add to Playlist
        </p>

        {playlists.length === 0 && !creating && (
          <p className="text-xs text-gray-600 px-3 pb-2">No playlists yet.</p>
        )}

        <div className="max-h-52 overflow-y-auto">
          {playlists.map(pl => (
            <button
              key={pl.id}
              onMouseDown={e => e.stopPropagation()}
              onClick={() => handleAdd(pl.id, pl.name)}
              className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm transition-colors text-left ${
                inPlaylistIds.has(pl.id)
                  ? "text-indigo-400 bg-indigo-900/20 hover:bg-indigo-900/30"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              <span className="text-base shrink-0">{pl.emoji ?? "🎵"}</span>
              <span className="flex-1 truncate">{pl.name}</span>
              {inPlaylistIds.has(pl.id) && <Check size={12} className="shrink-0 text-indigo-400" />}
              <span className="text-[10px] text-gray-600 shrink-0">{pl.songIds.length}</span>
            </button>
          ))}
        </div>

        {/* Create new playlist */}
        <div className="border-t border-gray-800 mt-1 pt-1">
          {creating ? (
            <div className="flex items-center gap-1 px-1 py-1">
              <input
                ref={inputRef}
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === "Enter")  handleCreateAndAdd();
                  if (e.key === "Escape") setCreating(false);
                }}
                placeholder="Playlist name..."
                maxLength={60}
                className="flex-1 px-2.5 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-xs text-white placeholder-gray-500 outline-none focus:border-indigo-500"
              />
              <button onMouseDown={e => e.stopPropagation()} onClick={handleCreateAndAdd}
                className="p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 shrink-0">
                <Check size={12} />
              </button>
              <button onMouseDown={e => e.stopPropagation()} onClick={() => setCreating(false)}
                className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 shrink-0">
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-xs text-indigo-400 hover:bg-indigo-900/20 transition-colors"
            >
              <Plus size={13} /> New Playlist
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  // ── Render ───────────────────────────────────────────────────────────────
  if (variant === "detail") {
    return (
      <>
        <button
          ref={btnRef}
          onMouseDown={e => e.stopPropagation()}
          onClick={openDropdown}
          title="Add to Playlist"
          className="flex items-center justify-center gap-2 py-3.5 text-sm font-semibold transition-all hover:bg-white/[0.04] active:bg-white/[0.07] w-full"
          style={{ color: inPlaylistIds.size > 0 ? "rgba(99,102,241,0.85)" : "rgba(255,255,255,0.55)" }}
        >
          <Plus size={15} />
          {inPlaylistIds.size > 0 ? `IN ${inPlaylistIds.size} PLAYLIST${inPlaylistIds.size > 1 ? "S" : ""}` : "ADD TO PLAYLIST"}
        </button>
        {dropdown}
      </>
    );
  }

  return (
    <>
      <button
        ref={btnRef}
        onMouseDown={e => e.stopPropagation()}
        onClick={openDropdown}
        title="Add to Playlist"
        className={`shrink-0 w-11 h-11 flex items-center justify-center rounded-xl transition-colors relative group/pltooltip ${
          inPlaylistIds.size > 0
            ? "text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30"
            : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-indigo-500"
        }`}
      >
        <ListMusic size={20} />
        {inPlaylistIds.size > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-500 border border-white dark:border-gray-800" />
        )}
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-gray-900 text-white text-[10px] rounded-lg opacity-0 group-hover/pltooltip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10 shadow-lg">
          {inPlaylistIds.size > 0 ? `In ${inPlaylistIds.size} playlist${inPlaylistIds.size > 1 ? "s" : ""}` : "Add to Playlist"}
        </span>
      </button>
      {dropdown}
    </>
  );
}

// ── Full-width Add to Playlist bar button (for grid card footer) ──────────────
function AddToPlaylistBarBtn({ song, showToast }: { song: Song; showToast: (type: string, msg: string) => void }) {
  const { user } = useAuth();
  const [open, setOpen]       = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [creating, setCreating]   = useState(false);
  const [newName, setNewName]     = useState("");
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});
  const btnRef  = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const DROPDOWN_W = 240;

  // Live-sync playlist list from Firestore
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(playlistsCol(user.uid), snap => {
      const pls = snap.docs.map(d => d.data() as Playlist);
      pls.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setPlaylists(pls);
    });
    return () => unsub();
  }, [user]);

  const openDropdown = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    if (open) { setOpen(false); return; }
    setCreating(false); setNewName("");
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      let left = rect.right - DROPDOWN_W;
      if (left < 8) left = 8;
      if (left + DROPDOWN_W > window.innerWidth - 8) left = window.innerWidth - DROPDOWN_W - 8;
      // Start by placing above; will be refined by ResizeObserver after render
      setDropStyle({ position: "fixed", top: rect.top - 8 - 200, left, width: DROPDOWN_W, zIndex: 99999 });
    }
    setOpen(true);
  };

  // Reposition once the dropdown has rendered and we know its real height
  useEffect(() => {
    if (!open || !dropRef.current || !btnRef.current) return;
    const reposition = () => {
      if (!dropRef.current || !btnRef.current) return;
      const btnRect  = btnRef.current.getBoundingClientRect();
      const dropH    = dropRef.current.offsetHeight;
      const spaceAbove = btnRect.top;
      const spaceBelow = window.innerHeight - btnRect.bottom;
      let top: number;
      if (spaceAbove >= dropH + 8) {
        top = btnRect.top - dropH - 6; // above button
      } else if (spaceBelow >= dropH + 8) {
        top = btnRect.bottom + 6;      // below button
      } else {
        top = Math.max(8, btnRect.top - dropH - 6); // best fit
      }
      let left = btnRect.right - DROPDOWN_W;
      if (left < 8) left = 8;
      if (left + DROPDOWN_W > window.innerWidth - 8) left = window.innerWidth - DROPDOWN_W - 8;
      setDropStyle({ position: "fixed", top, left, width: DROPDOWN_W, zIndex: 99999 });
    };
    const ro = new ResizeObserver(reposition);
    ro.observe(dropRef.current);
    reposition();
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || dropRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", h, true);
    return () => document.removeEventListener("mousedown", h, true);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const h = () => setOpen(false);
    window.addEventListener("scroll", h, true);
    return () => window.removeEventListener("scroll", h, true);
  }, [open]);
  useEffect(() => { if (creating) setTimeout(() => inputRef.current?.focus(), 40); }, [creating]);

  const handleAdd = async (playlistId: string, playlistName: string) => {
    if (!user) return;
    const result = await addSongToPlaylistFirestore(user.uid, playlistId, song.id, playlists);
    if (result === "added")        showToast("success", `Added to "${playlistName}"`);
    else if (result === "already") showToast("info", `"${song.title}" is already in "${playlistName}" ✓`);
    setOpen(false);
  };
  const handleCreateAndAdd = async () => {
    const name = newName.trim(); if (!name || !user) return;
    try {
      await createPlaylistWithSong(user.uid, name, song.id);
      showToast("success", `Created "${name}" and added song!`);
    } catch { showToast("error", "Failed to create playlist."); }
    setOpen(false);
  };
  const inPlaylistIds = new Set(playlists.filter(p => p.songIds.includes(song.id)).map(p => p.id));

  const dropdown = open ? createPortal(
    <div ref={dropRef} style={dropStyle} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
      className="bg-white dark:bg-[#1a1f2e] border border-gray-200 dark:border-gray-700/80 rounded-2xl shadow-2xl overflow-hidden">
      <div className="p-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-3 py-2 select-none">Add to Playlist</p>
        {playlists.length === 0 && !creating && <p className="text-xs text-gray-600 px-3 pb-2">No playlists yet.</p>}
        <div className="max-h-52 overflow-y-auto">
          {playlists.map(pl => (
            <button key={pl.id} onMouseDown={e => e.stopPropagation()} onClick={() => handleAdd(pl.id, pl.name)}
              className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm transition-colors text-left ${
                inPlaylistIds.has(pl.id) ? "text-indigo-400 bg-indigo-900/20 hover:bg-indigo-900/30" : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}>
              <span className="text-base shrink-0">{pl.emoji ?? "🎵"}</span>
              <span className="flex-1 truncate">{pl.name}</span>
              {inPlaylistIds.has(pl.id) && <Check size={12} className="shrink-0 text-indigo-400" />}
              <span className="text-[10px] text-gray-600 shrink-0">{pl.songIds.length}</span>
            </button>
          ))}
        </div>
        <div className="border-t border-gray-800 mt-1 pt-1">
          {creating ? (
            <div className="flex items-center gap-1 px-1 py-1">
              <input ref={inputRef} type="text" value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { e.stopPropagation(); if (e.key==="Enter") handleCreateAndAdd(); if (e.key==="Escape") setCreating(false); }}
                placeholder="Playlist name..." maxLength={60}
                className="flex-1 px-2.5 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-xs text-white placeholder-gray-500 outline-none focus:border-indigo-500" />
              <button onMouseDown={e=>e.stopPropagation()} onClick={handleCreateAndAdd} className="p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 shrink-0"><Check size={12} /></button>
              <button onMouseDown={e=>e.stopPropagation()} onClick={() => setCreating(false)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 shrink-0"><X size={12} /></button>
            </div>
          ) : (
            <button onMouseDown={e=>e.stopPropagation()} onClick={() => setCreating(true)}
              className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-xs text-indigo-400 hover:bg-indigo-900/20 transition-colors">
              <Plus size={13} /> New Playlist
            </button>
          )}
        </div>
      </div>
    </div>, document.body
  ) : null;

  return (
    <>
      <button ref={btnRef} onMouseDown={e => e.stopPropagation()} onClick={openDropdown}
        className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-[11px] font-bold tracking-widest uppercase transition-colors ${
          inPlaylistIds.size > 0 ? "text-indigo-400 hover:text-indigo-300" : "text-gray-400 hover:text-white"
        } hover:bg-white/[0.04]`}>
        <Plus size={14} />
        Add to Playlist
        {inPlaylistIds.size > 0 && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />}
      </button>
      {dropdown}
    </>
  );
}


// ── Chord Transposer ──────────────────────────────────────────────────────────
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ENHARMONIC: Record<string, string> = {
  'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
};

function transposeChords(text: string, steps: number): string {
  if (!steps || !text) return text;
  const n = ((steps % 12) + 12) % 12;
  return text.replace(
    /(?<![A-Za-z])([A-G][#b]?)(m(?:aj\d*)?|maj\d*|min\d*|dim\d*|aug\d*|sus[24]?\d*|add\d+|\d+)?(?![a-z])/g,
    (_: string, root: string, quality: string | undefined) => {
      const normalized = ENHARMONIC[root] ?? root;
      const idx = CHROMATIC.indexOf(normalized);
      if (idx === -1) return _;
      return CHROMATIC[(idx + n) % 12] + (quality ?? '');
    }
  );
}



// ── Props ─────────────────────────────────────────────────────────────────────
export interface SongsViewProps {
  allSongs: Song[];
  setAllSongs: React.Dispatch<React.SetStateAction<Song[]>>;
  tags: Tag[];
  setTags: React.Dispatch<React.SetStateAction<Tag[]>>;
  isLoadingSongs: boolean;
  setIsLoadingSongs: React.Dispatch<React.SetStateAction<boolean>>;
  allMembers: any[];
  isAdmin: boolean;
  canAddSong: boolean;
  canEditSong: boolean;
  canDeleteSong: boolean;
  canSelectSongs?: boolean;
  user: any;
  showToast: (type: string, msg: string) => void;
  showConfirm: (config: any) => void;
  closeConfirm: () => void;
  pendingNavSongId?: string | null;
  onPendingNavHandled?: () => void;
  onOpenVideo?: (url: string) => void;
  /** Called whenever a song is opened/closed so App.tsx can track detail-panel state */
  onSelectedSongChange?: (hasSong: boolean) => void;
  /** Increment this number from App.tsx to tell SongsView to clear the selected song */
  clearSelectionSignal?: number;
  /** Lifted: open the library player from App.tsx (persists across navigation) */
  onOpenLibraryPlayer?: (songId?: string) => void;
  /** Whether the library player is currently open — used for button state */
  isLibraryPlayerOpen?: boolean;
  /** Whether the lineup player is open — disables Play Library button to prevent conflict */
  isLineupOpen?: boolean;
}

export default function SongsView({
  allSongs,
  setAllSongs,
  tags,
  setTags,
  isLoadingSongs,
  setIsLoadingSongs,
  allMembers,
  isAdmin,
  canAddSong,
  canEditSong,
  canDeleteSong,
  canSelectSongs,
  user,
  showToast,
  showConfirm,
  closeConfirm,
  pendingNavSongId,
  onPendingNavHandled,
  onOpenVideo,
  onSelectedSongChange,
  clearSelectionSignal,
  onOpenLibraryPlayer,
  isLibraryPlayerOpen = false,
  isLineupOpen = false,
}: SongsViewProps) {

  // ── Songs search & filter ─────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // ── Debounce: sync searchQuery → debouncedQuery with 150ms delay ────────────
  // Without this useEffect, debouncedQuery is always "" and search never filters.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 150);
    return () => clearTimeout(t);
  }, [searchQuery]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  // ── Song editing form ─────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);

  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>([]);
  const [isOcrLoading, setIsOcrLoading] = useState<"lyrics" | "chords" | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editArtist, setEditArtist] = useState("");
  const [editVideoUrl, setEditVideoUrl] = useState("");
  const [editLyrics, setEditLyrics] = useState("");
  const [editChords, setEditChords] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [copiedField, setCopiedField] = useState<"lyrics" | "chords" | null>(null);
  const [transposeSteps, setTransposeSteps] = useState(0);
  const [formErrors, setFormErrors] = useState<{ title?: string; artist?: string }>({});
  // Mobile detail tab: "lyrics" (default) or "chords"
  const [detailTab, setDetailTab] = useState<"lyrics" | "chords">("lyrics");
  // Edit form content tab
  const [editContentTab, setEditContentTab] = useState<"lyrics" | "chords">("lyrics");

  // ── Lyrics section-label renderer ────────────────────────────────────────
  // Parses raw lyrics text and renders section labels (VERSE, CHORUS, BRIDGE,
  // PRE CHORUS, OUTRO, INTRO, TAG) as styled indigo caps separate from body text.
  const renderLyrics = (text: string) => {
    if (!text) return null;
    const SECTION_RE = /^(?:VERSE|CHORUS|PRE[- ]?CHORUS|BRIDGE|OUTRO|INTRO|TAG|HOOK|INTERLUDE|REFRAIN|CODA)(\s+\d+)?\s*:?\s*$/i;
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let key = 0;
    let pendingBlank = false;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();
      if (trimmed === '') {
        pendingBlank = true;
        continue;
      }
      if (pendingBlank) {
        elements.push(<div key={key++} className="h-4" />);
        pendingBlank = false;
      }
      if (SECTION_RE.test(trimmed)) {
        elements.push(
          <p key={key++} className="text-xs font-bold uppercase tracking-widest mt-1 mb-0.5 select-none"
            style={{ color: "rgba(129,140,248,0.9)" }}>
            {trimmed.replace(/:$/, '')}
          </p>
        );
      } else {
        elements.push(
          <p key={key++} className="text-lg sm:text-xl leading-relaxed"
            style={{ color: "rgba(255,255,255,0.82)" }}>
            {raw}
          </p>
        );
      }
    }
    return <div className="space-y-0">{elements}</div>;
  };

  // ── Library mini player — state lifted to App.tsx; local helpers proxy up ──
  /** Songs that have a YouTube video_url — kept here for count / button display */
  const songsWithVideo = useMemo<LibraryTrack[]>(() =>
    allSongs
      .filter(s => !!s.video_url)
      .map(s => ({ id: s.id, title: s.title, artist: s.artist || "", videoUrl: s.video_url! })),
    [allSongs]
  );

  const openLibraryPlayer = (songId?: string) => {
    if (songsWithVideo.length === 0) return;
    const libraryStartIndex = songId ? songsWithVideo.findIndex(s => s.id === songId) : 0;
    onOpenLibraryPlayer?.(songId);
  };
  const libraryPlayerOpen = isLibraryPlayerOpen;


  // Refs for focusing fields on open
  const songTitleRef = useRef<HTMLInputElement>(null);
  const songArtistRef = useRef<HTMLInputElement>(null);
  const songLyricsWrapRef = useRef<HTMLDivElement>(null);
  const lyricsInputRef = useRef<HTMLInputElement>(null);
  const chordsInputRef = useRef<HTMLInputElement>(null);

  const lyricsHistory = useRef<string[]>([]);
  const lyricsIdx = useRef(-1);
  const chordsHistory = useRef<string[]>([]);
  const chordsIdx = useRef(-1);
  const lyricsPushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chordsPushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lyricsCanUndo, setLyricsCanUndo] = useState(false);
  const [lyricsCanRedo, setLyricsCanRedo] = useState(false);
  const [chordsCanUndo, setChordsCanUndo] = useState(false);
  const [chordsCanRedo, setChordsCanRedo] = useState(false);

  /** Push a value onto a history stack (truncate redo branch) */
  const pushHistory = (val: string, history: React.MutableRefObject<string[]>, idx: React.MutableRefObject<number>) => {
    const stack = history.current;
    // Trim redo branch
    stack.splice(idx.current + 1);
    stack.push(val);
    // Cap at 100 entries
    if (stack.length > 100) stack.shift();
    idx.current = stack.length - 1;
  };

  /** Debounced push — waits 500ms after the user stops typing */
  const pushLyricsHistory = (val: string) => {
    if (lyricsPushTimer.current) clearTimeout(lyricsPushTimer.current);
    lyricsPushTimer.current = setTimeout(() => {
      pushHistory(val, lyricsHistory, lyricsIdx);
      setLyricsCanUndo(lyricsIdx.current > 0);
      setLyricsCanRedo(lyricsIdx.current < lyricsHistory.current.length - 1);
    }, 500);
  };

  const pushChordsHistory = (val: string) => {
    if (chordsPushTimer.current) clearTimeout(chordsPushTimer.current);
    chordsPushTimer.current = setTimeout(() => {
      pushHistory(val, chordsHistory, chordsIdx);
      setChordsCanUndo(chordsIdx.current > 0);
      setChordsCanRedo(chordsIdx.current < chordsHistory.current.length - 1);
    }, 500);
  };

  const undoLyrics = () => {
    if (lyricsIdx.current <= 0) return;
    lyricsIdx.current--;
    const val = lyricsHistory.current[lyricsIdx.current];
    setEditLyrics(val);
    setLyricsCanUndo(lyricsIdx.current > 0);
    setLyricsCanRedo(true);
  };
  const redoLyrics = () => {
    if (lyricsIdx.current >= lyricsHistory.current.length - 1) return;
    lyricsIdx.current++;
    const val = lyricsHistory.current[lyricsIdx.current];
    setEditLyrics(val);
    setLyricsCanUndo(true);
    setLyricsCanRedo(lyricsIdx.current < lyricsHistory.current.length - 1);
  };
  const undoChords = () => {
    if (chordsIdx.current <= 0) return;
    chordsIdx.current--;
    const val = chordsHistory.current[chordsIdx.current];
    setEditChords(val);
    setChordsCanUndo(chordsIdx.current > 0);
    setChordsCanRedo(true);
  };
  const redoChords = () => {
    if (chordsIdx.current >= chordsHistory.current.length - 1) return;
    chordsIdx.current++;
    const val = chordsHistory.current[chordsIdx.current];
    setEditChords(val);
    setChordsCanUndo(true);
    setChordsCanRedo(chordsIdx.current < chordsHistory.current.length - 1);
  };

  /** Reset history when editing starts (opening a song or new song) */
  const resetLyricsHistory = (initial: string) => {
    lyricsHistory.current = [initial];
    lyricsIdx.current = 0;
    setLyricsCanUndo(false);
    setLyricsCanRedo(false);
  };
  const resetChordsHistory = (initial: string) => {
    chordsHistory.current = [initial];
    chordsIdx.current = 0;
    setChordsCanUndo(false);
    setChordsCanRedo(false);
  };


  const LYRICS_TEMPLATE = "Verse:\n\nPre Chorus:\n\nChorus:\n\nBridge:";
  const CHORDS_TEMPLATE = "Verse:\n\nPre Chorus:\n\nChorus:\n\nBridge:";


  // Tag form states
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("bg-gray-100 text-gray-800");

  // Song view mode: grid (default) or list
  const [songView, setSongView] = useState<"grid" | "list">(() => {
    try { return (localStorage.getItem("wf_song_view") as "grid" | "list") || "grid"; } catch { return "grid"; }
  });
  const toggleSongView = (v: "grid" | "list") => {
    setSongView(v);
    try { localStorage.setItem("wf_song_view", v); } catch { /* noop */ }
  };

  // Infinite scroll
  const BATCH_SIZE = 12;
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);


  // ── Toast notifications ──────────────────────────────────────────────

  // ── Songs cache helpers + fetch ───────────────────────────────────────────
  // ── Cache helpers ───────────────────────────────────────────────────────────
  const CACHE_KEY = "wf_songs_cache";
  const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes — matches App.tsx boot TTL

  const readCache = (): { songs: any[]; tags: any[] } | null => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const { songs, tags, ts } = JSON.parse(raw);
      if (Date.now() - ts > CACHE_TTL_MS) return null;
      return { songs, tags };
    } catch {
      return null;
    }
  };

  const writeCache = (songs: any[], tags: any[]) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ songs, tags, ts: Date.now() }));
    } catch {
      // storage quota exceeded — ignore
    }
  };

  const clearSongsCache = () => {
    try { localStorage.removeItem(CACHE_KEY); } catch { /* noop */ }
  };

  // ── Fetch: songs + tags in parallel, with localStorage cache ────────────────
  const fetchSongs = useCallback(async ({ background = false, bustCache = false } = {}) => {
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    // 1. Serve from cache immediately (stale-while-revalidate)
    // bustCache: true skips cache entirely — used after a save to guarantee fresh data
    if (!background && !bustCache) {
      const cached = readCache();
      if (cached) {
        setAllSongs(cached.songs);
        setTags(cached.tags);
        setIsLoadingSongs(false);
        // Revalidate silently in background
        fetchSongs({ background: true });
        return;
      }
      setIsLoadingSongs(true);
    }

    try {
      // 2. Fetch songs + tags in parallel
      const [songsRes, tagsRes] = await Promise.all([
        fetch("/api/songs", { signal: controller.signal }),
        fetch("/api/tags", { signal: controller.signal }),
      ]);

      const [songsData, tagsData] = await Promise.all([
        songsRes.json(),
        tagsRes.json(),
      ]);

      const songs = Array.isArray(songsData) ? songsData : [];
      const tags = Array.isArray(tagsData) ? tagsData : [];

      setAllSongs(songs);
      setTags(tags);
      writeCache(songs, tags);
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        console.error("Failed to load songs/tags", error);
showToast("error", "Failed to load songs. Please refresh.");
        if (!background) {
          setAllSongs([]);
          setTags([]);
        }
      }
    } finally {
      if (!controller.signal.aborted) setIsLoadingSongs(false);
    }
  }, []);

  // ── Fetch songs on mount ─────────────────────────────────────────────────
  useEffect(() => {
    // If App.tsx already seeded songs from cache, do a silent background refresh
    // rather than showing the loading spinner again
    if (allSongs.length > 0) {
      fetchSongs({ background: true });
    } else {
      fetchSongs();
    }
  }, []);

  const fetchTags = fetchSongs; // aliases — tags are always loaded together


  // Instant client-side filtering — no network, no stale results
  const filteredSongs = useMemo(() => {
    let result = allSongs;

    const q = debouncedQuery.trim().toLowerCase();

    // Text search across title, artist, lyrics, chords, and tags
    if (q) {
      result = result.filter(song =>
        song.title?.toLowerCase().includes(q) ||
        song.artist?.toLowerCase().includes(q) ||
        song.lyrics?.toLowerCase().includes(q) ||
        song.chords?.toLowerCase().includes(q) ||
        song.tags?.some((t: Tag) => t.name?.toLowerCase().includes(q))
      );

      // ── Relevance ranking ─────────────────────────────────────────────
      // Score: 4 = title starts with query, 3 = title contains query,
      //        2 = artist contains query, 1 = tag/lyrics match only
      const score = (song: any): number => {
        const title = song.title?.toLowerCase() ?? "";
        const artist = song.artist?.toLowerCase() ?? "";
        if (title.startsWith(q)) return 4;
        if (title.includes(q)) return 3;
        if (artist.includes(q)) return 2;
        return 1;
      };
      result = [...result].sort((a, b) => score(b) - score(a));
    }

    // Tag filters
    const tagFilters = selectedTagIds.filter(id => id !== "recently-added");
    const recentlyAdded = selectedTagIds.includes("recently-added");

    if (tagFilters.length > 0) {
      result = result.filter(song =>
        tagFilters.some(tagId => song.tags.some(t => t.id === tagId))
      );
    }

    // Sort by date only when no active text search (relevance takes precedence)
    if (recentlyAdded && !q) {
      result = [...result].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    return result;
  }, [allSongs, debouncedQuery, selectedTagIds]);

  // Visible slice for infinite scroll
  const visibleSongs = filteredSongs.slice(0, visibleCount);
  const hasMore = visibleCount < filteredSongs.length;

  // Reset visible count when search or filters change
  useEffect(() => { setVisibleCount(BATCH_SIZE); }, [debouncedQuery, selectedTagIds]);

  // IntersectionObserver: load next batch when sentinel enters view
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasMore) setVisibleCount(c => c + BATCH_SIZE); },
      { rootMargin: "200px" }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [hasMore]);


  useEffect(() => { setTransposeSteps(0); setDetailTab("lyrics"); }, [selectedSong?.id]);
  // Notify parent whenever the song detail panel opens or closes
  useEffect(() => { onSelectedSongChange?.(!!selectedSong); }, [selectedSong, onSelectedSongChange]);
  // When App.tsx increments clearSelectionSignal (via global Back button), close the detail panel
  useEffect(() => {
    if (clearSelectionSignal) setSelectedSong(null);
  }, [clearSelectionSignal]);

  // ── Prev/Next song navigation ─────────────────────────────────────────────
  const currentSongIndex = selectedSong ? filteredSongs.findIndex(s => s.id === selectedSong.id) : -1;
  const hasPrev = currentSongIndex > 0;
  const hasNext = currentSongIndex >= 0 && currentSongIndex < filteredSongs.length - 1;

  const navigateSong = (dir: "prev" | "next") => {
    if (dir === "prev" && hasPrev) setSelectedSong(filteredSongs[currentSongIndex - 1]);
    if (dir === "next" && hasNext) setSelectedSong(filteredSongs[currentSongIndex + 1]);
  };

  // Keyboard navigation (← →) when detail panel is open
  useEffect(() => {
    if (!selectedSong) return;
    const handler = (e: KeyboardEvent) => {
      // Skip if focus is inside an input, textarea, or select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft")  navigateSong("prev");
      if (e.key === "ArrowRight") navigateSong("next");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedSong, currentSongIndex, hasPrev, hasNext, filteredSongs]);


  // ── Songs handlers ────────────────────────────────────────────────────────
  const validateForm = () => {
    const errors: { title?: string; artist?: string; lyrics?: string; tags?: string } = {};
    if (!editTitle.trim()) errors.title = "Title is required.";
    if (!editArtist.trim()) errors.artist = "Artist is required.";
    if (!editLyrics.trim() || editLyrics.trim() === "Verse:\n\nPre Chorus:\n\nChorus:\n\nBridge:") errors.lyrics = "Lyrics are required.";
    if (editTags.length === 0) errors.tags = "Please select at least one tag.";
    return errors;
  };

  const handleSaveSong = async () => {
    // Validate required fields for both new songs and edits
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      // Build a readable list of what's missing
      const missing: string[] = [];
      if (errors.title)  missing.push("Song Title");
      if (errors.artist) missing.push("Artist");
      if (errors.tags)   missing.push("At least one Tag");
      if (errors.lyrics) missing.push("Lyrics");
showToast("error", `Please fill in: ${missing.join(", ")}.`);
      // Focus the first empty field
      if (errors.title)       { songTitleRef.current?.focus(); }
      else if (errors.artist) { songArtistRef.current?.focus(); }
      else if (errors.lyrics) { songLyricsWrapRef.current?.querySelector("textarea")?.focus(); }
      return;
    }
    setFormErrors({});

    const cu = getAuth().currentUser;
    const payload = {
      title: editTitle,
      artist: editArtist,
      lyrics: editLyrics,
      chords: editChords,
      tags: editTags,
      video_url: editVideoUrl,
      actorName: cu?.displayName || cu?.email?.split("@")[0] || user?.displayName || "Worship Team",
      actorPhoto: cu?.photoURL || user?.photoURL || "",
      actorUserId: cu?.uid || user?.uid || "",
    };

    try {
      let response;
      if (selectedSong?.id) {
        response = await fetch(`/api/songs/${selectedSong.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        response = await fetch("/api/songs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save song");
      }

      const isEdit = !!selectedSong?.id;
      setIsEditing(false);
      setSelectedSong(null);
      clearSongsCache();
      // bustCache: true — bypasses stale-while-revalidate so the post-save
      // fetch always hits the network and never serves old cached data
      await fetchSongs({ bustCache: true });
showToast("success", isEdit
        ? `Song "${payload.title}" updated successfully!`
        : `Song "${payload.title}" saved successfully!`
      );
    } catch (error: any) {
      console.error("Failed to save song", error);
showToast("error", error.message || "Failed to save song. Please check if Firebase is configured correctly.");
    }
  };

  const handleDeleteSong = async (id: string) => {
    const song = allSongs.find(s => s.id === id);
    showConfirm({
      title: "Delete Song",
      message: `Are you sure you want to delete "${song?.title || "this song"}"?`,
      detail: "This action cannot be undone. The song will be permanently removed from the database.",
      confirmText: "Yes, Delete",
      confirmClass: "bg-red-500 hover:bg-red-600",
      onConfirm: async () => {
        closeConfirm();
        try {
          const res = await fetch(`/api/songs/${id}`, { method: "DELETE" });
          if (!res.ok) throw new Error("Failed to delete song");

          if (selectedSong?.id === id) {
            setSelectedSong(null);
            setIsEditing(false);
          }
          clearSongsCache();
          fetchSongs();
showToast("success", "Song deleted successfully.");
        } catch (error) {
          console.error("Failed to delete song", error);
showToast("error", "Failed to delete song. Please try again.");
        }
      }
    });
  };

  const handleBulkDelete = async () => {
    if (selectedSongIds.length === 0) return;
    showConfirm({
      title: "Bulk Delete Songs",
      message: `Are you sure you want to delete ${selectedSongIds.length} selected song(s)?`,
      detail: "This will permanently remove all selected items from your directory.",
      confirmText: `Delete ${selectedSongIds.length} Songs`,
      confirmClass: "bg-red-500 hover:bg-red-600",
      onConfirm: async () => {
        closeConfirm();
        try {
          await Promise.all(selectedSongIds.map(id => fetch(`/api/songs/${id}`, { method: "DELETE" })));
          setSelectedSongIds([]);
          setIsSelectionMode(false);
          clearSongsCache();
          fetchSongs();
showToast("success", `${selectedSongIds.length} songs deleted successfully.`);
        } catch (error) {
          console.error("Failed to delete songs", error);
showToast("error", "Failed to delete some songs. Please try again.");
        }
      }
    });
  };

  const toggleSongSelection = (id: string) => {
    setSelectedSongIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName, color: newTagColor }),
      });
      setNewTagName("");
      fetchTags();
showToast("success", "Tag created!");
    } catch (error) {
      console.error("Failed to create tag", error);
showToast("error", "Failed to create tag. Try again.");
    }
  };

  const handleDeleteTag = async (id: string) => {
    showConfirm({
      title: "Delete Tag",
      message: "Are you sure you want to delete this tag?",
      detail: "This will remove the tag from all songs that use it. This action cannot be undone.",
      confirmText: "Delete Tag",
      confirmClass: "bg-red-500 hover:bg-red-600",
      onConfirm: async () => {
        closeConfirm();
        try {
          await fetch(`/api/tags/${id}`, { method: "DELETE" });
          clearSongsCache();
          fetchSongs();
showToast("success", "Tag deleted successfully.");
        } catch (error) {
          console.error("Failed to delete tag", error);
showToast("error", "Failed to delete tag.");
        }
      }
    });
  };


  // ── Songs editor functions ────────────────────────────────────────────────
  const openEditor = (song?: Song) => {
    if (song) {
      setSelectedSong(song);
      setEditTitle(song.title);
      setEditArtist(song.artist || "");
      setEditVideoUrl(song.video_url || "");
      setEditLyrics(song.lyrics);
      setEditChords(song.chords ?? "");
      setEditTags(Array.isArray(song.tags) ? song.tags.map((t) => t.id) : []);
      resetLyricsHistory(song.lyrics);
      resetChordsHistory(song.chords ?? "");
    } else {
      setSelectedSong(null);
      setEditTitle("");
      setEditArtist("");
      setEditVideoUrl("");
      setEditLyrics(LYRICS_TEMPLATE);
      setEditChords(CHORDS_TEMPLATE);
      setEditTags([]);
      resetLyricsHistory(LYRICS_TEMPLATE);
      resetChordsHistory(CHORDS_TEMPLATE);
    }
    setIsEditing(true);
    setFormErrors({});
  };

  const toggleTagSelection = (tagId: string) => {
    // Single-select: clicking active tag deselects, clicking another replaces
    setEditTags((prev) =>
      prev.includes(tagId) ? [] : [tagId]
    );
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "lyrics" | "chords") => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOcrLoading(type);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(",")[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64Data,
          mimeType: file.type,
          type
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "OCR failed on server");
      }

      const data = await response.json();
      const extractedText = data.text?.replace(/\*\*/g, "");
      if (extractedText) {
        if (type === "lyrics") {
          setEditLyrics(extractedText);
          pushHistory(extractedText, lyricsHistory, lyricsIdx);
          setLyricsCanUndo(lyricsIdx.current > 0);
          setLyricsCanRedo(false);
        } else {
          setEditChords(extractedText);
          pushHistory(extractedText, chordsHistory, chordsIdx);
          setChordsCanUndo(chordsIdx.current > 0);
          setChordsCanRedo(false);
        }
      }
    } catch (error) {
      console.error("OCR failed", error);
showToast("error", "Failed to extract text from image. Please try again.");
    } finally {
      setIsOcrLoading(null);
      if (e.target) e.target.value = "";
    }
  };

  // ── Print handler ─────────────────────────────────────────────────────────
  const handlePrint = (song: Song) => {
    const printHTML = `<!DOCTYPE html>
<html>
  <head>
    <title>${song.title}${song.artist ? ` - ${song.artist}` : ''}</title>
    <style>
      body { font-family: sans-serif; padding: 32px; line-height: 1.6; color: #111; }
      h1 { margin-bottom: 4px; font-size: 28px; }
      h2 { color: #555; margin-top: 0; font-weight: normal; margin-bottom: 24px; font-size: 18px; }
      .container { display: flex; gap: 40px; }
      .column { flex: 1; min-width: 0; }
      h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; border-bottom: 1px solid #eee; padding-bottom: 6px; margin-bottom: 12px; }
      pre { white-space: pre-wrap; font-family: inherit; font-size: 14px; margin: 0; }
      .chords pre { font-family: monospace; background: #f5f5f5; padding: 12px; border-radius: 6px; font-size: 13px; }
      @media (max-width: 500px) { .container { flex-direction: column; } }
    </style>
  </head>
  <body>
    <h1>${song.title}</h1>
    ${song.artist ? `<h2>${song.artist}</h2>` : ''}
    <div class="container">
      <div class="column"><h3>Lyrics</h3><pre>${song.lyrics || 'No lyrics added.'}</pre></div>
      <div class="column chords"><h3>Chords</h3><pre>${song.chords || 'No chords added.'}</pre></div>
    </div>
  </body>
</html>`;
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) { document.body.removeChild(iframe); return; }
    doc.open(); doc.write(printHTML); doc.close();
    setTimeout(() => {
      try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch (_) { }
      setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 1000);
    }, 300);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ══════════════════════════════════════════════════════════════
         SONG MANAGEMENT VIEW
    ══════════════════════════════════════════════════════════════ */}
      {isEditing ? (
        <div className="max-w-4xl mx-auto rounded-2xl overflow-hidden" style={{ background: "#13151f", border: "1px solid rgba(255,255,255,0.07)" }}>
          {/* Form Header */}
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(99,102,241,0.18)", boxShadow: "0 0 0 1px rgba(99,102,241,0.25)" }}>
                <Edit size={16} className="text-indigo-400" />
              </div>
              <h2 className="text-lg font-bold text-white">{selectedSong ? "Edit Song" : "New Song"}</h2>
            </div>
            <button
              onClick={() => setIsEditing(false)}
              className="w-8 h-8 flex items-center justify-center rounded-xl transition-all"
              style={{ color: "rgba(156,163,175,0.6)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(156,163,175,0.6)")}
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-4 sm:p-5 space-y-5">
            {/* Title + Artist row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Title <span style={{ color: "rgba(239,68,68,0.8)" }}>*</span>
                </label>
                <input
                  ref={songTitleRef}
                  type="text"
                  value={editTitle}
                  onChange={(e) => { setEditTitle(e.target.value); if (formErrors.title) setFormErrors(p => ({ ...p, title: undefined })); }}
                  className="w-full px-4 py-3 text-base text-white rounded-xl outline-none transition-all"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: formErrors.title ? "1px solid rgba(239,68,68,0.7)" : "1px solid rgba(255,255,255,0.09)",
                    caretColor: "#6366f1"
                  }}
                  placeholder="Song Title"
                />
                {formErrors.title && <p className="mt-1 text-xs" style={{ color: "rgba(239,68,68,0.85)" }}>{formErrors.title}</p>}
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Artist <span style={{ color: "rgba(239,68,68,0.8)" }}>*</span>
                </label>
                <input
                  ref={songArtistRef}
                  type="text"
                  value={editArtist}
                  onChange={(e) => { setEditArtist(e.target.value); if (formErrors.artist) setFormErrors(p => ({ ...p, artist: undefined })); }}
                  className="w-full px-4 py-3 text-base text-white rounded-xl outline-none transition-all"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: formErrors.artist ? "1px solid rgba(239,68,68,0.7)" : "1px solid rgba(255,255,255,0.09)",
                    caretColor: "#6366f1"
                  }}
                  placeholder="Artist Name"
                />
                {formErrors.artist && <p className="mt-1 text-xs" style={{ color: "rgba(239,68,68,0.85)" }}>{formErrors.artist}</p>}
              </div>
            </div>

            {/* Video URL */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                Video Link (YouTube / Reference)
              </label>
              <input
                type="text"
                value={editVideoUrl}
                onChange={(e) => setEditVideoUrl(e.target.value)}
                className="w-full px-4 py-3 text-base text-white rounded-xl outline-none transition-all"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", caretColor: "#6366f1" }}
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </div>

            {/* Tags — dropdown */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                Mood / Language <span style={{ color: "rgba(239,68,68,0.8)" }}>*</span>
              </label>
              <div className="relative">
                <select
                  value={editTags[0] ?? ""}
                  onChange={e => {
                    const val = e.target.value;
                    setEditTags(val ? [val] : []);
                    if (formErrors.tags) setFormErrors(p => ({ ...p, tags: undefined }));
                  }}
                  className="w-full appearance-none px-4 py-3 pr-10 text-base rounded-xl outline-none transition-all"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: formErrors.tags ? "1px solid rgba(239,68,68,0.7)" : "1px solid rgba(255,255,255,0.09)",
                    color: editTags[0] ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)",
                    caretColor: "#6366f1",
                  }}
                >
                  <option value="" style={{ background: "#13151f", color: "rgba(255,255,255,0.4)" }}>Select mood / language…</option>
                  {tags.map(tag => (
                    <option key={tag.id} value={tag.id} style={{ background: "#13151f", color: "rgba(255,255,255,0.9)" }}>
                      {tag.name}
                    </option>
                  ))}
                </select>
                {/* chevron icon */}
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.35)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>
              {formErrors.tags && <p className="mt-1 text-xs" style={{ color: "rgba(239,68,68,0.85)" }}>{formErrors.tags}</p>}
            </div>

            {/* ── Lyrics / Chords Tabbed Editor ── */}
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
              {/* Tab bar */}
              <div className="flex items-center gap-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <button
                  type="button"
                  onClick={() => setEditContentTab("lyrics")}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold tracking-wide transition-all"
                  style={editContentTab === "lyrics"
                    ? { background: "rgba(99,102,241,0.15)", color: "rgba(165,180,252,0.95)", borderBottom: "2px solid rgba(99,102,241,0.8)" }
                    : { color: "rgba(255,255,255,0.35)", borderBottom: "2px solid transparent" }}
                >
                  <BookOpen size={14} />
                  LYRICS {formErrors.lyrics && <span style={{ color: "rgba(239,68,68,0.85)" }}>*</span>}
                </button>
                <div className="w-px self-stretch" style={{ background: "rgba(255,255,255,0.06)" }} />
                <button
                  type="button"
                  onClick={() => setEditContentTab("chords")}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold tracking-wide transition-all"
                  style={editContentTab === "chords"
                    ? { background: "rgba(168,85,247,0.13)", color: "rgba(216,180,254,0.95)", borderBottom: "2px solid rgba(168,85,247,0.8)" }
                    : { color: "rgba(255,255,255,0.35)", borderBottom: "2px solid transparent" }}
                >
                  <Guitar size={14} />
                  CHORDS
                </button>
              </div>

              {/* Panel content */}
              <div className="p-4 space-y-3">
                {/* Upload zone */}
                <button
                  type="button"
                  onClick={() => editContentTab === "lyrics" ? lyricsInputRef.current?.click() : chordsInputRef.current?.click()}
                  disabled={!!isOcrLoading}
                  className="w-full group relative flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={editContentTab === "lyrics"
                    ? { border: "1.5px dashed rgba(99,102,241,0.35)", background: "rgba(99,102,241,0.05)" }
                    : { border: "1.5px dashed rgba(168,85,247,0.35)", background: "rgba(168,85,247,0.05)" }}
                  onMouseEnter={e => { if (!isOcrLoading) e.currentTarget.style.borderColor = editContentTab === "lyrics" ? "rgba(99,102,241,0.65)" : "rgba(168,85,247,0.65)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = editContentTab === "lyrics" ? "rgba(99,102,241,0.35)" : "rgba(168,85,247,0.35)"; }}
                >
                  {isOcrLoading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" style={{ color: editContentTab === "lyrics" ? "rgba(129,140,248,0.9)" : "rgba(192,132,252,0.9)" }} />
                      <span className="text-sm font-medium" style={{ color: editContentTab === "lyrics" ? "rgba(129,140,248,0.9)" : "rgba(192,132,252,0.9)" }}>Extracting text…</span>
                    </>
                  ) : (
                    <>
                      <ImagePlus size={18} style={{ color: editContentTab === "lyrics" ? "rgba(129,140,248,0.8)" : "rgba(192,132,252,0.8)" }} />
                      <span className="text-sm font-semibold text-white">Drop an image or click to upload</span>
                      <span className="ml-auto px-3 py-1 text-xs font-semibold rounded-full" style={editContentTab === "lyrics"
                        ? { background: "rgba(99,102,241,0.22)", color: "rgba(165,180,252,0.95)" }
                        : { background: "rgba(168,85,247,0.22)", color: "rgba(216,180,254,0.95)" }}>
                        Upload Screenshot
                      </span>
                    </>
                  )}
                </button>
                <input type="file" ref={lyricsInputRef} onChange={e => handleImageUpload(e, "lyrics")} className="hidden" accept="image/*" />
                <input type="file" ref={chordsInputRef} onChange={e => handleImageUpload(e, "chords")} className="hidden" accept="image/*" />

                {/* Undo / Redo toolbar */}
                <div className="flex items-center gap-1">
                  <button type="button"
                    onClick={editContentTab === "lyrics" ? undoLyrics : undoChords}
                    disabled={editContentTab === "lyrics" ? !lyricsCanUndo : !chordsCanUndo}
                    title="Undo (Ctrl+Z)"
                    className="w-8 h-8 flex items-center justify-center rounded-xl active:scale-90 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
                    style={{ color: "rgba(255,255,255,0.4)" }}
                    onMouseEnter={e => (e.currentTarget.style.color = editContentTab === "lyrics" ? "rgba(99,102,241,0.9)" : "rgba(168,85,247,0.9)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
                    <Undo2 size={15} />
                  </button>
                  <button type="button"
                    onClick={editContentTab === "lyrics" ? redoLyrics : redoChords}
                    disabled={editContentTab === "lyrics" ? !lyricsCanRedo : !chordsCanRedo}
                    title="Redo (Ctrl+Y)"
                    className="w-8 h-8 flex items-center justify-center rounded-xl active:scale-90 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
                    style={{ color: "rgba(255,255,255,0.4)" }}
                    onMouseEnter={e => (e.currentTarget.style.color = editContentTab === "lyrics" ? "rgba(99,102,241,0.9)" : "rgba(168,85,247,0.9)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
                    <Redo2 size={15} />
                  </button>
                  <span className="ml-auto text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.2)" }}>
                    {editContentTab === "lyrics" ? `${editLyrics.length} chars` : `${editChords.length} chars`}
                  </span>
                </div>

                {/* Textarea — switches per tab */}
                {editContentTab === "lyrics" ? (
                  <div className="rounded-xl overflow-hidden"
                    style={{ border: formErrors.lyrics ? "1px solid rgba(239,68,68,0.7)" : "1px solid rgba(99,102,241,0.15)" }}>
                    <AutoTextarea
                      value={editLyrics}
                      onChange={e => { setEditLyrics(e.target.value); pushLyricsHistory(e.target.value); if (formErrors.lyrics) setFormErrors(p => ({ ...p, lyrics: undefined })); }}
                      onKeyDown={e => {
                        if (e.ctrlKey || e.metaKey) {
                          if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undoLyrics(); }
                          if (e.key === "y" || (e.key === "z" && e.shiftKey)) { e.preventDefault(); redoLyrics(); }
                        }
                      }}
                      minRows={12}
                      className="w-full px-4 py-3 outline-none font-mono text-sm"
                      style={{ background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.85)", caretColor: "#6366f1" }}
                      placeholder="Paste lyrics here…"
                    />
                  </div>
                ) : (
                  <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(168,85,247,0.15)" }}>
                    <AutoTextarea
                      value={editChords}
                      onChange={e => { setEditChords(e.target.value); pushChordsHistory(e.target.value); }}
                      onKeyDown={e => {
                        if (e.ctrlKey || e.metaKey) {
                          if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undoChords(); }
                          if (e.key === "y" || (e.key === "z" && e.shiftKey)) { e.preventDefault(); redoChords(); }
                        }
                      }}
                      minRows={12}
                      className="w-full px-4 py-3 outline-none font-mono text-sm"
                      style={{ background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.85)", caretColor: "#a855f7" }}
                      placeholder="Paste chords here…"
                    />
                  </div>
                )}
                {formErrors.lyrics && editContentTab === "lyrics" && (
                  <p className="text-xs" style={{ color: "rgba(239,68,68,0.85)" }}>{formErrors.lyrics}</p>
                )}
              </div>
            </div>

            {/* Footer action row */}
            <div className="grid grid-cols-2 gap-3 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "16px" }}>
              <button
                onClick={() => setIsEditing(false)}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.09)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
                onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
              >
                <X size={15} />
                Cancel
              </button>
              <button
                onClick={handleSaveSong}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 4px 14px rgba(99,102,241,0.35)" }}
              >
                <Save size={15} />
                Save Song
              </button>
            </div>
          </div>
        </div>
      ) : selectedSong ? (
        <div className="max-w-5xl mx-auto space-y-4">

          {/* Mobile: Back to Songs — hidden on sm+ */}
          <button
            onClick={() => setSelectedSong(null)}
            className="sm:hidden flex items-center gap-1.5 text-sm font-semibold text-indigo-400 hover:text-indigo-300 transition-colors mb-4 -mt-1"
          >
            <ChevronLeft size={18} />
            <span>Back to Songs</span>
          </button>

          {/* ── Header Card ─────────────────────────────────────────────────── */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "#13151f", border: "1px solid rgba(255,255,255,0.07)" }}>

            {/* Top section: title + artist + nav + play button */}
            <div className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3 mb-5">
                {/* Left: icon chip + title/artist + nav counter */}
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: "rgba(99,102,241,0.18)", boxShadow: "0 0 0 1px rgba(99,102,241,0.25)" }}>
                    <Music size={20} className="text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    {/* Title */}
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight tracking-tight mb-0.5 line-clamp-2">
                      {selectedSong.title}
                    </h2>
                    {/* Artist */}
                    {selectedSong.artist && (
                      <p className="text-base font-medium mb-2" style={{ color: "rgba(156,163,175,0.8)" }}>
                        {selectedSong.artist}
                      </p>
                    )}
                    {/* Nav counter */}
                    {filteredSongs.length > 1 && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <button
                          onClick={() => navigateSong("prev")}
                          disabled={!hasPrev}
                          title={hasPrev ? `← ${filteredSongs[currentSongIndex - 1]?.title}` : "No previous song"}
                          className="w-6 h-6 flex items-center justify-center rounded-lg transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                          style={{ color: "rgba(99,102,241,0.8)", background: hasPrev ? "rgba(99,102,241,0.1)" : "transparent" }}
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <span className="text-[11px] font-semibold tabular-nums"
                          style={{ color: "rgba(255,255,255,0.35)" }}>
                          {currentSongIndex + 1} / {filteredSongs.length}
                        </span>
                        <button
                          onClick={() => navigateSong("next")}
                          disabled={!hasNext}
                          title={hasNext ? `${filteredSongs[currentSongIndex + 1]?.title} →` : "No next song"}
                          className="w-6 h-6 flex items-center justify-center rounded-lg transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                          style={{ color: "rgba(99,102,241,0.8)", background: hasNext ? "rgba(99,102,241,0.1)" : "transparent" }}
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: play button or action strip */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Desktop-only actions */}
                  <div className="hidden sm:flex items-center gap-1">
                    <button
                      onClick={() => handlePrint(selectedSong)}
                      title="Print"
                      className="w-8 h-8 flex items-center justify-center rounded-xl transition-all"
                      style={{ color: "rgba(156,163,175,0.6)" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "rgba(99,102,241,0.9)")}
                      onMouseLeave={e => (e.currentTarget.style.color = "rgba(156,163,175,0.6)")}
                    >
                      <Printer size={16} />
                    </button>
                    {canDeleteSong && (
                      <button
                        onClick={() => handleDeleteSong(selectedSong.id)}
                        title="Delete"
                        className="w-8 h-8 flex items-center justify-center rounded-xl transition-all"
                        style={{ color: "rgba(156,163,175,0.6)" }}
                        onMouseEnter={e => (e.currentTarget.style.color = "rgba(239,68,68,0.9)")}
                        onMouseLeave={e => (e.currentTarget.style.color = "rgba(156,163,175,0.6)")}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedSong(null)}
                      title="Close"
                      className="w-8 h-8 flex items-center justify-center rounded-xl transition-all"
                      style={{ color: "rgba(156,163,175,0.6)" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")}
                      onMouseLeave={e => (e.currentTarget.style.color = "rgba(156,163,175,0.6)")}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Info chips row */}
              <div className="grid grid-cols-2 gap-2.5">
                {/* Mood / Language */}
                <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                    MOOD / LANGUAGE
                  </p>
                  {selectedSong.tags.length > 0 ? (
                    <p className="text-sm font-bold" style={{ color: "rgba(251,191,36,0.95)" }}>
                      {selectedSong.tags.map(t => t.name).join(", ")}
                    </p>
                  ) : (
                    <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>—</p>
                  )}
                </div>
                {/* Created */}
                <div className="rounded-xl px-3 py-2.5 flex items-start justify-between" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                      CREATED
                    </p>
                    <p className="text-sm font-bold uppercase text-white">
                      {selectedSong.created_at
                        ? new Date(selectedSong.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : "—"}
                    </p>
                  </div>
                  <svg width="28" height="22" viewBox="0 0 28 22" fill="none" style={{ opacity: 0.3 }}>
                    <rect x="0" y="10" width="5" height="12" rx="1.5" fill="#6366f1" />
                    <rect x="7.5" y="5" width="5" height="17" rx="1.5" fill="#6366f1" />
                    <rect x="15" y="0" width="5" height="22" rx="1.5" fill="#6366f1" />
                    <rect x="22.5" y="8" width="5" height="14" rx="1.5" fill="#6366f1" />
                  </svg>
                </div>
              </div>

              {/* Added/Updated meta row */}
              {(() => {
                const fmtDate = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
                const fmtName = (full: string) => {
                  const parts = full.trim().split(/\s+/);
                  if (parts.length === 1) return parts[0];
                  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
                };
                const Avatar = ({ name, photo }: { name?: string; photo?: string }) => {
                  const liveMember = name ? allMembers.find(m => m.name.toLowerCase().startsWith(name.split(' ')[0].toLowerCase())) : null;
                  const src = liveMember?.photo || photo;
                  const colors = ["bg-indigo-500","bg-violet-500","bg-pink-500","bg-emerald-500","bg-amber-500","bg-sky-500"];
                  const bg = colors[(name?.charCodeAt(0) || 0) % colors.length];
                  return src
                    ? <img src={src} alt={name} className="w-4 h-4 rounded-full object-cover ring-1 shrink-0" style={{ ringColor: "rgba(255,255,255,0.15)" }} />
                    : <div className={`w-4 h-4 rounded-full ${bg} flex items-center justify-center text-white text-[8px] font-bold shrink-0`}>{(name || "?")[0].toUpperCase()}</div>;
                };
                return (
                  <div className="flex flex-col gap-0.5 mt-3 px-0.5">
                    <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                      <span className="font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>Added:</span>
                      <span>{selectedSong.created_at ? fmtDate(selectedSong.created_at) : "Unknown"}</span>
                      {selectedSong.created_by_name && (
                        <><span>·</span><Avatar name={selectedSong.created_by_name} photo={selectedSong.created_by_photo} /><span className="font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>{fmtName(selectedSong.created_by_name)}</span></>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                      <span className="font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>Updated:</span>
                      <span>{selectedSong.updated_at ? fmtDate(selectedSong.updated_at) : "Never"}</span>
                      {selectedSong.updated_by_name && (
                        <><span>·</span><Avatar name={selectedSong.updated_by_name} photo={selectedSong.updated_by_photo} /><span className="font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>{fmtName(selectedSong.updated_by_name)}</span></>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Divider */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }} />

            {/* Bottom action row */}
            <div className="flex">
              {canEditSong ? (
                <button
                  onClick={() => openEditor(selectedSong)}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold transition-all hover:bg-white/[0.04] active:bg-white/[0.07]"
                  style={{ color: "rgba(255,255,255,0.55)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.9)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.55)")}
                >
                  <Edit size={15} />
                  EDIT SONG
                </button>
              ) : (
                <div className="flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold opacity-25"
                  style={{ color: "rgba(255,255,255,0.3)" }}>
                  <Edit size={15} />
                  EDIT SONG
                </div>
              )}
            </div>
          </div>

          {/* ── Mobile Tab Bar (Lyrics / Chords) */}
          <div className="lg:hidden flex rounded-2xl p-1 gap-1" style={{ background: "#13151f", border: "1px solid rgba(255,255,255,0.07)" }}>
            <button
              onClick={() => setDetailTab("lyrics")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all ${
                detailTab === "lyrics" ? "text-white shadow-sm" : "hover:bg-white/[0.04]"
              }`}
              style={detailTab === "lyrics" ? { background: "linear-gradient(135deg, #6366f1, #8b5cf6)" } : { color: "rgba(255,255,255,0.45)" }}
            >
              <BookOpen size={16} />
              Lyrics
            </button>
            <button
              onClick={() => setDetailTab("chords")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all ${
                detailTab === "chords" ? "text-white shadow-sm" : "hover:bg-white/[0.04]"
              }`}
              style={detailTab === "chords" ? { background: "linear-gradient(135deg, #7c3aed, #a855f7)" } : { color: "rgba(255,255,255,0.45)" }}
            >
              <Guitar size={16} />
              Chords
            </button>
          </div>

          {/* ── Lyrics & Chords Panels ──────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

            {/* ── LYRICS PANEL ── */}
            <div className={`rounded-2xl overflow-hidden flex flex-col ${detailTab === "chords" ? "hidden lg:flex" : "flex"}`}
              style={{ background: "#13151f", border: "1px solid rgba(255,255,255,0.07)" }}>
              {/* Header */}
              <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-400" style={{ boxShadow: "0 0 6px rgba(99,102,241,0.7)" }} />
                  <h3 className="font-bold tracking-widest text-[11px] uppercase" style={{ color: "rgba(255,255,255,0.6)" }}>LYRICS</h3>
                </div>
                {selectedSong.lyrics && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(selectedSong.lyrics);
                      setCopiedField("lyrics");
                      setTimeout(() => setCopiedField(null), 1500);
                    }}
                    title="Copy lyrics"
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: "rgba(255,255,255,0.3)" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "rgba(99,102,241,0.9)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
                  >
                    {copiedField === "lyrics" ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
                  </button>
                )}
              </div>
              {/* Content */}
              <div className="p-4 sm:p-5 flex-1 overflow-auto">
                {selectedSong.lyrics
                  ? renderLyrics(selectedSong.lyrics)
                  : <p className="text-sm italic" style={{ color: "rgba(255,255,255,0.25)" }}>No lyrics added.</p>
                }
              </div>
            </div>

            {/* ── CHORDS PANEL ── */}
            <div className={`rounded-2xl overflow-hidden flex flex-col ${detailTab === "lyrics" ? "hidden lg:flex" : "flex"}`}
              style={{ background: "#13151f", border: "1px solid rgba(255,255,255,0.07)" }}>
              {/* Chords header with transposer */}
              <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-400" style={{ boxShadow: "0 0 6px rgba(168,85,247,0.7)" }} />
                  <h3 className="font-bold tracking-widest text-[11px] uppercase" style={{ color: "rgba(255,255,255,0.6)" }}>CHORDS</h3>
                </div>
                {selectedSong.chords && (
                  <div className="flex items-center gap-1">
                    {/* Transpose down */}
                    <button
                      onClick={() => setTransposeSteps(s => s - 1)}
                      title="Transpose down"
                      className="w-7 h-7 flex items-center justify-center rounded-lg font-bold text-base transition-all"
                      style={{ color: "rgba(168,85,247,0.8)", background: "rgba(168,85,247,0.08)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(168,85,247,0.18)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "rgba(168,85,247,0.08)")}
                    >−</button>
                    {/* Key badge */}
                    <button
                      onClick={() => setTransposeSteps(0)}
                      title="Reset to original key"
                      className="px-2.5 py-0.5 rounded-lg text-xs font-semibold min-w-[56px] text-center transition-all"
                      style={{
                        background: transposeSteps === 0 ? "rgba(255,255,255,0.06)" : "rgba(168,85,247,0.18)",
                        color: transposeSteps === 0 ? "rgba(255,255,255,0.4)" : "rgba(216,180,254,0.9)"
                      }}
                    >
                      {transposeSteps === 0 ? "Original" : transposeSteps > 0 ? `+${transposeSteps}` : `${transposeSteps}`}
                    </button>
                    {/* Transpose up */}
                    <button
                      onClick={() => setTransposeSteps(s => s + 1)}
                      title="Transpose up"
                      className="w-7 h-7 flex items-center justify-center rounded-lg font-bold text-base transition-all"
                      style={{ color: "rgba(168,85,247,0.8)", background: "rgba(168,85,247,0.08)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(168,85,247,0.18)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "rgba(168,85,247,0.08)")}
                    >+</button>
                    {/* Divider */}
                    <div className="w-px h-4 mx-1" style={{ background: "rgba(255,255,255,0.1)" }} />
                    {/* Copy transposed */}
                    <button
                      onClick={() => {
                        const text = transposeChords(selectedSong.chords!, transposeSteps);
                        navigator.clipboard.writeText(text);
                        setCopiedField("chords");
                        setTimeout(() => setCopiedField(null), 1500);
                      }}
                      title="Copy chords"
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: "rgba(255,255,255,0.3)" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "rgba(168,85,247,0.9)")}
                      onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
                    >
                      {copiedField === "chords" ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
                    </button>
                  </div>
                )}
              </div>
              {/* Content */}
              <div className="p-4 sm:p-5 flex-1 overflow-auto">
                {selectedSong.chords ? (
                  <pre className="whitespace-pre-wrap font-mono text-base sm:text-lg leading-relaxed" style={{ color: "rgba(255,255,255,0.85)" }}>
                    {transposeChords(selectedSong.chords, transposeSteps)}
                  </pre>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center py-12">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                      style={{ background: "rgba(168,85,247,0.1)" }}>
                      <Music size={22} style={{ color: "rgba(168,85,247,0.5)" }} />
                    </div>
                    <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>No chords added</p>
                    <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>Edit the song to add chord notations</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      ) : (

        <div className="space-y-3">
          {/* Filter & Search Bar */}
          {!isEditing && !selectedSong && (
            <div className="flex flex-col gap-3">
              {/* Row 1: Search + Actions */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <div className="relative flex-1 min-w-0" style={{ flexBasis: "200px" }}>
                  {/* Left icon: spinner while loading, search otherwise */}
                  {isLoadingSongs ? (
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400 animate-spin" width={18} height={18} viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  ) : (
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  )}
                  <input
                    type="text"
                    placeholder="Search by title, artist, or tags..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-10 pl-10 pr-8 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-900 transition-all outline-none dark:text-white"
                  />
                  {/* Clear button */}
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      title="Clear search"
                      aria-label="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isSelectionMode ? (
                    <>
                      <button
                        onClick={handleBulkDelete}
                        disabled={selectedSongIds.length === 0}
                        className="h-10 flex items-center gap-2 px-3 sm:px-4 text-sm bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={18} />
                        <span className="hidden sm:inline">Delete ({selectedSongIds.length})</span>
                        <span className="sm:hidden">{selectedSongIds.length}</span>
                      </button>
                      <button
                        onClick={() => { setIsSelectionMode(false); setSelectedSongIds([]); }}
                        className="h-10 flex items-center gap-2 px-3 sm:px-4 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
                      >
                        <X size={18} />
                        <span className="hidden sm:inline">Cancel</span>
                      </button>
                    </>
                  ) : (
                    <>
                      {canSelectSongs && (
                        <button
                          onClick={() => setIsSelectionMode(true)}
                          className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 rounded-xl transition-colors relative group"
                          title="Select Songs"
                        >
                          <CheckSquare size={20} />
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                            Select Songs
                          </span>
                        </button>
                      )}
                      {canAddSong && (
                        <button
                          onClick={() => openEditor()}
                          className="h-10 w-10 sm:w-36 flex items-center justify-center gap-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium shadow-sm flex-shrink-0"
                        >
                          <Plus size={16} />
                          <span className="hidden sm:inline">Add Song</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Row 2: Filter + Count + Toggle on left | Play Library on right (sm+) */}
              <div className="flex items-center gap-2">
                {/* Left group: Filter + Count + Toggle */}
                <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                  <div className="relative flex-shrink-0" ref={filterDropdownRef}>
                    <button
                      onClick={() => setIsFilterOpen(prev => !prev)}
                      className={`h-10 flex items-center gap-1.5 px-3 rounded-xl text-base font-medium border transition-all ${selectedTagIds.length > 0
                        ? "bg-indigo-600 text-white border-transparent shadow-sm"
                        : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400"
                        }`}
                    >
                      <Filter size={15} />
                      {/* Show text on sm+, icon-only on xs */}
                      <span className="hidden xs:inline sm:inline">
                        {selectedTagIds.length === 0
                          ? "Filter"
                          : `${selectedTagIds.length} Filter${selectedTagIds.length > 1 ? "s" : ""}`}
                      </span>
                      {selectedTagIds.length > 0 && (
                        <span
                          onClick={(e) => { e.stopPropagation(); setSelectedTagIds([]); }}
                          className="ml-0.5 hover:opacity-70 transition-opacity"
                          role="button"
                          title="Clear filters"
                        >
                          <X size={13} />
                        </span>
                      )}
                      <ChevronDown size={14} className={`transition-transform ${isFilterOpen ? "rotate-180" : ""}`} />
                    </button>

                    {isFilterOpen && (
                      <div className="absolute left-0 top-full mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl z-50 overflow-hidden">
                        <div className="p-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-3 py-2">Sort</p>
                          <button
                            onClick={() => setSelectedTagIds(prev =>
                              prev.includes("recently-added") ? prev.filter(id => id !== "recently-added") : [...prev, "recently-added"]
                            )}
                            className="flex items-center gap-3 w-full px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm text-gray-700 dark:text-gray-300"
                          >
                            <div className={`w-4 h-4 rounded flex items-center justify-center border-2 transition-colors shrink-0 ${selectedTagIds.includes("recently-added")
                              ? "bg-indigo-600 border-indigo-600"
                              : "border-gray-300 dark:border-gray-600"
                              }`}>
                              {selectedTagIds.includes("recently-added") && <Check size={10} className="text-white" strokeWidth={3} />}
                            </div>
                            <span>Recently Added</span>
                          </button>

                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-3 pt-3 pb-2 mt-1 border-t border-gray-100 dark:border-gray-700">Tags</p>
                          {Array.isArray(tags) && tags.map((tag) => (
                            <button
                              key={tag.id}
                              onClick={() => setSelectedTagIds(prev =>
                                prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                              )}
                              className="flex items-center gap-3 w-full px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm text-gray-700 dark:text-gray-300"
                            >
                              <div className={`w-4 h-4 rounded flex items-center justify-center border-2 transition-colors shrink-0 ${selectedTagIds.includes(tag.id)
                                ? "bg-indigo-600 border-indigo-600"
                                : "border-gray-300 dark:border-gray-600"
                                }`}>
                                {selectedTagIds.includes(tag.id) && <Check size={10} className="text-white" strokeWidth={3} />}
                              </div>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tag.color}`}>{tag.name}</span>
                            </button>
                          ))}

                          {selectedTagIds.length > 0 && (
                            <button
                              onClick={() => setSelectedTagIds([])}
                              className="w-full mt-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors font-medium border-t border-gray-100 dark:border-gray-700"
                            >
                              Clear all filters
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Total Songs Count */}
                  <div className="h-10 flex items-center text-base font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 rounded-xl whitespace-nowrap flex-shrink-0">
                    {debouncedQuery || selectedTagIds.length > 0
                      ? <><span className="hidden sm:inline">{filteredSongs.length} of {allSongs.length} {allSongs.length === 1 ? 'Song' : 'Songs'}</span><span className="sm:hidden">{filteredSongs.length} Songs</span></>
                      : <><span className="hidden sm:inline">{allSongs.length} {allSongs.length === 1 ? 'Song' : 'Songs'} Total</span><span className="sm:hidden">{allSongs.length} Songs</span></>
                    }
                  </div>
                  {/* Grid / List toggle — visible on all screens */}
                  <div className="flex h-10 items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-0.5 gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => toggleSongView("grid")}
                      title="Grid view"
                      className={`h-full px-2.5 rounded-lg transition-all flex items-center justify-center ${songView === "grid"
                        ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                        : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        }`}
                    >
                      <LayoutGrid size={16} />
                    </button>
                    <button
                      onClick={() => toggleSongView("list")}
                      title="List view"
                      className={`flex h-full px-2.5 rounded-lg transition-all items-center justify-center ${songView === "list"
                        ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                        : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        }`}
                    >
                      <List size={16} />
                    </button>
                  </div>
                </div>

                {/* Play Library — all screen sizes */}
                {songsWithVideo.length > 0 && !libraryPlayerOpen && !isLineupOpen && (
                  <div className="relative group flex-shrink-0">
                    <button
                      onClick={() => openLibraryPlayer()}
                      className="relative w-10 sm:w-36 flex items-center justify-center gap-1.5 h-10 rounded-xl text-sm font-semibold bg-emerald-500 text-white shadow-md hover:shadow-lg hover:scale-105 active:scale-95 transition-all"
                    >
                      <Play size={15} className="fill-white" />
                      <span className="hidden sm:inline">Play Library</span>
                    </button>
                    {/* Tooltip */}
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-xl">
                      {songsWithVideo.length} songs with video
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                    </div>
                  </div>
                )}
                {/* Blocked by lineup player */}
                {songsWithVideo.length > 0 && !libraryPlayerOpen && isLineupOpen && (
                  <div className="relative group flex-shrink-0">
                    <button
                      disabled
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                    >
                      <Play size={15} />
                    </button>
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-xl">
                      Close Lineup Player first
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                    </div>
                  </div>
                )}
                {libraryPlayerOpen && (
                  <div className="relative group flex-shrink-0">
                    <button
                      disabled
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                    >
                      <Play size={15} />
                    </button>
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-xl">
                      Now Playing
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                    </div>
                  </div>
                )}
              </div>


            </div>
          )}


          {/* ── GRID VIEW ─────────────────────────────────── */}
          {songView === "grid" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
              {isLoadingSongs ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm animate-pulse">
                    <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded-lg mb-3 w-3/4" />
                    <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-lg mb-4 w-1/2" />
                    <div className="flex gap-2 mb-4">
                      <div className="h-5 w-16 bg-gray-100 dark:bg-gray-700 rounded-full" />
                      <div className="h-5 w-20 bg-gray-100 dark:bg-gray-700 rounded-full" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-full" />
                      <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-5/6" />
                      <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-4/6" />
                    </div>
                  </div>
                ))
              ) : Array.isArray(filteredSongs) && visibleSongs.map((song) => (

                <div
                  key={song.id}
                  onClick={() => isSelectionMode ? toggleSongSelection(song.id) : setSelectedSong(song)}
                  className={`relative rounded-2xl border transition-all duration-200 cursor-pointer group flex flex-col overflow-hidden
                    hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/10
                    ${selectedSongIds.includes(song.id)
                      ? "bg-indigo-950/70 border-indigo-600/50 ring-2 ring-indigo-500/30"
                      : "bg-[#13151f] dark:bg-[#13151f] border-white/[0.08] shadow-md"
                    }`}
                >
                  {/* ── Card Body ── */}
                  <div className="p-4 flex flex-col flex-1">

                    {/* Row 1: Title + Artist on left, Play button on right */}
                    <div className="flex items-start justify-between gap-3 mb-5">
                      {/* Left: icon chip + title/artist stack */}
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Music note icon */}
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                          style={{ background: "rgba(99,102,241,0.18)", boxShadow: "0 0 0 1px rgba(99,102,241,0.2)" }}>
                          <Music size={18} className="text-indigo-400" />
                        </div>
                        {/* Title + Artist */}
                        <div className="min-w-0">
                          <h3 className="text-xl font-extrabold text-white leading-tight tracking-tight mb-1 line-clamp-2 group-hover:text-indigo-200 transition-colors">
                            {toSafeTitle(song.title)}
                          </h3>
                          <p className="text-sm font-medium truncate" style={{ color: "rgba(156,163,175,0.85)" }}>
                            {song.artist || <span className="italic" style={{ color: "rgba(107,114,128,0.8)" }}>Unknown Artist</span>}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Info chips: MOOD/LANGUAGE + CREATED */}
                    <div className="grid grid-cols-2 gap-2 mt-auto">
                      {/* Tags chip */}
                      <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.04)" }}>
                        <p className="text-[9px] font-bold tracking-widest text-gray-600 uppercase mb-1">Mood / Language</p>
                        <p className="text-[13px] font-bold text-amber-400 truncate leading-tight">
                          {Array.isArray(song.tags) && song.tags.length > 0
                            ? song.tags.map(t => t.name).join(" • ")
                            : <span className="text-gray-600">—</span>
                          }
                        </p>
                      </div>
                      {/* Date chip */}
                      <div className="rounded-xl px-3 py-2.5 flex items-center justify-between gap-1" style={{ background: "rgba(255,255,255,0.04)" }}>
                        <div className="min-w-0">
                          <p className="text-[9px] font-bold tracking-widest text-gray-600 uppercase mb-1">Created</p>
                          <p className="text-[13px] font-bold text-white leading-tight">
                            {song.created_at
                              ? new Date(song.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
                              : "—"}
                          </p>
                        </div>
                        <BarChart2 size={20} className="text-indigo-500/60 shrink-0" />
                      </div>
                    </div>

                  </div>

                  {/* ── Action bar ── */}
                  {!isSelectionMode && (
                    <div className="flex items-stretch border-t border-white/[0.06]" style={{ background: "rgba(255,255,255,0.025)" }}
                      onClick={e => e.stopPropagation()}>
                      {canEditSong && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); song.video_url ? onOpenVideo?.(song.video_url) : undefined; }}
                            disabled={!song.video_url}
                            className="flex-1 flex items-center justify-center gap-1.5 py-3.5 text-[11px] font-bold tracking-widest uppercase transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            style={{ color: song.video_url ? "rgba(129,140,248,0.9)" : "rgba(156,163,175,0.4)" }}
                            onMouseEnter={e => { if (song.video_url) e.currentTarget.style.color = "rgba(255,255,255,0.9)"; }}
                            onMouseLeave={e => { e.currentTarget.style.color = song.video_url ? "rgba(129,140,248,0.9)" : "rgba(156,163,175,0.4)"; }}
                          >
                            <Play size={13} className={song.video_url ? "fill-current" : ""} />
                            Watch Video
                          </button>
                          <div className="w-px bg-white/[0.06] self-stretch" />
                        </>
                      )}
                      <AddToPlaylistBarBtn song={song} showToast={showToast} />
                    </div>
                  )}
                  {isSelectionMode && (
                    <div className="absolute top-3 right-3">
                      {selectedSongIds.includes(song.id)
                        ? <div className="bg-indigo-600 text-white p-1.5 rounded-lg"><Check size={14} /></div>
                        : <div className="w-6 h-6 rounded-lg border-2 border-white/20" />}
                    </div>
                  )}
                </div>
              ))}
              {!isLoadingSongs && (!Array.isArray(filteredSongs) || filteredSongs.length === 0) && (
                <div className="col-span-full py-12 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 mb-4"><Search size={32} /></div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No songs found</h3>
                  <p className="text-gray-500 dark:text-gray-400">{debouncedQuery ? `No results for "${debouncedQuery}". Try a different search.` : "Try adjusting your search or filter."}</p>
                  {debouncedQuery && <button onClick={() => setSearchQuery("")} className="mt-3 px-4 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl transition-colors font-medium">Clear search</button>}
                </div>
              )}
              {/* Infinite scroll sentinel — grid */}
              {!isLoadingSongs && hasMore && (
                <div ref={sentinelRef} className="col-span-full flex justify-center py-6">
                  <div className="flex gap-1.5 items-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              {!isLoadingSongs && !hasMore && filteredSongs.length > BATCH_SIZE && (
                <p className="col-span-full text-center text-xs text-gray-400 dark:text-gray-500 py-4">All {filteredSongs.length} songs loaded</p>
              )}
            </div>
          )}

          {/* ── LIST VIEW ─────────────────────────────────── */}
          {songView === "list" && (
            <div className="flex flex-col gap-0.5">
              {/* List header */}
              {!isLoadingSongs && Array.isArray(filteredSongs) && filteredSongs.length > 0 && (
                <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 pb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500">
                  <span>Title / Artist</span>
                  <span className="w-44 text-left">Tags</span>
                  <span className="w-28 text-left">Added</span>
                  <span className="w-16" />
                </div>
              )}

              {isLoadingSongs ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-xl animate-pulse">
                    <div className="flex-1 space-y-1.5">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/5" />
                      <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-1/4" />
                    </div>
                    <div className="h-5 w-20 bg-gray-100 dark:bg-gray-700 rounded-full" />
                    <div className="h-3 w-24 bg-gray-100 dark:bg-gray-700 rounded" />
                  </div>
                ))
              ) : Array.isArray(filteredSongs) && visibleSongs.map((song) => (

                <div
                  key={song.id}
                  onClick={() => isSelectionMode ? toggleSongSelection(song.id) : setSelectedSong(song)}
                  className={`flex sm:grid sm:grid-cols-[1fr_auto_auto_auto] items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 rounded-xl border cursor-pointer group transition-all duration-150 ${
                    selectedSongIds.includes(song.id)
                      ? "border-indigo-600/50 ring-1 ring-indigo-500/30"
                      : "border-white/[0.06] hover:border-indigo-500/30 hover:bg-white/[0.02]"
                  }`}
                  style={{ background: selectedSongIds.includes(song.id) ? "rgba(99,102,241,0.12)" : "#13151f" }}
                >
                  {/* Selection checkbox */}
                  {isSelectionMode && (
                    <div className="shrink-0">
                      {selectedSongIds.includes(song.id)
                        ? <div className="bg-indigo-600 text-white p-1 rounded-md"><Check size={14} /></div>
                        : <div className="border-2 border-white/20 rounded-md w-5 h-5" style={{ background: "rgba(255,255,255,0.04)" }} />}
                    </div>
                  )}

                  {/* Col 1: Icon chip + Title + Artist */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center"
                      style={{ background: "rgba(99,102,241,0.18)", boxShadow: "0 0 0 1px rgba(99,102,241,0.2)" }}
                    >
                      <Music size={15} className="text-indigo-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-white group-hover:text-indigo-300 transition-colors truncate tracking-tight leading-snug">
                        {toSafeTitle(song.title)}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {song.artist && (
                          <span className="text-[11px] text-indigo-400 font-semibold truncate">{song.artist}</span>
                        )}
                        {/* Tags inline on mobile only */}
                        {Array.isArray(song.tags) && song.tags.length > 0 && (
                          <span className="sm:hidden inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border"
                            style={{
                              background: "rgba(255,255,255,0.04)",
                              borderColor: "rgba(255,255,255,0.1)",
                              color: "rgba(251,191,36,0.9)"
                            }}>
                            {song.tags.map(t => t.name).join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Col 2: Tags — desktop only */}
                  <div className="hidden sm:block w-44 shrink-0">
                    {Array.isArray(song.tags) && song.tags.length > 0 ? (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold border"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          borderColor: "rgba(255,255,255,0.1)",
                          color: "rgba(251,191,36,0.9)"
                        }}>
                        {song.tags.map(t => t.name).join(", ")}
                      </span>
                    ) : (
                      <span className="text-gray-600 text-[11px]">—</span>
                    )}
                  </div>

                  {/* Col 3: Date — desktop only */}
                  <p className="hidden sm:block text-[11px] w-28 whitespace-nowrap tabular-nums" style={{ color: "rgba(156,163,175,0.7)" }}>
                    {song.created_at ? new Date(song.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : "—"}
                  </p>

                  {/* Col 4: Actions */}
                  <div className="flex items-center justify-end gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                    {!isSelectionMode && <AddToPlaylistBtn song={song} showToast={showToast} />}
                    {song.video_url && !isSelectionMode && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onOpenVideo?.(song.video_url!); }}
                        title="Watch Video"
                        className="w-8 h-8 flex items-center justify-center rounded-full transition-all hover:scale-105 active:scale-95 shrink-0"
                        style={{
                          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                          boxShadow: "0 2px 10px rgba(99,102,241,0.4)"
                        }}
                      >
                        <Play size={13} className="text-white fill-white ml-0.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {!isLoadingSongs && (!Array.isArray(filteredSongs) || filteredSongs.length === 0) && (
                <div className="py-12 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 mb-4"><Search size={32} /></div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No songs found</h3>
                  <p className="text-gray-500 dark:text-gray-400">{debouncedQuery ? `No results for "${debouncedQuery}". Try a different search.` : "Try adjusting your search or filter."}</p>
                  {debouncedQuery && <button onClick={() => setSearchQuery("")} className="mt-3 px-4 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl transition-colors font-medium">Clear search</button>}
                </div>
              )}
              {/* Infinite scroll sentinel — list */}
              {!isLoadingSongs && hasMore && (
                <div ref={sentinelRef} className="flex justify-center py-6">
                  <div className="flex gap-1.5 items-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              {!isLoadingSongs && !hasMore && filteredSongs.length > BATCH_SIZE && (
                <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-4">All {filteredSongs.length} songs loaded</p>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
