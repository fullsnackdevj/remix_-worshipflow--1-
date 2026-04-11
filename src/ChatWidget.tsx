import React, { useState, useEffect, useRef, useCallback } from "react";
import { collection, query, orderBy, limitToLast, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { MessageSquare, X, Send, Trash2, Reply, AtSign, Search, Settings, Paperclip, Smile, Pin, PinOff, ImageIcon, Link2, ExternalLink, Code2, Pencil, Check, ChevronUp, ChevronDown } from "lucide-react";
import type { Member } from "./types";

// ── Channel type & defaults ──────────────────────────────────────────────────
export type ChatChannel = {
  id: string; name: string; emoji: string; desc: string; placeholder: string;
};
const DEFAULT_CHANNELS: ChatChannel[] = [
  { id: "chit-chats",  name: "Chit-Chats", emoji: "💬", desc: "General chit-chat & fun",          placeholder: "Say something fun..." },
  { id: "audio-tech",  name: "Audio-Tech",  emoji: "🎛️", desc: "Audio & technical discussions",    placeholder: "Discuss audio & tech..." },
  { id: "music-team",  name: "Music Team",  emoji: "🎵", desc: "Music team coordination",           placeholder: "Talk music & worship..." },
];

// ── Dev channels (internal) ──────────────────────────────────────────────────
const DEV_CHANNELS: ChatChannel[] = [
  { id: "bug-tracker",         name: "Bug Tracker",         emoji: "🐛", desc: "Report & track bugs",           placeholder: "Describe the bug..." },
  { id: "feature-proposals",   name: "Feature Proposals",   emoji: "💡", desc: "Propose new features",          placeholder: "Share your idea..." },
  { id: "system-improvements", name: "System Improvements", emoji: "⚙️", desc: "System & performance upgrades",  placeholder: "Suggest an improvement..." },
];

type ChannelId = string;
type SidebarView = "chat" | "dev" | "mentions" | "pinned" | "images" | "links" | "search" | "settings";

const THEMES = [
  { id: "indigo",  label: "Indigo",  nameClass: "text-indigo-300",  dotClass: "bg-indigo-500",  badgeCls: "bg-indigo-600/30 border-indigo-500/50 text-indigo-300" },
  { id: "violet",  label: "Violet",  nameClass: "text-violet-300",  dotClass: "bg-violet-500",  badgeCls: "bg-violet-600/30 border-violet-500/50 text-violet-300" },
  { id: "sky",     label: "Sky",     nameClass: "text-sky-300",     dotClass: "bg-sky-500",     badgeCls: "bg-sky-600/30 border-sky-500/50 text-sky-300" },
  { id: "emerald", label: "Emerald", nameClass: "text-emerald-300", dotClass: "bg-emerald-500", badgeCls: "bg-emerald-600/30 border-emerald-500/50 text-emerald-300" },
  { id: "rose",    label: "Rose",    nameClass: "text-rose-300",    dotClass: "bg-rose-500",    badgeCls: "bg-rose-600/30 border-rose-500/50 text-rose-300" },
  { id: "amber",   label: "Amber",   nameClass: "text-amber-300",   dotClass: "bg-amber-500",   badgeCls: "bg-amber-600/30 border-amber-500/50 text-amber-300" },
] as const;
type ThemeId = (typeof THEMES)[number]["id"];

const REACTION_EMOJIS = ["😊", "😢", "❤️", "🙏"] as const;

const TEXT_EMOJIS = [
  "😀","😂","🤣","😊","😍","🥰","😘","😅","😭","😢",
  "🤔","😐","😮","😴","🤩","😎","🥺","😷","🤦","🤷",
  "👋","👍","👎","👏","🙌","🙏","💪","🤝","❤️","💔",
  "🔥","✨","🎉","💯","🚀","⭐","🌟","💡","🎵","🎙️",
  "🙋","🤗","🧑‍🏫","📸","🎸","🤟","💜","💬","🏆","🎈",
];

async function resizeImage(dataUrl: string, maxW = 900): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement("canvas");
      canvas.width  = img.width  * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.80));
    };
    img.src = dataUrl;
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface ReplyTo { id: string; userId: string; userName: string; text: string; userPhoto?: string; imageUrl?: string; }

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userPhoto: string;
  text: string;
  createdAt: string;
  mentions: string[];
  replyTo?: ReplyTo;
  reactions?: Record<string, string[]>;
  imageUrl?: string;
  pinned?: boolean;
  channelId?: string;
}

