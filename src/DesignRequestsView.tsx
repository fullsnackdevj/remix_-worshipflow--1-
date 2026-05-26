import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Palette, BookOpen, CalendarDays, User2, Clock, ChevronDown, ChevronUp, ChevronsUpDown,
  RefreshCw, Loader2, CornerUpLeft, FileText, Lightbulb, Heart, BookMarked,
  PenLine, CheckCircle2, InboxIcon, AlertTriangle, Copy, Check, Info, X,
  Brush, Sparkles, CheckCheck, Link2, ExternalLink, Download, ScanText,
  LayoutList, LayoutGrid, Trash2, Square, CheckSquare,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface KeyPoint {
  id: string;
  heading: string;
  scriptures: Array<{ id: string; text: string }>;
  body: string;
}
interface CollectedVerse { ref: string; text: string; translation: string; }
interface SermonDraft {
  id: string;
  title: string;
  subtitle?: string;
  scriptures: Array<{ id: string; text: string }>;
  mainVerse?: string;
  introduction?: string;
  mainPassage?: string;
  keyPointsTitle?: string;
  keyPoints: KeyPoint[];
  freeNotes?: string;
  application?: string;
  closingPrayer?: string;
  collectedVerses?: CollectedVerse[];
  authorName?: string;
  authorId?: string;
  scheduledDate?: string;
  serviceType?: string;
  submittedAt?: string;
  submittedByName?: string;
  submissionVersion?: number;
  status: "submitted" | "draft";
  // ── Design volunteer fields ──────────────────────────────────
  designStatus?: "pending" | "in_design" | "design_done";
  designerId?: string;
  designerName?: string;
  designerPhoto?: string;
  designClaimedAt?: string;
  designCompletedAt?: string;
  // ── External share-link submission ───────────────────────────
  isExternal?: boolean;
  externalNotes?: string;
  externalLink?: string;
  externalFileUrl?: string;
  externalFileName?: string;
  externalFileType?: string;
}

