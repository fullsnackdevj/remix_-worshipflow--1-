import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, X, ChevronLeft, ChevronRight, MoreHorizontal, Check,
  Trash2, Archive, AlignLeft, CheckSquare, Settings,
  ArrowRight, Users, Calendar, Search, Tag, Pencil,
  MessageSquare, Paperclip, LayoutGrid,
  CheckCircle2, Circle, Link2, FileText, RotateCcw,
  AlertTriangle, Layers, Loader2, ExternalLink, Eye, EyeOff, CornerUpLeft
} from "lucide-react";

type FieldType = "text" | "number" | "dropdown" | "checkbox";
interface CustomFieldDef { id: string; name: string; type: FieldType; options?: string[]; }
interface Label { id: string; name: string; color: string; }
interface ChecklistItem { id: string; text: string; done: boolean; }
interface Checklist { id: string; title: string; items: ChecklistItem[]; }
interface Attachment { id: string; name: string; url: string; type: "file" | "link"; createdAt: string; }
interface Board { id: string; title: string; color: string; description: string; archived: boolean; customFieldDefs: CustomFieldDef[]; }
interface PgList { id: string; boardId: string; title: string; pos: number; archived: boolean; }
interface Card { id: string; boardId: string; listId: string; title: string; description: string; pos: number; members: string[]; labels: Label[]; dueDate: string | null; startDate?: string | null; dueTime?: string; reminder?: string; checklists: Checklist[]; customFields: Record<string, any>; archived: boolean; completed?: boolean; attachments?: Attachment[]; createdAt?: string; }
interface Comment { id: string; authorName: string; authorPhoto: string; text: string; createdAt: string; reactions?: Record<string, string[]>; attachments?: { id: string; name: string; url: string; type: string }[]; }

interface Props { allMembers?: any[]; currentUser?: { name: string; photo?: string }; onToast: (t: "success" | "error", m: string) => void; isFullAccess?: boolean; }

const API = import.meta.env.DEV ? "http://localhost:3000/api" : "/api";
const uid = () => Math.random().toString(36).slice(2, 10);
const apiFetch = (path: string, opts?: RequestInit) => fetch(`${API}${path}`, { headers: { "Content-Type": "application/json" }, ...opts });



// 30-color Trello-style palette (5 cols × 6 rows)
const TRELLO_COLORS_30 = [
  "#0c4b1e","#533f04","#5d1f1a","#352c63","#09326c",
  "#216e4e","#7f5f01","#ae2e24","#5e4db2","#0055cc",
  "#4bce97","#f5cd47","#faa53d","#f87462","#9f8fef",
  "#1d3557","#164b35","#50253f","#454f59","#091e42",
  "#0c66e4","#227d9b","#1f845a","#943d73","#626f86",
  "#579dff","#60c6d2","#94c748","#e774bb","#8c9bab",
];

const BOARD_COLORS = [
  "linear-gradient(135deg,#0052cc,#0079bf)",
  "linear-gradient(135deg,#026aa7,#00aecc)",
  "linear-gradient(135deg,#017d6d,#4bbf6b)",
  "linear-gradient(135deg,#4bbf6b,#00aecc)",
  "linear-gradient(135deg,#8b46ff,#cf513d)",
  "linear-gradient(135deg,#cf513d,#e07b3c)",
  "linear-gradient(135deg,#e07b3c,#d29034)",
  "linear-gradient(135deg,#5b3fa5,#8b46ff)",
];
// Returns the board background (gradient or hex color)
const resolveBg = (c: string) => c;

const AVATAR_COLORS = ["#0079bf","#d29034","#519839","#b04632","#89609e","#cd5a91","#4bbf6b","#00aecc"];

