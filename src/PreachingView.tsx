import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Mic2, BookOpen, Plus, Save, Clock, FileText, ChevronDown,
  ChevronUp, Trash2, X, BookMarked, Lightbulb, Heart, Star,
  PlusCircle, Check, Loader2, RefreshCw, List, GripVertical, CalendarDays,
  ChevronLeft, ChevronRight, PanelRight, PanelLeft, CornerDownLeft, Eye, EyeOff, Printer, PenLine,
  SendHorizonal,
} from "lucide-react";
import DatePicker from "./DatePicker";

// ── Types ─────────────────────────────────────────────────────────────────────
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
  const book = BIBLE_BOOKS[bookIdx];
  const chapterCount = Array.from({ length: book.chapters }, (_, i) => i + 1);

  /** Strip footnotes and BibleGateway chapter-end artifacts from scraped text */
  const cleanText = (raw: string) =>
    raw
      .replace(/\s+/g, " ")
      .replace(/\s*Footnotes\b.*/i, "")
      .replace(/\s*\bNext\s*$/i, "")
      .replace(/\s*\bPrevious\s*$/i, "")
      .trim();

  const fetchChapter = useCallback(async () => {
    setLoading(true); setError(null); setVerses([]); setVerseNum("");
    try {
      let parsed: BibleVerse[] = [];
      if (translation.api === "bible-api") {
        const bookName = book.name.replace(/ /g, "+");
        const url = `https://bible-api.com/${bookName}+${chapter}?translation=${translation.slug}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        parsed = (data.verses ?? []).map((v: any) => ({
          verse: v.verse,
          text: cleanText(v.text ?? ""),
        }));
      } else {
        // BibleGateway proxy
        const res = await fetch(
          `/api/bible/gateway?book=${encodeURIComponent(book.name)}&chapter=${chapter}&version=${translation.slug}`
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        parsed = (data.verses ?? []).map((v: any) => ({
          verse: v.verse,
          text: cleanText(v.text ?? ""),
        }));
      }
      setVerses(parsed.filter(v => v.text.length > 0).sort((a, b) => a.verse - b.verse));
    } catch {
      setError("Could not load chapter. Check your connection.");
    }
    setLoading(false);
  }, [translation, bookIdx, chapter, book.name]);

  useEffect(() => { fetchChapter(); }, [fetchChapter]);

  const handleCollect = (ref: string, text: string) => {
    onCollect({ ref, text, translation: translation.label });
    setAddedSet(prev => new Set(prev).add(ref));
    setTimeout(() => setAddedSet(prev => { const n = new Set(prev); n.delete(ref); return n; }), 1500);
  };

  const num = parseInt(verseNum);
  const displayItems = verses
    .filter(v => !verseNum || v.verse === num)
    .map(v => ({ verse: v.verse, text: v.text, ref: `${book.name} ${chapter}:${v.verse}` }));

  const selectStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.07)", color: "#e2e8f0",
    border: "1px solid rgba(255,255,255,0.1)", outline: "none",
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden" style={{ background: "#0c0c18" }}>
      {/* Panel header */}
      <div style={PANEL_HEADER}>
        <div className="flex items-center gap-2">
          <BookOpen size={13} className="text-indigo-400" />
          <span className="text-[13px] font-bold" style={{ color: "rgba(255,255,255,0.7)" }}>Bible</span>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" title="Collapse Bible panel"
          style={{ color: "rgba(255,255,255,0.3)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}>
          <PanelRight size={14} />
        </button>
      </div>

      <div className="px-3 pt-3 pb-2 shrink-0">
        {/* Translation tabs */}
        <div className="flex gap-1 p-1 rounded-lg mb-3" style={{ background: "rgba(255,255,255,0.05)" }}>
          {TRANSLATIONS.map(t => (
            <button key={t.slug} onClick={() => setTranslation(t)}
              className="flex-1 py-1.5 text-[12px] font-bold rounded-md transition-all"
              style={{ background: translation.slug === t.slug ? "rgba(99,102,241,0.85)" : "transparent", color: translation.slug === t.slug ? "#fff" : "rgba(255,255,255,0.4)" }}
              title={t.full}>{t.label}</button>
          ))}
        </div>

        {/* Book + Chapter + Verse */}
        <div className="flex gap-2 mb-2">
          <div className="relative flex-1">
            <select value={bookIdx} onChange={e => { setBookIdx(+e.target.value); setChapter(1); setVerseNum(""); }}
              className="w-full appearance-none text-[13px] font-medium px-2.5 py-2 rounded-lg pr-7 truncate"
              style={selectStyle}>
              {BIBLE_BOOKS.map((b, i) => <option key={b.name} value={i} style={{ background: "#16162a" }}>{b.name}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          </div>
          <div className="relative w-[52px]">
            <select value={chapter} onChange={e => { setChapter(+e.target.value); setVerseNum(""); }}
              className="w-full appearance-none text-[13px] font-medium px-2 py-2 rounded-lg pr-5"
              style={selectStyle}>
              {chapterCount.map(c => <option key={c} value={c} style={{ background: "#16162a" }}>{c}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          </div>
          {/* Verse dropdown — matches chapter select style */}
          <div className="relative w-[52px]">
            <select value={verseNum} onChange={e => setVerseNum(e.target.value)}
              className="w-full appearance-none text-xs font-medium px-2 py-2 rounded-lg pr-5"
              style={selectStyle}>
              <option value="" style={{ background: "#16162a" }}>v.</option>
              {verses.map(v => <option key={v.verse} value={v.verse} style={{ background: "#16162a" }}>{v.verse}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="px-3 py-1.5 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <p className="text-[11px] font-bold tracking-widest uppercase" style={{ color: "rgba(99,102,241,0.65)" }}>
          {book.name} · {chapter}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>
        {loading && <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-indigo-400" /></div>}
        {error && (
          <div className="text-center py-6">
            <p className="text-xs text-red-400 mb-2">{error}</p>
            <button onClick={fetchChapter} className="text-xs text-indigo-400 flex items-center gap-1 mx-auto">
              <RefreshCw size={10} /> Retry
            </button>
          </div>
        )}
        {displayItems.map((item, idx) => {
          const isAdded = addedSet.has(item.ref);
          return (
            <div key={item.ref}>
              {idx > 0 && (
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.3)", marginTop: 6, marginBottom: 6 }} />
              )}
              <div className="group flex gap-2 py-2 px-1.5 rounded-lg transition-all"
                style={{ background: "transparent" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <span className="text-[12px] font-bold shrink-0 mt-0.5 w-5 text-right" style={{ color: "#6366f1" }}>{item.verse}</span>
                <p className="text-[14px] leading-relaxed flex-1" style={{ color: "rgba(255,255,255,0.82)" }}>{item.text}</p>
                <div className="flex flex-col gap-1 shrink-0 self-start">
                  {/* Collect into verse list */}
                  <button onClick={() => handleCollect(item.ref, item.text)}
                    className="transition-all"
                    title="Add to collection"
                    style={{ color: isAdded ? "#10b981" : "rgba(99,102,241,0.8)", transform: isAdded ? "scale(1.15)" : "scale(1)" }}>
                    {isAdded ? <Check size={15} /> : <PlusCircle size={15} />}
                  </button>
                  {/* Insert at cursor */}
                  {onInsert && (
                    <button onClick={() => onInsert(item.ref, item.text, translation.label)}
                      className="transition-all hover:scale-110 active:scale-95"
                      title="Insert at cursor in canvas"
                      style={{ color: "rgba(245,158,11,0.65)" }}>
                      <CornerDownLeft size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", padding: "24px 16px" }}>
      <div className="w-full max-w-xl rounded-xl shadow-2xl flex flex-col" style={{ background: "#fff", maxHeight: "90vh" }}>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #e5e7eb" }}>
          <div className="flex items-center gap-2">
            <Eye size={15} style={{ color: "#555" }} />
            <span className="text-sm font-semibold" style={{ color: "#111" }}>Sermon Brief</span>
            <span className="text-xs" style={{ color: "#aaa" }}>· for slide designer</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:bg-gray-100"
              style={{ color: "#555", border: "1px solid #e5e7eb" }}>Copy Text</button>
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:bg-gray-100"
              style={{ color: "#555", border: "1px solid #e5e7eb" }}>
              <Printer size={12} /> Print
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100" style={{ color: "#aaa" }}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: "thin", scrollbarColor: "#e5e7eb transparent" }}>
        <div className="px-8 py-8" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: "#111", lineHeight: 1.8 }}>

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
                        borderLeft: `3px solid ${i === 0 ? "#6366f1" : "#a5b4fc"}`,
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
                              borderLeft: `3px solid ${si === 0 ? "#6366f1" : "#a5b4fc"}`,
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
  );
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
    background: active ? 'rgba(99,102,241,0.3)' : 'transparent',
    color: active ? '#a5b4fc' : 'rgba(255,255,255,0.45)',
  });

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Top bar — height 45px matching SermonCanvas */}
      <div className="flex items-center justify-between px-5 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#0e0e1c', height: 45 }}>
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
              caretColor: '#818cf8',
              wordBreak: 'break-word',
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Section Block ─────────────────────────────────────────────────────────────
function SectionBlock({ icon, label, color = "#6366f1", children, defaultOpen = false, visible = true, onToggleVisible, open: controlledOpen, onToggle }:
  { icon: React.ReactNode; label: string; color?: string; children: React.ReactNode; defaultOpen?: boolean; visible?: boolean; onToggleVisible?: () => void; open?: boolean; onToggle?: () => void; }) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const toggle = isControlled ? (onToggle ?? (() => {})) : () => setInternalOpen(o => !o);
  return (
    <div className="rounded-xl mb-3" style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.025)", overflow: "visible" }}>
      <div className="w-full flex items-center" style={{ background: open ? "rgba(255,255,255,0.03)" : "transparent" }}>
        {/* Eye visibility toggle */}
        {onToggleVisible && (
          <button onClick={onToggleVisible} title={visible ? "Hide from preview" : "Show in preview"}
            className="pl-3 pr-1 py-3 flex-shrink-0 transition-all"
            style={{ color: visible ? "rgba(99,102,241,0.55)" : "rgba(255,255,255,0.18)" }}>
            {visible ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
        )}
        <button onClick={toggle} className="flex-1 flex items-center justify-between px-3 py-3 transition-all">
          <div className="flex items-center gap-2.5">
            <span style={{ color }}>{icon}</span>
            <span className="text-[13px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.65)" }}>{label}</span>
          </div>
          <span style={{ color: "rgba(255,255,255,0.25)" }}>{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
        </button>
      </div>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}

// ── Sermon Canvas ─────────────────────────────────────────────────────────────
function SermonCanvas({
  draft, onChange, onSave, saving, collectedVerses, onRemoveVerse,
  bibleOpen, draftsOpen, onToggleBible, onToggleDrafts, onFieldFocus,
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
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  // Single open-section tracker — only one accordion open at a time
  const [openSection, setOpenSection] = useState<string | null>(null);
  const toggleSection = (key: string) => setOpenSection(s => s === key ? null : key);
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
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "#0e0e1c" }}>
        <div className="flex items-center gap-2">
          <Mic2 size={15} className="text-amber-400" />
          <span className="text-sm font-bold text-white">Sermon Prep</span>

          {/* Panel toggle buttons — only shown when panel collapsed */}
          {!bibleOpen && (
            <span className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.3)" }}>Bible hidden</span>
          )}
        </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "rgba(255,255,255,0.3)" }}>
              <Clock size={11} />
              <span>~{totalWords} words · {estimatedMinutes(totalWords)} min</span>
            </div>
            <button onClick={() => setPreviewOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 hover:scale-105"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)" }}
              title="Preview sermon">
              <Eye size={12} /> Preview
            </button>
            <button onClick={onSave} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
              style={{ background: "rgba(99,102,241,0.85)", color: "#fff", opacity: saving ? 0.7 : 1 }}>
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {saving ? "Saving…" : "Save Draft"}
            </button>
          </div>
      </div>

      {/* Canvas scroll */}
      <div className="flex-1 overflow-y-auto px-6 pt-5 pb-12"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>

        {/* ── SERVICE INFO ACCORDION ── */}
        <div className="mb-3 rounded-xl"
          style={{ border: "1px solid rgba(245,158,11,0.15)", background: "linear-gradient(135deg, rgba(245,158,11,0.05), rgba(52,211,153,0.03))", overflow: "visible" }}>

          {/* Header row */}
          <div className="flex items-center w-full" style={{ background: serviceInfoOpen ? "rgba(255,255,255,0.02)" : "transparent" }}>
            {/* Eye toggle */}
            <button
              onClick={() => onChange('previewHidden', { ...(draft.previewHidden || {}), serviceInfo: !draft.previewHidden?.serviceInfo })}
              title={draft.previewHidden?.serviceInfo ? 'Show in preview' : 'Hide from preview'}
              className="pl-3 pr-1 py-3 flex-shrink-0 transition-all"
              style={{ color: draft.previewHidden?.serviceInfo ? 'rgba(255,255,255,0.18)' : 'rgba(245,158,11,0.5)' }}>
              {draft.previewHidden?.serviceInfo ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
            {/* Expand toggle */}
            <button onClick={() => toggleSection("serviceInfo")}
              className="flex-1 flex items-center justify-between px-3 py-3 min-w-0">
              <div className="flex items-center gap-2">
                <CalendarDays size={13} className="text-amber-400/70" />
                <span className="text-[13px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.6)" }}>Service Info</span>
              </div>
              <span style={{ color: "rgba(255,255,255,0.25)" }}>
                {serviceInfoOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </span>
            </button>
          </div>

          {/* Expanded content */}
          {serviceInfoOpen && (
            <div className="px-5 pb-5 pt-3 flex flex-wrap gap-5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              {/* Date */}
              <div>
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
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Mic2 size={10} style={{ color: "rgba(52,211,153,0.7)" }} />
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(52,211,153,0.7)" }}>Service Type</span>
                </div>
                <select
                  value={draft.serviceType || ''}
                  onChange={e => onChange('serviceType', e.target.value)}
                  style={{
                    background: draft.serviceType ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.06)',
                    color: draft.serviceType ? 'rgba(52,211,153,0.95)' : 'rgba(255,255,255,0.35)',
                    border: `1px solid ${draft.serviceType ? 'rgba(52,211,153,0.25)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 600, outline: 'none', cursor: 'pointer',
                  }}>
                  <option value="" disabled style={{ background: '#12122a', color: '#666' }}>Set Service Type</option>
                  <option value="Mid-Week Service" style={{ background: '#12122a', color: '#fff' }}>Mid-Week Service</option>
                  <option value="Sunday Service" style={{ background: '#12122a', color: '#fff' }}>Sunday Service</option>
                  <option value="Other" style={{ background: '#12122a', color: '#fff' }}>Other</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* ── SERMON HEADER CARD — accordion ── */}
        <div className="mb-4 rounded-xl"
          style={{ border: "1px solid rgba(99,102,241,0.15)", background: "linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.04))", overflow: "visible" }}>

          {/* Accordion header row */}
          <div className="flex items-center w-full" style={{ background: headerOpen ? "rgba(255,255,255,0.02)" : "transparent" }}>

            {/* Eye toggle */}
            <button
              onClick={() => onChange('previewHidden', { ...(draft.previewHidden || {}), titleSection: !draft.previewHidden?.titleSection })}
              title={draft.previewHidden?.titleSection ? 'Show in preview' : 'Hide from preview'}
              className="pl-3 pr-1 py-3 flex-shrink-0 transition-all"
              style={{ color: draft.previewHidden?.titleSection ? 'rgba(255,255,255,0.18)' : 'rgba(99,102,241,0.55)' }}>
              {draft.previewHidden?.titleSection ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>

            {/* Expand/collapse toggle */}
            <button onClick={() => toggleSection("mainTitle")}
              className="flex-1 flex items-center justify-between px-3 py-3 min-w-0">
              <div className="flex items-center gap-2 shrink-0">
                <BookOpen size={13} className="text-indigo-400" />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.55)" }}>Main Title</span>
              </div>
              <span style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>
                {headerOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </span>
            </button>
          </div>

          {/* Expanded content */}
          {headerOpen && (
            <div className="px-5 pb-5 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              {/* Title */}
              <input
                type="text" value={draft.title}
                onChange={e => onChange("title", e.target.value)}
                onFocus={e => onFieldFocus(e.currentTarget, { type: "draft", field: "title" })}
                placeholder="Sermon title…"
                className="w-full font-bold bg-transparent border-none outline-none text-white placeholder-white/20 leading-tight"
                style={{ fontSize: 28, caretColor: "#6366f1", marginBottom: 4 }}
              />
              {/* Thin separator */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", marginBottom: 10 }} />
              {/* Subtitle */}
              <input
                type="text" value={draft.subtitle}
                onChange={e => onChange("subtitle", e.target.value)}
                onFocus={e => onFieldFocus(e.currentTarget, { type: "draft", field: "subtitle" })}
                placeholder="Subtitle (optional)…"
                className="w-full bg-transparent border-none outline-none placeholder-white/15"
                style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", caretColor: "#6366f1", marginBottom: 14 }}
              />
              {/* Scriptures — multi-row */}
              {(() => {
                const scriptureList = (draft.scriptures && draft.scriptures.length > 0)
                  ? draft.scriptures
                  : [{ id: uid(), text: draft.mainVerse || '' }];
                return (
                  <div className="flex flex-col gap-2">
                    {scriptureList.map((s, idx) => (
                      <div key={s.id} className="flex items-center gap-2 rounded-xl px-3 py-2"
                        style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)" }}>
                        <BookMarked size={13} className="text-indigo-400 shrink-0" />
                        {idx === 0 && (
                          <span className="text-[10px] font-bold uppercase tracking-widest shrink-0"
                            style={{ color: "rgba(99,102,241,0.7)" }}>Scripture</span>
                        )}
                        {idx > 0 && (
                          <span className="text-[10px] font-bold uppercase tracking-widest shrink-0"
                            style={{ color: "rgba(99,102,241,0.45)" }}>+Verse</span>
                        )}
                        <span style={{ color: "rgba(99,102,241,0.3)", fontSize: 11 }}>·</span>
                        <input
                          type="text" value={s.text}
                          onChange={e => {
                            const updated = scriptureList.map((x, i) => i === idx ? { ...x, text: e.target.value } : x);
                            onChange('scriptures', updated);
                            if (idx === 0) onChange('mainVerse', e.target.value);
                          }}
                          placeholder={idx === 0 ? "e.g. John 3:16-17" : "e.g. Romans 8:28"}
                          onFocus={e => onFieldFocus(e.currentTarget, { type: "draft", field: "scriptures", scriptureIdx: idx })}
                          className="flex-1 bg-transparent border-none outline-none placeholder-white/20 min-w-0"
                          style={{ fontSize: 14, color: "rgba(165,180,252,0.9)", caretColor: "#6366f1" }}
                        />
                        {/* Remove button — visible red pill, only shown when 2+ rows */}
                        {scriptureList.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = scriptureList.filter((_, i) => i !== idx);
                              onChange('scriptures', updated);
                              if (idx === 0) onChange('mainVerse', updated[0]?.text ?? '');
                            }}
                            title="Remove this verse"
                            className="shrink-0 flex items-center justify-center rounded-full transition-all hover:scale-110"
                            style={{
                              width: 20, height: 20, minWidth: 20,
                              background: "rgba(239,68,68,0.18)",
                              border: "1px solid rgba(239,68,68,0.4)",
                              color: "#f87171",
                              fontSize: 14, fontWeight: 700, lineHeight: 1,
                            }}
                          >−</button>
                        )}
                        {/* Add button — visible indigo pill, only on last row */}
                        {idx === scriptureList.length - 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newEntry = { id: uid(), text: '' };
                              onChange('scriptures', [...scriptureList, newEntry]);
                            }}
                            title="Add another verse"
                            className="shrink-0 flex items-center justify-center rounded-full transition-all hover:scale-110"
                            style={{
                              width: 20, height: 20, minWidth: 20,
                              background: "rgba(99,102,241,0.25)",
                              border: "1px solid rgba(99,102,241,0.5)",
                              color: "#a5b4fc",
                              fontSize: 16, fontWeight: 700, lineHeight: 1,
                            }}
                          >+</button>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* ── INTRODUCTION ── */}
        <SectionBlock icon={<PenLine size={14} />} label="Introduction" color="#a78bfa"
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
        <SectionBlock icon={<BookMarked size={14} />} label="Main Passage" color="#6366f1"
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
            <input type="text" value={draft.keyPointsTitle}
              onChange={e => onChange("keyPointsTitle", e.target.value)}
              onFocus={e => onFieldFocus(e.currentTarget, { type: "draft", field: "keyPointsTitle" })}
              placeholder="Key Points Title… (e.g. How to love like Jesus)"
              className="w-full px-3 py-2.5 text-[14px] font-semibold rounded-lg placeholder-white/25"
              style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.18)", color: "#fde68a", outline: "none" }} />
            <div className="space-y-3">
              {draft.keyPoints.map((kp, i) => (
                <div key={kp.id} className="rounded-lg p-3" style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.12)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <GripVertical size={12} className="text-white/20" />
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#f59e0b" }}>Point {i + 1}</span>
                    <button onClick={() => removeKeyPoint(kp.id)} className="ml-auto text-white/20 hover:text-red-400 transition-colors"><X size={12} /></button>
                  </div>
                  <input type="text" value={kp.heading} onChange={e => updateKeyPoint(kp.id, "heading", e.target.value)}
                    onFocus={e => onFieldFocus(e.currentTarget, { type: "kp", kpId: kp.id, kpField: "heading" })}
                    placeholder="Point heading… (e.g. Love one another)"
                    className="w-full px-2.5 py-2 text-[14px] font-semibold rounded-lg mb-2 placeholder-white/25"
                    style={{ background: "rgba(255,255,255,0.04)", border: "none", color: "#fff", outline: "none" }} />
                  {/* Key Point Scriptures — multi-row */}
                  {(() => {
                    const kpList = (kp.scriptures && kp.scriptures.length > 0)
                      ? kp.scriptures
                      : [{ id: uid(), text: kp.scripture || '' }];
                    return (
                      <div className="flex flex-col gap-1.5 mb-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <BookMarked size={10} className="text-indigo-400 shrink-0" />
                          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(99,102,241,0.65)" }}>Scripture</span>
                        </div>
                        {kpList.map((sv, sidx) => (
                          <div key={sv.id} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
                            style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)" }}>
                            {sidx > 0 && (
                              <span className="text-[9px] font-bold uppercase tracking-widest shrink-0" style={{ color: "rgba(99,102,241,0.4)" }}>+v</span>
                            )}
                            <input
                              type="text" value={sv.text}
                              onChange={e => {
                                const updated = kpList.map((x, xi) => xi === sidx ? { ...x, text: e.target.value } : x);
                                updateKeyPointScriptures(kp.id, updated);
                              }}
                              onFocus={e => onFieldFocus(e.currentTarget, { type: "kp", kpId: kp.id, kpField: "scripture", kpScriptureIdx: sidx })}
                              placeholder={sidx === 0 ? "e.g. John 13:34-35" : "e.g. Romans 5:8"}
                              className="flex-1 bg-transparent border-none outline-none placeholder-white/25 min-w-0 text-[13px]"
                              style={{ color: "#a5b4fc" }}
                            />
                            {/* Remove button */}
                            {kpList.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = kpList.filter((_, xi) => xi !== sidx);
                                  updateKeyPointScriptures(kp.id, updated);
                                }}
                                title="Remove verse"
                                className="shrink-0 flex items-center justify-center rounded-full transition-all hover:scale-110"
                                style={{ width: 16, height: 16, minWidth: 16, background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.4)", color: "#f87171", fontSize: 12, fontWeight: 700, lineHeight: 1 }}
                              >−</button>
                            )}
                            {/* Add button — last row only */}
                            {sidx === kpList.length - 1 && (
                              <button
                                type="button"
                                onClick={() => updateKeyPointScriptures(kp.id, [...kpList, { id: uid(), text: '' }])}
                                title="Add another verse"
                                className="shrink-0 flex items-center justify-center rounded-full transition-all hover:scale-110"
                                style={{ width: 16, height: 16, minWidth: 16, background: "rgba(99,102,241,0.25)", border: "1px solid rgba(99,102,241,0.5)", color: "#a5b4fc", fontSize: 14, fontWeight: 700, lineHeight: 1 }}
                              >+</button>
                            )}
                          </div>
                        ))}
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
                      style={{ color: kp.bodyHidden ? 'rgba(255,255,255,0.18)' : 'rgba(99,102,241,0.45)' }}>
                      {kp.bodyHidden ? <EyeOff size={11} /> : <Eye size={11} />}
                    </button>
                  </div>
                  <textarea value={kp.body} onChange={e => updateKeyPoint(kp.id, "body", e.target.value)}
                    onFocus={e => onFieldFocus(e.currentTarget, { type: "kp", kpId: kp.id, kpField: "body" })}
                    placeholder="Expand your thoughts, illustrations, supporting ideas…"
                    rows={3} className="placeholder-white/25"
                    style={{ ...textareaStyle, minHeight: 70, fontSize: 14, background: "rgba(255,255,255,0.03)", border: "none" }} />
                </div>
              ))}
            </div>
            <button onClick={addKeyPoint}
              className="w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 transition-all hover:opacity-80"
              style={{ background: "rgba(245,158,11,0.08)", border: "1px dashed rgba(245,158,11,0.25)", color: "#f59e0b" }}>
              <Plus size={12} /> Add Key Point
            </button>
          </div>
        </SectionBlock>

        {/* FREE NOTES */}
        <SectionBlock icon={<FileText size={14} />} label="Free Notes & Illustrations" color="#8b5cf6"
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

// ── Draft List Sidebar ────────────────────────────────────────────────────────
function DraftList({ drafts, activeDraftId, onSelect, onNew, onDelete, onSubmit, onClose, currentUserName }:
  { drafts: SermonDraft[]; activeDraftId: string | null; onSelect: (id: string) => void;
    onNew: () => void; onDelete: (id: string) => void; onSubmit: (id: string) => void;
    onClose: () => void; currentUserName: string }) {
  const [tab, setTab] = useState<'drafts' | 'submitted'>('drafts');

  const tabStyle = (active: boolean) => ({
    flex: 1, paddingTop: 6, paddingBottom: 6, fontSize: 11, fontWeight: 700,
    letterSpacing: '0.06em', textTransform: 'uppercase' as const,
    background: 'none', border: 'none', cursor: 'pointer',
    color: active ? '#a5b4fc' : 'rgba(255,255,255,0.25)',
    borderBottom: active ? '2px solid #6366f1' : '2px solid transparent',
    transition: 'all 0.15s',
  });

  return (
    <div className="flex flex-col h-full w-full overflow-hidden" style={{ background: "#090913" }}>
      {/* Header */}
      <div style={PANEL_HEADER}>
        <div className="flex items-center gap-2">
          <Mic2 size={13} className="text-indigo-400" />
          <span className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.7)" }}>Preaching</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={onNew} className="p-1 rounded-lg transition-all hover:scale-110"
            style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }} title="New sermon draft">
            <Plus size={12} />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" title="Collapse panel"
            style={{ color: "rgba(255,255,255,0.3)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}>
            <PanelRight size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', paddingLeft: 8, paddingRight: 8 }}>
        <button style={tabStyle(tab === 'drafts')} onClick={() => setTab('drafts')}>Drafts</button>
        <button style={tabStyle(tab === 'submitted')} onClick={() => setTab('submitted')}>Submitted</button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-2 py-2"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.06) transparent" }}>

        {/* ── DRAFTS ── */}
        {tab === 'drafts' && (
          <>
            {drafts.length === 0 && (
              <div className="text-center py-8 px-3">
                <Mic2 size={18} className="text-white/10 mx-auto mb-2" />
                <p className="text-[10px] text-white/20">No drafts yet. Start one!</p>
              </div>
            )}
            {drafts.map(d => (
              <div key={d.id} onClick={() => onSelect(d.id)}
                className="w-full text-left px-3 py-2.5 rounded-xl mb-1 cursor-pointer group transition-all relative"
                style={{
                  background: activeDraftId === d.id ? "rgba(99,102,241,0.18)" : "transparent",
                  border: activeDraftId === d.id ? "1px solid rgba(99,102,241,0.3)" : "1px solid transparent",
                }}
                onMouseEnter={e => { if (activeDraftId !== d.id) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { if (activeDraftId !== d.id) e.currentTarget.style.background = "transparent"; }}>
                <p className="text-[13px] font-semibold truncate text-white/80 pr-12">{d.title || "Untitled Sermon"}</p>
                {d.subtitle && <p className="text-[11px] truncate mt-0.5 pr-12" style={{ color: "rgba(255,255,255,0.3)" }}>{d.subtitle}</p>}
                {(d.scriptures?.[0]?.text || d.mainVerse) && (
                  <p className="text-[11px] truncate mt-0.5" style={{ color: "rgba(99,102,241,0.65)" }}>
                    {d.scriptures?.[0]?.text || d.mainVerse}
                    {(d.scriptures?.length ?? 0) > 1 && ` +${d.scriptures!.length - 1} more`}
                  </p>
                )}
                {(d.scheduledDate || d.serviceType) && (
                  <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    {d.scheduledDate && (
                      <p className="text-[11px]" style={{ color: "rgba(245,158,11,0.8)" }}>
                        {new Date(d.scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    )}
                    {d.serviceType && (
                      <p className="text-[11px] mt-0.5 font-semibold" style={{ color: "rgba(52,211,153,0.65)" }}>
                        {d.serviceType}
                      </p>
                    )}
                  </div>
                )}
                {/* Action buttons — appear on hover */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  {/* Submit (send to team) */}
                  <button
                    onClick={e => { e.stopPropagation(); onSubmit(d.id); }}
                    title="Submit to team"
                    className="flex items-center justify-center rounded-full transition-all hover:scale-110"
                    style={{ width: 22, height: 22, background: "rgba(99,102,241,0.25)", border: "1px solid rgba(99,102,241,0.4)", color: "#a5b4fc" }}
                  >
                    <SendHorizonal size={10} />
                  </button>
                  {/* Delete */}
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(d.id); }}
                    title="Delete draft"
                    className="flex items-center justify-center rounded-full transition-all hover:scale-110"
                    style={{ width: 22, height: 22, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── SUBMITTED ── */}
        {tab === 'submitted' && (
          <div className="text-center py-10 px-3">
            <div className="mx-auto mb-3 flex items-center justify-center rounded-full"
              style={{ width: 40, height: 40, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)" }}>
              <SendHorizonal size={16} style={{ color: "rgba(99,102,241,0.4)" }} />
            </div>
            <p className="text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.25)" }}>No submitted sermons yet</p>
            <p className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.12)" }}>Submitted sermons will appear here for team monitoring.</p>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Types for main component ──────────────────────────────────────────────────
interface Props {
  currentUser: { uid: string; name?: string; email?: string; photo?: string };
  onToast?: (type: "success" | "error" | "info", message: string) => void;
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
export default function PreachingView({ currentUser, onToast }: Props) {
  const [drafts, setDrafts] = useState<SermonDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [bibleOpen, setBibleOpen] = useState(true);
  const [draftsOpen, setDraftsOpen] = useState(true);
  const [freeCanvasOpen, setFreeCanvasOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"canvas" | "bible" | "sermons">("canvas");
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
        if (migrated.length > 0 && !activeDraftId) setActiveDraftId(migrated[0].id);
      }
    } catch { /* silently */ }
    setLoadingDrafts(false);
  }, [currentUser.uid, activeDraftId]);

  useEffect(() => { fetchDrafts(); }, []);

  const handleNew = async () => {
    const draft = EMPTY_DRAFT(currentUser.uid, userName);
    setDrafts(prev => [draft, ...prev]);
    setActiveDraftId(draft.id);
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
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDrafts(prev => prev.filter(d => d.id !== id));
    if (activeDraftId === id) setActiveDraftId(drafts.find(d => d.id !== id)?.id ?? null);
    try {
      await fetch(`/api/preaching-drafts/${id}`, { method: "DELETE" });
      onToast?.("success", `"${title}" deleted.`);
    } catch { onToast?.("error", "Could not delete draft."); }
  };

  // Submit draft to team — stub for future integration
  const handleSubmitDraft = (id: string) => {
    const draft = drafts.find(d => d.id === id);
    onToast?.("info", `"${draft?.title || "Untitled"}" — Submit to team coming soon!`);
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
          // Insert into a specific main-title scripture row
          const idx = target.scriptureIdx;
          const cur = activeDraft?.scriptures ?? [];
          const updated = cur.map((s, i) => i === idx ? { ...s, text: newVal } : s);
          handleChange('scriptures', updated);
          handleChange('mainVerse', updated[0]?.text ?? '');
        } else {
          handleChange(target.field, newVal);
        }
      } else {
        // Key point field
        if (target.kpField === 'scripture' && target.kpScriptureIdx !== undefined) {
          // Insert into a specific kp scripture row
          const sidx = target.kpScriptureIdx;
          const kps = activeDraft?.keyPoints ?? [];
          const updated = kps.map(k => {
            if (k.id !== target.kpId) return k;
            const list = (k.scriptures && k.scriptures.length > 0)
              ? k.scriptures
              : [{ id: uid(), text: k.scripture || '' }];
            const newList = list.map((s, i) => i === sidx ? { ...s, text: newVal } : s);
            return { ...k, scriptures: newList, scripture: newList[0]?.text ?? '' };
          });
          handleChange('keyPoints', updated);
        } else {
          handleChange('keyPoints',
            (activeDraft?.keyPoints ?? []).map(k =>
              k.id === target.kpId ? { ...k, [target.kpField]: newVal } : k
            )
          );
        }
      }
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(newPos, newPos); });
      onToast?.('success', `${ref} inserted`);
    } else {
      // Fallback: no field focused yet — append to main passage
      const cur = (activeDraft?.mainPassage ?? '').trimEnd();
      handleChange('mainPassage', cur + (cur ? '\n\n' : '') + formatted + '\n');
      onToast?.('info', `${ref} appended to Main Passage`);
    }
    setMobileTab('canvas');
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
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-8">
            <div className="w-16 h-20 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.15))", border: "1px solid rgba(99,102,241,0.2)" }}>
              <BookOpen size={28} className="text-indigo-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Preaching Prep</h2>
            <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.3)" }}>
              Start a new sermon draft to begin preparing your message.
            </p>
            <button onClick={handleNew}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm mx-auto transition-all hover:scale-105 active:scale-95"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff" }}>
              <Plus size={16} /> New Sermon Draft
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 overflow-hidden" style={{ background: "#0e0e1c" }}>

      {/* ══════════ DESKTOP layout lg+ ══════════ */}
      <div className="hidden lg:flex flex-1 min-h-0 overflow-hidden">

        {/* My Sermons sidebar — left collapsible */}
        {draftsOpen ? (
          <div className="flex h-full shrink-0 flex-col" style={{ width: 220, borderRight: "1px solid rgba(255,255,255,0.06)" }}>
            <DraftList
              drafts={drafts} activeDraftId={activeDraftId}
              onSelect={id => { setActiveDraftId(id); }}
              onNew={handleNew} onDelete={handleDelete} onSubmit={handleSubmitDraft}
              onClose={() => setDraftsOpen(false)}
              currentUserName={currentUser?.name || ""}
            />
          </div>
        ) : (
          <div className="flex w-9 h-full shrink-0 flex-col"
            style={{ background: "#0c0c18", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
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
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center px-8">
                <div className="w-16 h-20 rounded-2xl flex items-center justify-center mx-auto mb-5"
                  style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.15))", border: "1px solid rgba(99,102,241,0.2)" }}>
                  <BookOpen size={28} className="text-indigo-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Preaching Prep</h2>
                <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Start a new sermon draft to begin preparing your message.
                </p>
                <div className="flex flex-col items-center gap-3">
                  <button onClick={handleNew}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all hover:scale-105 active:scale-95"
                    style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff" }}>
                    <Plus size={16} /> New Sermon Draft
                  </button>
                  <button onClick={() => setFreeCanvasOpen(true)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all hover:scale-105 active:scale-95"
                    style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <Plus size={16} /> Create in Free Canvas
                  </button>
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
            />
          )}
        </div>


        {/* Bible — right collapsible */}
        {bibleOpen ? (
          <div className="flex w-[290px] xl:w-[320px] h-full shrink-0 flex-col"
            style={{ borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
            <BiblePanel onCollect={handleCollect} onClose={() => setBibleOpen(false)}
            onInsert={handleInsertVerse} />
          </div>
        ) : (
          <div className="flex w-9 h-full shrink-0 flex-col"
            style={{ background: "#0c0c18", borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
            {/* Spacer matching canvas top bar height */}
            <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", height: 45, flexShrink: 0 }} />
            <div className="flex flex-col items-center pt-3 gap-2">
              <button onClick={() => setBibleOpen(true)} title="Expand Bible"
                className="p-1.5 rounded-lg transition-all hover:scale-110"
                style={{ color: "rgba(165,180,252,0.6)", background: "rgba(99,102,241,0.1)" }}>
                <PanelRight size={14} />
              </button>
              <div className="flex-1 flex items-center">
                <BookOpen size={12} style={{ color: "rgba(99,102,241,0.4)" }} />
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
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center px-8">
                    <div className="w-16 h-20 rounded-2xl flex items-center justify-center mx-auto mb-5"
                      style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.15))", border: "1px solid rgba(99,102,241,0.2)" }}>
                      <BookOpen size={28} className="text-indigo-400" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Preaching Prep</h2>
                    <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.3)" }}>
                      Start a new sermon draft to begin preparing your message.
                    </p>
                    <div className="flex flex-col items-center gap-3">
                      <button onClick={handleNew}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
                        style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff" }}>
                        <Plus size={16} /> New Sermon Draft
                      </button>
                      <button onClick={() => setFreeCanvasOpen(true)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
                        style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>
                        <Plus size={16} /> Create in Free Canvas
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
                />
              )}
            </div>
          )}

          {/* BIBLE TAB */}
          {mobileTab === "bible" && (
            <BiblePanel
              onCollect={v => { handleCollect(v); setMobileTab("canvas"); }}
              onClose={() => setMobileTab("canvas")}
              onInsert={handleInsertVerse}
            />
          )}
          {/* SERMONS TAB */}
          {mobileTab === "sermons" && (
            <DraftList
              drafts={drafts} activeDraftId={activeDraftId}
              onSelect={id => { setActiveDraftId(id); setMobileTab("canvas"); }}
              onNew={() => { handleNew(); setMobileTab("canvas"); }}
              onDelete={handleDelete} onSubmit={handleSubmitDraft}
              onClose={() => setMobileTab("canvas")}
              currentUserName={currentUser?.name || ""}
            />
          )}
        </div>

        {/* ── Mobile bottom tab bar ── */}
        <div className="shrink-0 flex"
          style={{ background: "#090913", borderTop: "1px solid rgba(255,255,255,0.08)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          {([
          { id: "canvas"  as const, icon: <FileText size={22} />,  label: "Canvas" },
            { id: "sermons" as const, icon: <Mic2 size={22} />,     label: "Sermons" },
            { id: "bible"   as const, icon: <BookOpen size={22} />, label: "Bible" },
          ]).map(tab => {
            const active = mobileTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setMobileTab(tab.id)}
                className="flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors"
                style={{
                  color: active ? "#818cf8" : "rgba(255,255,255,0.3)",
                  background: active ? "rgba(99,102,241,0.07)" : "transparent",
                  borderTop: `2px solid ${active ? "#6366f1" : "transparent"}`,
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
  );
}