interface Props {
  currentUserId: string;
  currentUserName: string;
  currentUserPhoto?: string;
  isAdmin: boolean;
  onToast?: (type: "success" | "error" | "info", message: string) => void;
  pendingDraftId?: string | null;
  onPendingDraftHandled?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(iso?: string): string {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────
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
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: "var(--wf-bg3)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 24px 64px rgba(0,0,0,0.8)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Icon strip */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <div className="flex items-center justify-center rounded-xl shrink-0"
            style={{ width: 40, height: 40, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)", marginTop: 1 }}>
            <AlertTriangle size={18} style={{ color: "#fbbf24" }} />
          </div>
          <div>
            <p className="font-bold text-white" style={{ fontSize: 15, letterSpacing: "-0.01em" }}>{title}</p>
            <p className="mt-1" style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>{message}</p>
            {detail && <p className="mt-1" style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{detail}</p>}
          </div>
        </div>
        {/* Actions */}
        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-xl font-semibold transition-all active:scale-95"
            style={{ height: 42, fontSize: 13, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)", cursor: loading ? "not-allowed" : "pointer" }}
          >Cancel</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-xl font-semibold transition-all active:scale-95 flex items-center justify-center gap-2"
            style={{ height: 42, fontSize: 13, background: confirmColor, border: "none", color: "#fff", opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────
function Section({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-indigo-400/70 flex">{icon}</span>
        <span className="text-xs font-bold text-white/40 uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-sm text-white/75 leading-relaxed">{children}</div>
    </div>
  );
}

// ── Build plain-text copy of the full sermon ────────────────────────────────
function buildCopyText(item: SermonDraft): string {
  const lines: string[] = [];
  const sep = (label: string) => `\n${"-".repeat(40)}\n${label.toUpperCase()}\n${"-".repeat(40)}`;

  lines.push(`${item.title || "Untitled Sermon"}`);
  if (item.subtitle) lines.push(item.subtitle);
  if (item.scheduledDate) lines.push(`Date: ${new Date(item.scheduledDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`);
  if (item.serviceType) lines.push(`Service: ${item.serviceType}`);
  if (item.submittedByName) lines.push(`Preacher: ${item.submittedByName}`);

  const scriptures = item.scriptures?.filter(s => s.text) ?? [];
  if (scriptures.length > 0) {
    lines.push(sep("Main Scripture(s)"));
    scriptures.forEach(s => lines.push(`• ${s.text}`));
  } else if (item.mainVerse) {
    lines.push(sep("Main Scripture"));
    lines.push(item.mainVerse);
  }

  if (item.introduction) { lines.push(sep("Introduction")); lines.push(item.introduction); }
  if (item.mainPassage)  { lines.push(sep("Main Passage / Outline")); lines.push(item.mainPassage); }

  const kps = item.keyPoints?.filter(k => k.heading || k.body) ?? [];
  if (kps.length > 0) {
    lines.push(sep(item.keyPointsTitle || "Key Points"));
    kps.forEach((kp, i) => {
      if (kp.heading) lines.push(`${i + 1}. ${kp.heading}`);
      const kpScriptures = kp.scriptures?.filter(s => s.text).map(s => s.text).join(" | ");
      if (kpScriptures) lines.push(`   Scripture: ${kpScriptures}`);
      if (kp.body) lines.push(`   ${kp.body}`);
      lines.push("");
    });
  }

  if (item.freeNotes)     { lines.push(sep("Notes")); lines.push(item.freeNotes); }
  if (item.application)  { lines.push(sep("Application")); lines.push(item.application); }
  if (item.closingPrayer){ lines.push(sep("Closing Prayer")); lines.push(item.closingPrayer); }

  const verses = item.collectedVerses?.filter(v => v.ref && v.text) ?? [];
  if (verses.length > 0) {
    lines.push(sep(`Collected Verses (${verses.length})`));
    verses.forEach(v => lines.push(`[${v.ref} ${v.translation}] ${v.text}`));
  }

  return lines.join("\n").trim();
}

// ── Design Status Badge ───────────────────────────────────────────────────────
function DesignStatusBadge({ item }: { item: SermonDraft }) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (item.designStatus === "design_done") {
    return (
      <div className="flex items-center gap-1.5 rounded-full px-3 py-1 bg-emerald-500/12 border border-emerald-400/30">
        <CheckCheck size={12} className="text-emerald-400" />
        <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">Slides Done</span>
        {item.designerName && (
          <span className="text-xs text-emerald-400/65 font-medium">· {item.designerName.split(" ")[0]}</span>
        )}
      </div>
    );
  }

  if (item.designStatus === "in_design") {
    return (
      <div className="relative">
        <div
          className="flex items-center gap-1.5 rounded-full px-3 py-1 cursor-default bg-violet-500/12 border border-violet-400/30"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <Brush size={12} className="text-violet-300" />
          <span className="text-xs font-bold text-violet-300 uppercase tracking-wide">In Design</span>
          {item.designerName && (
            <span className="text-xs text-violet-300/65 font-medium">· {item.designerName.split(" ")[0]}</span>
          )}
        </div>
        {showTooltip && item.designerName && (
          <div className="absolute bottom-full left-0 mb-1.5 z-50 rounded-xl px-3 py-2 whitespace-nowrap bg-gray-900/97 border border-violet-400/30 shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
            <p className="text-xs text-white/50 mb-0.5">Designer</p>
            <p className="text-sm font-bold text-white">{item.designerName}</p>
            {item.designClaimedAt && (
              <p className="text-xs text-white/30 mt-0.5">Claimed {timeAgo(item.designClaimedAt)}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 rounded-full px-3 py-1 bg-white/[0.04] border border-white/[0.08]">
      <Clock size={12} className="text-white/30" />
      <span className="text-xs font-semibold text-white/30 uppercase tracking-wide">Awaiting Designer</span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function DesignRequestsView({ currentUserId, currentUserName, currentUserPhoto = "", isAdmin, onToast, pendingDraftId, onPendingDraftHandled }: Props) {
  const [items, setItems] = useState<SermonDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [recallingId, setRecallingId] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoGlowing, setInfoGlowing] = useState(() => !localStorage.getItem("wf_design_requests_info_seen"));
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // View mode: list | grid2
  const [viewMode, setViewMode] = useState<"list" | "grid2">(() =>
    (localStorage.getItem("wf_design_view") as "list" | "grid2") || "grid2"
  );
  // Bulk select & delete
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; ids: string[]; isBulk: boolean; title: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const isBulkMode = selectedIds.size > 0;

  // ── Confirm modal state ───────────────────────────────────────────────────
  const [confirmState, setConfirmState] = useState<{
    open: boolean; title: string; message: string; detail?: string;
    confirmLabel: string; confirmColor: string;
    onConfirm: () => void; loading: boolean;
  }>({ open: false, title: "", message: "", confirmLabel: "Confirm", confirmColor: "#ef4444", onConfirm: () => {}, loading: false });
  const showConfirm = (opts: Omit<typeof confirmState, "open" | "loading">) =>
    setConfirmState({ ...opts, open: true, loading: false });
  const closeConfirm = () => setConfirmState(s => ({ ...s, open: false }));
  const setConfirmLoading = (v: boolean) => setConfirmState(s => ({ ...s, loading: v }));

  // ── View mode persist ─────────────────────────────────────────────────────
  const setView = (m: "list" | "grid2") => {
    setViewMode(m);
    localStorage.setItem("wf_design_view", m);
    setSelectedIds(new Set());
  };

  // ── Delete handlers ───────────────────────────────────────────────────────
  const openDeleteModal = (ids: string[], isBulk = false) => {
    const title = isBulk
      ? `Delete ${ids.length} sermon request${ids.length > 1 ? "s" : ""}?`
      : `Delete this request?`;
    setDeleteModal({ open: true, ids, isBulk, title });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModal) return;
    const { ids } = deleteModal;
    setDeleteLoading(true);
    try {
      if (ids.length === 1) {
        const res = await fetch(`/api/preaching-drafts/${ids[0]}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
      } else {
        const res = await fetch("/api/preaching-drafts", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        if (!res.ok) throw new Error();
      }
      setItems(prev => prev.filter(d => !ids.includes(d.id)));
      setSelectedIds(new Set());
      setDeleteModal(null);
      onToast?.("success", ids.length > 1 ? `${ids.length} requests deleted` : "Request deleted");
    } catch {
      onToast?.("error", "Delete failed. Please try again.");
    }
    setDeleteLoading(false);
    setDeletingIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map(i => i.id)));
  };

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/preaching-drafts/submitted");
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? data : []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Deep-link: auto-expand + flash the target card from a notification click
  useEffect(() => {
    if (!pendingDraftId || loading) return;
    // If items are already loaded, scroll & highlight immediately
    if (items.length > 0) {
      setExpandedId(pendingDraftId);
      setHighlightedId(pendingDraftId);
      setTimeout(() => {
        const el = cardRefs.current[pendingDraftId];
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      // Flash for 2.5s then clear
      setTimeout(() => setHighlightedId(null), 2500);
      onPendingDraftHandled?.();
    }
  }, [pendingDraftId, items, loading, onPendingDraftHandled]);

  // ── Recall handler ────────────────────────────────────────────────────────
  const handleRecall = (item: SermonDraft) => {
    showConfirm({
      title: "Recall to Drafts",
      message: `"${item.title || "Untitled"}" will be moved back to the preacher's Drafts.`,
      detail: "It will be removed from this Design Requests queue.",
      confirmLabel: "Recall",
      confirmColor: "#f59e0b",
      onConfirm: async () => {
        setConfirmLoading(true);
        setRecallingId(item.id);
        try {
          const res = await fetch(`/api/preaching-drafts/${item.id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "draft" }),
          });
          if (!res.ok) throw new Error();
          setItems(prev => prev.filter(d => d.id !== item.id));
          onToast?.("info", `"${item.title || "Untitled"}" recalled back to Drafts`);
        } catch {
          onToast?.("error", "Could not recall. Please try again.");
        }
        setRecallingId(null);
        closeConfirm();
      },
    });
  };

  // ── Volunteer to design ───────────────────────────────────────────────────
  const handleClaim = (item: SermonDraft) => {
    showConfirm({
      title: "Volunteer to Design",
      message: `You're taking responsibility for designing the slides for "${item.title || "this sermon"}".`,
      detail: "The preacher will be notified that you're on it. Only you can mark it as done.",
      confirmLabel: "Yes, I'll design it!",
      confirmColor: "rgba(139,92,246,1)",
      onConfirm: async () => {
        setConfirmLoading(true);
        setClaimingId(item.id);
        try {
          const res = await fetch(`/api/preaching-drafts/${item.id}/claim`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              designerId: currentUserId,
              designerName: currentUserName,
              designerPhoto: currentUserPhoto,
            }),
          });
          if (res.status === 409) {
            const data = await res.json();
            onToast?.("info", `${data.existingDesigner || "Someone"} already claimed this!`);
            // Refresh so we see the updated state
            fetchItems();
          } else if (!res.ok) {
            throw new Error();
          } else {
            // Optimistically update local state
            setItems(prev => prev.map(d => d.id === item.id ? {
              ...d,
              designStatus: "in_design",
              designerId: currentUserId,
              designerName: currentUserName,
              designerPhoto: currentUserPhoto,
              designClaimedAt: new Date().toISOString(),
            } : d));
            onToast?.("success", `You're now designing "${item.title || "this sermon"}"!`);
          }
        } catch {
          onToast?.("error", "Could not claim. Please try again.");
        }
        setClaimingId(null);
        closeConfirm();
      },
    });
  };

  // ── Mark slides as done ───────────────────────────────────────────────────
  const handleComplete = (item: SermonDraft) => {
    showConfirm({
      title: "Mark Slides as Done ✅",
      message: `Confirm that the slides for "${item.title || "this sermon"}" are fully designed and ready.`,
      detail: "The preacher will receive a push notification that their slides are ready!",
      confirmLabel: "Slides are Done!",
      confirmColor: "#10b981",
      onConfirm: async () => {
        setConfirmLoading(true);
        setCompletingId(item.id);
        try {
          const res = await fetch(`/api/preaching-drafts/${item.id}/complete`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              designerId: currentUserId,
              designerName: currentUserName,
              designerPhoto: currentUserPhoto,
            }),
          });
          if (!res.ok) throw new Error();
          setItems(prev => prev.map(d => d.id === item.id ? {
            ...d,
            designStatus: "design_done",
            designCompletedAt: new Date().toISOString(),
          } : d));
          onToast?.("success", "Slides marked as done! The preacher has been notified 🎉");
        } catch {
          onToast?.("error", "Could not mark as done. Please try again.");
        }
        setCompletingId(null);
        closeConfirm();
      },
    });
  };

  const isMyDesign = (item: SermonDraft) =>
    item.designStatus === "in_design" && item.designerId === currentUserId;

  return (
    <>
    <div className="flex flex-col h-full overflow-hidden bg-gray-950" style={{ minHeight: 0 }}>
      {/* ── Header ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 pt-5 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center rounded-xl w-10 h-10 bg-gradient-to-br from-violet-500/25 to-indigo-500/25 border border-violet-500/40 shadow-[0_0_12px_rgba(139,92,246,0.2)]">
            <Palette size={20} className="text-violet-300" />
          </div>
          <div>
            <h1 className="text-[18px] font-extrabold text-white tracking-tight">Design Requests</h1>
            <p className="text-[11px] text-white/35 font-medium">
              {loading ? "Loading…" : `${items.length} submitted sermon${items.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center rounded-xl overflow-hidden border border-white/[0.08]" style={{ background: "rgba(255,255,255,0.03)" }}>
            {(["list", "grid2"] as const).map((m, i) => {
              const icons = [<LayoutList size={15} />, <LayoutGrid size={15} />];
              const titles = ["List view", "2-column grid"];
              return (
                <button key={m} onClick={() => setView(m)} title={titles[i]}
                  className="flex items-center justify-center transition-all active:scale-90"
                  style={{
                    width: 34, height: 34,
                    background: viewMode === m ? "rgba(139,92,246,0.25)" : "transparent",
                    color: viewMode === m ? "#c4b5fd" : "rgba(255,255,255,0.3)",
                    borderRight: i < 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                  }}
                >{icons[i]}</button>
              );
            })}
          </div>
          {/* Info button */}
          <button
            onClick={() => { setInfoOpen(true); if (infoGlowing) { localStorage.setItem("wf_design_requests_info_seen", "1"); setInfoGlowing(false); } }}
            title="How Design Requests Works"
            className={`flex items-center justify-center rounded-full w-9 h-9 transition-all active:scale-95 ${
              infoGlowing
                ? "bg-violet-500/15 border border-violet-400/40 text-violet-300 shadow-[0_0_10px_rgba(139,92,246,0.2)]"
                : "bg-white/5 border border-white/10 text-white/50 hover:text-white/80"
            }`}
            style={{ animation: infoGlowing ? "newModulePulse 2s ease-in-out infinite" : "none" }}
          >
            <Info size={16} />
          </button>
          {/* Refresh */}
          <button
            onClick={fetchItems}
            disabled={loading}
            title="Refresh"
            className="flex items-center justify-center rounded-full w-9 h-9 bg-white/5 border border-white/10 text-white/50 hover:text-white/80 transition-all active:scale-95"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
        </div>
      </div>

      {/* ── Bulk action toolbar ── */}
      {isBulkMode && (
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06]" style={{ background: "rgba(139,92,246,0.08)" }}>
          <button onClick={toggleSelectAll}
            className="flex items-center gap-1.5 text-xs font-semibold text-violet-300"
          >
            {selectedIds.size === items.length ? <CheckSquare size={14} /> : <Square size={14} />}
            {selectedIds.size === items.length ? "Deselect All" : "Select All"}
          </button>
          <span className="text-xs text-white/30 font-medium">{selectedIds.size} selected</span>
          <div className="flex-1" />
          <button
            onClick={() => openDeleteModal(Array.from(selectedIds), true)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-all active:scale-95"
          >
            <Trash2 size={13} /> Delete {selectedIds.size}
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-white/30 hover:text-white/60 transition-colors">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Banner ── */}
      <div className="flex-shrink-0 mx-4 mt-3 mb-2 rounded-xl px-4 py-3 flex items-start gap-3 bg-indigo-500/[0.07] border border-indigo-400/20">
        <Palette size={16} className="text-indigo-300 mt-0.5 shrink-0" />
        <p className="text-[12px] text-white/55 leading-relaxed">
          Sermons submitted by the preacher will appear here. Volunteer to design slides and notify the preacher when done.
        </p>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-2" style={{ scrollbarWidth: "none" }}>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3 mt-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl overflow-hidden animate-pulse h-[90px] bg-white/[0.04] border border-white/[0.06]" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <div className="flex items-center justify-center rounded-3xl mb-4 w-16 h-16 bg-violet-500/[0.08] border border-violet-400/15">
              <InboxIcon size={28} className="text-violet-400/40" />
            </div>
            <p className="font-bold text-center text-[15px] text-white/30">No design requests yet</p>
            <p className="text-center mt-1 text-[12px] text-white/15">
              When a preacher submits a sermon draft,<br />it will appear here for your review.
            </p>
          </div>
        )}

        {/* Cards ── dynamic grid based on viewMode */}
        <div className={`grid gap-3 items-start ${
          viewMode === "list" ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"
        }`}>
        {!loading && items.map(item => {
          const isSelected = selectedIds.has(item.id);
          const isExpanded = expandedId === item.id;
          const scriptureText = item.scriptures?.[0]?.text || item.mainVerse || "";
          const hasMore = (item.scriptures?.length ?? 0) > 1;
          const isMine = isMyDesign(item);
          const isPending = !item.designStatus || item.designStatus === "pending";
          const isDone = item.designStatus === "design_done";
          const inDesign = item.designStatus === "in_design";

          return (
            <div
              key={item.id}
              ref={el => { cardRefs.current[item.id] = el; }}
              className={`rounded-2xl overflow-hidden transition-all border ${
                highlightedId === item.id
                  ? "border-amber-400/80 shadow-[0_0_0_3px_rgba(245,158,11,0.2),0_8px_32px_rgba(0,0,0,0.4)]"
                  : isSelected
                    ? "border-violet-400/60 shadow-[0_0_0_2px_rgba(139,92,246,0.25)]"
                    : isDone
                      ? "border-emerald-500/25 bg-white/[0.025]"
                      : inDesign
                        ? "border-violet-500/25 bg-white/[0.025]"
                        : isExpanded
                          ? "border-indigo-400/30 shadow-[0_8px_32px_rgba(0,0,0,0.4)] bg-white/[0.025]"
                          : "border-white/[0.08] bg-white/[0.025]"
              }`}
              style={{ transition: "border 0.3s ease, box-shadow 0.3s ease" }}
            >
              {/* ── Selection checkbox strip ── */}
              <div
                className="flex items-center gap-2 px-4 pt-3 pb-0 cursor-pointer"
                onClick={() => toggleSelect(item.id)}
                style={{ display: "flex" }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                  border: isSelected ? "none" : "1.5px solid rgba(255,255,255,0.15)",
                  background: isSelected ? "rgba(139,92,246,0.8)" : "rgba(255,255,255,0.03)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s",
                }}>
                  {isSelected && <Check size={11} style={{ color: "#fff", strokeWidth: 3 }} />}
                </div>
                <span style={{ fontSize: 10, color: isSelected ? "#c4b5fd" : "rgba(255,255,255,0.2)", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  {isSelected ? "Selected" : "Select"}
                </span>
                {/* Delete single button — right side of strip */}
                <div style={{ flex: 1 }} />
                <button
                  onClick={e => { e.stopPropagation(); openDeleteModal([item.id]); }}
                  title="Delete this request"
                  className="flex items-center justify-center rounded-lg transition-all active:scale-90"
                  style={{ width: 26, height: 26, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)", color: "rgba(239,68,68,0.5)" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#f87171"; (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.16)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(239,68,68,0.5)"; (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.08)"; }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
              {/* ── Card Body ── */}
              <div className="px-5 pt-6 pb-0">

                {/* Row 1: Status badge + time-ago */}
                <div className="flex items-center justify-between mb-5">
                  {(item.submissionVersion ?? 1) > 1 ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 rounded-full px-3 py-1.5 bg-amber-500/15 border border-amber-400/30">
                        <RefreshCw size={12} className="text-amber-400" />
                        <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Latest Version</span>
                      </div>
                      <span className="text-xs text-white/25 font-semibold" title={`Submitted ${item.submissionVersion} time(s)`}>
                        v{item.submissionVersion}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-full px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Submitted</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-xs text-white/30 font-medium">
                    <Clock size={12} />
                    <span className="uppercase tracking-wide">{timeAgo(item.submittedAt)}</span>
                  </div>
                </div>

                {/* Row 2: Big title */}
                <h2 className="text-2xl font-extrabold text-white tracking-tight leading-tight uppercase mb-2">
                  {item.title || "Untitled Sermon"}
                </h2>
                {item.subtitle && (
                  <p className="text-xs text-white/35 font-semibold uppercase tracking-widest mb-4">
                    {item.subtitle}
                  </p>
                )}

                {/* Scripture */}
                {scriptureText && (
                  <div className="flex items-center gap-2 mb-5">
                    <BookOpen size={13} className="text-indigo-400/60 shrink-0" />
                    <p className="text-sm text-indigo-300/80 font-medium truncate">
                      {scriptureText}
                      {hasMore && <span className="text-indigo-400/40"> +{item.scriptures!.length - 1}</span>}
                    </p>
                  </div>
                )}

                {/* Row 3: Meta pills */}
                <div className="flex items-center gap-2 flex-wrap mb-6">
                  {item.submittedByName && (
                    <span className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 bg-white/[0.05] border border-white/10">
                      <User2 size={13} className="text-white/50" />
                      <span className="text-xs text-white/75 font-semibold">{item.submittedByName}</span>
                    </span>
                  )}
                  {item.scheduledDate && (
                    <span className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 bg-white/[0.05] border border-white/10">
                      <CalendarDays size={13} className="text-white/50" />
                      <span className="text-xs text-white/75 font-semibold uppercase tracking-wide">
                        {new Date(item.scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </span>
                  )}
                  {item.serviceType && (
                    <span className="rounded-xl px-3 py-2.5 bg-indigo-500/10 border border-indigo-400/20 text-xs text-indigo-300 font-bold uppercase tracking-widest">
                      {item.serviceType}
                    </span>
                  )}
                </div>

                {/* Row 4: Design status block — copy button lives here */}
                <div className="flex items-center gap-4 mb-6 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                  {/* Status icon */}
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                    isDone
                      ? "bg-emerald-500/20 border border-emerald-500/30"
                      : inDesign
                        ? "bg-violet-500/20 border border-violet-500/30"
                        : "bg-white/[0.06] border border-white/10"
                  }`}>
                    {isDone
                      ? <CheckCheck size={20} className="text-emerald-400" />
                      : inDesign
                        ? <Brush size={20} className="text-violet-300" />
                        : <Clock size={20} className="text-white/30" />
                    }
                  </div>
                  {/* Status text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Design Status</p>
                    <p className="text-sm font-bold text-white leading-none">
                      {isDone
                        ? `Slides Done${item.designerName ? " • " + item.designerName.split(" ")[0] : ""}`
                        : inDesign
                          ? `In Design${item.designerName ? " • " + item.designerName.split(" ")[0] : ""}`
                          : "Awaiting Designer"
                      }
                    </p>
                  </div>
                  {/* Copy button — lives here, contextually relevant */}
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(buildCopyText(item));
                        setCopiedId(item.id);
                        setTimeout(() => setCopiedId(id => id === item.id ? null : id), 2000);
                        onToast?.("success", "Sermon copied to clipboard!");
                      } catch {
                        onToast?.("error", "Could not copy. Please try again.");
                      }
                    }}
                    title="Copy sermon content"
                    className={`w-9 h-9 shrink-0 flex items-center justify-center rounded-xl border transition-all active:scale-95 ${
                      copiedId === item.id
                        ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-400"
                        : "bg-white/[0.04] border-white/[0.08] text-white/30 hover:text-white/70 hover:bg-white/[0.08]"
                    }`}
                  >
                    {copiedId === item.id ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                </div>
              </div>


              {/* ── Bottom Action Bar ── */}
              <div className="flex border-t border-white/[0.06] min-w-0">
                {/* Left: Details (expand) */}
                <div className="flex items-center flex-1 min-w-0 px-4 py-4 bg-white/[0.02]">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="flex items-center gap-3 flex-1 min-w-0 group transition-all active:scale-95"
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-white/[0.06] border border-white/10 group-hover:bg-white/10 transition-colors">
                      {isExpanded ? <ChevronUp size={15} className="text-white/70" /> : <ChevronsUpDown size={15} className="text-white/70" />}
                    </div>
                    <div className="text-left min-w-0">
                      <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest whitespace-nowrap">Details</p>
                      <p className="text-xs font-extrabold text-white uppercase tracking-wide leading-none whitespace-nowrap">
                        {isExpanded ? "Hide Preview" : "Preview Sermon"}
                      </p>
                    </div>
                  </button>
                </div>


                {/* Right: Primary action */}
                {isPending && (
                  <button
                    onClick={() => handleClaim(item)}
                    disabled={claimingId === item.id}
                    className="flex items-center gap-2 px-4 py-3 shrink-0 border-l border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 transition-all active:scale-[0.98]"
                  >
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-violet-500/20 border border-violet-400/30">
                      {claimingId === item.id ? <Loader2 size={15} className="animate-spin text-violet-300" /> : <Sparkles size={15} className="text-violet-300" />}
                    </div>
                    <div className="text-left">
                      <p className="text-[9px] font-bold text-violet-400/60 uppercase tracking-widest whitespace-nowrap">Action</p>
                      <p className="text-xs font-extrabold text-violet-300 uppercase tracking-wide leading-none whitespace-nowrap">I'll Design This</p>
                    </div>
                  </button>
                )}
                {isMine && (
                  <button
                    onClick={() => handleComplete(item)}
                    disabled={completingId === item.id}
                    className="flex items-center gap-2 px-4 py-3 shrink-0 border-l border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all active:scale-[0.98]"
                  >
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-emerald-500/20 border border-emerald-400/30">
                      {completingId === item.id ? <Loader2 size={15} className="animate-spin text-emerald-400" /> : <CheckCheck size={15} className="text-emerald-400" />}
                    </div>
                    <div className="text-left">
                      <p className="text-[9px] font-bold text-emerald-400/60 uppercase tracking-widest whitespace-nowrap">Action</p>
                      <p className="text-xs font-extrabold text-emerald-400 uppercase tracking-wide leading-none whitespace-nowrap">Mark as Done!</p>
                    </div>
                  </button>
                )}
                {!isPending && !isMine && (isAdmin || item.authorId === currentUserId) && (
                  <button
                    onClick={() => handleRecall(item)}
                    disabled={recallingId === item.id}
                    className="flex items-center gap-2 px-4 py-3 shrink-0 border-l border-amber-400/30 bg-amber-500/10 hover:bg-amber-500/20 transition-all active:scale-[0.98]"
                  >
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/20 border border-amber-400/30">
                      {recallingId === item.id ? <Loader2 size={15} className="animate-spin text-amber-400" /> : <CornerUpLeft size={15} className="text-amber-400" />}
                    </div>
                    <div className="text-left">
                      <p className="text-[9px] font-bold text-amber-400/60 uppercase tracking-widest whitespace-nowrap">Action</p>
                      <p className="text-xs font-extrabold text-amber-300 uppercase tracking-wide leading-none whitespace-nowrap">Recall to Drafts</p>
                    </div>
                  </button>
                )}
                {isMine && (isAdmin || item.authorId === currentUserId) && (
                  <button
                    onClick={() => handleRecall(item)}
                    disabled={recallingId === item.id}
                    className="flex items-center justify-center w-10 shrink-0 border-l border-amber-400/20 bg-amber-500/[0.06] hover:bg-amber-500/15 transition-all active:scale-[0.98]"
                    title="Recall to Drafts"
                  >
                    {recallingId === item.id ? <Loader2 size={14} className="animate-spin text-amber-400/60" /> : <CornerUpLeft size={14} className="text-amber-400/60" />}
                  </button>
                )}
              </div>



                  {/* Expanded detail panel */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-3 border-t border-white/[0.06] bg-black/15">

                      {/* ── External submission content ── */}
                      {item.isExternal && (
                        <ExternalSubmissionPanel item={item} onToast={onToast} />
                      )}

                      {/* All scriptures */}
                      {!item.isExternal && (item.scriptures?.length ?? 0) > 1 && (
                    <Section icon={<BookOpen size={13} />} label="Main Scriptures">
                      <ul className="space-y-1">
                        {item.scriptures.map((s, i) => (
                          <li key={s.id || i} className="flex items-start gap-2">
                            <span style={{ color: "rgba(var(--wf-c1),0.5)", fontWeight: 700, fontSize: 11, marginTop: 1, flexShrink: 0 }}>•</span>
                            <span>{s.text}</span>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {item.introduction && (
                    <Section icon={<PenLine size={13} />} label="Introduction">
                      <p className="whitespace-pre-wrap">{item.introduction}</p>
                    </Section>
                  )}

                  {item.mainPassage && (
                    <Section icon={<BookMarked size={13} />} label="Main Passage / Outline">
                      <p className="whitespace-pre-wrap">{item.mainPassage}</p>
                    </Section>
                  )}

                  {(item.keyPoints?.length ?? 0) > 0 && (
                    <Section icon={<Lightbulb size={13} />} label={item.keyPointsTitle || "Key Points"}>
                      <div className="space-y-3">
                        {item.keyPoints.map((kp, idx) => (
                          <div key={kp.id || idx}
                            className="rounded-xl px-3 py-2.5"
                            style={{ background: "rgba(var(--wf-c1),0.06)", border: "1px solid rgba(var(--wf-c1),0.12)" }}>
                            {kp.heading && (
                              <p className="font-bold mb-1" style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
                                {idx + 1}. {kp.heading}
                              </p>
                            )}
                            {(kp.scriptures?.length ?? 0) > 0 && kp.scriptures[0]?.text && (
                              <p className="mb-1" style={{ fontSize: 11, color: "rgba(var(--wf-c1),0.75)", fontStyle: "italic" }}>
                                {kp.scriptures.map(s => s.text).filter(Boolean).join(" • ")}
                              </p>
                            )}
                            {kp.body && (
                              <p className="whitespace-pre-wrap" style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{kp.body}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {item.freeNotes && (
                    <Section icon={<FileText size={13} />} label="Notes">
                      <p className="whitespace-pre-wrap">{item.freeNotes}</p>
                    </Section>
                  )}

                  {item.application && (
                    <Section icon={<Heart size={13} />} label="Application">
                      <p className="whitespace-pre-wrap">{item.application}</p>
                    </Section>
                  )}

                  {item.closingPrayer && (
                    <Section icon={<BookOpen size={13} />} label="Closing Prayer">
                      <p className="whitespace-pre-wrap">{item.closingPrayer}</p>
                    </Section>
                  )}

                  {(item.collectedVerses?.length ?? 0) > 0 && (
                    <Section icon={<BookMarked size={13} />} label={`Collected Verses (${item.collectedVerses!.length})`}>
                      <div className="space-y-2">
                        {item.collectedVerses!.map((v, i) => (
                          <div key={i} className="rounded-lg px-3 py-2"
                            style={{ background: "rgba(var(--wf-c2),0.06)", border: "1px solid rgba(var(--wf-c2),0.12)" }}>
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(var(--wf-c2),0.8)" }}>{v.ref}</span>
                              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", fontWeight: 600 }}>·</span>
                              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>{v.translation}</span>
                            </div>
                            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{v.text}</p>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}
                </div>
              )}
            </div>
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

    {/* ── Premium Delete Confirmation Modal ── */}
    {deleteModal?.open && (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
        style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(12px)" }}
        onClick={() => !deleteLoading && setDeleteModal(null)}
      >
        <div
          className="w-full max-w-sm rounded-2xl overflow-hidden"
          style={{ background: "linear-gradient(160deg, rgba(25,10,10,1) 0%, rgba(18,10,15,1) 100%)", border: "1px solid rgba(239,68,68,0.25)", boxShadow: "0 0 0 1px rgba(239,68,68,0.1), 0 32px 80px rgba(0,0,0,0.9)" }}
          onClick={e => e.stopPropagation()}
        >
          {/* Red top accent bar */}
          <div style={{ height: 3, background: "linear-gradient(90deg, #ef4444, #f97316, #ef4444)", backgroundSize: "200% 100%", animation: "shimmer 2s linear infinite" }} />
          <style>{`@keyframes shimmer { from { background-position: 0% 0% } to { background-position: 200% 0% } }`}</style>

          <div className="px-6 pt-6 pb-5">
            {/* Icon + title */}
            <div className="flex items-start gap-4 mb-5">
              <div className="flex items-center justify-center rounded-2xl shrink-0"
                style={{ width: 48, height: 48, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", boxShadow: "0 0 16px rgba(239,68,68,0.15)" }}>
                <Trash2 size={22} style={{ color: "#f87171" }} />
              </div>
              <div>
                <p className="font-extrabold text-white" style={{ fontSize: 16, letterSpacing: "-0.02em", marginBottom: 4 }}>
                  {deleteModal.title}
                </p>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
                  {deleteModal.isBulk
                    ? "These submissions will be permanently removed from the Design Requests queue."
                    : "This submission will be permanently removed from the Design Requests queue."}
                </p>
              </div>
            </div>

            {/* Warning box */}
            <div className="rounded-xl px-4 py-3 mb-5 flex items-center gap-3"
              style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.15)" }}>
              <AlertTriangle size={14} style={{ color: "#f87171", flexShrink: 0 }} />
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>
                <strong style={{ color: "rgba(255,255,255,0.65)" }}>This action cannot be undone.</strong> The record will be deleted from Firestore permanently.
              </p>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => !deleteLoading && setDeleteModal(null)}
                disabled={deleteLoading}
                className="flex-1 rounded-xl py-3 font-bold text-sm transition-all active:scale-95"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleteLoading}
                className="flex-1 rounded-xl py-3 font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
                style={{ background: deleteLoading ? "rgba(239,68,68,0.3)" : "linear-gradient(135deg, #ef4444, #dc2626)", border: "none", color: "#fff", opacity: deleteLoading ? 0.7 : 1, boxShadow: "0 4px 16px rgba(239,68,68,0.3)" }}
              >
                {deleteLoading ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                {deleteLoading ? "Deleting…" : deleteModal.isBulk ? `Delete ${deleteModal.ids.length}` : "Delete"}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ── Design Requests Info Modal ── */}
    {infoOpen && (
      <DesignRequestsInfoModal onClose={() => setInfoOpen(false)} />
    )}
    </>
  );
}


// ── External Submission Panel ─────────────────────────────────────────────────
function ExternalSubmissionPanel({ item, onToast }: { item: SermonDraft; onToast?: (type: "success" | "error" | "info", message: string) => void }) {
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedNotes, setCopiedNotes] = useState(false);

  const isImage = item.externalFileType?.startsWith("image/") ||
    (item.externalFileName && /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(item.externalFileName));

  const handleOcr = async () => {
    if (!item.externalFileUrl) return;
    setOcrLoading(true);
    setOcrText(null);
    try {
      // Call /api/ocr-preaching — server-side fetch that bypasses CORS and the Netlify 6MB payload limit
      const res = await fetch("/api/ocr-preaching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: item.externalFileUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "OCR failed");
      setOcrText(data.text || "(No text found)");
      onToast?.("success", "Image converted to text successfully!");
    } catch (e: any) {
      onToast?.("error", e.message || "OCR failed");
    } finally {
      setOcrLoading(false);
    }
  };

  const copyText = async (text: string, setFlag: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setFlag(true);
      setTimeout(() => setFlag(false), 2000);
    } catch {
      onToast?.("error", "Could not copy");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Notes */}
      {item.externalNotes && (
        <div style={{ borderRadius: 14, padding: "14px 16px", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <FileText size={13} style={{ color: "rgba(var(--wf-c1),0.7)" }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.07em", textTransform: "uppercase" }}>Sermon Notes</span>
            </div>
            <button
              onClick={() => copyText(item.externalNotes!, setCopiedNotes)}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: copiedNotes ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.06)", border: copiedNotes ? "1px solid rgba(52,211,153,0.3)" : "1px solid rgba(255,255,255,0.1)", color: copiedNotes ? "#34d399" : "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
            >
              {copiedNotes ? <Check size={11} /> : <Copy size={11} />}
              {copiedNotes ? "Copied!" : "Copy"}
            </button>
          </div>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.6, whiteSpace: "pre-wrap", margin: 0 }}>{item.externalNotes}</p>
        </div>
      )}

      {/* Reference link */}
      {item.externalLink && (
        <div style={{ borderRadius: 14, padding: "12px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Link2 size={15} style={{ color: "rgba(var(--wf-c1),0.8)" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 2 }}>Reference Link</p>
            <p style={{ fontSize: 12, color: "rgba(165,180,252,0.9)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.externalLink}</p>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button
              onClick={() => copyText(item.externalLink!, setCopiedLink)}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, background: copiedLink ? "rgba(52,211,153,0.12)" : "rgba(99,102,241,0.12)", border: copiedLink ? "1px solid rgba(52,211,153,0.3)" : "1px solid rgba(99,102,241,0.25)", color: copiedLink ? "#34d399" : "var(--wf-at2)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              {copiedLink ? <Check size={12} /> : <Copy size={12} />}
              {copiedLink ? "Copied!" : "Copy"}
            </button>
            <a
              href={item.externalLink} target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}
            >
              <ExternalLink size={13} />
            </a>
          </div>
        </div>
      )}

      {/* File attachment */}
      {item.externalFileUrl && (
        <div style={{ borderRadius: 14, padding: "12px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: isImage ? 12 : 0 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <FileText size={15} style={{ color: "rgba(245,158,11,0.9)" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 2 }}>Attached File</p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.externalFileName || "attachment"}</p>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <a
                href={item.externalFileUrl} download={item.externalFileName || "attachment"} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#fbbf24", fontSize: 12, fontWeight: 600, textDecoration: "none" }}
              >
                <Download size={12} /> Download
              </a>
            </div>
          </div>
          {/* Image preview */}
          {isImage && (
            <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", marginBottom: 10 }}>
              <img src={item.externalFileUrl} alt="Attached" style={{ width: "100%", maxHeight: 280, objectFit: "cover", display: "block" }} />
            </div>
          )}
          {/* OCR button for images */}
          {isImage && (
            <button
              onClick={handleOcr}
              disabled={ocrLoading}
              style={{ width: "100%", height: 38, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 10, background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)", color: "#c4b5fd", fontSize: 13, fontWeight: 700, cursor: ocrLoading ? "not-allowed" : "pointer", opacity: ocrLoading ? 0.6 : 1 }}
            >
              {ocrLoading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <ScanText size={14} />}
              {ocrLoading ? "Converting image to text…" : "Convert Image to Text (OCR)"}
            </button>
          )}
          {/* OCR Result */}
          {ocrText && (
            <div style={{ marginTop: 10, borderRadius: 12, padding: "12px 14px", background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ScanText size={12} style={{ color: "rgba(196,181,253,0.8)" }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(196,181,253,0.6)", letterSpacing: "0.07em", textTransform: "uppercase" }}>Extracted Text</span>
                </div>
                <button
                  onClick={() => { navigator.clipboard.writeText(ocrText).then(() => onToast?.("success", "OCR text copied!")).catch(() => {}); }}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                >
                  <Copy size={11} /> Copy
                </button>
              </div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.65, whiteSpace: "pre-wrap", margin: 0, maxHeight: 300, overflowY: "auto" }}>{ocrText}</p>
            </div>
          )}
        </div>
      )}

      {/* Empty state for external */}
      {!item.externalNotes && !item.externalLink && !item.externalFileUrl && (
        <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 13, textAlign: "center", padding: "12px 0" }}>No content was attached to this request.</p>
      )}
    </div>
  );
}


function DesignRequestsInfoModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"about" | "workflow" | "integration">("about");
  const tabs = [
    { id: "about" as const, label: "About", emoji: "🎨" },
    { id: "workflow" as const, label: "Your Workflow", emoji: "⚡" },
    { id: "integration" as const, label: "Preaching Link", emoji: "🔗" },
  ];
  const content = {
    about: {
      title: "Design Requests — Your Sermon-to-Slide Pipeline",
      description: "Design Requests is the exclusive workspace for Admin and Audio/Tech team members. It receives submitted sermons from the Preaching module and helps you prepare beautiful slides and presentations.",
      color: "var(--wf-at3)",
      items: [
        { icon: "🔒", text: "This module is only visible to Admin and Audio/Tech roles — other team members cannot access it." },
        { icon: "📥", text: "Sermons submitted by the preacher appear here automatically — no manual uploading required." },
        { icon: "✋", text: "Click 'I'll design this' to volunteer for a sermon. First-come, first-served — the preacher is notified instantly." },
        { icon: "🎨", text: "Once you volunteer, the card shows 'Design in Progress' with your name. Others can see it's taken." },
        { icon: "✅", text: "When slides are done, click 'Done!' to notify the preacher via push notification and in-app alert." },
        { icon: "↩️", text: "Recall: if you need the preacher to add more details, use the Recall button to send the sermon back to their Drafts." },
      ],
    },
    workflow: {
      title: "How to Use Design Requests",
      description: "Step-by-step guide for your Audio/Tech workflow when a new sermon arrives.",
      color: "#34d399",
      items: [
        { icon: "🔔", text: "When a preacher submits a sermon, it appears immediately in this queue. Check here before Sunday service preparation." },
        { icon: "👁️", text: "Click 'View full sermon' to expand and read the complete outline — including all key points and scriptures." },
        { icon: "✋", text: "Click 'I'll design this' to claim the sermon. You'll be the designated designer and the preacher gets notified." },
        { icon: "🎨", text: "Paste the outline into Canva, PowerPoint, or any tool to start building your slides based on the preacher's structure." },
        { icon: "✅", text: "Once slides are done, click 'Done!' — the preacher instantly gets a push notification that their slides are ready." },
        { icon: "↩️", text: "If information is incomplete, click 'Recall' to move it back to the preacher's Drafts with a notification." },
      ],
    },
    integration: {
      title: "Integration with Preaching Module",
      description: "Design Requests and Preaching are two sides of the same system — here's how they connect.",
      color: "var(--wf-at)",
      items: [
        { icon: "📤", text: "The preacher creates their outline in the Preaching module and clicks 'Submit to Design Requests'." },
        { icon: "⚡", text: "The sermon instantly appears here with a 'Submitted' badge and the submission timestamp." },
        { icon: "🔔", text: "When you volunteer, the preacher sees a push notification: '[Name] is designing your slides!'." },
        { icon: "✅", text: "When you mark it done, the preacher gets another notification: 'Slides are ready! You're all set for Sunday!'." },
        { icon: "🛡️", text: "Only Admin and Audio/Tech roles can see Design Requests — the preacher cannot see this queue, protecting the workflow separation." },
        { icon: "💡", text: "This integration eliminates manual file sharing, email attachments, and WhatsApp forwarding of sermon outlines." },
      ],
    },
  };
  const c = content[tab];
  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/75 backdrop-blur-sm px-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg bg-[#0f0f1c] rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: "90vh", boxShadow: "0 0 0 1px rgba(var(--wf-c3),0.2), 0 32px 80px rgba(0,0,0,0.7)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(var(--wf-c1),0.25), rgba(var(--wf-c2),0.2))", border: "1px solid rgba(var(--wf-c3),0.35)" }}>
              <Palette size={20} style={{ color: "var(--wf-at3)" }} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">How Design Requests Works</h2>
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>Audio/Tech & Admin guide</p>
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
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold transition-all border-b-2 -mb-px ${tab === t.id ? "text-violet-400 border-violet-500" : "text-gray-500 border-transparent hover:text-gray-300"}`}>
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
            Got it, ready to design!
          </button>
        </div>
      </div>
    </div>
  );
}