export interface ChatWidgetProps {
  isAdmin: boolean;
  userId: string;
  userName: string;
  userPhoto: string;
  allMembers: Member[];
  // Optional configuration — lets you run multiple independent widget instances
  widgetId?:        string;          // localStorage namespace (default: "main")
  customChannels?:  ChatChannel[];   // override channel list
  fabIcon?:         React.ReactNode; // override FAB icon (closed state)
  fabGradient?:     string;          // CSS gradient for FAB bg
  fabBottomOffset?: number;          // px from bottom (default: 24)
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getMs(ts: any): number { return ts ? new Date(ts).getTime() : 0; }

function timeAgo(ts: any): string {
  if (!ts) return "";
  const date = new Date(ts);
  if (isNaN(date.getTime())) return "";
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getDateLabel(ts: any): string {
  if (!ts) return "";
  const date = new Date(ts);
  if (isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── URL detection regex (shared across renderText + link lists) ───────────────
const MSG_URL_RE = /https?:\/\/[^\s<>"']+/g;

function renderText(text: string): React.ReactNode {
  // Split on @mentions AND raw URLs
  const parts = text.split(/(https?:\/\/[^\s<>"']+|@\S+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      return <span key={i} className="text-indigo-400 font-medium">{part}</span>;
    }
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          title={part}
          onClick={e => e.stopPropagation()}
          className="inline-block max-w-full truncate align-bottom text-sky-400 hover:text-sky-300 underline decoration-sky-500/30 hover:decoration-sky-400 transition-colors"
        >{part}</a>
      );
    }
    return part;
  });
}

// ── Link preview card (uses microlink.io — free for cached URLs) ───────────────
type PreviewData = { title?: string; description?: string; image?: string };
const _previewCache: Record<string, PreviewData | null> = {}; // null = failed

function LinkPreview({ url }: { url: string }) {
  const [data,    setData]    = React.useState<PreviewData | "loading" | null>("loading");
  const mountRef = React.useRef(true);

  React.useEffect(() => {
    mountRef.current = true;
    if (url in _previewCache) { setData(_previewCache[url]); return; }
    fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`)
      .then(r => r.json())
      .then(json => {
        if (!mountRef.current) return;
        if (json.status === "success") {
          const d: PreviewData = {
            title:       json.data?.title       ?? undefined,
            description: json.data?.description ?? undefined,
            image:       json.data?.image?.url  ?? undefined,
          };
          _previewCache[url] = d;
          setData(d);
        } else {
          _previewCache[url] = null;
          setData(null);
        }
      })
      .catch(() => { _previewCache[url] = null; if (mountRef.current) setData(null); });
    return () => { mountRef.current = false; };
  }, [url]);

  let domain = "";
  try { domain = new URL(url).hostname.replace("www.", ""); } catch {}

  if (data === "loading") {
    return (
      <div className="mt-2 flex items-center gap-2.5 px-3 py-2 bg-gray-800/40 border border-gray-700/30 rounded-xl animate-pulse">
        <div className="w-10 h-10 bg-gray-700/60 rounded-lg shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2.5 bg-gray-700/60 rounded-full w-3/4" />
          <div className="h-2 bg-gray-700/40 rounded-full w-1/2" />
        </div>
      </div>
    );
  }
  if (!data) return null; // failed — show nothing extra (link is still in text)

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className="mt-2 flex gap-2.5 p-2.5 bg-gray-800/50 border border-gray-700/40 hover:border-sky-500/50 rounded-xl transition-all no-underline group/preview block"
    >
      {data.image && (
        <img
          src={data.image}
          alt=""
          className="w-14 h-14 object-cover rounded-lg shrink-0"
          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      )}
      <div className="flex-1 min-w-0">
        {data.title && (
          <p className="text-[11px] font-semibold text-gray-200 group-hover/preview:text-sky-300 line-clamp-1 transition-colors">{data.title}</p>
        )}
        {data.description && (
          <p className="text-[10px] text-gray-500 line-clamp-2 mt-0.5 leading-snug">{data.description}</p>
        )}
        <div className="flex items-center gap-1 mt-1.5">
          <img
            src={`https://www.google.com/s2/favicons?domain=${domain}&sz=12`}
            alt=""
            className="w-3 h-3 rounded"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <span className="text-[9px] text-gray-600 font-medium">{domain}</span>
          <ExternalLink size={8} className="text-gray-700 ml-0.5" />
        </div>
      </div>
    </a>
  );
}


// ── Component ─────────────────────────────────────────────────────────────────
export function ChatWidget({ isAdmin, userId, userName, userPhoto, allMembers,
  widgetId = "main", customChannels, fabIcon, fabGradient, fabBottomOffset = 24,
}: ChatWidgetProps) {

  const CH = customChannels ?? DEFAULT_CHANNELS;

  const cacheKey = (ch: string) => `wf_${widgetId}_cache_${ch}`;
  const loadCache = useCallback((ch: string): ChatMessage[] => {
    try { const v = localStorage.getItem(cacheKey(ch)); return v ? JSON.parse(v) : []; } catch { return []; }
  }, [widgetId]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveCache = useCallback((ch: string, msgs: ChatMessage[]) => {
    try { localStorage.setItem(cacheKey(ch), JSON.stringify(msgs)); } catch {}
  }, [widgetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── State ─────────────────────────────────────────────────────────────────
  const [open,          setOpen]          = useState(false);
  const [sidebarView,   setSidebarView]   = useState<SidebarView>("chat");
  const [chatTheme,     setChatTheme]     = useState<ThemeId>(() => {
    try { return (localStorage.getItem(`wf_${widgetId}_theme`) as ThemeId) || "indigo"; } catch { return "indigo"; }
  });
  const [activeChannel, setActiveChannel] = useState<ChannelId>(() => CH[0]?.id ?? "");
  const [messages,      setMessages]      = useState<ChatMessage[]>(() => loadCache(CH[0]?.id ?? ""));
  const [settled,       setSettled]       = useState(() => loadCache(CH[0]?.id ?? "").length > 0);
  const [input,         setInput]         = useState("");
  const [sending,       setSending]       = useState(false);
  const [deletingId,    setDeletingId]    = useState<string | null>(null);
  const [replyingTo,    setReplyingTo]    = useState<ReplyTo | null>(null);
  const [mentionQuery,    setMentionQuery]    = useState<string | null>(null);
  const [mentionStart,    setMentionStart]    = useState(0);
  const [mentionHlIdx,    setMentionHlIdx]    = useState(0);
  const [unreadDots,    setUnreadDots]    = useState<Set<string>>(new Set());
  const [reactingMsgId,   setReactingMsgId]   = useState<string | null>(null);
  const [searchQuery,     setSearchQuery]     = useState("");
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [attachedImage,   setAttachedImage]   = useState<string | null>(null);
  const [fileError,       setFileError]       = useState<string | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [allChannelMsgs, setAllChannelMsgs] = useState<Record<string, ChatMessage[]>>(() =>
    Object.fromEntries(CH.map(ch => [ch.id, loadCache(ch.id)]))
  );

  // ── Dev channel state ─────────────────────────────────────────────────────
  const [devActiveChannel,    setDevActiveChannel]    = useState<string>(DEV_CHANNELS[0].id);
  const [devMessages,         setDevMessages]         = useState<ChatMessage[]>([]);
  const [devSettled,          setDevSettled]          = useState(false);
  const [devSubView,          setDevSubView]          = useState<SidebarView>("chat");
  const [devInput,            setDevInput]            = useState("");
  const [devReplyingTo,       setDevReplyingTo]       = useState<ReplyTo | null>(null);
  const [devHighlightedMsgId, setDevHighlightedMsgId] = useState<string | null>(null);
  const [devAttachedImage,    setDevAttachedImage]    = useState<string | null>(null);
  const [devFileError,        setDevFileError]        = useState<string | null>(null);
  const [devEmojiPickerOpen,  setDevEmojiPickerOpen]  = useState(false);
  const [devSearchQuery,      setDevSearchQuery]      = useState("");
  const [devMentionQuery,     setDevMentionQuery]     = useState<string | null>(null);
  const [devMentionStart,     setDevMentionStart]     = useState(0);
  const [devMentionHlIdx,     setDevMentionHlIdx]     = useState(0);
  const [devReactingMsgId,    setDevReactingMsgId]    = useState<string | null>(null);
  const [devDeletingId,       setDevDeletingId]       = useState<string | null>(null);
  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<{ id: string; type: "success"|"error"|"info"; msg: string }[]>([]);
  // ── Message editing ──────────────────────────────────────────────────────
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [editText,     setEditText]     = useState("");
  const [devEditingId, setDevEditingId] = useState<string | null>(null);
  const [devEditText,  setDevEditText]  = useState("");
  // ── Track mentioned member IDs (for FCM targeting) ───────────────────────────
  const [mentionedIds,    setMentionedIds]    = useState<string[]>([]);
  const [devMentionedIds, setDevMentionedIds] = useState<string[]>([]);
  // ── Mobile long-press context menu ───────────────────────────────────────────
  const [longPressTarget, setLongPressTarget] = useState<{ msg: ChatMessage; isTeam: boolean } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressMoved = useRef(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const panelRef         = useRef<HTMLDivElement>(null);
  const messagesEndRef   = useRef<HTMLDivElement>(null);
  const inputRef         = useRef<HTMLTextAreaElement>(null);
  const searchInputRef   = useRef<HTMLInputElement>(null);
  const pollRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const devPollRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastReadRef      = useRef<Record<string, number>>({});
  const mountedRef       = useRef(true);
  const activeChRef      = useRef<string>(CH[0]?.id ?? "");
  const prevLenRef       = useRef(0);
  const devPrevLenRef    = useRef(0);
  const msgRefs          = useRef<Map<string, HTMLDivElement>>(new Map());
  const mentionListRef   = useRef<HTMLDivElement>(null);
  const fileInputRef     = useRef<HTMLInputElement>(null);
  // Tracks locally-pinned message IDs so pin state survives polling before Firestore commits
  const localPinnedRef   = useRef<Set<string>>(new Set());
  // Dev-specific refs
  const devInputRef      = useRef<HTMLTextAreaElement>(null);
  const devMessagesEndRef= useRef<HTMLDivElement>(null);
  const devMsgRefs       = useRef<Map<string, HTMLDivElement>>(new Map());
  const devSearchInputRef= useRef<HTMLInputElement>(null);
  const devFileInputRef  = useRef<HTMLInputElement>(null);
  const devLocalPinnedRef = useRef<Set<string>>(new Set());

  // ── Long-press handlers (mobile touch substitute for hover toolbar) ────────
  const getLongPressHandlers = (msg: ChatMessage, isTeam: boolean) => ({
    onTouchStart: (e: React.TouchEvent) => {
      longPressMoved.current = false;
      longPressTimer.current = setTimeout(() => {
        if (!longPressMoved.current) {
          try { navigator.vibrate?.(50); } catch {}
          setLongPressTarget({ msg, isTeam });
        }
      }, 500);
    },
    onTouchMove: () => {
      longPressMoved.current = true;
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    },
    onTouchEnd: () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    },
    onContextMenu: (e: React.MouseEvent) => {
      // Prevent native context menu on long-press (mobile WebKit)
      e.preventDefault();
    },
  });
  const devMentionListRef= useRef<HTMLDivElement>(null);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => { activeChRef.current = activeChannel; }, [activeChannel]);

  // ── Toast helper ─────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string, type: "success"|"error"|"info" = "error") => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev.slice(-4), { id, type, msg }]);
    setTimeout(() => { if (mountedRef.current) setToasts(prev => prev.filter(t => t.id !== id)); }, 4000);
  }, []);

  // ── Notification permission (once on first open) ──────────────────────────
  useEffect(() => {
    if (open && typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, [open]);

  useEffect(() => {
    CH.forEach(ch => {
      const v = localStorage.getItem(`wf_${widgetId}_read_${ch.id}`);
      if (v) lastReadRef.current[ch.id] = parseInt(v, 10);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Firestore real-time listener: Team Chat (zero Netlify reads, instant updates) ──
  useEffect(() => {
    if (!open || sidebarView !== "chat") return;
    const cached = loadCache(activeChannel);
    if (cached.length > 0) { setMessages(cached); setSettled(true); }
    else setSettled(false);
    const unsub = onSnapshot(
      query(collection(db, "chat_channels", activeChannel, "messages"), orderBy("createdAt", "asc"), limitToLast(50)),
      snap => {
        if (!mountedRef.current) return;
        const serverMsgs: ChatMessage[] = snap.docs.map(d => {
          const data = d.data();
          return { id: d.id, ...data, createdAt: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString() } as ChatMessage;
        });
        const merged = serverMsgs.map(m => {
          if (m.pinned) { localPinnedRef.current.delete(m.id); return m; }
          if (localPinnedRef.current.has(m.id)) return { ...m, pinned: true };
          return m;
        });
        setMessages(prev => {
          const latestTs = merged.length > 0 ? getMs(merged[merged.length - 1].createdAt) : 0;
          const pending  = prev.filter(m => m.id.startsWith("_opt_") && getMs(m.createdAt) > latestTs);
          return [...merged, ...pending];
        });
        setSettled(true);
        saveCache(activeChannel, merged);
        setAllChannelMsgs(prev => ({ ...prev, [activeChannel]: merged }));
        if (merged.length > 0) {
          const lastTs = getMs(merged[merged.length - 1].createdAt);
          lastReadRef.current[activeChannel] = lastTs;
          localStorage.setItem(`wf_chat_read_${activeChannel}`, String(lastTs));
        }
        setUnreadDots(prev => { const n = new Set(prev); n.delete(activeChannel); return n; });
      },
      () => { if (mountedRef.current) setSettled(true); }
    );
    return () => unsub();
  }, [open, activeChannel, sidebarView]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Focus search when switching to search view ──────────────────────────────
  useEffect(() => {
    if (open && sidebarView === "search") setTimeout(() => searchInputRef.current?.focus(), 80);
  }, [open, sidebarView]);

  // ── Background unread check: onSnapshot on other channels (zero Netlify cost) ──
  useEffect(() => {
    if (!open || !userId) return;
    const subs: (() => void)[] = [];
    CH.filter(ch => ch.id !== activeChannel).forEach(ch => {
      subs.push(onSnapshot(
        query(collection(db, "chat_channels", ch.id, "messages"), orderBy("createdAt", "asc"), limitToLast(1)),
        snap => {
          if (!snap.empty) {
            const data = snap.docs[snap.docs.length - 1].data();
            const lastTs = data.createdAt?.toDate?.()?.getTime() ?? 0;
            if (lastTs > (lastReadRef.current[ch.id] ?? 0) && data.userId !== userId) {
              setUnreadDots(prev => new Set([...prev, ch.id]));
            }
          }
        }
      ));
    });
    return () => subs.forEach(u => u());
  }, [open, userId, activeChannel]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scroll: instant on open/switch, smooth on new message ────────────────
  useEffect(() => {
    if (open && sidebarView === "chat" && messages.length > 0)
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [open, activeChannel, sidebarView]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || sidebarView !== "chat" || messages.length === 0) return;
    if (messages.length > prevLenRef.current)
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
    prevLenRef.current = messages.length;
  }, [messages.length, open, sidebarView]);

  // ── Firestore real-time listener: Dev Chat (zero Netlify reads, instant updates) ──
  useEffect(() => {
    if (!open || sidebarView !== "dev") return;
    setDevSettled(false);
    const unsub = onSnapshot(
      query(collection(db, "chat_channels", devActiveChannel, "messages"), orderBy("createdAt", "asc"), limitToLast(50)),
      snap => {
        if (!mountedRef.current) return;
        const serverMsgs: ChatMessage[] = snap.docs.map(d => {
          const data = d.data();
          return { id: d.id, ...data, createdAt: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString() } as ChatMessage;
        });
        const merged = serverMsgs.map(m => {
          if (m.pinned) { devLocalPinnedRef.current.delete(m.id); return m; }
          if (devLocalPinnedRef.current.has(m.id)) return { ...m, pinned: true };
          return m;
        });
        setDevMessages(prev => {
          const latestTs = merged.length > 0 ? getMs(merged[merged.length - 1].createdAt) : 0;
          const pending  = prev.filter(m => m.id.startsWith("_opt_") && getMs(m.createdAt) > latestTs);
          return [...merged, ...pending];
        });
        setDevSettled(true);
      },
      () => { if (mountedRef.current) setDevSettled(true); }
    );
    return () => unsub();
  }, [open, devActiveChannel, sidebarView]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dev scroll: instant on switch (also re-fires when returning to chat sub-view)
  useEffect(() => {
    if (open && sidebarView === "dev" && devMessages.length > 0)
      devMessagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [open, devActiveChannel, sidebarView, devSubView]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dev scroll: smooth on new message
  useEffect(() => {
    if (!open || sidebarView !== "dev" || devSubView !== "chat" || devMessages.length === 0) return;
    if (devMessages.length > devPrevLenRef.current)
      setTimeout(() => devMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
    devPrevLenRef.current = devMessages.length;
  }, [devMessages.length, open, sidebarView, devSubView]);

  const switchDevChannel = (id: string) => {
    if (id === devActiveChannel) return;
    setDevActiveChannel(id);
    setDevMessages([]);
    setDevSettled(false);
    setDevSubView("chat");
    setDevDeletingId(null); setDevReplyingTo(null); setDevMentionQuery(null); setDevReactingMsgId(null);
  };

  const sendDevMessage = async () => {
    const trimmed = devInput.trim();
    if ((!trimmed && !devAttachedImage) || sending) return;
    const mentions = (trimmed.match(/@(\S+)/g) ?? []).map((m: string) => m.slice(1));
    const imgToSend = devAttachedImage;
    const replySnapshot = devReplyingTo;
    // Optimistic: clear input immediately so user can type again
    setDevInput(""); setDevMentionQuery(null); setDevReplyingTo(null); setDevAttachedImage(null);
    setSending(true);
    const optimisticId = `_opt_${Date.now()}`;
    const optimistic: ChatMessage = {
      id: optimisticId, userId, userName,
      userPhoto: userPhoto || "", text: trimmed, mentions,
      createdAt: new Date().toISOString(),
      replyTo: replySnapshot ?? undefined,
      imageUrl: imgToSend ?? undefined,
    };
    setDevMessages(prev => [...prev, optimistic]);
    try {
      const res = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: devActiveChannel, text: trimmed,
          userId, userName, userPhoto,
          replyTo: replySnapshot?.id
            ? { id: replySnapshot.id, userId: replySnapshot.userId, text: replySnapshot.text, userName: replySnapshot.userName, userPhoto: replySnapshot.userPhoto }
            : undefined,
          imageUrl: imgToSend || undefined,
        }),
      });
      if (res.ok && mountedRef.current) {
        // onSnapshot handles the real message — just clear optimistic if server confirmed
        setDevMentionedIds([]);
      } else if (!res.ok && mountedRef.current) {
        setDevMessages(prev => prev.filter(m => m.id !== optimisticId));
        setDevInput(trimmed);
        showToast("Message failed to send. Please try again.");
      }
    } catch {
      if (mountedRef.current) {
        setDevMessages(prev => prev.filter(m => m.id !== optimisticId));
        setDevInput(trimmed);
        showToast("Couldn't send. Check your connection.");
      }
    } finally { if (mountedRef.current) setSending(false); }
  };

  const toggleDevPin = async (msg: ChatMessage) => {
    const newPinned = !msg.pinned;
    if (newPinned) devLocalPinnedRef.current.add(msg.id);
    else devLocalPinnedRef.current.delete(msg.id);
    setDevMessages(prev => prev.map(m => m.id === msg.id ? { ...m, pinned: newPinned } : m));
    try {
      await fetch("/api/chat/pin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: devActiveChannel, messageId: msg.id, pinned: newPinned }),
      });
      // onSnapshot will reflect the confirmed pin state automatically
    } catch {
      if (newPinned) devLocalPinnedRef.current.delete(msg.id);
      else devLocalPinnedRef.current.add(msg.id);
      setDevMessages(prev => prev.map(m => m.id === msg.id ? { ...m, pinned: msg.pinned } : m));
    }
  };

  const toggleDevReaction = async (msg: ChatMessage, emoji: string) => {
    if (!userId) return;
    const hasReacted = (msg.reactions?.[emoji] ?? []).includes(userId);
    setDevMessages(prev => prev.map(m => {
      if (m.id !== msg.id) return m;
      const current = m.reactions?.[emoji] ?? [];
      const updated = hasReacted ? current.filter(id => id !== userId) : [...current, userId];
      const newR = { ...(m.reactions ?? {}), [emoji]: updated };
      if (newR[emoji].length === 0) delete newR[emoji];
      return { ...m, reactions: newR };
    }));
    setDevReactingMsgId(null);
    try {
      await fetch("/api/chat/reaction", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: devActiveChannel, messageId: msg.id, emoji, userId, action: hasReacted ? "remove" : "add" }),
      });
    } catch {}
  };

  const deleteDevMessage = async (msgId: string) => {
    setDevDeletingId(null);
    let backup: ChatMessage | undefined;
    setDevMessages(prev => { backup = prev.find(m => m.id === msgId); return prev.filter(m => m.id !== msgId); });
    try {
      const res = await fetch(`/api/chat/message/${msgId}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: devActiveChannel }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      if (mountedRef.current && backup) {
        setDevMessages(prev => [...prev, backup!].sort((a, b) => getMs(a.createdAt) - getMs(b.createdAt)));
        showToast("Couldn't delete message. Try again.");
      }
    }
  };

  const handleDevInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart ?? val.length;
    setDevInput(val);
    const match = val.slice(0, cursor).match(/@(\w*)$/);
    if (match) { setDevMentionQuery(match[1].toLowerCase()); setDevMentionStart(cursor - match[0].length); setDevMentionHlIdx(0); }
    else setDevMentionQuery(null);
  };

  const insertDevMention = (m: Member) => {
    const name = (m.name || m.firstName || "").replace(/\s+/g, "");
    setDevInput(`${devInput.slice(0, devMentionStart)}@${name} ${devInput.slice(devMentionStart + 1 + (devMentionQuery?.length ?? 0))}`);
    if (m.id) setDevMentionedIds(prev => [...prev.filter(id => id !== m.id), m.id!]);
    setDevMentionQuery(null);
    setTimeout(() => devInputRef.current?.focus(), 0);
  };

  const insertDevEmoji = (emoji: string) => {
    const el = devInputRef.current;
    if (!el) { setDevInput(p => p + emoji); setDevEmojiPickerOpen(false); return; }
    const start = el.selectionStart ?? devInput.length;
    const end   = el.selectionEnd   ?? devInput.length;
    const next  = devInput.slice(0, start) + emoji + devInput.slice(end);
    setDevInput(next);
    setDevEmojiPickerOpen(false);
    setTimeout(() => { el.focus(); el.setSelectionRange(start + emoji.length, start + emoji.length); }, 0);
  };

  const handleDevFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > MAX_FILE_BYTES) { setDevFileError(`Image too large (${(file.size/1024/1024).toFixed(1)} MB). Limit is 10 MB.`); e.target.value = ""; return; }
    setDevFileError(null);
    const reader = new FileReader();
    reader.onload = async ev => { const r = await resizeImage(ev.target?.result as string); setDevAttachedImage(r); };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleDevPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imgItem = Array.from(e.clipboardData.items).find(it => it.type.startsWith("image/"));
    if (!imgItem) return;
    e.preventDefault();
    const file = imgItem.getAsFile(); if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setDevFileError(`Pasted image too large. Limit is 10 MB.`); return; }
    setDevFileError(null);
    const reader = new FileReader();
    reader.onload = async ev => { const r = await resizeImage(ev.target?.result as string); setDevAttachedImage(r); };
    reader.readAsDataURL(file);
  };

  const handleDevKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (devMentionSuggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setDevMentionHlIdx(i => Math.min(i + 1, devMentionSuggestions.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setDevMentionHlIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); insertDevMention(devMentionSuggestions[devMentionHlIdx]); return; }
      if (e.key === "Escape") { setDevMentionQuery(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendDevMessage(); }
    if (e.key === "Escape") setDevMentionQuery(null);
  };

  // Dev effects
  useEffect(() => {
    if (open && sidebarView === "dev" && devSubView === "search") setTimeout(() => devSearchInputRef.current?.focus(), 80);
  }, [open, sidebarView, devSubView]);

  useEffect(() => {
    if (!devHighlightedMsgId) return;
    const raf = requestAnimationFrame(() => {
      const el = devMsgRefs.current.get(devHighlightedMsgId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const timer = setTimeout(() => setDevHighlightedMsgId(null), 1800);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [devHighlightedMsgId, devMessages]);

  useEffect(() => {
    if (!devMentionListRef.current) return;
    const items = devMentionListRef.current.querySelectorAll("button");
    items[devMentionHlIdx]?.scrollIntoView({ block: "nearest" });
  }, [devMentionHlIdx]);

  // Dev textarea auto-resize
  useEffect(() => {
    if (devInputRef.current) {
      devInputRef.current.style.height = "auto";
      devInputRef.current.style.height = `${Math.min(devInputRef.current.scrollHeight, 112)}px`;
    }
  }, [devInput]);

  // ── Scroll-to & highlight message (from search/pinned/mention jump) ────────
  useEffect(() => {
    if (!highlightedMsgId) return;
    // rAF ensures the DOM has painted before we look up the ref —
    // critical when switching from Pinned/Search sidebar where messages were unmounted
    const raf = requestAnimationFrame(() => {
      const el = msgRefs.current.get(highlightedMsgId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const timer = setTimeout(() => setHighlightedMsgId(null), 1800);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [highlightedMsgId, messages]); // re-runs when messages update after channel fetch

  // ── Browser notification for new @mentions (zero Netlify cost) ────────────
  useEffect(() => {
    if (!open || !userId || !userName) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const full  = (userName || "").toLowerCase().replace(/\s+/g, "");
    const first = (userName || "").trim().split(/\s+/)[0]?.toLowerCase() || "";
    if (!full) return;
    const seenThreshold = lastReadRef.current[activeChannel] ?? 0;
    messages.forEach(m => {
      if (m.userId === userId) return; // never notify for own messages
      if (getMs(m.createdAt) <= seenThreshold) return; // already seen
      const tokens = [...(m.text || "").matchAll(/@(\w+)/g)].map(x => x[1].toLowerCase());
      const hit = tokens.some(t =>
        t === full || (first.length >= 2 && t === first) ||
        full.startsWith(t) || (first.length >= 2 && t.startsWith(first))
      );
      if (!hit) return;
      try {
        new Notification(`💬 ${m.userName} mentioned you`, {
          body: (m.text || "").slice(0, 100),
          icon: m.userPhoto || "/icon-192.png",
          tag: `chat-mention-${m.id}`, // deduplicated by browser
          renotify: false,
        });
      } catch {}
    });
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll mention list when arrow-keying through suggestions ─────────
  useEffect(() => {
    if (!mentionListRef.current) return;
    const items = mentionListRef.current.querySelectorAll("button");
    items[mentionHlIdx]?.scrollIntoView({ block: "nearest" });
  }, [mentionHlIdx]);

  // ── Auto-resize textarea ─────────────────────────────────────────────────
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  // ── Outside click → close ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false); setReactingMsgId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if ((!text && !attachedImage) || !userId || sending) return;
    const mentions = (text.match(/@(\S+)/g) ?? []).map(m => m.slice(1));
    const imgToSend = attachedImage;
    const idsToNotify = mentionedIds;
    setInput(""); setSending(true); setAttachedImage(null); setMentionedIds([]);
    const optimisticId = `_opt_${Date.now()}`;
    const optimistic: ChatMessage = {
      id: optimisticId, userId, userName,
      userPhoto: userPhoto || "", text: text.trim(), mentions,
      createdAt: new Date().toISOString(),
      replyTo: replyingTo ?? undefined,
      imageUrl: imgToSend ?? undefined,
    };
    setMessages(prev => [...prev, optimistic]);
    setReplyingTo(null);
    try {
      const res = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: activeChannel, userId, userName,
          userPhoto: userPhoto || "", text,
          mentionUserIds: idsToNotify,
          ...(replyingTo  ? { replyTo:  replyingTo  } : {}),
          ...(imgToSend   ? { imageUrl: imgToSend   } : {}),
        }),
      });
      if (!res.ok && mountedRef.current) {
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
        showToast("Message failed. Please try again.");
      }
      // onSnapshot fires automatically with the confirmed message — no manual fetch needed
    } catch {
      if (mountedRef.current) setMessages(prev => prev.filter(m => m.id !== optimisticId));
    } finally {
      if (mountedRef.current) setSending(false);
    }
  }, [input, attachedImage, userId, userName, userPhoto, activeChannel, sending, replyingTo, mentionedIds, showToast]);

  // ── Delete message ────────────────────────────────────────────────────────
  const deleteMessage = useCallback(async (msgId: string) => {
    setDeletingId(null);
    let backup: ChatMessage | undefined;
    setMessages(prev => { backup = prev.find(m => m.id === msgId); return prev.filter(m => m.id !== msgId); });
    try {
      const res = await fetch(`/api/chat/message/${msgId}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: activeChannel }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      if (mountedRef.current && backup) {
        setMessages(prev => [...prev, backup!].sort((a, b) => getMs(a.createdAt) - getMs(b.createdAt)));
        showToast("Couldn't delete message. Try again.");
      }
    }
  }, [activeChannel, showToast]);

  // ── Toggle pin message ─────────────────────────────────────────────────
  const togglePin = useCallback(async (msg: ChatMessage) => {
    const newPinned = !msg.pinned;
    const channelId = (msg.channelId as ChannelId) || activeChannel;
    // Update local pin ref BEFORE any async work
    if (newPinned) localPinnedRef.current.add(msg.id);
    else           localPinnedRef.current.delete(msg.id);
    // Optimistic update
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, pinned: newPinned } : m));
    setAllChannelMsgs(prev => ({
      ...prev,
      [channelId]: (prev[channelId] ?? []).map(m => m.id === msg.id ? { ...m, pinned: newPinned } : m),
    }));
    try {
      await fetch("/api/chat/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, messageId: msg.id, pinned: newPinned }),
      });
      // onSnapshot auto-reflects the confirmed pin state — no manual refresh needed
    } catch {
      // Rollback on failure
      if (newPinned) localPinnedRef.current.delete(msg.id);
      else           localPinnedRef.current.add(msg.id);
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, pinned: msg.pinned } : m));
    }
  }, [activeChannel]);

  // ── Edit message (Team) ─────────────────────────────────────────────────────
  const saveEditMessage = useCallback(async () => {
    if (!editingId || !editText.trim()) { setEditingId(null); return; }
    const newText = editText.trim();
    setEditingId(null);
    // Optimistic update
    setMessages(prev => prev.map(m => m.id === editingId ? { ...m, text: newText, editedAt: new Date().toISOString() } : m));
    try {
      const res = await fetch(`/api/chat/message/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: activeChannel, text: newText, userId }),
      });
      if (!res.ok) showToast("Couldn't save edit. Try again.");
    } catch { showToast("Edit failed. Check your connection."); }
  }, [editingId, editText, activeChannel, userId, showToast]);

  // ── Edit message (Dev) ─────────────────────────────────────────────────────
  const saveEditDevMessage = useCallback(async () => {
    if (!devEditingId || !devEditText.trim()) { setDevEditingId(null); return; }
    const newText = devEditText.trim();
    setDevEditingId(null);
    setDevMessages(prev => prev.map(m => m.id === devEditingId ? { ...m, text: newText, editedAt: new Date().toISOString() } : m));
    try {
      const res = await fetch(`/api/chat/message/${devEditingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: devActiveChannel, text: newText, userId }),
      });
      if (!res.ok) showToast("Couldn't save edit. Try again.");
    } catch { showToast("Edit failed. Check your connection."); }
  }, [devEditingId, devEditText, devActiveChannel, userId, showToast]);

  // ── Toggle emoji reaction ─────────────────────────────────────────────────
  const toggleReaction = useCallback(async (msg: ChatMessage, emoji: string) => {
    if (!userId) return;
    const hasReacted = (msg.reactions?.[emoji] ?? []).includes(userId);
    setMessages(prev => prev.map(m => {
      if (m.id !== msg.id) return m;
      const current = m.reactions?.[emoji] ?? [];
      const updated = hasReacted ? current.filter(id => id !== userId) : [...current, userId];
      const newReactions = { ...(m.reactions ?? {}), [emoji]: updated };
      if (newReactions[emoji].length === 0) delete newReactions[emoji];
      return { ...m, reactions: newReactions };
    }));
    setReactingMsgId(null);
    try {
      await fetch("/api/chat/reaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: activeChannel, messageId: msg.id, emoji, userId, action: hasReacted ? "remove" : "add" }),
      });
    } catch {}
  }, [userId, activeChannel]);

  // ── Input handlers ────────────────────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart ?? val.length;
    setInput(val);
    const match = val.slice(0, cursor).match(/@(\w*)$/);
    if (match) { setMentionQuery(match[1].toLowerCase()); setMentionStart(cursor - match[0].length); setMentionHlIdx(0); }
    else setMentionQuery(null);
  };

  const insertMention = (m: Member) => {
    const name = (m.name || m.firstName || "").replace(/\s+/g, "");
    setInput(`${input.slice(0, mentionStart)}@${name} ${input.slice(mentionStart + 1 + (mentionQuery?.length ?? 0))}`);
    if (m.id) setMentionedIds(prev => [...prev.filter(id => id !== m.id), m.id!]);
    setMentionQuery(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    if (!el) { setInput(p => p + emoji); setEmojiPickerOpen(false); return; }
    const start = el.selectionStart ?? input.length;
    const end   = el.selectionEnd   ?? input.length;
    const next  = input.slice(0, start) + emoji + input.slice(end);
    setInput(next);
    setEmojiPickerOpen(false);
    setTimeout(() => { el.focus(); el.setSelectionRange(start + emoji.length, start + emoji.length); }, 0);
  };

  const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB — images are resized anyway so this is just a sanity guard

  const handleFileAttach = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError(`Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Limit is 10 MB.`);
      e.target.value = "";
      return;
    }
    setFileError(null);
    const reader = new FileReader();
    reader.onload = async ev => {
      const resized = await resizeImage(ev.target?.result as string);
      setAttachedImage(resized);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, []);

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageItem = Array.from(e.clipboardData.items).find(it => it.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError(`Pasted image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Limit is 10 MB.`);
      return;
    }
    setFileError(null);
    const reader = new FileReader();
    reader.onload = async ev => {
      const resized = await resizeImage(ev.target?.result as string);
      setAttachedImage(resized);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // When mention dropdown is open: arrow keys navigate, Enter selects, Escape closes
    if (mentionSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionHlIdx(i => Math.min(i + 1, mentionSuggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionHlIdx(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        insertMention(mentionSuggestions[mentionHlIdx]);
        return;
      }
      if (e.key === "Escape") { setMentionQuery(null); return; }
    }
    // Normal input: Enter sends, Escape closes reply
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    if (e.key === "Escape") setMentionQuery(null);
  };

  const switchChannel = (id: ChannelId) => {
    if (id === activeChannel) return;
    setActiveChannel(id);
    const cached = loadCache(id);
    setMessages(cached); setSettled(cached.length > 0);
    setDeletingId(null); setReplyingTo(null); setMentionQuery(null); setReactingMsgId(null);
    // clear unread dot for the channel we're now viewing
    setUnreadDots(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const canDelete = (msg: ChatMessage) => isAdmin || msg.userId === userId;
  const activeCh    = CH.find(c => c.id === activeChannel) ?? CH[0];
  const devActiveCh = DEV_CHANNELS.find(c => c.id === devActiveChannel) ?? DEV_CHANNELS[0];
  const theme     = THEMES.find(t => t.id === chatTheme) ?? THEMES[0];
  const totalUnread = unreadDots.size;

  // If allMembers prop is empty (members API timeout / cache expired), build a
  // fallback list from unique authors seen in chat messages so @mention always works
  const effectiveMembers = React.useMemo<Member[]>(() => {
    if (allMembers.length > 0) return allMembers;
    const seen = new Map<string, Member>();
    const allMsgs = [
      ...messages,
      ...Object.values(allChannelMsgs).flat(),
    ];
    for (const m of allMsgs) {
      if (m.userId && !seen.has(m.userId)) {
        seen.set(m.userId, {
          id: m.userId,
          name: m.userName ?? "",
          photo: m.userPhoto || "",
          email: "",
          roles: [],
        } as Member);
      }
    }
    return Array.from(seen.values());
  }, [allMembers, messages, allChannelMsgs]);

  const mentionSuggestions = mentionQuery !== null
    ? effectiveMembers.filter(m => (m.name || m.firstName || "").toLowerCase().includes(mentionQuery ?? ""))
    : [];

  // ── Computed: mentions in active channel ─────────────────────────────────
  const mentionMessages = React.useMemo(() => {
    const full  = (userName || "").toLowerCase().replace(/\s+/g, ""); // e.g. "jaymark"
    const first = (userName || "").trim().split(/\s+/)[0]?.toLowerCase() || ""; // e.g. "jay"
    if (!full) return [];
    return messages
      .filter(msg => {
        // Extract every @word written in the text as discrete tokens
        const textTokens = [...(msg.text || "").matchAll(/@(\w+)/g)].map(m => m[1].toLowerCase());
        const storedTokens = (msg.mentions || []).map((m: string) => m.toLowerCase());
        const allTokens = [...new Set([...textTokens, ...storedTokens])];
        return allTokens.some(t =>
          t === full ||
          (first.length >= 2 && t === first) ||
          full.startsWith(t) ||                   // our name is longer, e.g. "jaymark" starts with "jay"
          (first.length >= 2 && t.startsWith(first)) // mention starts with our first name
        );
      })
      .sort((a, b) => getMs(b.createdAt) - getMs(a.createdAt));
  }, [messages, userName]);

  // ── Computed: search in active channel ───────────────────────────────────
  const searchResults = React.useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return messages
      .filter(msg => msg.text.toLowerCase().includes(q))
      .sort((a, b) => getMs(b.createdAt) - getMs(a.createdAt));
  }, [messages, searchQuery]);

  // ── Group messages (date separators + sender grouping) ───────────────────
  const grouped = React.useMemo(() => {
    let lastDate = "", lastUser = "", lastTs = 0;
    return messages.map(msg => {
      const d      = getDateLabel(msg.createdAt);
      const showDate  = d !== lastDate;
      const ts     = getMs(msg.createdAt);
      const isGrouped = !showDate && msg.userId === lastUser && ts - lastTs < 5 * 60_000;
      lastDate = d; lastUser = msg.userId; lastTs = ts;
      return { msg, isGrouped, showDate, dateLabel: d };
    });
  }, [messages]);

  // ── Sidebar icon button ───────────────────────────────────────────────────
  const SidebarBtn = ({ view, icon, title, badge }: { view: SidebarView; icon: React.ReactNode; title: string; badge?: number }) => (
    <button
      onClick={() => setSidebarView(v => v === view ? "chat" : view)}
      title={title}
      className={`relative w-9 h-9 flex items-center justify-center rounded-xl transition-all ${
        sidebarView === view ? "bg-indigo-600/30 text-indigo-400" : "text-gray-600 hover:text-gray-300 hover:bg-gray-800/60"
      }`}
    >
      {icon}
      {badge != null && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 flex items-center justify-center rounded-full bg-indigo-500 text-white text-[8px] font-bold px-0.5">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );

  // ── Shared close button ───────────────────────────────────────────────────
  const CloseBtn = () => (
    <button onClick={() => setOpen(false)} className="hidden sm:flex p-1.5 text-gray-600 hover:text-gray-300 rounded-lg hover:bg-gray-800 transition-colors">
      <X size={14} />
    </button>
  );

  // ── Computed: pinned in active channel ───────────────────────────────────
  const pinnedMessages = React.useMemo(() =>
    messages.filter(m => m.pinned).sort((a, b) => getMs(b.createdAt) - getMs(a.createdAt)),
  [messages]);

  // ── Images in active channel ─────────────────────────────────────────────
  const imageMessages = React.useMemo(() =>
    messages.filter(m => m.imageUrl).sort((a, b) => getMs(b.createdAt) - getMs(a.createdAt)),
  [messages]);

  // ── Links in active channel ──────────────────────────────────────────────
  const linkMessages = React.useMemo(() =>
    messages
      .map(m => { const urls = [...(m.text.match(MSG_URL_RE) ?? [])]; return urls.length > 0 ? { ...m, urls } : null; })
      .filter(Boolean)
      .sort((a, b) => getMs(b!.createdAt) - getMs(a!.createdAt)) as (ChatMessage & { urls: string[] })[],
  [messages]);

  // ── Dev derived values ────────────────────────────────────────────────────
  const canDevDelete = (msg: ChatMessage) => isAdmin || msg.userId === userId;
  const devMentionSuggestions = devMentionQuery !== null
    ? effectiveMembers.filter(m => (m.name || m.firstName || "").toLowerCase().includes(devMentionQuery ?? ""))
    : [];
  const devGrouped = React.useMemo(() => {
    let lastDate = "", lastUser = "", lastTs = 0;
    return devMessages.map(msg => {
      const d = getDateLabel(msg.createdAt);
      const showDate = d !== lastDate;
      const ts = getMs(msg.createdAt);
      const isGrouped = !showDate && msg.userId === lastUser && ts - lastTs < 5 * 60_000;
      lastDate = d; lastUser = msg.userId; lastTs = ts;
      return { msg, isGrouped, showDate, dateLabel: d };
    });
  }, [devMessages]);
  const devMentionMessages = React.useMemo(() => {
    const full  = (userName || "").toLowerCase().replace(/\s+/g, ""); // e.g. "jaymark"
    const first = (userName || "").trim().split(/\s+/)[0]?.toLowerCase() || ""; // e.g. "jay"
    if (!full) return [];
    return devMessages.filter(msg => {
      // Extract every @word written in the text as discrete tokens
      const textTokens = [...(msg.text || "").matchAll(/@(\w+)/g)].map(m => m[1].toLowerCase());
      const storedTokens = (msg.mentions || []).map((m: string) => m.toLowerCase());
      const allTokens = [...new Set([...textTokens, ...storedTokens])];
      return allTokens.some(t =>
        t === full ||
        (first.length >= 2 && t === first) ||
        full.startsWith(t) ||                   // our name is longer, e.g. "jaymark" starts with "jay"
        (first.length >= 2 && t.startsWith(first)) // mention starts with our first name
      );
    }).sort((a, b) => getMs(b.createdAt) - getMs(a.createdAt));
  }, [devMessages, userName]);
  const devPinnedMessages = React.useMemo(() =>
    devMessages.filter(m => m.pinned).sort((a, b) => getMs(b.createdAt) - getMs(a.createdAt)),
  [devMessages]);
  const devImageMessages = React.useMemo(() =>
    devMessages.filter(m => m.imageUrl).sort((a, b) => getMs(b.createdAt) - getMs(a.createdAt)),
  [devMessages]);
  const devLinkMessages = React.useMemo(() =>
    devMessages.map(m => { const urls = [...(m.text?.match(MSG_URL_RE) ?? [])]; return urls.length > 0 ? { ...m, urls } : null; })
      .filter(Boolean).sort((a, b) => getMs(b!.createdAt) - getMs(a!.createdAt)) as (ChatMessage & { urls: string[] })[],
  [devMessages]);
  const devSearchResults = React.useMemo(() => {
    if (!devSearchQuery.trim()) return [];
    const q = devSearchQuery.toLowerCase();
    return devMessages.filter(msg => msg.text?.toLowerCase().includes(q)).sort((a, b) => getMs(b.createdAt) - getMs(a.createdAt));
  }, [devMessages, devSearchQuery]);

  // ── Dev sidebar button (controls devSubView, emerald accent) ──────────────
  const DevSidebarBtn = ({ view, icon, title, badge }: { view: SidebarView; icon: React.ReactNode; title: string; badge?: number }) => (
    <button
      onClick={() => setDevSubView(v => v === view ? "chat" : view)}
      title={title}
      className={`relative w-9 h-9 flex items-center justify-center rounded-xl transition-all ${
        devSubView === view ? "bg-emerald-600/30 text-emerald-400" : "text-gray-600 hover:text-gray-300 hover:bg-gray-800/60"
      }`}
    >
      {icon}
      {badge != null && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 flex items-center justify-center rounded-full bg-emerald-500 text-white text-[8px] font-bold px-0.5">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes msgPulseFind {
          0%   { background: rgba(99,102,241,0.22); box-shadow: 0 0 0 2px rgba(99,102,241,0.6); }
          35%  { background: rgba(99,102,241,0.08); box-shadow: 0 0 0 1px rgba(99,102,241,0.2); }
          65%  { background: rgba(99,102,241,0.16); box-shadow: 0 0 0 2px rgba(99,102,241,0.45); }
          100% { background: transparent;            box-shadow: none; }
        }
        .msg-found {
          animation: msgPulseFind 1.8s ease forwards;
          border-radius: 12px;
        }
        @keyframes toastIn {
          from { opacity:0; transform:translateX(100%) scale(0.95); }
          to   { opacity:1; transform:translateX(0)   scale(1); }
        }
        .wf-toast { animation: toastIn 0.22s cubic-bezier(.22,.68,0,1.2) forwards; }
        @keyframes msgPulseFindDev {
          0%   { background: rgba(16,185,129,0.22); box-shadow: 0 0 0 2px rgba(16,185,129,0.6); }
          35%  { background: rgba(16,185,129,0.08); box-shadow: 0 0 0 1px rgba(16,185,129,0.2); }
          65%  { background: rgba(16,185,129,0.16); box-shadow: 0 0 0 2px rgba(16,185,129,0.45); }
          100% { background: transparent;            box-shadow: none; }
        }
        .msg-found-dev {
          animation: msgPulseFindDev 1.8s ease forwards;
          border-radius: 12px;
        }
        @keyframes slideUpSheet {
          from { transform: translateY(100%); opacity: 0.6; }
          to   { transform: translateY(0);    opacity: 1;   }
        }
      `}</style>
      <div ref={panelRef} className="fixed right-0 sm:right-4 z-[300] flex flex-col items-end gap-0" style={{ bottom: 0 }}>

      {/* ── Toast notifications (fixed overlay, never covered by panel) ──── */}
      {toasts.length > 0 && (
        <div className="fixed bottom-24 sm:bottom-28 right-4 sm:right-8 flex flex-col-reverse gap-1.5 pointer-events-none z-[500] max-w-[280px] sm:max-w-[300px]">
          {toasts.map(t => (
            <div key={t.id} className={`wf-toast flex items-start gap-2 rounded-2xl px-3.5 py-2.5 text-[11px] font-semibold shadow-2xl border ${
              t.type === "error"   ? "bg-red-950/97 border-red-800/60 text-red-100" :
              t.type === "success" ? "bg-emerald-950/97 border-emerald-800/60 text-emerald-100" :
                                     "bg-gray-900/97 border-gray-700/60 text-gray-100"
            }`}>
              <span className="mt-px shrink-0">{t.type === "error" ? "⚠️" : t.type === "success" ? "✅" : "💬"}</span>
              <span className="leading-snug">{t.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Chat Panel ──────────────────────────────────────────────────────── */}
      {open && (
        <div
          className="flex fixed inset-0 sm:static sm:w-[540px] sm:h-[min(600px,calc(100dvh-52px))] sm:rounded-t-2xl overflow-hidden"
          style={{ boxShadow: "0 -4px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.13)", background: "#09090b" }}
        >
          {/* ────────── LEFT SIDEBAR ────────── */}
          <div className="hidden sm:flex w-14 flex-col items-center py-3 gap-1.5 border-r border-gray-800/60 shrink-0" style={{ background: "#0c0c0f" }}>
            {/* Chat — always top */}
            <SidebarBtn view="chat" icon={<MessageSquare size={17} />} title="Team Chats" />
            {/* Dev channels — below chat */}
            <SidebarBtn view="dev" icon={<Code2 size={17} />} title="Dev Chats" />
            <div className="flex-1" />
            {/* Team utility buttons — shown only in team mode */}
            {sidebarView !== "dev" && (<>
              <SidebarBtn view="mentions" icon={<AtSign    size={17} />} title="Mentions" badge={mentionMessages.length} />
              <SidebarBtn view="pinned"   icon={<Pin       size={17} />} title="Pinned"   badge={pinnedMessages.length || undefined} />
              <SidebarBtn view="images"   icon={<ImageIcon size={17} />} title="Images"   badge={imageMessages.length || undefined} />
              <SidebarBtn view="links"    icon={<Link2     size={17} />} title="Links"    badge={linkMessages.length || undefined} />
              <SidebarBtn view="search"   icon={<Search    size={17} />} title="Search" />
              <SidebarBtn view="settings" icon={<Settings  size={17} />} title="Settings" />
            </>)}
            {/* Dev utility buttons — shown only in dev mode (emerald, controls devSubView) */}
            {sidebarView === "dev" && (<>
              <DevSidebarBtn view="mentions" icon={<AtSign    size={17} />} title="Dev Mentions" badge={devMentionMessages.length || undefined} />
              <DevSidebarBtn view="pinned"   icon={<Pin       size={17} />} title="Dev Pinned"   badge={devPinnedMessages.length || undefined} />
              <DevSidebarBtn view="images"   icon={<ImageIcon size={17} />} title="Dev Images"   badge={devImageMessages.length || undefined} />
              <DevSidebarBtn view="links"    icon={<Link2     size={17} />} title="Dev Links"    badge={devLinkMessages.length || undefined} />
              <DevSidebarBtn view="search"   icon={<Search    size={17} />} title="Dev Search" />
              <DevSidebarBtn view="settings" icon={<Settings  size={17} />} title="Settings" />
            </>)}
          </div>

          {/* ────────── MAIN CONTENT ────────── */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

            {/* ── Mobile top nav bar (replaces left sidebar on small screens) sm:hidden ── */}
            <div className="flex sm:hidden items-center gap-1 px-3 py-2 border-b border-gray-800/60 shrink-0" style={{ background: "#0c0c0f" }}>
              {/* Team / Dev toggle */}
              <button onClick={() => setSidebarView("chat")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${sidebarView !== "dev" ? "bg-indigo-600/30 text-indigo-300" : "text-gray-500 hover:text-gray-300"}`}>
                <MessageSquare size={14} /><span>Team</span>
              </button>
              <button onClick={() => setSidebarView("dev")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${sidebarView === "dev" ? "bg-emerald-600/30 text-emerald-300" : "text-gray-500 hover:text-gray-300"}`}>
                <Code2 size={14} /><span>Dev</span>
              </button>
              <div className="flex-1" />
              {/* Utility — Team mode */}
              {sidebarView !== "dev" && (<>
                <button onClick={() => setSidebarView("mentions")} className={`relative p-2 rounded-lg transition-all ${sidebarView === "mentions" ? "text-indigo-400 bg-indigo-900/30" : "text-gray-600 hover:text-gray-300"}`}>
                  <AtSign size={15} />
                  {mentionMessages.length > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[13px] h-3.5 flex items-center justify-center rounded-full bg-indigo-500 text-white text-[8px] font-bold px-0.5">{mentionMessages.length}</span>}
                </button>
                <button onClick={() => setSidebarView("pinned")} className={`relative p-2 rounded-lg transition-all ${sidebarView === "pinned" ? "text-indigo-400 bg-indigo-900/30" : "text-gray-600 hover:text-gray-300"}`}>
                  <Pin size={15} />
                  {pinnedMessages.length > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[13px] h-3.5 flex items-center justify-center rounded-full bg-indigo-500 text-white text-[8px] font-bold px-0.5">{pinnedMessages.length}</span>}
                </button>
                <button onClick={() => setSidebarView("images")} className={`relative p-2 rounded-lg transition-all ${sidebarView === "images" ? "text-indigo-400 bg-indigo-900/30" : "text-gray-600 hover:text-gray-300"}`}>
                  <ImageIcon size={15} />
                  {imageMessages.length > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[13px] h-3.5 flex items-center justify-center rounded-full bg-indigo-500 text-white text-[8px] font-bold px-0.5">{imageMessages.length}</span>}
                </button>
                <button onClick={() => setSidebarView("links")} className={`relative p-2 rounded-lg transition-all ${sidebarView === "links" ? "text-indigo-400 bg-indigo-900/30" : "text-gray-600 hover:text-gray-300"}`}>
                  <Link2 size={15} />
                  {linkMessages.length > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[13px] h-3.5 flex items-center justify-center rounded-full bg-indigo-500 text-white text-[8px] font-bold px-0.5">{linkMessages.length}</span>}
                </button>
                <button onClick={() => setSidebarView("search")} className={`p-2 rounded-lg transition-all ${sidebarView === "search" ? "text-indigo-400 bg-indigo-900/30" : "text-gray-600 hover:text-gray-300"}`}>
                  <Search size={15} />
                </button>
              </>)}
              {/* Utility — Dev mode */}
              {sidebarView === "dev" && (<>
                <button onClick={() => setDevSubView("mentions")} className={`relative p-2 rounded-lg transition-all ${devSubView === "mentions" ? "text-emerald-400 bg-emerald-900/30" : "text-gray-600 hover:text-gray-300"}`}>
                  <AtSign size={15} />
                  {devMentionMessages.length > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[13px] h-3.5 flex items-center justify-center rounded-full bg-emerald-500 text-white text-[8px] font-bold px-0.5">{devMentionMessages.length}</span>}
                </button>
                <button onClick={() => setDevSubView("pinned")} className={`relative p-2 rounded-lg transition-all ${devSubView === "pinned" ? "text-emerald-400 bg-emerald-900/30" : "text-gray-600 hover:text-gray-300"}`}>
                  <Pin size={15} />
                  {devPinnedMessages.length > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[13px] h-3.5 flex items-center justify-center rounded-full bg-emerald-500 text-white text-[8px] font-bold px-0.5">{devPinnedMessages.length}</span>}
                </button>
                <button onClick={() => { setDevSubView("chat"); }} className={`p-2 rounded-lg transition-all text-gray-600 hover:text-gray-300`}>
                  <Search size={15} />
                </button>
              </>)}
              {/* Close — always visible on mobile */}
              <button onClick={() => setOpen(false)} className="p-2 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-900/20 transition-all ml-1">
                <X size={16} />
              </button>
            </div>

            {/* ══════════ DEV CHAT VIEW (full clone, emerald accents) ══════════ */}
            {sidebarView === "dev" && (
              <>
                {/* ── Dev Chat sub-view ── */}
                {devSubView === "chat" && (
                  <>
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-base leading-none">{devActiveCh.emoji}</span>
                        <div>
                          <h3 className="text-sm font-bold text-white leading-tight">{devActiveCh.name}</h3>
                          <p className="text-[10px] text-gray-500 leading-tight">{devActiveCh.desc}</p>
                        </div>
                      </div>
                      <CloseBtn />
                    </div>

                    {/* Channel tabs */}
                    <div className="flex border-b border-gray-800/60 bg-gray-950 shrink-0 overflow-x-auto">
                      {DEV_CHANNELS.map(ch => {
                        const isActive = devActiveChannel === ch.id;
                        return (
                          <button key={ch.id} onClick={() => switchDevChannel(ch.id)}
                            className={`relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-all flex-shrink-0 ${
                              isActive ? "border-emerald-500 text-emerald-400 bg-emerald-950/30" : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
                            }`}
                          >
                            <span className="text-sm leading-none">{ch.emoji}</span>
                            {ch.name}
                          </button>
                        );
                      })}
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto py-2" style={{ overscrollBehavior: "contain" }}
                      onClick={() => setDevReactingMsgId(null)}>
                      {!devSettled && devMessages.length === 0 ? (
                        <div />
                      ) : devMessages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center px-6">
                          <div className="w-14 h-14 rounded-2xl bg-gray-800/60 flex items-center justify-center mb-3 text-2xl">{devActiveCh.emoji}</div>
                          <p className="text-sm font-semibold text-gray-300">{devActiveCh.name}</p>
                          <p className="text-xs text-gray-600 mt-1 max-w-[200px]">{devActiveCh.desc}</p>
                          <p className="text-xs text-gray-700 mt-3">Be the first to say something 👋</p>
                        </div>
                      ) : (
                        <div className="px-2">
                          {devGrouped.map(({ msg, isGrouped, showDate, dateLabel }) => {
                            const isMine = msg.userId === userId;
                            const reactionEntries = Object.entries(msg.reactions ?? {}).filter(([, ids]) => ids.length > 0);
                            return (
                              <React.Fragment key={msg.id}>
                                {showDate && (
                                  <div className="flex items-center gap-2 py-2 px-2">
                                    <div className="flex-1 h-px bg-gray-800/80" />
                                    <span className="text-[9px] text-gray-600 font-semibold uppercase tracking-wider">{dateLabel}</span>
                                    <div className="flex-1 h-px bg-gray-800/80" />
                                  </div>
                                )}
                                <div
                                  ref={el => { if (el) devMsgRefs.current.set(msg.id, el); else devMsgRefs.current.delete(msg.id); }}
                                  {...getLongPressHandlers(msg, false)}
                                  className={`group relative flex items-start gap-3 px-2 py-1.5 rounded-xl transition-all cursor-default select-none ${isGrouped ? "mt-1" : "mt-5"} ${devHighlightedMsgId === msg.id ? "msg-found-dev" : ""} ${longPressTarget?.msg.id === msg.id ? "bg-gray-700/40 scale-[0.98]" : ""} ${msg.pinned ? "bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/8" : "hover:bg-gray-800/30"}`}
                                >
                                  {msg.pinned && <span className="absolute top-1.5 right-8 text-[9px] text-emerald-400/60 select-none pointer-events-none">📌</span>}
                                  <div className="w-8 shrink-0">
                                    {!isGrouped ? (
                                      msg.userPhoto
                                        ? <img src={msg.userPhoto} alt={msg.userName} className="w-8 h-8 rounded-full object-cover ring-1 ring-gray-700/60" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                        : <div className="w-8 h-8 rounded-full bg-emerald-900/50 border border-emerald-800/40 flex items-center justify-center text-emerald-300 text-xs font-bold">{msg.userName?.[0]?.toUpperCase() ?? "?"}</div>
                                    ) : (
                                      <span className="text-[9px] text-transparent group-hover:text-gray-700 transition-colors block text-right pt-1.5 leading-none select-none">
                                        {new Date(msg.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    {!isGrouped && (
                                      <div className="flex items-baseline gap-2 mb-0.5">
                                        <span className={`text-xs font-semibold leading-tight ${isMine ? "text-emerald-300" : "text-gray-100"}`}>
                                          {msg.userName}
                                          {isMine && <span className="ml-1.5 text-[9px] text-emerald-500/70 font-normal">you</span>}
                                        </span>
                                        <span className="text-[10px] text-gray-600 leading-tight">{timeAgo(msg.createdAt)}</span>
                                      </div>
                                    )}
                                    {msg.replyTo && (
                                      <div className="mb-1.5 pl-2 border-l-2 border-emerald-500/50 bg-emerald-950/20 rounded-r-lg py-1 pr-2">
                                        <div className="flex items-center gap-1 mb-0.5">
                                          {msg.replyTo.userPhoto
                                            ? <img src={msg.replyTo.userPhoto} alt="" className="w-3.5 h-3.5 rounded-full object-cover shrink-0" />
                                            : <div className="w-3.5 h-3.5 rounded-full bg-emerald-900/50 flex items-center justify-center text-emerald-400 text-[7px] font-bold shrink-0">{msg.replyTo.userName?.[0]?.toUpperCase() ?? "?"}</div>
                                          }
                                          <span className="text-[10px] text-emerald-400 font-semibold leading-tight">
                                            ↩ {msg.replyTo.userId === userId ? "you" : msg.replyTo.userName}
                                          </span>
                                        </div>
                                        <span className="text-[11px] text-gray-500 leading-snug line-clamp-2 break-words">
                                          {msg.replyTo.imageUrl && !msg.replyTo.text ? "📷 Image" : ((msg.replyTo.text?.length ?? 0) > 80 ? msg.replyTo.text!.slice(0, 80) + "…" : (msg.replyTo.text || ""))}
                                        </span>
                                      </div>
                                    )}
                                    {devDeletingId === msg.id ? (
                                      <div className="flex items-center gap-2 mt-1 bg-red-950/60 border border-red-900/40 rounded-xl px-3 py-2">
                                        <span className="text-[11px] text-red-400 flex-1">Delete this message?</span>
                                        <button onClick={() => deleteDevMessage(msg.id)} className="text-[10px] px-2.5 py-1 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-500 transition-colors">Delete</button>
                                        <button onClick={() => setDevDeletingId(null)} className="text-[10px] px-2.5 py-1 rounded-lg bg-gray-700 text-gray-300 font-semibold hover:bg-gray-600 transition-colors">Cancel</button>
                                      </div>
                                    ) : devEditingId === msg.id ? (
                                      <div className="mt-1 flex flex-col gap-1.5">
                                        <textarea
                                          autoFocus
                                          className="w-full bg-gray-800/80 border border-emerald-500/40 rounded-xl px-3 py-2 text-sm text-gray-100 resize-none focus:outline-none focus:border-emerald-400/70"
                                          rows={2}
                                          value={devEditText}
                                          onChange={e => setDevEditText(e.target.value)}
                                          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEditDevMessage(); } if (e.key === "Escape") setDevEditingId(null); }}
                                        />
                                        <div className="flex gap-1.5 justify-end">
                                          <button onClick={() => setDevEditingId(null)} className="text-[10px] px-2.5 py-1 rounded-lg bg-gray-700 text-gray-300 font-semibold hover:bg-gray-600 transition-colors">Cancel</button>
                                          <button onClick={saveEditDevMessage} className="text-[10px] px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500 transition-colors flex items-center gap-1"><Check size={10} />Save</button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <p className="text-sm text-gray-200 leading-relaxed break-words whitespace-pre-wrap">{renderText(msg.text)}{msg.editedAt && <span className="text-[9px] text-gray-500 ml-1.5">(edited)</span>}</p>
                                        {devDeletingId !== msg.id && (() => {
                                          const urls = [...new Set([...(msg.text?.match(MSG_URL_RE) ?? [])])].slice(0, 2);
                                          return urls.map(url => <LinkPreview key={url} url={url} />);
                                        })()}
                                        {msg.imageUrl && (
                                          <img src={msg.imageUrl} alt="attachment"
                                            className="mt-2 max-w-[220px] max-h-52 rounded-xl border border-gray-700/50 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                            onClick={() => window.open(msg.imageUrl, "_blank")} />
                                        )}
                                      </>
                                    )}
                                    {reactionEntries.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1.5">
                                        {reactionEntries.map(([emoji, userIds]) => {
                                          const iReacted = userIds.includes(userId);
                                          return (
                                            <button key={emoji}
                                              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); toggleDevReaction(msg, emoji); }}
                                              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg text-xs transition-all ${iReacted ? "bg-emerald-600/30 border border-emerald-500/50 text-emerald-300" : "bg-gray-800/60 border border-gray-700/40 text-gray-400 hover:border-gray-600"}`}
                                            >
                                              <span>{emoji}</span>
                                              <span className="text-[10px] font-semibold">{userIds.length}</span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                  {/* Floating action pill toolbar */}
                                  {devDeletingId !== msg.id && (
                                    <div className={`absolute right-1 -top-5 z-20 translate-y-1 transition-all duration-150 ${devReactingMsgId === msg.id ? "opacity-100 pointer-events-auto translate-y-0" : "opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto group-hover:translate-y-0"}`}>
                                      <div className="flex items-center bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-2xl shadow-2xl overflow-visible">
                                        <div className="relative">
                                          <button onMouseDown={e => e.stopPropagation()}
                                            onClick={e => { e.stopPropagation(); setDevReactingMsgId(prev => prev === msg.id ? null : msg.id); }}
                                            className={`flex items-center justify-center w-9 h-8 text-base rounded-l-2xl transition-all ${Object.keys(msg.reactions ?? {}).length > 0 ? "text-yellow-400 bg-yellow-900/10 hover:bg-yellow-900/25" : "text-gray-500 hover:text-yellow-400 hover:bg-yellow-900/15"}`}
                                          >😊</button>
                                          {devReactingMsgId === msg.id && (
                                            <>
                                              <div className="absolute bottom-full left-0 right-0 h-3 pointer-events-auto" />
                                              <div className="absolute bottom-full mb-3 right-0 flex gap-0.5 p-1.5 bg-gray-900 border border-gray-700/70 rounded-2xl shadow-2xl z-50"
                                                onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                                                {REACTION_EMOJIS.map(emoji => (
                                                  <button key={emoji}
                                                    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); toggleDevReaction(msg, emoji); }}
                                                    onClick={e => e.stopPropagation()}
                                                    className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-700/80 text-lg transition-all hover:scale-125"
                                                  >{emoji}</button>
                                                ))}
                                              </div>
                                            </>
                                          )}
                                        </div>
                                        <div className="w-px h-5 bg-gray-700/60 shrink-0" />
                                        <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); toggleDevPin(msg); }}
                                          className={`flex items-center justify-center w-8 h-8 transition-all ${msg.pinned ? "text-amber-400 hover:bg-amber-900/20" : "text-gray-500 hover:text-amber-400 hover:bg-amber-900/15"}`}
                                          title={msg.pinned ? "Unpin" : "Pin message"}>
                                          {msg.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                                        </button>
                                        <button onMouseDown={e => e.stopPropagation()}
                                          onClick={() => { setDevReplyingTo({ id: msg.id, userId: msg.userId, userName: msg.userName, text: msg.text, userPhoto: msg.userPhoto, imageUrl: msg.imageUrl }); devInputRef.current?.focus(); }}
                                          className={`flex items-center justify-center w-8 h-8 transition-all text-gray-500 hover:text-emerald-400 hover:bg-emerald-900/20 ${!canDevDelete(msg) ? "rounded-r-2xl" : ""}`}
                                          title="Reply">
                                          <Reply size={13} />
                                        </button>
                                        {canDevDelete(msg) && (
                                          <>
                                            <div className="w-px h-5 bg-gray-700/60 shrink-0" />
                                            {msg.userId === userId && (
                                              <button onMouseDown={e => e.stopPropagation()} onClick={() => { setDevEditingId(msg.id); setDevEditText(msg.text || ""); }}
                                                className="flex items-center justify-center w-8 h-8 text-gray-600 hover:text-emerald-400 hover:bg-emerald-900/15 transition-all" title="Edit message">
                                                <Pencil size={12} />
                                              </button>
                                            )}
                                            <button onMouseDown={e => e.stopPropagation()} onClick={() => setDevDeletingId(msg.id)}
                                              className="flex items-center justify-center w-8 h-8 rounded-r-2xl text-gray-600 hover:text-red-400 hover:bg-red-900/15 transition-all" title="Delete">
                                              <Trash2 size={12} />
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </React.Fragment>
                            );
                          })}
                          <div ref={devMessagesEndRef} className="h-2" />
                        </div>
                      )}
                    </div>

                    {/* @mention dropdown */}
                    {devMentionSuggestions.length > 0 && (
                      <div className="mx-3 mb-1 bg-gray-900 border border-gray-700/60 rounded-xl overflow-hidden shadow-2xl shrink-0">
                        <p className="text-[9px] text-gray-600 px-3 pt-2 pb-1.5 font-semibold uppercase tracking-wider sticky top-0 bg-gray-900 border-b border-gray-800/60">
                          Mention a member
                          <span className="ml-1.5 text-gray-700 normal-case font-normal tracking-normal">{devMentionSuggestions.length} member{devMentionSuggestions.length !== 1 ? "s" : ""}</span>
                        </p>
                        <div ref={devMentionListRef} className="max-h-44 overflow-y-auto overscroll-contain">
                          {devMentionSuggestions.map((m, idx) => (
                            <button key={m.email || m.id}
                              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); insertDevMention(m); }}
                              onMouseEnter={() => setDevMentionHlIdx(idx)}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 transition-colors text-left ${idx === devMentionHlIdx ? "bg-emerald-600/20 border-l-2 border-emerald-500" : "hover:bg-gray-800"}`}
                            >
                              {m.photo ? <img src={m.photo} alt={m.name} className="w-6 h-6 rounded-full object-cover shrink-0" />
                                : <div className="w-6 h-6 rounded-full bg-emerald-900/50 flex items-center justify-center text-emerald-400 text-[10px] font-bold shrink-0">{(m.name || m.firstName)?.[0]?.toUpperCase() ?? "?"}</div>}
                              <span className={`text-xs font-medium ${idx === devMentionHlIdx ? "text-white" : "text-gray-100"}`}>{m.name || m.firstName}</span>
                              {m.roles?.[0] && <span className="text-[10px] text-gray-600 ml-auto shrink-0">{m.roles[0]}</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Input area */}
                    <div className="px-3 pb-3 pt-2 border-t border-gray-800/60 bg-gray-950 shrink-0">
                      {devReplyingTo && (
                        <div className="flex items-start gap-2 mb-2 px-2 py-1.5 bg-emerald-950/30 border border-emerald-800/30 rounded-xl">
                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] text-emerald-400 font-semibold block leading-tight">
                              ↩ Replying to {devReplyingTo.userId === userId ? "yourself" : devReplyingTo.userName}
                            </span>
                            <span className="text-[11px] text-gray-500 leading-snug line-clamp-1 break-words">
                              {devReplyingTo.text.length > 60 ? devReplyingTo.text.slice(0, 60) + "…" : devReplyingTo.text}
                            </span>
                          </div>
                          <button onClick={() => setDevReplyingTo(null)} onMouseDown={e => e.stopPropagation()} className="shrink-0 p-0.5 text-gray-600 hover:text-gray-300 rounded transition-colors mt-0.5"><X size={12} /></button>
                        </div>
                      )}
                      {devFileError && (
                        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-red-950/70 border border-red-800/50 rounded-xl">
                          <span className="text-[11px] text-red-400 flex-1 leading-snug">{devFileError}</span>
                          <button onClick={() => setDevFileError(null)} className="text-red-600 hover:text-red-400 transition-colors shrink-0"><X size={11} /></button>
                        </div>
                      )}
                      {devAttachedImage && (
                        <div className="relative mb-2 w-fit">
                          <img src={devAttachedImage} alt="preview" className="max-h-28 rounded-xl border border-emerald-500/30 object-cover" />
                          <button onClick={() => setDevAttachedImage(null)}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-800 border border-gray-600 rounded-full flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-700 transition-colors">
                            <X size={10} />
                          </button>
                        </div>
                      )}
                      <div className="flex items-end gap-2 bg-gray-800/50 border border-gray-700/40 rounded-2xl px-3 py-2.5 focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/10 transition-all">
                        {userPhoto ? <img src={userPhoto} alt={userName} className="w-7 h-7 rounded-full object-cover shrink-0" />
                          : <div className="w-7 h-7 rounded-full bg-emerald-900/50 flex items-center justify-center text-emerald-300 text-[10px] font-bold shrink-0">{userName?.[0]?.toUpperCase() ?? "?"}</div>}
                        <button onMouseDown={e => e.stopPropagation()} onClick={() => devFileInputRef.current?.click()}
                          className="p-2 rounded-xl text-gray-600 hover:text-emerald-400 hover:bg-emerald-900/20 transition-all shrink-0" title="Attach image">
                          <Paperclip size={15} />
                        </button>
                        <input ref={devFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleDevFileAttach} />
                        <textarea ref={devInputRef} value={devInput} onChange={handleDevInputChange} onKeyDown={handleDevKeyDown} onPaste={handleDevPaste}
                          onClick={() => setDevEmojiPickerOpen(false)} placeholder={devActiveCh.placeholder} rows={1}
                          disabled={!userId || sending}
                          className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-600 resize-none outline-none py-2 min-h-[40px] max-h-[120px] overflow-y-auto disabled:opacity-40 leading-relaxed" />
                        <div className="relative shrink-0 mb-0.5">
                          <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); setDevEmojiPickerOpen(p => !p); }}
                            className={`p-2 rounded-xl transition-all ${devEmojiPickerOpen ? "text-yellow-400 bg-yellow-900/20" : "text-gray-600 hover:text-yellow-400 hover:bg-yellow-900/10"}`}
                            title="Insert emoji"><Smile size={16} /></button>
                          {devEmojiPickerOpen && (
                            <div className="absolute bottom-full right-0 mb-2 w-72 p-3 bg-gray-900 border border-gray-700/60 rounded-2xl shadow-2xl z-50"
                              onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                              <p className="text-[9px] text-gray-600 font-semibold uppercase tracking-wider mb-2 px-0.5">Emoji</p>
                              <div className="grid grid-cols-8 gap-1">
                                {TEXT_EMOJIS.map(emoji => (
                                  <button key={emoji} onMouseDown={e => { e.preventDefault(); e.stopPropagation(); insertDevEmoji(emoji); }}
                                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-700 text-xl transition-all hover:scale-125 active:scale-95">{emoji}</button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <button onMouseDown={e => e.stopPropagation()} onClick={sendDevMessage}
                          disabled={(!devInput.trim() && !devAttachedImage) || sending || !userId}
                          className="w-9 h-9 flex items-center justify-center rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0 hover:scale-105 active:scale-95">
                          <Send size={14} />
                        </button>
                      </div>
                      <div className="hidden sm:flex items-center justify-between mt-1.5 px-1">
                        <span className="text-[9px] text-gray-700">
                          <kbd className="font-mono">Enter</kbd> send · <kbd className="font-mono">Shift+Enter</kbd> newline · <kbd className="font-mono">@</kbd> mention
                        </span>
                        <span className="text-[9px] text-gray-700">{devActiveCh.emoji} {devActiveCh.name}</span>
                      </div>
                    </div>
                  </>
                )}

                {/* ── Dev Mentions sub-view ── */}
                {devSubView === "mentions" && (
                  <>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60 shrink-0">
                      <div className="flex items-center gap-2">
                        <AtSign size={14} className="text-emerald-400" />
                        <div>
                          <h3 className="text-sm font-bold text-white leading-tight">Mentions</h3>
                          <p className="text-[10px] text-gray-500 leading-tight">{devActiveCh.emoji} {devActiveCh.name}</p>
                        </div>
                      </div>
                      <CloseBtn />
                    </div>
                    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                      {devMentionMessages.length === 0
                        ? <div className="flex flex-col items-center justify-center h-full text-center pt-12"><AtSign size={28} className="text-gray-700 mb-2" /><p className="text-xs text-gray-600">No mentions in this channel</p></div>
                        : devMentionMessages.map(msg => (
                          <div key={msg.id} className="bg-gray-800/40 rounded-xl p-3 hover:bg-gray-800/60 transition-colors cursor-pointer"
                            onClick={() => { setDevHighlightedMsgId(msg.id); setDevSubView("chat"); }}>
                            <div className="flex items-center gap-2 mb-1.5">
                              {msg.userPhoto ? <img src={msg.userPhoto} alt={msg.userName} className="w-5 h-5 rounded-full object-cover" /> : <div className="w-5 h-5 rounded-full bg-emerald-900/50 flex items-center justify-center text-emerald-300 text-[9px] font-bold">{msg.userName?.[0]?.toUpperCase() ?? "?"}</div>}
                              <span className="text-xs font-semibold text-gray-200">{msg.userName}</span>
                              <span className="text-[10px] text-gray-600 ml-auto">{timeAgo(msg.createdAt)}</span>
                            </div>
                            <p className="text-xs text-gray-400 leading-relaxed line-clamp-2 break-words">{renderText(msg.text)}</p>
                          </div>
                        ))
                      }
                    </div>
                  </>
                )}

                {/* ── Dev Search sub-view ── */}
                {devSubView === "search" && (
                  <>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60 shrink-0">
                      <div className="flex items-center gap-2">
                        <Search size={14} className="text-emerald-400" />
                        <div>
                          <h3 className="text-sm font-bold text-white leading-tight">Search</h3>
                          <p className="text-[10px] text-gray-500 leading-tight">{devActiveCh.emoji} {devActiveCh.name}</p>
                        </div>
                      </div>
                      <CloseBtn />
                    </div>
                    <div className="px-3 py-2 border-b border-gray-800/60 shrink-0">
                      <div className="flex items-center gap-2 bg-gray-800/50 border border-gray-700/50 rounded-xl px-3 py-2 focus-within:border-emerald-500/50 transition-colors">
                        <Search size={13} className="text-gray-600 shrink-0" />
                        <input ref={devSearchInputRef} type="text" value={devSearchQuery} onChange={e => setDevSearchQuery(e.target.value)}
                          placeholder="Search messages…" className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-600 outline-none" />
                        {devSearchQuery && <button onClick={() => setDevSearchQuery("")} className="text-gray-600 hover:text-gray-400 transition-colors"><X size={13} /></button>}
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                      {!devSearchQuery.trim()
                        ? <div className="text-center pt-10"><p className="text-xs text-gray-600">Type to search messages</p></div>
                        : devSearchResults.length === 0
                          ? <div className="text-center pt-10"><p className="text-xs text-gray-600">No results for "{devSearchQuery}"</p></div>
                          : devSearchResults.map(msg => (
                            <div key={msg.id} className="bg-gray-800/40 rounded-xl p-3 hover:bg-gray-800/60 transition-colors cursor-pointer"
                              onClick={() => { setDevHighlightedMsgId(msg.id); setDevSubView("chat"); }}>
                              <div className="flex items-center gap-2 mb-1.5">
                                {msg.userPhoto ? <img src={msg.userPhoto} alt={msg.userName} className="w-5 h-5 rounded-full object-cover" /> : <div className="w-5 h-5 rounded-full bg-emerald-900/50 flex items-center justify-center text-emerald-300 text-[9px] font-bold">{msg.userName?.[0]?.toUpperCase() ?? "?"}</div>}
                                <span className="text-xs font-semibold text-gray-200">{msg.userName}</span>
                                <span className="text-[10px] text-gray-600 ml-auto">{timeAgo(msg.createdAt)}</span>
                              </div>
                              <p className="text-xs text-gray-400 leading-relaxed line-clamp-2 break-words">{renderText(msg.text)}</p>
                            </div>
                          ))
                      }
                    </div>
                  </>
                )}

                {/* ── Dev Pinned sub-view ── */}
                {devSubView === "pinned" && (
                  <>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60 shrink-0">
                      <div className="flex items-center gap-2">
                        <Pin size={14} className="text-emerald-400" />
                        <div>
                          <h3 className="text-sm font-bold text-white leading-tight">Pinned</h3>
                          <p className="text-[10px] text-gray-500 leading-tight">{devActiveCh.emoji} {devActiveCh.name}</p>
                        </div>
                      </div>
                      <CloseBtn />
                    </div>
                    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                      {devPinnedMessages.length === 0
                        ? <div className="flex flex-col items-center justify-center h-full text-center pt-12"><Pin size={28} className="text-gray-700 mb-2" /><p className="text-xs text-gray-600">No pinned messages</p></div>
                        : devPinnedMessages.map(msg => (
                          <div key={msg.id} className="bg-gray-800/40 border border-emerald-900/30 rounded-xl p-3 hover:bg-gray-800/60 transition-colors">
                            <div className="flex items-center gap-2 mb-1.5">
                              {msg.userPhoto ? <img src={msg.userPhoto} alt={msg.userName} className="w-5 h-5 rounded-full object-cover" /> : <div className="w-5 h-5 rounded-full bg-emerald-900/50 flex items-center justify-center text-emerald-300 text-[9px] font-bold">{msg.userName?.[0]?.toUpperCase() ?? "?"}</div>}
                              <span className="text-xs font-semibold text-gray-200">{msg.userName}</span>
                              <span className="text-[10px] text-gray-600 ml-auto">{timeAgo(msg.createdAt)}</span>
                            </div>
                            <p className="text-xs text-gray-400 leading-relaxed line-clamp-2 break-words">{renderText(msg.text)}</p>
                            <button className="mt-2 text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
                              onClick={() => { setDevHighlightedMsgId(msg.id); setDevSubView("chat"); }}>
                              Jump to message →
                            </button>
                          </div>
                        ))
                      }
                    </div>
                  </>
                )}

                {/* ── Dev Images sub-view ── */}
                {devSubView === "images" && (
                  <>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60 shrink-0">
                      <div className="flex items-center gap-2">
                        <ImageIcon size={14} className="text-emerald-400" />
                        <div>
                          <h3 className="text-sm font-bold text-white leading-tight">Images</h3>
                          <p className="text-[10px] text-gray-500 leading-tight">{devActiveCh.emoji} {devActiveCh.name}</p>
                        </div>
                      </div>
                      <CloseBtn />
                    </div>
                    <div className="flex-1 overflow-y-auto px-3 py-3">
                      {devImageMessages.length === 0
                        ? <div className="flex flex-col items-center justify-center h-full text-center pt-12"><ImageIcon size={28} className="text-gray-700 mb-2" /><p className="text-xs text-gray-600">No images in this channel</p></div>
                        : <div className="grid grid-cols-2 gap-2">
                          {devImageMessages.map(msg => (
                            <div key={msg.id} className="relative group/img cursor-pointer rounded-xl overflow-hidden border border-gray-700/40"
                              onClick={() => { setDevHighlightedMsgId(msg.id); setDevSubView("chat"); }}>
                              <img src={msg.imageUrl} alt="attachment" className="w-full h-28 object-cover" />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-end p-2">
                                <span className="text-[9px] text-gray-300 leading-tight">{msg.userName} · {timeAgo(msg.createdAt)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      }
                    </div>
                  </>
                )}

                {/* ── Dev Links sub-view ── */}
                {devSubView === "links" && (
                  <>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60 shrink-0">
                      <div className="flex items-center gap-2">
                        <Link2 size={14} className="text-emerald-400" />
                        <div>
                          <h3 className="text-sm font-bold text-white leading-tight">Links</h3>
                          <p className="text-[10px] text-gray-500 leading-tight">{devActiveCh.emoji} {devActiveCh.name}</p>
                        </div>
                      </div>
                      <CloseBtn />
                    </div>
                    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                      {devLinkMessages.length === 0
                        ? <div className="flex flex-col items-center justify-center h-full text-center pt-12"><Link2 size={28} className="text-gray-700 mb-2" /><p className="text-xs text-gray-600">No links shared yet</p></div>
                        : devLinkMessages.map(msg => (
                          <div key={msg.id} className="bg-gray-800/40 rounded-xl p-3 hover:bg-gray-800/60 transition-colors">
                            <div className="flex items-center gap-2 mb-2">
                              {msg.userPhoto ? <img src={msg.userPhoto} alt={msg.userName} className="w-5 h-5 rounded-full object-cover" /> : <div className="w-5 h-5 rounded-full bg-emerald-900/50 flex items-center justify-center text-emerald-300 text-[9px] font-bold">{msg.userName?.[0]?.toUpperCase() ?? "?"}</div>}
                              <span className="text-xs font-semibold text-gray-200">{msg.userName}</span>
                              <span className="text-[10px] text-gray-600 ml-auto">{timeAgo(msg.createdAt)}</span>
                            </div>
                            {(msg as ChatMessage & { urls: string[] }).urls.map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-[11px] text-emerald-400 hover:text-emerald-300 hover:underline transition-colors mb-1 break-all">
                                <ExternalLink size={10} className="shrink-0" />{url.length > 60 ? url.slice(0, 60) + "…" : url}
                              </a>
                            ))}
                            <button className="mt-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors" onClick={() => { setDevHighlightedMsgId(msg.id); setDevSubView("chat"); }}>Jump to message →</button>
                          </div>
                        ))
                      }
                    </div>
                  </>
                )}

                {/* ── Dev Settings sub-view (reuses shared theme settings) ── */}
                {devSubView === "settings" && (
                  <>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60 shrink-0">
                      <div className="flex items-center gap-2">
                        <Settings size={14} className="text-emerald-400" />
                        <h3 className="text-sm font-bold text-white leading-tight">Settings</h3>
                      </div>
                      <CloseBtn />
                    </div>
                    <div className="flex-1 overflow-y-auto px-4 py-4">
                      <p className="text-xs text-gray-500 mb-3 font-semibold uppercase tracking-wider">Name Color Theme</p>
                      <div className="grid grid-cols-3 gap-2">
                        {THEMES.map(t => (
                          <button key={t.id} onClick={() => { localStorage.setItem(`wf_${widgetId}_theme`, t.id); setChatTheme(t.id as ThemeId); }}
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all ${chatTheme === t.id ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300" : "bg-gray-800/40 border-gray-700/40 text-gray-400 hover:bg-gray-800/70 hover:text-gray-300"}`}>
                            <span className={`w-3 h-3 rounded-full shrink-0 ${t.dotClass}`} />
                            <span className="text-xs font-medium">{t.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {/* member name color driven by theme */}
            {sidebarView === "chat" && (
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base leading-none">{activeCh.emoji}</span>
                    <div>
                      <h3 className="text-sm font-bold text-white leading-tight">{activeCh.name}</h3>
                      <p className="text-[10px] text-gray-500 leading-tight">{activeCh.desc}</p>
                    </div>
                  </div>
                  <CloseBtn />
                </div>

                {/* Channel tabs */}
                <div className="flex border-b border-gray-800/60 bg-gray-950 shrink-0 overflow-x-auto">
                  {CH.map(ch => {
                    const isActive = activeChannel === ch.id;
                    const hasDot   = unreadDots.has(ch.id);
                    return (
                      <button
                        key={ch.id}
                        onClick={() => switchChannel(ch.id)}
                        className={`relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-all flex-shrink-0 ${
                          isActive ? "border-indigo-500 text-indigo-400 bg-indigo-950/30" : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
                        }`}
                      >
                        <span className="text-sm leading-none">{ch.emoji}</span>
                        {ch.name}
                        {hasDot && !isActive && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 animate-pulse" />}
                      </button>
                    );
                  })}
                </div>

                {/* Messages */}
                <div
                  className="flex-1 overflow-y-auto py-2"
                  style={{ overscrollBehavior: "contain" }}
                  onClick={() => setReactingMsgId(null)}
                >
                  {!settled && messages.length === 0 ? (
                    <div />
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6">
                      <div className="w-14 h-14 rounded-2xl bg-gray-800/60 flex items-center justify-center mb-3 text-2xl">{activeCh.emoji}</div>
                      <p className="text-sm font-semibold text-gray-300">{activeCh.name}</p>
                      <p className="text-xs text-gray-600 mt-1 max-w-[200px]">{activeCh.desc}</p>
                      <p className="text-xs text-gray-700 mt-3">Be the first to say something 👋</p>
                    </div>
                  ) : (
                    <div className="px-2">
                      {grouped.map(({ msg, isGrouped, showDate, dateLabel }) => {
                        const isMine          = msg.userId === userId;
                        const reactionEntries = Object.entries(msg.reactions ?? {}).filter(([, ids]) => ids.length > 0);
                        return (
                          <React.Fragment key={msg.id}>
                            {showDate && (
                              <div className="flex items-center gap-2 py-2 px-2">
                                <div className="flex-1 h-px bg-gray-800/80" />
                                <span className="text-[9px] text-gray-600 font-semibold uppercase tracking-wider">{dateLabel}</span>
                                <div className="flex-1 h-px bg-gray-800/80" />
                              </div>
                            )}

                            <div
                              ref={el => { if (el) msgRefs.current.set(msg.id, el); else msgRefs.current.delete(msg.id); }}
                              {...getLongPressHandlers(msg, true)}
                              className={`group relative flex items-start gap-3 px-2 py-1.5 rounded-xl transition-colors cursor-default select-none ${isGrouped ? "mt-1" : "mt-5"} ${highlightedMsgId === msg.id ? "msg-found" : ""} ${longPressTarget?.msg.id === msg.id ? "bg-gray-700/40 scale-[0.98]" : ""} ${msg.pinned ? "bg-pink-500/5 border border-pink-500/10 hover:bg-pink-500/8" : "hover:bg-gray-800/30"}`}>
                              {msg.pinned && (
                                <span className="absolute top-1.5 right-8 text-[9px] text-pink-400/60 select-none pointer-events-none">📌</span>
                              )}
                              {/* Avatar col */}
                              <div className="w-8 shrink-0">
                                {!isGrouped ? (
                                  msg.userPhoto
                                    ? <img src={msg.userPhoto} alt={msg.userName} className="w-8 h-8 rounded-full object-cover ring-1 ring-gray-700/60" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                    : <div className="w-8 h-8 rounded-full bg-indigo-900/50 border border-indigo-800/40 flex items-center justify-center text-indigo-300 text-xs font-bold">{msg.userName?.[0]?.toUpperCase() ?? "?"}</div>
                                ) : (
                                  <span className="text-[9px] text-transparent group-hover:text-gray-700 transition-colors block text-right pt-1.5 leading-none select-none">
                                    {new Date(msg.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                  </span>
                                )}
                              </div>

                              {/* Body */}
                              <div className="flex-1 min-w-0">
                                {!isGrouped && (
                                  <div className="flex items-baseline gap-2 mb-0.5">
                                    <span className={`text-xs font-semibold leading-tight ${isMine ? theme.nameClass : "text-gray-100"}`}>
                                      {msg.userName}
                                      {isMine && <span className="ml-1.5 text-[9px] text-indigo-500/70 font-normal">you</span>}
                                    </span>
                                    <span className="text-[10px] text-gray-600 leading-tight">{timeAgo(msg.createdAt)}</span>
                                  </div>
                                )}

                                {/* Reply quote */}
                                {msg.replyTo && (
                                  <div className="mb-1.5 pl-2 border-l-2 border-indigo-500/50 bg-indigo-950/20 rounded-r-lg py-1 pr-2">
                                    <div className="flex items-center gap-1 mb-0.5">
                                      {msg.replyTo.userPhoto
                                        ? <img src={msg.replyTo.userPhoto} alt="" className="w-3.5 h-3.5 rounded-full object-cover shrink-0" />
                                        : <div className="w-3.5 h-3.5 rounded-full bg-indigo-900/50 flex items-center justify-center text-indigo-400 text-[7px] font-bold shrink-0">{msg.replyTo.userName?.[0]?.toUpperCase() ?? "?"}</div>
                                      }
                                      <span className="text-[10px] text-indigo-400 font-semibold leading-tight">
                                        ↩ {msg.replyTo.userId === userId ? "you" : msg.replyTo.userName}
                                      </span>
                                    </div>
                                    <span className="text-[11px] text-gray-500 leading-snug line-clamp-2 break-words">
                                      {msg.replyTo.imageUrl && !msg.replyTo.text ? "📷 Image" : ((msg.replyTo.text?.length ?? 0) > 80 ? msg.replyTo.text!.slice(0, 80) + "…" : (msg.replyTo.text || ""))}
                                    </span>
                                  </div>
                                )}

                                {/* Delete confirm / edit mode / message text */}
                                {deletingId === msg.id ? (
                                  <div className="flex items-center gap-2 mt-1 bg-red-950/60 border border-red-900/40 rounded-xl px-3 py-2">
                                    <span className="text-[11px] text-red-400 flex-1">Delete this message?</span>
                                    <button onClick={() => deleteMessage(msg.id)} className="text-[10px] px-2.5 py-1 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-500 transition-colors">Delete</button>
                                    <button onClick={() => setDeletingId(null)} className="text-[10px] px-2.5 py-1 rounded-lg bg-gray-700 text-gray-300 font-semibold hover:bg-gray-600 transition-colors">Cancel</button>
                                  </div>
                                ) : editingId === msg.id ? (
                                  <div className="mt-1 flex flex-col gap-1.5">
                                    <textarea
                                      autoFocus
                                      className="w-full bg-gray-800/80 border border-indigo-500/40 rounded-xl px-3 py-2 text-sm text-gray-100 resize-none focus:outline-none focus:border-indigo-400/70"
                                      rows={2}
                                      value={editText}
                                      onChange={e => setEditText(e.target.value)}
                                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEditMessage(); } if (e.key === "Escape") setEditingId(null); }}
                                    />
                                    <div className="flex gap-1.5 justify-end">
                                      <button onClick={() => setEditingId(null)} className="text-[10px] px-2.5 py-1 rounded-lg bg-gray-700 text-gray-300 font-semibold hover:bg-gray-600 transition-colors">Cancel</button>
                                      <button onClick={saveEditMessage} className="text-[10px] px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 transition-colors flex items-center gap-1"><Check size={10} />Save</button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <p className="text-sm text-gray-200 leading-relaxed break-words whitespace-pre-wrap">{renderText(msg.text)}{msg.editedAt && <span className="text-[9px] text-gray-500 ml-1.5">(edited)</span>}</p>
                                    {/* Link previews — one card per unique URL in the message */}
                                    {deletingId !== msg.id && (() => {
                                      const urls = [...new Set([...(msg.text.match(MSG_URL_RE) ?? [])])].slice(0, 2);
                                      return urls.map(url => <LinkPreview key={url} url={url} />);
                                    })()}
                                    {msg.imageUrl && (
                                      <img
                                        src={msg.imageUrl}
                                        alt="attachment"
                                        className="mt-2 max-w-[220px] max-h-52 rounded-xl border border-gray-700/50 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                        onClick={() => window.open(msg.imageUrl, "_blank")}
                                      />
                                    )}
                                  </>
                                )}

                                {/* Reaction pills */}
                                {reactionEntries.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {reactionEntries.map(([emoji, userIds]) => {
                                      const iReacted = userIds.includes(userId);
                                      return (
                                        <button
                                          key={emoji}
                                          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); toggleReaction(msg, emoji); }}
                                          className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg text-xs transition-all ${
                                            iReacted
                                              ? "bg-indigo-600/30 border border-indigo-500/50 text-indigo-300"
                                              : "bg-gray-800/60 border border-gray-700/40 text-gray-400 hover:border-gray-600"
                                          }`}
                                        >
                                          <span>{emoji}</span>
                                          <span className="text-[10px] font-semibold">{userIds.length}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {/* ── Floating action pill toolbar (appears on hover) ── */}
                              {deletingId !== msg.id && (
                                <div
                                  className={`absolute right-1 -top-5 z-20 translate-y-1 transition-all duration-150 ${
                                    reactingMsgId === msg.id
                                      ? "opacity-100 pointer-events-auto translate-y-0"          // keep visible while picker is open
                                      : "opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto group-hover:translate-y-0"
                                  }`}
                                >
                                  <div className="flex items-center bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-2xl shadow-2xl overflow-visible">

                                    {/* Emoji reaction */}
                                    <div className="relative">
                                      <button
                                        onMouseDown={e => e.stopPropagation()}
                                        onClick={(e) => { e.stopPropagation(); setReactingMsgId(prev => prev === msg.id ? null : msg.id); }}
                                        className={`flex items-center justify-center w-9 h-8 text-base rounded-l-2xl transition-all ${
                                          Object.keys(msg.reactions ?? {}).length > 0
                                            ? "text-yellow-400 bg-yellow-900/10 hover:bg-yellow-900/25"
                                            : "text-gray-500 hover:text-yellow-400 hover:bg-yellow-900/15"
                                        }`}
                                      >😊</button>
                                      {/* Floating emoji picker — pops ABOVE the pill */}
                                      {reactingMsgId === msg.id && (
                                        <>
                                          {/* Invisible bridge fills the gap so mouse doesn't lose hover */}
                                          <div className="absolute bottom-full left-0 right-0 h-3 pointer-events-auto" />
                                          <div
                                            className="absolute bottom-full mb-3 right-0 flex gap-0.5 p-1.5 bg-gray-900 border border-gray-700/70 rounded-2xl shadow-2xl z-50"
                                            onMouseDown={e => e.stopPropagation()}
                                            onClick={e => e.stopPropagation()}
                                          >
                                          {REACTION_EMOJIS.map(emoji => (
                                            <button
                                              key={emoji}
                                              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); toggleReaction(msg, emoji); }}
                                              onClick={e => e.stopPropagation()}
                                              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-700/80 text-lg transition-all hover:scale-125"
                                            >
                                              {emoji}
                                            </button>
                                          ))}
                                          </div>
                                        </>
                                      )}
                                    </div>

                                    <div className="w-px h-5 bg-gray-700/60 shrink-0" />

                                    {/* 📌 Pin / Unpin */}
                                    <button
                                      onMouseDown={e => e.stopPropagation()}
                                      onClick={(e) => { e.stopPropagation(); togglePin(msg); }}
                                      className={`flex items-center justify-center w-8 h-8 transition-all ${
                                        msg.pinned
                                          ? "text-amber-400 hover:bg-amber-900/20"
                                          : "text-gray-500 hover:text-amber-400 hover:bg-amber-900/15"
                                      }`}
                                      title={msg.pinned ? "Unpin" : "Pin message"}
                                    >
                                      {msg.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                                    </button>

                                    {/* ↩ Reply */}
                                    <button
                                      onMouseDown={e => e.stopPropagation()}
                                      onClick={() => { setReplyingTo({ id: msg.id, userId: msg.userId, userName: msg.userName, text: msg.text, userPhoto: msg.userPhoto, imageUrl: msg.imageUrl }); inputRef.current?.focus(); }}
                                      className={`flex items-center justify-center w-8 h-8 transition-all text-gray-500 hover:text-indigo-400 hover:bg-indigo-900/20 ${!canDelete(msg) ? "rounded-r-2xl" : ""}`}
                                      title="Reply"
                                    >
                                      <Reply size={13} />
                                    </button>

                                    {/* 🗑 Delete / ✏️ Edit */}
                                    {canDelete(msg) && (
                                      <>
                                        <div className="w-px h-5 bg-gray-700/60 shrink-0" />
                                        {msg.userId === userId && (
                                          <button
                                            onMouseDown={e => e.stopPropagation()}
                                            onClick={() => { setEditingId(msg.id); setEditText(msg.text || ""); }}
                                            className="flex items-center justify-center w-8 h-8 text-gray-600 hover:text-indigo-400 hover:bg-indigo-900/15 transition-all"
                                            title="Edit message"
                                          >
                                            <Pencil size={12} />
                                          </button>
                                        )}
                                        <button
                                          onMouseDown={e => e.stopPropagation()}
                                          onClick={() => setDeletingId(msg.id)}
                                          className="flex items-center justify-center w-8 h-8 rounded-r-2xl text-gray-600 hover:text-red-400 hover:bg-red-900/15 transition-all"
                                          title="Delete"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </React.Fragment>
                        );
                      })}
                      <div ref={messagesEndRef} className="h-2" />
                    </div>
                  )}
                </div>

                {/* @mention dropdown */}
                {mentionSuggestions.length > 0 && (
                  <div className="mx-3 mb-1 bg-gray-900 border border-gray-700/60 rounded-xl overflow-hidden shadow-2xl shrink-0">
                    <p className="text-[9px] text-gray-600 px-3 pt-2 pb-1.5 font-semibold uppercase tracking-wider sticky top-0 bg-gray-900 border-b border-gray-800/60">
                      Mention a member
                      <span className="ml-1.5 text-gray-700 normal-case font-normal tracking-normal">
                        {mentionSuggestions.length} member{mentionSuggestions.length !== 1 ? "s" : ""}
                      </span>
                    </p>
                    <div ref={mentionListRef} className="max-h-44 overflow-y-auto overscroll-contain">
                      {mentionSuggestions.map((m, idx) => (
                        <button
                          key={m.email || m.id}
                          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); insertMention(m); }}
                          onMouseEnter={() => setMentionHlIdx(idx)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 transition-colors text-left ${
                            idx === mentionHlIdx ? "bg-indigo-600/20 border-l-2 border-indigo-500" : "hover:bg-gray-800"
                          }`}
                        >
                          {m.photo
                            ? <img src={m.photo} alt={m.name} className="w-6 h-6 rounded-full object-cover shrink-0" />
                            : <div className="w-6 h-6 rounded-full bg-indigo-900/50 flex items-center justify-center text-indigo-400 text-[10px] font-bold shrink-0">{(m.name || m.firstName)?.[0]?.toUpperCase() ?? "?"}</div>
                          }
                          <span className={`text-xs font-medium ${idx === mentionHlIdx ? "text-white" : "text-gray-100"}`}>{m.name || m.firstName}</span>
                          {m.roles?.[0] && <span className="text-[10px] text-gray-600 ml-auto shrink-0">{m.roles[0]}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input area */}
                <div className="px-3 pb-3 pt-2 border-t border-gray-800/60 bg-gray-950 shrink-0">
                  {replyingTo && (
                    <div className="flex items-start gap-2 mb-2 px-2 py-1.5 bg-indigo-950/30 border border-indigo-800/30 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] text-indigo-400 font-semibold block leading-tight">
                          ↩ Replying to {replyingTo.userId === userId ? "yourself" : replyingTo.userName}
                        </span>
                        <span className="text-[11px] text-gray-500 leading-snug line-clamp-1 break-words">
                          {replyingTo.text.length > 60 ? replyingTo.text.slice(0, 60) + "…" : replyingTo.text}
                        </span>
                      </div>
                      <button onClick={() => setReplyingTo(null)} onMouseDown={e => e.stopPropagation()} className="shrink-0 p-0.5 text-gray-600 hover:text-gray-300 rounded transition-colors mt-0.5">
                        <X size={12} />
                      </button>
                    </div>
                  )}

                  {/* ── File-size error banner ── */}
                  {fileError && (
                    <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-red-950/70 border border-red-800/50 rounded-xl">
                      <span className="text-[11px] text-red-400 flex-1 leading-snug">{fileError}</span>
                      <button onClick={() => setFileError(null)} className="text-red-600 hover:text-red-400 transition-colors shrink-0"><X size={11} /></button>
                    </div>
                  )}

                  {/* Attached image preview */}
                  {attachedImage && (
                    <div className="relative mb-2 w-fit">
                      <img src={attachedImage} alt="preview" className="max-h-28 rounded-xl border border-indigo-500/30 object-cover" />
                      <button
                        onClick={() => setAttachedImage(null)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-800 border border-gray-600 rounded-full flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
                      ><X size={10} /></button>
                    </div>
                  )}

                  {/* Toolbar row */}
                  <div className="flex items-end gap-2 bg-gray-800/50 border border-gray-700/40 rounded-2xl px-3 py-2.5 focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/10 transition-all">

                    {/* Left: user avatar */}
                    {userPhoto
                      ? <img src={userPhoto} alt={userName} className="w-7 h-7 rounded-full object-cover shrink-0" />
                      : <div className="w-7 h-7 rounded-full bg-indigo-900/50 flex items-center justify-center text-indigo-300 text-[10px] font-bold shrink-0">{userName?.[0]?.toUpperCase() ?? "?"}</div>
                    }

                    {/* Attachment button */}
                    <button
                      onMouseDown={e => e.stopPropagation()}
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 rounded-xl text-gray-600 hover:text-indigo-400 hover:bg-indigo-900/20 transition-all shrink-0"
                      title="Attach image"
                    ><Paperclip size={15} /></button>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileAttach} />

                    {/* Textarea */}
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      onPaste={handlePaste}
                      onClick={() => setEmojiPickerOpen(false)}
                      placeholder={activeCh.placeholder}
                      rows={1}
                      disabled={!userId || sending}
                      className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-600 resize-none outline-none py-2 min-h-[40px] max-h-[120px] overflow-y-auto disabled:opacity-40 leading-relaxed"
                    />

                    {/* Emoji picker trigger */}
                    <div className="relative shrink-0 mb-0.5">
                      <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); setEmojiPickerOpen(p => !p); }}
                        className={`p-1.5 rounded-lg transition-all ${
                          emojiPickerOpen ? "text-yellow-400 bg-yellow-900/20" : "text-gray-600 hover:text-yellow-400 hover:bg-yellow-900/10"
                        }`}
                        title="Insert emoji"
                      ><Smile size={16} /></button>

                      {/* Emoji grid popup */}
                      {emojiPickerOpen && (
                        <div
                          className="absolute bottom-full right-0 mb-2 w-72 p-3 bg-gray-900 border border-gray-700/60 rounded-2xl shadow-2xl z-50"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => e.stopPropagation()}
                        >
                          <p className="text-[9px] text-gray-600 font-semibold uppercase tracking-wider mb-2 px-0.5">Emoji</p>
                          <div className="grid grid-cols-8 gap-1">
                            {TEXT_EMOJIS.map(emoji => (
                              <button
                                key={emoji}
                                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); insertEmoji(emoji); }}
                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-700 text-xl transition-all hover:scale-125 active:scale-95"
                              >{emoji}</button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Send button */}
                    <button
                      onMouseDown={e => e.stopPropagation()}
                      onClick={sendMessage}
                      disabled={(!input.trim() && !attachedImage) || sending || !userId}
                      className="w-9 h-9 flex items-center justify-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0 hover:scale-105 active:scale-95"
                    ><Send size={14} /></button>
                  </div>

                  <div className="flex items-center justify-between mt-1.5 px-1">
                    <span className="text-[9px] text-gray-700">
                      <kbd className="font-mono">Enter</kbd> send · <kbd className="font-mono">Shift+Enter</kbd> newline · <kbd className="font-mono">@</kbd> mention
                    </span>
                    <span className="text-[9px] text-gray-700">{activeCh.emoji} {activeCh.name}</span>
                  </div>
                </div>
              </>
            )}

            {/* ══════════ MENTIONS VIEW ══════════ */}
            {sidebarView === "mentions" && (
              <>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60 shrink-0">
                  <div className="flex items-center gap-2">
                    <AtSign size={14} className="text-indigo-400" />
                    <h3 className="text-sm font-bold text-white">Mentions</h3>
                    {mentionMessages.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-600/20 text-indigo-400 font-semibold">{mentionMessages.length}</span>
                    )}
                    <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-gray-800 text-gray-500 ml-1">{activeCh.emoji} {activeCh.name}</span>
                  </div>
                  <CloseBtn />
                </div>
                <div className="flex-1 overflow-y-auto">
                  {mentionMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6">
                      <div className="w-12 h-12 rounded-2xl bg-gray-800/60 flex items-center justify-center mb-3">
                        <AtSign size={20} className="text-gray-600" />
                      </div>
                      <p className="text-sm font-semibold text-gray-400">No mentions yet</p>
                      <p className="text-xs text-gray-600 mt-1">Messages where someone @mentioned you will appear here</p>
                    </div>
                  ) : (
                    <div className="py-1">
                      {mentionMessages.map(msg => (
                        <button
                          key={msg.id}
                          onClick={() => { setHighlightedMsgId(msg.id); setSidebarView("chat"); }}
                          className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-800/40 transition-colors text-left border-b border-gray-800/30 last:border-0"
                        >
                          {msg.userPhoto
                            ? <img src={msg.userPhoto} alt={msg.userName} className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5" />
                            : <div className="w-8 h-8 rounded-full bg-indigo-900/50 flex items-center justify-center text-indigo-300 text-xs font-bold shrink-0 mt-0.5">{msg.userName?.[0]?.toUpperCase() ?? "?"}</div>
                          }
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-semibold text-gray-200">{msg.userName}</span>
                              <span className="text-[10px] text-gray-600 ml-auto">{timeAgo(msg.createdAt)}</span>
                            </div>
                            <p className="text-xs text-gray-400 leading-relaxed line-clamp-2 break-words">{msg.text}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ══════════ SEARCH VIEW ══════════ */}
            {sidebarView === "search" && (
              <>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60 shrink-0">
                  <div className="flex items-center gap-2">
                    <Search size={14} className="text-indigo-400" />
                    <h3 className="text-sm font-bold text-white">Search</h3>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-gray-800 text-gray-500 ml-1">{activeCh.emoji} {activeCh.name}</span>
                  </div>
                  <CloseBtn />
                </div>
                <div className="px-3 py-2.5 border-b border-gray-800/60 shrink-0">
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search across all channels…"
                      className="w-full bg-gray-800 border border-gray-700/50 text-gray-100 text-xs pl-8 pr-8 py-2.5 rounded-xl focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 placeholder-gray-600 transition-all"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  {searchQuery && (
                    <p className="text-[10px] text-gray-600 mt-1.5 pl-1">
                      {searchResults.length === 0 ? "No results" : `${searchResults.length} result${searchResults.length !== 1 ? "s" : ""}`}
                    </p>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto">
                  {!searchQuery ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6">
                      <div className="w-12 h-12 rounded-2xl bg-gray-800/60 flex items-center justify-center mb-3">
                        <Search size={20} className="text-gray-600" />
                      </div>
                      <p className="text-sm font-semibold text-gray-400">Search messages</p>
                      <p className="text-xs text-gray-600 mt-1">Find anything across all channels</p>
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6">
                      <p className="text-sm font-semibold text-gray-500">No results for</p>
                      <p className="text-xs text-indigo-400/60 mt-0.5">"{searchQuery}"</p>
                    </div>
                  ) : (
                    <div className="py-1">
                      {searchResults.map(msg => {
                        const q   = searchQuery.toLowerCase();
                        const txt = msg.text;
                        const idx = txt.toLowerCase().indexOf(q);
                        return (
                          <button
                            key={msg.id}
                            onClick={() => { setHighlightedMsgId(msg.id); setSidebarView("chat"); }}
                            className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-800/40 transition-colors text-left border-b border-gray-800/30 last:border-0"
                          >
                            {msg.userPhoto
                              ? <img src={msg.userPhoto} alt={msg.userName} className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />
                              : <div className="w-7 h-7 rounded-full bg-indigo-900/50 flex items-center justify-center text-indigo-300 text-[10px] font-bold shrink-0 mt-0.5">{msg.userName?.[0]?.toUpperCase() ?? "?"}</div>
                            }
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-xs font-semibold text-gray-200">{msg.userName}</span>
                                <span className="text-[10px] text-gray-600 ml-auto">{timeAgo(msg.createdAt)}</span>
                              </div>
                              <p className="text-xs text-gray-400 leading-relaxed break-words">
                                {idx >= 0 ? (
                                  <>{txt.slice(0, idx)}<span className="bg-yellow-500/25 text-yellow-300 rounded px-0.5">{txt.slice(idx, idx + q.length)}</span>{txt.slice(idx + q.length)}</>
                                ) : txt}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ══════════ PINNED VIEW ══════════ */}
            {sidebarView === "pinned" && (
              <>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60 shrink-0">
                  <div className="flex items-center gap-2">
                    <Pin size={14} className="text-amber-400" />
                    <h3 className="text-sm font-bold text-white">Pinned Messages</h3>
                    {pinnedMessages.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-600/20 text-amber-400 font-semibold">{pinnedMessages.length}</span>
                    )}
                    <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-gray-800 text-gray-500 ml-1">{activeCh.emoji} {activeCh.name}</span>
                  </div>
                  <CloseBtn />
                </div>
                <div className="flex-1 overflow-y-auto">
                  {pinnedMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6">
                      <div className="w-12 h-12 rounded-2xl bg-gray-800/60 flex items-center justify-center mb-3">
                        <Pin size={20} className="text-gray-600" />
                      </div>
                      <p className="text-sm font-semibold text-gray-400">No pinned messages</p>
                      <p className="text-xs text-gray-600 mt-1">Hover a message and click 📌 to pin it</p>
                    </div>
                  ) : (
                    <div className="py-2">
                      {pinnedMessages.map(msg => (
                        <button
                          key={msg.id}
                          onClick={() => { setHighlightedMsgId(msg.id); setSidebarView("chat"); }}
                          className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-800/40 transition-colors text-left border-b border-gray-800/30 last:border-0"
                        >
                          <Pin size={11} className="text-amber-400 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-semibold text-gray-200">{msg.userName}</span>
                              <span className="text-[9px] text-gray-700 ml-auto">{timeAgo(msg.createdAt)}</span>
                            </div>
                            {msg.imageUrl && <span className="text-[10px] text-gray-500 italic">🖼️ Image</span>}
                            {msg.text && <p className="text-xs text-gray-400 line-clamp-2 break-words">{msg.text}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ══════════ IMAGES VIEW ══════════ */}
            {sidebarView === "images" && (
              <>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60 shrink-0">
                  <div className="flex items-center gap-2">
                    <ImageIcon size={14} className="text-sky-400" />
                    <h3 className="text-sm font-bold text-white">Images</h3>
                    {imageMessages.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-600/20 text-sky-400 font-semibold">{imageMessages.length}</span>
                    )}
                    <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-gray-800 text-gray-500 ml-1">{activeCh.emoji} {activeCh.name}</span>
                  </div>
                  <CloseBtn />
                </div>
                <div className="flex-1 overflow-y-auto">
                  {imageMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6">
                      <div className="w-12 h-12 rounded-2xl bg-gray-800/60 flex items-center justify-center mb-3">
                        <ImageIcon size={20} className="text-gray-600" />
                      </div>
                      <p className="text-sm font-semibold text-gray-400">No images yet</p>
                      <p className="text-xs text-gray-600 mt-1">Images shared in chat will appear here</p>
                    </div>
                  ) : (
                    <div className="p-3 grid grid-cols-3 gap-1.5">
                      {imageMessages.map(msg => (
                        <button
                          key={msg.id}
                          onClick={() => { setHighlightedMsgId(msg.id); setSidebarView("chat"); }}
                          title={`${msg.userName} • ${timeAgo(msg.createdAt)}`}
                          className="relative group/img aspect-square rounded-xl overflow-hidden border border-gray-700/40 hover:border-sky-500/50 transition-all"
                        >
                          <img src={msg.imageUrl!} alt="shared" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-0 group-hover/img:opacity-100 transition-all flex items-end p-1.5">
                            <span className="text-[9px] text-white font-semibold leading-tight line-clamp-2">{msg.userName}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ══════════ LINKS VIEW ══════════ */}
            {sidebarView === "links" && (
              <>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60 shrink-0">
                  <div className="flex items-center gap-2">
                    <Link2 size={14} className="text-emerald-400" />
                    <h3 className="text-sm font-bold text-white">Links</h3>
                    {linkMessages.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-600/20 text-emerald-400 font-semibold">{linkMessages.length}</span>
                    )}
                    <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-gray-800 text-gray-500 ml-1">{activeCh.emoji} {activeCh.name}</span>
                  </div>
                  <CloseBtn />
                </div>
                <div className="flex-1 overflow-y-auto">
                  {linkMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6">
                      <div className="w-12 h-12 rounded-2xl bg-gray-800/60 flex items-center justify-center mb-3">
                        <Link2 size={20} className="text-gray-600" />
                      </div>
                      <p className="text-sm font-semibold text-gray-400">No links yet</p>
                      <p className="text-xs text-gray-600 mt-1">URLs shared in chat will appear here</p>
                    </div>
                  ) : (
                    <div className="py-1">
                      {linkMessages.map(msg => {
                        return (
                          <div key={msg.id} className="border-b border-gray-800/30 last:border-0">
                            {/* Sender info + links */}
                            <div className="flex items-start gap-2 px-3 pt-3 pb-0.5">
                              {msg.userPhoto
                                ? <img src={msg.userPhoto} alt={msg.userName} className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5" />
                                : <div className="w-6 h-6 rounded-full bg-emerald-900/50 flex items-center justify-center text-emerald-400 text-[10px] font-bold shrink-0">{msg.userName?.[0]?.toUpperCase() ?? "?"}</div>
                              }
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  <span className="text-[11px] font-semibold text-gray-300">{msg.userName}</span>
                                  <span className="text-[10px] text-gray-700 ml-auto">{timeAgo(msg.createdAt)}</span>
                                </div>
                                {/* URL cards */}
                                <div className="space-y-1">
                                  {msg.urls.map((url, i) => {
                                    let domain = "";
                                    try { domain = new URL(url).hostname.replace("www.", ""); } catch {}
                                    return (
                                      <a
                                        key={i}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={e => e.stopPropagation()}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-950/30 border border-emerald-800/30 hover:border-emerald-600/50 hover:bg-emerald-950/60 transition-all group/link"
                                      >
                                        <img
                                          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                                          alt=""
                                          className="w-3.5 h-3.5 rounded shrink-0"
                                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                                        />
                                        <span className="text-[11px] text-emerald-400 group-hover/link:text-emerald-300 truncate font-medium flex-1">
                                          {domain || url.slice(0, 30)}
                                        </span>
                                        <ExternalLink size={9} className="shrink-0 text-gray-600 group-hover/link:text-emerald-400 transition-colors" />
                                      </a>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                            {/* Click to jump to message */}
                            <button
                              onClick={() => { setHighlightedMsgId(msg.id); setSidebarView("chat"); }}
                              className="w-full px-3 pt-1 pb-2.5 text-left"
                            >
                              <p className="text-[10px] text-gray-600 hover:text-gray-400 line-clamp-2 break-words transition-colors pl-8">{msg.text}</p>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ══════════ SETTINGS VIEW ══════════ */}
            {sidebarView === "settings" && (
              <>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60 shrink-0">
                  <div className="flex items-center gap-2">
                    <Settings size={14} className="text-indigo-400" />
                    <h3 className="text-sm font-bold text-white">Settings</h3>
                  </div>
                  <CloseBtn />
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">

                  {/* Theme section */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
                        <span className="text-[9px]">🎨</span>
                      </div>
                      <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">Theme</span>
                    </div>

                    <p className="text-[10px] text-gray-500 mb-3">Member name color in chat</p>

                    <div className="grid grid-cols-3 gap-2">
                      {THEMES.map(t => (
                        <button
                          key={t.id}
                          onClick={() => { setChatTheme(t.id); try { localStorage.setItem(`wf_${widgetId}_theme`, t.id); } catch {} }}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all ${
                            chatTheme === t.id
                              ? "border-white/30 bg-white/10 shadow-lg scale-105"
                              : "border-gray-700/60 bg-gray-800/40 hover:bg-gray-800/70"
                          }`}
                        >
                          <div className={`w-3.5 h-3.5 rounded-full ${t.dotClass} shrink-0 ${chatTheme === t.id ? "ring-2 ring-white/40" : ""}`} />
                          <span className={`text-[11px] font-medium ${chatTheme === t.id ? "text-white" : "text-gray-400"}`}>{t.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* Preview row */}
                    <div className="mt-4 p-3 bg-gray-900/60 border border-gray-800/60 rounded-xl">
                      <p className="text-[9px] text-gray-600 mb-2 uppercase tracking-wider">Preview</p>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-indigo-900/60 flex items-center justify-center text-[9px] text-indigo-300 font-bold">J</div>
                        <div>
                          <span className={`text-xs font-semibold ${theme.nameClass}`}>Your Name</span>
                          <span className="ml-1.5 text-[9px] text-indigo-500/70">you</span>
                          <p className="text-sm text-gray-300 leading-snug">Sample message text</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-800/60 pt-4">
                    <p className="text-[10px] text-gray-600 text-center">More settings coming soon</p>
                  </div>

                </div>
              </>
            )}

          </div>{/* end main content */}
        </div>
      )}

      {/* ── Mobile Long-Press Bottom Sheet ─────────────────────────────────── */}
      {longPressTarget && (() => {
        const { msg, isTeam } = longPressTarget;
        const accent  = isTeam ? "indigo" : "emerald";
        const isMine  = msg.userId === userId;
        const isPinned = msg.pinned;
        const dismiss = () => setLongPressTarget(null);

        const doReaction = (emoji: string) => {
          if (isTeam) toggleReaction(msg, emoji);
          else toggleDevReaction(msg, emoji);
          dismiss();
        };
        const doReply = () => {
          const replyPayload = { id: msg.id, userId: msg.userId, userName: msg.userName, text: msg.text, userPhoto: msg.userPhoto, imageUrl: msg.imageUrl };
          if (isTeam) { setReplyingTo(replyPayload); setTimeout(() => inputRef.current?.focus(), 80); }
          else         { setDevReplyingTo(replyPayload); setTimeout(() => devInputRef.current?.focus(), 80); }
          dismiss();
        };
        const doPin = () => {
          if (isTeam) togglePin(msg);
          else toggleDevPin(msg);
          dismiss();
        };
        const doEdit = () => {
          if (isTeam) { setEditingId(msg.id); setEditText(msg.text || ""); }
          else        { setDevEditingId(msg.id); setDevEditText(msg.text || ""); }
          dismiss();
        };
        const doDelete = () => {
          if (isTeam) setDeletingId(msg.id);
          else        setDevDeletingId(msg.id);
          dismiss();
        };

        return (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-[400] bg-black/60 backdrop-blur-[2px]"
              onClick={dismiss}
            />
            {/* Sheet */}
            <div
              className="fixed bottom-0 left-0 right-0 z-[401] rounded-t-3xl overflow-hidden"
              style={{
                background: "linear-gradient(180deg, #111115 0%, #0d0d10 100%)",
                boxShadow: "0 -8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)",
                animation: "slideUpSheet 0.28s cubic-bezier(0.34,1.56,0.64,1) forwards",
              }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-gray-700" />
              </div>

              {/* Message preview */}
              <div className="px-5 py-3 border-b border-gray-800/60">
                <div className="flex items-center gap-2.5 mb-1">
                  {msg.userPhoto
                    ? <img src={msg.userPhoto} alt={msg.userName} className="w-6 h-6 rounded-full object-cover ring-1 ring-gray-700" />
                    : <div className={`w-6 h-6 rounded-full bg-${accent}-900/60 flex items-center justify-center text-${accent}-300 text-[10px] font-bold`}>{msg.userName?.[0]?.toUpperCase()}</div>
                  }
                  <span className="text-xs font-semibold text-gray-300">{msg.userName}</span>
                  {isMine && <span className="text-[9px] text-gray-600 font-medium">you</span>}
                </div>
                <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed pl-8">
                  {msg.imageUrl ? "📎 Image attachment" : (msg.text || "")}
                </p>
              </div>

              {/* Quick emoji reactions */}
              <div className="flex items-center justify-around px-4 py-3 border-b border-gray-800/40">
                {REACTION_EMOJIS.map(emoji => {
                  const hasReacted = msg.reactions?.[emoji]?.includes(userId ?? "");
                  return (
                    <button
                      key={emoji}
                      onClick={() => doReaction(emoji)}
                      className={`flex flex-col items-center gap-0.5 p-2 rounded-2xl transition-all active:scale-90 ${hasReacted ? `bg-${accent}-900/40 ring-1 ring-${accent}-500/50` : "hover:bg-gray-800/60"}`}
                    >
                      <span className="text-2xl leading-none">{emoji}</span>
                      {msg.reactions?.[emoji]?.length ? (
                        <span className="text-[9px] text-gray-500 font-semibold">{msg.reactions[emoji].length}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {/* Action buttons */}
              <div className="px-4 py-2 space-y-1 pb-safe-bottom" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
                {/* Reply */}
                <button onClick={doReply}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-gray-800/60 active:bg-gray-700/60 transition-all text-left">
                  <div className="w-9 h-9 rounded-xl bg-indigo-900/40 flex items-center justify-center shrink-0">
                    <Reply size={17} className="text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-100">Reply</p>
                    <p className="text-[10px] text-gray-600">Quote and respond to this message</p>
                  </div>
                </button>

                {/* Pin / Unpin */}
                <button onClick={doPin}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-gray-800/60 active:bg-gray-700/60 transition-all text-left">
                  <div className="w-9 h-9 rounded-xl bg-amber-900/30 flex items-center justify-center shrink-0">
                    {isPinned ? <PinOff size={17} className="text-amber-400" /> : <Pin size={17} className="text-amber-400" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-100">{isPinned ? "Unpin" : "Pin Message"}</p>
                    <p className="text-[10px] text-gray-600">{isPinned ? "Remove from pinned messages" : "Keep this message at the top"}</p>
                  </div>
                </button>

                {/* Edit — own messages only */}
                {isMine && msg.text && (
                  <button onClick={doEdit}
                    className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-gray-800/60 active:bg-gray-700/60 transition-all text-left">
                    <div className="w-9 h-9 rounded-xl bg-sky-900/30 flex items-center justify-center shrink-0">
                      <Pencil size={17} className="text-sky-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-100">Edit Message</p>
                      <p className="text-[10px] text-gray-600">Fix typos or update your message</p>
                    </div>
                  </button>
                )}

                {/* Delete */}
                {(isMine || isAdmin) && (
                  <button onClick={doDelete}
                    className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-red-900/20 active:bg-red-900/30 transition-all text-left">
                    <div className="w-9 h-9 rounded-xl bg-red-900/30 flex items-center justify-center shrink-0">
                      <Trash2 size={17} className="text-red-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-red-300">Delete Message</p>
                      <p className="text-[10px] text-gray-600">Permanently remove this message</p>
                    </div>
                  </button>
                )}

                {/* Cancel */}
                <button onClick={dismiss}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl bg-gray-800/40 hover:bg-gray-700/40 active:bg-gray-600/40 transition-all mt-2">
                  <X size={15} className="text-gray-500" />
                  <span className="text-sm font-semibold text-gray-400">Cancel</span>
                </button>
              </div>
            </div>
          </>
        );
      })()}

      {/* ── Floating Action Button ───────────────────────────────────────── */}
      {/* Mobile-only FAB (circular, shown when closed) */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Open team chat"
        className={`relative w-14 h-14 rounded-full items-center justify-center shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95 focus:outline-none sm:hidden ${open ? "hidden" : "flex"}`}
        style={{ marginRight: "1rem", marginBottom: "1rem",
          background: fabGradient ?? "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)",
          boxShadow: totalUnread > 0 ? "0 0 0 0 rgba(139,92,246,0.7), 0 8px 32px rgba(99,102,241,0.5)" : "0 8px 32px rgba(99,102,241,0.35)",
        }}
      >
        {totalUnread > 0 && <span className="absolute inset-0 rounded-full animate-ping" style={{ background: "rgba(139,92,246,0.35)" }} />}
        <span className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, transparent 60%)" }} />
        {fabIcon ?? <MessageSquare size={22} className="text-white relative z-10" />}
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 ring-2 ring-gray-950 shadow-lg z-20">
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </button>

      {/* Desktop/Tablet: Messenger-style bottom tab bar */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? "Close team chat" : "Open team chat"}
        className="hidden sm:flex items-center gap-2.5 px-4 h-[48px] w-[220px] rounded-t-2xl rounded-b-none focus:outline-none transition-all duration-200 hover:brightness-110 active:brightness-90 shrink-0"
        style={{
          background: open
            ? "linear-gradient(135deg, #4338ca 0%, #6d28d9 100%)"
            : fabGradient ?? "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
          boxShadow: "0 -4px 24px rgba(99,102,241,0.3)",
        }}
      >
        <MessageSquare size={18} className="text-white/90 shrink-0" />
        <span className="text-sm font-bold text-white flex-1 text-left">Team Chat</span>
        {totalUnread > 0 && !open && (
          <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 shadow-lg">
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
        {open
          ? <ChevronDown size={16} className="text-white/70" />
          : <ChevronUp size={16} className="text-white/70" />
        }
      </button>
    </div>
    </>
  );
}

export default ChatWidget;
