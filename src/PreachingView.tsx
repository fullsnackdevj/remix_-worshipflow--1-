import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Mic2, BookOpen, Plus, Save, Clock, FileText, ChevronDown,
  ChevronUp, Trash2, X, BookMarked, Lightbulb, Heart, Star,
  PlusCircle, Check, Loader2, RefreshCw, List, GripVertical, CalendarDays,
  ChevronLeft, ChevronRight, PanelRight, PanelLeft, CornerDownLeft, Eye, EyeOff, Printer, PenLine,
  SendHorizonal, CheckCircle2, Info, AlertTriangle,
} from "lucide-react";
import DatePicker from "./DatePicker";

// ── Types ─────────────────────────────────────────────────────────────────────
// Detects if user typed/pasted 2+ verse references into one field.
// Triggers when there's a newline followed by what looks like a new bible reference.
function hasMultipleVerses(text: string): boolean {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  // A bible verse line typically starts with: optional number prefix, book name, space, digits
  const versePattern = /^(?:\d\s)?[A-Z][a-zA-Z]+\s+\d/;
  return lines.slice(1).some(l => versePattern.test(l));
}
interface BibleVerse { verse: number; text: string; }
interface CollectedVerse { ref: string; text: string; translation: string; }
interface KeyPoint {
  id: string;
  heading: string;
  scripture: string; // legacy compat
  scriptures: Array<{ id: string; text: string }>; // multi-scripture
  body: string;
  bodyHidden?: boolean;
}
interface SermonDraft {
  id: string;
  title: string;
  subtitle: string;
  mainVerse: string; // kept for backward compat; prefer scriptures[]
  scriptures: Array<{ id: string; text: string }>; // multi-scripture support
  introduction: string;
  mainPassage: string;
  keyPointsTitle: string;
  keyPoints: KeyPoint[];
  freeNotes: string;
  application: string;
  closingPrayer: string;
  collectedVerses: CollectedVerse[];
  authorId: string;
  authorName: string;
  scheduledDate: string;
  serviceType: string;
  previewHidden: { serviceInfo?: boolean; titleSection?: boolean; introduction?: boolean; mainPassage?: boolean; keyPoints?: boolean; freeNotes?: boolean; collectedVerses?: boolean; application?: boolean; closingPrayer?: boolean; };
  createdAt: string;
  updatedAt: string;
  status?: 'draft' | 'submitted';
  submissionVersion?: number; // increments each time the draft is re-submitted
  // ── Design volunteer fields (set by Audio/Tech team) ──
  designStatus?: 'pending' | 'in_design' | 'design_done';
  designerId?: string;
  designerName?: string;
  designerPhoto?: string;
  designClaimedAt?: string;
  designCompletedAt?: string;
}

// ── Field targeting for verse insertion ──────────────────────────────────────
type FieldTarget =
  | { type: "draft"; field: keyof SermonDraft; scriptureIdx?: number }
  | { type: "kp"; kpId: string; kpField: "heading" | "scripture" | "body"; kpScriptureIdx?: number };

// ── Bible Books ────────────────────────────────────────────────────────────────
const BIBLE_BOOKS = [
  { name: "Genesis", chapters: 50 }, { name: "Exodus", chapters: 40 },
  { name: "Leviticus", chapters: 27 }, { name: "Numbers", chapters: 36 },
  { name: "Deuteronomy", chapters: 34 }, { name: "Joshua", chapters: 24 },
  { name: "Judges", chapters: 21 }, { name: "Ruth", chapters: 4 },
  { name: "1 Samuel", chapters: 31 }, { name: "2 Samuel", chapters: 24 },
  { name: "1 Kings", chapters: 22 }, { name: "2 Kings", chapters: 25 },
  { name: "1 Chronicles", chapters: 29 }, { name: "2 Chronicles", chapters: 36 },
  { name: "Ezra", chapters: 10 }, { name: "Nehemiah", chapters: 13 },
  { name: "Esther", chapters: 10 }, { name: "Job", chapters: 42 },
  { name: "Psalms", chapters: 150 }, { name: "Proverbs", chapters: 31 },
  { name: "Ecclesiastes", chapters: 12 }, { name: "Song of Solomon", chapters: 8 },
  { name: "Isaiah", chapters: 66 }, { name: "Jeremiah", chapters: 52 },
  { name: "Lamentations", chapters: 5 }, { name: "Ezekiel", chapters: 48 },
  { name: "Daniel", chapters: 12 }, { name: "Hosea", chapters: 14 },
  { name: "Joel", chapters: 3 }, { name: "Amos", chapters: 9 },
  { name: "Obadiah", chapters: 1 }, { name: "Jonah", chapters: 4 },
  { name: "Micah", chapters: 7 }, { name: "Nahum", chapters: 3 },
  { name: "Habakkuk", chapters: 3 }, { name: "Zephaniah", chapters: 3 },
  { name: "Haggai", chapters: 2 }, { name: "Zechariah", chapters: 14 },
  { name: "Malachi", chapters: 4 },
  { name: "Matthew", chapters: 28 }, { name: "Mark", chapters: 16 },
  { name: "Luke", chapters: 24 }, { name: "John", chapters: 21 },
  { name: "Acts", chapters: 28 }, { name: "Romans", chapters: 16 },
  { name: "1 Corinthians", chapters: 16 }, { name: "2 Corinthians", chapters: 13 },
  { name: "Galatians", chapters: 6 }, { name: "Ephesians", chapters: 6 },
  { name: "Philippians", chapters: 4 }, { name: "Colossians", chapters: 4 },
  { name: "1 Thessalonians", chapters: 5 }, { name: "2 Thessalonians", chapters: 3 },
  { name: "1 Timothy", chapters: 6 }, { name: "2 Timothy", chapters: 4 },
  { name: "Titus", chapters: 3 }, { name: "Philemon", chapters: 1 },
  { name: "Hebrews", chapters: 13 }, { name: "James", chapters: 5 },
  { name: "1 Peter", chapters: 5 }, { name: "2 Peter", chapters: 3 },
  { name: "1 John", chapters: 5 }, { name: "2 John", chapters: 1 },
  { name: "3 John", chapters: 1 }, { name: "Jude", chapters: 1 },
  { name: "Revelation", chapters: 22 },
];

const TRANSLATIONS = [
  { label: "NIV",  slug: "NIV",    api: "bgw", full: "New International Version" },
  { label: "NLT",  slug: "NLT",    api: "bgw", full: "New Living Translation" },
  { label: "ESV",  slug: "ESV",    api: "bgw", full: "English Standard Version" },
  { label: "ERV",  slug: "ERV",    api: "bgw", full: "Easy-to-Read Version" },
  { label: "AMP",  slug: "AMP",    api: "bgw", full: "Amplified Bible" },
  { label: "MBB",  slug: "MBBTAG", api: "bgw", full: "Magandang Balita Biblia" },
];