function getAvatarColor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function Avatar({ name, photo, size = 28 }: { name: string; photo?: string; size?: number }) {
  if (photo) return <img src={photo} style={{ width: size, height: size }} className="rounded-full object-cover border-2 border-[#22272b]" alt={name} />;
  return (
    <div style={{ width: size, height: size, backgroundColor: getAvatarColor(name), fontSize: size * 0.38 }}
      className="rounded-full flex items-center justify-center text-white font-bold border-2 border-[#22272b] shrink-0">
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────
function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fullTimestamp(iso: string) {
  try {
    return new Date(iso).toLocaleString("en", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  } catch { return ""; }
}


// ── Card Detail Modal ──────────────────────────────────────────────────────
function CardModal({ card, lists, boards, allMembers, currentUser, customFieldDefs, onClose, onSave, onDelete, onArchive, onMove, onToast, isFullAccess = true }:
  { card: Card; lists: PgList[]; boards: Board[]; allMembers: any[]; currentUser?: { name: string; photo?: string }; customFieldDefs: CustomFieldDef[]; onClose: () => void; onSave: (c: Card) => void; onDelete: (id: string) => void; onArchive: (id: string) => void; onMove: () => void; onToast: Props["onToast"]; isFullAccess?: boolean; }) {
  // Tier 3: can comment only if assigned to this card
  const canComment = isFullAccess || card.members.includes(currentUser?.name ?? '');
  const [c, setC] = useState<Card>({ ...card });
  const [saving, setSaving] = useState(false);
  const [panel, setPanel] = useState<"main"|"dates"|"checklist"|"members"|"labels"|"attachment">("main");
  // On mobile/tablet (< lg = 1024px) start with comments collapsed; desktop starts open
  const [showCommentsPanel, setShowCommentsPanel] = useState(() => window.innerWidth >= 1024);
  // Reactive desktop breakpoint — updates on resize so panel layout adapts in real-time
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [newItems, setNewItems] = useState<Record<string, string>>({});
  const [labelSearch, setLabelSearch] = useState("");
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState(TRELLO_COLORS_30[10]);
  // label edit state
  const [labelView, setLabelView] = useState<"list"|"create"|"edit">("list");
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [editLabelName, setEditLabelName] = useState("");
  const [editLabelColor, setEditLabelColor] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  // board-level label pool (per-board, persisted in localStorage)
  const BOARD_LABELS_KEY = `wf_board_labels_${card.boardId}`;
  const DEFAULT_STATUS_LABELS: Label[] = [
    { id: "default-inprogress", name: "In Progress", color: "#0079bf" },
    { id: "default-onhold",    name: "On Hold",     color: "#d29034" },
    { id: "default-blocked",   name: "Blocked",     color: "#cf513d" },
    { id: "default-done",      name: "Done",        color: "#519839" },
  ];
  const [boardLabels, setBoardLabels] = useState<Label[]>(() => {
    try {
      const stored: Label[] = JSON.parse(localStorage.getItem(BOARD_LABELS_KEY) || "[]");
      // Seed defaults if pool is completely empty
      const base = stored.length === 0 ? [...DEFAULT_STATUS_LABELS] : [...stored];
      // Merge any labels already on the card but missing from the pool
      for (const l of card.labels) {
        if (!base.find(x => x.id === l.id)) base.push(l);
      }
      if (base.length !== stored.length) {
        try { localStorage.setItem(BOARD_LABELS_KEY, JSON.stringify(base)); } catch { /* noop */ }
      }
      return base;
    } catch { return DEFAULT_STATUS_LABELS; }
  });
  const saveBoardLabels = (labels: Label[]) => {
    setBoardLabels(labels);
    try { localStorage.setItem(BOARD_LABELS_KEY, JSON.stringify(labels)); } catch { /* noop */ }
  };
  const isLabelChecked = (id: string) => c.labels.some(l => l.id === id);
  const toggleLabel = (bl: Label) => {
    if (isLabelChecked(bl.id)) {
      save({ labels: c.labels.filter(l => l.id !== bl.id) });
    } else {
      save({ labels: [...c.labels, bl] });
    }
  };
  // comments & activity
  const [comments, setComments] = useState<Comment[]>([]);

  const [comment, setComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [commentFocused, setCommentFocused] = useState(false);
  // description draft \u2014 only saves on explicit Save click
  const [descDraft, setDescDraft] = useState(card.description ?? "");
  // emoji reactions — persisted to Firestore via PATCH endpoint
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null);
  const [deleteCommentConfirm, setDeleteCommentConfirm] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const QUICK_EMOJIS = ["👍","❤️","😂","😮","😢","👏","🔥","🎉","✅","💯"];
  const toggleEmoji = async (cmId: string, emoji: string) => {
    const userName = currentUser?.name || "Someone";
    // Optimistic update
    setComments(prev => prev.map(cm => {
      if (cm.id !== cmId) return cm;
      const reactions = { ...(cm.reactions ?? {}) };
      const users = reactions[emoji] ?? [];
      const already = users.includes(userName);
      reactions[emoji] = already ? users.filter(u => u !== userName) : [...users, userName];
      if (reactions[emoji].length === 0) delete reactions[emoji];
      return { ...cm, reactions };
    }));
    setEmojiPickerFor(null);
    // Persist to Firestore
    try {
      await apiFetch(`/planner/cards/${card.id}/comments/${cmId}/reactions`, {
        method: "PATCH",
        body: JSON.stringify({ emoji, userName }),
      });
    } catch { /* optimistic update stays */ }
  };
  // attachments
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const commentAttachRef = useRef<HTMLInputElement>(null);
  const [pendingCommentAttach, setPendingCommentAttach] = useState<{ id: string; name: string; url: string; type: string } | null>(null);
  const [uploadingCommentAttach, setUploadingCommentAttach] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const reminderRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const commentsThreadRef = useRef<HTMLDivElement>(null);
  const bodyWrapperRef = useRef<HTMLDivElement>(null);
  const commentsPanelRef = useRef<HTMLDivElement>(null);
  const savedCommentsScrollRef = useRef(0); // saves scroll position before hiding
  const datesBtnWrapRef = useRef<HTMLElement>(null); // shared ref: wraps both a <div> and <button>
  const [datesPanelPos, setDatesPanelPos] = useState<{ top: number; left: number } | null>(null);
  const [descEditing, setDescEditing] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Body scroll lock + sidebar collapse while card is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    window.dispatchEvent(new CustomEvent('pg-card-open'));
    return () => {
      document.body.style.overflow = '';
      window.dispatchEvent(new CustomEvent('pg-card-close'));
    };
  }, []);

  // Keep isDesktop in sync with window width on resize (debounced)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setIsDesktop(window.innerWidth >= 1024), 100);
    };
    window.addEventListener('resize', handleResize);
    return () => { clearTimeout(timer); window.removeEventListener('resize', handleResize); };
  }, []);
  // Reposition dates popover on resize / sidebar toggle (sidebar fires custom events + CSS transition)
  useEffect(() => {
    if (panel !== "dates") return;
    let timer: ReturnType<typeof setTimeout>;
    const reposition = () => {
      clearTimeout(timer);
      // delay 320ms to let sidebar CSS transition finish before measuring
      timer = setTimeout(() => setDatesPanelPos(calcDatesPanelPos()), 320);
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('pg-sidebar-toggle', reposition);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('pg-sidebar-toggle', reposition);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);
  // dates draft state (uncommitted until Save)
  const [draftStartEnabled, setDraftStartEnabled] = useState(!!card.startDate);
  const [draftStart, setDraftStart] = useState(card.startDate ?? "");
  const [draftStartTime, setDraftStartTime] = useState("");
  const [draftDue, setDraftDue] = useState(card.dueDate ?? "");
  const [draftTime, setDraftTime] = useState(card.dueTime ?? "");
  const [draftReminder, setDraftReminder] = useState(card.reminder ?? "none");

  // calendar nav for dates panel
  const todayD = new Date();
  const [calYear, setCalYear] = useState(todayD.getFullYear());
  const [calMonth, setCalMonth] = useState(todayD.getMonth() + 1);
  const CAL_DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const CAL_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const calFirstDow = new Date(calYear, calMonth - 1, 1).getDay();
  const calDaysInMonth = new Date(calYear, calMonth, 0).getDate();
  const todayYMD = `${todayD.getFullYear()}-${String(todayD.getMonth()+1).padStart(2,"0")}-${String(todayD.getDate()).padStart(2,"0")}`;
  const toYMD = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const prevCalMonth = () => setCalMonth(m => { if (m === 1) { setCalYear(y => y-1); return 12; } return m-1; });
  const nextCalMonth = () => setCalMonth(m => { if (m === 12) { setCalYear(y => y+1); return 1; } return m+1; });
  const [calTarget, setCalTarget] = useState<'start' | 'due'>('due');
  const selectCalDay = (day: number) => {
    // Mirror the noneChecked logic from the calendar render
    const dueEnabled = !!draftDue || calTarget === 'due';
    if (!draftStartEnabled && !dueEnabled) return; // no checkbox active — do nothing
    const ymd = toYMD(calYear, calMonth, day);
    if (draftStartEnabled && !dueEnabled) {
      // ONLY start checked → fill start, advance target to due (sequential flow)
      setDraftStart(ymd);
      setCalTarget('due');
    } else if (!draftStartEnabled && dueEnabled) {
      // ONLY due checked → fill due
      setDraftDue(ymd);
    } else {
      // BOTH checked → use explicit calTarget, NO auto-advance
      // (user controls target by clicking a field input first)
      if (calTarget === 'start') setDraftStart(ymd);
      else setDraftDue(ymd);
    }
  };
  const saveDates = () => { save({ dueDate: draftDue || null, startDate: draftStartEnabled ? draftStart || null : null, dueTime: draftTime, reminder: draftReminder }); setPanel("main"); setDatesPanelPos(null); };
  const removeDates = () => { save({ dueDate: null, startDate: null, dueTime: "", reminder: "none" }); setDraftDue(""); setDraftStart(""); setDraftStartTime(""); setDraftTime(""); setDraftStartEnabled(false); setPanel("main"); setDatesPanelPos(null); };
  const DATES_PANEL_W = 288;
  const calcDatesPanelPos = (): { top: number; left: number } | null => {
    const btnRect = datesBtnWrapRef.current?.getBoundingClientRect();
    const topOffset = (btnRect?.bottom ?? 120) + 6;
    const left = Math.max(8, (window.innerWidth - DATES_PANEL_W) / 2);
    return { top: topOffset, left };
  };
  const toggleDatesPanel = () => {
    if (panel === "dates") { setPanel("main"); setDatesPanelPos(null); return; }
    setDatesPanelPos(calcDatesPanelPos());
    setPanel("dates");
  };

  // hide checked items per checklist
  const [hiddenChecklists, setHiddenChecklists] = useState<Set<string>>(new Set());
  const toggleHideChecked = (clId: string) => setHiddenChecklists(prev => { const s = new Set(prev); s.has(clId) ? s.delete(clId) : s.add(clId); return s; });
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
  const [editingChecklistTitle, setEditingChecklistTitle] = useState("");
  const [deleteChecklistConfirm, setDeleteChecklistConfirm] = useState<string | null>(null);
  // copy-from checklist: board cards
  const [boardCards, setBoardCards] = useState<Card[]>([]);
  const [copyFrom, setCopyFrom] = useState("");
  useEffect(() => {
    if (panel === "checklist" && card.boardId) {
      apiFetch(`/planner/boards/${card.boardId}/cards`).then(r => r.json()).then(d => { if (Array.isArray(d)) setBoardCards(d); }).catch(() => {});
    }
  }, [panel, card.boardId]);
  const addChecklistWithCopy = () => {
    if (!newChecklistTitle.trim()) return;
    let items: ChecklistItem[] = [];
    if (copyFrom) {
      const srcCard = boardCards.find(bc => bc.id === copyFrom.split("|")[0]);
      const srcCl = srcCard?.checklists?.find(cl => cl.id === copyFrom.split("|")[1]);
      if (srcCl) items = srcCl.items.map(i => ({ ...i, id: uid(), done: false }));
    }
    save({ checklists: [...c.checklists, { id: uid(), title: newChecklistTitle.trim().toUpperCase(), items }] });
    setNewChecklistTitle(""); setCopyFrom(""); setPanel("main");
  };
  // drag-and-drop for attachments
  const [dragOver, setDragOver] = useState(false);
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) uploadFile(f); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  // Fetch comments & activity when modal opens
  useEffect(() => {
    apiFetch(`/planner/cards/${card.id}/comments`).then(r => r.json()).then(d => { if (Array.isArray(d)) setComments(d); }).catch(() => {});
  }, [card.id]);

  const save = async (partial: Partial<Card>) => {
    const prev = c;                          // snapshot before optimistic update
    const updated = { ...c, ...partial }; setC(updated); setSaving(true);
    try {
      await apiFetch(`/planner/cards/${card.id}`, { method: "PUT", body: JSON.stringify(partial) });
      // Write activity for key changes
      const actor = currentUser?.name || "Someone";
      const photo = currentUser?.photo || "";
      let actText = "";
      if (partial.title !== undefined) actText = `renamed card to "${partial.title}"`;
      else if (partial.dueDate !== undefined) actText = partial.dueDate ? `set due date to ${new Date(partial.dueDate + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}` : "removed due date";
      else if (partial.members !== undefined) actText = "updated members";
      else if (partial.labels !== undefined) actText = "updated labels";
      else if (partial.checklists !== undefined) actText = "updated checklist";
      else if (partial.completed !== undefined) actText = partial.completed ? "marked card as complete" : "marked card as incomplete";
      else if (partial.description !== undefined) actText = "updated description";
      if (actText) {
        apiFetch(`/planner/cards/${card.id}/activity`, { method: "POST", body: JSON.stringify({ type: "update", actorName: actor, actorPhoto: photo, text: actText }) }).catch(() => {});
      }
      onSave(updated);
    } catch { setC(prev); onToast("error", "Failed to save"); } finally { setSaving(false); }
  };

  const sendComment = async () => {
    if (!comment.trim() && !pendingCommentAttach) return;
    setSendingComment(true);
    try {
      const actor = currentUser?.name || "Someone";
      const photo = currentUser?.photo || "";
      const attachments = pendingCommentAttach ? [pendingCommentAttach] : [];
      const r = await apiFetch(`/planner/cards/${card.id}/comments`, { method: "POST", body: JSON.stringify({ authorName: actor, authorPhoto: photo, text: comment.trim(), attachments }) });
      const { id } = await r.json();
      setComments(prev => [...prev, { id, authorName: actor, authorPhoto: photo, text: comment.trim(), createdAt: new Date().toISOString(), attachments }]);
      setComment("");
      setPendingCommentAttach(null);
      // Notify all card members about the new comment (spam-guarded server-side)
      notifyPlannerMembers('planner_comment', c.members);
    } catch { onToast("error", "Failed to post comment"); } finally { setSendingComment(false); }
  };

  const deleteComment = async (cid: string) => {
    await apiFetch(`/planner/cards/${card.id}/comments/${cid}`, { method: "DELETE" });
    setComments(prev => prev.filter(x => x.id !== cid));
    onToast('success', 'Comment deleted');
  };

  // ── Planner notification helper — batch: 1 request for all recipients ──────
  // Instead of N separate POSTs (one per member), resolves all recipient IDs
  // client-side and sends a single batch request. The server handles the
  // per-recipient loop, cooldown checks, and self-suppression internally.
  const notifyPlannerMembers = useCallback((type: string, targets: string[]) => {
    if (!targets.length) return;
    const actorMember = allMembers.find((m: any) => m.name === currentUser?.name);
    const actorId = actorMember?.id || currentUser?.name || 'unknown';
    const boardTitle = boards.find(b => b.id === card.boardId)?.title || 'Planner';
    // Resolve all member names → IDs in one pass (filter out unknowns + self)
    const recipientIds = targets
      .map(name => allMembers.find((m: any) => m.name === name)?.id)
      .filter((id): id is string => !!id && id !== actorId);
    if (!recipientIds.length) return;
    apiFetch('/planner/notify', {
      method: 'POST',
      body: JSON.stringify({
        actorId, actorName: currentUser?.name || 'Someone',
        actorPhoto: currentUser?.photo || '',
        recipientIds,                          // array — server loops internally
        type, cardId: card.id, cardTitle: c.title, boardName: boardTitle,
      }),
    }).catch(() => {});
  }, [allMembers, boards, card.boardId, card.id, c.title, currentUser]);

  // Attachment: file upload → base64 JSON → API (server or Netlify) → Firebase Storage via Admin SDK
  const uploadFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      onToast('error', 'File too large — maximum size is 5 MB.');
      return;
    }
    setUploading(true); setUploadProgress(30);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setUploadProgress(60);
      const resp = await apiFetch('/planner/upload', {
        method: 'POST',
        body: JSON.stringify({ base64, name: file.name, contentType: file.type, cardId: card.id }),
      });
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.error ?? "Upload failed"); }
      const { url } = await resp.json();
      const att: Attachment = { id: uid(), name: file.name, url, type: "file", createdAt: new Date().toISOString() };
      await save({ attachments: [...(c.attachments ?? []), att] });
      setUploading(false); setUploadProgress(0); setPanel("main");
      onToast("success", "File attached!");
    } catch (e: any) {
      onToast("error", e?.message ?? "Upload failed");
      setUploading(false);
    }
  };

  const addLink = async () => {
    if (!linkUrl.trim()) return;
    const att: Attachment = { id: uid(), name: linkName.trim() || linkUrl.trim(), url: linkUrl.trim(), type: "link", createdAt: new Date().toISOString() };
    await save({ attachments: [...(c.attachments ?? []), att] });
    setLinkUrl(""); setLinkName(""); setPanel("main");
  };

  const removeAttachment = async (id: string) => {
    try {
      await save({ attachments: (c.attachments ?? []).filter(a => a.id !== id) });
      onToast('success', 'Attachment removed');
    } catch { /* save() already shows the toast and reverts */ }
  };
  const [confirmRemoveAtt, setConfirmRemoveAtt] = useState<string | null>(null);

  const listName = lists.find(l => l.id === c.listId)?.title ?? "";
  const isOverdue = c.dueDate && new Date(c.dueDate) < new Date();

  const toggleItem = (clId: string, itemId: string) => save({ checklists: c.checklists.map(cl => cl.id === clId ? { ...cl, items: cl.items.map(i => i.id === itemId ? { ...i, done: !i.done } : i) } : cl) });
  const addItem = (clId: string) => {
    const text = newItems[clId]?.trim(); if (!text) return;
    const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    save({ checklists: c.checklists.map(cl => cl.id === clId ? { ...cl, items: [...cl.items, { id: uid(), text: capFirst(text), done: false }] } : cl) });
    setNewItems(p => ({ ...p, [clId]: "" }));
  };
  const deleteChecklist = (clId: string) => save({ checklists: c.checklists.filter(cl => cl.id !== clId) });
  const deleteItem = (clId: string, itemId: string) => save({ checklists: c.checklists.map(cl => cl.id === clId ? { ...cl, items: cl.items.filter(i => i.id !== itemId) } : cl) });
  const addChecklist = () => {
    if (!newChecklistTitle.trim()) return;
    save({ checklists: [...c.checklists, { id: uid(), title: newChecklistTitle.trim().toUpperCase(), items: [] }] });
    setNewChecklistTitle(""); setPanel("main");
  };
  const addNewLabel = () => {
    if (!newLabelName.trim()) return;
    const isDupe = boardLabels.some(l => l.name.trim().toLowerCase() === newLabelName.trim().toLowerCase());
    if (isDupe) return; // blocked by inline warning
    const nl: Label = { id: uid(), name: newLabelName.trim(), color: newLabelColor };
    const updatedPool = [...boardLabels, nl];
    saveBoardLabels(updatedPool);
    // auto-check on this card too
    save({ labels: [...c.labels, nl] });
    setNewLabelName(""); setNewLabelColor(TRELLO_COLORS_30[10]); setLabelView("list");
  };
  const openEditLabel = (l: Label) => { setEditingLabel(l); setEditLabelName(l.name); setEditLabelColor(l.color); setLabelView("edit"); };
  const saveEditLabel = () => {
    if (!editingLabel) return;
    const isDupe = boardLabels.some(l => l.id !== editingLabel.id && l.name.trim().toLowerCase() === editLabelName.trim().toLowerCase());
    if (isDupe) return; // blocked by inline warning
    const updatedPool = boardLabels.map(l => l.id === editingLabel.id ? { ...l, name: editLabelName, color: editLabelColor } : l);
    saveBoardLabels(updatedPool);
    // also update label on this card if it's checked
    save({ labels: c.labels.map(l => l.id === editingLabel.id ? { ...l, name: editLabelName, color: editLabelColor } : l) });
    setLabelView("list");
  };
  const deleteLabelById = (id: string) => {
    saveBoardLabels(boardLabels.filter(l => l.id !== id));
    save({ labels: c.labels.filter(l => l.id !== id) });
    setLabelView("list");
  };
  const removeLabel = (id: string) => save({ labels: c.labels.filter(x => x.id !== id) });
  const addMember = (name: string) => {
    if (!c.members.includes(name)) {
      save({ members: [...c.members, name] });
      notifyPlannerMembers('planner_assigned', [name]); // notify the new assignee
    }
    setMemberSearch("");
  };
  const removeMember = (name: string) => save({ members: c.members.filter(x => x !== name) });
  const setCustomField = (defId: string, val: any) => save({ customFields: { ...c.customFields, [defId]: val } });
  const filteredMembers = allMembers.filter(m => !memberSearch || m.name?.toLowerCase().includes(memberSearch.toLowerCase()));

  const Btn = ({ icon, label, act, onCl }: { icon: React.ReactNode; label: string; act?: boolean; onCl: () => void }) => (
    <button onClick={onCl} className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-[13px] font-medium transition-all duration-150 ${act ? "bg-[#1c3a5e] border-blue-500/50 text-blue-300" : "border-[#454f59] text-gray-200 hover:bg-[#282e33] hover:border-[#5a6577] hover:text-white bg-[#22272b]"}`}>{icon}{label}</button>
  );

  return (
    <>
    <div className="fixed inset-0 z-50 flex flex-col items-center bg-black/85"
      style={{ padding: '8px clamp(0px, 8px, 16px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      {/* Trello-style thin scrollbar for webkit (Chrome/Safari) */}
      <style>{`
        .card-left-panel::-webkit-scrollbar { width: 5px; }
        .card-left-panel::-webkit-scrollbar-track { background: transparent; }
        .card-left-panel::-webkit-scrollbar-thumb { background: rgba(150,155,163,0.45); border-radius: 999px; }
        .card-left-panel::-webkit-scrollbar-thumb:hover { background: rgba(180,185,193,0.6); }
      `}</style>
      <div className="bg-[#1d2125] rounded-2xl w-full shadow-2xl border border-white/5 flex flex-col"
        style={{
          maxHeight: 'calc(100dvh - 16px)',
          minHeight: 'min(calc(100dvh - 16px), 540px)',
          maxWidth: showCommentsPanel ? '1100px' : '768px',
          transition: 'max-width 320ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        onClick={e => e.stopPropagation()}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2 text-xs font-bold text-white bg-white/10 px-3 py-1.5 rounded-lg">
            {listName} <ChevronLeft size={11} className="rotate-180 opacity-60 ml-0.5" />
          </div>
          <div className="flex items-center gap-1">
            {saving && <span className="text-xs text-gray-500 mr-1">Saving…</span>}
            {isFullAccess && <button onClick={onMove} title="Move" className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded"><ArrowRight size={15} /></button>}
            {/* Archive / Delete — full access only */}
            {isFullAccess && (
              archiveConfirm ? (
                <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1">
                  <span className="text-[11px] text-amber-300 font-medium">Archive?</span>
                  <button onClick={() => { onArchive(card.id); setArchiveConfirm(false); }}
                    className="px-2 py-0.5 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold rounded transition-colors">Yes</button>
                  <button onClick={() => setArchiveConfirm(false)}
                    className="px-2 py-0.5 bg-white/10 hover:bg-white/20 text-gray-300 text-[11px] rounded transition-colors">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setArchiveConfirm(true)} title="Archive" className="p-1.5 text-gray-400 hover:text-amber-400 hover:bg-white/10 rounded"><Archive size={15} /></button>
              )
            )}
            {isFullAccess && card.archived && <button onClick={() => onDelete(card.id)} title="Delete permanently" className="p-1.5 text-red-400 hover:bg-red-500/10 rounded"><Trash2 size={15} /></button>}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded ml-1"><X size={16} /></button>
          </div>
        </div>
        {/* Two-panel body — always row on lg+, right panel animates */}
        <div ref={bodyWrapperRef} className="flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden lg:flex-1 lg:min-h-0" style={{ overscrollBehavior: 'contain' }}>
          {/* LEFT — card details + Trello-style center scrollbar */}
          <div
            ref={leftPanelRef}
            className="card-left-panel min-w-0 px-4 pt-4 pb-4 sm:px-5 sm:pt-5 space-y-4 lg:flex-1 lg:overflow-y-auto"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(150,155,163,0.45) rgba(0,0,0,0)',
            }}
          >
            {/* Title with completion toggle — Trello large title style */}
            <div className="flex items-start gap-3">
              {isFullAccess && (
                <button onClick={() => save({ completed: !c.completed })} title={c.completed ? "Mark incomplete" : "Mark complete"}
                  className="mt-1.5 shrink-0 text-gray-400 hover:text-blue-400 transition-colors">
                  {c.completed ? <CheckCircle2 size={20} className="text-blue-400" /> : <Circle size={20} />}
                </button>
              )}
              <textarea value={c.title} readOnly={!isFullAccess}
                onChange={isFullAccess ? e => setC(p => ({ ...p, title: e.target.value })) : undefined}
                onBlur={isFullAccess ? () => { const cap = (s: string) => s.trim().replace(/\b\w/g, c => c.toUpperCase()); const capitalized = cap(c.title); if (capitalized !== c.title) setC(p => ({ ...p, title: capitalized })); save({ title: capitalized }); } : undefined} rows={1}
                className={`flex-1 bg-transparent font-bold text-[22px] leading-snug focus:outline-none resize-none placeholder-gray-600 ${c.completed ? "line-through text-gray-500" : "text-white"} ${!isFullAccess ? "cursor-default" : ""}`} />
            </div>
            {/* Action buttons — full access only */}
            {isFullAccess && (
              <div className="flex flex-wrap gap-1.5 sm:ml-7">
                <div ref={datesBtnWrapRef}>
                  <Btn icon={<Calendar size={12} />} label="Dates" act={panel === "dates"} onCl={toggleDatesPanel} />
                </div>
                <Btn icon={<CheckSquare size={12} />} label="Checklist" act={panel === "checklist"} onCl={() => setPanel(panel === "checklist" ? "main" : "checklist")} />
                <Btn icon={<Users size={12} />} label="Members" act={panel === "members"} onCl={() => setPanel(panel === "members" ? "main" : "members")} />
                <Btn icon={<Tag size={12} />} label="Labels" act={panel === "labels"} onCl={() => setPanel(panel === "labels" ? "main" : "labels")} />
                <Btn icon={<Paperclip size={12} />} label="Attachment" act={panel === "attachment"} onCl={() => setPanel(panel === "attachment" ? "main" : "attachment")} />
              </div>
            )}

            {/* Checklist sub-panel */}
            {panel === "checklist" && (
              <div className="sm:ml-7 bg-[#22272b] border border-white/10 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Add Checklist</p>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Title</label>
                  <input value={newChecklistTitle} onChange={e => setNewChecklistTitle(e.target.value)} onKeyDown={e => e.key === "Enter" && addChecklistWithCopy()} autoFocus placeholder="Checklist"
                    className="w-full bg-[#1d2125] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Copy items from…</label>
                  <select value={copyFrom} onChange={e => setCopyFrom(e.target.value)} className="w-full bg-[#1d2125] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                    <option value="">(none)</option>
                    {boardCards.filter(bc => bc.id !== card.id && bc.checklists?.length > 0).map(bc =>
                      bc.checklists.map(cl => <option key={`${bc.id}|${cl.id}`} value={`${bc.id}|${cl.id}`}>{bc.title} — {cl.title}</option>)
                    )}
                  </select>
                </div>
                <div className="flex gap-2"><button onClick={addChecklistWithCopy} className="px-4 py-1.5 bg-[#579dff] hover:bg-[#4c8ee6] text-[#1d2125] text-xs font-bold rounded">Add</button><button onClick={() => setPanel("main")} className="px-3 py-1.5 text-gray-400 hover:text-white text-xs">Cancel</button></div>
              </div>
            )}
            {/* Members sub-panel */}
            {panel === "members" && (
              <div className="sm:ml-7 bg-[#22272b] border border-white/10 rounded-xl overflow-hidden">
                <div className="relative p-3 border-b border-white/5">
                  <Search size={12} className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} autoFocus placeholder="Search members…"
                    className="w-full pl-7 pr-3 py-1.5 bg-[#1d2125] rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none" />
                </div>
                <div className="max-h-44 overflow-y-auto">
                  {filteredMembers.map((m: any) => (
                    <button key={m.id} onClick={() => addMember(m.name)} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 text-left">
                      <Avatar name={m.name} photo={m.photo} size={26} /><span className="text-sm text-gray-300 flex-1">{m.name}</span>
                      {c.members.includes(m.name) && <Check size={12} className="text-blue-400" />}
                    </button>
                  ))}
                  {memberSearch && !allMembers.find((m: any) => m.name?.toLowerCase() === memberSearch.toLowerCase()) && (
                    <button onClick={() => addMember(memberSearch)} className="w-full px-3 py-2 text-xs text-blue-400 hover:bg-white/5 text-left">+ Add "{memberSearch}"</button>
                  )}
                </div>
              </div>
            )}
            {/* Attachment sub-panel — compact Trello-style */}
            {panel === "attachment" && (
              <div className="sm:ml-7 bg-[#22272b] border border-white/10 rounded-xl overflow-hidden w-72">
                {/* Header */}
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
                  <p className="text-xs font-semibold text-white">Attach</p>
                  <button onClick={() => setPanel("main")} className="text-gray-500 hover:text-white"><X size={13} /></button>
                </div>
                {/* File / paste / drag zone */}
                <div className="px-3 pt-2.5 pb-2 border-b border-white/5">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">From computer</p>
                  <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />
                  <div ref={dropZoneRef}
                    onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
                    onPaste={e => {
                      const item = Array.from<DataTransferItem>(e.clipboardData.items).find(i => i.type.startsWith('image/'));
                      if (item) { const f = item.getAsFile(); if (f) uploadFile(f); }
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    tabIndex={0}
                    className={`relative w-full py-3 border border-dashed rounded-lg text-center cursor-pointer transition-all outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 ${
                      dragOver ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-white/15 hover:border-blue-500/40 text-gray-500 hover:text-gray-300'
                    }`}>
                    <div className="flex flex-col items-center gap-0.5 pointer-events-none">
                      <Paperclip size={13} className="opacity-60 mb-0.5" />
                      <p className="text-[11px] font-medium">
                        {uploading ? `Uploading… ${uploadProgress}%` : dragOver ? 'Drop to upload' : 'Choose file or drag & drop'}
                      </p>
                      <p className="text-[10px] opacity-40">Click here, then Ctrl+V to paste image</p>
                    </div>
                    <span className="absolute top-1.5 right-1.5 text-[9px] bg-white/10 text-gray-400 px-1.5 py-0.5 rounded font-semibold tracking-wide pointer-events-none">Max 5 MB</span>
                  </div>
                  {uploading && <div className="h-0.5 bg-white/10 rounded-full mt-2 overflow-hidden"><div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} /></div>}
                </div>
                {/* Link section */}
                <div className="px-3 py-2.5 space-y-1.5">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Link</p>
                  <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="Paste a URL…"
                    className="w-full bg-[#1d2125] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50" />
                  <input value={linkName} onChange={e => setLinkName(e.target.value)} placeholder="Display text (optional)"
                    className="w-full bg-[#1d2125] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none" />
                  <div className="flex gap-1.5 pt-0.5">
                    <button onClick={() => setPanel('main')} className="flex-1 py-1.5 bg-white/10 hover:bg-white/15 text-gray-300 text-xs rounded-lg transition-colors">Cancel</button>
                    <button onClick={addLink} disabled={!linkUrl.trim()} className="flex-1 py-1.5 bg-[#579dff] hover:bg-[#4c8ee6] text-[#1d2125] text-xs font-bold rounded-lg disabled:opacity-50 transition-colors">Insert</button>
                  </div>
                </div>
              </div>
            )}

            {/* Labels + Dates inline row */}
            {(c.labels.length > 0 || c.dueDate || c.startDate) && (
              <div className="sm:ml-7 space-y-2">
                {/* Labels row */}
                {c.labels.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Labels</p>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {c.labels.map(l => (
                        <span key={l.id} style={{ backgroundColor: l.color }}
                          onClick={() => { setPanel("labels"); setLabelView("list"); }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded text-[13px] font-bold text-white cursor-pointer hover:brightness-90">{l.name}</span>
                      ))}
                      <button onClick={() => setPanel(panel === "labels" ? "main" : "labels")} className="px-2.5 py-[10px] rounded bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300"><Plus size={13} /></button>
                      {/* Dates pill — inline with labels */}
                      {(c.dueDate || c.startDate) && panel !== "dates" && (
                        <button
                          ref={datesBtnWrapRef as any}
                          onClick={toggleDatesPanel}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[13px] font-medium transition-colors ${
                            isOverdue
                              ? "bg-red-500/20 border-red-500/50 text-red-300 hover:bg-red-500/30"
                              : "border-[#454f59] bg-[#22272b] text-gray-200 hover:bg-[#282e33] hover:border-[#5a6577]"
                          }`}
                        >
                          <Calendar size={12} />
                          <span>
                            {c.startDate && (
                              <>{new Date(c.startDate + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })} – </>
                            )}
                            {new Date(c.dueDate! + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
                            {c.dueTime && <>, {c.dueTime}</>}
                          </span>
                          <ChevronLeft size={11} className="rotate-180 opacity-60 ml-0.5" />
                          {isOverdue && <span className="ml-1 text-red-400 text-[11px] font-semibold">· Overdue</span>}
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {/* Dates row — only when no labels */}
                {c.labels.length === 0 && (c.dueDate || c.startDate) && panel !== "dates" && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Dates</p>
                    <button
                      ref={datesBtnWrapRef as any}
                      onClick={toggleDatesPanel}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[13px] font-medium transition-colors ${
                        isOverdue
                          ? "bg-red-500/20 border-red-500/50 text-red-300 hover:bg-red-500/30"
                          : "border-[#454f59] bg-[#22272b] text-gray-200 hover:bg-[#282e33] hover:border-[#5a6577]"
                      }`}
                    >
                      <Calendar size={12} />
                      <span>
                        {c.startDate && (
                          <>{new Date(c.startDate + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })} – </>
                        )}
                        {new Date(c.dueDate! + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
                        {c.dueTime && <>, {c.dueTime}</>}
                      </span>
                      <ChevronLeft size={11} className="rotate-180 opacity-60 ml-0.5" />
                      {isOverdue && <span className="ml-1 text-red-400 text-[11px] font-semibold">· Overdue</span>}
                    </button>
                  </div>
                )}
              </div>
            )}
            {/* Label picker — Trello-style with list/create/edit views */}
            {panel === "labels" && (
              <div className="ml-0 sm:ml-8 bg-[#22272b] border border-white/10 rounded-xl overflow-hidden w-full max-w-xs">
                {/* ── LIST VIEW ── */}
                {labelView === "list" && (
                  <>
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
                      <p className="text-sm font-semibold text-white">Labels</p>
                      <button onClick={() => { setPanel("main"); setLabelView("list"); }} className="text-gray-500 hover:text-white"><X size={14} /></button>
                    </div>
                    <div className="p-2">
                      <input value={labelSearch} onChange={e => setLabelSearch(e.target.value)} autoFocus placeholder="Search labels…"
                        className="w-full bg-[#1d2125] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50" />
                    </div>
                    <p className="px-3 pb-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Labels</p>
                    <div className="max-h-60 overflow-y-auto px-2 pb-2 space-y-1">
                      {(labelSearch
                        ? boardLabels.filter(l => l.name.toLowerCase().includes(labelSearch.toLowerCase()))
                        : boardLabels
                      ).map(bl => (
                        <div key={bl.id} className="flex items-center gap-2">
                          <button onClick={() => toggleLabel(bl)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                              isLabelChecked(bl.id) ? "bg-blue-500 border-blue-500 hover:bg-blue-600" : "border-gray-500 hover:border-gray-300"}`}>
                            {isLabelChecked(bl.id) && <Check size={10} className="text-white" />}
                          </button>
                          <button style={{ backgroundColor: bl.color }} onClick={() => toggleLabel(bl)}
                            className="flex-1 text-left px-3 py-2 rounded-md text-xs font-bold text-white hover:brightness-90 truncate">{bl.name || "\u00a0"}</button>
                          <button onClick={() => openEditLabel(bl)} className="p-1.5 text-gray-500 hover:text-gray-200 rounded hover:bg-white/10"><Pencil size={11} /></button>
                        </div>
                      ))}
                      {boardLabels.length === 0 && <p className="text-xs text-gray-600 px-1 py-2">No labels yet. Create one below.</p>}
                    </div>
                    <div className="border-t border-white/5 p-2">
                      <button onClick={() => { setNewLabelName(""); setNewLabelColor(TRELLO_COLORS_30[10]); setLabelView("create"); }}
                        className="w-full py-2 bg-white/5 hover:bg-white/10 text-gray-300 text-xs rounded-lg font-medium">Create a new label</button>
                    </div>
                  </>
                )}
                {/* ── CREATE VIEW ── */}
                {labelView === "create" && (
                  <div className="p-3 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <button onClick={() => setLabelView("list")} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white"><ChevronLeft size={15} /></button>
                      <p className="flex-1 text-center text-sm font-semibold text-white">Create label</p>
                      <button onClick={() => { setPanel("main"); setLabelView("list"); }} className="text-gray-500 hover:text-white"><X size={14} /></button>
                    </div>
                    {/* Preview */}
                    <div className="rounded-md px-3 py-2.5 text-sm font-bold text-white text-center" style={{ backgroundColor: newLabelColor || "#374151" }}>{newLabelName || "\u00a0"}</div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block font-semibold">Title</label>
                      <input value={newLabelName} onChange={e => setNewLabelName(e.target.value)} autoFocus placeholder="Label name…"
                        className={`w-full bg-[#1d2125] border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none ${boardLabels.some(l => l.name.trim().toLowerCase() === newLabelName.trim().toLowerCase()) ? 'border-amber-500/70 focus:border-amber-500' : 'border-white/10 focus:border-blue-500/50'}`} />
                      {newLabelName.trim() && boardLabels.some(l => l.name.trim().toLowerCase() === newLabelName.trim().toLowerCase()) && (
                        <p className="text-[11px] text-amber-400 mt-1 flex items-center gap-1"><AlertTriangle size={10} /> A label with this name already exists.</p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-2 block font-semibold">Select a color</label>
                      <div className="grid grid-cols-5 gap-1.5">
                        {TRELLO_COLORS_30.map(hex => (
                          <button key={hex} onClick={() => setNewLabelColor(hex)} style={{ backgroundColor: hex }}
                            className={`h-8 rounded-md flex items-center justify-center transition-all hover:brightness-110 ${newLabelColor === hex ? "ring-2 ring-white" : ""}`}>
                            {newLabelColor === hex && <Check size={12} className="text-white drop-shadow" />}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => setNewLabelColor("")} className="w-full flex items-center justify-center gap-2 py-2 border border-white/10 rounded-lg text-xs text-gray-300 hover:bg-white/5">
                      <X size={11} /> Remove color
                    </button>
                    <button onClick={addNewLabel} className="w-full py-2 bg-[#579dff] hover:bg-[#4c8ee6] text-[#1d2125] text-sm font-bold rounded-lg">Save</button>
                  </div>
                )}
                {/* ── EDIT VIEW ── */}
                {labelView === "edit" && editingLabel && (
                  <div className="p-3 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <button onClick={() => setLabelView("list")} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white"><ChevronLeft size={15} /></button>
                      <p className="flex-1 text-center text-sm font-semibold text-white">Edit label</p>
                      <button onClick={() => { setPanel("main"); setLabelView("list"); }} className="text-gray-500 hover:text-white"><X size={14} /></button>
                    </div>
                    {/* Preview */}
                    <div className="rounded-md px-3 py-2.5 text-sm font-bold text-white text-center" style={{ backgroundColor: editLabelColor || "#374151" }}>{editLabelName || "\u00a0"}</div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block font-semibold">Title</label>
                      <input value={editLabelName} onChange={e => setEditLabelName(e.target.value)} autoFocus
                        className={`w-full bg-[#1d2125] border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none ${boardLabels.some(l => l.id !== editingLabel?.id && l.name.trim().toLowerCase() === editLabelName.trim().toLowerCase()) ? 'border-amber-500/70 focus:border-amber-500' : 'border-white/10 focus:border-blue-500/50'}`} />
                      {editLabelName.trim() && boardLabels.some(l => l.id !== editingLabel?.id && l.name.trim().toLowerCase() === editLabelName.trim().toLowerCase()) && (
                        <p className="text-[11px] text-amber-400 mt-1 flex items-center gap-1"><AlertTriangle size={10} /> A label with this name already exists.</p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-2 block font-semibold">Select a color</label>
                      <div className="grid grid-cols-5 gap-1.5">
                        {TRELLO_COLORS_30.map(hex => (
                          <button key={hex} onClick={() => setEditLabelColor(hex)} style={{ backgroundColor: hex }}
                            className={`h-8 rounded-md flex items-center justify-center transition-all hover:brightness-110 ${editLabelColor === hex ? "ring-2 ring-white" : ""}`}>
                            {editLabelColor === hex && <Check size={12} className="text-white drop-shadow" />}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => setEditLabelColor("")} className="w-full flex items-center justify-center gap-2 py-2 border border-white/10 rounded-lg text-xs text-gray-300 hover:bg-white/5">
                      <X size={11} /> Remove color
                    </button>
                    <div className="flex gap-2 pt-1">
                      <button onClick={saveEditLabel} className="flex-1 py-2 bg-[#579dff] hover:bg-[#4c8ee6] text-[#1d2125] text-sm font-bold rounded-lg">Save</button>
                      <button onClick={() => deleteLabelById(editingLabel.id)} className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg">Delete</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Members */}
            {c.members.length > 0 && (
              <div className="sm:ml-7">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Members</p>
                <div className="flex items-center">
                  <div className="flex -space-x-2">
                    {c.members.map(m => {
                      const mem = allMembers.find((x: any) => x.name === m);
                      const mPhoto = mem?.photo || mem?.photoURL || "";
                      return (
                        <div key={m} className="relative group/av">
                          <button
                            onClick={() => removeMember(m)}
                            title={`Remove ${m}`}
                            className="block rounded-full ring-2 ring-[#1d2125] hover:ring-red-500/70 transition-all"
                          >
                            <Avatar name={m} photo={mPhoto} size={30} />
                          </button>
                          <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap px-2 py-1 rounded-lg bg-gray-900 text-white text-[11px] font-medium shadow-lg opacity-0 group-hover/av:opacity-100 transition-opacity z-30">
                            {m}
                            <span className="ml-1 text-red-400 text-[10px]">(click to remove)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setPanel(panel === "members" ? "main" : "members")}
                    className="ml-1.5 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300 ring-2 ring-[#1d2125] transition-colors"
                    title="Add member"
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>
            )}
            {/* Attachments shown */}
            {(c.attachments ?? []).length > 0 && (() => {
              const isImg = (url: string) => /\.(jpe?g|png|gif|webp|svg|bmp|ico)($|\?)/i.test(url);
              return (
                <div className="sm:ml-7">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Attachments</p>
                  <div className="space-y-1">
                    {(c.attachments ?? []).map(att => (
                      <div key={att.id} className="flex items-center gap-2 px-2 py-1.5 bg-[#22272b] border border-white/10 rounded-lg hover:bg-[#282e33] transition-colors group">
                        {/* Thumbnail or type icon */}
                        {isImg(att.url) ? (
                          <button onClick={() => setLightboxUrl(att.url)} className="shrink-0 w-8 h-8 rounded overflow-hidden border border-white/10 hover:brightness-110 transition-all">
                            <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                          </button>
                        ) : (
                          <div className="shrink-0 w-8 h-8 rounded bg-white/5 border border-white/10 flex items-center justify-center">
                            {att.type === "link" ? <Link2 size={13} className="text-blue-400" /> : <FileText size={13} className="text-emerald-400" />}
                          </div>
                        )}
                        {/* Name */}
                        <a href={att.url} target="_blank" rel="noopener noreferrer"
                          className="flex-1 min-w-0 text-[13px] text-gray-200 hover:text-blue-300 font-medium truncate leading-none">
                          {att.name}
                        </a>
                        {/* Actions — right side */}
                        <div className="flex items-center gap-0.5 shrink-0 ml-2">
                          {confirmRemoveAtt === att.id ? (
                            <>
                              <span className="text-[11px] text-amber-400 font-semibold mr-1">Remove?</span>
                              <button onClick={() => { removeAttachment(att.id); setConfirmRemoveAtt(null); }}
                                className="text-[11px] bg-red-500/20 hover:bg-red-500/40 text-red-400 px-2 py-0.5 rounded font-semibold transition-colors">Yes</button>
                              <button onClick={() => setConfirmRemoveAtt(null)}
                                className="text-[11px] bg-white/10 hover:bg-white/15 text-gray-400 px-2 py-0.5 rounded transition-colors ml-1">No</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => isImg(att.url) ? setLightboxUrl(att.url) : window.open(att.url, '_blank')}
                                title="View" className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:text-blue-400 hover:bg-white/10 transition-colors">
                                <ExternalLink size={13} />
                              </button>
                              <button onClick={() => setConfirmRemoveAtt(att.id)}
                                title="Remove" className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-white/10 transition-colors">
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            {/* Description */}
            <div className="sm:ml-7 mt-2">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2"><AlignLeft size={14} className="text-gray-400" /><p className="text-[14px] font-bold text-white">Description</p></div>
                {descDraft !== c.description && (
                  <span className="text-[9px] font-bold text-amber-400 border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 rounded tracking-wider">UNSAVED CHANGES</span>
                )}
              </div>
              {!descEditing ? (
                <div onClick={() => isFullAccess ? setDescEditing(true) : undefined}
                  className={`w-full min-h-[56px] ${isFullAccess ? 'cursor-text' : ''} px-3 py-2.5 rounded-lg transition-colors bg-[#22272b] border border-[#454f59] hover:border-[#5a6577]`}>
                  {c.description
                    ? <p className="text-[13px] text-gray-300 leading-relaxed whitespace-pre-wrap">{c.description}</p>
                    : <span className="text-[13px] text-gray-500">Add a more detailed description…</span>}
                </div>
              ) : (
                <>
                  <textarea autoFocus value={descDraft} onChange={e => setDescDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') { setDescDraft(c.description); setDescEditing(false); } }}
                    rows={4} placeholder="Add a more detailed description…"
                    className="w-full bg-[#22272b] border border-blue-500/60 rounded-lg px-3 py-2.5 text-[13px] text-gray-300 placeholder-gray-500 focus:outline-none resize-none leading-relaxed" />
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={() => { save({ description: descDraft }); setC(p => ({ ...p, description: descDraft })); setDescEditing(false); }}
                      className="px-4 py-1.5 bg-[#579dff] hover:bg-[#4c8ee6] text-[#1d2125] text-[13px] font-bold rounded-md">Save</button>
                    <button onClick={() => { setDescDraft(c.description); setDescEditing(false); }}
                      className="text-[13px] text-gray-400 hover:text-white px-3 py-1.5 rounded-md hover:bg-white/10 transition-colors">Discard changes</button>
                  </div>
                </>
              )}
            </div>
            {/* ── Divider after description ── */}
            <div className="sm:ml-7 mr-2 border-t border-white/[0.07] my-1" />
            {/* Checklists */}
            {c.checklists.map(cl => {
              const clDone = cl.items.filter(i => i.done).length; const clTotal = cl.items.length;
              const clPct = clTotal ? Math.round((clDone / clTotal) * 100) : 0;
              const hidden = hiddenChecklists.has(cl.id);
              const visibleItems = hidden ? cl.items.filter(i => !i.done) : cl.items;
              return (
                <div key={cl.id} className="sm:ml-7 space-y-2 pt-1">
                  <div className="flex flex-wrap items-center gap-y-1.5 gap-x-2">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <CheckSquare size={13} className="text-gray-400 shrink-0" />
                      {editingChecklistId === cl.id ? (
                        <input
                          autoFocus
                          value={editingChecklistTitle}
                          onChange={e => setEditingChecklistTitle(e.target.value)}
                          onBlur={() => {
                            const t = editingChecklistTitle.trim().toUpperCase();
                            if (t && t !== cl.title) save({ checklists: c.checklists.map(x => x.id === cl.id ? { ...x, title: t } : x) });
                            setEditingChecklistId(null);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            if (e.key === 'Escape') setEditingChecklistId(null);
                          }}
                          className="bg-[#1d2125] border border-blue-500/50 rounded px-2 py-0.5 text-[14px] font-bold text-white focus:outline-none w-full"
                        />
                      ) : (
                        <p
                          className="text-[14px] font-bold text-white cursor-pointer hover:text-blue-300 transition-colors truncate"
                          onClick={() => { setEditingChecklistId(cl.id); setEditingChecklistTitle(cl.title); }}
                          title="Click to rename"
                        >{cl.title}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {cl.items.length > 0 && (
                        <button
                          onClick={() => clDone > 0 && toggleHideChecked(cl.id)}
                          disabled={clDone === 0}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[12px] font-medium transition-all duration-150 ${
                            clDone === 0
                              ? 'border-[#2e3540] text-gray-600 bg-[#1d2125] cursor-not-allowed opacity-50'
                              : 'border-[#454f59] text-gray-200 hover:bg-[#282e33] hover:border-[#5a6577] hover:text-white bg-[#22272b] cursor-pointer'
                          }`}>
                          {hidden ? <><Eye size={12} /><span className="hidden sm:inline">Show checked</span></> : <><EyeOff size={12} /><span className="hidden sm:inline">Hide checked</span></>}
                        </button>
                      )}
                      <button onClick={() => setDeleteChecklistConfirm(cl.id)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[#454f59] text-red-400 hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-300 bg-[#22272b] text-[12px] font-medium transition-all duration-150">
                        <Trash2 size={12} />
                        <span className="hidden sm:inline">Delete Checklist</span>
                      </button>
                    </div>
                  </div>
                  {/* Delete confirmation bar */}
                  {deleteChecklistConfirm === cl.id && (
                    <div className="flex items-center justify-between gap-3 px-3 py-2 bg-red-500/10 border border-red-500/25 rounded-lg">
                      <p className="text-[12px] text-red-400 font-medium">This will permanently delete the entire checklist and all its items.</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => setDeleteChecklistConfirm(null)}
                          className="px-3 py-1 text-[12px] text-gray-400 hover:text-white rounded-md hover:bg-white/10 transition-colors">Cancel</button>
                        <button onClick={() => { deleteChecklist(cl.id); setDeleteChecklistConfirm(null); }}
                          className="flex items-center gap-1.5 px-3 py-1 bg-red-500 hover:bg-red-400 text-white text-[12px] font-bold rounded-md transition-colors">
                          <Trash2 size={11} /> Yes, delete
                        </button>
                      </div>
                    </div>
                  )}
                  <p className="text-[11px] text-gray-500 font-medium">{clPct}%</p>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${clPct}%` }} /></div>
                  <div className="space-y-0.5">
                    {visibleItems.map(item => (
                      <div key={item.id} className="flex items-center gap-2.5 group py-1 px-1.5 rounded-lg hover:bg-white/5 transition-colors duration-100 cursor-default">
                        <button onClick={() => toggleItem(cl.id, item.id)} className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${item.done ? "bg-blue-500 border-blue-500" : "border-gray-500 hover:border-blue-400"}`}>{item.done && <Check size={8} className="text-white" />}</button>
                        <span className={`text-[13px] flex-1 ${item.done ? "line-through text-gray-500" : "text-gray-300"}`}>{item.text.charAt(0).toUpperCase() + item.text.slice(1)}</span>
                        <button onClick={() => deleteItem(cl.id, item.id)} className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><X size={10} /></button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <input value={newItems[cl.id] ?? ""} onChange={e => setNewItems(p => ({ ...p, [cl.id]: e.target.value }))} onKeyDown={e => e.key === "Enter" && addItem(cl.id)} placeholder="Add an item…"
                      className="flex-1 bg-[#22272b] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50" />
                    <button onClick={() => addItem(cl.id)} className="px-3 py-1.5 bg-[#579dff] hover:bg-[#4c8ee6] text-[#1d2125] text-[13px] font-bold rounded-lg">Add</button>
                  </div>
                </div>
              );
            })}
            {/* Custom Fields */}
            {customFieldDefs.length > 0 && (
              <div className="ml-8 space-y-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Custom Fields</p>
                {customFieldDefs.map(def => (
                  <div key={def.id}>
                    <label className="text-xs text-gray-400 mb-1 block">{def.name}</label>
                    {def.type === "text" && <input value={c.customFields[def.id] ?? ""} onChange={e => setCustomField(def.id, e.target.value)} className="w-full bg-[#22272b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />}
                    {def.type === "number" && <input type="number" value={c.customFields[def.id] ?? ""} onChange={e => setCustomField(def.id, e.target.value)} className="w-full bg-[#22272b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />}
                    {def.type === "checkbox" && <button onClick={() => setCustomField(def.id, !c.customFields[def.id])} className="flex items-center gap-2 text-sm"><div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${c.customFields[def.id] ? "bg-blue-500 border-blue-500" : "border-gray-500"}`}>{c.customFields[def.id] && <Check size={9} className="text-white" />}</div><span className={c.customFields[def.id] ? "text-blue-400" : "text-gray-500"}>{c.customFields[def.id] ? "Yes" : "No"}</span></button>}
                    {def.type === "dropdown" && <select value={c.customFields[def.id] ?? ""} onChange={e => setCustomField(def.id, e.target.value)} className="w-full bg-[#22272b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"><option value="">— Select —</option>{def.options?.map(o => <option key={o} value={o}>{o}</option>)}</select>}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* RIGHT — Comments panel: always in DOM, width+maxHeight+opacity animated */}
          <div
            ref={commentsPanelRef}
            className="flex flex-col lg:shrink-0 lg:min-h-0"
            style={(() => {
              return {
                ...(isDesktop
                  ? { width: showCommentsPanel ? '420px' : '0px', maxHeight: 'none' }
                  : { width: '100%', maxHeight: showCommentsPanel ? '80dvh' : '0px' }
                ),
                minWidth: 0,
                overflow: 'hidden',
                opacity: showCommentsPanel ? 1 : 0,
                backgroundColor: '#18191a',
                borderLeft: showCommentsPanel && isDesktop ? '1px solid rgba(255,255,255,0.05)' : 'none',
                borderTop: showCommentsPanel && !isDesktop ? '1px solid rgba(255,255,255,0.05)' : 'none',
                transition: isDesktop
                  ? 'width 320ms cubic-bezier(0.4,0,0.2,1), opacity 200ms ease, border-color 200ms ease'
                  : 'max-height 320ms cubic-bezier(0.4,0,0.2,1), opacity 200ms ease',
                flexShrink: 0,
              };
            })()}
          >
            {/* Inner content: fixed 420px on desktop so width animation doesn't reflow; full width on mobile */}
            <div className="flex flex-col h-full lg:w-[420px] w-full">
            {/* Header — Trello style: 'Comments and activity' */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
              <div className="flex items-center gap-2 text-[13px] font-bold text-white">
                <MessageSquare size={14} className="text-gray-400" />
                Comments and activity
              </div>
            </div>
            {/* Comment input — shown if full access OR assigned to card */}
            {!canComment && (
              <div className="px-3 pt-3 pb-1">
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5">
                  <MessageSquare size={13} className="text-gray-600 shrink-0" />
                  <span className="text-xs text-gray-500">You need to be assigned to this card to comment.</span>
                </div>
              </div>
            )}
            {canComment && (
            <div className="px-3 pt-3 pb-2 relative">
              {/* Comment box CSS: hover lightens, focused shows blue ring */}
              <style>{`
                .cm-box { transition: background-color 150ms, border-color 150ms, box-shadow 150ms; }
                .cm-box:hover { background-color: #333639 !important; }
                .cm-box.cm-focused { border-color: #4c90e2 !important; box-shadow: 0 0 0 1px rgba(76,144,226,.25); background-color: #2c2d2e !important; }
              `}</style>

              {/* Hidden file input for comment attachments — uploads and previews inline in comment */}
              <input
                type="file"
                ref={commentAttachRef}
                className="hidden"
                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                onChange={async e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 5 * 1024 * 1024) { onToast('error', 'File too large — max 5 MB.'); return; }
                  setUploadingCommentAttach(true);
                  try {
                    const base64 = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve((reader.result as string).split(',')[1]);
                      reader.onerror = reject;
                      reader.readAsDataURL(file);
                    });
                    const resp = await apiFetch('/planner/upload', { method: 'POST', body: JSON.stringify({ base64, name: file.name, contentType: file.type, cardId: card.id }) });
                    if (!resp.ok) throw new Error('Upload failed');
                    const { url } = await resp.json();
                    setPendingCommentAttach({ id: uid(), name: file.name, url, type: 'file' });
                  } catch (err: any) { onToast('error', err?.message ?? 'Upload failed'); }
                  finally { setUploadingCommentAttach(false); e.target.value = ''; }
                }}
              />

              {/* The textarea box */}
              <div className={`cm-box rounded-xl ${commentFocused ? 'cm-focused' : ''}`}
                style={{ backgroundColor: '#2c2d2e', border: '2px solid transparent' }}>
                <textarea
                  ref={commentTextareaRef}
                  value={comment}
                  onFocus={() => setCommentFocused(true)}
                  onBlur={() => setTimeout(() => setCommentFocused(false), 150)}
                  onChange={e => {
                    const val = e.target.value;
                    setComment(val);
                    // Auto-resize
                    const ta = e.target;
                    ta.style.height = 'auto';
                    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
                    // @mention trigger
                    const match = val.match(/@([\w\s.]*)$/);
                    setMentionQuery(match ? match[1] : null);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setMentionQuery(null); }
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendComment();
                  }}
                  placeholder="Write a comment…"
                  rows={1}
                  className="w-full px-4 pt-3 pb-3 text-sm text-gray-300 placeholder-gray-500 focus:outline-none resize-none leading-relaxed"
                  style={{ backgroundColor: 'transparent', border: 'none', minHeight: '42px', maxHeight: '200px', overflow: 'hidden' }}
                />
              </div>

              {/* Pending comment attachment chip */}
              {pendingCommentAttach && (
                <div className="flex items-center gap-2 mt-2 px-2 py-1.5 bg-white/8 border border-white/10 rounded-lg">
                  <Paperclip size={12} className="text-blue-400 shrink-0" />
                  <span className="text-xs text-gray-300 truncate flex-1">{pendingCommentAttach.name}</span>
                  <button onClick={() => setPendingCommentAttach(null)} className="text-gray-500 hover:text-red-400 transition-colors shrink-0"><X size={12} /></button>
                </div>
              )}
              {uploadingCommentAttach && (
                <div className="flex items-center gap-2 mt-2 px-2 py-1.5 bg-white/8 border border-white/10 rounded-lg">
                  <Loader2 size={12} className="text-blue-400 animate-spin shrink-0" />
                  <span className="text-xs text-gray-400">Uploading…</span>
                </div>
              )}
              {/* Bottom bar — Save (FB blue when text) + Attach — show when focused OR typing */}
              {(commentFocused || comment.trim() || pendingCommentAttach) && (
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={sendComment}
                      disabled={sendingComment || (!comment.trim() && !pendingCommentAttach)}
                      className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-all duration-150 ${
                        (comment.trim() || pendingCommentAttach)
                          ? 'bg-[#1877F2] hover:bg-[#166FE5] text-white shadow-sm'
                          : 'bg-white/8 text-gray-500 cursor-default'
                      }`}>
                      {sendingComment ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { setComment(''); setPendingCommentAttach(null); setCommentFocused(false); }}
                      className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                      Cancel
                    </button>
                  </div>
                  <button
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => commentAttachRef.current?.click()}
                    title="Attach file (max 5 MB)"
                    disabled={uploadingCommentAttach || !!pendingCommentAttach}
                    className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    <Paperclip size={15} />
                  </button>
                </div>
              )}

              {/* @mention member picker */}
              {mentionQuery !== null && (() => {
                const filtered = c.members.filter(m =>
                  m.toLowerCase().includes(mentionQuery.toLowerCase())
                );
                if (filtered.length === 0) return null;
                return (
                  <div className="absolute left-3 right-3 top-full mt-1 bg-[#22272b] border border-white/15 rounded-xl shadow-2xl overflow-hidden z-20">
                    {filtered.map(name => (
                      <button key={name}
                        onMouseDown={e => {
                          e.preventDefault();
                          const newText = comment.replace(/@[\w\s.]*$/, `@${name} `);
                          setComment(newText);
                          setMentionQuery(null);
                          setTimeout(() => commentTextareaRef.current?.focus(), 10);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/10 transition-colors">
                        <Avatar name={name} photo={allMembers.find((m:any) => m.name === name)?.photo} size={20}/>
                        <span className="text-sm text-white">{name}</span>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
            )}
            {/* Comments thread */}
            <div ref={commentsThreadRef} className="flex-1 overflow-y-auto min-h-0">
              {comments.length === 0 && (
                <p className="text-center text-xs text-gray-600 py-6">No comments yet. Be the first!</p>
              )}
              {/* Comment bubbles — Trello-style */}
              {comments.map(cm => (
                <div key={cm.id} className="flex items-start gap-2.5 px-3 py-2.5 border-b border-white/[0.06] group">
                  <Avatar name={cm.authorName} photo={cm.authorPhoto} size={30} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-[13px] font-bold text-white leading-snug">{cm.authorName}</span>
                      <span className="text-[11px] font-medium text-blue-400 hover:underline cursor-default leading-snug">{fullTimestamp(cm.createdAt)}</span>
                    </div>
                    {/* Message bubble — inline editable when editing */}
                    {editingCommentId === cm.id ? (
                      <div className="w-full">
                        <textarea
                          value={editingCommentText}
                          onChange={e => setEditingCommentText(e.target.value)}
                          autoFocus rows={2}
                          className="w-full bg-[#1d2125] border border-blue-500/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none resize-none"
                        />
                        <div className="flex gap-2 mt-1.5">
                          <button
                            onClick={async () => {
                              if (!editingCommentText.trim()) return;
                              await apiFetch(`/planner/cards/${card.id}/comments/${cm.id}`, { method: 'PATCH', body: JSON.stringify({ text: editingCommentText.trim() }) });
                              setEditingCommentId(null);
                            }}
                            className="px-3 py-1 bg-blue-500 hover:bg-blue-400 text-white text-xs font-bold rounded-md transition-colors">Save</button>
                          <button onClick={() => setEditingCommentId(null)}
                            className="px-3 py-1 text-xs text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition-colors">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full bg-[#282f35] rounded-lg px-3 py-2 text-[13px] leading-relaxed">
                        {cm.text && <p className="text-sm text-gray-200 break-words leading-relaxed">
                          {(() => {
                            if (!c.members.length) return cm.text;
                            const sorted = [...c.members].sort((a, b) => b.length - a.length);
                            const escaped = sorted.map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                            const re = new RegExp(`(@(?:${escaped.join('|')}))`, 'g');
                            const parts = cm.text.split(re);
                            return parts.map((part, i) =>
                              sorted.some(m => part === `@${m}`) ? (
                                <span key={i} className="inline-flex items-center bg-blue-500/20 text-blue-300 text-xs font-semibold px-1.5 py-0.5 rounded-md">{part}</span>
                              ) : <span key={i}>{part}</span>
                            );
                          })()}
                        </p>}
                        {/* Inline attachment preview inside comment bubble */}
                        {cm.attachments?.map(att => (
                          <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 mt-2 px-2.5 py-2 bg-white/8 hover:bg-white/12 border border-white/10 rounded-lg transition-colors group/att">
                            {att.url.match(/\.(jpe?g|png|gif|webp|svg)$/i)
                              ? <img src={att.url} alt={att.name} className="w-10 h-10 object-cover rounded-md shrink-0 border border-white/10" />
                              : <div className="w-10 h-10 bg-blue-500/20 rounded-md flex items-center justify-center shrink-0"><Paperclip size={16} className="text-blue-400" /></div>
                            }
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-200 truncate group-hover/att:text-blue-300 transition-colors">{att.name}</p>
                              <p className="text-[10px] text-gray-500 mt-0.5">Attachment · Click to view</p>
                            </div>
                            <ExternalLink size={12} className="text-gray-600 group-hover/att:text-blue-400 shrink-0 transition-colors" />
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Action bar — icon buttons with tooltips */}
                    <div className="flex items-center gap-1 mt-1.5 ml-0.5">
                      {(cm.authorName === currentUser?.name || isFullAccess) && editingCommentId !== cm.id && (
                        <button onClick={() => { setEditingCommentId(cm.id); setEditingCommentText(cm.text); }}
                          title="Edit" className="relative group/tip w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:text-blue-400 hover:bg-white/10 transition-colors">
                          <Pencil size={11} />
                          <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 rounded bg-gray-900 text-white text-[10px] whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity">Edit</span>
                        </button>
                      )}
                      <button onClick={() => {
                        const text = `@${cm.authorName} `;
                        setComment(text);
                        setTimeout(() => {
                          const el = commentTextareaRef.current;
                          if (el) { el.focus(); el.setSelectionRange(text.length, text.length); }
                        }, 50);
                      }} title="Reply" className="relative group/tip w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:text-gray-300 hover:bg-white/10 transition-colors">
                        <CornerUpLeft size={11} />
                        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 rounded bg-gray-900 text-white text-[10px] whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity">Reply</span>
                      </button>
                      {(cm.authorName === currentUser?.name || isFullAccess) && (
                        deleteCommentConfirm === cm.id ? (
                          <span className="flex items-center gap-1.5 ml-1">
                            <span className="text-[11px] text-red-400 font-medium">Delete?</span>
                            <button onClick={() => { deleteComment(cm.id); setDeleteCommentConfirm(null); }}
                              className="text-[11px] font-bold text-red-400 hover:text-red-300 transition-colors">Yes</button>
                            <span className="text-gray-700 text-xs">·</span>
                            <button onClick={() => setDeleteCommentConfirm(null)}
                              className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors">No</button>
                          </span>
                        ) : (
                          <button onClick={() => setDeleteCommentConfirm(cm.id)}
                            title="Delete" className="relative group/tip w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:text-red-400 hover:bg-white/10 transition-colors">
                            <Trash2 size={11} />
                            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 rounded bg-gray-900 text-white text-[10px] whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity">Delete</span>
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              ))}

            </div>
            </div>{/* /inner w-80 */}
          </div>{/* /right panel */}
      </div>{/* /body */}
      </div>{/* /card */}

      {/* ── Bottom tab bar ── */}
      <div
        className="shrink-0 flex items-center justify-center px-4"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() => {
            const opening = !showCommentsPanel;
            if (!opening) {
              if (commentsThreadRef.current) {
                savedCommentsScrollRef.current = commentsThreadRef.current.scrollTop;
              }
              leftPanelRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              bodyWrapperRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              setTimeout(() => setShowCommentsPanel(false), 350);
            } else {
              setShowCommentsPanel(true);
              setTimeout(() => {
                if (window.innerWidth >= 1024) {
                  const el = commentsThreadRef.current;
                  if (el) el.scrollTop = savedCommentsScrollRef.current;
                } else {
                  const body = bodyWrapperRef.current;
                  const panel = commentsPanelRef.current;
                  if (body && panel) {
                    const bodyRect = body.getBoundingClientRect();
                    const panelRect = panel.getBoundingClientRect();
                    const targetScrollTop = body.scrollTop + (panelRect.top - bodyRect.top);
                    body.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
                  }
                }
              }, 340);
            }
          }}
          className="flex items-center gap-2 transition-all duration-200 rounded hover:opacity-80"
          style={{
            backgroundColor: 'rgb(17, 20, 22)',
            border: '1px solid rgba(100, 108, 118, 0.35)',
            borderRadius: '5px',
            marginBlock: '0.5rem',
            paddingInline: '14px',
            paddingBlock: '10px',
          }}
        >
          <MessageSquare size={16} className="text-blue-400" />
          {/* Label + underline — shown sm+ */}
          <span className="flex flex-col items-center">
            <span className="text-[13px] font-semibold text-blue-400 leading-none">Comments</span>
            <span className="mt-1 block w-6 h-[2.5px] rounded-full bg-blue-500" />
          </span>
          {comments.length > 0 && (
            <span className="text-[11px] font-bold text-blue-300 bg-blue-500/20 px-1.5 py-0.5 rounded-full leading-none">
              {comments.length}
            </span>
          )}
        </button>
      </div>
    </div>{/* /overlay */}
    {/* Image Lightbox — responsive, no overflow on any screen */}
    {lightboxUrl && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 sm:p-8"
        onClick={() => setLightboxUrl(null)}>
        <div className="relative w-full h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
          <img src={lightboxUrl} alt="Attachment preview"
            className="max-w-[90vw] max-h-[85vh] w-auto h-auto object-contain rounded-xl shadow-2xl" />
          <button onClick={() => setLightboxUrl(null)}
            className="absolute top-0 right-0 w-8 h-8 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center border border-white/20">
            <X size={14} />
          </button>
          <a href={lightboxUrl} target="_blank" rel="noopener noreferrer"
            className="absolute bottom-0 right-0 flex items-center gap-1.5 bg-black/60 hover:bg-black/80 text-white text-xs px-3 py-1.5 rounded-lg border border-white/20 transition-colors">
            <Paperclip size={11} /> Open original
          </a>
        </div>
      </div>
    )}
    {/* ── Dates floating popover (Trello-style) ── */}
    {panel === "dates" && datesPanelPos && (
      <>
        {/* Transparent backdrop — click outside closes */}
        <div className="fixed inset-0 z-[58]" onClick={() => { setPanel("main"); setDatesPanelPos(null); }} />
        {/* Floating popover */}
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 288,
            zIndex: 59,
            boxShadow: '0 8px 24px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.35)',
          }}
          className="bg-[#282e33] rounded-xl border border-white/10 overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Title bar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
            <span className="text-xs font-semibold text-gray-200">Dates</span>
            <button onClick={() => { setPanel("main"); setDatesPanelPos(null); }}
              className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors">
              <X size={13} />
            </button>
          </div>
          {/* ── Compact calendar ── */}
          <div className="px-3 pt-3 pb-1">
            <div className="flex items-center justify-between mb-1.5">
              <button onClick={prevCalMonth} className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"><ChevronLeft size={13} /></button>
              <span className="text-xs font-bold text-white">{CAL_MONTHS[calMonth-1]} {calYear}</span>
              <button onClick={nextCalMonth} className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"><ChevronRight size={13} /></button>
            </div>
            <div className="grid grid-cols-7">
              {CAL_DAYS.map(d => <div key={d} className="text-center text-[9px] font-bold text-gray-500 py-0.5">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: calFirstDow }).map((_,i) => <div key={`e${i}`} />)}
              {Array.from({ length: calDaysInMonth }).map((_,i) => {
                const day = i + 1;
                const ymd = toYMD(calYear, calMonth, day);
                const isDue          = ymd === draftDue;
                const isStart        = draftStartEnabled && ymd === draftStart;
                const isToday        = ymd === todayYMD;
                const isPast         = ymd < todayYMD;                          // before today — blocked
                // due checkbox is active if draftDue is filled OR calTarget is 'due' (checked but not yet picked)
                const dueEnabled     = !!draftDue || calTarget === 'due';
                const noneChecked    = !draftStartEnabled && !dueEnabled;       // no checkbox active
                const isDisabled     = isPast || noneChecked;
                return (
                  <button key={day} onClick={() => selectCalDay(day)}
                    disabled={isDisabled}
                    title={isPast ? "Past dates cannot be selected" : noneChecked ? "Check a date checkbox first" : undefined}
                    className={`h-7 w-full rounded text-[11px] font-medium transition-all ${
                      isPast
                        ? "text-gray-700 line-through cursor-not-allowed"        // past: dimmed + strikethrough
                        : noneChecked
                        ? "text-gray-600 cursor-not-allowed opacity-40"          // no checkbox: dimmed
                        : isDue    ? "bg-blue-500 text-white"
                        : isStart  ? "bg-blue-500/25 text-blue-200"
                        : isToday  ? "text-blue-400 font-bold ring-1 ring-blue-400 hover:bg-white/10"
                        : "text-gray-300 hover:bg-white/10"}`}>
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
          {/* ── Date fields ── */}
          <div className="px-3 py-2.5 space-y-2 border-t border-white/5">
            {/* Start date */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 mb-1">Start date</p>
              <div className="flex items-center gap-1.5">
                <button onClick={() => {
                    if (draftStartEnabled) {
                      // Unchecking: clear the date so stale value doesn't persist
                      setDraftStartEnabled(false);
                      setDraftStart("");
                      setDraftStartTime("");
                      setCalTarget('due');
                    } else {
                      setDraftStartEnabled(true);
                      setCalTarget('start'); // next calendar click → start date
                    }
                  }}
                  className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                    draftStartEnabled ? "bg-blue-500 border-blue-500" : "border-gray-500 bg-transparent"}`}>
                  {draftStartEnabled && <Check size={8} className="text-white" />}
                </button>
                <div className="flex-1 flex items-center gap-1">
                  <input type="text" readOnly placeholder="M/D/YYYY" tabIndex={-1}
                    value={draftStart && draftStartEnabled ? new Date(draftStart + "T12:00:00").toLocaleDateString("en", { month: "numeric", day: "numeric", year: "numeric" }) : ""}
                    onClick={() => { setDraftStartEnabled(true); setCalTarget('start'); }}
                    className={`flex-1 min-w-0 bg-[#1d2125] border rounded px-2 py-1 text-[11px] cursor-pointer outline-none ${
                      draftStartEnabled && draftStart ? "text-white" : "text-gray-500"} ${
                      calTarget === 'start' ? "border-blue-500/60" : "border-white/10"}`}
                  />
                  {draftStartEnabled && draftStart && (
                    <input type="time" value={draftStartTime} onChange={e => setDraftStartTime(e.target.value)}
                      style={{ colorScheme: "dark", color: "white", WebkitTextFillColor: "white" }}
                      className="flex-1 min-w-0 bg-[#1d2125] border border-white/10 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-blue-500/40" />
                  )}
                </div>
              </div>
            </div>
            {/* Due date */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 mb-1">Due date</p>
              <div className="flex items-center gap-1.5">
                <button onClick={() => {
                    if (draftDue) {
                      // Unchecking: clear the due date
                      setDraftDue("");
                      setDraftTime("");
                      setCalTarget('start');
                    } else {
                      // Checking: leave blank — user will pick from calendar
                      setDraftDue("");
                      setCalTarget('due');
                    }
                  }}
                  className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                    draftDue ? "bg-blue-500 border-blue-500" : "border-gray-500 bg-transparent"}`}>
                  {draftDue && <Check size={8} className="text-white" />}
                </button>
                <div className="flex-1 flex items-center gap-1">
                  <input type="text" readOnly placeholder="M/D/YYYY" tabIndex={-1}
                    value={draftDue ? new Date(draftDue + "T12:00:00").toLocaleDateString("en", { month: "numeric", day: "numeric", year: "numeric" }) : ""}
                    onClick={() => { setCalTarget('due'); if (!draftDue) setDraftDue(""); }}
                    className={`flex-1 min-w-0 bg-[#1d2125] border rounded px-2 py-1 text-[11px] cursor-pointer outline-none ${
                      draftDue ? "text-white" : "text-gray-500"} ${
                      calTarget === 'due' ? "border-blue-500/60" : "border-white/10"}`}
                  />
                  {draftDue && (
                    <input type="time" value={draftTime} onChange={e => setDraftTime(e.target.value)}
                      style={{ colorScheme: "dark", color: "white", WebkitTextFillColor: "white" }}
                      className="flex-1 min-w-0 bg-[#1d2125] border border-white/10 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-blue-500/40" />
                  )}
                </div>
              </div>
            </div>
            {/* Validation — only time conflict matters now (past dates blocked at calendar level) */}
            {(() => {
              const dateErr = draftStartEnabled && !!draftStart && !!draftDue && draftStart > draftDue;
              const timeErr = draftStartEnabled && !!draftStart && !!draftDue && draftStart === draftDue && !!draftStartTime && !!draftTime && draftStartTime >= draftTime;
              if (!dateErr && !timeErr) return null;
              return (
                <div className="flex items-start gap-1.5 bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">
                  <span className="text-red-400 text-[10px] leading-tight">
                    ⛔ {dateErr
                      ? "Start date cannot be after the due date."
                      : "Start time must be before due time when dates are the same day."}
                  </span>
                </div>
              );
            })()}
          </div>
          {/* ── Reminder — custom dropdown always opens downward ── */}
          <div className="px-3 pb-2.5 space-y-1 border-t border-white/5 pt-2.5">
            <p className="text-[10px] font-semibold text-gray-400">Set due date reminder</p>
            <div ref={reminderRef} className="relative">
              <button
                type="button"
                onClick={() => setReminderOpen(o => !o)}
                onBlur={() => setTimeout(() => setReminderOpen(false), 150)}
                className="w-full flex items-center justify-between bg-[#1d2125] border border-white/10 rounded px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-blue-500/50 hover:border-white/20 transition-colors">
                <span>{draftReminder === 'none' ? 'None' : draftReminder === '1d' ? '1 Day before' : draftReminder === '2d' ? '2 Days before' : '1 Week before'}</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className={`text-gray-400 transition-transform ${reminderOpen ? 'rotate-180' : ''}`}><path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
              </button>
              {reminderOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-[#22272b] border border-white/15 rounded-lg shadow-2xl z-[200]">
                  {([['none','None'],['1d','1 Day before'],['2d','2 Days before'],['1w','1 Week before']] as [string,string][]).map(([val, label]) => (
                    <button key={val} type="button"
                      onMouseDown={e => { e.preventDefault(); setDraftReminder(val); setReminderOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] text-left transition-colors hover:bg-white/8 ${
                        draftReminder === val ? 'text-blue-300 bg-blue-500/10' : 'text-gray-200'
                      }`}>
                      {draftReminder === val && <span className="text-blue-400">✓</span>}
                      {draftReminder !== val && <span className="w-3" />}
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[10px] text-gray-600 leading-tight">Reminders will be sent to all members and watchers of this card.</p>
          </div>
          {/* ── Save ── */}
          <div className="px-3 pb-3 space-y-1">
            <button onClick={saveDates}
              disabled={
                !draftDue ||
                !!(draftStartEnabled && draftStart && draftDue && (
                  draftStart > draftDue ||
                  (draftStart === draftDue && draftStartTime && draftTime && draftStartTime >= draftTime)
                ))
              }
              className="w-full py-2 bg-[#579dff] hover:bg-[#4c8ee6] text-[#1d2125] text-xs font-bold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Save
            </button>
            {!draftDue && (
              <p className="text-center text-[10px] text-gray-500">Select a due date to save.</p>
            )}
            {(c.dueDate || c.startDate) && (
              <button onClick={removeDates}
                className="w-full py-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors">
                Remove dates
              </button>
            )}
          </div>
        </div>
      </>
    )}
    </>
  );
}
// ── Move Modal ─────────────────────────────────────────────────────────────
function MoveModal({ card, boards, currentUser, allMembers, onClose, onMoved, onToast }:
  { card: Card; boards: Board[]; currentUser?: { name: string; photo?: string }; allMembers?: any[]; onClose: () => void; onMoved: () => void; onToast: Props["onToast"]; }) {
  const [destBoard, setDestBoard] = useState(card.boardId);
  const [destList, setDestList] = useState(card.listId);
  const [position, setPosition] = useState<"top" | "bottom">("bottom");
  const [moving, setMoving] = useState(false);
  const [boardLists, setBoardLists] = useState<PgList[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);

  // Fetch real lists from API whenever selected board changes
  useEffect(() => {
    if (!destBoard) return;
    setLoadingLists(true);
    apiFetch(`/planner/boards/${destBoard}/lists`)
      .then(r => r.json())
      .then((data: PgList[]) => {
        const active = Array.isArray(data) ? data.filter(l => !l.archived) : [];
        setBoardLists(active);
        const stillValid = active.find(l => l.id === destList);
        if (!stillValid) setDestList(active[0]?.id ?? "");
      })
      .catch(() => setBoardLists([]))
      .finally(() => setLoadingLists(false));
  }, [destBoard]);

  const hasNoLists = !loadingLists && boardLists.length === 0;

  const doMove = async () => {
    setMoving(true);
    try {
      const r = await apiFetch(`/planner/cards/${card.id}/move`, { method: "PATCH", body: JSON.stringify({ boardId: destBoard, listId: destList, position }) });
      if (!r.ok) throw new Error();
      const fromList = boardLists.find(l => l.id === card.listId)?.title ?? "unknown";
      const toList = boardLists.find(l => l.id === destList)?.title ?? "unknown";
      apiFetch(`/planner/cards/${card.id}/activity`, { method: "POST", body: JSON.stringify({ type: "move", actorName: currentUser?.name || "Someone", actorPhoto: currentUser?.photo || "", text: `moved this card from ${fromList} to ${toList}` }) }).catch(() => {});
      // Notify all card members about the move — single batch request
      if (allMembers?.length && card.members?.length) {
        const actorMember = allMembers.find((m: any) => m.name === currentUser?.name);
        const actorId = actorMember?.id || currentUser?.name || 'unknown';
        const boardTitle = boards.find(b => b.id === destBoard)?.title || 'Planner';
        const recipientIds = card.members
          .map((name: string) => allMembers.find((m: any) => m.name === name)?.id)
          .filter((id: string | undefined): id is string => !!id && id !== actorId);
        if (recipientIds.length) {
          apiFetch('/planner/notify', { method: 'POST', body: JSON.stringify({
            actorId, actorName: currentUser?.name || 'Someone',
            actorPhoto: currentUser?.photo || '',
            recipientIds,
            type: 'planner_moved', cardId: card.id,
            cardTitle: card.title, boardName: boardTitle,
          }) }).catch(() => {});
        }
      }
      onToast("success", "Card moved!"); onMoved();
    }
    catch { onToast("error", "Failed to move"); } finally { setMoving(false); }
  };
  // Helper: CSS grid row expand/collapse — only true smooth height-to-auto animation
  const gridRow = (show: boolean) => ({
    display: 'grid' as const,
    gridTemplateRows: show ? '1fr' : '0fr',
    opacity: show ? 1 : 0,
    transition: 'grid-template-rows 300ms cubic-bezier(0.4,0,0.2,1), opacity 250ms ease',
  });
  const innerRow = { overflow: 'hidden' as const, minHeight: 0 };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#22272b] rounded-2xl w-full max-w-sm shadow-2xl border border-white/5 p-5">
        <div className="flex items-center justify-between mb-4"><h3 className="font-bold text-white">Move Card</h3><button onClick={onClose} className="text-gray-400 hover:text-white"><X size={16} /></button></div>
        <div className="flex flex-col">

          {/* Board — always visible */}
          <div><label className="text-xs text-gray-400 mb-1 block font-semibold uppercase tracking-wide">Board</label><select value={destBoard} onChange={e => setDestBoard(e.target.value)} className="w-full bg-[#1d2125] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">{boards.filter(b => !b.archived).map(b => <option key={b.id} value={b.id}>{b.title}</option>)}</select></div>

          {/* Loading — grid row animation (pt-3 inside so spacing is clipped when collapsed) */}
          <div style={gridRow(loadingLists)}>
            <div style={innerRow}>
              <div className="flex items-center gap-2 pt-3 text-xs text-gray-400">
                <svg className="animate-spin w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                Loading lists…
              </div>
            </div>
          </div>

          {/* Warning — grid row animation */}
          <div style={gridRow(hasNoLists)}>
            <div style={innerRow}>
              <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2.5 mt-3">
                <svg className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                <div>
                  <p className="text-xs font-semibold text-amber-300">No lists available</p>
                  <p className="text-xs text-amber-400/80 mt-0.5">This board has no lists yet. Create a list on that board first before moving a card to it.</p>
                </div>
              </div>
            </div>
          </div>

          {/* List dropdown — grid row animation */}
          <div style={gridRow(!loadingLists && !hasNoLists)}>
            <div style={innerRow}>
              <div className="pt-3">
                <label className="text-xs text-gray-400 mb-1 block font-semibold uppercase tracking-wide">List</label>
                <select value={destList} onChange={e => setDestList(e.target.value)} className="w-full bg-[#1d2125] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">{boardLists.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}</select>
              </div>
            </div>
          </div>

          {/* Position dropdown — grid row animation */}
          <div style={gridRow(!loadingLists && !hasNoLists)}>
            <div style={innerRow}>
              <div className="pt-3">
                <label className="text-xs text-gray-400 mb-1 block font-semibold uppercase tracking-wide">Position</label>
                <select value={position} onChange={e => setPosition(e.target.value as any)} className="w-full bg-[#1d2125] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"><option value="top">Top</option><option value="bottom">Bottom</option></select>
              </div>
            </div>
          </div>

        </div>
        <button onClick={doMove} disabled={hasNoLists || loadingLists || !destList || moving} className="w-full mt-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{moving ? "Moving…" : "Move Card"}</button>
      </div>
    </div>
  );
}

// ── Board Settings Modal ───────────────────────────────────────────────────
function BoardSettings({ board, onClose, onSaved, onArchive, onToast }:
  { board: Board; onClose: () => void; onSaved: (b: Board) => void; onArchive: (id: string) => void; onToast: Props["onToast"]; }) {
  const [title, setTitle] = useState(board.title);
  const [color, setColor] = useState(board.color);
  const [desc, setDesc] = useState(board.description);
  const [defs, setDefs] = useState<CustomFieldDef[]>(board.customFieldDefs ?? []);
  const [saving, setSaving] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<FieldType>("text");
  const [newFieldOptions, setNewFieldOptions] = useState("");
  const save = async () => {
    setSaving(true);
    try { await apiFetch(`/planner/boards/${board.id}`, { method: "PUT", body: JSON.stringify({ title, color, description: desc, customFieldDefs: defs }) }); onSaved({ ...board, title, color, description: desc, customFieldDefs: defs }); onToast("success", "Saved!"); }
    catch { onToast("error", "Failed"); } finally { setSaving(false); }
  };
  const addField = () => {
    if (!newFieldName.trim()) return;
    setDefs(p => [...p, { id: uid(), name: newFieldName.trim(), type: newFieldType, options: newFieldType === "dropdown" ? newFieldOptions.split(",").map(s => s.trim()).filter(Boolean) : undefined }]);
    setNewFieldName(""); setNewFieldOptions("");
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#22272b] rounded-2xl w-full max-w-md shadow-2xl border border-white/5 p-5">
        <div className="flex items-center justify-between mb-4"><h3 className="font-bold text-white flex items-center gap-2"><Settings size={15} /> Board Settings</h3><button onClick={onClose} className="text-gray-400 hover:text-white"><X size={16} /></button></div>
        <div className="space-y-4">
          <div><label className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1 block">Name</label><input value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-[#1d2125] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" /></div>
          <div><label className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1 block">Description</label><textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} className="w-full bg-[#1d2125] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none resize-none" /></div>
          <div><label className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 block">Color</label><div className="flex flex-wrap gap-2">{BOARD_COLORS.map(bc => <button key={bc} onClick={() => setColor(bc)} style={{ background: bc }} className={`w-8 h-8 rounded-lg transition-all ${color === bc ? "ring-2 ring-white scale-110" : ""}`} />)}</div></div>
          <div className="flex gap-2 pt-2 border-t border-white/10">
            <button onClick={() => onArchive(board.id)} className="flex-1 py-2 bg-white/5 hover:bg-amber-500/20 text-gray-300 hover:text-amber-400 text-sm rounded-xl flex items-center justify-center gap-1.5"><Archive size={13} /> Archive Board</button>
            <button onClick={save} disabled={saving} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function PlaygroundTrello({ allMembers = [], currentUser, onToast, isFullAccess = true }: Props) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [lists, setLists] = useState<PgList[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [activeBoard, setActiveBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(false);
  const [boardsLoading, setBoardsLoading] = useState(true);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [moveCard, setMoveCard] = useState<Card | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [addingCard, setAddingCard] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [addingList, setAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState("");
  const [showNewBoard, setShowNewBoard] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [newBoardColor, setNewBoardColor] = useState(BOARD_COLORS[0]);
  const [listMenuId, setListMenuId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedCards, setArchivedCards] = useState<Card[]>([]);
  const [archivedLists, setArchivedLists] = useState<PgList[]>([]);
  const [archivedBoards, setArchivedBoards] = useState<Board[]>([]);
  const [showArchivedBoards, setShowArchivedBoards] = useState(false);
  const [selectedArchivedBoards, setSelectedArchivedBoards] = useState<Set<string>>(new Set());
  const [boardMenuId, setBoardMenuId] = useState<string | null>(null);
  const [archiveBoardConfirm, setArchiveBoardConfirm] = useState<string | null>(null);
  const [bulkArchiveMode, setBulkArchiveMode] = useState(false);
  const [selectedBulkBoards, setSelectedBulkBoards] = useState<Set<string>>(new Set());
  const [bulkArchiveConfirm, setBulkArchiveConfirm] = useState(false);
  const [bulkRestoreConfirm, setBulkRestoreConfirm] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [deleteCardConfirm, setDeleteCardConfirm] = useState<string | null>(null);
  type CardRestoreDialog = { cardId: string; cardTitle: string; listTitle: string; listId: string; };
  const [cardRestoreDialog, setCardRestoreDialog] = useState<CardRestoreDialog | null>(null);
  const [undoCard, setUndoCard] = useState<Card | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardInputRef = useRef<HTMLInputElement>(null);

  const fetchBoards = useCallback(async () => {
    setBoardsLoading(true);
    try { const r = await apiFetch("/planner/boards"); const data = await r.json(); setBoards(Array.isArray(data) ? data.filter((b: Board) => !b.archived) : []); }
    catch { onToast("error", "Failed to load boards"); }
    finally { setBoardsLoading(false); }
  }, []);

  useEffect(() => { fetchBoards(); }, [fetchBoards]);

  const fetchBoardData = useCallback(async (boardId: string) => {
    setLoading(true);
    try {
      const [lr, cr] = await Promise.all([apiFetch(`/planner/boards/${boardId}/lists`), apiFetch(`/planner/boards/${boardId}/cards`)]);
      const [ls, cs] = await Promise.all([lr.json(), cr.json()]);
      setLists(Array.isArray(ls) ? ls : []); setCards(Array.isArray(cs) ? cs : []);
    } catch { onToast("error", "Failed to load board"); } finally { setLoading(false); }
  }, []);

  const openBoard = (b: Board) => { setActiveBoard(b); fetchBoardData(b.id); };

  const createBoard = async () => {
    if (!newBoardTitle.trim()) return;
    try {
      const r = await apiFetch("/planner/boards", { method: "POST", body: JSON.stringify({ title: newBoardTitle.trim(), color: newBoardColor }) });
      const { id } = await r.json();
      const nb: Board = { id, title: newBoardTitle.trim(), color: newBoardColor, description: "", archived: false, customFieldDefs: [] };
      setNewBoardTitle(""); setShowNewBoard(false); await fetchBoards(); openBoard(nb);
    } catch { onToast("error", "Failed to create board"); }
  };

  const createList = async () => {
    if (!newListTitle.trim() || !activeBoard) return;
    try { await apiFetch(`/planner/boards/${activeBoard.id}/lists`, { method: "POST", body: JSON.stringify({ title: newListTitle.trim().toUpperCase() }) }); setNewListTitle(""); setAddingList(false); await fetchBoardData(activeBoard.id); }
    catch { onToast("error", "Failed to create list"); }
  };

  const createCard = async (listId: string) => {
    if (!newCardTitle.trim() || !activeBoard) return;
    try {
      const cap = (s: string) => s.trim().replace(/\b\w/g, c => c.toUpperCase());
      const r = await apiFetch("/planner/cards", { method: "POST", body: JSON.stringify({ boardId: activeBoard.id, listId, title: cap(newCardTitle.trim()) }) });
      const { id } = await r.json();
      const listTitle = lists.find(l => l.id === listId)?.title ?? "this list";
      apiFetch(`/planner/cards/${id}/activity`, { method: "POST", body: JSON.stringify({ type: "create", actorName: currentUser?.name || "Someone", actorPhoto: currentUser?.photo || "", text: `added this card to ${listTitle}` }) }).catch(() => {});
      setNewCardTitle(""); setAddingCard(null); await fetchBoardData(activeBoard.id);
    } catch { onToast("error", "Failed to create card"); }
  };

  const archiveList = async (listId: string) => {
    try { await apiFetch(`/planner/lists/${listId}`, { method: "PUT", body: JSON.stringify({ archived: true }) }); setListMenuId(null); if (activeBoard) await fetchBoardData(activeBoard.id); onToast("success", "List archived"); }
    catch { onToast("error", "Failed"); }
  };

  const deleteList = async (listId: string) => {
    if (!confirm("Delete this list and all its cards?")) return;
    try { await apiFetch(`/planner/lists/${listId}`, { method: "DELETE" }); setListMenuId(null); if (activeBoard) await fetchBoardData(activeBoard.id); }
    catch { onToast("error", "Failed"); }
  };

  const archiveBoard = async (id: string, silent = false) => {
    try { await apiFetch(`/planner/boards/${id}`, { method: "PUT", body: JSON.stringify({ archived: true }) }); setShowSettings(false); setActiveBoard(null); await fetchBoards(); if (!silent) onToast("success", "Board archived"); }
    catch { if (!silent) onToast("error", "Failed to archive board"); }
  };

  const archiveCard = async (id: string) => {
    const target = cards.find(c => c.id === id) ?? null;
    try {
      await apiFetch(`/planner/cards/${id}`, { method: "PUT", body: JSON.stringify({ archived: true }) });
      setSelectedCard(null);
      if (activeBoard) await fetchBoardData(activeBoard.id);
      // Show undo bar for 5s (this acts as the success confirmation)
      if (target) {
        setUndoCard(target);
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        undoTimerRef.current = setTimeout(() => setUndoCard(null), 5000);
      } else {
        onToast("success", "Card archived");
      }
    }
    catch { onToast("error", "Failed to archive"); }
  };

  const restoreCard = async (id: string, forceRestoreList = false) => {
    const cardToRestore = archivedCards.find(c => c.id === id) ??
                          (undoCard?.id === id ? undoCard : null);
    if (cardToRestore) {
      const parentList = lists.find(l => l.id === cardToRestore.listId);
      const listIsArchived = !parentList;
      if (listIsArchived) {
        const archivedParent = archivedLists.find(l => l.id === cardToRestore.listId);
        if (archivedParent && !forceRestoreList) {
          // Show custom dialog — do NOT proceed yet
          setCardRestoreDialog({ cardId: id, cardTitle: cardToRestore.title, listTitle: archivedParent.title, listId: archivedParent.id });
          return;
        } else if (!archivedParent) {
          onToast("error", "The original list was deleted. Move the card to an active list first.");
          return;
        }
        if (forceRestoreList && archivedParent) {
          try {
            await apiFetch(`/planner/lists/${archivedParent.id}`, { method: "PUT", body: JSON.stringify({ archived: false }) });
            setArchivedLists(prev => prev.filter(l => l.id !== archivedParent.id));
          } catch { onToast("error", "Could not restore list"); return; }
        }
      }
    }
    try {
      await apiFetch(`/planner/cards/${id}`, { method: "PUT", body: JSON.stringify({ archived: false }) });
      setArchivedCards(prev => prev.filter(c => c.id !== id));
      setUndoCard(null);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      if (activeBoard) await fetchBoardData(activeBoard.id);
      onToast("success", "Card restored!");
    } catch { onToast("error", "Failed to restore"); }
  };

  const permanentDeleteCard = async (id: string) => {
    try {
      await apiFetch(`/planner/cards/${id}`, { method: "DELETE" });
      setArchivedCards(prev => prev.filter(c => c.id !== id));
      if (activeBoard) await fetchBoardData(activeBoard.id);
      setDeleteCardConfirm(null);
      onToast("success", "Card permanently deleted");
    } catch { onToast("error", "Failed to delete"); }
  };

  const fetchArchivedCards = async (boardId: string) => {
    try {
      const [cardsRes, listsRes] = await Promise.all([
        apiFetch(`/planner/boards/${boardId}/cards?archived=true`),
        apiFetch(`/planner/boards/${boardId}/lists?includeArchived=true`),
      ]);
      const cardsData = await cardsRes.json();
      const listsData = await listsRes.json();
      setArchivedCards(Array.isArray(cardsData) ? cardsData : []);
      setArchivedLists(Array.isArray(listsData) ? listsData.filter((l: PgList) => l.archived) : []);
    } catch { setArchivedCards([]); setArchivedLists([]); }
  };

  const fetchArchivedBoards = async () => {
    try {
      const r = await apiFetch("/planner/boards?archived=true");
      const data = await r.json();
      setArchivedBoards(Array.isArray(data) ? data : []);
    } catch { setArchivedBoards([]); }
  };

  const restoreList = async (listId: string) => {
    try {
      await apiFetch(`/planner/lists/${listId}`, { method: "PUT", body: JSON.stringify({ archived: false }) });
      setArchivedLists(prev => prev.filter(l => l.id !== listId));
      if (activeBoard) await fetchBoardData(activeBoard.id);
      onToast("success", "List restored!");
    } catch { onToast("error", "Failed to restore list"); }
  };

  const restoreBoard = async (id: string, silent = false) => {
    try {
      await apiFetch(`/planner/boards/${id}`, { method: "PUT", body: JSON.stringify({ archived: false }) });
      setArchivedBoards(prev => prev.filter(b => b.id !== id));
      await fetchBoards();
      if (!silent) onToast("success", "Board restored!");
    } catch { if (!silent) onToast("error", "Failed to restore board"); }
  };

  const deleteArchivedBoard = async (id: string) => {
    if (!confirm("Permanently delete this board and ALL its content? This cannot be undone.")) return;
    try {
      await apiFetch(`/planner/boards/${id}`, { method: "DELETE" });
      setArchivedBoards(prev => prev.filter(b => b.id !== id));
      setSelectedArchivedBoards(prev => { const n = new Set(prev); n.delete(id); return n; });
      onToast("success", "Board permanently deleted");
    } catch { onToast("error", "Failed to delete board"); }
  };

  const bulkDeleteArchivedBoards = async () => {
    const count = selectedArchivedBoards.size;
    if (count === 0) return;
    try {
      await Promise.all([...selectedArchivedBoards].map(id => apiFetch(`/planner/boards/${id}`, { method: "DELETE" })));
      setArchivedBoards(prev => prev.filter(b => !selectedArchivedBoards.has(b.id)));
      setSelectedArchivedBoards(new Set());
      setBulkDeleteConfirm(false);
      onToast("success", `${count} board${count > 1 ? "s" : ""} permanently deleted`);
    } catch { onToast("error", "Failed to delete some boards"); }
  };

  const deleteCard = async (id: string) => {
    if (!confirm("Permanently delete this card?")) return;
    try { await apiFetch(`/planner/cards/${id}`, { method: "DELETE" }); setSelectedCard(null); if (activeBoard) await fetchBoardData(activeBoard.id); onToast("success", "Deleted"); }
    catch { onToast("error", "Failed"); }
  };

  const onCardSaved = (updated: Card) => setCards(prev => prev.map(c => c.id === updated.id ? updated : c));

  // ── Board Home ─────────────────────────────────────────────────────────
  // Board search state
  const [boardSearch, setBoardSearch] = useState("");
  const filteredBoards = boards.filter(b =>
    !boardSearch || b.title.toLowerCase().includes(boardSearch.toLowerCase())
  );

  if (!activeBoard) return (
    <div>
      {/* Header row: title left, search right */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow">
            <LayoutGrid size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Boards</h1>
            <p className="text-xs text-gray-400">Planner workspace</p>
          </div>
        </div>
        {/* Select to archive + Search */}
        <div className="flex items-center gap-2">
          {isFullAccess && !bulkArchiveMode && (
            <button onClick={() => { setBulkArchiveMode(true); setSelectedBulkBoards(new Set()); }}
              className="flex items-center gap-1.5 px-3 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/30 transition-colors font-semibold whitespace-nowrap">
              <Layers size={13} /> Select to archive…
            </button>
          )}
          <div className="relative w-full sm:w-56">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={boardSearch} onChange={e => setBoardSearch(e.target.value)}
              placeholder="Search boards"
              className="w-full bg-[#22272b] border border-white/10 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
            />
          </div>
        </div>
      </div>

      {/* Create board form */}
      {showNewBoard && (
        <div className="mb-6 bg-[#22272b] rounded-2xl border border-white/10 p-4 space-y-3 max-w-sm">
          <input value={newBoardTitle} onChange={e => setNewBoardTitle(e.target.value)} onKeyDown={e => e.key === "Enter" && createBoard()} autoFocus placeholder="Board title…"
            className="w-full bg-[#1d2125] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
          <div className="flex flex-wrap gap-2">
            {BOARD_COLORS.map(bc => (
              <button key={bc} onClick={() => setNewBoardColor(bc)}
                style={{ background: bc }}
                className={`w-8 h-8 rounded-lg transition-all ${newBoardColor === bc ? "ring-2 ring-white scale-110" : ""}`} />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowNewBoard(false)} className="flex-1 py-2 border border-white/10 text-gray-300 rounded-lg text-sm hover:bg-white/5">Cancel</button>
            <button onClick={createBoard} className="flex-1 py-2 bg-[#579dff] hover:bg-[#4c8ee6] text-[#1d2125] rounded-lg text-sm font-bold">Create</button>
          </div>
        </div>
      )}

      {/* ── Single board archive confirmation dialog ── */}
      {archiveBoardConfirm && (() => {
        const confirmId = archiveBoardConfirm; // narrow null away
        const b = boards.find(x => x.id === confirmId);
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70" onClick={() => setArchiveBoardConfirm(null)}>
            <div className="bg-[#22272b] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl mx-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0 border border-amber-500/20">
                  <Archive size={16} className="text-amber-400" />
                </div>
                <h3 className="text-base font-bold text-white leading-snug">Archive "{b?.title}"?</h3>
              </div>
              <p className="text-sm text-gray-400 mb-5 leading-relaxed">
                This board and all its lists and cards will be archived. You can restore it anytime from <strong className="text-gray-300">View closed boards</strong> below. Boards that remain closed for <strong className="text-gray-300">30 days</strong> are permanently deleted.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setArchiveBoardConfirm(null)} className="flex-1 py-2.5 border border-white/10 text-gray-300 rounded-xl text-sm hover:bg-white/5 transition-colors">
                  Cancel, keep it
                </button>
                <button
                  onClick={() => { archiveBoard(confirmId); setArchiveBoardConfirm(null); setBoardMenuId(null); }}
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold rounded-xl transition-colors"
                >
                  Yes, archive board
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Bulk archive confirmation dialog ── */}
      {bulkArchiveConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70" onClick={() => setBulkArchiveConfirm(false)}>
          <div className="bg-[#22272b] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0 border border-amber-500/20">
                <Archive size={16} className="text-amber-400" />
              </div>
              <h3 className="text-base font-bold text-white leading-snug">
                Archive {selectedBulkBoards.size} board{selectedBulkBoards.size > 1 ? 's' : ''}?
              </h3>
            </div>
            <p className="text-sm text-gray-400 mb-5 leading-relaxed">
              The selected board{selectedBulkBoards.size > 1 ? 's' : ''} and all {selectedBulkBoards.size > 1 ? 'their' : 'its'} lists and cards will be archived. You can restore {selectedBulkBoards.size > 1 ? 'them' : 'it'} anytime from <strong className="text-gray-300">View closed boards</strong>. Boards that remain closed for <strong className="text-gray-300">30 days</strong> are permanently deleted.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setBulkArchiveConfirm(false)} className="flex-1 py-2.5 border border-white/10 text-gray-300 rounded-xl text-sm hover:bg-white/5 transition-colors">Cancel</button>
              <button
                onClick={async () => {
                  const ids = Array.from(selectedBulkBoards) as string[];
                  const count = ids.length;
                  for (const id of ids) { await archiveBoard(id, true); }
                  setSelectedBulkBoards(new Set()); setBulkArchiveMode(false); setBulkArchiveConfirm(false);
                  onToast("success", `${count} board${count > 1 ? 's' : ''} archived`);
                }}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold rounded-xl transition-colors"
              >
                Archive {selectedBulkBoards.size > 1 ? 'all' : 'it'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk archive mode bar ── */}
      {isFullAccess && bulkArchiveMode && (
        <div className="mb-4 flex items-center gap-3 flex-wrap bg-[#22272b] border border-white/10 rounded-xl px-4 py-3">
          <Archive size={14} className="text-amber-400 shrink-0" />
          <span className="text-sm text-gray-300 font-medium flex-1">
            {selectedBulkBoards.size === 0 ? 'Click boards to select them for archiving' : `${selectedBulkBoards.size} board${selectedBulkBoards.size > 1 ? 's' : ''} selected`}
          </span>
          {selectedBulkBoards.size > 0 && (
            <button
              onClick={() => setBulkArchiveConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold transition-colors"
            >
              <Archive size={11} /> Archive {selectedBulkBoards.size}
            </button>
          )}
          <button
            onClick={() => { setBulkArchiveMode(false); setSelectedBulkBoards(new Set()); }}
            className="text-xs text-gray-500 hover:text-white px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Board grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3" onClick={() => setBoardMenuId(null)}>
        {/* Create new board tile — full access only */}
        {isFullAccess && !bulkArchiveMode && (
          <button onClick={() => setShowNewBoard(true)}
            className="aspect-[5/3] rounded-xl flex flex-col items-center justify-center gap-1.5 bg-white/10 hover:bg-white/15 transition-all text-gray-400 hover:text-gray-200">
            <Plus size={18} />
            <span className="text-sm font-medium">Create new board</span>
          </button>
        )}

        {boardsLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[5/3] rounded-xl bg-white/5 animate-pulse" />
            ))
          : filteredBoards.map(b => {
              const isSelectedBulk = selectedBulkBoards.has(b.id);
              if (bulkArchiveMode) {
                // Bulk selection tile
                return (
                  <button key={b.id}
                    onClick={e => { e.stopPropagation(); setSelectedBulkBoards(prev => { const n = new Set(prev); n.has(b.id) ? n.delete(b.id) : n.add(b.id); return n; }); }}
                    style={{ background: resolveBg(b.color) }}
                    className={`aspect-[5/3] rounded-xl flex flex-col justify-end p-3 transition-all shadow-md text-left relative overflow-hidden select-none ${isSelectedBulk ? 'ring-2 ring-white brightness-100' : 'brightness-60 hover:brightness-75'}`}>
                    <div className={`absolute top-2 right-2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelectedBulk ? 'bg-white border-white' : 'border-white/60 bg-black/20'}`}>
                      {isSelectedBulk && <Check size={11} className="text-gray-900" />}
                    </div>
                    <span className="relative font-bold text-white text-sm drop-shadow-md leading-tight">{b.title}</span>
                  </button>
                );
              }
              // Normal mode — board tile with hover 3-dot menu
              return (
                <div key={b.id} className="relative group aspect-[5/3]">
                  <button
                    onClick={() => openBoard(b)}
                    style={{ background: resolveBg(b.color) }}
                    className="w-full h-full rounded-xl flex flex-col justify-end p-3 hover:brightness-110 transition-all shadow-md text-left relative overflow-hidden">
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-all rounded-xl pointer-events-none" />
                    <span className="relative font-bold text-white text-sm drop-shadow-md leading-tight">{b.title}</span>
                  </button>
                  {/* 3-dot menu — appears on hover, full access only */}
                  {isFullAccess && (
                    <div className="absolute top-1.5 right-1.5" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setBoardMenuId(boardMenuId === b.id ? null : b.id)}
                        className="p-1 rounded-md bg-black/30 hover:bg-black/55 text-white/80 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                        title="Board options"
                      >
                        <MoreHorizontal size={13} />
                      </button>
                      {boardMenuId === b.id && (
                        <div className="absolute right-0 top-full mt-1 bg-[#2c333a] border border-white/10 rounded-xl shadow-xl z-40 min-w-[170px] py-1.5 overflow-hidden">
                          <button onClick={() => { openBoard(b); setBoardMenuId(null); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-gray-200 hover:bg-white/8 hover:text-white transition-colors">
                            <ArrowRight size={13} className="text-gray-500" /> Open board
                          </button>
                          <div className="mx-2 my-1 border-t border-white/5" />
                          <button onClick={() => { setArchiveBoardConfirm(b.id); setBoardMenuId(null); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-amber-400 hover:bg-amber-500/10 transition-colors">
                            <Archive size={13} /> Archive board…
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
        }
      </div>

      {filteredBoards.length === 0 && boardSearch && (
        <p className="text-gray-500 text-sm text-center mt-8">No boards match "{boardSearch}"</p>
      )}

      {/* Archived Boards — full access only */}
      {isFullAccess && <div className="mt-10">

        {/* ── Bulk Restore confirm modal ── */}
        {bulkRestoreConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70" onClick={() => setBulkRestoreConfirm(false)}>
            <div className="bg-[#22272b] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl mx-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0 border border-emerald-500/20">
                  <RotateCcw size={16} className="text-emerald-400" />
                </div>
                <h3 className="text-base font-bold text-white leading-snug">Restore {selectedArchivedBoards.size} board{selectedArchivedBoards.size > 1 ? 's' : ''}?</h3>
              </div>
              <p className="text-sm text-gray-400 mb-5 leading-relaxed">
                The selected board{selectedArchivedBoards.size > 1 ? 's' : ''} will be moved back to your active workspace and become fully accessible again.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setBulkRestoreConfirm(false)} className="flex-1 py-2.5 border border-white/10 text-gray-300 rounded-xl text-sm hover:bg-white/5 transition-colors">Cancel</button>
                <button
                  onClick={async () => {
                    const ids = Array.from(selectedArchivedBoards) as string[];
                    const count = ids.length;
                    for (const id of ids) { await restoreBoard(id, true); }
                    setSelectedArchivedBoards(new Set());
                    setBulkRestoreConfirm(false);
                    onToast("success", `${count} board${count > 1 ? 's' : ''} restored`);
                  }}
                  className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-bold rounded-xl transition-colors">
                  Yes, restore {selectedArchivedBoards.size > 1 ? 'all' : 'it'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Bulk Delete confirm modal ── */}
        {bulkDeleteConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70" onClick={() => setBulkDeleteConfirm(false)}>
            <div className="bg-[#22272b] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl mx-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0 border border-red-500/20">
                  <Trash2 size={16} className="text-red-400" />
                </div>
                <h3 className="text-base font-bold text-white leading-snug">Delete {selectedArchivedBoards.size} board{selectedArchivedBoards.size > 1 ? 's' : ''} permanently?</h3>
              </div>
              <p className="text-sm text-gray-400 mb-5 leading-relaxed">
                This will <strong className="text-gray-300">permanently delete</strong> the selected board{selectedArchivedBoards.size > 1 ? 's' : ''} and all {selectedArchivedBoards.size > 1 ? 'their' : 'its'} lists and cards. <strong className="text-gray-300">This cannot be undone.</strong>
              </p>
              <div className="flex gap-2">
                <button onClick={() => setBulkDeleteConfirm(false)} className="flex-1 py-2.5 border border-white/10 text-gray-300 rounded-xl text-sm hover:bg-white/5 transition-colors">Cancel</button>
                <button
                  onClick={bulkDeleteArchivedBoards}
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-400 text-white text-sm font-bold rounded-xl transition-colors">
                  Yes, delete forever
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Row 1: Hide/View closed boards ── */}
        <div className="flex items-center">
          <button onClick={() => { setShowArchivedBoards(p => !p); if (!showArchivedBoards) fetchArchivedBoards(); }}
            className="flex items-center gap-2 px-3 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/30 transition-colors font-semibold">
            <Archive size={13} />
            {showArchivedBoards ? "Hide closed boards" : "View closed boards"}
          </button>
        </div>

        {showArchivedBoards && (
          <>
            {/* ── Row 2: Selection bar — full width ── */}
            {selectedArchivedBoards.size > 0 && (
              <div className="mt-3 w-full flex items-center gap-3 bg-[#22272b] border border-white/10 rounded-xl px-4 py-2.5">
                <RotateCcw size={13} className="text-emerald-400 shrink-0" />
                <span className="text-sm text-gray-300 font-medium flex-1">
                  {selectedArchivedBoards.size} board{selectedArchivedBoards.size > 1 ? 's' : ''} selected
                </span>
                <button onClick={() => setBulkRestoreConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold transition-colors whitespace-nowrap">
                  <RotateCcw size={11} /> Restore {selectedArchivedBoards.size}
                </button>
                <button onClick={() => setBulkDeleteConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 rounded-lg text-xs font-bold transition-colors whitespace-nowrap">
                  <Trash2 size={11} /> Delete {selectedArchivedBoards.size}
                </button>
                <button onClick={() => setSelectedArchivedBoards(new Set())}
                  className="text-xs text-gray-500 hover:text-white px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
                  Cancel
                </button>
              </div>
            )}

            {/* ── Row 3: 30-day warning — full width, single line ── */}
            <div className="mt-3 w-full flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <AlertTriangle size={13} className="text-amber-400 shrink-0" />
              <p className="text-xs text-amber-400/80 whitespace-nowrap overflow-hidden text-ellipsis">Archived boards that remain closed for <strong>30 days</strong> will be automatically and permanently deleted along with all their lists and cards.</p>
            </div>
            {archivedBoards.length === 0 ? (
              <p className="text-xs text-gray-600 ml-1 mt-3">No archived boards.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mt-4">
                {archivedBoards.map(b => {
                   const isSelected = selectedArchivedBoards.has(b.id);
                   const toggleSelect = () => setSelectedArchivedBoards(prev => {
                     const next = new Set(prev);
                     if (next.has(b.id)) next.delete(b.id); else next.add(b.id);
                     return next;
                   });
                   return (
                     <div key={b.id}
                       onClick={toggleSelect}
                       style={{ background: resolveBg(b.color) }}
                       className={`aspect-[5/3] rounded-xl flex flex-col justify-between p-2.5 shadow-md relative overflow-hidden transition-all cursor-pointer select-none ${isSelected ? "ring-2 ring-white brightness-100 opacity-100" : "opacity-60 hover:opacity-80 hover:brightness-90"}`}>
                       {/* Top row: circle indicator + delete */}
                       <div className="flex items-start justify-between">
                         <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 mt-0.5 ${isSelected ? 'bg-white border-white' : 'border-white/50 bg-black/20'}`}>
                           {isSelected && <Check size={11} className="text-gray-900" />}
                         </div>
                         <button onClick={e => { e.stopPropagation(); deleteArchivedBoard(b.id); }} title="Delete permanently"
                           className="p-1 text-white/50 hover:text-red-300 hover:bg-black/20 rounded transition-colors">
                           <Trash2 size={11} />
                         </button>
                       </div>
                       {/* Bottom: title + restore */}
                       <div>
                         <span className="font-bold text-white text-sm drop-shadow leading-tight block mb-1.5 truncate">{b.title}</span>
                         <button onClick={e => { e.stopPropagation(); restoreBoard(b.id); }}
                           className="flex items-center gap-1 bg-white/20 hover:bg-white/40 text-white text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors">
                           <RotateCcw size={10} /> Restore
                         </button>
                       </div>
                     </div>
                   );
                 })}
              </div>
            )}
          </>
        )}
      </div>}
    </div>
  );

  // ── Board View ─────────────────────────────────────────────────────────
  const boardCards = cards.filter(c => c.boardId === activeBoard.id && !c.archived);

  return (
    <div className="flex flex-col -mx-4 -mb-4" style={{ minHeight: "calc(100vh - 120px)" }}>
      {/* Board header */}
      <div className="flex items-center gap-2 px-4 py-2.5 shrink-0" style={{ background: resolveBg(activeBoard.color) }}>
        <button onClick={() => { setActiveBoard(null); setLists([]); setCards([]); }} className="p-1.5 text-white/70 hover:text-white hover:bg-white/20 rounded transition-colors"><ChevronLeft size={16} /></button>
        <h2 className="font-bold text-white text-base flex-1">{activeBoard.title}</h2>
        <span
          title={`${boardCards.length} cards used · ${500 - boardCards.length} remaining`}
          className={`text-xs px-3 py-1.5 rounded-lg font-semibold ${boardCards.length >= 450 ? 'bg-amber-500/20 text-amber-300' : 'bg-white/20 text-white/70'}`}>
          {boardCards.length}<span className="hidden sm:inline"> / 500 cards</span><span className="sm:hidden">/500</span>
        </span>
        {isFullAccess && <button onClick={() => { setShowArchived(true); if (activeBoard) fetchArchivedCards(activeBoard.id); }} title="Archived" className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold rounded-lg transition-colors"><Archive size={12} /><span className="hidden sm:inline">Archived</span></button>}
        {isFullAccess && <button onClick={() => setShowSettings(true)} title="Board settings" className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold rounded-lg transition-colors"><Settings size={12} /><span className="hidden sm:inline">Board settings</span></button>}
      </div>

      {/* Kanban area */}
      <div className="flex-1 overflow-hidden" style={{ background: resolveBg(activeBoard.color), backgroundSize: "cover" }}>
        {loading ? (
          <div className="flex items-center justify-center h-full"><div className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="flex gap-3 overflow-x-auto h-full px-3 py-4 items-start" onClick={() => setListMenuId(null)}>
            {lists.map(list => {
              const listCards = boardCards.filter(c => c.listId === list.id);
              return (
                <div key={list.id} className="flex-shrink-0 w-[300px] flex flex-col rounded-xl self-start" style={{ backgroundColor: "#101204ee" }}>
                  {/* List header — Trello style: ALL CAPS, small */}
                  <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5 shrink-0">
                    <span className="font-bold text-white text-[13px] flex-1 leading-tight tracking-wide uppercase">{list.title}</span>
                    {/* Kebab menu — full access only */}
                    {isFullAccess && (
                      <div className="relative" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setListMenuId(listMenuId === list.id ? null : list.id)}
                          className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors">
                          <MoreHorizontal size={15} />
                        </button>
                        {listMenuId === list.id && (
                          <div className="absolute right-0 top-full mt-1 bg-[#2c333a] border border-white/10 rounded-xl shadow-xl z-30 min-w-[160px] py-1.5">
                            <p className="text-center text-xs text-gray-400 font-semibold py-1.5 border-b border-white/5 mb-1">{list.title}</p>
                            <button onClick={() => archiveList(list.id)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-white/5"><Archive size={12} /> Archive this list</button>
                            <button onClick={() => deleteList(list.id)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10"><Trash2 size={12} /> Delete list</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Cards list */}
                  <div className="px-1.5 space-y-2 pb-1">
                    {listCards.map(card => {
                      const totalItems = card.checklists.reduce((s, cl) => s + cl.items.length, 0);
                      const doneItems = card.checklists.reduce((s, cl) => s + cl.items.filter(i => i.done).length, 0);
                      const isOverdue = card.dueDate && new Date(card.dueDate) < new Date();
                      return (
                        <div key={card.id} onClick={() => setSelectedCard(card)}
                          className="rounded-lg cursor-pointer transition-all duration-150 group shadow-sm relative hover:brightness-125"
                          style={{ backgroundColor: "#22272b" }}>
                          {card.labels.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
                              {card.labels.map(l => (
                                <span key={l.id} style={{ backgroundColor: l.color }}
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold text-white leading-none whitespace-nowrap max-w-[120px] truncate">
                                  {l.name || ''}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="px-3 pt-2.5 pb-3">
                            <p className="text-[15px] text-white leading-snug font-medium">{card.title}</p>
                            {/* Meta row */}
                            {(isOverdue || card.dueDate || card.description || totalItems > 0) && (
                              <div className="flex items-center justify-between mt-2.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {isOverdue && (
                                    <span className="flex items-center gap-1 text-[12px] font-semibold text-white bg-red-500 px-1.5 py-0.5 rounded">
                                      <Calendar size={10} />{new Date(card.dueDate! + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric", year: "2-digit" })}
                                    </span>
                                  )}
                                  {!isOverdue && card.dueDate && (
                                    <span className="flex items-center gap-1 text-[12px] text-gray-400">
                                      <Calendar size={11} />{new Date(card.dueDate + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })}
                                    </span>
                                  )}
                                  {card.description && <AlignLeft size={12} className="text-gray-500" />}
                                  {totalItems > 0 && (
                                    <span className={`flex items-center gap-0.5 text-[12px] font-medium px-1.5 py-0.5 rounded ${
                                      doneItems === totalItems ? "bg-green-600/30 text-green-400" : "text-gray-400"
                                    }`}>
                                      <CheckSquare size={11} />{doneItems}/{totalItems}
                                    </span>
                                  )}
                                </div>
                                {/* Member avatars right-aligned */}
                                {card.members.length > 0 && (
                                  <div className="flex -space-x-1.5">
                                    {card.members.slice(0, 3).map((m, i) => {
                                      const mem = allMembers.find(x => x.name === m);
                                      const mPhoto = mem?.photo || mem?.photoURL || "";
                                      return <div key={i}><Avatar name={m} photo={mPhoto} size={28} /></div>;
                                    })}
                                    {card.members.length > 3 && (
                                      <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-[10px] text-white font-bold border border-[#22272b]">+{card.members.length - 3}</div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Add card inline form */}
                    {addingCard === list.id && (
                      <div className="rounded-lg p-2 space-y-2" style={{ backgroundColor: "#22272b" }}>
                        <input ref={cardInputRef} value={newCardTitle} onChange={e => setNewCardTitle(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") createCard(list.id); if (e.key === "Escape") { setAddingCard(null); setNewCardTitle(""); } }}
                          autoFocus placeholder="Enter a title for this card…"
                          className="w-full bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none resize-none" />
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => createCard(list.id)} className="px-3 py-1.5 bg-[#579dff] hover:bg-[#4c8ee6] text-[#1d2125] text-xs font-bold rounded transition-colors">Add card</button>
                          <button onClick={() => { setAddingCard(null); setNewCardTitle(""); }} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"><X size={15} /></button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer: Add a card — full access only */}
                  {isFullAccess && addingCard !== list.id && (
                    <div className="px-1.5 py-1.5 shrink-0">
                      <button onClick={() => { setAddingCard(list.id); setNewCardTitle(""); }}
                        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-[13px]">
                        <Plus size={14} /> Add a card
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add a list — full access only */}
            {isFullAccess && (
              <div className="flex-shrink-0 w-[300px]">
                {addingList ? (
                  <div className="rounded-xl p-2 space-y-2" style={{ backgroundColor: "#101204ee" }}>
                    <input value={newListTitle} onChange={e => setNewListTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") createList(); if (e.key === "Escape") { setAddingList(false); setNewListTitle(""); } }}
                      autoFocus placeholder="Enter list name…"
                      className="w-full bg-white/10 border border-blue-500/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none" />
                    <div className="flex items-center gap-1.5">
                      <button onClick={createList} className="px-3 py-1.5 bg-[#579dff] hover:bg-[#4c8ee6] text-[#1d2125] text-xs font-bold rounded transition-colors">Add list</button>
                      <button onClick={() => { setAddingList(false); setNewListTitle(""); }} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"><X size={15} /></button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setAddingList(true)}
                    className="w-fit flex items-center gap-1.5 px-3 py-2.5 bg-white/15 hover:bg-white/25 text-white text-sm font-medium rounded-xl transition-colors">
                    <Plus size={14} /> Add another list
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {selectedCard && <CardModal card={selectedCard} lists={lists} boards={boards} allMembers={allMembers} currentUser={currentUser} customFieldDefs={activeBoard.customFieldDefs ?? []} onClose={() => setSelectedCard(null)} onSave={c => { onCardSaved(c); setSelectedCard(c); }} onDelete={deleteCard} onArchive={archiveCard} onMove={() => { setMoveCard(selectedCard); setSelectedCard(null); }} onToast={onToast} isFullAccess={isFullAccess} />}
      {moveCard && <MoveModal card={moveCard} boards={boards} currentUser={currentUser} allMembers={allMembers} onClose={() => setMoveCard(null)} onMoved={async () => { setMoveCard(null); if (activeBoard) await fetchBoardData(activeBoard.id); }} onToast={onToast} />}
      {showSettings && <BoardSettings board={activeBoard} onClose={() => setShowSettings(false)} onSaved={b => { setActiveBoard(b); setBoards(prev => prev.map(x => x.id === b.id ? b : x)); setShowSettings(false); }} onArchive={archiveBoard} onToast={onToast} />}
      {/* Archived cards panel */}
      {showArchived && (
        <div className="fixed inset-0 z-50 flex" onClick={e => e.target === e.currentTarget && setShowArchived(false)}>
          <div className="ml-auto w-full max-w-sm bg-[#1d2125] h-full border-l border-white/10 flex flex-col shadow-2xl relative">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2"><Archive size={14} className="text-amber-400" /><h3 className="text-sm font-bold text-white">Archived Lists / Cards</h3></div>
              <button onClick={() => setShowArchived(false)} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded"><X size={15} /></button>
            </div>
            {/* ── Delete card confirmation modal ── */}
            {deleteCardConfirm && (
              <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/70 rounded-l-none" onClick={() => setDeleteCardConfirm(null)}>
                <div className="bg-[#22272b] border border-white/10 rounded-2xl p-5 w-[calc(100%-2rem)] shadow-2xl mx-4" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0 border border-red-500/20">
                      <Trash2 size={16} className="text-red-400" />
                    </div>
                    <h3 className="text-sm font-bold text-white leading-snug">Delete this card permanently?</h3>
                  </div>
                  <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                    This card and all its content will be <strong className="text-gray-300">permanently deleted</strong>. This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setDeleteCardConfirm(null)} className="flex-1 py-2 border border-white/10 text-gray-300 rounded-xl text-xs hover:bg-white/5 transition-colors">Cancel</button>
                    <button onClick={() => permanentDeleteCard(deleteCardConfirm)} className="flex-1 py-2 bg-red-500 hover:bg-red-400 text-white text-xs font-bold rounded-xl transition-colors">Yes, delete forever</button>
                  </div>
                </div>
              </div>
            )}
            {archivedLists.length === 0 && archivedCards.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center px-6">
                <Archive size={32} className="text-gray-600" />
                <p className="text-sm text-gray-500">No archived items</p>
                <p className="text-xs text-gray-600">Lists and cards you archive will appear here</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {/* ── Archived Lists ── */}
                {archivedLists.length > 0 && (
                  <div className="p-3 border-b border-white/10">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 px-1 mb-2">
                      Lists ({archivedLists.length})
                    </p>
                    <div className="space-y-2">
                      {archivedLists.map(al => {
                        const cardCount = archivedCards.filter(c => c.listId === al.id).length;
                        return (
                          <div key={al.id} className="bg-[#22272b] rounded-xl px-3 py-2.5 border border-white/5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Layers size={12} className="text-gray-500 shrink-0" />
                              <span className="text-sm text-white font-medium truncate">{al.title}</span>
                              {cardCount > 0 && (
                                <span className="text-[10px] text-gray-500 shrink-0">{cardCount} card{cardCount > 1 ? "s" : ""}</span>
                              )}
                            </div>
                            <button onClick={() => restoreList(al.id)}
                              className="shrink-0 flex items-center gap-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors">
                              <RotateCcw size={10} /> Restore
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* ── Archived Cards ── */}
                {archivedCards.length > 0 && (
                  <div className="p-3 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 px-1 mb-2">
                      Cards ({archivedCards.length})
                    </p>
                    {archivedCards.map(ac => {
                      const activeListTitle  = lists.find(l => l.id === ac.listId)?.title;
                      const archivedListEntry = archivedLists.find(l => l.id === ac.listId);
                      const listIsArchived   = !activeListTitle && !!archivedListEntry;
                      const listTitle        = activeListTitle ?? archivedListEntry?.title ?? "List deleted";
                      return (
                        <div key={ac.id} className="bg-[#22272b] rounded-xl p-3 border border-white/5">
                          {/* List badge */}
                          <div className="mb-1">
                            {listIsArchived ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                                <AlertTriangle size={9} /> {listTitle} · archived
                              </span>
                            ) : (
                              <span className="text-[10px] text-gray-500">{listTitle}</span>
                            )}
                          </div>
                          <p className="text-sm text-white font-medium mb-2.5 leading-snug">{ac.title}</p>
                          {listIsArchived && (
                            <p className="text-[11px] text-amber-400/70 mb-2 leading-relaxed">Restore the list above first, or tap below to restore both together.</p>
                          )}
                          <div className="flex gap-2">
                            <button onClick={() => restoreCard(ac.id)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 text-xs font-semibold rounded-lg transition-colors">
                              <RotateCcw size={11} /> {listIsArchived ? "Restore Both" : "Restore"}
                            </button>
                            <button onClick={() => setDeleteCardConfirm(ac.id)}
                              className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold rounded-lg transition-colors">
                              <Trash2 size={11} /> Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Undo archive bar */}
      {undoCard && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-[#22272b] border border-white/10 rounded-2xl px-4 py-3 shadow-2xl">
          <Archive size={14} className="text-amber-400 shrink-0" />
          <span className="text-sm text-gray-200"><span className="font-semibold text-white">{undoCard.title}</span> archived</span>
          <button onClick={() => restoreCard(undoCard.id)}
            className="px-3 py-1.5 bg-[#579dff] hover:bg-[#4c8ee6] text-[#1d2125] text-xs font-bold rounded-lg transition-colors">
            Undo
          </button>
          <button onClick={() => setUndoCard(null)} className="text-gray-500 hover:text-white"><X size={13} /></button>
        </div>
      )}
      {/* Card restore blocked dialog — list is also archived */}
      {cardRestoreDialog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm bg-[#22272b] rounded-2xl border border-white/10 shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-amber-400" />
              </div>
              <div>
                <p className="font-bold text-white text-sm">List is archived</p>
                <p className="text-xs text-gray-400 mt-0.5">This card can't be restored on its own</p>
              </div>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">
              The card <strong className="text-white">"{cardRestoreDialog.cardTitle}"</strong> belongs to list{" "}
              <strong className="text-amber-400">"{cardRestoreDialog.listTitle}"</strong> which is also archived.
            </p>
            <div className="space-y-2 pt-1">
              <button
                onClick={async () => { const d = cardRestoreDialog; setCardRestoreDialog(null); await restoreCard(d.cardId, true); }}
                className="w-full py-2.5 bg-[#579dff] hover:bg-[#4c8ee6] text-[#1d2125] text-sm font-bold rounded-xl transition-colors">
                Restore list + card together
              </button>
              <button
                onClick={() => { const d = cardRestoreDialog; setCardRestoreDialog(null); restoreList(d.listId); }}
                className="w-full py-2 text-xs text-gray-300 hover:text-white border border-white/10 rounded-xl transition-colors">
                Just restore the list <span className="text-gray-500">(card stays archived)</span>
              </button>
              <button onClick={() => setCardRestoreDialog(null)}
                className="w-full py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
