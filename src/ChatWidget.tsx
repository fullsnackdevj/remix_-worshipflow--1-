import React, { useState, useEffect, useRef, useCallback } from "react";
import { collection, query, orderBy, limitToLast, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { MessageSquare, X, Send, Trash2, Reply, AtSign, Search, Settings, Paperclip, Smile, Pin, PinOff, ImageIcon, Link2, ExternalLink, Code2, Pencil, Check, ChevronUp, ChevronDown, MoreVertical } from "lucide-react";
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
  userRole?: string;                 // Sender role for @everyone permission check
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
export function ChatWidget({ isAdmin, userId, userName, userPhoto, userRole = "member", allMembers,
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
  const [closing,        setClosing]        = useState(false);
  const [sidebarView,   setSidebarView]   = useState<SidebarView>("chat");
  const [chatTheme,     setChatTheme]     = useState<ThemeId>(() => {
    try { return (localStorage.getItem(`wf_${widgetId}_theme`) as ThemeId) || "indigo"; } catch { return "indigo"; }
  });
  const [bubbleStyle,    setBubbleStyle]    = useState<"flat"|"bubble"|"minimal">(() => {
    try { return (localStorage.getItem(`wf_${widgetId}_bubble`) ?? "flat") as "flat"|"bubble"|"minimal"; } catch { return "flat"; }
  });
  const [bgPattern,      setBgPattern]      = useState<"none"|"dots"|"grid">(() => {
    try { return (localStorage.getItem(`wf_${widgetId}_pattern`) ?? "none") as "none"|"dots"|"grid"; } catch { return "none"; }
  });
  const [avatarShape,    setAvatarShape]    = useState<"circle"|"squircle">(() => {
    try { return (localStorage.getItem(`wf_${widgetId}_avatar`) ?? "circle") as "circle"|"squircle"; } catch { return "circle"; }
  });
  const [timestampStyle, setTimestampStyle] = useState<"relative"|"absolute"|"hidden">(() => {
    try { return (localStorage.getItem(`wf_${widgetId}_timestamp`) ?? "relative") as "relative"|"absolute"|"hidden"; } catch { return "relative"; }
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
  // ── Notification state ────────────────────────────────────────────────────
  const [devUnreadDots, setDevUnreadDots] = useState<Set<string>>(new Set());
  const [muteNotifs,    setMuteNotifs]    = useState<boolean>(() => {
    try { return localStorage.getItem(`wf_${widgetId}_mute`) === "true"; } catch { return false; }
  });
  const [soundEnabled,  setSoundEnabled]  = useState<boolean>(() => {
    try { return localStorage.getItem(`wf_${widgetId}_sound`) !== "false"; } catch { return true; }
  });
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
  // ── Mobile ⋮ menu + inline search bar ────────────────────────────────────────
  const [mobileMenuOpen,         setMobileMenuOpen]         = useState(false);
  const [mobileSearchOpen,       setMobileSearchOpen]       = useState(false);
  const [devMobileMenuOpen,      setDevMobileMenuOpen]      = useState(false);
  const [inputFocused,           setInputFocused]           = useState(false);
  const [devInputFocused,        setDevInputFocused]        = useState(false);
  const [channelDropdownOpen,    setChannelDropdownOpen]    = useState(false);
  const [devChannelDropdownOpen, setDevChannelDropdownOpen] = useState(false);
  const [modeDropdownOpen,       setModeDropdownOpen]       = useState(false);
  // ── Mobile long-press context menu ───────────────────────────────────────────
  const [longPressTarget, setLongPressTarget] = useState<{ msg: ChatMessage; isTeam: boolean } | null>(null);
  const [fabDragging, setFabDragging] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressMoved = useRef(false);

  // ── Draggable FAB (mobile only) ───────────────────────────────────────────────
  const FAB_SIZE = 56; // px (w-14 h-14 = 56px)
  const FAB_MARGIN = 14; // px from edges
  const loadFabPos = (): { x: number; y: number } => {
    try {
      const v = localStorage.getItem(`wf_${widgetId}_fab_pos`);
      if (v) return JSON.parse(v);
    } catch {}
    // Default: bottom-right
    return {
      x: window.innerWidth  - FAB_SIZE - FAB_MARGIN,
      y: window.innerHeight - FAB_SIZE - FAB_MARGIN,
    };
  };
  const [fabPos, setFabPos] = useState<{ x: number; y: number }>(() => ({
    x: typeof window !== "undefined" ? window.innerWidth  - FAB_SIZE - FAB_MARGIN : 300,
    y: typeof window !== "undefined" ? window.innerHeight - FAB_SIZE - FAB_MARGIN : 600,
  }));
  const fabDragRef   = useRef<{ startX: number; startY: number; startPX: number; startPY: number; moved: boolean } | null>(null);
  const fabElRef     = useRef<HTMLButtonElement>(null);

  // Restore saved position once on mount
  useEffect(() => {
    const saved = loadFabPos();
    // Clamp in case screen size changed
    const maxX = window.innerWidth  - FAB_SIZE - FAB_MARGIN;
    const maxY = window.innerHeight - FAB_SIZE - FAB_MARGIN;
    setFabPos({ x: Math.max(FAB_MARGIN, Math.min(saved.x, maxX)), y: Math.max(FAB_MARGIN, Math.min(saved.y, maxY)) });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onFabPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (open) return; // chat is open, don't drag
    e.currentTarget.setPointerCapture(e.pointerId);
    fabDragRef.current = { startX: fabPos.x, startY: fabPos.y, startPX: e.clientX, startPY: e.clientY, moved: false };
  };


  const onFabPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!fabDragRef.current) return;
    const dx = e.clientX - fabDragRef.current.startPX;
    const dy = e.clientY - fabDragRef.current.startPY;
    if (!fabDragRef.current.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
    if (!fabDragRef.current.moved) { fabDragRef.current.moved = true; setFabDragging(true); }
    const newX = Math.max(FAB_MARGIN, Math.min(fabDragRef.current.startX + dx, window.innerWidth  - FAB_SIZE - FAB_MARGIN));
    const newY = Math.max(FAB_MARGIN, Math.min(fabDragRef.current.startY + dy, window.innerHeight - FAB_SIZE - FAB_MARGIN));
    setFabPos({ x: newX, y: newY });
  };

  const onFabPointerUp = (_e: React.PointerEvent<HTMLButtonElement>) => {
    if (!fabDragRef.current) return;
    const { moved } = fabDragRef.current;
    fabDragRef.current = null;
    setFabDragging(false);
    if (!moved) {
      // It was a tap — open or close with animation
      if (open) { closeWidgetRef.current?.(); }
      else { openWidgetRef.current?.(); }
      return;
    }
    // Snap to nearest horizontal edge
    const midX = window.innerWidth / 2;
    const snappedX = fabPos.x + FAB_SIZE / 2 < midX
      ? FAB_MARGIN
      : window.innerWidth - FAB_SIZE - FAB_MARGIN;
    const finalPos = { x: snappedX, y: fabPos.y };
    setFabPos(finalPos);
    try { localStorage.setItem(`wf_${widgetId}_fab_pos`, JSON.stringify(finalPos)); } catch {}
  };

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
  const devLocalPinnedRef  = useRef<Set<string>>(new Set());
  // ── Live refs for background listener (stale-closure-free, no re-subscribe needed) ──
  const openRef             = useRef(false);
  const sidebarViewRef      = useRef<SidebarView>("chat");
  const activeChannelRef    = useRef<string>(CH[0]?.id ?? "");
  const devActiveChannelRef = useRef<string>(DEV_CHANNELS[0].id);
  const muteNotifsRef       = useRef(false);
  const userNameRef         = useRef(userName);  // for mention matching inside snapshot callbacks
  const playNotifSoundRef   = useRef<() => void>(() => {}); // synced below, after playNotifSound is declared
  const notifiedBgMsgIds    = useRef<Set<string>>(new Set());

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
  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { sidebarViewRef.current = sidebarView; }, [sidebarView]);
  useEffect(() => { activeChannelRef.current = activeChannel; }, [activeChannel]);
  useEffect(() => { devActiveChannelRef.current = devActiveChannel; }, [devActiveChannel]);
  useEffect(() => { muteNotifsRef.current = muteNotifs; }, [muteNotifs]);
  useEffect(() => { userNameRef.current = userName; }, [userName]);

  // ── Toast helper ─────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string, type: "success"|"error"|"info" = "error") => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev.slice(-4), { id, type, msg }]);
    setTimeout(() => { if (mountedRef.current) setToasts(prev => prev.filter(t => t.id !== id)); }, 4000);
  }, []);

  // ── In-app notification sound (Web Audio API, zero cost) ─────────────────
  const playNotifSound = useCallback(() => {
    if (muteNotifs || !soundEnabled) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
      setTimeout(() => ctx.close().catch(() => {}), 600);
    } catch {}
  }, [muteNotifs, soundEnabled]);
  // playNotifSoundRef sync must live HERE — after playNotifSound is declared (const/useCallback
  // is in temporal dead zone above this line, so the effect dep can only be listed here)
  useEffect(() => { playNotifSoundRef.current = playNotifSound; }, [playNotifSound]);

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

  // ── Always-on background unread listener (works even when widget is CLOSED) ──
  // Notification rules:
  //   - Regular messages → unread dot + count only (NO browser push)
  //   - @mention of current user → push notification + sound
  //   - @everyone command → push notification + sound for all
  //   - 60-second freshness window → older messages never trigger push (only unread dot)
  //   - dep array = [userId] ONLY — all other values read via live refs (no re-subscribe on state change)
  useEffect(() => {
    if (!userId) return;
    const subs: (() => void)[] = [];

    const shouldPush = (data: Record<string, any>, lastTs: number): boolean => {
      // Freshness gate: messages older than 60s are "already happened" — dot only, no push
      if (Date.now() - lastTs > 60_000) return false;
      // @everyone in text → notify everyone
      if ((data.text || "").toLowerCase().includes("@everyone")) return true;
      // @mention matching — check if any mention token matches the current user's name
      const myName = userNameRef.current.toLowerCase().replace(/\s+/g, "");
      const mentions: string[] = data.mentions || [];
      return mentions.some((m: string) => {
        const ml = m.toLowerCase();
        return ml === myName || myName.startsWith(ml) || ml.startsWith(myName.slice(0, Math.max(3, ml.length)));
      });
    };

    // Team channels
    CH.forEach(ch => {
      subs.push(onSnapshot(
        query(collection(db, "chat_channels", ch.id, "messages"), orderBy("createdAt", "asc"), limitToLast(1)),
        snap => {
          if (snap.empty) return;
          const doc    = snap.docs[0];
          const data   = doc.data();
          const lastTs = data.createdAt?.toDate?.()?.getTime() ?? 0;
          if (data.userId === userId) return;                              // own message
          if (lastTs <= (lastReadRef.current[ch.id] ?? 0)) return;         // already read
          if (notifiedBgMsgIds.current.has(doc.id)) return;               // already processed
          notifiedBgMsgIds.current.add(doc.id);
          const isViewing = openRef.current && sidebarViewRef.current === "chat" && ch.id === activeChannelRef.current;
          if (!isViewing) setUnreadDots(prev => new Set([...prev, ch.id]));
          // Push only for @mentions / @everyone (not every message)
          if (!openRef.current && !muteNotifsRef.current && shouldPush(data, lastTs)) {
            playNotifSoundRef.current();
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              const isEveryone = (data.text || "").toLowerCase().includes("@everyone");
              const title = isEveryone ? `📢 ${data.userName} — @everyone` : `💬 ${data.userName} mentioned you`;
              try { new Notification(title, { body: (data.text || "📎 Image").slice(0, 100), icon: data.userPhoto || "/icon-192.png", tag: `wf-tm-${doc.id}`, renotify: false }); } catch {}
            }
          }
        }
      ));
    });

    // Dev channels
    DEV_CHANNELS.forEach(ch => {
      subs.push(onSnapshot(
        query(collection(db, "chat_channels", ch.id, "messages"), orderBy("createdAt", "asc"), limitToLast(1)),
        snap => {
          if (snap.empty) return;
          const doc    = snap.docs[0];
          const data   = doc.data();
          const lastTs = data.createdAt?.toDate?.()?.getTime() ?? 0;
          const devReadKey = `wf_${widgetId}_dev_read_${ch.id}`;
          const lastSeen = parseInt(localStorage.getItem(devReadKey) ?? "0", 10) || 0;
          if (data.userId === userId) return;                              // own message
          if (lastTs <= lastSeen) return;                                   // already read
          if (notifiedBgMsgIds.current.has(doc.id)) return;               // already processed
          notifiedBgMsgIds.current.add(doc.id);
          const isViewing = openRef.current && sidebarViewRef.current === "dev" && ch.id === devActiveChannelRef.current;
          if (!isViewing) setDevUnreadDots(prev => new Set([...prev, ch.id]));
          // Push only for @mentions / @everyone
          if (!openRef.current && !muteNotifsRef.current && shouldPush(data, lastTs)) {
            playNotifSoundRef.current();
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              const isEveryone = (data.text || "").toLowerCase().includes("@everyone");
              const title = isEveryone ? `📢 ${data.userName} — @everyone` : `💬 ${data.userName} mentioned you`;
              try { new Notification(title, { body: (data.text || "📎 Image").slice(0, 100), icon: data.userPhoto || "/icon-192.png", tag: `wf-dev-${doc.id}`, renotify: false }); } catch {}
            }
          }
        }
      ));
    });

    return () => subs.forEach(u => u());
  }, [userId]); // Only userId — all other state read via live refs (prevents re-subscribe on state changes)

  // ── Scroll: instant on open/switch, smooth on new message ────────────────
  useEffect(() => {
    if (open && sidebarView === "chat" && messages.length > 0)
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [open, activeChannel, sidebarView]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || sidebarView !== "chat" || messages.length === 0) return;
    if (messages.length > prevLenRef.current) {
      const last = messages[messages.length - 1];
      if (last.userId !== userId) playNotifSound();
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
    }
    prevLenRef.current = messages.length;
  }, [messages.length, open, sidebarView]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Clear unread dot for the channel we just switched to
    setDevUnreadDots(prev => { const n = new Set(prev); n.delete(id); return n; });
    try { localStorage.setItem(`wf_${widgetId}_dev_read_${id}`, String(Date.now())); } catch {}
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

  // Dev textarea auto-resize (collapse when not focused, expand when focused)
  useEffect(() => {
    if (!devInputRef.current) return;
    if (devInputFocused) {
      devInputRef.current.style.height = "auto";
      devInputRef.current.style.height = `${Math.min(devInputRef.current.scrollHeight, 112)}px`;
    } else {
      devInputRef.current.style.height = ""; // clear — let rows=1 define natural 1-line height
    }
  }, [devInput, devInputFocused]);

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

  // ── Open / Close widget (with Shrink-to-FAB animation) ───────────────────
  const closeWidgetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeWidgetRef   = useRef<(() => void) | null>(null);
  const openWidgetRef    = useRef<(() => void) | null>(null);
  // Grace-period: ignore outside-clicks for 350ms right after opening
  const justOpenedRef    = useRef(false);

  const closeWidget = useCallback(() => {
    if (closeWidgetTimer.current) { clearTimeout(closeWidgetTimer.current); closeWidgetTimer.current = null; }
    setClosing(true);
    closeWidgetTimer.current = setTimeout(() => {
      setOpen(false);
      setClosing(false);
      setReactingMsgId(null);
      closeWidgetTimer.current = null;
    }, 320);
  }, []);

  const openWidget = useCallback(() => {
    // Cancel any in-flight close timer so it can't slam the panel shut again
    if (closeWidgetTimer.current) { clearTimeout(closeWidgetTimer.current); closeWidgetTimer.current = null; }
    setClosing(false);
    setOpen(true);
    // Ignore outside-click events that fire immediately from the same open gesture
    justOpenedRef.current = true;
    setTimeout(() => { justOpenedRef.current = false; }, 350);
  }, []);

  // Keep refs current so early-defined handlers (FAB tap) can call these
  closeWidgetRef.current = closeWidget;
  openWidgetRef.current  = openWidget;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      // Ignore clicks fired in the grace period right after opening (avoids
      // the browser's synthetic mousedown from the open gesture closing us immediately)
      if (justOpenedRef.current) return;
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        closeWidget();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, closeWidget]);

  // ── Auto-reset mobile search bar when leaving search view ───────────────────
  // Covers ALL navigation paths (result click, sidebar btn, Team/Dev toggle, etc.)
  useEffect(() => {
    if (sidebarView !== "search") {
      setMobileSearchOpen(false);
      setSearchQuery("");
    }
  }, [sidebarView]);

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

  // ── Auto-resize textarea (collapse when not focused, expand when focused) ───
  useEffect(() => {
    if (!inputRef.current) return;
    if (inputFocused) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    } else {
      inputRef.current.style.height = ""; // clear — let rows=1 define natural 1-line height
    }
  }, [input, inputFocused]);

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
          channelId: activeChannel, userId, userName, userRole,
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

  // ── Appearance helpers (derived from settings) ───────────────────────────
  const avatarCls = avatarShape === "squircle" ? "rounded-[35%]" : "rounded-full";
  const bgPatternStyle: React.CSSProperties = bgPattern === "dots"
    ? { backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "20px 20px" }
    : bgPattern === "grid"
    ? { backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "24px 24px" }
    : {};
  const fmtTime = (ts: any): string | null => {
    if (timestampStyle === "hidden") return null;
    if (timestampStyle === "absolute") {
      const d = new Date(ts); return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }
    return timeAgo(ts);
  };
  const msgBubbleCls = (mine: boolean) => bubbleStyle === "bubble"
    ? `rounded-xl px-2.5 py-2 ${mine ? "bg-indigo-900/30 border border-indigo-800/30" : "bg-gray-800/40 border border-gray-700/30"}`
    : "";
  const devBubbleCls = (mine: boolean) => bubbleStyle === "bubble"
    ? `rounded-xl px-2.5 py-2 ${mine ? "bg-emerald-900/30 border border-emerald-800/30" : "bg-gray-800/40 border border-gray-700/30"}`
    : "";

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
    <button onClick={closeWidget} className="hidden sm:flex p-1.5 text-gray-600 hover:text-gray-300 rounded-lg hover:bg-gray-800 transition-colors">
      <X size={14} />
    </button>
  );

  // Back button — mobile only, returns to chat view from any sub-view
  const BackBtn = ({ onBack }: { onBack?: () => void }) => (
    <button
      onClick={onBack ?? (() => setSidebarView("chat"))}
      className="flex items-center gap-1 p-1.5 pr-2 text-gray-500 hover:text-indigo-300 hover:bg-indigo-900/20 rounded-lg transition-colors text-xs font-medium mr-1"
    >
      <ChevronDown size={14} className="rotate-90" />
      <span>Back</span>
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
        @keyframes wf-menu-drop {
          from { opacity: 0; transform: translateY(-6px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        .wf-menu-drop { animation: wf-menu-drop 0.18s cubic-bezier(0.34,1.56,0.64,1) forwards; }
        /* ── Panel open: rises from bottom-right (FAB origin) ── */
        @keyframes wf-panel-open-mobile {
          0%   { opacity: 0; transform: scale(0.08) translate(44vw, 44vh); filter: blur(8px); }
          60%  { opacity: 1; filter: blur(0px); }
          100% { opacity: 1; transform: scale(1) translate(0, 0); filter: blur(0px); }
        }
        @keyframes wf-panel-close-mobile {
          0%   { opacity: 1; transform: scale(1) translate(0, 0); filter: blur(0px); }
          40%  { opacity: 0.6; filter: blur(2px); }
          100% { opacity: 0; transform: scale(0.08) translate(44vw, 44vh); filter: blur(10px); }
        }
        /* Desktop: panel anchored bottom-right, shrinks toward tab bar */
        @keyframes wf-panel-open-desk {
          0%   { opacity: 0; transform: scale(0.1); transform-origin: bottom right; filter: blur(6px); }
          65%  { opacity: 1; filter: blur(0px); }
          100% { opacity: 1; transform: scale(1); transform-origin: bottom right; filter: blur(0px); }
        }
        @keyframes wf-panel-close-desk {
          0%   { opacity: 1; transform: scale(1); transform-origin: bottom right; filter: blur(0px); }
          35%  { opacity: 0.7; filter: blur(2px); }
          100% { opacity: 0; transform: scale(0.08); transform-origin: bottom right; filter: blur(8px); }
        }
        /* Apply on mobile (< sm breakpoint = < 640px) */
        @media (max-width: 639px) {
          .wf-panel-opening { animation: wf-panel-open-mobile  0.32s cubic-bezier(0.34,1.56,0.64,1) forwards; }
          .wf-panel-closing { animation: wf-panel-close-mobile 0.30s cubic-bezier(0.4,0,1,1)         forwards; }
        }
        /* Apply on desktop (>= sm breakpoint = >= 640px) */
        @media (min-width: 640px) {
          .wf-panel-opening { animation: wf-panel-open-desk  0.32s cubic-bezier(0.34,1.56,0.64,1) forwards; }
          .wf-panel-closing { animation: wf-panel-close-desk 0.28s cubic-bezier(0.4,0,1,1)         forwards; }
        }
      `}</style>
      <style>{`
        /* ── Premium FAB animations ─────────────────────────────────────── */
        @keyframes fab-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes fab-breathe {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50%       { opacity: 0.85; transform: scale(1.12); }
        }
        @keyframes fab-icon-idle {
          0%, 100% { transform: translateY(0px) scale(1); }
          40%       { transform: translateY(-2.5px) scale(1.07); }
          70%       { transform: translateY(1px) scale(0.97); }
        }
        @keyframes fab-particle {
          0%   { transform: rotate(var(--pa)) translateX(26px) scale(1);   opacity: 0.9; }
          50%  { transform: rotate(var(--pa)) translateX(28px) scale(1.3); opacity: 1;   }
          100% { transform: rotate(var(--pa)) translateX(26px) scale(1);   opacity: 0.9; }
        }
        @keyframes fab-badge-pop {
          0%   { transform: scale(0) rotate(-15deg); opacity:0; }
          60%  { transform: scale(1.25) rotate(5deg); opacity:1; }
          100% { transform: scale(1) rotate(0deg);   opacity:1; }
        }
        @keyframes fab-ring-pulse {
          0%, 100% { opacity: 0.25; transform: scale(1); }
          50%       { opacity: 0.55; transform: scale(1.06); }
        }
        @keyframes fab-unread-ping {
          0%   { transform: scale(1);   opacity: 0.7; }
          70%  { transform: scale(2.4); opacity: 0;   }
          100% { transform: scale(2.4); opacity: 0;   }
        }
        .fab-spin     { animation: fab-spin 5s linear infinite; }
        .fab-breathe  { animation: fab-breathe 3s ease-in-out infinite; }
        .fab-icon-idle{ animation: fab-icon-idle 3.2s ease-in-out infinite; }
        .fab-ring     { animation: fab-ring-pulse 2.6s ease-in-out infinite; }
        .fab-unread-ping { animation: fab-unread-ping 1.4s ease-out infinite; }
        .fab-badge-pop{ animation: fab-badge-pop 0.4s cubic-bezier(.34,1.56,.64,1) forwards; }
        .fab-p1 { --pa: 0deg;   animation: fab-particle 2.6s ease-in-out infinite 0s; }
        .fab-p2 { --pa: 120deg; animation: fab-particle 2.6s ease-in-out infinite 0.87s; }
        .fab-p3 { --pa: 240deg; animation: fab-particle 2.6s ease-in-out infinite 1.73s; }
        .fab-drag .fab-spin,
        .fab-drag .fab-breathe,
        .fab-drag .fab-icon-idle,
        .fab-drag .fab-ring,
        .fab-drag .fab-p1,
        .fab-drag .fab-p2,
        .fab-drag .fab-p3 { animation-play-state: paused; }
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
      {(open || closing) && (
        <div
          className={`flex fixed inset-0 sm:static sm:inset-auto sm:w-[540px] sm:h-[min(600px,calc(100dvh-52px))] sm:rounded-t-2xl overflow-hidden${closing ? " wf-panel-closing" : " wf-panel-opening"}`}
          style={{ boxShadow: sidebarView === "dev" ? "0 -4px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(16,185,129,0.2)" : "0 -4px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.18)", background: sidebarView === "dev" ? "#060d09" : "#09090b" }}
        >
          {/* ────────── LEFT SIDEBAR ────────── */}
          <div className="hidden sm:flex w-14 flex-col items-center py-3 gap-1.5 border-r border-gray-800/60 shrink-0" style={{ background: sidebarView === "dev" ? "#08110a" : "#0c0c0f" }}>
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
              <SidebarBtn view="settings" icon={<Settings  size={17} />} title="Settings" />
            </>)}
            {/* Dev utility buttons — shown only in dev mode (emerald, controls devSubView) */}
            {sidebarView === "dev" && (<>
              <DevSidebarBtn view="mentions" icon={<AtSign    size={17} />} title="Dev Mentions" badge={devMentionMessages.length || undefined} />
              <DevSidebarBtn view="pinned"   icon={<Pin       size={17} />} title="Dev Pinned"   badge={devPinnedMessages.length || undefined} />
              <DevSidebarBtn view="images"   icon={<ImageIcon size={17} />} title="Dev Images"   badge={devImageMessages.length || undefined} />
              <DevSidebarBtn view="links"    icon={<Link2     size={17} />} title="Dev Links"    badge={devLinkMessages.length || undefined} />
              <DevSidebarBtn view="settings" icon={<Settings  size={17} />} title="Settings" />
            </>)}
          </div>

          {/* ────────── MAIN CONTENT ────────── */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden sm:m-0 m-3 rounded-2xl">

            {/* ── Mobile top nav bar ─────────────────────────────────────────── */}
            <div
              className="sm:hidden shrink-0 border-b border-gray-800/60"
              style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", background: "#0c0c0f", padding: "6px 4px" }}
            >
              {/* LEFT col: Mode switcher dropdown */}
              <div className="relative">
                <button
                  onClick={() => setModeDropdownOpen(o => !o)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    sidebarView === "dev"
                      ? "bg-emerald-600/30 text-emerald-300"
                      : "bg-indigo-600/30 text-indigo-300"
                  }`}
                >
                  {sidebarView === "dev" ? <Code2 size={15} /> : <MessageSquare size={15} />}
                  <span>{sidebarView === "dev" ? "Dev" : "Team"}</span>
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none"
                    className={`transition-transform duration-200 ${modeDropdownOpen ? "rotate-180" : ""}`}>
                    <path d="M2 4.5L7 9.5L12 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {modeDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setModeDropdownOpen(false)} />
                    <div
                      className="absolute left-0 top-full mt-1.5 z-50 overflow-hidden rounded-2xl min-w-[140px]"
                      style={{
                        background: "linear-gradient(145deg, #141420 0%, #1a1a2e 100%)",
                        border: "1px solid rgba(99,102,241,0.25)",
                        boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
                      }}
                    >
                      <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-wider px-3 pt-2.5 pb-1.5">
                        Chat Mode
                      </p>
                      <button
                        onClick={() => { setSidebarView("chat"); setModeDropdownOpen(false); setChannelDropdownOpen(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 transition-all text-left ${
                          sidebarView !== "dev"
                            ? "bg-indigo-600/20 border-l-2 border-indigo-500 text-indigo-300"
                            : "border-l-2 border-transparent text-gray-300 hover:bg-gray-800/60"
                        }`}
                      >
                        <MessageSquare size={15} />
                        <div>
                          <p className="text-sm font-semibold leading-tight">Team</p>
                          <p className="text-[10px] text-gray-500 leading-tight">Team channels</p>
                        </div>
                        {sidebarView !== "dev" && (
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="ml-auto text-indigo-400">
                            <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => { setSidebarView("dev"); setModeDropdownOpen(false); setDevChannelDropdownOpen(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 transition-all text-left ${
                          sidebarView === "dev"
                            ? "bg-emerald-600/20 border-l-2 border-emerald-500 text-emerald-300"
                            : "border-l-2 border-transparent text-gray-300 hover:bg-gray-800/60"
                        }`}
                      >
                        <Code2 size={15} />
                        <div>
                          <p className="text-sm font-semibold leading-tight">Dev</p>
                          <p className="text-[10px] text-gray-500 leading-tight">Dev channels</p>
                        </div>
                        {sidebarView === "dev" && (
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="ml-auto text-emerald-400">
                            <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                      <div className="h-1.5" />
                    </div>
                  </>
                )}
              </div>

              {/* CENTER col: Search — true mathematical center, never overlaps sides */}
              {mobileSearchOpen ? (
                <div className="flex items-center gap-1.5 w-36 bg-gray-800/70 border border-indigo-500/60 rounded-2xl px-3 py-2.5 transition-colors">
                  <Search size={14} className="text-indigo-400 shrink-0" />
                  <input
                    ref={searchInputRef}
                    autoFocus
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search…"
                    className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none min-w-0 w-0"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} className="text-gray-600 hover:text-gray-300 transition-colors shrink-0">
                      <X size={13} />
                    </button>
                  )}
                  <button
                    onClick={() => { setMobileSearchOpen(false); setSidebarView("chat"); setSearchQuery(""); }}
                    className="text-gray-600 hover:text-red-400 transition-colors shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setMobileSearchOpen(true); setSidebarView("search"); }}
                  className="w-36 flex items-center gap-1.5 px-3 py-2.5 rounded-2xl text-sm font-medium text-gray-400 hover:text-gray-200 bg-gray-800/50 hover:bg-gray-800/80 border border-gray-700/50 hover:border-gray-600/60 transition-all"
                >
                  <Search size={14} />
                  <span>Search…</span>
                </button>
              )}

              {/* RIGHT col: Minimize + Close — pushed to the right with justify-self */}
              <div className="flex items-center gap-0.5 justify-self-end mr-1">
                <button onClick={closeWidget} title="Minimize" className="p-3 rounded-lg text-gray-600 hover:text-gray-200 hover:bg-gray-800/60 transition-all">
                  <svg width="16" height="16" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <line x1="2" y1="11" x2="12" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
                <button onClick={closeWidget} title="Close" className="p-3 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-900/20 transition-all">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* ══════════ DEV CHAT VIEW (full clone, emerald accents) ══════════ */}
            {sidebarView === "dev" && (
              <>
                {/* ── Dev Chat sub-view ── */}
                {devSubView === "chat" && (
                  <>
                    {/* ── Dev Chat Header — tap channel name to switch ── */}
                    <div className="relative shrink-0">
                      <div className="flex items-center gap-1 px-4 py-3 border-b border-gray-800/60">
                        {/* LEFT: tappable channel name + chevron */}
                        <button
                          onClick={() => setDevChannelDropdownOpen(o => !o)}
                          className="flex items-center gap-2.5 min-w-0 text-left group"
                        >
                          <span className="text-lg leading-none shrink-0">{devActiveCh.emoji}</span>
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-white leading-tight flex items-center gap-1.5">
                              {devActiveCh.name}
                              <svg
                                width="14" height="14" viewBox="0 0 14 14" fill="none"
                                className={`text-emerald-400 shrink-0 transition-transform duration-200 ${devChannelDropdownOpen ? "rotate-180" : ""}`}
                              >
                                <path d="M2 4.5L7 9.5L12 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </h3>
                            <p className="text-[10px] text-gray-500 leading-tight truncate">{devActiveCh.desc}</p>
                          </div>
                        </button>

                        {/* Spacer */}
                        <div className="flex-1" />

                        {/* RIGHT: ⋮ mobile only */}
                        <div className="relative sm:hidden shrink-0">
                          <button
                            onClick={() => setDevMobileMenuOpen(o => !o)}
                            className={`p-1.5 rounded-lg transition-colors ${devMobileMenuOpen ? "text-emerald-400 bg-emerald-900/30" : "text-gray-500 hover:text-gray-200 hover:bg-gray-800/60"}`}
                          >
                            <MoreVertical size={16} />
                          </button>
                          {devMobileMenuOpen && (
                            <div
                              className="wf-menu-drop absolute right-0 top-full mt-1.5 z-50 flex flex-col gap-0.5 p-1.5 rounded-2xl"
                              style={{
                                background: "linear-gradient(145deg, #0d1f18 0%, #0f2318 100%)",
                                border: "1px solid rgba(16,185,129,0.2)",
                                boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(16,185,129,0.1)",
                                minWidth: "44px",
                              }}
                            >
                              {[
                                { view: "mentions" as SidebarView, icon: <AtSign size={15} />,    badge: devMentionMessages.length, label: "Mentions" },
                                { view: "pinned"   as SidebarView, icon: <Pin size={15} />,       badge: devPinnedMessages.length,  label: "Pinned" },
                                { view: "images"   as SidebarView, icon: <ImageIcon size={15} />, badge: devImageMessages.length,   label: "Images" },
                                { view: "links"    as SidebarView, icon: <Link2 size={15} />,     badge: devLinkMessages.length,    label: "Links" },
                                { view: "settings" as SidebarView, icon: <Settings size={15} />,  badge: 0,                         label: "Settings" },
                              ].map(({ view, icon, badge, label }) => (
                                <button
                                  key={view}
                                  title={label}
                                  onClick={() => { setDevSubView(view); setDevMobileMenuOpen(false); }}
                                  className={`relative flex items-center justify-center w-9 h-9 rounded-xl transition-all ${
                                    devSubView === view
                                      ? "bg-emerald-600/30 text-emerald-300 ring-1 ring-emerald-500/40"
                                      : "text-gray-500 hover:text-gray-200 hover:bg-gray-800/60"
                                  }`}
                                >
                                  {icon}
                                  {badge > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 flex items-center justify-center rounded-full bg-emerald-500 text-white text-[8px] font-bold px-0.5">
                                      {badge}
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ── Dev Channel Dropdown ── */}
                      {devChannelDropdownOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={() => setDevChannelDropdownOpen(false)}
                          />
                          <div
                            className="absolute left-0 right-0 top-full z-50 mx-2 mt-1 overflow-hidden rounded-2xl"
                            style={{
                              background: "linear-gradient(145deg, #0d1f18 0%, #0f2318 100%)",
                              border: "1px solid rgba(16,185,129,0.25)",
                              boxShadow: "0 12px 40px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(16,185,129,0.1)",
                            }}
                          >
                            <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-wider px-4 pt-3 pb-2">
                              Switch Channel
                            </p>
                            {DEV_CHANNELS.map(ch => {
                              const isActive = devActiveChannel === ch.id;
                              return (
                                <button
                                  key={ch.id}
                                  onClick={() => { switchDevChannel(ch.id); setDevChannelDropdownOpen(false); }}
                                  className={`w-full flex items-center gap-3 px-4 py-3 transition-all text-left ${
                                    isActive
                                      ? "bg-emerald-600/20 border-l-2 border-emerald-500"
                                      : "hover:bg-gray-800/60 border-l-2 border-transparent"
                                  }`}
                                >
                                  <span className="text-xl leading-none shrink-0 relative">
                                    {ch.emoji}
                                    {devUnreadDots.has(ch.id) && !isActive && (
                                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-1 ring-gray-900" />
                                    )}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-semibold leading-tight ${isActive ? "text-emerald-300" : "text-gray-200"}`}>
                                      {ch.name}
                                    </p>
                                    <p className="text-[11px] text-gray-500 leading-tight truncate mt-0.5">{ch.desc}</p>
                                  </div>
                                  {isActive && (
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-emerald-400 shrink-0">
                                      <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                  )}
                                </button>
                              );
                            })}
                            <div className="h-2" />
                          </div>
                        </>
                      )}
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto py-2" style={{ overscrollBehavior: "contain", ...bgPatternStyle }}
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
                                  className={`group relative flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all cursor-default select-none ${isGrouped ? "mt-0.5" : "mt-4"} ${devHighlightedMsgId === msg.id ? "msg-found-dev" : ""} ${longPressTarget?.msg.id === msg.id ? "bg-gray-700/40 scale-[0.98]" : ""} ${msg.pinned ? "bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/8" : bubbleStyle !== "minimal" ? "hover:bg-gray-800/30" : ""}`}
                                >
                                  {msg.pinned && <span className="absolute top-1.5 right-8 text-[9px] text-emerald-400/60 select-none pointer-events-none">📌</span>}
                                  <div className="w-10 shrink-0">
                                    {!isGrouped ? (
                                      msg.userPhoto
                                        ? <img src={msg.userPhoto} alt={msg.userName} className={`w-10 h-10 ${avatarCls} object-cover ring-1 ring-gray-700/60`} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                        : <div className={`w-10 h-10 ${avatarCls} bg-emerald-900/50 border border-emerald-800/40 flex items-center justify-center text-emerald-300 text-sm font-bold`}>{msg.userName?.[0]?.toUpperCase() ?? "?"}</div>
                                    ) : (
                                      <span className="text-[9px] text-transparent group-hover:text-gray-700 transition-colors block text-right pt-1.5 leading-none select-none">
                                        {new Date(msg.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                      </span>
                                    )}
                                  </div>
                                  <div className={`flex-1 min-w-0 ${devBubbleCls(isMine)}`}>
                                    {!isGrouped && (
                                      <div className="flex items-baseline gap-2 mb-0.5">
                                        <span className={`text-sm font-semibold leading-tight ${isMine ? "text-emerald-300" : "text-gray-100"}`}>
                                          {msg.userName}
                                          {isMine && <span className="ml-1.5 text-[10px] text-emerald-500/70 font-normal">you</span>}
                                        </span>
                                        {fmtTime(msg.createdAt) !== null && <span className="text-xs text-gray-600 leading-tight">{fmtTime(msg.createdAt)}</span>}
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
                      <div className="flex items-center gap-2 bg-gray-800/50 border border-gray-700/40 rounded-2xl px-3 py-2.5 focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/10 transition-all">
                        {userPhoto ? <img src={userPhoto} alt={userName} className="w-8 h-8 rounded-full object-cover shrink-0" />
                          : <div className="w-8 h-8 rounded-full bg-emerald-900/50 flex items-center justify-center text-emerald-300 text-xs font-bold shrink-0">{userName?.[0]?.toUpperCase() ?? "?"}</div>}
                        <button onMouseDown={e => e.stopPropagation()} onClick={() => devFileInputRef.current?.click()}
                          className="p-2.5 rounded-xl text-gray-600 hover:text-emerald-400 hover:bg-emerald-900/20 transition-all shrink-0" title="Attach image">
                          <Paperclip size={17} />
                        </button>
                        <input ref={devFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleDevFileAttach} />
                        <textarea ref={devInputRef} value={devInput} onChange={handleDevInputChange} onKeyDown={handleDevKeyDown} onPaste={handleDevPaste}
                          onClick={() => setDevEmojiPickerOpen(false)} placeholder={devActiveCh.placeholder} rows={1}
                          onFocus={() => setDevInputFocused(true)}
                          onBlur={() => setDevInputFocused(false)}
                          disabled={!userId || sending}
                          className={`flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-600 resize-none outline-none py-1.5 max-h-[120px] transition-[height] duration-200 ease-in-out disabled:opacity-40 leading-relaxed ${devInputFocused ? "overflow-y-auto" : "overflow-hidden"}`} />
                        <div className="relative shrink-0 mb-0.5">
                          <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); setDevEmojiPickerOpen(p => !p); }}
                            className={`p-2.5 rounded-xl transition-all ${devEmojiPickerOpen ? "text-yellow-400 bg-yellow-900/20" : "text-gray-600 hover:text-yellow-400 hover:bg-yellow-900/10"}`}
                            title="Insert emoji"><Smile size={18} /></button>
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
                          className="w-10 h-10 flex items-center justify-center rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0 hover:scale-105 active:scale-95">
                          <Send size={16} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between mt-1.5 px-1">
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
                      <BackBtn onBack={() => setDevSubView("chat")} />
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
                      <BackBtn onBack={() => setDevSubView("chat")} />
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
                      <BackBtn onBack={() => setDevSubView("chat")} />
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
                      <BackBtn onBack={() => setDevSubView("chat")} />
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
                      <BackBtn onBack={() => setDevSubView("chat")} />
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
                      <BackBtn onBack={() => setDevSubView("chat")} />
                    </div>
                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
                      {/* Name color */}
                      <div>
                        <p className="text-[10px] text-gray-500 mb-2.5 font-bold uppercase tracking-wider flex items-center gap-1.5"><span>🎨</span> Name Color</p>
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
                      {/* Bubble style */}
                      <div className="border-t border-gray-800/60 pt-4">
                        <p className="text-[10px] text-gray-500 mb-2.5 font-bold uppercase tracking-wider flex items-center gap-1.5"><span>💬</span> Bubble Style</p>
                        <div className="grid grid-cols-3 gap-2">
                          {([{id:"flat",label:"Flat",desc:"Slack-style"},{id:"bubble",label:"Bubble",desc:"iMessage"},{id:"minimal",label:"Minimal",desc:"Ultra clean"}] as const).map(opt => (
                            <button key={opt.id} onClick={() => { setBubbleStyle(opt.id); try { localStorage.setItem(`wf_${widgetId}_bubble`, opt.id); } catch {} }}
                              className={`flex flex-col items-start px-3 py-2.5 rounded-xl border transition-all ${bubbleStyle === opt.id ? "border-emerald-500/60 bg-emerald-900/20 text-emerald-300" : "border-gray-700/60 bg-gray-800/40 text-gray-400 hover:bg-gray-800/70"}`}>
                              <span className="text-[11px] font-semibold">{opt.label}</span>
                              <span className="text-[9px] text-gray-600">{opt.desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Background pattern */}
                      <div className="border-t border-gray-800/60 pt-4">
                        <p className="text-[10px] text-gray-500 mb-2.5 font-bold uppercase tracking-wider flex items-center gap-1.5"><span>🌐</span> Background</p>
                        <div className="grid grid-cols-3 gap-2">
                          {([{id:"none",label:"None",bg:""},{id:"dots",label:"Dots",bg:"radial-gradient(circle,rgba(255,255,255,0.15) 1px,transparent 1px)"},{id:"grid",label:"Grid",bg:"linear-gradient(rgba(255,255,255,0.1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.1) 1px,transparent 1px)"}] as const).map(opt => (
                            <button key={opt.id} onClick={() => { setBgPattern(opt.id); try { localStorage.setItem(`wf_${widgetId}_pattern`, opt.id); } catch {} }}
                              className={`flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-xl border transition-all ${bgPattern === opt.id ? "border-emerald-500/60 bg-emerald-900/20" : "border-gray-700/60 bg-gray-800/40 hover:bg-gray-800/70"}`}>
                              <div className="w-full h-6 rounded-lg bg-gray-900" style={opt.bg ? {backgroundImage:opt.bg,backgroundSize:opt.id==="grid"?"14px 14px":"8px 8px"} : {}} />
                              <span className={`text-[10px] font-medium ${bgPattern === opt.id ? "text-emerald-300" : "text-gray-400"}`}>{opt.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Avatar shape */}
                      <div className="border-t border-gray-800/60 pt-4">
                        <p className="text-[10px] text-gray-500 mb-2.5 font-bold uppercase tracking-wider flex items-center gap-1.5"><span>👤</span> Avatar Shape</p>
                        <div className="grid grid-cols-2 gap-2">
                          {([{id:"circle",label:"Circle",cls:"rounded-full"},{id:"squircle",label:"Squircle",cls:"rounded-[35%]"}] as const).map(opt => (
                            <button key={opt.id} onClick={() => { setAvatarShape(opt.id); try { localStorage.setItem(`wf_${widgetId}_avatar`, opt.id); } catch {} }}
                              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all ${avatarShape === opt.id ? "border-emerald-500/60 bg-emerald-900/20 text-emerald-300" : "border-gray-700/60 bg-gray-800/40 text-gray-400 hover:bg-gray-800/70"}`}>
                              <div className={`w-8 h-8 shrink-0 bg-emerald-800/60 flex items-center justify-center text-emerald-300 text-xs font-bold ${opt.cls}`}>J</div>
                              <span className="text-[11px] font-semibold">{opt.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Timestamp style */}
                      <div className="border-t border-gray-800/60 pt-4">
                        <p className="text-[10px] text-gray-500 mb-2.5 font-bold uppercase tracking-wider flex items-center gap-1.5"><span>🕐</span> Timestamps</p>
                        <div className="grid grid-cols-3 gap-2">
                          {([{id:"relative",label:"Relative",ex:"5m ago"},{id:"absolute",label:"Absolute",ex:"2:30 PM"},{id:"hidden",label:"Hidden",ex:"—"}] as const).map(opt => (
                            <button key={opt.id} onClick={() => { setTimestampStyle(opt.id); try { localStorage.setItem(`wf_${widgetId}_timestamp`, opt.id); } catch {} }}
                              className={`flex flex-col items-start px-3 py-2.5 rounded-xl border transition-all ${timestampStyle === opt.id ? "border-emerald-500/60 bg-emerald-900/20 text-emerald-300" : "border-gray-700/60 bg-gray-800/40 text-gray-400 hover:bg-gray-800/70"}`}>
                              <span className="text-[11px] font-semibold">{opt.label}</span>
                              <span className="text-[10px] text-gray-600">{opt.ex}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Notifications */}
                      <div className="border-t border-gray-800/60 pt-4 pb-4">
                        <p className="text-[10px] text-gray-500 mb-2.5 font-bold uppercase tracking-wider flex items-center gap-1.5"><span>🔔</span> Notifications</p>
                        <div className="space-y-2">
                          <button onClick={() => { const n = !soundEnabled; setSoundEnabled(n); try { localStorage.setItem(`wf_${widgetId}_sound`, String(n)); } catch {} }}
                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${soundEnabled ? "border-emerald-500/60 bg-emerald-900/20" : "border-gray-700/60 bg-gray-800/40"}`}>
                            <div className="flex items-center gap-2">
                              <span className="text-base">🔊</span>
                              <div className="text-left"><p className="text-[11px] font-semibold text-gray-200">Mention Sound</p><p className="text-[9px] text-gray-600">Chime when @mentioned or @everyone</p></div>
                            </div>
                            <div className={`w-9 h-5 rounded-full transition-colors relative ${soundEnabled ? "bg-emerald-500" : "bg-gray-700"}`}>
                              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${soundEnabled ? "left-4" : "left-0.5"}`} />
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {/* member name color driven by theme */}
            {sidebarView === "chat" && (
              <>
              {/* ── Team Chat Header — tap channel name to switch ── */}
              <div className="relative shrink-0">
                <div className="flex items-center gap-1 px-4 py-3 border-b border-gray-800/60">

                  {/* LEFT: tappable channel name + chevron */}
                  <button
                    onClick={() => setChannelDropdownOpen(o => !o)}
                    className="flex items-center gap-2.5 min-w-0 text-left group"
                  >
                    <span className="text-lg leading-none shrink-0">{activeCh.emoji}</span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-white leading-tight flex items-center gap-1.5">
                        {activeCh.name}
                        <svg
                          width="14" height="14" viewBox="0 0 14 14" fill="none"
                          className={`text-indigo-400 shrink-0 transition-transform duration-200 ${channelDropdownOpen ? "rotate-180" : ""}`}
                        >
                          <path d="M2 4.5L7 9.5L12 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </h3>
                      <p className="text-[10px] text-gray-500 leading-tight truncate">{activeCh.desc}</p>
                    </div>
                  </button>



                  {/* Spacer pushes ⋮ to far right */}
                  <div className="flex-1" />

                  {/* RIGHT: ⋮ mobile only */}
                  <div className="relative sm:hidden shrink-0">
                    <button
                      onClick={() => setMobileMenuOpen(o => !o)}
                      className={`p-1.5 rounded-lg transition-colors ${mobileMenuOpen ? "text-indigo-400 bg-indigo-900/30" : "text-gray-500 hover:text-gray-200 hover:bg-gray-800/60"}`}
                    >
                      <MoreVertical size={16} />
                    </button>
                    {mobileMenuOpen && (
                      <div
                        className="wf-menu-drop absolute right-0 top-full mt-1.5 z-50 flex flex-col gap-0.5 p-1.5 rounded-2xl"
                        style={{
                          background: "linear-gradient(145deg, #141420 0%, #1a1a2e 100%)",
                          border: "1px solid rgba(99,102,241,0.2)",
                          boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(99,102,241,0.1)",
                          minWidth: "44px",
                        }}
                      >
                        {[
                          { view: "mentions" as SidebarView, icon: <AtSign size={15} />, badge: mentionMessages.length, label: "Mentions" },
                          { view: "pinned"   as SidebarView, icon: <Pin size={15} />,    badge: pinnedMessages.length,  label: "Pinned" },
                          { view: "images"   as SidebarView, icon: <ImageIcon size={15} />, badge: imageMessages.length, label: "Images" },
                          { view: "links"    as SidebarView, icon: <Link2 size={15} />,  badge: linkMessages.length,   label: "Links" },
                          { view: "settings" as SidebarView, icon: <Settings size={15} />, badge: 0,                    label: "Settings" },
                        ].map(({ view, icon, badge, label }) => (
                          <button
                            key={view}
                            title={label}
                            onClick={() => { setSidebarView(view); setMobileMenuOpen(false); }}
                            className={`relative flex items-center justify-center w-9 h-9 rounded-xl transition-all ${
                              sidebarView === view
                                ? "bg-indigo-600/30 text-indigo-300 ring-1 ring-indigo-500/40"
                                : "text-gray-500 hover:text-gray-200 hover:bg-gray-800/60"
                            }`}
                          >
                            {icon}
                            {badge > 0 && (
                              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 flex items-center justify-center rounded-full bg-indigo-500 text-white text-[8px] font-bold px-0.5">
                                {badge}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Channel Dropdown ── */}
                {channelDropdownOpen && (
                  <>
                    {/* Backdrop */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setChannelDropdownOpen(false)}
                    />
                    {/* Dropdown panel */}
                    <div
                      className="absolute left-0 right-0 top-full z-50 mx-2 mt-1 overflow-hidden rounded-2xl"
                      style={{
                        background: "linear-gradient(145deg, #141420 0%, #1a1a2e 100%)",
                        border: "1px solid rgba(99,102,241,0.25)",
                        boxShadow: "0 12px 40px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(99,102,241,0.1)",
                      }}
                    >
                      <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-wider px-4 pt-3 pb-2">
                        Switch Channel
                      </p>
                      {CH.map(ch => {
                        const isActive = activeChannel === ch.id;
                        const hasDot = unreadDots.has(ch.id);
                        return (
                          <button
                            key={ch.id}
                            onClick={() => { switchChannel(ch.id); setChannelDropdownOpen(false); }}
                            className={`w-full flex items-center gap-3 px-4 py-3 transition-all text-left ${
                              isActive
                                ? "bg-indigo-600/20 border-l-2 border-indigo-500"
                                : "hover:bg-gray-800/60 border-l-2 border-transparent"
                            }`}
                          >
                            <span className="text-xl leading-none shrink-0">{ch.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold leading-tight ${isActive ? "text-indigo-300" : "text-gray-200"}`}>
                                {ch.name}
                              </p>
                              <p className="text-[11px] text-gray-500 leading-tight truncate mt-0.5">{ch.desc}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {hasDot && !isActive && (
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                              )}
                              {isActive && (
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-indigo-400">
                                  <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </div>
                          </button>
                        );
                      })}
                      <div className="h-2" />
                    </div>
                  </>
                )}
              </div>

                {/* Messages */}
                <div
                  className="flex-1 overflow-y-auto py-2"
                  style={{ overscrollBehavior: "contain", ...bgPatternStyle }}
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
                              className={`group relative flex items-start gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-default select-none ${isGrouped ? "mt-0.5" : "mt-4"} ${highlightedMsgId === msg.id ? "msg-found" : ""} ${longPressTarget?.msg.id === msg.id ? "bg-gray-700/40 scale-[0.98]" : ""} ${msg.pinned ? "bg-pink-500/5 border border-pink-500/10 hover:bg-pink-500/8" : bubbleStyle !== "minimal" ? "hover:bg-gray-800/30" : ""}`}>
                              {msg.pinned && (
                                <span className="absolute top-1.5 right-8 text-[9px] text-pink-400/60 select-none pointer-events-none">📌</span>
                              )}
                              {/* Avatar col */}
                              <div className="w-10 shrink-0">
                                {!isGrouped ? (
                                  msg.userPhoto
                                    ? <img src={msg.userPhoto} alt={msg.userName} className={`w-10 h-10 ${avatarCls} object-cover ring-1 ring-gray-700/60`} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                    : <div className={`w-10 h-10 ${avatarCls} bg-indigo-900/50 border border-indigo-800/40 flex items-center justify-center text-indigo-300 text-sm font-bold`}>{msg.userName?.[0]?.toUpperCase() ?? "?"}</div>
                                ) : (
                                  <span className="text-[9px] text-transparent group-hover:text-gray-700 transition-colors block text-right pt-1.5 leading-none select-none">
                                    {new Date(msg.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                  </span>
                                )}
                              </div>

                              {/* Body */}
                              <div className={`flex-1 min-w-0 ${msgBubbleCls(isMine)}`}>
                                {!isGrouped && (
                                  <div className="flex items-baseline gap-2 mb-0.5">
                                    <span className={`text-sm font-semibold leading-tight ${isMine ? theme.nameClass : "text-gray-100"}`}>
                                      {msg.userName}
                                      {isMine && <span className="ml-1.5 text-[10px] text-indigo-500/70 font-normal">you</span>}
                                    </span>
                                    {fmtTime(msg.createdAt) !== null && <span className="text-xs text-gray-600 leading-tight">{fmtTime(msg.createdAt)}</span>}
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
                  <div className="flex items-center gap-2 bg-gray-800/50 border border-gray-700/40 rounded-2xl px-3 py-2.5 focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/10 transition-all">

                    {/* Left: user avatar */}
                    {userPhoto
                      ? <img src={userPhoto} alt={userName} className="w-8 h-8 rounded-full object-cover shrink-0" />
                      : <div className="w-8 h-8 rounded-full bg-indigo-900/50 flex items-center justify-center text-indigo-300 text-xs font-bold shrink-0">{userName?.[0]?.toUpperCase() ?? "?"}</div>
                    }

                    {/* Attachment button */}
                    <button
                      onMouseDown={e => e.stopPropagation()}
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2.5 rounded-xl text-gray-600 hover:text-indigo-400 hover:bg-indigo-900/20 transition-all shrink-0"
                      title="Attach image"
                    ><Paperclip size={17} /></button>
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
                      onFocus={() => setInputFocused(true)}
                      onBlur={() => setInputFocused(false)}
                      className={`flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-600 resize-none outline-none py-1.5 max-h-[120px] transition-[height] duration-200 ease-in-out disabled:opacity-40 leading-relaxed ${inputFocused ? "overflow-y-auto" : "overflow-hidden"}`}
                    />

                    {/* Emoji picker trigger */}
                    <div className="relative shrink-0 mb-0.5">
                      <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); setEmojiPickerOpen(p => !p); }}
                        className={`p-2.5 rounded-lg transition-all ${
                          emojiPickerOpen ? "text-yellow-400 bg-yellow-900/20" : "text-gray-600 hover:text-yellow-400 hover:bg-yellow-900/10"
                        }`}
                        title="Insert emoji"
                      ><Smile size={18} /></button>

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
                      className="w-10 h-10 flex items-center justify-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0 hover:scale-105 active:scale-95"
                    ><Send size={16} /></button>
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
              <div className="flex items-center px-3 py-2.5 border-b border-gray-800/60 shrink-0">
                  <BackBtn />
                  <AtSign size={14} className="text-indigo-400 shrink-0" />
                  <h3 className="text-sm font-bold text-white ml-1.5">Mentions</h3>
                  {mentionMessages.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-600/20 text-indigo-400 font-semibold ml-1.5">{mentionMessages.length}</span>
                  )}
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-gray-800 text-gray-500 ml-2">{activeCh.emoji} {activeCh.name}</span>
                  <div className="flex-1" />

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
                          onClick={() => { setHighlightedMsgId(msg.id); setSidebarView("chat"); setMobileSearchOpen(false); setSearchQuery(""); }}
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
                {/* Header — search input lives in the top-nav bar on mobile */}
                <div className="flex items-center px-3 py-2.5 border-b border-gray-800/60 shrink-0">
                  <BackBtn onBack={() => { setMobileSearchOpen(false); setSidebarView("chat"); setSearchQuery(""); }} />
                  <Search size={14} className="text-indigo-400 shrink-0" />
                  <h3 className="text-sm font-bold text-white ml-1.5">Search</h3>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-gray-800 text-gray-500 ml-2">{activeCh.emoji} {activeCh.name}</span>
                  {searchQuery && (
                    <span className="text-[10px] text-gray-600 ml-2">
                      {searchResults.length === 0 ? "No results" : `${searchResults.length} result${searchResults.length !== 1 ? "s" : ""}`}
                    </span>
                  )}
                  <div className="flex-1" />

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
                            onClick={() => { setHighlightedMsgId(msg.id); setSidebarView("chat"); setMobileSearchOpen(false); setSearchQuery(""); }}
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
                <div className="flex items-center px-3 py-2.5 border-b border-gray-800/60 shrink-0">
                  <BackBtn />
                  <Pin size={14} className="text-amber-400 shrink-0" />
                  <h3 className="text-sm font-bold text-white ml-1.5">Pinned Messages</h3>
                  {pinnedMessages.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-600/20 text-amber-400 font-semibold ml-1.5">{pinnedMessages.length}</span>
                  )}
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-gray-800 text-gray-500 ml-2">{activeCh.emoji} {activeCh.name}</span>
                  <div className="flex-1" />

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
                          onClick={() => { setHighlightedMsgId(msg.id); setSidebarView("chat"); setMobileSearchOpen(false); setSearchQuery(""); }}
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
                <div className="flex items-center px-3 py-2.5 border-b border-gray-800/60 shrink-0">
                  <BackBtn />
                  <ImageIcon size={14} className="text-sky-400 shrink-0" />
                  <h3 className="text-sm font-bold text-white ml-1.5">Images</h3>
                  {imageMessages.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-600/20 text-sky-400 font-semibold ml-1.5">{imageMessages.length}</span>
                  )}
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-gray-800 text-gray-500 ml-2">{activeCh.emoji} {activeCh.name}</span>
                  <div className="flex-1" />

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
                          onClick={() => { setHighlightedMsgId(msg.id); setSidebarView("chat"); setMobileSearchOpen(false); setSearchQuery(""); }}
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
                <div className="flex items-center px-3 py-2.5 border-b border-gray-800/60 shrink-0">
                  <BackBtn />
                  <Link2 size={14} className="text-emerald-400 shrink-0" />
                  <h3 className="text-sm font-bold text-white ml-1.5">Links</h3>
                  {linkMessages.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-600/20 text-emerald-400 font-semibold ml-1.5">{linkMessages.length}</span>
                  )}
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-gray-800 text-gray-500 ml-2">{activeCh.emoji} {activeCh.name}</span>
                  <div className="flex-1" />

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
                              onClick={() => { setHighlightedMsgId(msg.id); setSidebarView("chat"); setMobileSearchOpen(false); setSearchQuery(""); }}
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
                <div className="flex items-center px-3 py-2.5 border-b border-gray-800/60 shrink-0">
                  <BackBtn />
                  <Settings size={14} className="text-indigo-400 shrink-0" />
                  <h3 className="text-sm font-bold text-white ml-1.5">Settings</h3>
                  <div className="flex-1" />

                </div>
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

                  {/* Name color */}
                  <div>
                    <p className="text-[10px] text-gray-500 mb-2.5 font-bold uppercase tracking-wider flex items-center gap-1.5"><span>🎨</span> Name Color</p>
                    <div className="grid grid-cols-3 gap-2">
                      {THEMES.map(t => (
                        <button key={t.id} onClick={() => { setChatTheme(t.id); try { localStorage.setItem(`wf_${widgetId}_theme`, t.id); } catch {} }}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all ${
                            chatTheme === t.id ? "border-white/30 bg-white/10 scale-105" : "border-gray-700/60 bg-gray-800/40 hover:bg-gray-800/70"
                          }`}>
                          <div className={`w-3.5 h-3.5 rounded-full ${t.dotClass} shrink-0 ${chatTheme === t.id ? "ring-2 ring-white/40" : ""}`} />
                          <span className={`text-[11px] font-medium ${chatTheme === t.id ? "text-white" : "text-gray-400"}`}>{t.label}</span>
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 p-2.5 bg-gray-900/60 border border-gray-800/60 rounded-xl flex items-center gap-2">
                      <div className={`w-7 h-7 shrink-0 bg-indigo-900/60 flex items-center justify-center text-[10px] text-indigo-300 font-bold ${avatarCls}`}>J</div>
                      <div><span className={`text-xs font-semibold ${theme.nameClass}`}>Your Name</span><span className="ml-1.5 text-[9px] text-indigo-500/70">you</span><p className="text-xs text-gray-300">Sample message</p></div>
                    </div>
                  </div>

                  {/* Bubble style */}
                  <div className="border-t border-gray-800/60 pt-4">
                    <p className="text-[10px] text-gray-500 mb-2.5 font-bold uppercase tracking-wider flex items-center gap-1.5"><span>💬</span> Bubble Style</p>
                    <div className="grid grid-cols-3 gap-2">
                      {([{id:"flat",label:"Flat",desc:"Slack-style"},{id:"bubble",label:"Bubble",desc:"iMessage"},{id:"minimal",label:"Minimal",desc:"Ultra clean"}] as const).map(opt => (
                        <button key={opt.id} onClick={() => { setBubbleStyle(opt.id); try { localStorage.setItem(`wf_${widgetId}_bubble`, opt.id); } catch {} }}
                          className={`flex flex-col items-start px-3 py-2.5 rounded-xl border transition-all ${bubbleStyle === opt.id ? "border-indigo-500/60 bg-indigo-900/20 text-indigo-300" : "border-gray-700/60 bg-gray-800/40 text-gray-400 hover:bg-gray-800/70"}`}>
                          <span className="text-[11px] font-semibold">{opt.label}</span>
                          <span className="text-[9px] text-gray-600">{opt.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Background pattern */}
                  <div className="border-t border-gray-800/60 pt-4">
                    <p className="text-[10px] text-gray-500 mb-2.5 font-bold uppercase tracking-wider flex items-center gap-1.5"><span>🌐</span> Background</p>
                    <div className="grid grid-cols-3 gap-2">
                      {([{id:"none",label:"None",bg:""},{id:"dots",label:"Dots",bg:"radial-gradient(circle,rgba(255,255,255,0.15) 1px,transparent 1px)"},{id:"grid",label:"Grid",bg:"linear-gradient(rgba(255,255,255,0.1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.1) 1px,transparent 1px)"}] as const).map(opt => (
                        <button key={opt.id} onClick={() => { setBgPattern(opt.id); try { localStorage.setItem(`wf_${widgetId}_pattern`, opt.id); } catch {} }}
                          className={`flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-xl border transition-all ${bgPattern === opt.id ? "border-indigo-500/60 bg-indigo-900/20" : "border-gray-700/60 bg-gray-800/40 hover:bg-gray-800/70"}`}>
                          <div className="w-full h-6 rounded-lg bg-gray-900" style={opt.bg ? {backgroundImage:opt.bg,backgroundSize:opt.id==="grid"?"14px 14px":"8px 8px"} : {}} />
                          <span className={`text-[10px] font-medium ${bgPattern === opt.id ? "text-indigo-300" : "text-gray-400"}`}>{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Avatar shape */}
                  <div className="border-t border-gray-800/60 pt-4">
                    <p className="text-[10px] text-gray-500 mb-2.5 font-bold uppercase tracking-wider flex items-center gap-1.5"><span>👤</span> Avatar Shape</p>
                    <div className="grid grid-cols-2 gap-2">
                      {([{id:"circle",label:"Circle",cls:"rounded-full"},{id:"squircle",label:"Squircle",cls:"rounded-[35%]"}] as const).map(opt => (
                        <button key={opt.id} onClick={() => { setAvatarShape(opt.id); try { localStorage.setItem(`wf_${widgetId}_avatar`, opt.id); } catch {} }}
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all ${avatarShape === opt.id ? "border-indigo-500/60 bg-indigo-900/20 text-indigo-300" : "border-gray-700/60 bg-gray-800/40 text-gray-400 hover:bg-gray-800/70"}`}>
                          <div className={`w-8 h-8 shrink-0 bg-indigo-800/60 flex items-center justify-center text-indigo-300 text-xs font-bold ${opt.cls}`}>J</div>
                          <span className="text-[11px] font-semibold">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Timestamp style */}
                  <div className="border-t border-gray-800/60 pt-4">
                    <p className="text-[10px] text-gray-500 mb-2.5 font-bold uppercase tracking-wider flex items-center gap-1.5"><span>🕐</span> Timestamps</p>
                    <div className="grid grid-cols-3 gap-2">
                      {([{id:"relative",label:"Relative",ex:"5m ago"},{id:"absolute",label:"Absolute",ex:"2:30 PM"},{id:"hidden",label:"Hidden",ex:"—"}] as const).map(opt => (
                        <button key={opt.id} onClick={() => { setTimestampStyle(opt.id); try { localStorage.setItem(`wf_${widgetId}_timestamp`, opt.id); } catch {} }}
                          className={`flex flex-col items-start px-3 py-2.5 rounded-xl border transition-all ${timestampStyle === opt.id ? "border-indigo-500/60 bg-indigo-900/20 text-indigo-300" : "border-gray-700/60 bg-gray-800/40 text-gray-400 hover:bg-gray-800/70"}`}>
                          <span className="text-[11px] font-semibold">{opt.label}</span>
                          <span className="text-[10px] text-gray-600">{opt.ex}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Notifications */}
                  <div className="border-t border-gray-800/60 pt-4 pb-4">
                    <p className="text-[10px] text-gray-500 mb-2.5 font-bold uppercase tracking-wider flex items-center gap-1.5"><span>🔔</span> Notifications</p>
                    <div className="space-y-2">
                      <button onClick={() => { const n = !soundEnabled; setSoundEnabled(n); try { localStorage.setItem(`wf_${widgetId}_sound`, String(n)); } catch {} }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${soundEnabled ? "border-indigo-500/60 bg-indigo-900/20" : "border-gray-700/60 bg-gray-800/40"}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-base">🔊</span>
                          <div className="text-left"><p className="text-[11px] font-semibold text-gray-200">Mention Sound</p><p className="text-[9px] text-gray-600">Chime when @mentioned or @everyone</p></div>
                        </div>
                        <div className={`w-9 h-5 rounded-full transition-colors relative ${soundEnabled ? "bg-indigo-500" : "bg-gray-700"}`}>
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${soundEnabled ? "left-4" : "left-0.5"}`} />
                        </div>
                      </button>
                    </div>
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
      {/* Mobile-only draggable FAB (circular, shown when chat closed) */}
      {!open && (
        <button
          ref={fabElRef}
          aria-label="Open team chat"
          onPointerDown={onFabPointerDown}
          onPointerMove={onFabPointerMove}
          onPointerUp={onFabPointerUp}
          className={`fixed w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center focus:outline-none touch-none select-none z-[400]${fabDragging ? " fab-drag" : ""}`}
          style={{
            left: fabPos.x,
            top:  fabPos.y,
            cursor: fabDragging ? "grabbing" : "grab",
            transition: fabDragging ? "none" : "left 0.28s cubic-bezier(0.34,1.56,0.64,1), top 0.18s ease",
          }}
        >
          {/* ── Layer 1: outer breathing glow ring */}
          <span
            className="fab-breathe absolute rounded-full pointer-events-none"
            style={{
              inset: "-10px",
              background: "radial-gradient(circle, rgba(139,92,246,0.22) 0%, rgba(99,102,241,0.08) 60%, transparent 80%)",
            }}
          />

          {/* ── Layer 2: rotating conic gradient (aurora shimmer) */}
          <span
            className="fab-spin absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: "conic-gradient(from 0deg, #6366f1, #8b5cf6, #a855f7, #ec4899, #f59e0b, #6366f1)",
              opacity: 0.9,
            }}
          />

          {/* ── Layer 3: frosted inner disc (glassmorphism) */}
          <span
            className="absolute rounded-full pointer-events-none"
            style={{
              inset: "2.5px",
              background: "linear-gradient(145deg, rgba(20,14,50,0.92) 0%, rgba(30,20,65,0.96) 100%)",
              backdropFilter: "blur(6px)",
            }}
          />

          {/* ── Layer 4: top specular highlight */}
          <span
            className="absolute rounded-full pointer-events-none"
            style={{
              inset: "2.5px",
              background: "linear-gradient(160deg, rgba(255,255,255,0.18) 0%, transparent 50%)",
            }}
          />

          {/* ── Layer 5: subtle inner ring */}
          <span
            className="fab-ring absolute rounded-full pointer-events-none"
            style={{
              inset: "3px",
              border: "1px solid rgba(167,139,250,0.45)",
            }}
          />

          {/* ── Layer 6: orbiting particle dots */}
          {!fabDragging && (
            <span className="absolute inset-0 rounded-full pointer-events-none" style={{ transformOrigin: "center" }}>
              <span className="fab-p1 absolute" style={{ top: "50%", left: "50%", marginTop: "-3px", marginLeft: "-3px", width: "6px", height: "6px", borderRadius: "50%", background: "#a78bfa", boxShadow: "0 0 6px 2px rgba(167,139,250,0.8)", transformOrigin: "0 0" }} />
              <span className="fab-p2 absolute" style={{ top: "50%", left: "50%", marginTop: "-2.5px", marginLeft: "-2.5px", width: "5px", height: "5px", borderRadius: "50%", background: "#f472b6", boxShadow: "0 0 5px 2px rgba(244,114,182,0.8)", transformOrigin: "0 0" }} />
              <span className="fab-p3 absolute" style={{ top: "50%", left: "50%", marginTop: "-2px", marginLeft: "-2px", width: "4px", height: "4px", borderRadius: "50%", background: "#34d399", boxShadow: "0 0 5px 2px rgba(52,211,153,0.8)", transformOrigin: "0 0" }} />
            </span>
          )}

          {/* ── Layer 7: chat icon with idle bounce */}
          <span className={`fab-icon-idle relative z-10 flex items-center justify-center${fabDragging ? " !animate-none" : ""}`}>
            {fabIcon ?? (
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M12 2C6.477 2 2 6.134 2 11.25c0 2.4 1.01 4.582 2.657 6.184L3.5 21.5l4.43-1.73A10.7 10.7 0 0 0 12 20.5c5.523 0 10-4.134 10-9.25S17.523 2 12 2Z"
                  fill="url(#fabIconGrad)"
                />
                <circle cx="8.5"  cy="11.25" r="1.25" fill="rgba(255,255,255,0.55)" />
                <circle cx="12"   cy="11.25" r="1.25" fill="rgba(255,255,255,0.55)" />
                <circle cx="15.5" cy="11.25" r="1.25" fill="rgba(255,255,255,0.55)" />
                <defs>
                  <linearGradient id="fabIconGrad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                    <stop offset="0%"   stopColor="#c4b5fd" />
                    <stop offset="100%" stopColor="#f9a8d4" />
                  </linearGradient>
                </defs>
              </svg>
            )}
          </span>

          {/* ── Unread badge */}
          {totalUnread > 0 && (
            <span
              key={totalUnread}
              className="fab-badge-pop absolute -top-0.5 -right-0.5 min-w-[22px] h-[22px] flex items-center justify-center rounded-full text-white text-[10px] font-black px-1 z-20"
              style={{
                background: "linear-gradient(135deg, #ef4444 0%, #f97316 100%)",
                boxShadow: "0 0 0 2.5px #09090b, 0 2px 10px rgba(239,68,68,0.7)",
              }}
            >
              {/* Unread ping ring */}
              <span className="fab-unread-ping absolute inset-0 rounded-full" style={{ background: "rgba(239,68,68,0.5)" }} />
              {totalUnread > 9 ? "9+" : totalUnread}
            </span>
          )}
        </button>
      )}


    </div>
    </>
  );
}

export default ChatWidget;
