import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Palette, BookOpen, CalendarDays, User2, Clock, ChevronDown, ChevronUp,
  RefreshCw, Loader2, CornerUpLeft, FileText, Lightbulb, Heart, BookMarked,
  PenLine, CheckCircle2, InboxIcon, AlertTriangle, Copy, Check, Info, X,
  Brush, Sparkles, CheckCheck,
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
        <span style={{ color: "rgba(var(--wf-c1),0.7)", display: "flex" }}>{icon}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.65 }}>{children}</div>
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
      <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
        style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)" }}>
        <CheckCheck size={10} style={{ color: "#34d399" }} />
        <span style={{ fontSize: 10, color: "#34d399", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
          Slides Done
        </span>
        {item.designerName && (
          <span style={{ fontSize: 10, color: "rgba(52,211,153,0.65)", fontWeight: 500 }}>
            · {item.designerName.split(" ")[0]}
          </span>
        )}
      </div>
    );
  }

  if (item.designStatus === "in_design") {
    return (
      <div className="relative">
        <div
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 cursor-default"
          style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)" }}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <Brush size={10} style={{ color: "#a78bfa" }} />
          <span style={{ fontSize: 10, color: "#a78bfa", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Design in Progress
          </span>
          {item.designerName && (
            <span style={{ fontSize: 10, color: "rgba(167,139,250,0.65)", fontWeight: 500 }}>
              · {item.designerName.split(" ")[0]}
            </span>
          )}
        </div>
        {showTooltip && item.designerName && (
          <div className="absolute bottom-full left-0 mb-1.5 z-50 rounded-xl px-3 py-2 whitespace-nowrap"
            style={{ background: "rgba(15,15,30,0.97)", border: "1px solid rgba(139,92,246,0.3)", boxShadow: "0 8px 24px rgba(0,0,0,0.6)", fontSize: 11 }}>
            <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>Designer</p>
            <p style={{ color: "#fff", fontWeight: 700 }}>{item.designerName}</p>
            {item.designClaimedAt && (
              <p style={{ color: "rgba(255,255,255,0.3)", marginTop: 2 }}>Claimed {timeAgo(item.designClaimedAt)}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <Clock size={9} style={{ color: "rgba(255,255,255,0.3)" }} />
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        Awaiting Designer
      </span>
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
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: "linear-gradient(160deg, var(--wf-bg4) 0%, var(--wf-bg4) 100%)", minHeight: 0 }}
    >
      {/* ── Header ── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 pt-5 pb-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center rounded-xl"
            style={{ width: 40, height: 40, background: "linear-gradient(135deg, rgba(var(--wf-c1),0.25), rgba(var(--wf-c2),0.25))", border: "1.5px solid rgba(var(--wf-c1),0.4)" }}
          >
            <Palette size={20} style={{ color: "var(--wf-at3)" }} />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>
              Design Requests
            </h1>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 500 }}>
              {loading ? "Loading…" : `${items.length} submitted sermon${items.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Info button */}
          <button
            onClick={() => { setInfoOpen(true); if (infoGlowing) { localStorage.setItem("wf_design_requests_info_seen", "1"); setInfoGlowing(false); } }}
            title="How Design Requests Works"
            className="flex items-center justify-center rounded-full transition-all active:scale-95"
            style={{
              width: 36, height: 36,
              background: infoGlowing ? "rgba(var(--wf-c3),0.15)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${infoGlowing ? "rgba(var(--wf-c3),0.4)" : "rgba(255,255,255,0.1)"}`,
              color: infoGlowing ? "var(--wf-at3)" : "rgba(255,255,255,0.5)",
              animation: infoGlowing ? "newModulePulse 2s ease-in-out infinite" : "none",
              boxShadow: infoGlowing ? "0 0 0 1px rgba(var(--wf-c3),0.25), 0 0 10px rgba(var(--wf-c3),0.2)" : "none",
            }}
          >
            <Info size={16} />
          </button>
          {/* Refresh */}
          <button
            onClick={fetchItems}
            disabled={loading}
            title="Refresh"
            className="flex items-center justify-center rounded-full transition-all active:scale-95"
            style={{ width: 36, height: 36, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
        </div>
      </div>

      {/* ── Banner ── */}
      <div
        className="flex-shrink-0 mx-4 mt-3 mb-2 rounded-xl px-4 py-3 flex items-start gap-3"
        style={{ background: "rgba(var(--wf-c1),0.07)", border: "1px solid rgba(var(--wf-c1),0.18)" }}
      >
        <Palette size={16} style={{ color: "var(--wf-at)", marginTop: 1, flexShrink: 0 }} />
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
          Sermons submitted by the preacher will appear here. Volunteer to design slides and notify the preacher when done.
        </p>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-2" style={{ scrollbarWidth: "none" }}>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3 mt-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl overflow-hidden animate-pulse"
                style={{ height: 90, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <div className="flex items-center justify-center rounded-3xl mb-4"
              style={{ width: 64, height: 64, background: "rgba(var(--wf-c1),0.08)", border: "1px solid rgba(var(--wf-c1),0.15)" }}>
              <InboxIcon size={28} style={{ color: "rgba(var(--wf-c1),0.4)" }} />
            </div>
            <p className="font-bold text-center" style={{ fontSize: 15, color: "rgba(255,255,255,0.3)" }}>No design requests yet</p>
            <p className="text-center mt-1" style={{ fontSize: 12, color: "rgba(255,255,255,0.15)" }}>
              When a preacher submits a sermon draft,<br />it will appear here for your review.
            </p>
          </div>
        )}

        {/* Cards */}
        {!loading && items.map(item => {
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
              className="rounded-2xl mb-3 overflow-hidden transition-all"
              style={{
                background: "rgba(255,255,255,0.025)",
                border: highlightedId === item.id
                  ? "1.5px solid rgba(245,158,11,0.8)"
                  : `1px solid ${isDone ? "rgba(52,211,153,0.25)" : inDesign ? "rgba(139,92,246,0.25)" : "rgba(var(--wf-c1),0.2)"}`,
                boxShadow: highlightedId === item.id
                  ? "0 0 0 3px rgba(245,158,11,0.2), 0 8px 32px rgba(0,0,0,0.4)"
                  : isExpanded ? "0 0 0 1px rgba(var(--wf-c1),0.3), 0 8px 32px rgba(0,0,0,0.4)" : "none",
                transition: "border 0.3s ease, box-shadow 0.3s ease",
              }}
            >
              {/* Card Header — always visible */}
              <div className="px-4 pt-4 pb-3">
                {/* Status + time row */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    {(item.submissionVersion ?? 1) > 1 ? (
                      <>
                        <div className="flex items-center gap-1.5 rounded-full px-2 py-0.5"
                          style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)" }}>
                          <RefreshCw size={9} style={{ color: "#fbbf24" }} />
                          <span style={{ fontSize: 10, color: "#fbbf24", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            Latest Version
                          </span>
                        </div>
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontWeight: 600 }}
                          title={`Submitted ${item.submissionVersion} time(s)`}>
                          v{item.submissionVersion}
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={11} style={{ color: "#34d399" }} />
                        <span style={{ fontSize: 10, color: "#34d399", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          Submitted
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1" style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>
                    <Clock size={9} />
                    <span>{timeAgo(item.submittedAt)}</span>
                  </div>
                </div>

                {/* Title */}
                <p className="font-bold" style={{ fontSize: 15, color: "#fff", letterSpacing: "-0.01em", lineHeight: 1.3 }}>
                  {item.title || "Untitled Sermon"}
                </p>
                {item.subtitle && (
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 2 }}>
                    {item.subtitle}
                  </p>
                )}

                {/* Scripture pill */}
                {scriptureText && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <BookOpen size={10} style={{ color: "rgba(var(--wf-c1),0.6)", flexShrink: 0 }} />
                    <p style={{ fontSize: 11, color: "rgba(var(--wf-c1),0.8)", fontWeight: 500 }} className="truncate">
                      {scriptureText}
                      {hasMore && <span style={{ color: "rgba(var(--wf-c1),0.4)" }}> +{item.scriptures!.length - 1}</span>}
                    </p>
                  </div>
                )}

                {/* Meta row */}
                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  {item.submittedByName && (
                    <span className="flex items-center gap-1 rounded-full px-2 py-0.5"
                      style={{ background: "rgba(var(--wf-c1),0.1)", border: "1px solid rgba(var(--wf-c1),0.2)" }}>
                      <User2 size={9} style={{ color: "rgba(var(--wf-c1),0.7)" }} />
                      <span style={{ fontSize: 10, color: "rgba(var(--wf-c1),0.85)", fontWeight: 600 }}>{item.submittedByName}</span>
                    </span>
                  )}
                  {item.scheduledDate && (
                    <span className="flex items-center gap-1 rounded-full px-2 py-0.5"
                      style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}>
                      <CalendarDays size={9} style={{ color: "rgba(245,158,11,0.8)" }} />
                      <span style={{ fontSize: 10, color: "rgba(245,158,11,0.9)", fontWeight: 600 }}>
                        {new Date(item.scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </span>
                  )}
                  {item.serviceType && (
                    <span className="rounded-full px-2 py-0.5"
                      style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", fontSize: 10, color: "rgba(52,211,153,0.9)", fontWeight: 600 }}>
                      {item.serviceType}
                    </span>
                  )}
                </div>

                {/* ── Design Status Row ── */}
                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  <DesignStatusBadge item={item} />
                </div>

                {/* Action buttons row */}
                <div className="flex items-center gap-2 mt-3 pt-2.5"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  {/* Expand */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="flex items-center gap-1.5 rounded-full px-3 flex-1 justify-center transition-all active:scale-95"
                    style={{ height: 30, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}
                  >
                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {isExpanded ? "Hide details" : "View full sermon"}
                  </button>

                  {/* Copy to clipboard */}
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
                    title="Copy sermon to clipboard"
                    className="flex items-center justify-center rounded-full transition-all active:scale-95"
                    style={{
                      width: 30, height: 30, flexShrink: 0,
                      background: copiedId === item.id ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${copiedId === item.id ? "rgba(52,211,153,0.35)" : "rgba(255,255,255,0.1)"}`,
                      color: copiedId === item.id ? "#34d399" : "rgba(255,255,255,0.4)",
                      transition: "all 0.2s ease",
                    }}
                  >
                    {copiedId === item.id ? <Check size={12} /> : <Copy size={12} />}
                  </button>

                  {/* ── Volunteer button — only when pending/unclaimed ── */}
                  {isPending && (
                    <button
                      onClick={() => handleClaim(item)}
                      disabled={claimingId === item.id}
                      title="Volunteer to design slides"
                      className="flex items-center gap-1.5 rounded-full px-3 transition-all active:scale-95"
                      style={{
                        height: 30, flexShrink: 0,
                        background: "rgba(139,92,246,0.15)",
                        border: "1px solid rgba(139,92,246,0.35)",
                        fontSize: 11, color: "#a78bfa", fontWeight: 700,
                      }}
                    >
                      {claimingId === item.id
                        ? <Loader2 size={11} className="animate-spin" />
                        : <Sparkles size={11} />}
                      I'll design this
                    </button>
                  )}

                  {/* ── Mark Done button — only for the assigned designer ── */}
                  {isMine && (
                    <button
                      onClick={() => handleComplete(item)}
                      disabled={completingId === item.id}
                      title="Mark slides as complete"
                      className="flex items-center gap-1.5 rounded-full px-3 transition-all active:scale-95"
                      style={{
                        height: 30, flexShrink: 0,
                        background: "rgba(16,185,129,0.15)",
                        border: "1px solid rgba(16,185,129,0.35)",
                        fontSize: 11, color: "#34d399", fontWeight: 700,
                      }}
                    >
                      {completingId === item.id
                        ? <Loader2 size={11} className="animate-spin" />
                        : <CheckCheck size={11} />}
                      Done!
                    </button>
                  )}

                  {/* ── Recall — admin or submitter ── */}
                  {(isAdmin || item.authorId === currentUserId) && (
                    <button
                      onClick={() => handleRecall(item)}
                      disabled={recallingId === item.id}
                      title="Recall to Drafts"
                      className="flex items-center gap-1.5 rounded-full px-3 transition-all active:scale-95"
                      style={{ height: 30, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", fontSize: 11, color: "rgba(245,158,11,0.85)", fontWeight: 600 }}
                    >
                      {recallingId === item.id
                        ? <Loader2 size={11} className="animate-spin" />
                        : <CornerUpLeft size={11} />}
                      Recall
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded detail panel */}
              {isExpanded && (
                <div
                  className="px-4 pb-4 pt-3"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.15)" }}
                >
                  {/* All scriptures */}
                  {(item.scriptures?.length ?? 0) > 1 && (
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

    {/* ── Design Requests Info Modal ── */}
    {infoOpen && (
      <DesignRequestsInfoModal onClose={() => setInfoOpen(false)} />
    )}
    </>
  );
}

// ── Design Requests Info Modal ────────────────────────────────────────────────
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