// Tagalog book names for MBB (Magandang Balita Biblia) — same order as BIBLE_BOOKS
const MBB_BOOK_NAMES = [
  "Genesis", "Exodo", "Levitico", "Mga Bilang", "Deuteronomio",
  "Josue", "Mga Hukom", "Ruth", "1 Samuel", "2 Samuel",
  "1 Hari", "2 Hari", "1 Cronica", "2 Cronica", "Ezra",
  "Nehemias", "Ester", "Job", "Mga Awit", "Mga Kawikaan",
  "Mangangaral", "Awit ng mga Awit", "Isaias", "Jeremias", "Panaghoy",
  "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadias", "Jonas", "Micas", "Nahum", "Habakuk",
  "Sofonias", "Hageo", "Zacarias", "Malaquias",
  "Mateo", "Marcos", "Lucas", "Juan", "Mga Gawa",
  "Mga Romano", "1 Corinto", "2 Corinto", "Galacia", "Efeso",
  "Filipos", "Colosas", "1 Tesalonica", "2 Tesalonica",
  "1 Timoteo", "2 Timoteo", "Tito", "Filemon",
  "Mga Hebreo", "Santiago", "1 Pedro", "2 Pedro",
  "1 Juan", "2 Juan", "3 Juan", "Judas", "Apocalipsis",
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const wordCount = (t: string) => t.trim() ? t.trim().split(/\s+/).length : 0;
const estimatedMinutes = (wc: number) => Math.ceil(wc / 130);
const uid = () => Math.random().toString(36).slice(2, 10);

// ── Styles shared ─────────────────────────────────────────────────────────────
const PANEL_HEADER: React.CSSProperties = {
  paddingLeft: 14, paddingRight: 14, paddingTop: 12, paddingBottom: 10,
  borderBottom: "1px solid rgba(255,255,255,0.05)",
  display: "flex", alignItems: "center", justifyContent: "space-between",
  flexShrink: 0,
};

// ── Bible Panel ───────────────────────────────────────────────────────────────
function BiblePanel({
  onCollect, onClose, onInsert,
}: {
  onCollect: (v: CollectedVerse) => void;
  onClose: () => void;
  onInsert?: (ref: string, text: string, translation: string) => void;
}) {
  const [translation, setTranslation] = useState(TRANSLATIONS[0]);
  const [bookIdx, setBookIdx] = useState(42);
  const [chapter, setChapter] = useState(3);
  const [verses, setVerses] = useState<BibleVerse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verseNum, setVerseNum] = useState("");
  const [addedSet, setAddedSet] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  // -- Global Bible search state
  const [globalResults, setGlobalResults] = useState<{ reference: string; text: string }[]>([]);
  const [globalTotal, setGlobalTotal] = useState(0);
  const [globalPage, setGlobalPage] = useState(1);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalMode, setGlobalMode] = useState(false); // true = showing whole-Bible search results
  const [lastGlobalQuery, setLastGlobalQuery] = useState("");
  const book = BIBLE_BOOKS[bookIdx];
  const chapterCount = Array.from({ length: book.chapters }, (_, i) => i + 1);
  // UI display name: Tagalog for MBB, English for all others
  const displayBookName = translation.slug === "MBBTAG" ? MBB_BOOK_NAMES[bookIdx] : book.name;

  const cleanText = (raw: string) =>
    raw.replace(/\s+/g, " ")
      .replace(/\s*Footnotes\b.*/i, "")
      .replace(/\s*\bNext\s*$/i, "")
      .replace(/\s*\bPrevious\s*$/i, "")
      .trim();

  const fetchChapter = useCallback(async () => {
    setLoading(true); setError(null); setVerses([]); setVerseNum(""); setSearchQuery("");
    setGlobalMode(false); setGlobalResults([]); setGlobalTotal(0);
    try {
      let parsed: BibleVerse[] = [];
      if (translation.api === "bible-api") {
        const bookName = book.name.replace(/ /g, "+");
        const url = `https://bible-api.com/${bookName}+${chapter}?translation=${translation.slug}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        parsed = (data.verses ?? []).map((v: any) => ({ verse: v.verse, text: cleanText(v.text ?? "") }));
      } else {
        const res = await fetch(
          `/api/bible/gateway?book=${encodeURIComponent(book.name)}&chapter=${chapter}&version=${translation.slug}`
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        parsed = (data.verses ?? []).map((v: any) => ({ verse: v.verse, text: cleanText(v.text ?? "") }));
      }
      setVerses(parsed.filter(v => v.text.length > 0).sort((a, b) => a.verse - b.verse));
    } catch {
      setError("Could not load chapter. Check your connection.");
    }
    setLoading(false);
  }, [translation, bookIdx, chapter, book.name]);

  useEffect(() => { fetchChapter(); }, [fetchChapter]);

  // ── Whole-Bible search
  const doGlobalSearch = useCallback(async (q: string, page = 1) => {
    if (q.trim().length < 2) return;
    setGlobalLoading(true); setGlobalError(null); setGlobalMode(true);
    setLastGlobalQuery(q.trim()); setGlobalPage(page);
    try {
      const res = await fetch(`/api/bible/search?q=${encodeURIComponent(q.trim())}&version=${translation.slug}&page=${page}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGlobalResults(data.results ?? []);
      setGlobalTotal(data.total ?? 0);
    } catch {
      setGlobalError("Search failed. Check your connection and try again.");
      setGlobalResults([]);
    }
    setGlobalLoading(false);
  }, [translation.slug]);

  // Reference jump OR global search on Enter
  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const q = searchQuery.trim();
    if (!q) return;
    // Smart-jump: "John 3:16" or "Juan 3:16"
    const refMatch = q.match(/^([1-3]?\s*[a-zA-Z]+(?:\s+[a-zA-Z]+)?)\s+(\d+)(?::(\d+))?$/i);
    if (refMatch) {
      const bookName = refMatch[1].trim().toLowerCase();
      const chNum = parseInt(refMatch[2]);
      const vNum = refMatch[3] ?? "";
      // Check English names and Tagalog names
      const found = BIBLE_BOOKS.findIndex((b, i) =>
        b.name.toLowerCase().startsWith(bookName) ||
        MBB_BOOK_NAMES[i].toLowerCase().startsWith(bookName)
      );
      if (found >= 0) {
        setBookIdx(found);
        setChapter(Math.min(chNum, BIBLE_BOOKS[found].chapters));
        setVerseNum(vNum);
        setSearchQuery("");
        setGlobalMode(false);
        return;
      }
    }
    // Not a reference — full Bible search
    doGlobalSearch(q, 1);
  };

  const clearGlobalSearch = () => {
    setGlobalMode(false); setGlobalResults([]); setGlobalTotal(0);
    setSearchQuery(""); setLastGlobalQuery("");
  };

  const handleCollect = (ref: string, text: string) => {
    onCollect({ ref, text, translation: translation.label });
    setAddedSet(prev => new Set(prev).add(ref));
    setTimeout(() => setAddedSet(prev => { const n = new Set(prev); n.delete(ref); return n; }), 1500);
  };

  const q = searchQuery.toLowerCase().trim();
  const num = parseInt(verseNum);
  const allItems = verses
    .filter(v => !verseNum || v.verse === num)
    .map(v => ({ verse: v.verse, text: v.text, ref: `${book.name} ${chapter}:${v.verse}` }));
  const displayItems = q ? allItems.filter(item => item.text.toLowerCase().includes(q)) : allItems;

  const selectStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)", color: "#e2e8f0",
    border: "1px solid rgba(255,255,255,0.09)", outline: "none",
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden" style={{ background: "var(--wf-bg1)" }}>
      {/* Header — matches Sermons/Canvas style */}
      <div className="flex items-center justify-between px-4"
        style={{ minHeight: 56, borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>

        {/* Branding */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center rounded-xl"
            style={{ width: 32, height: 32, background: "linear-gradient(135deg,rgba(var(--wf-c1),0.25),rgba(16,185,129,0.12))", border: "1px solid rgba(var(--wf-c1),0.3)" }}>
            <BookOpen size={16} style={{ color: "var(--wf-at)" }} />
          </div>
          <div>
            <p className="text-[15px] font-bold leading-tight" style={{ color: "rgba(255,255,255,0.88)" }}>Bible</p>
            <p className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.28)", letterSpacing: "0.04em" }}>
              {displayBookName} {chapter} · {translation.label}
            </p>
          </div>
        </div>

        {/* Collapse */}
        <button onClick={onClose}
          className="flex items-center justify-center rounded-xl transition-all active:scale-95"
          style={{ width: 36, height: 36, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" }}
          title="Collapse Bible panel"
          onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}>
          <PanelRight size={16} />
        </button>
      </div>

      {/* Controls */}
      <div className="px-4 pt-4 pb-2 shrink-0 space-y-2.5">
        {/* Translation tabs */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
          {TRANSLATIONS.map(t => (
            <button key={t.slug} onClick={() => setTranslation(t)}
              className="flex-1 py-2 text-[12px] font-bold rounded-lg transition-all"
              style={{
                background: translation.slug === t.slug ? "linear-gradient(135deg,rgba(var(--wf-c1),0.9),rgba(var(--wf-c2),0.8))" : "transparent",
                color: translation.slug === t.slug ? "#fff" : "rgba(255,255,255,0.4)",
                boxShadow: translation.slug === t.slug ? "0 2px 8px rgba(var(--wf-c1),0.3)" : "none",
              }}
              title={t.full}>{t.label}</button>
          ))}
        </div>

        {/* Book + Chapter + Verse */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <select value={bookIdx} onChange={e => { setBookIdx(+e.target.value); setChapter(1); setVerseNum(""); setSearchQuery(""); }}
              className="w-full appearance-none font-semibold px-3 py-2.5 rounded-xl truncate"
              style={{ ...selectStyle, fontSize: 14 }}>
              {BIBLE_BOOKS.map((b, i) => (
                <option key={b.name} value={i} style={{ background: "var(--wf-bg2)" }}>
                  {translation.slug === "MBBTAG" ? MBB_BOOK_NAMES[i] : b.name}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "rgba(255,255,255,0.25)" }} />
          </div>
          <div className="relative" style={{ width: 62 }}>
            <select value={chapter} onChange={e => { setChapter(+e.target.value); setVerseNum(""); setSearchQuery(""); }}
              className="w-full appearance-none font-semibold px-2 py-2.5 rounded-xl text-center"
              style={{ ...selectStyle, fontSize: 14 }}>
              {chapterCount.map(c => <option key={c} value={c} style={{ background: "var(--wf-bg2)" }}>{c}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "rgba(255,255,255,0.25)" }} />
          </div>
          <div className="relative" style={{ width: 62 }}>
            <select value={verseNum} onChange={e => { setVerseNum(e.target.value); setSearchQuery(""); }}
              className="w-full appearance-none font-semibold px-2 py-2.5 rounded-xl text-center"
              style={{ ...selectStyle, fontSize: 14 }}>
              <option value="" style={{ background: "var(--wf-bg2)" }}>v.</option>
              {verses.map(v => <option key={v.verse} value={v.verse} style={{ background: "var(--wf-bg2)" }}>{v.verse}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "rgba(255,255,255,0.25)" }} />
          </div>
        </div>

        {/* 🔍 Keyword search / Reference jump */}
        <div className="relative flex items-center">
          <List size={14} className="absolute left-3.5 pointer-events-none" style={{ color: "rgba(var(--wf-c1),0.5)" }} />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKey}
            placeholder={`Search or jump "John 3:16"`}
            className="w-full text-[13px] py-3 pl-9 pr-9 rounded-xl transition-all outline-none"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: searchQuery ? "1px solid rgba(var(--wf-c1),0.45)" : "1px solid rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.8)",
            }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")}
              className="absolute right-3.5 flex items-center justify-center"
              style={{ color: "rgba(255,255,255,0.3)" }}>
              <X size={13} />
            </button>
          )}
        </div>
        {/* "Press Enter" hint when typing non-reference query */}
        {searchQuery && !globalMode && (
          <p className="text-[10px] text-center mt-1.5" style={{ color: "rgba(var(--wf-c1),0.5)" }}>
            Press ⏎ Enter to search all 66 books
          </p>
        )}
      </div>

      {/* Sticky label — shows chapter context OR global search context */}
      <div className="px-4 py-2 shrink-0 flex items-center justify-between"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: globalMode ? "rgba(var(--wf-c1),0.04)" : "rgba(255,255,255,0.015)" }}>
        {globalMode ? (
          <span className="text-[11px] font-bold tracking-widest uppercase" style={{ color: "rgba(var(--wf-c1),0.7)" }}>
            🔍 Whole Bible · "{lastGlobalQuery}" · {translation.label}
          </span>
        ) : (
          <span className="text-[11px] font-bold tracking-widest uppercase" style={{ color: "rgba(var(--wf-c1),0.7)" }}>
            {displayBookName} {chapter} · {translation.label}
          </span>
        )}
        {globalMode ? (
          globalLoading ? <Loader2 size={11} className="animate-spin" style={{ color: "rgba(var(--wf-c1),0.5)" }} /> :
          globalTotal > 0 ? <span className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.2)" }}>{globalTotal.toLocaleString()} results</span> : null
        ) : (
          !loading && verses.length > 0 && (
            <span className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.2)" }}>
              {q ? `${displayItems.length} / ` : ""}{verses.length} vs
            </span>
          )
        )}
      </div>

      {/* ── GLOBAL SEARCH RESULTS PANEL ── */}
      {globalMode ? (
        <div className="flex-1 overflow-y-auto"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.07) transparent", paddingBottom: 80, paddingLeft: 16, paddingRight: 16 }}>

          {/* Search loading skeleton */}
          {globalLoading && (
            <div className="py-4 space-y-4">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="rounded-2xl p-4 animate-pulse" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="rounded h-2.5 w-1/3 mb-3" style={{ background: "rgba(var(--wf-c1),0.15)" }} />
                  <div className="rounded h-3 w-full mb-1.5" style={{ background: "rgba(255,255,255,0.06)" }} />
                  <div className="rounded h-3 w-4/5" style={{ background: "rgba(255,255,255,0.04)" }} />
                </div>
              ))}
            </div>
          )}

          {/* Search error */}
          {globalError && !globalLoading && (
            <div className="flex flex-col items-center py-10 px-4">
              <div className="rounded-2xl mb-3 flex items-center justify-center"
                style={{ width: 44, height: 44, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}>
                <RefreshCw size={18} style={{ color: "rgba(239,68,68,0.6)" }} />
              </div>
              <p className="text-[12px] font-semibold mb-1" style={{ color: "rgba(239,68,68,0.8)" }}>Search failed</p>
              <p className="text-[11px] mb-3 text-center" style={{ color: "rgba(255,255,255,0.2)" }}>{globalError}</p>
              <button onClick={() => doGlobalSearch(lastGlobalQuery, globalPage)}
                className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-semibold transition-all active:scale-95"
                style={{ background: "rgba(var(--wf-c1),0.15)", border: "1px solid rgba(var(--wf-c1),0.3)", color: "var(--wf-at2)" }}>
                <RefreshCw size={12} /> Try again
              </button>
            </div>
          )}

          {/* No results */}
          {!globalLoading && !globalError && globalResults.length === 0 && (
            <div className="flex flex-col items-center py-12 px-4">
              <p className="text-3xl mb-3">📭</p>
              <p className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.3)" }}>No results found</p>
              <p className="text-[11px] mt-1 text-center" style={{ color: "rgba(255,255,255,0.15)" }}>Try a different keyword or translation</p>
            </div>
          )}

          {/* Results list */}
          {!globalLoading && globalResults.map((result, idx) => {
            const hlReg = lastGlobalQuery.trim().length > 1
              ? new RegExp(`(${lastGlobalQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
              : null;
            const hlText = hlReg
              ? result.text.replace(hlReg, '<mark style="background:rgba(var(--wf-c1),0.3);color:#e0e7ff;border-radius:3px;padding:0 2px">$1</mark>')
              : result.text;
            const ref = result.reference || "";
            const isAdded = addedSet.has(ref);
            return (
              <div key={`${ref}-${idx}`} className="my-2 rounded-2xl transition-all"
                style={{
                  background: isAdded ? "rgba(16,185,129,0.06)" : "rgba(255,255,255,0.025)",
                  border: isAdded ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(255,255,255,0.06)",
                  padding: "12px 14px",
                }}>
                {/* Reference badge */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(var(--wf-c1),0.15)", color: "var(--wf-at2)", letterSpacing: "0.03em" }}>
                    {ref} · {translation.label}
                  </span>
                </div>
                {/* Highlighted text */}
                <p className="text-[13px] leading-relaxed mb-3" style={{ color: "rgba(255,255,255,0.82)" }}
                  dangerouslySetInnerHTML={{ __html: hlText }} />
                {/* Actions */}
                <div className="flex items-center gap-2 justify-end">
                  <button onClick={() => handleCollect(ref, result.text)}
                    className="flex items-center gap-1 rounded-full transition-all active:scale-95"
                    style={{ height: 28, paddingLeft: 10, paddingRight: 10, fontSize: 11, fontWeight: 700,
                      background: isAdded ? "rgba(16,185,129,0.15)" : "rgba(var(--wf-c1),0.15)",
                      border: isAdded ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(var(--wf-c1),0.25)",
                      color: isAdded ? "#34d399" : "var(--wf-at2)" }}>
                    {isAdded ? <CheckCircle2 size={11} /> : <Plus size={11} />}
                    {isAdded ? "Saved" : "Collect"}
                  </button>
                  {onInsert && (
                    <button onClick={() => onInsert(ref, result.text, translation.label)}
                      className="flex items-center gap-1 rounded-full transition-all active:scale-95"
                      style={{ height: 28, paddingLeft: 10, paddingRight: 10, fontSize: 11, fontWeight: 700,
                        background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#fbbf24" }}>
                      <CornerDownLeft size={11} /> Insert
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {!globalLoading && globalResults.length > 0 && (
            <div className="flex items-center justify-between py-4">
              <button
                disabled={globalPage <= 1}
                onClick={() => doGlobalSearch(lastGlobalQuery, globalPage - 1)}
                className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-semibold transition-all active:scale-95 disabled:opacity-30"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
                ← Prev
              </button>
              <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.2)" }}>Page {globalPage}</span>
              <button
                disabled={globalPage * 25 >= globalTotal}
                onClick={() => doGlobalSearch(lastGlobalQuery, globalPage + 1)}
                className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-semibold transition-all active:scale-95 disabled:opacity-30"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
                Next →
              </button>
            </div>
          )}

          {/* Clear search button */}
          <div className="flex justify-center pt-2 pb-4">
            <button onClick={clearGlobalSearch}
              className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-semibold transition-all active:scale-95"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.3)" }}>
              <X size={11} /> Back to chapter view
            </button>
          </div>
        </div>
      ) : (
        <>{/* Chapter verse list */}
        <div className="flex-1 overflow-y-auto"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.07) transparent", paddingBottom: 80, paddingLeft: 16, paddingRight: 16 }}>

        {/* Skeleton loader */}
        {loading && (
          <div className="px-4 py-4 space-y-4">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="rounded w-5 h-4 shrink-0 mt-1" style={{ background: "rgba(255,255,255,0.07)" }} />
                <div className="flex-1 space-y-1.5">
                  <div className="rounded h-3 w-full" style={{ background: "rgba(255,255,255,0.06)" }} />
                  <div className="rounded h-3 w-4/5" style={{ background: "rgba(255,255,255,0.04)" }} />
                  {i % 2 === 0 && <div className="rounded h-3 w-2/3" style={{ background: "rgba(255,255,255,0.03)" }} />}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="flex flex-col items-center py-10 px-4">
            <div className="rounded-2xl mb-3 flex items-center justify-center"
              style={{ width: 44, height: 44, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}>
              <RefreshCw size={18} style={{ color: "rgba(239,68,68,0.6)" }} />
            </div>
            <p className="text-[12px] font-semibold mb-1" style={{ color: "rgba(239,68,68,0.8)" }}>Failed to load</p>
            <p className="text-[11px] mb-3 text-center" style={{ color: "rgba(255,255,255,0.2)" }}>{error}</p>
            <button onClick={fetchChapter}
              className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-semibold transition-all active:scale-95"
              style={{ background: "rgba(var(--wf-c1),0.15)", border: "1px solid rgba(var(--wf-c1),0.3)", color: "var(--wf-at2)" }}>
              <RefreshCw size={12} /> Try again
            </button>
          </div>
        )}

        {/* No search match */}
        {!loading && !error && q && displayItems.length === 0 && verses.length > 0 && (
          <div className="flex flex-col items-center py-10 px-4">
            <p className="text-2xl mb-2">🔍</p>
            <p className="text-[12px] font-semibold" style={{ color: "rgba(255,255,255,0.3)" }}>No verses match</p>
            <p className="text-[11px] mt-1 text-center" style={{ color: "rgba(255,255,255,0.15)" }}>Try a different keyword or clear the search</p>
          </div>
        )}

        {/* Verses */}
        {displayItems.map((item, idx) => {
          const isAdded = addedSet.has(item.ref);
          const highlighted = q
            ? item.text.replace(
                new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                '<mark style="background:rgba(var(--wf-c1),0.3);color:#e0e7ff;border-radius:3px;padding:0 2px">$1</mark>'
              )
            : null;
          return (
            <div key={item.ref} className="my-1">
              {idx > 0 && <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", marginBottom: 4 }} />}
              <div className="group flex gap-3 py-3.5 px-3 rounded-2xl transition-all"
                style={{
                  background: isAdded ? "rgba(16,185,129,0.06)" : "transparent",
                  border: isAdded ? "1px solid rgba(16,185,129,0.15)" : "1px solid transparent",
                }}
                onMouseEnter={e => !isAdded && (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                onMouseLeave={e => !isAdded && (e.currentTarget.style.background = "transparent")}>

                {/* Verse number */}
                <span className="text-[15px] font-black shrink-0 mt-0.5 w-6 text-right"
                  style={{ color: isAdded ? "#10b981" : "rgba(var(--wf-c1),0.85)" }}>
                  {item.verse}
                </span>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  {highlighted
                    ? <p className="text-[15px] leading-[1.7]" style={{ color: "rgba(255,255,255,0.88)" }}
                        dangerouslySetInnerHTML={{ __html: highlighted }} />
                    : <p className="text-[15px] leading-[1.7]" style={{ color: "rgba(255,255,255,0.88)" }}>{item.text}</p>
                  }
                  <p className="text-[11px] mt-1.5 font-semibold tracking-wide" style={{ color: "rgba(255,255,255,0.25)" }}>
                    {item.ref} · {translation.label}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 shrink-0 self-start pt-0.5">
                  <button onClick={() => handleCollect(item.ref, item.text)}
                    className="transition-all flex items-center justify-center rounded-full"
                    title={isAdded ? "Added!" : "Collect verse"}
                    style={{
                      width: 34, height: 34,
                      background: isAdded ? "rgba(16,185,129,0.18)" : "rgba(var(--wf-c1),0.12)",
                      border: isAdded ? "1px solid rgba(16,185,129,0.4)" : "1px solid rgba(var(--wf-c1),0.25)",
                      color: isAdded ? "#10b981" : "rgba(var(--wf-c1),0.9)",
                    }}>
                    {isAdded ? <Check size={15} /> : <PlusCircle size={15} />}
                  </button>
                  {onInsert && (
                    <button onClick={() => onInsert(item.ref, item.text, translation.label)}
                      className="transition-all active:scale-90 flex items-center justify-center rounded-full"
                      title="Insert at cursor"
                      style={{
                        width: 34, height: 34,
                        background: "rgba(245,158,11,0.08)",
                        border: "1px solid rgba(245,158,11,0.2)",
                        color: "rgba(245,158,11,0.8)",
                      }}>
                      <CornerDownLeft size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}


// ── Sermon Preview Modal ──────────────────────────────────────────────────────
function SermonPreviewModal({ draft, onClose }: { draft: SermonDraft; onClose: () => void }) {
  const h = draft.previewHidden || {};
  const keyPts = draft.keyPoints.filter(k => k.heading || k.scripture);

  // Helper: get effective scripture list (new field or legacy mainVerse)
  const effectiveScriptures = (draft.scriptures && draft.scriptures.length > 0)
    ? draft.scriptures
    : (draft.mainVerse ? [{ id: 'mv', text: draft.mainVerse }] : []);

  const buildPlainText = () => {
    const sep = "─".repeat(36);
    const lbl = (s: string) => `[ ${s.toUpperCase()} ]`;
    const lines: string[] = [];

    // ── Service Info ──────────────────────────────────────
    if (draft.serviceType || draft.scheduledDate) {
      lines.push(lbl("Service Info"));
      if (draft.serviceType)   lines.push(draft.serviceType);
      if (draft.scheduledDate) lines.push(new Date(draft.scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }));
      lines.push("");
    }

    // ── Title Section ─────────────────────────────────────
    if (!h.titleSection) {
      if (draft.title) {
        lines.push(lbl("Title"));
        lines.push(draft.title.toUpperCase());
        lines.push("");
      }
      if (draft.subtitle) {
        lines.push(lbl("Subtitle"));
        lines.push(draft.subtitle.toUpperCase());
        lines.push("");
      }
      const mainVerses = effectiveScriptures.filter(s => s.text);
      if (mainVerses.length > 0) {
        lines.push(lbl("Scripture"));
        mainVerses.forEach((s, i) => {
          if (i > 0) lines.push("");
          lines.push(s.text);
        });
        lines.push("");
      }
    }

    lines.push(sep);
    lines.push("");

    // ── Introduction ──────────────────────────────────────
    if (!h.introduction && draft.introduction) {
      lines.push(lbl("Introduction"));
      lines.push(draft.introduction);
      lines.push("");
      lines.push(sep);
      lines.push("");
    }

    // ── Main Passage ──────────────────────────────────────
    if (!h.mainPassage && draft.mainPassage) {
      lines.push(lbl("Main Passage"));
      lines.push(draft.mainPassage);
      lines.push("");
      lines.push(sep);
      lines.push("");
    }

    // ── Key Points ────────────────────────────────────────
    if (!h.keyPoints && keyPts.length > 0) {
      lines.push(lbl("Key Points Title"));
      lines.push((draft.keyPointsTitle || "Main Points").toUpperCase());
      lines.push("");
      keyPts.forEach((kp, i) => {
        if (i > 0) { lines.push(""); lines.push(sep); lines.push(""); }
        lines.push(lbl(`Point ${i + 1}`));
        if (kp.heading) { lines.push("Heading:"); lines.push(kp.heading); lines.push(""); }
        const kpVerses = (kp.scriptures && kp.scriptures.length > 0)
          ? kp.scriptures.map(s => s.text).filter(Boolean)
          : kp.scripture ? [kp.scripture] : [];
        if (kpVerses.length > 0) {
          lines.push(lbl("Scripture"));
          kpVerses.forEach((v, vi) => { if (vi > 0) lines.push(""); lines.push(v); });
          lines.push("");
        }
        if (!kp.bodyHidden && kp.body) {
          lines.push(lbl("Notes"));
          lines.push(kp.body);
          lines.push("");
        }
      });
      lines.push(sep);
      lines.push("");
    }

    // ── Additional Notes ──────────────────────────────────
    if (!h.freeNotes && draft.freeNotes) {
      lines.push(lbl("Additional Notes"));
      lines.push(draft.freeNotes);
      lines.push("");
      lines.push(sep);
      lines.push("");
    }

    // ── Collected Verses ──────────────────────────────────
    if (!h.collectedVerses && draft.collectedVerses?.length) {
      lines.push(lbl("Collected Verses"));
      draft.collectedVerses.forEach(v => { lines.push(`${v.ref} — ${v.text}`); lines.push(""); });
      lines.push(sep);
      lines.push("");
    }

    // ── Application ───────────────────────────────────────
    if (!h.application && draft.application) {
      lines.push(lbl("Application / Challenge"));
      lines.push(draft.application);
      lines.push("");
      lines.push(sep);
      lines.push("");
    }

    // ── Closing Prayer ────────────────────────────────────
    if (!h.closingPrayer && draft.closingPrayer) {
      lines.push(lbl("Closing Prayer"));
      lines.push(draft.closingPrayer);
    }

    return lines.join("\n");
  };

  const handleCopy = () => navigator.clipboard.writeText(buildPlainText());

  const handlePrint = () => {
    const text = buildPlainText().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const win = window.open("", "_blank")!;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${draft.title || "Sermon Brief"}</title>
      <style>
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; line-height: 1.8; color: #111; padding: 48px; max-width: 700px; margin: 0 auto; white-space: pre-wrap; }
        .no-print { margin-bottom: 20px; }
        button { background: #333; color: #fff; border: none; padding: 8px 20px; border-radius: 6px; font-size: 13px; cursor: pointer; }
        @media print { .no-print { display: none !important; } @page { margin: 2cm; } }
      </style></head><body>
      <div class="no-print"><button onclick="window.print()">Print / Save PDF</button></div>${text}
    </body></html>`);
    win.document.close();
  };

  const divider = <div style={{ borderTop: "1px solid #e5e7eb", margin: "24px 0" }} />;
  const label = (txt: string) => (
    <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "#aaa" }}>{txt}</span>
  );

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.65)" }}>
      {/* Full-screen on mobile, centered card on sm+ */}
      <div className="w-full sm:max-w-xl sm:rounded-xl sm:mx-4 shadow-2xl flex flex-col"
        style={{ background: "#fff", height: "100dvh", maxHeight: "100dvh",
                 /* sm+ override applied via Tailwind class below */ }}
      >
        {/* Toolbar — mobile-friendly 2-row layout */}
        <div className="shrink-0" style={{ borderBottom: "1px solid #e5e7eb" }}>
          {/* Row 1: title + close — pt accounts for iOS notch/status bar */}
          <div className="flex items-center justify-between px-4 pb-2" style={{ paddingTop: "max(16px, env(safe-area-inset-top, 16px))" }}>
            <div className="flex items-center gap-2">
              <Eye size={15} style={{ color: "#555" }} />
              <div>
                <span className="text-sm font-semibold block" style={{ color: "#111" }}>Sermon Brief</span>
                <span className="text-[11px] block" style={{ color: "#aaa" }}>for slide designer</span>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 active:bg-gray-200" style={{ color: "#888" }}>
              <X size={18} />
            </button>
          </div>
          {/* Row 2: action buttons */}
          <div className="flex gap-2 px-4 pb-3">
            <button onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95"
              style={{ color: "#555", border: "1px solid #e5e7eb", background: "#f9fafb" }}>Copy Text</button>
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95"
              style={{ color: "#555", border: "1px solid #e5e7eb", background: "#f9fafb" }}>
              <Printer size={14} /> <span className="hidden sm:inline">Print</span>
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: "thin", scrollbarColor: "#e5e7eb transparent" }}>
        <div className="px-5 sm:px-8 py-6 sm:py-8" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: "#111", lineHeight: 1.8 }}>

          {/* Service info bar — above title */}
          {!h.serviceInfo && (draft.serviceType || draft.scheduledDate) && (
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" as const }}>
              {draft.serviceType && (
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "#10b981", background: "rgba(16,185,129,0.08)", padding: "4px 14px", borderRadius: 20, border: "1px solid rgba(16,185,129,0.2)" }}>{draft.serviceType}</span>
              )}
              {draft.scheduledDate && (
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "#d97706", background: "rgba(245,158,11,0.08)", padding: "4px 14px", borderRadius: 20, border: "1px solid rgba(245,158,11,0.2)" }}>
                  {new Date(draft.scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </span>
              )}
            </div>
          )}

          {/* Title section */}
          {!h.titleSection && (
            <>
              <div style={{ marginBottom: 16 }}>
                {label("Title")}
                <p style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.2, textTransform: "uppercase" as const, color: "#111", marginTop: 2 }}>
                  {draft.title || <span style={{ color: "#bbb", fontStyle: "italic" }}>Untitled</span>}
                </p>
              </div>
              {draft.subtitle && (
                <div style={{ marginBottom: 10 }}>
                  {label("Subtitle")}
                  <p style={{ fontSize: 15, fontWeight: 500, color: "#444", textTransform: "uppercase" as const, marginTop: 2 }}>{draft.subtitle}</p>
                </div>
              )}
              {effectiveScriptures.length > 0 && (
                <div style={{ marginBottom: 0 }}>
                  {label("Scripture")}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                    {effectiveScriptures.map((s, i) => (
                      <div key={s.id} style={{
                        paddingLeft: 10,
                        borderLeft: `3px solid ${i === 0 ? "var(--wf-c1-hex)" : "var(--wf-at2)"}`,
                        background: i === 0 ? "#f5f5ff" : "#fafaff",
                        borderRadius: "0 6px 6px 0",
                        padding: "6px 10px",
                      }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: "#333", margin: 0, lineHeight: 1.6 }}>{s.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {divider}

          {/* Introduction */}
          {!h.introduction && draft.introduction && (
            <>
              {label("Introduction")}
              <p style={{ fontSize: 14, color: "#333", whiteSpace: "pre-wrap", marginTop: 6, marginBottom: 0 }}>{draft.introduction}</p>
              {divider}
            </>
          )}

          {/* Main Passage */}
          {!h.mainPassage && draft.mainPassage && (
            <>
              {label("Main Passage")}
              <p style={{ fontSize: 14, color: "#333", whiteSpace: "pre-wrap", marginTop: 6, marginBottom: 0 }}>{draft.mainPassage}</p>
              {divider}
            </>
          )}

          {/* Key Points */}
          {!h.keyPoints && keyPts.length > 0 && (
            <>
              {label("Key Points Title")}
              <p style={{ fontSize: 20, fontWeight: 800, color: "#111", letterSpacing: "0.02em", lineHeight: 1.3, marginTop: 4, marginBottom: 20, paddingBottom: 10, borderBottom: "2px solid #e0e0f8", textTransform: "uppercase" as const }}>
                {draft.keyPointsTitle || "Main Points"}
              </p>
              {keyPts.map((kp, i) => (
                <div key={kp.id}>
                  {i > 0 && <div style={{ borderTop: "1px solid #f0f0f0", margin: "16px 0" }} />}
                  <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "#aaa", marginBottom: 4 }}>Point {i + 1}</p>
                  {kp.heading && (
                    <p style={{ fontSize: 18, fontWeight: 700, color: "#111", textTransform: "uppercase" as const, lineHeight: 1.3, marginBottom: 6 }}>{kp.heading}</p>
                  )}
                  {(() => {
                    const kpVerses = (kp.scriptures && kp.scriptures.length > 0)
                      ? kp.scriptures.filter(s => s.text)
                      : kp.scripture ? [{ id: 'kv', text: kp.scripture }] : [];
                    return kpVerses.length > 0 ? (
                      <div style={{ marginBottom: 8 }}>
                        {label("Scripture")}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                          {kpVerses.map((sv, si) => (
                            <div key={si} style={{
                              paddingLeft: 10,
                              borderLeft: `3px solid ${si === 0 ? "var(--wf-c1-hex)" : "var(--wf-at2)"}`,
                              background: si === 0 ? "#f5f5ff" : "#fafaff",
                              borderRadius: "0 6px 6px 0",
                              padding: "6px 10px",
                            }}>
                              <p style={{ fontSize: 13, fontWeight: 500, color: "#444", margin: 0, lineHeight: 1.6 }}>{sv.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}
                  {!kp.bodyHidden && kp.body && (
                    <div style={{ marginTop: 6 }}>
                      {label("Notes")}
                      <p style={{ fontSize: 13, color: "#666", whiteSpace: "pre-wrap", marginTop: 1 }}>{kp.body}</p>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {/* Free Notes */}
          {!h.freeNotes && draft.freeNotes && (
            <>
              {divider}
              {label("Additional Notes")}
              <p style={{ fontSize: 14, color: "#333", whiteSpace: "pre-wrap", marginTop: 6 }}>{draft.freeNotes}</p>
            </>
          )}

          {/* Collected Verses */}
          {!h.collectedVerses && draft.collectedVerses?.length > 0 && (
            <>
              {divider}
              {label("Collected Verses")}
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column" as const, gap: 8 }}>
                {draft.collectedVerses.map(v => (
                  <div key={v.ref}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#10b981", marginBottom: 2 }}>{v.ref} <span style={{ fontWeight: 400, color: "#aaa" }}>· {v.translation}</span></p>
                    <p style={{ fontSize: 13, color: "#444" }}>{v.text}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Application */}
          {!h.application && draft.application && (
            <>
              {divider}
              {label("Application / Challenge")}
              <p style={{ fontSize: 14, color: "#333", whiteSpace: "pre-wrap", marginTop: 6 }}>{draft.application}</p>
            </>
          )}

          {/* Closing Prayer */}
          {!h.closingPrayer && draft.closingPrayer && (
            <>
              {divider}
              {label("Closing Prayer")}
              <p style={{ fontSize: 14, color: "#333", whiteSpace: "pre-wrap", marginTop: 6 }}>{draft.closingPrayer}</p>
            </>
          )}

        </div>
        </div>

      </div>
    </div>
  , document.body);
}

// ── Free Canvas ───────────────────────────────────────────────────────────────
function FreeCanvas({ onClose }: { onClose: () => void }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(16);
  const [isEmpty, setIsEmpty] = useState(true);
  const [fmt, setFmt] = useState({ bold: false, italic: false, underline: false });

  const exec = (cmd: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, undefined);
    updateFmt();
  };

  const updateFmt = () => {
    setFmt({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
    });
  };

  const adjustSize = (delta: number) => {
    setFontSize(prev => {
      const next = Math.max(10, Math.min(72, prev + delta));
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        try {
          const range = sel.getRangeAt(0);
          const span = document.createElement('span');
          span.style.fontSize = `${next}px`;
          range.surroundContents(span);
        } catch (_) { /* cross-element selection — just update base size */ }
      }
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    if (e.key === 'b')              { e.preventDefault(); exec('bold'); }
    else if (e.key === 'i')         { e.preventDefault(); exec('italic'); }
    else if (e.key === 'u')         { e.preventDefault(); exec('underline'); }
    else if (e.key === '=' || e.key === '+') { e.preventDefault(); adjustSize(2); }
    else if (e.key === '-')         { e.preventDefault(); adjustSize(-2); }
  };

  const btnStyle = (active: boolean): React.CSSProperties => ({
    width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 6, cursor: 'pointer', border: 'none', transition: 'all .15s',
    background: active ? 'rgba(var(--wf-c1),0.3)' : 'transparent',
    color: active ? 'var(--wf-at2)' : 'rgba(255,255,255,0.45)',
  });

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Top bar — height 45px matching SermonCanvas */}
      <div className="flex items-center justify-between px-5 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'var(--wf-bg6)', height: 45 }}>
        <div className="flex items-center gap-2">
          <button onClick={onClose}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all hover:bg-white/5"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            <ChevronLeft size={13} /> Back
          </button>
          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)' }} />
          <span className="text-sm font-bold text-white">Free Canvas</span>
        </div>

        {/* Formatting toolbar */}
        <div className="flex items-center gap-0.5 rounded-xl px-2 py-1"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <button style={btnStyle(fmt.bold)} onClick={() => exec('bold')} title="Bold — Ctrl+B / ⌘B">
            <span style={{ fontSize: 12, fontWeight: 800 }}>B</span>
          </button>
          <button style={btnStyle(fmt.italic)} onClick={() => exec('italic')} title="Italic — Ctrl+I / ⌘I">
            <span style={{ fontSize: 12, fontWeight: 600, fontStyle: 'italic' }}>I</span>
          </button>
          <button style={btnStyle(fmt.underline)} onClick={() => exec('underline')} title="Underline — Ctrl+U / ⌘U">
            <span style={{ fontSize: 12, fontWeight: 600, textDecoration: 'underline' }}>U</span>
          </button>

          <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)', margin: '0 3px' }} />

          <button style={btnStyle(false)} onClick={() => adjustSize(-2)} title="Smaller — Ctrl+− / ⌘−">
            <span style={{ fontSize: 10, fontWeight: 700 }}>A<sup style={{ fontSize: 7 }}>−</sup></span>
          </button>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', minWidth: 22, textAlign: 'center' }}>
            {fontSize}
          </span>
          <button style={btnStyle(false)} onClick={() => adjustSize(2)} title="Larger — Ctrl+= / ⌘=">
            <span style={{ fontSize: 10, fontWeight: 700 }}>A<sup style={{ fontSize: 7 }}>+</sup></span>
          </button>
        </div>
      </div>

      {/* Editor surface — different style from structured canvas */}
      <div className="flex-1 overflow-y-auto"
        style={{ background: '#111127', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.06) transparent' }}>
        <div className="relative mx-auto px-10 py-10" style={{ maxWidth: 740, minHeight: '100%' }}>
          {/* Placeholder */}
          {isEmpty && (
            <div className="absolute top-10 left-10 right-10 pointer-events-none select-none"
              style={{ fontSize, color: 'rgba(255,255,255,0.18)', fontFamily: "'Inter', sans-serif", lineHeight: 1.8 }}>
              Start writing freely… use <kbd style={{ fontSize: 10, padding: '1px 4px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>⌘B</kbd>{' '}
              <kbd style={{ fontSize: 10, padding: '1px 4px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>⌘I</kbd>{' '}
              <kbd style={{ fontSize: 10, padding: '1px 4px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>⌘U</kbd> to format, <kbd style={{ fontSize: 10, padding: '1px 4px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>⌘=</kbd>{' / '}
              <kbd style={{ fontSize: 10, padding: '1px 4px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>⌘−</kbd> for size.
            </div>
          )}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onKeyDown={handleKeyDown}
            onKeyUp={updateFmt}
            onMouseUp={updateFmt}
            onInput={e => setIsEmpty(!(e.currentTarget.textContent || '').trim())}
            style={{
              minHeight: 'calc(100vh - 160px)',
              outline: 'none',
              fontSize,
              color: 'rgba(255,255,255,0.88)',
              lineHeight: 1.85,
              fontFamily: "'Inter', -apple-system, sans-serif",
              caretColor: 'var(--wf-at)',
              wordBreak: 'break-word',
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Section Block ─────────────────────────────────────────────────────────────
function SectionBlock({ icon, label, color = "var(--wf-c1-hex)", children, defaultOpen = false, visible = true, onToggleVisible, open: controlledOpen, onToggle }:
  { icon: React.ReactNode; label: string; color?: string; children: React.ReactNode; defaultOpen?: boolean; visible?: boolean; onToggleVisible?: () => void; open?: boolean; onToggle?: () => void; }) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const toggle = isControlled ? (onToggle ?? (() => {})) : () => setInternalOpen(o => !o);
  return (
    <div className="rounded-2xl mb-3" style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.025)", overflow: "visible" }}>
      <div className="w-full flex items-center" style={{ background: open ? "rgba(255,255,255,0.03)" : "transparent", borderRadius: "inherit" }}>
        {/* Eye visibility toggle — fixed 48px wide column */}
        {onToggleVisible && (
          <button onClick={onToggleVisible} title={visible ? "Hide from preview" : "Show in preview"}
            className="flex-shrink-0 flex items-center justify-center transition-all"
            style={{ color: visible ? "rgba(var(--wf-c1),0.65)" : "rgba(255,255,255,0.18)", width: 48, height: 56 }}>
            {visible ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
        )}
        <button onClick={toggle} className="flex-1 flex items-center justify-between py-3.5 pr-5 transition-all" style={{ paddingLeft: onToggleVisible ? 0 : 18, minHeight: 56 }}>
          <div className="flex items-center gap-3.5">
            <span style={{ color, display: 'flex', alignItems: 'center' }}>{icon}</span>
            <span className="text-[13px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.65)" }}>{label}</span>
          </div>
          <span style={{ color: "rgba(255,255,255,0.25)" }}>{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
        </button>
      </div>
      {open && <div className="px-5 pb-5 pt-2">{children}</div>}
    </div>
  );
}

// ── Sermon Canvas ─────────────────────────────────────────────────────────────
function SermonCanvas({
  draft, onChange, onSave, saving, collectedVerses, onRemoveVerse,
  bibleOpen, draftsOpen, onToggleBible, onToggleDrafts, onFieldFocus,
  openSection, onSetSection,
}: {
  draft: SermonDraft;
  onChange: (f: keyof SermonDraft, v: any) => void;
  onSave: () => void;
  saving: boolean;
  collectedVerses: CollectedVerse[];
  onRemoveVerse: (ref: string) => void;
  bibleOpen: boolean;
  draftsOpen: boolean;
  onToggleBible: () => void;
  onToggleDrafts: () => void;
  onFieldFocus: (el: HTMLTextAreaElement | HTMLInputElement, target: FieldTarget) => void;
  openSection: string | null;
  onSetSection: (key: string | null) => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  // openSection is now controlled externally (lifted up to PreachingView)
  const toggleSection = (key: string) => onSetSection(openSection === key ? null : key);
  // Convenience aliases for the two hand-rolled accordions
  const serviceInfoOpen = openSection === "serviceInfo";
  const headerOpen = openSection === "mainTitle";

  // Today in PH timezone (YYYY-MM-DD) — used to block past dates
  const todayYMD = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

  // Auto-set service type based on the day of week selected
  const handleDateChange = (v: string) => {
    onChange("scheduledDate", v);
    if (!v) return;
    const [y, m, d] = v.split("-").map(Number);
    const dow = new Date(y, m - 1, d).getDay(); // 0=Sun, 3=Wed
    if (dow === 0) onChange("serviceType", "Sunday Service");
    else if (dow === 3) onChange("serviceType", "Mid-Week Service");
    else onChange("serviceType", "Other");
  };
  const textareaStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 10, color: "rgba(255,255,255,0.82)", fontSize: 14, lineHeight: 1.8,
    padding: "10px 12px", width: "100%", outline: "none", resize: "vertical" as const,
    minHeight: 70, fontFamily: "inherit",
  };

  const totalWords = wordCount(
    [draft.title, draft.subtitle,
     ...(draft.scriptures?.map(s => s.text) ?? [draft.mainVerse]),
     draft.mainPassage, draft.freeNotes,
     draft.application, draft.closingPrayer, ...draft.keyPoints.map(k => k.heading + " " + k.scripture + " " + k.body)].join(" ")
  );

  const addKeyPoint = () => onChange("keyPoints", [...draft.keyPoints, { id: uid(), heading: "", scripture: "", scriptures: [{ id: uid(), text: '' }], body: "" }]);
  const updateKeyPoint = (id: string, f: "heading" | "scripture" | "body", val: string) =>
    onChange("keyPoints", draft.keyPoints.map(k => k.id === id ? { ...k, [f]: val } : k));
  const updateKeyPointScriptures = (kpId: string, newList: Array<{ id: string; text: string }>) =>
    onChange("keyPoints", draft.keyPoints.map(k =>
      k.id === kpId ? { ...k, scriptures: newList, scripture: newList[0]?.text ?? '' } : k
    ));
  const removeKeyPoint = (id: string) => onChange("keyPoints", draft.keyPoints.filter(k => k.id !== id));

  const labelCls = "text-[12px] font-bold uppercase tracking-widest mb-2 block";

  return (
    <>
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Top bar — matches Sermons header style */}
      <div className="flex items-center justify-between px-4 shrink-0"
        style={{ minHeight: 56, borderBottom: "1px solid rgba(255,255,255,0.06)", background: "var(--wf-bg6)" }}>

        {/* Branding */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center justify-center rounded-xl flex-shrink-0"
            style={{ width: 32, height: 32, background: "linear-gradient(135deg,rgba(245,158,11,0.25),rgba(var(--wf-c1),0.15))", border: "1px solid rgba(245,158,11,0.3)" }}>
            <Mic2 size={16} style={{ color: "#fbbf24" }} />
          </div>
          <div>
            <p className="text-[15px] font-bold leading-tight" style={{ color: "rgba(255,255,255,0.88)" }}>Creating Preaching Draft</p>
            <p className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.28)", letterSpacing: "0.04em" }}>
              ~{totalWords}w · {estimatedMinutes(totalWords)}m read
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Preview */}
          <button onClick={() => setPreviewOpen(true)}
            className="flex items-center justify-center rounded-xl transition-all active:scale-95"
            style={{ width: 36, height: 36, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
            title="Preview sermon">
            <Eye size={16} />
          </button>
          {/* Save */}
          <button onClick={onSave} disabled={saving}
            className="flex items-center gap-1.5 rounded-xl transition-all active:scale-95"
            style={{
              height: 36, paddingLeft: 16, paddingRight: 16,
              background: saving ? "rgba(var(--wf-c1),0.5)" : "linear-gradient(135deg,rgba(var(--wf-c1),0.9),rgba(var(--wf-c2),0.8))",
              boxShadow: saving ? "none" : "0 2px 10px rgba(var(--wf-c1),0.35)",
              color: "#fff", fontSize: 13, fontWeight: 700, opacity: saving ? 0.7 : 1,
            }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            <span>{saving ? "Saving…" : "Save"}</span>
          </button>
        </div>
      </div>

      {/* Canvas scroll */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-12"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>

        {/* ── SERVICE INFO ACCORDION ── */}
        <div className="mb-3 rounded-xl"
          style={{ border: "1px solid rgba(245,158,11,0.15)", background: "linear-gradient(135deg, rgba(245,158,11,0.05), rgba(52,211,153,0.03))", overflow: "visible" }}>

          {/* Header row — matches SectionBlock layout */}
          <div className="w-full flex items-center" style={{ background: serviceInfoOpen ? "rgba(255,255,255,0.03)" : "transparent", borderRadius: "inherit" }}>
            {/* Eye toggle — fixed 44×48px column */}
            <button
              onClick={() => onChange('previewHidden', { ...(draft.previewHidden || {}), serviceInfo: !draft.previewHidden?.serviceInfo })}
              title={draft.previewHidden?.serviceInfo ? 'Show in preview' : 'Hide from preview'}
              className="flex-shrink-0 flex items-center justify-center transition-all"
              style={{ color: draft.previewHidden?.serviceInfo ? 'rgba(255,255,255,0.18)' : 'rgba(245,158,11,0.55)', width: 44, height: 48 }}>
              {draft.previewHidden?.serviceInfo ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            {/* Expand toggle */}
            <button onClick={() => toggleSection("serviceInfo")}
              className="flex-1 flex items-center justify-between py-3 pr-4 transition-all" style={{ paddingLeft: 0 }}>
              <div className="flex items-center gap-3">
                <span style={{ color: "rgba(245,158,11,0.75)", display: 'flex', alignItems: 'center' }}><CalendarDays size={14} /></span>
                <span className="text-[12px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.6)" }}>Service Info</span>
              </div>
              <span style={{ color: "rgba(255,255,255,0.2)" }}>
                {serviceInfoOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </span>
            </button>
          </div>

          {/* Expanded content — stacks vertically on mobile, side-by-side on sm+ */}
          {serviceInfoOpen && (
            <div className="px-5 pb-5 pt-3 grid grid-cols-2 gap-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              {/* Date */}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-2">
                  <CalendarDays size={10} style={{ color: "rgba(245,158,11,0.7)" }} />
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(245,158,11,0.7)" }}>Preaching Schedule</span>
                </div>
                <DatePicker
                  value={draft.scheduledDate}
                  onChange={handleDateChange}
                  placeholder="Set date"
                  min={todayYMD}
                  dropdownAlign="left"
                  variant="inline"
                />
              </div>
              {/* Service Type */}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-2">
                  <Mic2 size={10} style={{ color: "rgba(52,211,153,0.7)" }} />
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(52,211,153,0.7)" }}>Service Type</span>
                </div>
                <select
                  value={draft.serviceType || ''}
                  onChange={e => onChange('serviceType', e.target.value)}
                  style={{
                    width: '100%',
                    height: 40,
                    boxSizing: 'border-box',
                    background: draft.serviceType ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.06)',
                    color: draft.serviceType ? 'rgba(52,211,153,0.95)' : 'rgba(255,255,255,0.35)',
                    border: `1px solid ${draft.serviceType ? 'rgba(52,211,153,0.25)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 8, padding: '0 12px', fontSize: 14, fontWeight: 600, outline: 'none', cursor: 'pointer',
                  }}>
                  <option value="" disabled style={{ background: 'var(--wf-bg7)', color: '#666' }}>Set Service Type</option>
                  <option value="Mid-Week Service" style={{ background: 'var(--wf-bg7)', color: '#fff' }}>Mid-Week Service</option>
                  <option value="Sunday Service" style={{ background: 'var(--wf-bg7)', color: '#fff' }}>Sunday Service</option>
                  <option value="Other" style={{ background: 'var(--wf-bg7)', color: '#fff' }}>Other</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* ── SERMON HEADER CARD — accordion ── */}
        <div className="mb-4 rounded-xl"
          style={{ border: "1px solid rgba(var(--wf-c1),0.15)", background: "linear-gradient(135deg, rgba(var(--wf-c1),0.06), rgba(var(--wf-c2),0.04))", overflow: "visible" }}>

          {/* Accordion header row — matches SectionBlock layout */}
          <div className="w-full flex items-center" style={{ background: headerOpen ? "rgba(255,255,255,0.03)" : "transparent", borderRadius: "inherit" }}>
            {/* Eye toggle — fixed 44×48px column */}
            <button
              onClick={() => onChange('previewHidden', { ...(draft.previewHidden || {}), titleSection: !draft.previewHidden?.titleSection })}
              title={draft.previewHidden?.titleSection ? 'Show in preview' : 'Hide from preview'}
              className="flex-shrink-0 flex items-center justify-center transition-all"
              style={{ color: draft.previewHidden?.titleSection ? 'rgba(255,255,255,0.18)' : 'rgba(var(--wf-c1),0.65)', width: 44, height: 48 }}>
              {draft.previewHidden?.titleSection ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            {/* Expand/collapse toggle */}
            <button onClick={() => toggleSection("mainTitle")}
              className="flex-1 flex items-center justify-between py-3 pr-4 transition-all" style={{ paddingLeft: 0 }}>
              <div className="flex items-center gap-3">
                <span style={{ color: "rgba(var(--wf-c1),0.85)", display: 'flex', alignItems: 'center' }}><BookOpen size={14} /></span>
                <span className="text-[12px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.6)" }}>Main Title</span>
              </div>
              <span style={{ color: "rgba(255,255,255,0.2)", flexShrink: 0 }}>
                {headerOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </span>
            </button>
          </div>

          {/* Expanded content */}
          {headerOpen && (
            <div className="px-5 pb-5 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              {/* Title — textarea so long titles wrap */}
              <textarea
                value={draft.title}
                onChange={e => { onChange("title", e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                onFocus={e => { onFieldFocus(e.currentTarget, { type: "draft", field: "title" }); e.currentTarget.style.height = "auto"; e.currentTarget.style.height = e.currentTarget.scrollHeight + "px"; }}
                placeholder="Sermon title…"
                rows={1}
                className="w-full font-bold bg-transparent border-none outline-none text-white placeholder-white/20 leading-tight resize-none overflow-hidden"
                style={{ fontSize: 26, caretColor: "var(--wf-c1-hex)", marginBottom: 4, lineHeight: 1.3 }}
              />
              {/* Thin separator */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", marginBottom: 10 }} />
              {/* Subtitle — textarea so long subtitles wrap */}
              <textarea
                value={draft.subtitle}
                onChange={e => { onChange("subtitle", e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                onFocus={e => { onFieldFocus(e.currentTarget, { type: "draft", field: "subtitle" }); e.currentTarget.style.height = "auto"; e.currentTarget.style.height = e.currentTarget.scrollHeight + "px"; }}
                placeholder="Subtitle (optional)…"
                rows={1}
                className="w-full bg-transparent border-none outline-none placeholder-white/15 resize-none overflow-hidden"
                style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", caretColor: "var(--wf-c1-hex)", marginBottom: 14, lineHeight: 1.5 }}
              />
              {/* Scriptures — one verse per card */}
              {(() => {
                const scriptureList = (draft.scriptures && draft.scriptures.length > 0)
                  ? draft.scriptures
                  : [{ id: uid(), text: draft.mainVerse || '' }];
                return (
                  <div className="flex flex-col gap-2">
                    {scriptureList.map((s, idx) => (
                      <div key={s.id} className="rounded-xl px-3 pt-2.5 pb-3"
                        style={{
                          background: "rgba(var(--wf-c1),0.08)",
                          border: "1px solid rgba(var(--wf-c1),0.15)",
                        }}>
                        {/* Label row + remove button */}
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <BookMarked size={12} className="text-indigo-400 shrink-0" />
                          <span className="text-[11px] font-bold uppercase tracking-widest flex-1"
                            style={{ color: idx === 0 ? "rgba(var(--wf-c1),0.7)" : "rgba(var(--wf-c1),0.45)" }}>
                            {idx === 0 ? "Scripture" : `Verse ${idx + 1}`}
                          </span>
                          {scriptureList.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = scriptureList.filter((_, i) => i !== idx);
                                onChange('scriptures', updated);
                                if (idx === 0) onChange('mainVerse', updated[0]?.text ?? '');
                              }}
                              title="Remove this verse"
                              className="shrink-0 flex items-center justify-center rounded-full transition-all active:scale-90"
                              style={{ width: 22, height: 22, minWidth: 22, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)", color: "#f87171", fontSize: 14, fontWeight: 700, lineHeight: 1 }}
                            >×</button>
                          )}
                        </div>
                        {/* Textarea — single line only, Enter blocked */}
                        <textarea
                          value={s.text}
                          onChange={e => {
                            const updated = scriptureList.map((x, i) => i === idx ? { ...x, text: e.target.value } : x);
                            onChange('scriptures', updated);
                            if (idx === 0) onChange('mainVerse', e.target.value);
                            e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px";
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                          onPaste={e => {
                            e.preventDefault();
                            const pasted = e.clipboardData.getData('text').replace(/\n/g, ' ').trim();
                            const updated = scriptureList.map((x, i) => i === idx ? { ...x, text: pasted } : x);
                            onChange('scriptures', updated);
                            if (idx === 0) onChange('mainVerse', pasted);
                          }}
                          placeholder={idx === 0 ? "e.g. John 3:16-17" : "e.g. Romans 8:28"}
                          onFocus={e => { onFieldFocus(e.currentTarget, { type: "draft", field: "scriptures", scriptureIdx: idx }); e.currentTarget.style.height = "auto"; e.currentTarget.style.height = e.currentTarget.scrollHeight + "px"; }}
                          rows={1}
                          className="w-full bg-transparent border-none outline-none placeholder-white/20 resize-none overflow-hidden"
                          style={{ fontSize: 15, color: "rgba(var(--wf-c3),0.9)", caretColor: "var(--wf-c1-hex)", lineHeight: 1.6 }}
                        />
                      </div>
                    ))}
                    {/* Add another verse — full-width pill below */}
                    <button
                      type="button"
                      onClick={() => onChange('scriptures', [...scriptureList, { id: uid(), text: '' }])}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all active:scale-95 hover:opacity-90"
                      style={{ background: "rgba(var(--wf-c1),0.06)", border: "1px dashed rgba(var(--wf-c1),0.3)", color: "rgba(var(--wf-c1),0.7)", fontSize: 13, fontWeight: 600 }}
                    >
                      <Plus size={14} /> Add another verse
                    </button>
                  </div>
                );
              })()}

            </div>
          )}
        </div>

        {/* ── INTRODUCTION ── */}
        <SectionBlock icon={<PenLine size={14} />} label="Introduction" color="var(--wf-c3-hex)"
          open={openSection === "introduction"} onToggle={() => toggleSection("introduction")}
          visible={!(draft.previewHidden?.introduction)}
          onToggleVisible={() => onChange('previewHidden', { ...(draft.previewHidden || {}), introduction: !draft.previewHidden?.introduction })}>
          <textarea
            value={draft.introduction}
            onChange={e => onChange("introduction", e.target.value)}
            onFocus={e => onFieldFocus(e.currentTarget, { type: "draft", field: "introduction" })}
            placeholder="Write your introduction, hook, or opening thoughts…"
            className="placeholder-white/25"
            style={{ ...textareaStyle, minHeight: 140, fontSize: 15, lineHeight: 1.85, width: "100%", resize: "vertical" }}
          />
        </SectionBlock>

        {/* ── MAIN PASSAGE — now a collapsible SectionBlock ── */}
        <SectionBlock icon={<BookMarked size={14} />} label="Main Passage" color="var(--wf-c1-hex)"
          open={openSection === "mainPassage"} onToggle={() => toggleSection("mainPassage")}
          visible={!(draft.previewHidden?.mainPassage)}
          onToggleVisible={() => onChange('previewHidden', { ...(draft.previewHidden || {}), mainPassage: !draft.previewHidden?.mainPassage })}>
          <textarea
            value={draft.mainPassage}
            onChange={e => onChange("mainPassage", e.target.value)}
            onFocus={e => onFieldFocus(e.currentTarget, { type: "draft", field: "mainPassage" })}
            placeholder="Start your passage here…"
            className="placeholder-white/25"
            style={{ ...textareaStyle, minHeight: 180, fontSize: 15, lineHeight: 1.85, width: "100%", resize: "vertical" }}
          />
        </SectionBlock>

        {/* KEY POINTS */}
        <SectionBlock icon={<Star size={14} />} label="Key Points" color="#f59e0b"
          open={openSection === "keyPoints"} onToggle={() => toggleSection("keyPoints")}
          visible={!(draft.previewHidden?.keyPoints)}
          onToggleVisible={() => onChange('previewHidden', { ...(draft.previewHidden || {}), keyPoints: !draft.previewHidden?.keyPoints })}>
          <div className="space-y-3">
            {/* Key Points section title */}
            <textarea
              value={draft.keyPointsTitle}
              rows={1}
              onChange={e => { onChange("keyPointsTitle", e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
              onFocus={e => { onFieldFocus(e.currentTarget, { type: "draft", field: "keyPointsTitle" }); e.currentTarget.style.height = "auto"; e.currentTarget.style.height = e.currentTarget.scrollHeight + "px"; }}
              placeholder="Key Points Title… (e.g. How to love like Jesus)"
              className="w-full px-3 py-3 text-[16px] font-semibold rounded-lg placeholder-white/25 resize-none overflow-hidden"
              style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.18)", color: "#fde68a", outline: "none", lineHeight: 1.5 }} />
            <div className="space-y-4">
              {draft.keyPoints.map((kp, i) => (
                <div key={kp.id} className="rounded-xl p-4" style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.15)" }}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[13px] font-bold uppercase tracking-wider" style={{ color: "#f59e0b" }}>Point {i + 1}</span>
                    <button onClick={() => removeKeyPoint(kp.id)} className="ml-auto p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all"><X size={14} /></button>
                  </div>
                  {/* Heading — auto-grow textarea */}
                  <textarea
                    value={kp.heading}
                    rows={1}
                    onChange={e => { updateKeyPoint(kp.id, "heading", e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                    onFocus={e => { onFieldFocus(e.currentTarget, { type: "kp", kpId: kp.id, kpField: "heading" }); e.currentTarget.style.height = "auto"; e.currentTarget.style.height = e.currentTarget.scrollHeight + "px"; }}
                    placeholder="Point heading… (e.g. Love one another)"
                    className="w-full px-3 py-2.5 text-[16px] font-semibold rounded-lg mb-3 placeholder-white/25 resize-none overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)", color: "#fff", outline: "none", lineHeight: 1.5 }} />
                  {/* Key Point Scriptures — multi-row */}
                  {(() => {
                    const kpList = (kp.scriptures && kp.scriptures.length > 0)
                      ? kp.scriptures
                      : [{ id: uid(), text: kp.scripture || '' }];
                    return (
                      <div className="flex flex-col gap-1.5 mb-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <BookMarked size={10} className="text-indigo-400 shrink-0" />
                          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(var(--wf-c1),0.65)" }}>Scripture</span>
                        </div>
                        {kpList.map((sv, sidx) => (
                          <div key={sv.id} className="rounded-lg px-3 pt-2 pb-2.5"
                            style={{
                              background: "rgba(var(--wf-c1),0.06)",
                              border: hasMultipleVerses(sv.text)
                                ? "1px solid rgba(245,158,11,0.5)"
                                : "1px solid rgba(var(--wf-c1),0.15)",
                            }}>
                            {/* Label row + remove button */}
                            <div className="flex items-center gap-1 mb-1.5">
                              <span className="text-[11px] font-bold uppercase tracking-widest flex-1"
                                style={{ color: sidx === 0 ? "rgba(var(--wf-c1),0.65)" : "rgba(var(--wf-c1),0.4)" }}>
                                {sidx === 0 ? "Scripture" : `Verse ${sidx + 1}`}
                              </span>
                              {kpList.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => updateKeyPointScriptures(kp.id, kpList.filter((_, xi) => xi !== sidx))}
                                  title="Remove verse"
                                  className="shrink-0 flex items-center justify-center rounded-full transition-all active:scale-90"
                                  style={{ width: 22, height: 22, minWidth: 22, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)", color: "#f87171", fontSize: 14, fontWeight: 700, lineHeight: 1 }}
                                >×</button>
                              )}
                            </div>
                            {/* Textarea — single line only, Enter blocked */}
                            <textarea
                              value={sv.text}
                              rows={1}
                              onChange={e => {
                                const updated = kpList.map((x, xi) => xi === sidx ? { ...x, text: e.target.value } : x);
                                updateKeyPointScriptures(kp.id, updated);
                                e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px";
                              }}
                              onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                              onPaste={e => {
                                e.preventDefault();
                                const pasted = e.clipboardData.getData('text').replace(/\n/g, ' ').trim();
                                const updated = kpList.map((x, xi) => xi === sidx ? { ...x, text: pasted } : x);
                                updateKeyPointScriptures(kp.id, updated);
                              }}
                              onFocus={e => { onFieldFocus(e.currentTarget, { type: "kp", kpId: kp.id, kpField: "scripture", kpScriptureIdx: sidx }); e.currentTarget.style.height = "auto"; e.currentTarget.style.height = e.currentTarget.scrollHeight + "px"; }}
                              placeholder={sidx === 0 ? "e.g. John 13:34-35" : "e.g. Romans 5:8"}
                              className="w-full bg-transparent border-none outline-none placeholder-white/25 resize-none overflow-hidden"
                              style={{ color: "var(--wf-at2)", fontSize: 15, lineHeight: 1.6 }}
                            />
                          </div>
                        ))}

                        {/* Add another verse — full-width pill below */}
                        <button
                          type="button"
                          onClick={() => updateKeyPointScriptures(kp.id, [...kpList, { id: uid(), text: '' }])}
                          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl transition-all active:scale-95 hover:opacity-90"
                          style={{ background: "rgba(var(--wf-c1),0.05)", border: "1px dashed rgba(var(--wf-c1),0.25)", color: "rgba(var(--wf-c1),0.6)", fontSize: 12, fontWeight: 600 }}
                        >
                          <Plus size={13} /> Add another verse
                        </button>
                      </div>
                    );
                  })()}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <FileText size={10} className="text-white/30 shrink-0" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>Notes for this point</span>
                    <button
                      onClick={() => onChange('keyPoints', draft.keyPoints.map(p => p.id === kp.id ? { ...p, bodyHidden: !kp.bodyHidden } : p))}
                      title={kp.bodyHidden ? 'Show notes in preview' : 'Hide notes from preview'}
                      className="ml-auto transition-all"
                      style={{ color: kp.bodyHidden ? 'rgba(255,255,255,0.18)' : 'rgba(var(--wf-c1),0.45)' }}>
                      {kp.bodyHidden ? <EyeOff size={11} /> : <Eye size={11} />}
                    </button>
                  </div>
                  <textarea value={kp.body} onChange={e => updateKeyPoint(kp.id, "body", e.target.value)}
                    onFocus={e => onFieldFocus(e.currentTarget, { type: "kp", kpId: kp.id, kpField: "body" })}
                    placeholder="Expand your thoughts, illustrations, supporting ideas…"
                    rows={4} className="placeholder-white/25"
                    style={{ ...textareaStyle, minHeight: 110, fontSize: 15, lineHeight: 1.85, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }} />
                </div>
              ))}
            </div>
            <button onClick={addKeyPoint}
              className="w-full py-3 rounded-xl text-[15px] font-semibold flex items-center justify-center gap-2 transition-all active:scale-98 hover:opacity-90"
              style={{ background: "rgba(245,158,11,0.08)", border: "1px dashed rgba(245,158,11,0.3)", color: "#f59e0b" }}>
              <Plus size={15} /> Add Key Point
            </button>
          </div>
        </SectionBlock>

        {/* FREE NOTES */}
        <SectionBlock icon={<FileText size={14} />} label="Free Notes & Illustrations" color="var(--wf-c2-hex)"
          open={openSection === "freeNotes"} onToggle={() => toggleSection("freeNotes")}
          visible={!(draft.previewHidden?.freeNotes)}
          onToggleVisible={() => onChange('previewHidden', { ...(draft.previewHidden || {}), freeNotes: !draft.previewHidden?.freeNotes })}>
          <textarea value={draft.freeNotes} onChange={e => onChange("freeNotes", e.target.value)}
            onFocus={e => onFieldFocus(e.currentTarget, { type: "draft", field: "freeNotes" })}
            placeholder="Personal illustrations, stories, margin thoughts, brainstorm freely here…"
            rows={6} className="placeholder-white/25"
            style={textareaStyle} />
        </SectionBlock>

        {/* COLLECTED VERSES */}
        {collectedVerses.length > 0 && (
          <SectionBlock icon={<BookOpen size={14} />} label="Collected Verses" color="#10b981"
            open={openSection === "collectedVerses"} onToggle={() => toggleSection("collectedVerses")}
            visible={!(draft.previewHidden?.collectedVerses)}
            onToggleVisible={() => onChange('previewHidden', { ...(draft.previewHidden || {}), collectedVerses: !draft.previewHidden?.collectedVerses })}>
            <div className="space-y-2">
              {collectedVerses.map(v => (
                <div key={v.ref} className="flex gap-2 rounded-lg p-2.5" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)" }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold mb-1" style={{ color: "#10b981" }}>{v.ref} <span className="font-normal opacity-60">· {v.translation}</span></p>
                    <p className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>{v.text}</p>
                  </div>
                  <button onClick={() => onRemoveVerse(v.ref)} className="text-white/20 hover:text-red-400 transition-colors shrink-0 self-start"><X size={11} /></button>
                </div>
              ))}
            </div>
          </SectionBlock>
        )}

        {/* APPLICATION / CHALLENGE */}
        <SectionBlock icon={<Lightbulb size={14} />} label="Application / Challenge" color="#06b6d4"
          open={openSection === "application"} onToggle={() => toggleSection("application")}
          visible={!(draft.previewHidden?.application)}
          onToggleVisible={() => onChange('previewHidden', { ...(draft.previewHidden || {}), application: !draft.previewHidden?.application })}>
          <textarea value={draft.application} onChange={e => onChange("application", e.target.value)}
            onFocus={e => onFieldFocus(e.currentTarget, { type: "draft", field: "application" })}
            placeholder="What takeaway should the congregation walk away with? Practical next steps…"
            rows={4} className="placeholder-white/25"
            style={textareaStyle} />
        </SectionBlock>

        {/* END / CLOSING PRAYER */}
        <SectionBlock icon={<Heart size={14} />} label="End / Closing Prayer" color="#ec4899"
          open={openSection === "closingPrayer"} onToggle={() => toggleSection("closingPrayer")}
          visible={!(draft.previewHidden?.closingPrayer)}
          onToggleVisible={() => onChange('previewHidden', { ...(draft.previewHidden || {}), closingPrayer: !draft.previewHidden?.closingPrayer })}>
          <textarea value={draft.closingPrayer} onChange={e => onChange("closingPrayer", e.target.value)}
            onFocus={e => onFieldFocus(e.currentTarget, { type: "draft", field: "closingPrayer" })}
            placeholder="Closing prayer outline or altar call notes…"
            rows={4} className="placeholder-white/25"
            style={textareaStyle} />
        </SectionBlock>
      </div>
    </div>
    {previewOpen && <SermonPreviewModal draft={draft} onClose={() => setPreviewOpen(false)} />}
    </>
  );
}

// ── Reusable Confirm Modal ───────────────────────────────────────────────────
function ConfirmModal({
  open, title, message, detail,
  confirmLabel = "Confirm", confirmColor = "#ef4444",
  onConfirm, onCancel, loading = false,
}: {
  open: boolean; title: string; message: string; detail?: string;
  confirmLabel?: string; confirmColor?: string;
  onConfirm: () => void; onCancel: () => void; loading?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: "var(--wf-bg3)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 64px rgba(0,0,0,0.7)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header strip */}
        <div className="px-5 pt-5 pb-4">
          <p className="font-bold text-white" style={{ fontSize: 15, letterSpacing: "-0.01em" }}>{title}</p>
          <p className="mt-1.5" style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>{message}</p>
          {detail && <p className="mt-1" style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{detail}</p>}
        </div>
        {/* Actions */}
        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-xl font-semibold transition-all active:scale-95"
            style={{ height: 42, fontSize: 13, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
          >Cancel</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-xl font-semibold transition-all active:scale-95 flex items-center justify-center gap-2"
            style={{ height: 42, fontSize: 13, background: confirmColor, border: "none", color: "#fff", opacity: loading ? 0.7 : 1 }}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Preaching Info Modal ──────────────────────────────────────────────────────
function PreachingInfoModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"about" | "workflow" | "integration">("about");
  const tabs = [
    { id: "about" as const, label: "About", emoji: "📖" },
    { id: "workflow" as const, label: "How It Works", emoji: "⚡" },
    { id: "integration" as const, label: "Design Requests", emoji: "🎨" },
  ];
  const content = {
    about: {
      title: "Your Personal Sermon Workspace",
      description: "The Preaching module is your always-available digital sermon notebook — accessible on mobile, tablet, or laptop, wherever the Spirit leads.",
      color: "var(--wf-at)",
      items: [
        { icon: "📱", text: "Cross-device access — open the app on any device and your sermon outlines are always right where you left them." },
        { icon: "📝", text: "Create structured sermon drafts with organized sections: Main Title, Introduction, Main Passage, Key Points, Free Notes, Application, and Closing Prayer." },
        { icon: "📖", text: "Built-in Bible reference panel — search and insert Bible verses directly into any section of your sermon without leaving the app." },
        { icon: "⚡", text: "Auto-save keeps your work safe as you type — no manual saving required." },
        { icon: "🖨️", text: "Print-ready layout — generate a clean, formatted copy of your sermon outline for easy reference in the pulpit." },
        { icon: "🔒", text: "Your drafts are private and only visible to you. Submitted sermons go to the Design Requests queue." },
      ],
    },
    workflow: {
      title: "Sermon Draft Workflow",
      description: "From blank page to Sunday morning — here's how to use the Preaching module step by step.",
      color: "#34d399",
      items: [
        { icon: "➕", text: "Tap '+ New' to create a fresh sermon draft. Give it a title, set the preaching schedule date, and choose the service type." },
        { icon: "✍️", text: "Fill in each section at your own pace — the canvas saves automatically. Come back anytime to continue." },
        { icon: "📚", text: "Use the Bible panel on the right to search verses by keyword or jump to a specific reference (e.g. 'John 3:16'). Add verses with one tap to the right section." },
        { icon: "👁️", text: "Use the eye icon to preview your complete sermon outline — formatted and ready to review or print." },
        { icon: "📤", text: "When your outline is ready, click 'Submit to Design Requests'. Your Audio/Tech team will immediately receive it." },
        { icon: "↩️", text: "If edits are needed after submission, your team can 'Recall' the sermon back to your drafts for revisions." },
      ],
    },
    integration: {
      title: "How Preaching → Design Requests Works",
      description: "The Preaching module is directly integrated with the Design Requests queue for your Audio/Tech and slide design team.",
      color: "var(--wf-c3-hex)",
      items: [
        { icon: "🔗", text: "When you submit a sermon draft, it instantly appears in the 'Design Requests' module — visible only to Admin and Audio/Tech roles." },
        { icon: "🎨", text: "Your slide designer opens Design Requests, expands your sermon, and can copy the full outline with one click to paste into Canva or any presentation tool." },
        { icon: "🛡️", text: "Non Audio/Tech roles (Members, Musicians, Leaders) cannot see the Design Requests module — it's exclusively for your design and tech team." },
        { icon: "🔁", text: "If the design team needs more details, they can 'Recall' the sermon back to your drafts. You'll see it reappear as an editable draft." },
        { icon: "📋", text: "All sermon data is transferred: title, scripture references, key points, illustrations, application, and closing prayer — everything the designer needs." },
        { icon: "💡", text: "Even if you can't produce slides yourself, this workflow ensures your message is beautifully presented — just outline here, submit, and the team handles the rest." },
      ],
    },
  };
  const c = content[tab];
  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/75 backdrop-blur-sm px-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <style>{`@keyframes preachingInfoPulse { 0%,100%{box-shadow:0 0 0 3px rgba(var(--wf-c1),0.2),0 0 16px rgba(var(--wf-c1),0.3)} 50%{box-shadow:0 0 0 5px rgba(var(--wf-c1),0.35),0 0 24px rgba(var(--wf-c1),0.55)} }`}</style>
      <div className="w-full max-w-lg bg-[#0f0f1c] rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: "90vh", boxShadow: "0 0 0 1px rgba(var(--wf-c1),0.2), 0 32px 80px rgba(0,0,0,0.7)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(var(--wf-c1),0.25), rgba(var(--wf-c2),0.2))", border: "1px solid rgba(var(--wf-c1),0.35)" }}>
              <Mic2 size={20} style={{ color: "var(--wf-at)" }} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">How Preaching Module Works</h2>
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>Your digital sermon workspace</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl transition-colors" style={{ color: "rgba(255,255,255,0.4)" }}>
            <X size={16} />
          </button>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-4 pb-0 shrink-0 border-b border-white/6">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold transition-all border-b-2 -mb-px ${tab === t.id ? "text-indigo-400 border-indigo-500" : "text-gray-500 border-transparent hover:text-gray-300"}`}>
              <span>{t.emoji}</span>{t.label}
            </button>
          ))}
        </div>
        {/* Content */}
        <div className="overflow-y-auto px-5 py-5 space-y-3 flex-1" style={{ scrollbarWidth: "thin", scrollbarColor: "#374151 transparent" }}>
          <div className="p-3 rounded-xl border" style={{ background: `${c.color}10`, borderColor: `${c.color}25` }}>
            <h3 className="text-sm font-bold text-white mb-1">{c.title}</h3>
            <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>{c.description}</p>
          </div>
          <div className="space-y-2">
            {c.items.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl border" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.06)" }}>
                <span className="text-base leading-none mt-0.5 shrink-0">{item.icon}</span>
                <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.65)" }}>{item.text}</p>
              </div>
            ))}
          </div>
        </div>
        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/8 shrink-0">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95" style={{ background: "var(--wf-c1-grd)" }}>
            Got it, let's preach!
          </button>
        </div>
      </div>
    </div>
  );
}


function DraftList({ drafts, activeDraftId, onSelect, onNew, onDelete, onSubmit, onRecallEdit, onPreview, onClose, onInfo, infoGlowing, currentUserName, initialTab }:
  { drafts: SermonDraft[]; activeDraftId: string | null; onSelect: (id: string) => void;
    onNew: () => void; onDelete: (id: string) => void; onSubmit: (id: string) => void;
    onRecallEdit: (id: string) => void; onPreview: (id: string) => void;
    onClose: () => void; onInfo: () => void; infoGlowing: boolean; currentUserName: string;
    initialTab?: 'drafts' | 'submitted' }) {
  const [tab, setTab] = useState<'drafts' | 'submitted'>(initialTab ?? 'drafts');

  // Sync initialTab if parent changes it (e.g. notification deep-link)
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);

  const submitted = drafts.filter(d => d.status === 'submitted');
  const draftItems = drafts.filter(d => d.status !== 'submitted');

  return (
    <div className="flex flex-col h-full w-full overflow-hidden" style={{ background: "var(--wf-bg5)" }}>

      {/* ── Header ─────────────────────────── */}
      <div className="flex items-center justify-between px-4"
        style={{ minHeight: 56, borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        {/* Branding — Info icon replaces Mic; glows until first click */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onInfo}
            title="How Preaching Module Works"
            className="flex items-center justify-center rounded-xl transition-all active:scale-95 shrink-0"
            style={{
              width: 32, height: 32,
              background: infoGlowing ? "linear-gradient(135deg,rgba(var(--wf-c1),0.3),rgba(var(--wf-c2),0.2))" : "linear-gradient(135deg,rgba(var(--wf-c1),0.12),rgba(var(--wf-c2),0.08))",
              border: `1px solid ${infoGlowing ? "rgba(var(--wf-c1),0.5)" : "rgba(var(--wf-c1),0.2)"}`,
              color: infoGlowing ? "var(--wf-at2)" : "var(--wf-at)",
              animation: infoGlowing ? "newModulePulse 2s ease-in-out infinite" : "none",
              boxShadow: infoGlowing ? "0 0 0 2px rgba(var(--wf-c1),0.2), 0 0 12px rgba(var(--wf-c1),0.25)" : "none",
            }}>
            <Info size={15} />
          </button>
          <div>
            <p className="text-[15px] font-bold leading-tight" style={{ color: "rgba(255,255,255,0.88)" }}>Preaching</p>
            <p className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.28)", letterSpacing: "0.04em" }}>
              {draftItems.length} draft{draftItems.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* New Sermon — prominent CTA */}
          <button onClick={onNew}
            className="flex items-center gap-1.5 rounded-xl transition-all active:scale-95"
            style={{
              height: 36, paddingLeft: 14, paddingRight: 14,
              background: "linear-gradient(135deg,rgba(var(--wf-c1),0.85),rgba(var(--wf-c2),0.75))",
              boxShadow: "0 2px 10px rgba(var(--wf-c1),0.35)",
              color: "#fff", fontSize: 13, fontWeight: 700,
            }}
            title="New sermon draft">
            <Plus size={15} />
            <span>New</span>
          </button>
          {/* Collapse */}
          <button onClick={onClose}
            className="flex items-center justify-center rounded-xl transition-all active:scale-95"
            style={{ width: 36, height: 36, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" }}
            title="Collapse panel"
            onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}>
            <PanelRight size={16} />
          </button>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────── */}
      <div className="flex shrink-0" style={{ borderBottom: '2px solid rgba(255,255,255,0.06)' }}>
        {(['drafts', 'submitted'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 flex items-center justify-center gap-1.5 transition-all"
            style={{
              height: 46,
              fontSize: 13, fontWeight: 700,
              letterSpacing: '0.05em', textTransform: 'uppercase',
              background: 'none', border: 'none', cursor: 'pointer',
              color: tab === t ? 'var(--wf-at2)' : 'rgba(255,255,255,0.28)',
              borderBottom: tab === t ? '2px solid var(--wf-c1-hex)' : '2px solid transparent',
              marginBottom: -2,
            }}>
            {t === 'drafts' ? <PenLine size={13} /> : <SendHorizonal size={13} />}
            {t === 'drafts' ? `Drafts${draftItems.length > 0 ? ` (${draftItems.length})` : ''}` : 'Submitted'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto py-3"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.06) transparent", paddingLeft: 16, paddingRight: 16 }}>

        {/* ── DRAFTS ── */}
        {tab === 'drafts' && (
          <>
            {draftItems.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <div className="flex items-center justify-center rounded-2xl mb-3"
                  style={{ width: 48, height: 48, background: "rgba(var(--wf-c1),0.08)", border: "1px solid rgba(var(--wf-c1),0.12)" }}>
                  <Mic2 size={20} style={{ color: "rgba(var(--wf-c1),0.35)" }} />
                </div>
                <p className="text-[12px] font-semibold" style={{ color: "rgba(255,255,255,0.25)" }}>No drafts yet</p>
                <p className="text-[11px] mt-1 text-center" style={{ color: "rgba(255,255,255,0.12)" }}>Tap the + button above to start your first sermon draft.</p>
              </div>
            )}
            {draftItems.map(d => (
              <div key={d.id} onClick={() => onSelect(d.id)}
                className="w-full text-left rounded-2xl mb-2.5 cursor-pointer group transition-all relative overflow-hidden"
                style={{
                  background: activeDraftId === d.id
                    ? "linear-gradient(135deg, rgba(var(--wf-c1),0.18) 0%, rgba(var(--wf-c2),0.1) 100%)"
                    : "rgba(255,255,255,0.03)",
                  border: activeDraftId === d.id
                    ? "1px solid rgba(var(--wf-c1),0.35)"
                    : "1px solid rgba(255,255,255,0.06)",
                  boxShadow: activeDraftId === d.id ? "0 4px 20px rgba(var(--wf-c1),0.12)" : "none",
                }}>
                {/* Active indicator bar */}
                {activeDraftId === d.id && (
                  <div className="absolute left-0 top-0 bottom-0" style={{ width: 3, background: "linear-gradient(180deg, var(--wf-c1-hex), var(--wf-c2-hex))", borderRadius: "2px 0 0 2px" }} />
                )}
                <div className="px-4 pt-3 pb-3" style={{ paddingLeft: activeDraftId === d.id ? 16 : 16 }}>
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold truncate leading-tight"
                        style={{ fontSize: 14, color: activeDraftId === d.id ? "#fff" : "rgba(255,255,255,0.8)", letterSpacing: "0.01em" }}>
                        {d.title || "Untitled Sermon"}
                      </p>
                      {d.subtitle && (
                        <p className="truncate mt-0.5"
                          style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", letterSpacing: "0.03em", textTransform: "uppercase", fontWeight: 600 }}>
                          {d.subtitle}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Scripture pill */}
                  {(d.scriptures?.[0]?.text || d.mainVerse) && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <BookOpen size={10} style={{ color: "rgba(var(--wf-c1),0.6)", flexShrink: 0 }} />
                      <p className="text-[11px] truncate" style={{ color: "rgba(var(--wf-c1),0.75)", fontWeight: 500 }}>
                        {d.scriptures?.[0]?.text || d.mainVerse}
                        {(d.scriptures?.length ?? 0) > 1 && <span style={{ color: "rgba(var(--wf-c1),0.45)" }}> +{d.scriptures!.length - 1}</span>}
                      </p>
                    </div>
                  )}

                  {/* Meta row: date + service type */}
                  {(d.scheduledDate || d.serviceType) && (
                    <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                      {d.scheduledDate && (
                        <span className="flex items-center gap-1 rounded-full px-2 py-0.5"
                          style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}>
                          <CalendarDays size={9} style={{ color: "rgba(245,158,11,0.8)" }} />
                          <span style={{ fontSize: 10, color: "rgba(245,158,11,0.9)", fontWeight: 600, letterSpacing: "0.02em" }}>
                            {new Date(d.scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        </span>
                      )}
                      {d.serviceType && (
                        <span className="flex items-center gap-1 rounded-full px-2 py-0.5"
                          style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)" }}>
                          <span style={{ fontSize: 10, color: "rgba(52,211,153,0.9)", fontWeight: 600, letterSpacing: "0.02em" }}>
                            {d.serviceType}
                          </span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Action buttons — always visible at bottom right */}
                  <div className="flex items-center justify-between gap-1.5 mt-3 pt-2.5"
                    style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    {/* Preview eye */}
                    <button
                      onClick={e => { e.stopPropagation(); onPreview(d.id); }}
                      title="Preview sermon"
                      className="flex items-center justify-center rounded-full transition-all active:scale-95"
                      style={{ width: 28, height: 28, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}
                    >
                      <Eye size={12} />
                    </button>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={e => { e.stopPropagation(); onSubmit(d.id); }}
                        title="Submit to team"
                        className="flex items-center gap-1.5 rounded-full px-3 transition-all active:scale-95"
                        style={{ height: 28, background: "rgba(var(--wf-c1),0.15)", border: "1px solid rgba(var(--wf-c1),0.3)", color: "var(--wf-at2)", fontSize: 11, fontWeight: 600 }}
                      >
                        <SendHorizonal size={11} /> Submit
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); onDelete(d.id); }}
                        title="Delete draft"
                        className="flex items-center justify-center rounded-full transition-all active:scale-95"
                        style={{ width: 28, height: 28, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── SUBMITTED ── */}
        {tab === 'submitted' && (
          <>
            {submitted.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <div className="flex items-center justify-center rounded-2xl mb-3"
                  style={{ width: 48, height: 48, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.15)" }}>
                  <SendHorizonal size={20} style={{ color: "rgba(52,211,153,0.4)" }} />
                </div>
                <p className="text-[12px] font-semibold" style={{ color: "rgba(255,255,255,0.25)" }}>No submitted sermons yet</p>
                <p className="text-[11px] mt-1 text-center" style={{ color: "rgba(255,255,255,0.12)" }}>Submitted sermons will appear here for team monitoring.</p>
              </div>
            )}
            {submitted.map(d => (
              <div key={d.id}
                className="w-full text-left rounded-2xl mb-2.5 overflow-hidden"
                style={{ background: "rgba(52,211,153,0.04)", border: "1px solid rgba(52,211,153,0.15)" }}>
                <div className="px-4 pt-3 pb-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Check size={10} style={{ color: "#34d399" }} />
                    <span style={{ fontSize: 10, color: "#34d399", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Submitted</span>
                  </div>
                  <p className="font-bold truncate" style={{ fontSize: 14, color: "rgba(255,255,255,0.8)" }}>{d.title || "Untitled Sermon"}</p>
                  {d.subtitle && <p className="truncate mt-0.5" style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.03em" }}>{d.subtitle}</p>}

                  {/* ── Design Status from Audio/Tech ── */}
                  <div className="mt-2.5">
                    {d.designStatus === 'design_done' ? (
                      <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 w-fit"
                        style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)" }}>
                        <span style={{ fontSize: 13 }}>✅</span>
                        <span style={{ fontSize: 10, color: "#34d399", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>Slides Ready!</span>
                        {d.designerName && (
                          <span style={{ fontSize: 10, color: "rgba(52,211,153,0.65)", fontWeight: 500 }}>· by {d.designerName.split(' ')[0]}</span>
                        )}
                      </div>
                    ) : d.designStatus === 'in_design' ? (
                      <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 w-fit"
                        style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)" }}>
                        <span style={{ fontSize: 11 }}>🎨</span>
                        <span style={{ fontSize: 10, color: "#a78bfa", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                          {d.designerName ? `${d.designerName.split(' ')[0]} is designing your slides` : 'Design in Progress'}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 w-fit"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <span style={{ fontSize: 11 }}>⏳</span>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>Awaiting Designer</span>
                      </div>
                    )}
                  </div>

                  {(d.scheduledDate || d.serviceType) && (
                    <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                      {d.scheduledDate && (
                        <span className="flex items-center gap-1 rounded-full px-2 py-0.5"
                          style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}>
                          <CalendarDays size={9} style={{ color: "rgba(245,158,11,0.8)" }} />
                          <span style={{ fontSize: 10, color: "rgba(245,158,11,0.9)", fontWeight: 600 }}>
                            {new Date(d.scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        </span>
                      )}
                      {d.serviceType && (
                        <span className="rounded-full px-2 py-0.5"
                          style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", fontSize: 10, color: "rgba(52,211,153,0.9)", fontWeight: 600 }}>
                          {d.serviceType}
                        </span>
                      )}
                    </div>
                  )}
                  {/* Action row */}
                  <div className="flex items-center gap-1.5 mt-3 pt-2.5"
                    style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <button
                      onClick={e => { e.stopPropagation(); onPreview(d.id); }}
                      title="Preview sermon"
                      className="flex items-center justify-center rounded-full transition-all active:scale-95"
                      style={{ width: 28, height: 28, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}
                    >
                      <Eye size={12} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); onRecallEdit(d.id); }}
                      title="Recall & Edit"
                      className="flex items-center gap-1.5 rounded-full px-3 flex-1 justify-center transition-all active:scale-95"
                      style={{ height: 28, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.28)", color: "#fbbf24", fontSize: 11, fontWeight: 600 }}
                    >
                      <PenLine size={11} /> Edit
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

      </div>
    </div>
  );
}

// ── Types for main component ──────────────────────────────────────────────────
interface Props {
  currentUser: { uid: string; name?: string; email?: string; photo?: string };
  onToast?: (type: "success" | "error" | "info", message: string) => void;
  initialTab?: 'drafts' | 'submitted';
}

const EMPTY_DRAFT = (userId: string, userName: string): SermonDraft => ({
  id: uid(), title: "", subtitle: "", mainVerse: "",
  scriptures: [{ id: uid(), text: '' }],
  introduction: "", mainPassage: "",
  keyPointsTitle: "",
  keyPoints: [{ id: uid(), heading: "", scripture: "", scriptures: [{ id: uid(), text: '' }], body: "" }],
  freeNotes: "", application: "", closingPrayer: "", collectedVerses: [],
  authorId: userId, authorName: userName, scheduledDate: "",
  serviceType: "",
  previewHidden: {},
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});

// ── Main PreachingView ────────────────────────────────────────────────────────
export default function PreachingView({ currentUser, onToast, initialTab }: Props) {
  const [drafts, setDrafts] = useState<SermonDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [bibleOpen, setBibleOpen] = useState(true);
  const [draftsOpen, setDraftsOpen] = useState(true); // open by default so +New is always visible
  const [freeCanvasOpen, setFreeCanvasOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"canvas" | "bible" | "sermons">("sermons");
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoGlowing, setInfoGlowing] = useState(() => !localStorage.getItem("wf_preaching_info_seen"));
  // Lifted accordion state — controlled here so handleInsertVerse can open the right section
  const [openSection, setOpenSection] = useState<string | null>(null);
  // Preview modal — can be opened from the draft list directly
  const [previewDraftId, setPreviewDraftId] = useState<string | null>(null);
  const previewDraft = previewDraftId ? drafts.find(d => d.id === previewDraftId) ?? null : null;
  // ── Confirm modal state ──────────────────────────────────────────────────────
  const [confirmState, setConfirmState] = useState<{
    open: boolean; title: string; message: string; detail?: string;
    confirmLabel: string; confirmColor: string;
    onConfirm: () => void;
    loading: boolean;
  }>({
    open: false, title: "", message: "", confirmLabel: "Confirm",
    confirmColor: "#ef4444", onConfirm: () => {}, loading: false,
  });
  const showConfirm = (opts: Omit<typeof confirmState, "open" | "loading">) =>
    setConfirmState({ ...opts, open: true, loading: false });
  const closeConfirm = () => setConfirmState(s => ({ ...s, open: false }));
  const setConfirmLoading = (v: boolean) => setConfirmState(s => ({ ...s, loading: v }));
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFocusedEl     = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const lastFocusedTarget = useRef<FieldTarget | null>(null);
  // Always-current refs — used by handleSave to avoid stale closures in auto-save timer
  const draftsRef = useRef<SermonDraft[]>(drafts);
  const activeDraftIdRef = useRef<string | null>(activeDraftId);
  useEffect(() => { draftsRef.current = drafts; }, [drafts]);
  useEffect(() => { activeDraftIdRef.current = activeDraftId; }, [activeDraftId]);
  const userName = currentUser.name || currentUser.email || "Preacher";
  const activeDraft = drafts.find(d => d.id === activeDraftId) ?? null;

  const fetchDrafts = useCallback(async () => {
    try {
      const res = await fetch(`/api/preaching-drafts?userId=${currentUser.uid}`);
      if (res.ok) {
        const data: SermonDraft[] = await res.json();
        // Migrate legacy drafts that have mainVerse but no scriptures array
        const migrated = data.map(d => ({
          ...d,
          scriptures: (d.scriptures && d.scriptures.length > 0)
            ? d.scriptures
            : (d.mainVerse ? [{ id: uid(), text: d.mainVerse }] : [{ id: uid(), text: '' }]),
          keyPoints: (d.keyPoints || []).map((kp: any) => ({
            ...kp,
            scriptures: (kp.scriptures && kp.scriptures.length > 0)
              ? kp.scriptures
              : (kp.scripture ? [{ id: uid(), text: kp.scripture }] : [{ id: uid(), text: '' }]),
          })),
        }));
        setDrafts(migrated);
        // Only auto-select EDITABLE (non-submitted) drafts — submitted drafts should NOT unlock the panel
        const editableDrafts = migrated.filter(d => d.status !== 'submitted');
        if (editableDrafts.length > 0 && !activeDraftId) setActiveDraftId(editableDrafts[0].id);
        // Open the drafts panel only if there are editable drafts to show
        if (editableDrafts.length > 0) setDraftsOpen(true);
        else if (migrated.length > 0) setDraftsOpen(true); // still show panel for submitted tab
      }
    } catch { /* silently */ }
    setLoadingDrafts(false);
  }, [currentUser.uid, activeDraftId]);

  useEffect(() => { fetchDrafts(); }, []);

  const handleNew = async () => {
    const draft = EMPTY_DRAFT(currentUser.uid, userName);
    setDrafts(prev => [draft, ...prev]);
    setActiveDraftId(draft.id);
    setDraftsOpen(true); // reveal the panel so they can see the new draft in the list
    // Immediately persist so it survives a refresh
    try {
      await fetch("/api/preaching-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
    } catch { /* silently — auto-save will retry on first keystroke */ }
  };

  const handleChange = (field: keyof SermonDraft, value: any) => {
    const update = (field === 'title' || field === 'subtitle') ? (value as string).toUpperCase() : value;
    setDrafts(prev => prev.map(d => d.id === activeDraftId ? { ...d, [field]: update, updatedAt: new Date().toISOString() } : d));
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => handleSave(true), 4000);
  };

  const handleSave = useCallback(async (silent = false) => {
    // Read from refs so auto-save timer always gets the latest draft, not a stale closure
    const raw = draftsRef.current.find(d => d.id === activeDraftIdRef.current);
    if (!raw) return;
    const draft = { ...raw, title: raw.title.toUpperCase(), subtitle: raw.subtitle.toUpperCase() };
    setSaving(true);
    try {
      const res = await fetch(`/api/preaching-drafts/${draft.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
      });
      if (res.status === 404) {
        await fetch("/api/preaching-drafts", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
        });
      }
      if (!silent) onToast?.("success", "Sermon draft saved!");
    } catch { if (!silent) onToast?.("error", "Could not save draft."); }
    setSaving(false);
  }, [onToast]); // No drafts/activeDraftId dep — always reads fresh from refs

  const handleDelete = async (id: string) => {
    const draft = draftsRef.current.find(d => d.id === id);
    const title = draft?.title || "Untitled Sermon";
    showConfirm({
      title: "Delete Sermon Draft",
      message: `"${title}" will be permanently deleted.`,
      detail: "This action cannot be undone.",
      confirmLabel: "Delete",
      confirmColor: "#ef4444",
      onConfirm: async () => {
        setConfirmLoading(true);
        // Remove from state first, then figure out next selection
        const remaining = draftsRef.current.filter(d => d.id !== id);
        setDrafts(remaining);
        // Only select an editable (non-submitted) draft as next active; otherwise go to null (locked state)
        if (activeDraftId === id) {
          const nextEditable = remaining.find(d => d.status !== 'submitted');
          setActiveDraftId(nextEditable?.id ?? null);
        }
        try {
          await fetch(`/api/preaching-drafts/${id}`, { method: "DELETE" });
          onToast?.("success", `"${title}" deleted.`);
        } catch { onToast?.("error", "Could not delete draft."); }
        closeConfirm();
      },
    });
  };

  // Submit draft to team → moves it to Design Requests for Audio/Tech
  const handleSubmitDraft = async (id: string) => {
    const draft = drafts.find(d => d.id === id);
    const title = draft?.title || "Untitled Sermon";
    showConfirm({
      title: "Submit to Design Requests",
      message: `"${title}" will be sent to the Design Requests queue for your Audio/Tech team.`,
      detail: "It will be removed from your Drafts list.",
      confirmLabel: "Submit",
      confirmColor: "var(--wf-c1-hex)",
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`/api/preaching-drafts/${id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "submitted",
              submittedBy: currentUser.uid,
              submittedByName: userName,
            }),
          });
          if (!res.ok) throw new Error("Server error");
          const json = await res.json();
          const newVersion: number = json.submissionVersion ?? 1;
          // Mark draft as submitted with version in local state (stays visible in Submitted tab)
          setDrafts(prev => prev.map(d => d.id === id
            ? { ...d, status: "submitted" as const, submissionVersion: newVersion }
            : d
          ));
          if (activeDraftId === id) {
            const remaining = draftsRef.current.filter(d => d.id !== id && d.status !== 'submitted');
            setActiveDraftId(remaining[0]?.id ?? null);
          }
          onToast?.("success", newVersion > 1
            ? `"${title}" re-submitted — Audio/Tech will see the Latest Version ✅`
            : `"${title}" submitted to Design Requests ✅`
          );
        } catch {
          onToast?.("error", "Could not submit draft. Please try again.");
        }
        closeConfirm();
      },
    });
  };

  // Recall a submitted draft back to 'draft' and open it for editing
  const handleRecallEdit = (id: string) => {
    const draft = drafts.find(d => d.id === id);
    const title = draft?.title || "Untitled Sermon";
    showConfirm({
      title: "Edit Submitted Sermon",
      message: `"${title}" will be recalled back to your Drafts so you can make changes.`,
      detail: "It will be removed from the Design Requests queue until you re-submit.",
      confirmLabel: "Edit Draft",
      confirmColor: "#f59e0b",
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`/api/preaching-drafts/${id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "draft" }),
          });
          if (!res.ok) throw new Error("Server error");
          // Update local state: set status back to draft, keep submissionVersion intact
          // so next re-submit still shows 'Latest Version' badge
          setDrafts(prev => prev.map(d => d.id === id ? { ...d, status: "draft" as const } : d));
          setActiveDraftId(id);
          onToast?.("success", `"${title}" is back in Drafts — ready to edit!`);
        } catch {
          onToast?.("error", "Could not recall draft. Please try again.");
        }
        closeConfirm();
      },
    });
  };

  const handleCollect = (verse: CollectedVerse) => {
    if (activeDraft?.collectedVerses.some(v => v.ref === verse.ref)) {
      onToast?.("info", `${verse.ref} already in your collection`); return;
    }
    handleChange("collectedVerses", [...(activeDraft?.collectedVerses ?? []), verse]);
    onToast?.("success", `${verse.ref} added to sermon`);
  };
  const handleRemoveVerse = (ref: string) =>
    handleChange("collectedVerses", activeDraft?.collectedVerses.filter(v => v.ref !== ref) ?? []);

  // Insert verse at the last focused field — closure-free, reads current state at call time
   const handleInsertVerse = (ref: string, text: string, translation: string) => {
    const formatted = `${ref} ${translation} - ${text}`;
    const el     = lastFocusedEl.current;
    const target = lastFocusedTarget.current;

    // Map the focused target → accordion section key so we can open it
    const sectionForTarget = (t: FieldTarget | null): string | null => {
      if (!t) return "mainPassage";
      if (t.type === "kp") return "keyPoints";
      switch (t.field) {
        case "scriptures": case "mainVerse": return "mainTitle";
        case "introduction":   return "introduction";
        case "mainPassage":    return "mainPassage";
        case "freeNotes":      return "freeNotes";
        case "application":    return "application";
        case "closingPrayer":  return "closingPrayer";
        default:               return "mainPassage";
      }
    };

    if (el && target) {
      const pos    = el.selectionStart ?? el.value.length;
      const end    = el.selectionEnd   ?? pos;
      const before = el.value.slice(0, pos);
      const after  = el.value.slice(end);
      const prefix = before && !before.endsWith('\n') ? '\n\n' : '';
      const suffix = after  && !after.startsWith('\n')  ? '\n'   : '';
      const toInsert = prefix + formatted + suffix;
      const newVal   = before + toInsert + after;
      const newPos   = pos + toInsert.length;

      if (target.type === 'draft') {
        if (target.field === 'scriptures' && target.scriptureIdx !== undefined) {
          const idx = target.scriptureIdx;
          const cur = activeDraft?.scriptures ?? [];
          const currentText = cur[idx]?.text ?? '';
          if (currentText.trim()) {
            // Field already has a verse — add a NEW card instead of appending
            const newEntry = { id: uid(), text: formatted };
            const updated = [...cur, newEntry];
            handleChange('scriptures', updated);
            handleChange('mainVerse', updated[0]?.text ?? '');
            onToast?.('info', `Added as a new verse card`);
          } else {
            // Field is empty — insert normally
            const updated = cur.map((s, i) => i === idx ? { ...s, text: formatted } : s);
            handleChange('scriptures', updated);
            handleChange('mainVerse', updated[0]?.text ?? '');
            onToast?.('success', `${ref} inserted`);
          }
        } else {
          handleChange(target.field, newVal);
          onToast?.('success', `${ref} inserted`);
        }
      } else {
        // Key point field
        if (target.kpField === 'scripture' && target.kpScriptureIdx !== undefined) {
          const sidx = target.kpScriptureIdx;
          const kps = activeDraft?.keyPoints ?? [];
          const kp = kps.find(k => k.id === target.kpId);
          const list = (kp?.scriptures && kp.scriptures.length > 0)
            ? kp.scriptures
            : [{ id: uid(), text: kp?.scripture || '' }];
          const currentText = list[sidx]?.text ?? '';
          let newList;
          if (currentText.trim()) {
            // Field already has a verse — add a NEW card instead of appending
            newList = [...list, { id: uid(), text: formatted }];
            onToast?.('info', `Added as a new verse card`);
          } else {
            // Field is empty — insert normally
            newList = list.map((s, i) => i === sidx ? { ...s, text: formatted } : s);
            onToast?.('success', `${ref} inserted`);
          }
          const updated = kps.map(k => {
            if (k.id !== target.kpId) return k;
            return { ...k, scriptures: newList, scripture: newList[0]?.text ?? '' };
          });
          handleChange('keyPoints', updated);
        } else {
          handleChange('keyPoints',
            (activeDraft?.keyPoints ?? []).map(k =>
              k.id === target.kpId ? { ...k, [target.kpField]: newVal } : k
            )
          );
          onToast?.('success', `${ref} inserted`);
        }
      }

    } else {
      // No field is focused — warn the user instead of silently appending
      onToast?.('error',
        '⚠️ Click inside a field first (e.g. Introduction, Key Points) — then insert the verse there.'
      );
      return; // bail out — don’t insert anywhere
    }
    // Switch to canvas tab and open the correct accordion
    setMobileTab('canvas');
    setOpenSection(sectionForTarget(target));
  };

  useEffect(() => () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); }, []);

  // Shared empty/loading canvas render (reused on desktop + mobile)
  const canvasArea = (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      {loadingDrafts ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-indigo-400" />
        </div>
      ) : !activeDraft ? (
        <div className="flex-1 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.12)" }}>
          <div className="text-center px-8">
            <div className="w-16 h-20 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ background: "linear-gradient(135deg, rgba(var(--wf-c1),0.12), rgba(var(--wf-c2),0.08))", border: "1px solid rgba(var(--wf-c1),0.15)" }}>
              <BookOpen size={28} className="opacity-30" style={{ color: "var(--wf-at)" }} />
            </div>
            <h2 className="text-xl font-bold mb-2" style={{ color: "rgba(255,255,255,0.25)" }}>Canvas Locked</h2>
            <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.18)" }}>
              Click <span style={{ color: "rgba(var(--wf-c1),0.7)", fontWeight: 700 }}>+ New</span> in the sidebar to create your sermon draft.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <>
    <div className="flex flex-col flex-1 h-full min-h-0 overflow-hidden" style={{ background: "var(--wf-bg6)" }}>

      {/* ══════════ DESKTOP layout lg+ ══════════ */}
      <div className="hidden lg:flex flex-1 min-h-0 overflow-hidden">

        {/* My Sermons sidebar — left collapsible */}
        {draftsOpen ? (
          <div className="flex h-full shrink-0 flex-col" style={{ width: 300, borderRight: "1px solid rgba(255,255,255,0.06)" }}>
            <DraftList
              drafts={drafts} activeDraftId={activeDraftId}
              onSelect={id => { setActiveDraftId(id); }}
              onNew={handleNew} onDelete={handleDelete} onSubmit={handleSubmitDraft}
              onRecallEdit={handleRecallEdit}
              onPreview={id => setPreviewDraftId(id)}
              onClose={() => setDraftsOpen(false)}
              onInfo={() => { setInfoOpen(true); if (infoGlowing) { localStorage.setItem('wf_preaching_info_seen','1'); setInfoGlowing(false); } }}
              infoGlowing={infoGlowing}
              currentUserName={currentUser?.name || ""}
              initialTab={initialTab}
            />
          </div>
        ) : (
          <div className="flex w-9 h-full shrink-0 flex-col"
            style={{ background: "var(--wf-bg1)", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
            {/* Spacer matching canvas top bar height */}
            <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", height: 45, flexShrink: 0 }} />
            <div className="flex flex-col items-center pt-3 gap-2">
              <button onClick={() => setDraftsOpen(true)} title="Expand My Sermons"
                className="p-1.5 rounded-lg transition-all hover:scale-110"
                style={{ color: "rgba(251,191,36,0.6)", background: "rgba(245,158,11,0.1)" }}>
                <PanelLeft size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {loadingDrafts ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-indigo-400" />
            </div>
          ) : freeCanvasOpen ? (
            <FreeCanvas onClose={() => setFreeCanvasOpen(false)} />
          ) : !activeDraft ? (
            <div className="relative flex-1 overflow-hidden">
              {/* Grayed accordion skeleton — visible but disabled */}
              <div className="absolute inset-0 overflow-hidden px-4 pt-4 space-y-3 opacity-[0.12] pointer-events-none select-none" aria-hidden="true">
                {/* Dummy canvas header */}
                <div className="flex items-center justify-between px-4 mb-2" style={{ height: 45, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="h-4 w-48 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
                  <div className="h-8 w-20 rounded-xl" style={{ background: "rgba(var(--wf-c1),0.3)" }} />
                </div>
                {["SERVICE INFO","MAIN TITLE","INTRODUCTION","MAIN PASSAGE","KEY POINTS","FREE NOTES & ILLUSTRATIONS","APPLICATION / CHALLENGE","END / CLOSING PRAYER"].map(label => (
                  <div key={label} className="rounded-2xl flex items-center gap-4 px-5"
                    style={{ height: 56, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="w-4 h-4 rounded-full" style={{ background: "rgba(255,255,255,0.2)" }} />
                    <span className="text-[13px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>{label}</span>
                  </div>
                ))}
              </div>

              {/* Frosted-glass overlay */}
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center"
                style={{ background: "var(--wf-overlay)", backdropFilter: "blur(8px)" }}>
                <div className="text-center px-8 max-w-sm">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
                    style={{ background: "rgba(var(--wf-c1),0.08)", border: "1px solid rgba(var(--wf-c1),0.2)" }}>
                    <BookOpen size={26} style={{ color: "rgba(var(--wf-c1),0.4)" }} />
                  </div>
                  <h2 className="text-[18px] font-bold mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>Canvas is Locked</h2>
                  <p className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.22)" }}>
                    Click <span style={{ color: "var(--wf-at)", fontWeight: 700 }}>+ New</span> in the left panel to create your sermon draft and unlock all editing tools.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <SermonCanvas
              draft={activeDraft} onChange={handleChange}
              onSave={() => handleSave(false)} saving={saving}
              collectedVerses={activeDraft.collectedVerses} onRemoveVerse={handleRemoveVerse}
              bibleOpen={bibleOpen} draftsOpen={draftsOpen}
              onToggleBible={() => setBibleOpen(true)} onToggleDrafts={() => setDraftsOpen(true)}
              onFieldFocus={(el, tgt) => { lastFocusedEl.current = el; lastFocusedTarget.current = tgt; }}
              openSection={openSection} onSetSection={setOpenSection}
            />
          )}
        </div>


        {/* Bible — right collapsible */}
        {bibleOpen ? (
          <div className="flex h-full shrink-0 flex-col" style={{ width: 300, borderLeft: "1px solid rgba(255,255,255,0.06)", position: "relative" }}>
            {/* Disabled overlay when no draft is active */}
            {!activeDraft && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center"
                style={{ background: "var(--wf-overlay)", backdropFilter: "blur(4px)", borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex flex-col items-center gap-3 px-6 text-center">
                  <div className="flex items-center justify-center rounded-2xl"
                    style={{ width: 52, height: 52, background: "rgba(var(--wf-c1),0.08)", border: "1px solid rgba(var(--wf-c1),0.15)" }}>
                    <BookOpen size={22} style={{ color: "rgba(var(--wf-c1),0.35)" }} />
                  </div>
                  <p className="text-[13px] font-bold" style={{ color: "rgba(255,255,255,0.25)" }}>Bible Locked</p>
                  <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.15)" }}>
                    Create a draft first to unlock the Bible panel and start inserting verses.
                  </p>
                </div>
              </div>
            )}
            <BiblePanel onCollect={handleCollect} onClose={() => setBibleOpen(false)}
            onInsert={handleInsertVerse} />
          </div>
        ) : (
          <div className="flex w-9 h-full shrink-0 flex-col"
            style={{ background: "var(--wf-bg1)", borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
            {/* Spacer matching canvas top bar height */}
            <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", height: 45, flexShrink: 0 }} />
            <div className="flex flex-col items-center pt-3 gap-2">
              <button onClick={() => setBibleOpen(true)} title="Expand Bible"
                className="p-1.5 rounded-lg transition-all hover:scale-110"
                style={{ color: "rgba(var(--wf-c3),0.6)", background: "rgba(var(--wf-c1),0.1)" }}>
                <PanelRight size={14} />
              </button>
              <div className="flex-1 flex items-center">
                <BookOpen size={12} style={{ color: "rgba(var(--wf-c1),0.4)" }} />
              </div>
              <div className="flex items-center">
                <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", color: "rgba(255,255,255,0.18)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>Bible</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══════════ MOBILE + TABLET layout < lg ══════════ */}
      <div className="flex lg:hidden flex-col flex-1 min-h-0 overflow-hidden">

        {/* Content: full-screen per tab */}
        <div className="flex-1 min-h-0 overflow-hidden">

          {/* CANVAS TAB */}
          {mobileTab === "canvas" && (
            <div className="flex flex-col h-full overflow-hidden">
              {loadingDrafts ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 size={24} className="animate-spin text-indigo-400" />
                </div>
              ) : freeCanvasOpen ? (
                <FreeCanvas onClose={() => setFreeCanvasOpen(false)} />
              ) : !activeDraft ? (
                <div className="relative flex-1 overflow-hidden">
                  {/* Grayed skeleton */}
                  <div className="absolute inset-0 overflow-hidden px-4 pt-4 space-y-3 opacity-[0.12] pointer-events-none select-none" aria-hidden="true">
                    <div className="flex items-center justify-between px-4 mb-2" style={{ height: 45, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <div className="h-4 w-48 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
                      <div className="h-8 w-20 rounded-xl" style={{ background: "rgba(var(--wf-c1),0.3)" }} />
                    </div>
                    {["SERVICE INFO","MAIN TITLE","INTRODUCTION","MAIN PASSAGE","KEY POINTS"].map(label => (
                      <div key={label} className="rounded-2xl flex items-center gap-4 px-5"
                        style={{ height: 56, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <div className="w-4 h-4 rounded-full" style={{ background: "rgba(255,255,255,0.2)" }} />
                        <span className="text-[13px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>{label}</span>
                      </div>
                    ))}
                  </div>
                  {/* Frosted lock overlay */}
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center"
                    style={{ background: "var(--wf-overlay)", backdropFilter: "blur(8px)" }}>
                    <div className="text-center px-8 max-w-sm">
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
                        style={{ background: "rgba(var(--wf-c1),0.08)", border: "1px solid rgba(var(--wf-c1),0.2)" }}>
                        <BookOpen size={26} style={{ color: "rgba(var(--wf-c1),0.4)" }} />
                      </div>
                      <h2 className="text-[18px] font-bold mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>Canvas is Locked</h2>
                      <p className="text-[13px] leading-relaxed mb-6" style={{ color: "rgba(255,255,255,0.22)" }}>
                        Tap <span style={{ color: "var(--wf-at)", fontWeight: 700 }}>+ New</span> to create your sermon draft and unlock all editing tools.
                      </p>
                      <button onClick={handleNew}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95 mx-auto"
                        style={{ background: "var(--wf-c1-grd)", color: "#fff" }}>
                        <Plus size={16} /> New Sermon Draft
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <SermonCanvas
                  draft={activeDraft} onChange={handleChange}
                  onSave={() => handleSave(false)} saving={saving}
                  collectedVerses={activeDraft.collectedVerses} onRemoveVerse={handleRemoveVerse}
                  bibleOpen={false} draftsOpen={false}
                  onToggleBible={() => setMobileTab("bible")}
                  onToggleDrafts={() => setMobileTab("sermons")}
                  onFieldFocus={(el, tgt) => { lastFocusedEl.current = el; lastFocusedTarget.current = tgt; }}
                  openSection={openSection} onSetSection={setOpenSection}
                />
              )}
            </div>
          )}

          {/* BIBLE TAB */}
          {mobileTab === "bible" && (
            !activeDraft ? (
              <div className="flex-1 flex items-center justify-center h-full" style={{ background: "var(--wf-bg6)" }}>
                <div className="text-center px-8">
                  <div className="flex items-center justify-center rounded-2xl mb-4 mx-auto"
                    style={{ width: 56, height: 56, background: "rgba(var(--wf-c1),0.08)", border: "1px solid rgba(var(--wf-c1),0.2)" }}>
                    <BookOpen size={24} style={{ color: "rgba(var(--wf-c1),0.35)" }} />
                  </div>
                  <p className="text-[16px] font-bold mb-2" style={{ color: "rgba(255,255,255,0.35)" }}>Bible Locked</p>
                  <p className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.18)" }}>
                    Create a draft first to unlock the Bible panel and start inserting verses.
                  </p>
                </div>
              </div>
            ) : (
              <BiblePanel
                onCollect={v => { handleCollect(v); setMobileTab("canvas"); }}
                onClose={() => setMobileTab("canvas")}
                onInsert={handleInsertVerse}
              />
            )
          )}
          {/* SERMONS TAB */}
          {mobileTab === "sermons" && (
            <DraftList
              drafts={drafts} activeDraftId={activeDraftId}
              onSelect={id => { setActiveDraftId(id); setMobileTab("canvas"); }}
              onNew={() => { handleNew(); setMobileTab("canvas"); }}
              onDelete={handleDelete} onSubmit={handleSubmitDraft}
              onRecallEdit={id => { handleRecallEdit(id); setMobileTab("canvas"); }}
              onPreview={id => setPreviewDraftId(id)}
              onClose={() => setMobileTab("canvas")}
              onInfo={() => { setInfoOpen(true); if (infoGlowing) { localStorage.setItem('wf_preaching_info_seen','1'); setInfoGlowing(false); } }}
              infoGlowing={infoGlowing}
              currentUserName={currentUser?.name || ""}
              initialTab={initialTab}
            />
          )}
        </div>

        {/* ── Mobile bottom tab bar ── */}
        <div className="shrink-0 flex"
          style={{ background: "var(--wf-bg5)", borderTop: "1px solid rgba(255,255,255,0.08)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          {([
            { id: "sermons" as const, icon: <Mic2 size={22} />,     label: "Sermons" },
            { id: "canvas"  as const, icon: <FileText size={22} />,  label: "Canvas" },
            { id: "bible"   as const, icon: <BookOpen size={22} />, label: "Bible" },
          ]).map(tab => {
            const active = mobileTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setMobileTab(tab.id)}
                className="flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors"
                style={{
                  color: active ? "var(--wf-at)" : "rgba(255,255,255,0.3)",
                  background: active ? "rgba(var(--wf-c1),0.07)" : "transparent",
                  borderTop: `2px solid ${active ? "var(--wf-c1-hex)" : "transparent"}`,
                }}>
                {tab.icon}
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>

    {/* ── Confirm Modal ── */}
    <ConfirmModal
      open={confirmState.open}
      title={confirmState.title}
      message={confirmState.message}
      detail={confirmState.detail}
      confirmLabel={confirmState.confirmLabel}
      confirmColor={confirmState.confirmColor}
      loading={confirmState.loading}
      onConfirm={confirmState.onConfirm}
      onCancel={closeConfirm}
    />

    {/* ── Preview Modal (from draft list eye button) ── */}
    {previewDraft && (
      <SermonPreviewModal
        draft={previewDraft}
        onClose={() => setPreviewDraftId(null)}
      />
    )}

    {/* ── Preaching Info Modal ── */}
    {infoOpen && (
      <PreachingInfoModal onClose={() => setInfoOpen(false)} />
    )}
    </>
  );
}
