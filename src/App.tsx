import React, { useState, useEffect, useRef } from "react";
import { Music, Search, Plus, Edit, Trash2, X, Save, Tag as TagIcon, Menu, ChevronLeft, ChevronRight, Moon, Sun, ImagePlus, Loader2, Youtube, ExternalLink, Printer, CheckSquare, Square, Check } from "lucide-react";
import { Song, Tag } from "./types";

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

export default function App() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Form states
  const [editTitle, setEditTitle] = useState("");
  const [editArtist, setEditArtist] = useState("");
  const [editVideoUrl, setEditVideoUrl] = useState("");
  const [editLyrics, setEditLyrics] = useState("");
  const [editChords, setEditChords] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [isOcrLoading, setIsOcrLoading] = useState<"lyrics" | "chords" | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>([]);

  const lyricsInputRef = useRef<HTMLInputElement>(null);
  const chordsInputRef = useRef<HTMLInputElement>(null);

  const LYRICS_TEMPLATE = "Verse:\n\nPre Chorus:\n\nChorus:\n\nBridge:";
  const CHORDS_TEMPLATE = "Verse:\n\nPre Chorus:\n\nChorus:\n\nBridge:";

  // Tag form states
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("bg-gray-100 text-gray-800");

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    fetchTags();
  }, []);

  useEffect(() => {
    fetchSongs();
  }, [searchQuery, selectedTagId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isSelectionMode) {
          setIsSelectionMode(false);
          setSelectedSongIds([]);
        } else if (selectedSong) {
          setSelectedSong(null);
        } else if (isEditing) {
          setIsEditing(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSelectionMode, selectedSong, isEditing]);

  const handlePrint = (song: Song) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>${song.title} - ${song.artist}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; line-height: 1.6; }
            h1 { margin-bottom: 5px; }
            h2 { color: #666; margin-top: 0; font-weight: normal; margin-bottom: 20px; }
            .container { display: flex; gap: 40px; }
            .column { flex: 1; }
            pre { white-space: pre-wrap; font-family: inherit; }
            .chords { font-family: monospace; background: #f9f9f9; padding: 15px; border-radius: 5px; }
            @media print {
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>${song.title}</h1>
          ${song.artist ? `<h2>${song.artist}</h2>` : ''}
          <div class="container">
            <div class="column">
              <h3>Lyrics</h3>
              <pre>${song.lyrics || 'No lyrics'}</pre>
            </div>
            <div class="column">
              <h3>Chords</h3>
              <pre class="chords">${song.chords || 'No chords'}</pre>
            </div>
          </div>
          <script>
            window.onload = () => {
              window.print();
              window.onafterprint = () => window.close();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const fetchSongs = async () => {
    try {
      const url = new URL("/api/songs", window.location.origin);
      if (searchQuery) url.searchParams.append("search", searchQuery);
      if (selectedTagId && selectedTagId !== "recently-added") url.searchParams.append("tagId", selectedTagId);

      const res = await fetch(url.toString());
      const data = await res.json();
      if (Array.isArray(data)) {
        let processedSongs = data;
        if (selectedTagId === "recently-added") {
          processedSongs = [...data].sort((a, b) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return dateB - dateA;
          });
        }
        setSongs(processedSongs);
      } else {
        setSongs([]);
      }
    } catch (error) {
      console.error("Failed to fetch songs", error);
      setSongs([]);
    }
  };

  const fetchTags = async () => {
    try {
      const res = await fetch("/api/tags");
      const data = await res.json();
      if (Array.isArray(data)) {
        setTags(data);
      } else {
        setTags([]);
      }
    } catch (error) {
      console.error("Failed to fetch tags", error);
      setTags([]);
    }
  };


  const handleSaveSong = async () => {
    const payload = {
      title: editTitle,
      artist: editArtist,
      lyrics: editLyrics,
      chords: editChords,
      tags: editTags,
      video_url: editVideoUrl,
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

      setIsEditing(false);
      setSelectedSong(null);
      fetchSongs();
    } catch (error: any) {
      console.error("Failed to save song", error);
      alert(error.message || "Failed to save song. Please check if Firebase is configured correctly.");
    }
  };

  const handleDeleteSong = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this song?")) return;
    try {
      const res = await fetch(`/api/songs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete song");

      if (selectedSong?.id === id) {
        setSelectedSong(null);
        setIsEditing(false);
      }
      fetchSongs();
    } catch (error) {
      console.error("Failed to delete song", error);
      alert("Failed to delete song. Please try again.");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedSongIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedSongIds.length} selected song(s)?`)) return;

    try {
      await Promise.all(selectedSongIds.map(id => fetch(`/api/songs/${id}`, { method: "DELETE" })));
      setSelectedSongIds([]);
      setIsSelectionMode(false);
      fetchSongs();
    } catch (error) {
      console.error("Failed to delete songs", error);
      alert("Failed to delete some songs. Please try again.");
    }
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
    } catch (error) {
      console.error("Failed to create tag", error);
    }
  };

  const handleDeleteTag = async (id: string) => {
    if (!confirm("Are you sure you want to delete this tag?")) return;
    try {
      await fetch(`/api/tags/${id}`, { method: "DELETE" });
      fetchTags();
      fetchSongs();
    } catch (error) {
      console.error("Failed to delete tag", error);
    }
  };

  const openEditor = (song?: Song) => {
    if (song) {
      setSelectedSong(song);
      setEditTitle(song.title);
      setEditArtist(song.artist || "");
      setEditVideoUrl(song.video_url || "");
      setEditLyrics(song.lyrics);
      setEditChords(song.chords);
      setEditTags(Array.isArray(song.tags) ? song.tags.map((t) => t.id) : []);
    } else {
      setSelectedSong(null);
      setEditTitle("");
      setEditArtist("");
      setEditVideoUrl("");
      setEditLyrics(LYRICS_TEMPLATE);
      setEditChords(CHORDS_TEMPLATE);
      setEditTags([]);
    }
    setIsEditing(true);
  };

  const toggleTagSelection = (tagId: string) => {
    setEditTags((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
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
        } else {
          setEditChords(extractedText);
        }
      }
    } catch (error) {
      console.error("OCR failed", error);
      alert("Failed to extract text from image. Please try again.");
    } finally {
      setIsOcrLoading(null);
      if (e.target) e.target.value = "";
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 font-sans text-gray-900 dark:text-gray-100 overflow-hidden">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed lg:static inset-y-0 left-0 z-30 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col transition-all duration-300 transform ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${isSidebarCollapsed ? "w-20" : "w-64"}`}>

        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between h-16">
          <div className={`flex items-center gap-2 overflow-hidden whitespace-nowrap ${isSidebarCollapsed ? "justify-center w-full" : ""}`}>
            <Music className="text-indigo-600 dark:text-indigo-400 shrink-0" size={24} />
            {!isSidebarCollapsed && <span className="text-xl font-bold dark:text-white">WorshipFlow</span>}
          </div>
          <button
            className="lg:hidden p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          <div>
            {!isSidebarCollapsed && (
              <p className="px-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Worship</p>
            )}
            <button
              onClick={() => { setIsMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors bg-indigo-50 text-indigo-700 font-medium dark:bg-indigo-900/50 dark:text-indigo-300 ${isSidebarCollapsed ? "justify-center" : ""}`}
              title="Song Management"
            >
              <Music size={20} className="shrink-0" />
              {!isSidebarCollapsed && <span>Song Management</span>}
            </button>
          </div>
        </nav>

        <div className="p-3 border-t border-gray-200 dark:border-gray-800 flex flex-col items-center gap-2">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="flex w-full items-center justify-center p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="hidden lg:flex w-full items-center justify-center p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            {isSidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
          <div className="text-xs text-gray-400 font-mono">
            {isSidebarCollapsed ? "v1.6.1" : "Version 1.6.1"}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-4 flex items-center gap-4 h-16 shrink-0">
          <button
            className="lg:hidden p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu size={20} />
          </button>

          <div className="flex-1 flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Song Management</h1>
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
              {songs.length} {songs.length === 1 ? 'Song' : 'Songs'} Total
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
          <div className="flex flex-col h-full">
            <div className="flex-1 p-4 sm:p-6 overflow-auto">
              {isEditing ? (
                <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold">{selectedSong ? "Edit Song" : "New Song"}</h2>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                    >
                      <X size={24} />
                    </button>
                  </div>

                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                          placeholder="Song Title"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Artist</label>
                        <input
                          type="text"
                          value={editArtist}
                          onChange={(e) => setEditArtist(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                          placeholder="Artist Name"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Video Link (YouTube/Reference)</label>
                      <input
                        type="text"
                        value={editVideoUrl}
                        onChange={(e) => setEditVideoUrl(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                        placeholder="https://www.youtube.com/watch?v=..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tags</label>
                      <div className="flex flex-wrap gap-2">
                        {tags.map((tag) => (
                          <button
                            key={tag.id}
                            onClick={() => toggleTagSelection(tag.id)}
                            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium transition-colors border ${editTags.includes(tag.id)
                                ? `${tag.color} border-transparent`
                                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                              }`}
                          >
                            <TagIcon size={14} />
                            {tag.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Lyrics</label>
                          <button
                            type="button"
                            onClick={() => lyricsInputRef.current?.click()}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                            disabled={!!isOcrLoading}
                          >
                            {isOcrLoading === "lyrics" ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <ImagePlus size={14} />
                            )}
                            <span>Upload Screenshot</span>
                          </button>
                          <input
                            type="file"
                            ref={lyricsInputRef}
                            onChange={(e) => handleImageUpload(e, "lyrics")}
                            className="hidden"
                            accept="image/*"
                          />
                        </div>
                        <textarea
                          value={editLyrics}
                          onChange={(e) => setEditLyrics(e.target.value)}
                          rows={15}
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none font-sans resize-none"
                          placeholder="Paste lyrics here..."
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Chords</label>
                          <button
                            type="button"
                            onClick={() => chordsInputRef.current?.click()}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                            disabled={!!isOcrLoading}
                          >
                            {isOcrLoading === "chords" ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <ImagePlus size={14} />
                            )}
                            <span>Upload Screenshot</span>
                          </button>
                          <input
                            type="file"
                            ref={chordsInputRef}
                            onChange={(e) => handleImageUpload(e, "chords")}
                            className="hidden"
                            accept="image/*"
                          />
                        </div>
                        <textarea
                          value={editChords}
                          onChange={(e) => setEditChords(e.target.value)}
                          rows={15}
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none font-mono text-sm resize-none"
                          placeholder="Paste chords here..."
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                      <button
                        onClick={() => setIsEditing(false)}
                        className="px-6 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 font-medium transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveSong}
                        disabled={!editTitle.trim()}
                        className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Save size={18} />
                        Save Song
                      </button>
                    </div>
                  </div>
                </div>
              ) : selectedSong ? (
                <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 sm:p-8">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
                    <div>
                      <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1">{selectedSong.title}</h2>
                      {selectedSong.artist && (
                        <p className="text-lg text-indigo-600 dark:text-indigo-400 font-medium mb-1">
                          {selectedSong.artist}
                        </p>
                      )}
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                        Added on {selectedSong.created_at ? new Date(selectedSong.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : "Unknown date"}
                      </p>
                      <p className="text-xs text-indigo-500 dark:text-indigo-400 mb-3 font-medium">
                        Last updated: {selectedSong.updated_at ? new Date(selectedSong.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : "Never"}
                      </p>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {selectedSong.tags.map((tag) => (
                          <span key={tag.id} className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${tag.color}`}>
                            {tag.name}
                          </span>
                        ))}
                      </div>
                      {selectedSong.video_url && (
                        <a
                          href={selectedSong.video_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors text-sm font-medium mb-4"
                        >
                          <CustomVideoBtnIcon size={20} />
                          Watch Reference Video
                          <ExternalLink size={14} className="opacity-50" />
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        onClick={() => handlePrint(selectedSong)}
                        className="p-2 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 rounded-xl transition-colors relative group"
                      >
                        <Printer size={20} />
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                          Print
                        </span>
                      </button>
                      <button
                        onClick={() => openEditor(selectedSong)}
                        className="p-2 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 rounded-xl transition-colors relative group"
                      >
                        <Edit size={20} />
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                          Edit
                        </span>
                      </button>
                      <button
                        onClick={() => handleDeleteSong(selectedSong.id)}
                        className="p-2 text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/50 rounded-xl transition-colors relative group"
                      >
                        <Trash2 size={20} />
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                          Delete
                        </span>
                      </button>
                      <button
                        onClick={() => setSelectedSong(null)}
                        className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors sm:ml-2 relative group"
                      >
                        <X size={20} />
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                          Close
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border-t border-gray-200 dark:border-gray-700">
                    <div className="p-6 sm:p-8 lg:border-r border-gray-200 dark:border-gray-700">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">
                        Lyrics
                      </h3>
                      <pre className="whitespace-pre-wrap font-sans text-gray-700 dark:text-gray-300 leading-relaxed text-base sm:text-lg">
                        {selectedSong.lyrics || "No lyrics added."}
                      </pre>
                    </div>
                    <div className="p-6 sm:p-8">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">
                        Chords
                      </h3>
                      <pre className="whitespace-pre-wrap font-mono text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        {selectedSong.chords || "No chords added."}
                      </pre>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Filter & Search Bar */}
                  {!isEditing && !selectedSong && (
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="flex items-center gap-2 overflow-x-auto pb-2 lg:pb-0 scrollbar-hide">
                        <button
                          onClick={() => setSelectedTagId(null)}
                          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap border ${selectedTagId === null
                              ? "bg-indigo-600 text-white border-transparent"
                              : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                            }`}
                        >
                          All Songs
                        </button>
                        <button
                          onClick={() => setSelectedTagId("recently-added")}
                          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap border ${selectedTagId === "recently-added"
                              ? "bg-indigo-600 text-white border-transparent"
                              : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                            }`}
                        >
                          Recently Added
                        </button>
                        {Array.isArray(tags) && tags.map((tag) => (
                          <button
                            key={tag.id}
                            onClick={() => setSelectedTagId(tag.id === selectedTagId ? null : tag.id)}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap border ${selectedTagId === tag.id
                                ? `${tag.color} border-transparent shadow-sm`
                                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                              }`}
                          >
                            {tag.name}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="relative flex-1 sm:w-64">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                          <input
                            type="text"
                            placeholder="Search by title, artist, or tags..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-900 transition-all outline-none text-sm dark:text-white"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          {isSelectionMode ? (
                            <>
                              <button
                                onClick={handleBulkDelete}
                                disabled={selectedSongIds.length === 0}
                                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-medium shadow-sm text-sm shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Trash2 size={18} />
                                <span>Delete ({selectedSongIds.length})</span>
                              </button>
                              <button
                                onClick={() => {
                                  setIsSelectionMode(false);
                                  setSelectedSongIds([]);
                                }}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium text-sm shrink-0"
                              >
                                <X size={18} />
                                <span>Cancel</span>
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => setIsSelectionMode(true)}
                                className="p-2 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 rounded-xl transition-colors relative group"
                                title="Select Songs"
                              >
                                <CheckSquare size={20} />
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                                  Select Songs
                                </span>
                              </button>
                              <button
                                onClick={() => openEditor()}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium shadow-sm text-sm shrink-0"
                              >
                                <Plus size={18} />
                                <span>Add Song</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                    {Array.isArray(songs) && songs.map((song) => (
                      <div
                        key={song.id}
                        onClick={() => isSelectionMode ? toggleSongSelection(song.id) : setSelectedSong(song)}
                        className={`bg-white dark:bg-gray-800 rounded-2xl p-6 border transition-all cursor-pointer group flex flex-col h-full relative ${selectedSongIds.includes(song.id)
                            ? "border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900 shadow-md"
                            : "border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-500"
                          }`}
                      >
                        {isSelectionMode && (
                          <div className="absolute top-4 right-4 z-10">
                            {selectedSongIds.includes(song.id) ? (
                              <div className="bg-indigo-600 text-white p-1 rounded-md">
                                <Check size={16} />
                              </div>
                            ) : (
                              <div className="bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 p-1 rounded-md w-6 h-6" />
                            )}
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-2 mb-0.5">
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1">
                            {song.title}
                          </h3>
                          {!isSelectionMode && (
                            <div className="flex items-center gap-1 shrink-0">
                              {song.video_url && (
                                <a
                                  href={song.video_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors relative group/tooltip"
                                >
                                  <CustomYoutubeIcon size={24} />
                                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                                    Watch Video
                                  </span>
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                        {song.artist && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">
                            {song.artist}
                          </p>
                        )}
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-3 uppercase tracking-wider font-medium">
                          {song.created_at ? new Date(song.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : ""}
                        </p>
                        <div className="flex flex-wrap gap-2 mb-4">
                          {Array.isArray(song.tags) && song.tags.slice(0, 3).map((tag) => (
                            <span key={tag.id} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tag.color}`}>
                              {tag.name}
                            </span>
                          ))}
                          {Array.isArray(song.tags) && song.tags.length > 3 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                              +{song.tags.length - 3}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-3 mt-auto">
                          {song.lyrics}
                        </p>
                      </div>
                    ))}
                    {(!Array.isArray(songs) || songs.length === 0) && (
                      <div className="col-span-full py-12 text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 mb-4">
                          <Search size={32} />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No songs found</h3>
                        <p className="text-gray-500 dark:text-gray-400">Try adjusting your search or filter.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
