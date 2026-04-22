import React, { useState, useEffect, useCallback, memo } from "react";
import {
  Bookmark, ChevronDown, X, Plus, Check, Loader2,
  RefreshCw, List, CheckCircle2, Trash2, ChevronLeft, ChevronRight,
  Copy, PlusCircle, Edit3, ScrollText, Info,
} from "lucide-react";

// ── SoapForm ─────────────────────────────────────────────────────────────
// Isolated memoized component so keystrokes only re-render this subtree,
// NOT the entire BibleView (verse list, selectors, etc).
interface SoapFormValues { title: string; scriptureRef: string; scripture: string; observation: string; application: string; prayer: string; }
interface SoapFormProps {
  initialValues: SoapFormValues;
  editingId: string | null;
  saving: boolean;
  onSave: (values: SoapFormValues) => void;
  onCancel: () => void;
}
const SoapForm = memo(function SoapForm({ initialValues, editingId, saving, onSave, onCancel }: SoapFormProps) {
  const [f, setF] = useState<SoapFormValues>(initialValues);
  // Sync when parent resets (new form opened or edit started)
  useEffect(() => { setF(initialValues); }, [initialValues]);

  const set = (k: keyof SoapFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF(prev => ({ ...prev, [k]: e.target.value }));

  const canSave = f.title.trim() || f.scripture.trim() || f.observation.trim();

  const fieldCls = "w-full rounded-xl px-3 py-2.5 text-[13px] outline-none resize-none";

  return (
    <div className="flex-1 overflow-y-auto px-3 pt-3 pb-4"
      style={{ scrollbarWidth: "thin", scrollbarColor: "var(--wf-reader-border) transparent" }}>

      {/* Title */}
      <input value={f.title} onChange={set("title")}
        placeholder="Devotion title (e.g. Walking in Faith)"
        className="w-full rounded-xl px-3 py-2.5 text-[13px] font-semibold outline-none mb-4"
        style={{ background: "var(--wf-reader-surface)", border: "1px solid var(--wf-reader-border-s)", color: "var(--wf-reader-text-1)" }} />

      {/* S — Scripture */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-6 h-6 flex items-center justify-center rounded-lg text-[11px] font-black" style={{ background: "rgba(99,102,241,0.25)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.4)" }}>S</span>
          <div>
            <p className="text-[12px] font-bold" style={{ color: "#a5b4fc" }}>Scripture</p>
            <p className="text-[10px]" style={{ color: "var(--wf-reader-text-3)" }}>Write out the verse word-for-word</p>
          </div>
        </div>
        <input value={f.scriptureRef} onChange={set("scriptureRef")}
          placeholder="Reference (e.g. John 3:16)"
          className="w-full rounded-xl px-3 py-2 text-[12px] outline-none mb-1.5"
          style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", color: "var(--wf-reader-text-1)" }} />
        <textarea value={f.scripture} onChange={set("scripture")}
          placeholder='"For God so loved the world that he gave his one and only Son..." (write the verse out yourself)'
          rows={4} className={fieldCls}
          style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", color: "var(--wf-reader-text-1)", lineHeight: 1.7 }} />
      </div>

      {/* O — Observation */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-6 h-6 flex items-center justify-center rounded-lg text-[11px] font-black" style={{ background: "rgba(251,146,60,0.2)", color: "#fdba74", border: "1px solid rgba(251,146,60,0.35)" }}>O</span>
          <div>
            <p className="text-[12px] font-bold" style={{ color: "#fdba74" }}>Observation</p>
            <p className="text-[10px]" style={{ color: "var(--wf-reader-text-3)" }}>What is happening? Who is the audience?</p>
          </div>
        </div>
        <textarea value={f.observation} onChange={set("observation")}
          placeholder="What did you notice? What is the context of this passage?"
          rows={4} className={fieldCls}
          style={{ background: "rgba(251,146,60,0.07)", border: "1px solid rgba(251,146,60,0.2)", color: "var(--wf-reader-text-1)", lineHeight: 1.7 }} />
      </div>

      {/* A — Application */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-6 h-6 flex items-center justify-center rounded-lg text-[11px] font-black" style={{ background: "rgba(16,185,129,0.2)", color: "#6ee7b7", border: "1px solid rgba(16,185,129,0.35)" }}>A</span>
          <div>
            <p className="text-[12px] font-bold" style={{ color: "#6ee7b7" }}>Application</p>
            <p className="text-[10px]" style={{ color: "var(--wf-reader-text-3)" }}>How does this change my behavior today?</p>
          </div>
        </div>
        <textarea value={f.application} onChange={set("application")}
          placeholder="What specific action or change will you make today based on this truth?"
          rows={4} className={fieldCls}
          style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)", color: "var(--wf-reader-text-1)", lineHeight: 1.7 }} />
      </div>

      {/* P — Prayer */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-6 h-6 flex items-center justify-center rounded-lg text-[11px] font-black" style={{ background: "rgba(167,139,250,0.2)", color: "#c4b5fd", border: "1px solid rgba(167,139,250,0.35)" }}>P</span>
          <div>
            <p className="text-[12px] font-bold" style={{ color: "#c4b5fd" }}>Prayer</p>
            <p className="text-[10px]" style={{ color: "var(--wf-reader-text-3)" }}>Ask God to help you live it out</p>
          </div>
        </div>
        <textarea value={f.prayer} onChange={set("prayer")}
          placeholder="Lord, help me to... (write your personal prayer here)"
          rows={4} className={fieldCls}
          style={{ background: "rgba(167,139,250,0.07)", border: "1px solid rgba(167,139,250,0.2)", color: "var(--wf-reader-text-1)", lineHeight: 1.7 }} />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
          style={{ background: "var(--wf-reader-surface)", border: "1px solid var(--wf-reader-border-s)", color: "var(--wf-reader-text-2)" }}>
          Cancel
        </button>
        <button onClick={() => onSave(f)}
          disabled={saving || !canSave}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-bold disabled:opacity-40"
          style={{ background: "linear-gradient(135deg,rgba(var(--wf-c1),0.9),rgba(var(--wf-c2),0.8))", color: "#fff" }}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {editingId ? "Update" : "Save Devotion"}
        </button>
      </div>
    </div>
  );
});

import {
  doc, setDoc, onSnapshot,
  collection, addDoc, deleteDoc, updateDoc, query, orderBy,
} from "firebase/firestore";
import { db } from "./firebase";

interface BibleVerse    { verse: number; text: string; }
interface CollectedVerse { ref: string; text: string; translation: string; savedAt: string; }
interface DevotionNote  {
  id: string;
  title: string;
  // SOAP fields
  scripture: string;    // S — verse written out word-for-word
  scriptureRef: string; // reference badge (e.g. "John 3:16")
  observation: string;  // O — what is happening in the text
  application: string;  // A — how it changes my behavior today
  prayer: string;       // P — short prayer
  // legacy fallback
  body?: string;
  createdAt: string;
}

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

const MBB_BOOK_NAMES = [
  "Genesis","Exodo","Levitico","Mga Bilang","Deuteronomio",
  "Josue","Mga Hukom","Ruth","1 Samuel","2 Samuel",
  "1 Hari","2 Hari","1 Cronica","2 Cronica","Ezra",
  "Nehemias","Ester","Job","Mga Awit","Mga Kawikaan",
  "Mangangaral","Awit ng mga Awit","Isaias","Jeremias","Panaghoy",
  "Ezekiel","Daniel","Hosea","Joel","Amos",
  "Obadias","Jonas","Micas","Nahum","Habakuk",
  "Sofonias","Hageo","Zacarias","Malaquias",
  "Mateo","Marcos","Lucas","Juan","Mga Gawa",
  "Mga Romano","1 Corinto","2 Corinto","Galacia","Efeso",
  "Filipos","Colosas","1 Tesalonica","2 Tesalonica",
  "1 Timoteo","2 Timoteo","Tito","Filemon",
  "Mga Hebreo","Santiago","1 Pedro","2 Pedro",
  "1 Juan","2 Juan","3 Juan","Judas","Apocalipsis",
];

const cleanText = (raw: string) =>
  raw.replace(/\s+/g, " ").replace(/\s*Footnotes\b.*/i, "").replace(/\s*\bNext\s*$/i, "").replace(/\s*\bPrevious\s*$/i, "").trim();

// ─────────────────────────────────────────────────────────────────────────────
export default function BibleView({ userId = "guest" }: { userId?: string }) {

  // ── Reader ───────────────────────────────────────────────────────────────
  const [translation, setTranslation] = useState(TRANSLATIONS[0]);
  const [bookIdx, setBookIdx]   = useState(42);
  const [chapter, setChapter]   = useState(3);
  const [verses, setVerses]     = useState<BibleVerse[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [verseNum, setVerseNum] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [addedSet, setAddedSet] = useState<Set<string>>(new Set());
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  // ── Global search ────────────────────────────────────────────────────────
  const [globalResults, setGlobalResults] = useState<{ reference: string; text: string }[]>([]);
  const [globalTotal, setGlobalTotal]     = useState(0);
  const [globalPage, setGlobalPage]       = useState(1);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalError, setGlobalError]     = useState<string | null>(null);
  const [globalMode, setGlobalMode]       = useState(false);
  const [lastGlobalQuery, setLastGlobalQuery] = useState("");
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set());

  // ── Panel: null | "verses" | "devotions" ─────────────────────────────────
  const [activePanel, setActivePanel]   = useState<"verses" | "devotions" | null>(null);
  const [isMobile, setIsMobile]         = useState(() => typeof window !== "undefined" && window.innerWidth < 640);

  // ── My Verses ────────────────────────────────────────────────────────────
  // ── Bible Info modal ──────────────────────────────────────────────────────
  const INFO_KEY = "wf_bible_info_seen";
  const [infoSeen, setInfoSeen]     = useState(() => !!localStorage.getItem(INFO_KEY));
  const [showInfo, setShowInfo]     = useState(false);
  const openInfo = () => {
    setShowInfo(true);
    if (!infoSeen) { localStorage.setItem(INFO_KEY, "1"); setInfoSeen(true); }
  };

  const [myVerses, setMyVerses]                 = useState<CollectedVerse[]>([]);
  const [versesLoading, setVersesLoading]       = useState(true);

  // ── My Devotions ─────────────────────────────────────────────────────────
  const [devotions, setDevotions]               = useState<DevotionNote[]>([]);
  const [devotionsLoading, setDevotionsLoading] = useState(true);
  const [showNewForm, setShowNewForm]           = useState(false);
  const [editingId, setEditingId]               = useState<string | null>(null);
  // soapInitial drives the SoapForm child; NOT updated on keystroke
  const blankForm = { title: "", scriptureRef: "", scripture: "", observation: "", application: "", prayer: "" };
  const [soapInitial, setSoapInitial] = useState(blankForm);
  const [savingDevotion, setSavingDevotion]     = useState(false);

  const book = BIBLE_BOOKS[bookIdx];
  const chapterCount = Array.from({ length: book.chapters }, (_, i) => i + 1);
  const displayBookName = translation.slug === "MBBTAG" ? MBB_BOOK_NAMES[bookIdx] : book.name;

  // ── Mobile resize ────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // ── Firestore: My Verses ──────────────────────────────────────────────────
  useEffect(() => {
    if (!userId || userId === "guest") { setVersesLoading(false); return; }
    let unsub: (() => void) | null = null;
    try {
      unsub = onSnapshot(
        doc(db, "users", userId, "bibleCollection", "verses"),
        (snap) => {
          try { const d = snap.data(); setMyVerses(Array.isArray(d?.items) ? d.items : []); } catch { setMyVerses([]); }
          setVersesLoading(false);
        },
        () => setVersesLoading(false)
      );
    } catch { setVersesLoading(false); }
    return () => { try { unsub?.(); } catch { /* noop */ } };
  }, [userId]);

  const persistVerses = useCallback(async (items: CollectedVerse[]) => {
    if (!userId || userId === "guest") return;
    try { await setDoc(doc(db, "users", userId, "bibleCollection", "verses"), { items }); } catch { /* noop */ }
  }, [userId]);

  // ── Firestore: My Devotions ───────────────────────────────────────────────
  useEffect(() => {
    if (!userId || userId === "guest") { setDevotionsLoading(false); return; }
    let unsub: (() => void) | null = null;
    try {
      unsub = onSnapshot(
        query(collection(db, "users", userId, "bibleDevotions"), orderBy("createdAt", "desc")),
        (snap) => {
          try { setDevotions(snap.docs.map(d => ({ id: d.id, ...d.data() } as DevotionNote))); } catch { setDevotions([]); }
          setDevotionsLoading(false);
        },
        () => setDevotionsLoading(false)
      );
    } catch { setDevotionsLoading(false); }
    return () => { try { unsub?.(); } catch { /* noop */ } };
  }, [userId]);

  // ── Devotion CRUD (SOAP) ──────────────────────────────────────────────
  const saveDevotion = async (values: { title: string; scriptureRef: string; scripture: string; observation: string; application: string; prayer: string }) => {
    const hasContent = values.title.trim() || values.scripture.trim() || values.observation.trim();
    if (!hasContent || !userId || userId === "guest") return;
    setSavingDevotion(true);
    const now = new Date().toISOString();
    const payload = { title: values.title, scriptureRef: values.scriptureRef, scripture: values.scripture, observation: values.observation, application: values.application, prayer: values.prayer };
    try {
      if (editingId) {
        await updateDoc(doc(db, "users", userId, "bibleDevotions", editingId), { ...payload, updatedAt: now });
      } else {
        await addDoc(collection(db, "users", userId, "bibleDevotions"), { ...payload, createdAt: now });
      }
      setSoapInitial(blankForm);
      setShowNewForm(false); setEditingId(null);
    } catch (err) {
      console.error("[BibleView] saveDevotion failed:", err);
      alert("Failed to save devotion. Please check your connection and try again.");
    }
    setSavingDevotion(false);
  };

  const startEdit = (note: DevotionNote) => {
    setEditingId(note.id);
    setSoapInitial({ title: note.title, scriptureRef: note.scriptureRef ?? "", scripture: (note as any).scripture ?? (note as any).body ?? "", observation: (note as any).observation ?? "", application: (note as any).application ?? "", prayer: (note as any).prayer ?? "" });
    setShowNewForm(true);
  };

  const deleteDevotion = async (id: string) => {
    if (!userId || userId === "guest") return;
    try { await deleteDoc(doc(db, "users", userId, "bibleDevotions", id)); } catch { /* noop */ }
  };

  // ── My Verses helpers ─────────────────────────────────────────────────────
  // Key is ref + translation slug so NIV/ESV saves are independent
  const handleCollect = (ref: string, text: string) => {
    const key = `${ref}||${translation.slug}`;
    setMyVerses(prev => {
      if (prev.find(v => v.ref === ref && v.translation === translation.label)) return prev;
      const updated = [{ ref, text, translation: translation.label, savedAt: new Date().toISOString() }, ...prev];
      persistVerses(updated);
      return updated;
    });
    setAddedSet(prev => new Set(prev).add(key));
    setTimeout(() => setAddedSet(prev => { const n = new Set(prev); n.delete(key); return n; }), 1500);
  };

  const removeVerse = (ref: string, translationLabel: string) => {
    setMyVerses(prev => { const u = prev.filter(v => !(v.ref === ref && v.translation === translationLabel)); persistVerses(u); return u; });
  };

  const handleCopy = (ref: string, text: string, tLabel: string) => {
    navigator.clipboard.writeText(`"${text}" — ${ref} (${tLabel})`);
    setCopiedRef(ref);
    setTimeout(() => setCopiedRef(null), 1800);
  };

  // ── Fetch chapter ─────────────────────────────────────────────────────────
  const fetchChapter = useCallback(async () => {
    setLoading(true); setError(null); setVerses([]); setVerseNum(""); setSearchQuery("");
    setGlobalMode(false); setGlobalResults([]); setGlobalTotal(0);
    try {
      const res = await fetch(`/api/bible/gateway?book=${encodeURIComponent(book.name)}&chapter=${chapter}&version=${translation.slug}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const parsed: BibleVerse[] = (data.verses ?? []).map((v: any) => ({ verse: v.verse, text: cleanText(v.text ?? "") }));
      setVerses(parsed.filter(v => v.text.length > 0).sort((a, b) => a.verse - b.verse));
    } catch { setError("Could not load chapter. Check your connection."); }
    setLoading(false);
  }, [translation, bookIdx, chapter, book.name]);

  useEffect(() => { fetchChapter(); }, [fetchChapter]);

  // ── Global search ─────────────────────────────────────────────────────────
  const doGlobalSearch = useCallback(async (q: string, page = 1) => {
    if (q.trim().length < 2) return;
    setGlobalLoading(true); setGlobalError(null); setGlobalMode(true);
    setLastGlobalQuery(q.trim()); setGlobalPage(page);
    try {
      const res = await fetch(`/api/bible/search?q=${encodeURIComponent(q.trim())}&version=${translation.slug}&page=${page}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGlobalResults(data.results ?? []); setGlobalTotal(data.total ?? 0);
    } catch { setGlobalError("Search failed."); setGlobalResults([]); }
    setGlobalLoading(false);
  }, [translation.slug]);

  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const q = searchQuery.trim();
    if (!q) return;
    const refMatch = q.match(/^([1-3]?\s*[a-zA-Z]+(?:\s+[a-zA-Z]+)?)\s+(\d+)(?::(\d+))?$/i);
    if (refMatch) {
      const bName = refMatch[1].trim().toLowerCase();
      const chNum = parseInt(refMatch[2]);
      const vNum  = refMatch[3] ?? "";
      const found = BIBLE_BOOKS.findIndex((b, i) =>
        b.name.toLowerCase().startsWith(bName) || MBB_BOOK_NAMES[i].toLowerCase().startsWith(bName)
      );
      if (found >= 0) {
        setBookIdx(found); setChapter(Math.min(chNum, BIBLE_BOOKS[found].chapters));
        setVerseNum(vNum); setSearchQuery(""); setGlobalMode(false); return;
      }
    }
    doGlobalSearch(q, 1);
  };

  const clearGlobalSearch = () => {
    setGlobalMode(false); setGlobalResults([]); setGlobalTotal(0);
    setSearchQuery(""); setLastGlobalQuery(""); setOpenAccordions(new Set());
  };

  const prevChapter = () => {
    if (chapter > 1) { setChapter(c => c - 1); return; }
    if (bookIdx > 0) { const p = bookIdx - 1; setBookIdx(p); setChapter(BIBLE_BOOKS[p].chapters); }
  };
  const nextChapter = () => {
    if (chapter < book.chapters) { setChapter(c => c + 1); return; }
    if (bookIdx < BIBLE_BOOKS.length - 1) { setBookIdx(b => b + 1); setChapter(1); }
  };

  const q   = searchQuery.toLowerCase().trim();
  const num = parseInt(verseNum);
  const allItems    = verses.filter(v => !verseNum || v.verse === num).map(v => ({ verse: v.verse, text: v.text, ref: `${book.name} ${chapter}:${v.verse}` }));
  const displayItems = q ? allItems.filter(item => item.text.toLowerCase().includes(q)) : allItems;

  const sel: React.CSSProperties = {
    background: "var(--wf-reader-surface-hi)", color: "var(--wf-reader-sel-text)",
    border: "1px solid var(--wf-reader-border-s)", outline: "none",
  };

  // ── PANEL CONTENT ─────────────────────────────────────────────────────────
  const PanelContent = () => (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--wf-reader-bg)" }}>

      {/* Tabs row */}
      <div className="shrink-0 flex items-center gap-1.5 px-3 pt-3 pb-2">
        {(["verses", "devotions"] as const).map(tab => (
          <button key={tab}
            onClick={() => setActivePanel(tab)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-bold transition-all"
            style={{
              background: activePanel === tab ? "rgba(var(--wf-c1),0.2)" : "var(--wf-reader-surface-f)",
              border:     activePanel === tab ? "1px solid rgba(var(--wf-c1),0.4)" : "1px solid var(--wf-reader-border)",
              color:      activePanel === tab ? "var(--wf-at2)" : "var(--wf-reader-text-2)",
            }}>
            {tab === "verses" ? <Bookmark size={13} /> : <ScrollText size={13} />}
            {tab === "verses" ? "My Verses" : "Devotions"}
            {tab === "verses" && myVerses.length > 0 && (
              <span style={{ color: "var(--wf-at2)", fontSize: 10, fontWeight: 900 }}>({myVerses.length})</span>
            )}
            {tab === "devotions" && devotions.length > 0 && (
              <span style={{ color: "var(--wf-at2)", fontSize: 10, fontWeight: 900 }}>({devotions.length})</span>
            )}
          </button>
        ))}
        {/* Close — desktop only */}
        {!isMobile && (
          <button onClick={() => { setActivePanel(null); setShowNewForm(false); }}
            className="flex items-center justify-center rounded-xl transition-all ml-0.5"
            style={{ width: 34, height: 34, background: "var(--wf-reader-surface-f)", border: "1px solid var(--wf-reader-border)", color: "var(--wf-reader-text-3)", flexShrink: 0 }}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* ── MY VERSES ── */}
      {activePanel === "verses" && (
        <>
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2"
            style={{ scrollbarWidth: "thin", scrollbarColor: "var(--wf-reader-border) transparent" }}>
            {versesLoading ? (
              <div className="flex flex-col items-center py-16">
                <Loader2 size={20} className="animate-spin" style={{ color: "rgba(var(--wf-c1),0.4)" }} />
                <p className="text-[11px] mt-3" style={{ color: "var(--wf-reader-text-4)" }}>Loading your verses…</p>
              </div>
            ) : myVerses.length === 0 ? (
              <div className="flex flex-col items-center py-16 px-4 text-center">
                <p className="text-4xl mb-3">📖</p>
                <p className="text-[13px] font-semibold" style={{ color: "var(--wf-reader-text-3)" }}>No saved verses yet</p>
                <p className="text-[11px] mt-2 leading-relaxed" style={{ color: "var(--wf-reader-text-4)" }}>
                  Tap <strong style={{ color: "rgba(var(--wf-c1),0.6)" }}>+</strong> next to any verse to save it here.
                </p>
              </div>
            ) : myVerses.map(v => (
              <div key={`${v.ref}||${v.translation}`} className="rounded-2xl p-3"
                style={{ background: "var(--wf-reader-surface-f)", border: "1px solid var(--wf-reader-border)" }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(var(--wf-c1),0.15)", color: "var(--wf-at2)" }}>
                    {v.ref} · {v.translation}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleCopy(v.ref, v.text, v.translation)}
                      style={{ width: 28, height: 28, color: copiedRef === v.ref ? "#10b981" : "var(--wf-reader-text-3)" }}
                      className="flex items-center justify-center rounded-lg">
                      {copiedRef === v.ref ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                    <button onClick={() => removeVerse(v.ref, v.translation)}
                      style={{ width: 28, height: 28, color: "rgba(239,68,68,0.5)" }}
                      className="flex items-center justify-center rounded-lg"
                      onMouseEnter={e => (e.currentTarget.style.color = "rgba(239,68,68,0.9)")}
                      onMouseLeave={e => (e.currentTarget.style.color = "rgba(239,68,68,0.5)")}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <p className="text-[13px] leading-relaxed" style={{ color: "var(--wf-reader-text-1)" }}>"{v.text}"</p>
              </div>
            ))}
          </div>
          {myVerses.length > 0 && (
            <div className="shrink-0 px-3 pb-3 pt-2" style={{ borderTop: "1px solid var(--wf-reader-surface-hi)" }}>
              <button onClick={() => { setMyVerses([]); persistVerses([]); }}
                className="w-full py-2 rounded-xl text-[12px] font-semibold"
                style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", color: "rgba(239,68,68,0.6)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.1)")}
                onMouseLeave={e => (e.currentTarget.style.background = "rgba(239,68,68,0.06)")}>
                Clear All Saved Verses
              </button>
            </div>
          )}
        </>
      )}

      {/* ── MY DEVOTIONS ── */}
      {activePanel === "devotions" && (
        <>
          {showNewForm ? (
            <SoapForm
              initialValues={soapInitial}
              editingId={editingId}
              saving={savingDevotion}
              onSave={saveDevotion}
              onCancel={() => { setShowNewForm(false); setEditingId(null); setSoapInitial(blankForm); }}
            />
          ) : (
            <>
              <div className="shrink-0 px-3 pb-2">
                <button
                  onClick={() => { setEditingId(null); setSoapInitial({ ...blankForm, scriptureRef: `${displayBookName} ${chapter}` }); setShowNewForm(true); }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-bold"
                  style={{ background: "rgba(var(--wf-c1),0.12)", border: "1px solid rgba(var(--wf-c1),0.3)", color: "var(--wf-at2)" }}>
                  <Plus size={15} /> New SOAP Devotion
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2"
                style={{ scrollbarWidth: "thin", scrollbarColor: "var(--wf-reader-border) transparent" }}>
                {devotionsLoading ? (
                  <div className="flex flex-col items-center py-16">
                    <Loader2 size={20} className="animate-spin" style={{ color: "rgba(var(--wf-c1),0.4)" }} />
                    <p className="text-[11px] mt-3" style={{ color: "var(--wf-reader-text-4)" }}>Loading devotions…</p>
                  </div>
                ) : devotions.length === 0 ? (
                  <div className="flex flex-col items-center py-16 px-4 text-center">
                    <p className="text-4xl mb-3">✍️</p>
                    <p className="text-[13px] font-semibold" style={{ color: "var(--wf-reader-text-3)" }}>No devotions yet</p>
                    <p className="text-[11px] mt-2 leading-relaxed" style={{ color: "var(--wf-reader-text-4)" }}>
                      Tap <strong style={{ color: "rgba(var(--wf-c1),0.6)" }}>New Devotion</strong> to write your first reflection.
                    </p>
                  </div>
                ) : devotions.map(note => (
                  <div key={note.id} className="rounded-2xl p-3"
                    style={{ background: "var(--wf-reader-surface-f)", border: "1px solid var(--wf-reader-border)" }}>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        {note.title && <p className="text-[13px] font-bold truncate" style={{ color: "var(--wf-reader-text-1)" }}>{note.title}</p>}
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {note.scriptureRef && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" }}>
                              📖 {note.scriptureRef}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-full"
                            style={{ background: "var(--wf-reader-surface)", color: "var(--wf-reader-text-3)" }}>
                            S · O · A · P
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => startEdit(note)}
                          style={{ width: 28, height: 28, color: "var(--wf-reader-text-3)" }}
                          className="flex items-center justify-center rounded-lg"
                          onMouseEnter={e => (e.currentTarget.style.color = "var(--wf-reader-text-1)")}
                          onMouseLeave={e => (e.currentTarget.style.color = "var(--wf-reader-text-3)")}>
                          <Edit3 size={13} />
                        </button>
                        <button onClick={() => deleteDevotion(note.id)}
                          style={{ width: 28, height: 28, color: "rgba(239,68,68,0.4)" }}
                          className="flex items-center justify-center rounded-lg"
                          onMouseEnter={e => (e.currentTarget.style.color = "rgba(239,68,68,0.9)")}
                          onMouseLeave={e => (e.currentTarget.style.color = "rgba(239,68,68,0.4)")}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    {/* SOAP mini-preview */}
                    <div className="space-y-1.5 mt-2">
                      {(note.scripture || note.body) && (
                        <div className="flex gap-2">
                          <span className="text-[9px] font-black w-4 h-4 flex items-center justify-center rounded shrink-0 mt-0.5" style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}>S</span>
                          <p className="text-[11px] leading-relaxed" style={{ color: "var(--wf-reader-text-2)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{note.scripture || note.body}</p>
                        </div>
                      )}
                      {note.observation && (
                        <div className="flex gap-2">
                          <span className="text-[9px] font-black w-4 h-4 flex items-center justify-center rounded shrink-0 mt-0.5" style={{ background: "rgba(251,146,60,0.2)", color: "#fdba74" }}>O</span>
                          <p className="text-[11px] leading-relaxed" style={{ color: "var(--wf-reader-text-2)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>{note.observation}</p>
                        </div>
                      )}
                      {note.application && (
                        <div className="flex gap-2">
                          <span className="text-[9px] font-black w-4 h-4 flex items-center justify-center rounded shrink-0 mt-0.5" style={{ background: "rgba(16,185,129,0.2)", color: "#6ee7b7" }}>A</span>
                          <p className="text-[11px] leading-relaxed" style={{ color: "var(--wf-reader-text-2)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>{note.application}</p>
                        </div>
                      )}
                      {note.prayer && (
                        <div className="flex gap-2">
                          <span className="text-[9px] font-black w-4 h-4 flex items-center justify-center rounded shrink-0 mt-0.5" style={{ background: "rgba(167,139,250,0.2)", color: "#c4b5fd" }}>P</span>
                          <p className="text-[11px] leading-relaxed" style={{ color: "var(--wf-reader-text-2)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>{note.prayer}</p>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] mt-2" style={{ color: "var(--wf-reader-text-4)" }}>
                      {new Date(note.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );

  // ── MAIN RENDER ───────────────────────────────────────────────────────────
  // On mobile: show EITHER reader OR panel (never both — no blur, no overlay)
  // On desktop: show reader + side panel together
  const showReader = !isMobile || activePanel === null;
  const showPanel  = activePanel !== null;

  return (
    <div className="flex h-full" style={{ background: "var(--wf-reader-bg)", fontFamily: "Inter, sans-serif" }}>

      {/* ── INFO MODAL ── */}
      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
          onClick={() => setShowInfo(false)}>
          <div className="relative w-full max-w-sm overflow-hidden rounded-3xl"
            style={{ background: "linear-gradient(175deg,#1a1740 0%,#0f0e1e 100%)", border: "1px solid rgba(139,92,246,0.2)", boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(139,92,246,0.08)" }}
            onClick={e => e.stopPropagation()}>

            {/* ── Hero banner ── */}
            <div className="relative overflow-hidden px-6 pt-8 pb-6 text-center"
              style={{ background: "linear-gradient(135deg,rgba(109,40,217,0.35) 0%,rgba(16,185,129,0.12) 100%)" }}>
              {/* Decorative orbs */}
              <div className="absolute -top-6 -left-6 w-28 h-28 rounded-full pointer-events-none"
                style={{ background: "radial-gradient(circle,rgba(139,92,246,0.35),transparent 70%)" }} />
              <div className="absolute -bottom-4 -right-4 w-24 h-24 rounded-full pointer-events-none"
                style={{ background: "radial-gradient(circle,rgba(16,185,129,0.25),transparent 70%)" }} />
              {/* Icon badge */}
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 relative"
                style={{ background: "linear-gradient(135deg,rgba(139,92,246,0.5),rgba(16,185,129,0.25))", border: "1px solid rgba(139,92,246,0.4)", boxShadow: "0 8px 24px rgba(139,92,246,0.3)" }}>
                <Info size={26} style={{ color: "#c4b5fd" }} />
              </div>
              <h2 className="text-[18px] font-extrabold tracking-tight mb-1" style={{ color: "#fff" }}>A Quick Note</h2>
              <p className="text-[12px] font-semibold tracking-widest uppercase" style={{ color: "rgba(196,181,253,0.6)" }}>From the WorshipFlow team</p>
            </div>

            {/* ── Body ── */}
            <div className="px-6 pt-5 pb-2 space-y-4">
              <div className="pl-3 text-[14px] leading-[1.85]"
                style={{ color: "var(--wf-reader-text-1)", borderLeft: "2px solid rgba(139,92,246,0.5)" }}>
                Hello! I hope this helps with your spiritual growth. This module isn't intended to make you lazy or stop you from journaling and carrying your Bible. At the end of the day, <span style={{ color: "#c4b5fd", fontWeight: 600 }}>these are just tools</span> — we shouldn't become too dependent on them.
              </div>
              <div className="pl-3 text-[14px] leading-[1.85]"
                style={{ color: "var(--wf-reader-text-1)", borderLeft: "2px solid rgba(16,185,129,0.5)" }}>
                It's for a case-to-case basis — so you can read anywhere, with different translations and devotionals for those times you've forgotten your notebook. The most important thing is that we remain <span style={{ color: "#6ee7b7", fontWeight: 600 }}>attentive to the Holy Spirit's leading</span> in our lives. That's all, thanks! 🙏
              </div>
            </div>

            {/* ── Footer ── */}
            <div className="px-6 pb-6 pt-4">
              <button onClick={() => setShowInfo(false)}
                className="w-full py-3.5 rounded-2xl text-[14px] font-bold tracking-wide transition-all active:scale-95"
                style={{ background: "linear-gradient(135deg,rgba(109,40,217,0.9),rgba(139,92,246,0.75))", color: "#fff", boxShadow: "0 4px 20px rgba(109,40,217,0.4)" }}>
                Got it — keep it real 🙏
              </button>
            </div>

            {/* Close X */}
            <button onClick={() => setShowInfo(false)}
              className="absolute top-3.5 right-3.5 flex items-center justify-center rounded-xl transition-all active:scale-95"
              style={{ width: 30, height: 30, background: "var(--wf-reader-surface-hi)", color: "var(--wf-reader-text-3)" }}>
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── READER ── */}
      {showReader && (
        <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">

          {/* Header */}
          <div className="shrink-0 px-4 sm:px-6"
            style={{ minHeight: 68, borderBottom: "1px solid var(--wf-reader-surface-hi)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center justify-center rounded-2xl shrink-0"
                style={{ width: 42, height: 42, background: "linear-gradient(135deg,rgba(var(--wf-c1),0.25),rgba(16,185,129,0.12))", border: "1px solid rgba(var(--wf-c1),0.3)" }}>
                <Bookmark size={20} style={{ color: "var(--wf-at)" }} />
              </div>
              <div className="min-w-0">
                <p className="text-[15px] sm:text-[16px] font-bold" style={{ color: "var(--wf-reader-text-1)" }}>Bible</p>
                <p className="text-[10px] sm:text-[12px] font-semibold truncate" style={{ color: "var(--wf-reader-text-3)", letterSpacing: "0.04em" }}>
                  {displayBookName} {chapter} · {translation.label}
                </p>
              </div>
            </div>
            {/* Panel toggle buttons */}
            <div className="flex items-center gap-4 shrink-0">
              {/* Info */}
              <button onClick={openInfo}
                className="relative flex items-center justify-center transition-all active:scale-95"
                title="About this module"
                style={{ color: infoSeen ? "var(--wf-reader-text-3)" : "rgba(var(--wf-c1),0.9)" }}>
                <Info size={22} className="sm:hidden" />
                <Info size={17} className="hidden sm:block" />
                {!infoSeen && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full animate-ping"
                    style={{ background: "rgba(var(--wf-c1),0.9)" }} />
                )}
              </button>
              {/* My Verses */}
              <button onClick={() => setActivePanel(p => p === "verses" ? null : "verses")}
                className="flex items-center gap-1.5 transition-all active:scale-95 relative"
                style={{ color: activePanel === "verses" ? "var(--wf-at2)" : "var(--wf-reader-text-3)" }}>
                <Bookmark size={22} className="sm:hidden" />
                <Bookmark size={17} className="hidden sm:block" />
                <span className="hidden sm:inline text-[13px] font-bold">My Verses</span>
                {myVerses.length > 0 && (
                  <span className="absolute -top-1 -right-1 sm:static sm:ml-0" style={{ minWidth: 14, height: 14, background: "rgba(var(--wf-c1),0.35)", color: "var(--wf-at2)", fontSize: 9, fontWeight: 900, borderRadius: 999, padding: "0 3px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {myVerses.length}
                  </span>
                )}
              </button>
              {/* Devotions */}
              <button onClick={() => setActivePanel(p => p === "devotions" ? null : "devotions")}
                className="flex items-center gap-1.5 transition-all active:scale-95 relative"
                style={{ color: activePanel === "devotions" ? "var(--wf-at2)" : "var(--wf-reader-text-3)" }}>
                <ScrollText size={22} className="sm:hidden" />
                <ScrollText size={17} className="hidden sm:block" />
                <span className="hidden sm:inline text-[13px] font-bold">Devotions</span>
                {devotions.length > 0 && (
                  <span className="absolute -top-1 -right-1 sm:static sm:ml-0" style={{ minWidth: 14, height: 14, background: "rgba(var(--wf-c1),0.35)", color: "var(--wf-at2)", fontSize: 9, fontWeight: 900, borderRadius: 999, padding: "0 3px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {devotions.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Controls */}
          <div className="shrink-0 px-4 sm:px-6 pt-3 pb-2 space-y-2">

            {/* ── MOBILE layout: Translation dropdown + Book/Ch/Vs on same row ── */}
            <div className="sm:hidden space-y-2">
              {/* Row 1: Translation dropdown + Book + Chapter + Verse */}
              <div className="flex gap-1.5 items-center">
                {/* Translation dropdown */}
                <div className="relative shrink-0" style={{ width: 68 }}>
                  <select
                    value={translation.slug}
                    onChange={e => { const t = TRANSLATIONS.find(x => x.slug === e.target.value); if (t) setTranslation(t); }}
                    className="w-full appearance-none font-bold px-2 py-2.5 rounded-xl text-center"
                    style={{ ...sel, fontSize: 12 }}>
                    {TRANSLATIONS.map(t => (
                      <option key={t.slug} value={t.slug} style={{ background: "var(--wf-reader-sel-bg)" }}>{t.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--wf-reader-text-3)" }} />
                </div>
                {/* Book */}
                <div className="relative flex-1">
                  <select value={bookIdx} onChange={e => { setBookIdx(+e.target.value); setChapter(1); setVerseNum(""); setSearchQuery(""); }}
                    className="w-full appearance-none font-semibold px-3 py-2.5 rounded-xl truncate" style={{ ...sel, fontSize: 13 }}>
                    {BIBLE_BOOKS.map((b, i) => (
                      <option key={b.name} value={i} style={{ background: "var(--wf-reader-sel-bg)" }}>
                        {translation.slug === "MBBTAG" ? MBB_BOOK_NAMES[i] : b.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--wf-reader-text-3)" }} />
                </div>
                {/* Chapter */}
                <div className="relative shrink-0" style={{ width: 52 }}>
                  <select value={chapter} onChange={e => { setChapter(+e.target.value); setVerseNum(""); setSearchQuery(""); }}
                    className="w-full appearance-none font-semibold px-2 py-2.5 rounded-xl text-center" style={{ ...sel, fontSize: 13 }}>
                    {chapterCount.map(c => <option key={c} value={c} style={{ background: "var(--wf-reader-sel-bg)" }}>{c}</option>)}
                  </select>
                  <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--wf-reader-text-3)" }} />
                </div>
                {/* Verse */}
                <div className="relative shrink-0" style={{ width: 52 }}>
                  <select value={verseNum} onChange={e => { setVerseNum(e.target.value); setSearchQuery(""); }}
                    className="w-full appearance-none font-semibold px-2 py-2.5 rounded-xl text-center" style={{ ...sel, fontSize: 13 }}>
                    <option value="" style={{ background: "var(--wf-reader-sel-bg)" }}>v.</option>
                    {verses.map(v => <option key={v.verse} value={v.verse} style={{ background: "var(--wf-reader-sel-bg)" }}>{v.verse}</option>)}
                  </select>
                  <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--wf-reader-text-3)" }} />
                </div>
              </div>
              {/* Row 2: Search */}
              <div className="relative flex items-center">
                <List size={13} className="absolute left-3 pointer-events-none" style={{ color: "rgba(var(--wf-c1),0.5)" }} />
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={handleSearchKey}
                  placeholder="Search a word in this chapter, or press Enter to search all 66 books"
                  className="w-full text-[13px] py-2.5 pl-8 pr-8 rounded-xl outline-none"
                  style={{ background: "var(--wf-reader-surface)", border: searchQuery ? "1px solid rgba(var(--wf-c1),0.45)" : "1px solid var(--wf-reader-border)", color: "var(--wf-reader-text-1)" }} />
                {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-3" style={{ color: "var(--wf-reader-text-3)" }}><X size={13} /></button>}
              </div>
              {searchQuery && !globalMode && (
                <p className="text-[10px] text-center" style={{ color: "rgba(var(--wf-c1),0.5)" }}>Press ⏎ Enter to search all 66 books</p>
              )}
            </div>

            {/* ── DESKTOP layout: pills + selectors + search (unchanged) ── */}
            <div className="hidden sm:block space-y-3">
              {/* Translation tabs */}
              <div className="flex gap-1 p-1 rounded-xl overflow-x-auto" style={{ background: "var(--wf-reader-surface-f)", border: "1px solid var(--wf-reader-surface-hi)", scrollbarWidth: "none" }}>
                {TRANSLATIONS.map(t => (
                  <button key={t.slug} onClick={() => setTranslation(t)}
                    className="flex-shrink-0 py-2 rounded-lg text-[14px] font-bold transition-all"
                    style={{ minWidth: 52,
                      background: translation.slug === t.slug ? "linear-gradient(135deg,rgba(var(--wf-c1),0.9),rgba(var(--wf-c2),0.8))" : "transparent",
                      color: translation.slug === t.slug ? "#fff" : "var(--wf-reader-text-2)" }}
                    title={t.full}>{t.label}</button>
                ))}
              </div>
              {/* Book / Chapter / Verse */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <select value={bookIdx} onChange={e => { setBookIdx(+e.target.value); setChapter(1); setVerseNum(""); setSearchQuery(""); }}
                    className="w-full appearance-none font-semibold px-4 py-3 rounded-xl truncate" style={{ ...sel, fontSize: 15 }}>
                    {BIBLE_BOOKS.map((b, i) => (
                      <option key={b.name} value={i} style={{ background: "var(--wf-reader-sel-bg)" }}>
                        {translation.slug === "MBBTAG" ? MBB_BOOK_NAMES[i] : b.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--wf-reader-text-3)" }} />
                </div>
                <div className="relative" style={{ width: 68 }}>
                  <select value={chapter} onChange={e => { setChapter(+e.target.value); setVerseNum(""); setSearchQuery(""); }}
                    className="w-full appearance-none font-semibold px-2 py-3 rounded-xl text-center" style={{ ...sel, fontSize: 15 }}>
                    {chapterCount.map(c => <option key={c} value={c} style={{ background: "var(--wf-reader-sel-bg)" }}>{c}</option>)}
                  </select>
                  <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--wf-reader-text-3)" }} />
                </div>
                <div className="relative" style={{ width: 68 }}>
                  <select value={verseNum} onChange={e => { setVerseNum(e.target.value); setSearchQuery(""); }}
                    className="w-full appearance-none font-semibold px-2 py-3 rounded-xl text-center" style={{ ...sel, fontSize: 15 }}>
                    <option value="" style={{ background: "var(--wf-reader-sel-bg)" }}>v.</option>
                    {verses.map(v => <option key={v.verse} value={v.verse} style={{ background: "var(--wf-reader-sel-bg)" }}>{v.verse}</option>)}
                  </select>
                  <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--wf-reader-text-3)" }} />
                </div>
              </div>
              {/* Search */}
              <div className="relative flex items-center">
                <List size={15} className="absolute left-3.5 pointer-events-none" style={{ color: "rgba(var(--wf-c1),0.5)" }} />
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={handleSearchKey}
                  placeholder="Search a word in this chapter, or press Enter to search all 66 books"
                  className="w-full text-[15px] py-3 pl-10 pr-9 rounded-xl outline-none"
                  style={{ background: "var(--wf-reader-surface)", border: searchQuery ? "1px solid rgba(var(--wf-c1),0.45)" : "1px solid var(--wf-reader-border)", color: "var(--wf-reader-text-1)" }} />
                {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-3" style={{ color: "var(--wf-reader-text-3)" }}><X size={15} /></button>}
              </div>
              {searchQuery && !globalMode && (
                <p className="text-[12px] text-center" style={{ color: "rgba(var(--wf-c1),0.5)" }}>Press ⏎ Enter to search all 66 books</p>
              )}
            </div>

          </div>

          {/* Chapter bar */}
          <div className="shrink-0 px-4 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between gap-3"
            style={{ borderBottom: "1px solid var(--wf-reader-surface-hi)", background: globalMode ? "rgba(var(--wf-c1),0.04)" : "var(--wf-reader-surface-f)" }}>
            {!globalMode && (
              <button onClick={prevChapter} disabled={bookIdx === 0 && chapter === 1}
                className="flex items-center justify-center rounded-lg disabled:opacity-20"
                style={{ width: 32, height: 32, background: "var(--wf-reader-surface)", border: "1px solid var(--wf-reader-border)", color: "var(--wf-reader-text-2)" }}>
                <ChevronLeft size={16} />
              </button>
            )}
            {/* Center: title stacked above verse count */}
            <span className="flex-1 flex flex-col items-center justify-center gap-0.5 text-center">
              <span className="text-sm sm:text-[14px] font-bold tracking-widest uppercase" style={{ color: "rgba(var(--wf-c1),0.7)" }}>
                {globalMode ? `🔍 "${lastGlobalQuery}" · ${translation.label}` : `${displayBookName} ${chapter} · ${translation.label}`}
              </span>
              {!globalMode && !loading && verses.length > 0 && (
                <span className="text-[9px] sm:text-[11px] font-medium tracking-wider uppercase" style={{ color: "var(--wf-reader-text-4)" }}>
                  {q ? `${displayItems.length} / ` : ""}{verses.length} verses
                </span>
              )}
            </span>
            {globalMode ? (
              <button onClick={clearGlobalSearch} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold"
                style={{ background: "var(--wf-reader-surface)", border: "1px solid var(--wf-reader-border-s)", color: "var(--wf-reader-text-2)" }}>
                <X size={12} /> Clear
              </button>
            ) : (
              <button onClick={nextChapter} disabled={bookIdx === BIBLE_BOOKS.length - 1 && chapter === book.chapters}
                className="flex items-center justify-center rounded-lg disabled:opacity-20"
                style={{ width: 32, height: 32, background: "var(--wf-reader-surface)", border: "1px solid var(--wf-reader-border)", color: "var(--wf-reader-text-2)" }}>
                <ChevronRight size={16} />
              </button>
            )}
          </div>

          {/* Verse list */}
          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--wf-reader-border) transparent", paddingBottom: 80 }}>
            {globalMode ? (
              <div className="px-4 sm:px-6 pt-2">
                {globalLoading && (
                  <div className="py-4 space-y-4">
                    {[1,2,3,4].map(i => (
                      <div key={i} className="rounded-2xl p-4 animate-pulse" style={{ background: "var(--wf-reader-surface-f)", border: "1px solid var(--wf-reader-surface-hi)" }}>
                        <div className="rounded h-2.5 w-1/3 mb-3" style={{ background: "rgba(var(--wf-c1),0.15)" }} />
                        <div className="rounded h-3 w-full mb-1.5" style={{ background: "var(--wf-reader-surface-hi)" }} />
                        <div className="rounded h-3 w-4/5" style={{ background: "var(--wf-reader-surface-f)" }} />
                      </div>
                    ))}
                  </div>
                )}
                {globalError && !globalLoading && (
                  <div className="flex flex-col items-center py-10">
                    <p className="text-[12px] font-semibold mb-2" style={{ color: "rgba(239,68,68,0.8)" }}>Search failed</p>
                    <button onClick={() => doGlobalSearch(lastGlobalQuery, globalPage)}
                      className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-semibold"
                      style={{ background: "rgba(var(--wf-c1),0.15)", border: "1px solid rgba(var(--wf-c1),0.3)", color: "var(--wf-at2)" }}>
                      <RefreshCw size={12} /> Try again
                    </button>
                  </div>
                )}
                {!globalLoading && !globalError && globalResults.length === 0 && (
                  <div className="flex flex-col items-center py-12">
                    <p className="text-3xl mb-3">📭</p>
                    <p className="text-[13px] font-semibold" style={{ color: "var(--wf-reader-text-3)" }}>No results found</p>
                  </div>
                )}
                {!globalLoading && (() => {
                  const byBook: Record<string, { reference: string; text: string }[]> = {};
                  globalResults.forEach(r => {
                    const m = r.reference.match(/^(.+?)\s+\d+:\d+$/);
                    const bk = m ? m[1].trim() : r.reference;
                    if (!byBook[bk]) byBook[bk] = [];
                    byBook[bk].push(r);
                  });
                  const hlReg = lastGlobalQuery.trim().length > 1
                    ? new RegExp(`(${lastGlobalQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi') : null;
                  return Object.entries(byBook).map(([bookName, results]) => {
                    const isOpen = openAccordions.has(bookName);
                    const toggle = () => setOpenAccordions(prev => {
                      const n = new Set(prev); isOpen ? n.delete(bookName) : n.add(bookName); return n;
                    });
                    return (
                      <div key={bookName} className="mb-2 rounded-2xl overflow-hidden" style={{ border: "1px solid var(--wf-reader-border)" }}>
                        <button onClick={toggle} className="w-full flex items-center justify-between px-4 py-3 transition-all"
                          style={{ background: isOpen ? "rgba(var(--wf-c1),0.12)" : "var(--wf-reader-surface-f)", borderBottom: isOpen ? "1px solid rgba(var(--wf-c1),0.2)" : "none" }}>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-bold" style={{ color: isOpen ? "var(--wf-at2)" : "var(--wf-reader-text-1)" }}>{bookName}</span>
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: "rgba(var(--wf-c1),0.2)", color: "var(--wf-at2)" }}>
                              {results.length} {results.length === 1 ? "match" : "matches"}
                            </span>
                          </div>
                          <ChevronDown size={14} style={{ color: "var(--wf-reader-text-3)", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                        </button>
                        {isOpen && (
                          <div>
                            {results.map((result, idx) => {
                              const ref = result.reference || "";
                              const isAdded = addedSet.has(ref);
                              const hlText = hlReg
                                ? result.text.replace(hlReg, '<mark style="background:rgba(var(--wf-c1),0.3);color:#e0e7ff;border-radius:3px;padding:0 2px">$1</mark>')
                                : result.text;
                              return (
                                <div key={`${ref}-${idx}`} style={{ borderTop: "1px solid var(--wf-reader-surface)" }}>
                                  <div className="group flex gap-3 py-3.5 px-3 transition-all"
                                    style={{ background: isAdded ? "rgba(16,185,129,0.06)" : "transparent", border: isAdded ? "1px solid rgba(16,185,129,0.12)" : "1px solid transparent" }}
                                    onMouseEnter={e => !isAdded && (e.currentTarget.style.background = "var(--wf-reader-surface-f)")}
                                    onMouseLeave={e => !isAdded && (e.currentTarget.style.background = "transparent")}>
                                    {/* Left: verse reference chip */}
                                    <span className="text-[11px] font-black shrink-0 mt-1 min-w-[52px]"
                                      style={{ color: isAdded ? "#10b981" : "rgba(var(--wf-c1),0.85)" }}>
                                      {ref.match(/\d+:\d+$/)?.[0] ?? ""}
                                    </span>
                                    {/* Middle: text + ref label */}
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[15px] sm:text-[16px] leading-[1.75]" style={{ color: "var(--wf-reader-text-1)" }} dangerouslySetInnerHTML={{ __html: hlText }} />
                                      <div className="flex items-center justify-between mt-1.5">
                                        <p className="text-[11px] font-semibold" style={{ color: "var(--wf-reader-text-3)" }}>{ref} · {translation.label}</p>
                                        {/* Mobile buttons inline */}
                                        <div className="flex items-center gap-2 sm:hidden">
                                          <button onClick={() => handleCollect(ref, result.text)}
                                            className="flex items-center justify-center rounded-full"
                                            title={isAdded ? "Saved!" : "Save verse"}
                                            style={{ width: 36, height: 36, background: isAdded ? "rgba(16,185,129,0.18)" : "rgba(var(--wf-c1),0.12)", border: isAdded ? "1px solid rgba(16,185,129,0.4)" : "1px solid rgba(var(--wf-c1),0.25)", color: isAdded ? "#10b981" : "rgba(var(--wf-c1),0.9)" }}>
                                            {isAdded ? <Check size={16} /> : <PlusCircle size={16} />}
                                          </button>
                                          <button onClick={() => handleCopy(ref, result.text, translation.label)}
                                            className="flex items-center justify-center rounded-full"
                                            title="Copy verse"
                                            style={{ width: 36, height: 36, background: copiedRef === ref ? "rgba(16,185,129,0.1)" : "var(--wf-reader-surface)", border: "1px solid rgba(255,255,255,0.1)", color: copiedRef === ref ? "#10b981" : "var(--wf-reader-text-3)" }}>
                                            {copiedRef === ref ? <Check size={15} /> : <Copy size={15} />}
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                    {/* Desktop: stacked circular buttons on right */}
                                    <div className="hidden sm:flex flex-col gap-2 shrink-0 self-start pt-0.5">
                                      <button onClick={() => handleCollect(ref, result.text)}
                                        className="flex items-center justify-center rounded-full"
                                        title={isAdded ? "Saved!" : "Save verse"}
                                        style={{ width: 36, height: 36, background: isAdded ? "rgba(16,185,129,0.18)" : "rgba(var(--wf-c1),0.12)", border: isAdded ? "1px solid rgba(16,185,129,0.4)" : "1px solid rgba(var(--wf-c1),0.25)", color: isAdded ? "#10b981" : "rgba(var(--wf-c1),0.9)" }}>
                                        {isAdded ? <Check size={16} /> : <PlusCircle size={16} />}
                                      </button>
                                      <button onClick={() => handleCopy(ref, result.text, translation.label)}
                                        className="flex items-center justify-center rounded-full"
                                        title="Copy verse"
                                        style={{ width: 36, height: 36, background: copiedRef === ref ? "rgba(16,185,129,0.1)" : "var(--wf-reader-surface)", border: "1px solid rgba(255,255,255,0.1)", color: copiedRef === ref ? "#10b981" : "var(--wf-reader-text-3)" }}>
                                        {copiedRef === ref ? <Check size={15} /> : <Copy size={15} />}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
                {!globalLoading && globalResults.length > 0 && (
                  <div className="flex items-center justify-between py-4">
                    <button disabled={globalPage <= 1} onClick={() => doGlobalSearch(lastGlobalQuery, globalPage - 1)}
                      className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-semibold disabled:opacity-30"
                      style={{ background: "var(--wf-reader-surface)", border: "1px solid var(--wf-reader-border-s)", color: "var(--wf-reader-text-2)" }}>
                      ← Prev
                    </button>
                    <span className="text-[11px]" style={{ color: "var(--wf-reader-text-4)" }}>Page {globalPage} · {globalTotal.toLocaleString()} results</span>
                    <button disabled={globalPage * 25 >= globalTotal} onClick={() => doGlobalSearch(lastGlobalQuery, globalPage + 1)}
                      className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-semibold disabled:opacity-30"
                      style={{ background: "var(--wf-reader-surface)", border: "1px solid var(--wf-reader-border-s)", color: "var(--wf-reader-text-2)" }}>
                      Next →
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="px-4 sm:px-6 pt-2">
                {loading && (
                  <div className="py-4 space-y-4">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className="flex gap-3 animate-pulse">
                        <div className="rounded w-5 h-4 shrink-0 mt-1" style={{ background: "var(--wf-reader-border)" }} />
                        <div className="flex-1 space-y-1.5">
                          <div className="rounded h-3 w-full" style={{ background: "var(--wf-reader-surface-hi)" }} />
                          <div className="rounded h-3 w-4/5" style={{ background: "var(--wf-reader-surface-f)" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {error && !loading && (
                  <div className="flex flex-col items-center py-10">
                    <p className="text-[12px] font-semibold mb-2" style={{ color: "rgba(239,68,68,0.8)" }}>Failed to load</p>
                    <p className="text-[11px] mb-3" style={{ color: "var(--wf-reader-text-4)" }}>{error}</p>
                    <button onClick={fetchChapter}
                      className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-semibold"
                      style={{ background: "rgba(var(--wf-c1),0.15)", border: "1px solid rgba(var(--wf-c1),0.3)", color: "var(--wf-at2)" }}>
                      <RefreshCw size={12} /> Try again
                    </button>
                  </div>
                )}
                {!loading && !error && q && displayItems.length === 0 && verses.length > 0 && (
                  <div className="flex flex-col items-center py-10">
                    <p className="text-2xl mb-2">🔍</p>
                    <p className="text-[12px] font-semibold" style={{ color: "var(--wf-reader-text-3)" }}>No verses match</p>
                  </div>
                )}
                {displayItems.map((item, idx) => {
                const verseKey = `${item.ref}||${translation.slug}`;
                  const isAdded = addedSet.has(verseKey) || myVerses.some(c => c.ref === item.ref && c.translation === translation.label);
                  const highlighted = q
                    ? item.text.replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                        '<mark style="background:rgba(var(--wf-c1),0.3);color:#e0e7ff;border-radius:3px;padding:0 2px">$1</mark>')
                    : null;
                  return (
                    <div key={item.ref} className="my-1">
                      {idx > 0 && <div style={{ borderTop: "1px solid var(--wf-reader-surface)", marginBottom: 4 }} />}
                      <div className="group flex gap-3 py-3.5 px-2 rounded-2xl transition-all"
                        style={{ background: isAdded ? "rgba(16,185,129,0.06)" : "transparent", border: isAdded ? "1px solid rgba(16,185,129,0.15)" : "1px solid transparent" }}
                        onMouseEnter={e => !isAdded && (e.currentTarget.style.background = "var(--wf-reader-surface-f)")}
                        onMouseLeave={e => !isAdded && (e.currentTarget.style.background = "transparent")}>
                        <span className="text-[15px] font-black shrink-0 mt-0.5 w-6 text-right"
                          style={{ color: isAdded ? "#10b981" : "rgba(var(--wf-c1),0.85)" }}>
                          {item.verse}
                        </span>
                        <div className="flex-1 min-w-0">
                          {highlighted
                            ? <p className="text-[15px] sm:text-[17px] leading-[1.75]" style={{ color: "var(--wf-reader-text-1)" }} dangerouslySetInnerHTML={{ __html: highlighted }} />
                            : <p className="text-[15px] sm:text-[17px] leading-[1.75]" style={{ color: "var(--wf-reader-text-1)" }}>{item.text}</p>}
                          {/* ref label + inline action buttons (mobile only) */}
                          <div className="flex items-center justify-between mt-2">
                            <p className="text-[11px] sm:text-[12px] font-semibold" style={{ color: "var(--wf-reader-text-3)" }}>{item.ref} · {translation.label}</p>
                            <div className="flex items-center gap-2 sm:hidden">
                              <button onClick={() => handleCollect(item.ref, item.text)}
                                className="flex items-center justify-center rounded-full"
                                title={isAdded ? "Saved!" : "Save verse"}
                                style={{ width: 40, height: 40, background: isAdded ? "rgba(16,185,129,0.18)" : "rgba(var(--wf-c1),0.12)", border: isAdded ? "1px solid rgba(16,185,129,0.4)" : "1px solid rgba(var(--wf-c1),0.25)", color: isAdded ? "#10b981" : "rgba(var(--wf-c1),0.9)" }}>
                                {isAdded ? <Check size={18} /> : <PlusCircle size={18} />}
                              </button>
                              <button onClick={() => handleCopy(item.ref, item.text, translation.label)}
                                className="flex items-center justify-center rounded-full"
                                title="Copy verse"
                                style={{ width: 40, height: 40, background: copiedRef === item.ref ? "rgba(16,185,129,0.1)" : "var(--wf-reader-surface)", border: "1px solid rgba(255,255,255,0.1)", color: copiedRef === item.ref ? "#10b981" : "var(--wf-reader-text-3)" }}>
                                {copiedRef === item.ref ? <Check size={17} /> : <Copy size={17} />}
                              </button>
                            </div>
                          </div>
                        </div>
                        {/* Desktop: stacked column on the right */}
                        <div className="hidden sm:flex flex-col gap-2 shrink-0 self-start pt-0.5">
                          <button onClick={() => handleCollect(item.ref, item.text)}
                            className="flex items-center justify-center rounded-full"
                            title={isAdded ? "Saved!" : "Save verse"}
                            style={{ width: 36, height: 36, background: isAdded ? "rgba(16,185,129,0.18)" : "rgba(var(--wf-c1),0.12)", border: isAdded ? "1px solid rgba(16,185,129,0.4)" : "1px solid rgba(var(--wf-c1),0.25)", color: isAdded ? "#10b981" : "rgba(var(--wf-c1),0.9)" }}>
                            {isAdded ? <Check size={16} /> : <PlusCircle size={16} />}
                          </button>
                          <button onClick={() => handleCopy(item.ref, item.text, translation.label)}
                            className="flex items-center justify-center rounded-full"
                            title="Copy verse"
                            style={{ width: 36, height: 36, background: copiedRef === item.ref ? "rgba(16,185,129,0.1)" : "var(--wf-reader-surface)", border: "1px solid rgba(255,255,255,0.1)", color: copiedRef === item.ref ? "#10b981" : "var(--wf-reader-text-3)" }}>
                            {copiedRef === item.ref ? <Check size={15} /> : <Copy size={15} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!loading && !error && verses.length > 0 && (
                  <div className="flex items-center justify-between pt-6 pb-8">
                    <button onClick={prevChapter} disabled={bookIdx === 0 && chapter === 1}
                      className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold disabled:opacity-20"
                      style={{ background: "var(--wf-reader-surface)", border: "1px solid var(--wf-reader-border-s)", color: "var(--wf-reader-text-2)" }}>
                      <ChevronLeft size={14} /> Prev
                    </button>
                    <span className="text-[11px]" style={{ color: "var(--wf-reader-text-4)" }}>{displayBookName} {chapter}</span>
                    <button onClick={nextChapter} disabled={bookIdx === BIBLE_BOOKS.length - 1 && chapter === book.chapters}
                      className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold disabled:opacity-20"
                      style={{ background: "var(--wf-reader-surface)", border: "1px solid var(--wf-reader-border-s)", color: "var(--wf-reader-text-2)" }}>
                      Next <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PANEL ── */}
      {showPanel && (
        <div className="flex flex-col overflow-hidden"
          style={isMobile ? {
            // Mobile: full screen — completely replaces the reader, no blur, no overlay
            position: "fixed", inset: 0, zIndex: 50,
            background: "var(--wf-reader-bg)",
          } : {
            // Desktop: side panel
            width: "clamp(280px,34%,380px)",
            flexShrink: 0,
            borderLeft: "1px solid var(--wf-reader-border)",
            background: "var(--wf-reader-surface-f)",
          }}>
          {/* Mobile: Clean header with back button */}
          {isMobile && (
            <div className="shrink-0 flex items-center justify-between px-4 py-4"
              style={{ borderBottom: "1px solid var(--wf-reader-border-s)" }}>
              <button
                onClick={() => { setActivePanel(null); setShowNewForm(false); }}
                className="flex items-center gap-2 font-semibold transition-all active:scale-95"
                style={{ fontSize: 14, color: "var(--wf-reader-text-2)" }}>
                <ChevronLeft size={18} />
                Back to Reader
              </button>
              <span className="text-[13px] font-bold capitalize" style={{ color: "var(--wf-reader-text-2)" }}>
                {activePanel === "verses" ? "My Verses" : "Devotions"}
              </span>
            </div>
          )}
          <PanelContent />
        </div>
      )}
    </div>
  );
}
