import React, { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, X, Send, Trash2 } from "lucide-react";
import type { Member } from "./types";

// ── Channels ──────────────────────────────────────────────────────────────────
const CHANNELS = [
  { id: "chit-chats",  name: "Chit-Chats", emoji: "💬", desc: "General chit-chat & fun conversations",   placeholder: "Say something fun..." },
  { id: "audio-tech",  name: "Audio-Tech",  emoji: "🎛️", desc: "Audio & technical discussions",           placeholder: "Discuss audio & tech..." },
  { id: "music-team",  name: "Music Team",  emoji: "🎵", desc: "Music team coordination & planning",      placeholder: "Talk music & worship..." },
] as const;

type ChannelId = (typeof CHANNELS)[number]["id"];

// ── Types ─────────────────────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userPhoto: string;
  text: string;
  createdAt: string; // ISO string from server
  mentions: string[];
}

export interface ChatWidgetProps {
  isAdmin: boolean;
  userId: string;
  userName: string;
  userPhoto: string;
  allMembers: Member[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getMs(ts: any): number {
  if (!ts) return 0;
  return new Date(ts).getTime();
}

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
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function renderText(text: string) {
  const parts = text.split(/(@\S+)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("@") ? (
          <span key={i} className="text-indigo-400 font-semibold bg-indigo-900/20 rounded px-0.5">
            {part}
          </span>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ChatWidget({
  isAdmin,
  userId,
  userName,
  userPhoto,
  allMembers,
}: ChatWidgetProps) {
  const [open, setOpen]                     = useState(false);
  const [activeChannel, setActiveChannel]   = useState<ChannelId>("chit-chats");
  const [messages, setMessages]             = useState<ChatMessage[]>([]);
  const [settled, setSettled]               = useState(false);
  const [input, setInput]                   = useState("");
  const [sending, setSending]               = useState(false);
  const [deletingId, setDeletingId]         = useState<string | null>(null);
  const [mentionQuery, setMentionQuery]     = useState<string | null>(null);
  const [mentionStart, setMentionStart]     = useState(0);
  const [unreadDots, setUnreadDots]         = useState<Set<ChannelId>>(new Set());

  const panelRef       = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const pollRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastReadRef    = useRef<Record<string, number>>({});
  const mountedRef     = useRef(true);
  // Tracks the currently-active channel so async fetches can self-cancel
  const activeChannelRef = useRef<ChannelId>("chit-chats");

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Keep activeChannelRef in sync
  useEffect(() => {
    activeChannelRef.current = activeChannel;
  }, [activeChannel]);

  // ── Load last-read timestamps ────────────────────────────────────────────────
  useEffect(() => {
    CHANNELS.forEach((ch) => {
      const val = localStorage.getItem(`wf_chat_read_${ch.id}`);
      if (val) lastReadRef.current[ch.id] = parseInt(val, 10);
    });
  }, []);

  // ── Fetch messages for active channel ────────────────────────────────────────
  const fetchMessages = useCallback(async (channelId: ChannelId) => {
    try {
      const res = await fetch(`/api/chat/messages?channelId=${channelId}`);
      if (!res.ok || !mountedRef.current) return;
      const data = await res.json();
      // ← CRITICAL: discard response if user already switched to another channel
      if (!Array.isArray(data) || !mountedRef.current || activeChannelRef.current !== channelId) return;
      setMessages(data);
      setSettled(true);
      // Mark channel as read
      if (data.length > 0) {
        const lastTs = getMs(data[data.length - 1].createdAt);
        lastReadRef.current[channelId] = lastTs;
        localStorage.setItem(`wf_chat_read_${channelId}`, String(lastTs));
      }
      // Clear dot for this channel
      setUnreadDots((prev) => {
        const next = new Set(prev);
        next.delete(channelId);
        return next;
      });
    } catch {
      if (mountedRef.current) setSettled(true);
    }
  }, []);

  // ── Poll when panel is open ───────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    setSettled(false);
    fetchMessages(activeChannel);
    pollRef.current = setInterval(() => fetchMessages(activeChannel), 3000);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [open, activeChannel, fetchMessages]);

  // ── Background unread check for non-active channels ───────────────────────────
  useEffect(() => {
    if (!open || !userId) return;
    CHANNELS.forEach(async (ch) => {
      if (ch.id === activeChannel) return;
      try {
        const res = await fetch(`/api/chat/messages?channelId=${ch.id}`);
        if (!res.ok || !mountedRef.current) return;
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) return;
        const last = data[data.length - 1];
        const ts = getMs(last.createdAt);
        const lastRead = lastReadRef.current[ch.id] ?? 0;
        if (ts > lastRead && last.userId !== userId && mountedRef.current) {
          setUnreadDots((prev) => new Set([...prev, ch.id as ChannelId]));
        }
      } catch { /* silent */ }
    });
  }, [open, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (open && messages.length > 0) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    }
  }, [messages.length, open]);

  // ── Auto-resize textarea ─────────────────────────────────────────────────────
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  // ── Outside click close ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Send message via API ──────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || !userId || sending) return;
    const mentions = (text.match(/@(\S+)/g) ?? []).map((m) => m.slice(1));
    setInput("");
    setSending(true);

    // ── Optimistic update: show instantly, replaced by real data on refetch ──
    const optimisticId = `_opt_${Date.now()}`;
    const optimistic: ChatMessage = {
      id: optimisticId,
      userId, userName,
      userPhoto: userPhoto || "",
      text: text.trim(),
      mentions,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: activeChannel, userId, userName, userPhoto: userPhoto || "", text }),
      });
      if (res.ok && mountedRef.current) {
        // Wait for Firestore to propagate before fetching confirmed list
        await new Promise((r) => setTimeout(r, 400));
        await fetchMessages(activeChannel);
      }
    } catch {
      // Remove optimistic message if send fails
      if (mountedRef.current) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      }
    } finally {
      if (mountedRef.current) setSending(false);
    }
  }, [input, userId, userName, userPhoto, activeChannel, sending, fetchMessages]);


  // ── Delete message via API ────────────────────────────────────────────────────
  const deleteMessage = useCallback(async (msgId: string) => {
    setDeletingId(null);
    setMessages((prev) => prev.filter((m) => m.id !== msgId)); // optimistic
    try {
      await fetch(`/api/chat/message/${msgId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: activeChannel }),
      });
    } catch { /* message already removed optimistically */ }
  }, [activeChannel]);

  // ── @mention autocomplete ─────────────────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    const cursor = e.target.selectionStart ?? val.length;
    const textUp = val.slice(0, cursor);
    const match = textUp.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1].toLowerCase());
      setMentionStart(cursor - match[0].length);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (m: Member) => {
    const name = m.name || m.firstName || "Member";
    const before = input.slice(0, mentionStart);
    const after = input.slice(mentionStart + 1 + (mentionQuery?.length ?? 0));
    setInput(`${before}@${name} ${after}`);
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    if (e.key === "Escape") setMentionQuery(null);
  };

  const mentionSuggestions = mentionQuery !== null
    ? allMembers.filter((m) => (m.name || m.firstName || "").toLowerCase().includes(mentionQuery ?? "")).slice(0, 5)
    : [];

  const switchChannel = (id: ChannelId) => {
    if (id === activeChannel) return;
    setActiveChannel(id);
    setMessages([]); // ← Clear immediately — prevents old channel messages bleeding in
    setSettled(false);
    setDeletingId(null);
    setMentionQuery(null);
  };

  const canDelete = (msg: ChatMessage) => isAdmin || msg.userId === userId;
  const activeCh = CHANNELS.find((c) => c.id === activeChannel)!;
  const totalUnread = unreadDots.size;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div ref={panelRef} className="relative">

      {/* ── Trigger button ────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-xl text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
        title="Team Chat"
        aria-label="Open team chat"
      >
        <MessageSquare size={20} />
        {totalUnread > 0 && !open && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-0.5 ring-2 ring-white dark:ring-gray-900 pointer-events-none">
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </button>

      {/* ── Chat Panel ────────────────────────────────────────────────────── */}
      {open && (
        <div className="fixed inset-x-0 top-[64px] bottom-0 sm:bottom-auto sm:inset-x-auto sm:absolute sm:top-full sm:mt-2 sm:right-0 sm:left-auto z-[200] sm:w-[500px] sm:h-[640px] flex flex-col bg-gray-950 sm:rounded-2xl shadow-2xl border-t border-gray-800/60 sm:border overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 bg-gray-950 border-b border-gray-800/60 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-indigo-600/20 flex items-center justify-center">
                <MessageSquare size={14} className="text-indigo-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white leading-tight">Team Chat</h3>
                <p className="text-[10px] text-gray-500 leading-tight">{activeCh.desc}</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 text-gray-600 hover:text-gray-300 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Channel tabs */}
          <div className="flex border-b border-gray-800/60 bg-gray-950 shrink-0 overflow-x-auto">
            {CHANNELS.map((ch) => {
              const isActive = activeChannel === ch.id;
              const hasDot = unreadDots.has(ch.id as ChannelId);
              return (
                <button
                  key={ch.id}
                  onClick={() => switchChannel(ch.id as ChannelId)}
                  className={`relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-all flex-shrink-0 ${
                    isActive
                      ? "border-indigo-500 text-indigo-400 bg-indigo-950/30"
                      : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
                  }`}
                >
                  <span className="text-sm leading-none">{ch.emoji}</span>
                  {ch.name}
                  {hasDot && !isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Messages area */}
          <div
            className="flex-1 overflow-y-auto py-2"
            style={{ overscrollBehavior: "contain" }}
          >
            {!settled && messages.length === 0 ? (
              /* Blank while fetching — no flash */
              <div />
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <div className="w-14 h-14 rounded-2xl bg-gray-800/60 flex items-center justify-center mb-3 text-2xl">
                  {activeCh.emoji}
                </div>
                <p className="text-sm font-semibold text-gray-300">{activeCh.name}</p>
                <p className="text-xs text-gray-600 mt-1 max-w-[200px]">{activeCh.desc}</p>
                <p className="text-xs text-gray-700 mt-5">👋 Be the first to say something!</p>
              </div>
            ) : (
              <div className="px-3">
                {messages.map((msg, idx) => {
                  const prev = messages[idx - 1];
                  const isMine = msg.userId === userId;
                  const isGrouped =
                    prev?.userId === msg.userId &&
                    Math.abs(getMs(msg.createdAt) - getMs(prev.createdAt)) < 5 * 60 * 1000;
                  const showDateDivider =
                    !prev || getDateLabel(msg.createdAt) !== getDateLabel(prev.createdAt);

                  return (
                    <React.Fragment key={msg.id}>
                      {/* Date divider */}
                      {showDateDivider && (
                        <div className="flex items-center gap-3 py-3">
                          <div className="flex-1 h-px bg-gray-800/80" />
                          <span className="text-[10px] text-gray-600 font-semibold tracking-wide uppercase">
                            {getDateLabel(msg.createdAt)}
                          </span>
                          <div className="flex-1 h-px bg-gray-800/80" />
                        </div>
                      )}

                      {/* Message row */}
                      <div
                        className={`group flex items-start gap-3 px-2 py-1 rounded-xl hover:bg-gray-800/30 transition-colors cursor-default ${
                          isGrouped ? "mt-0.5" : "mt-3"
                        }`}
                      >
                        {/* Avatar */}
                        <div className="w-8 shrink-0">
                          {!isGrouped ? (
                            msg.userPhoto ? (
                              <img
                                src={msg.userPhoto}
                                alt={msg.userName}
                                className="w-8 h-8 rounded-full object-cover ring-1 ring-gray-700/60"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-indigo-900/50 border border-indigo-800/40 flex items-center justify-center text-indigo-300 text-xs font-bold">
                                {msg.userName?.[0]?.toUpperCase() ?? "?"}
                              </div>
                            )
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
                              <span className={`text-xs font-semibold leading-tight ${isMine ? "text-indigo-300" : "text-gray-100"}`}>
                                {msg.userName}
                                {isMine && <span className="ml-1.5 text-[9px] text-indigo-500/70 font-normal">you</span>}
                              </span>
                              <span className="text-[10px] text-gray-600 leading-tight">{timeAgo(msg.createdAt)}</span>
                            </div>
                          )}
                          {deletingId === msg.id ? (
                            <div className="flex items-center gap-2 mt-1 bg-red-950/60 border border-red-900/40 rounded-xl px-3 py-2">
                              <span className="text-[11px] text-red-400 flex-1">Delete this message?</span>
                              <button onClick={() => deleteMessage(msg.id)} className="text-[10px] px-2.5 py-1 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-500 transition-colors">Delete</button>
                              <button onClick={() => setDeletingId(null)} className="text-[10px] px-2.5 py-1 rounded-lg bg-gray-700 text-gray-300 font-semibold hover:bg-gray-600 transition-colors">Cancel</button>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-200 leading-relaxed break-words whitespace-pre-wrap">
                              {renderText(msg.text)}
                            </p>
                          )}
                        </div>

                        {/* Delete on hover */}
                        {canDelete(msg) && deletingId !== msg.id && (
                          <button
                            onClick={() => setDeletingId(msg.id)}
                            className="shrink-0 p-1.5 rounded-lg text-transparent group-hover:text-gray-600 hover:!text-red-400 hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all"
                            title="Delete message"
                          >
                            <Trash2 size={12} />
                          </button>
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
              <p className="text-[9px] text-gray-600 px-3 pt-2 pb-1 font-semibold uppercase tracking-wider">Mention a member</p>
              {mentionSuggestions.map((m) => (
                <button
                  key={m.email || m.id}
                  onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-800 transition-colors text-left"
                >
                  {m.photo ? (
                    <img src={m.photo} alt={m.name} className="w-6 h-6 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-indigo-900/50 flex items-center justify-center text-indigo-400 text-[10px] font-bold shrink-0">
                      {(m.name || m.firstName)?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                  <span className="text-xs text-gray-100 font-medium">{m.name || m.firstName}</span>
                  {m.roles?.[0] && <span className="text-[10px] text-gray-600 ml-auto shrink-0">{m.roles[0]}</span>}
                </button>
              ))}
            </div>
          )}

          {/* Input area */}
          <div className="px-3 pb-3 pt-2 border-t border-gray-800/60 bg-gray-950 shrink-0">
            <div className="flex items-end gap-2.5">
              {userPhoto ? (
                <img src={userPhoto} alt={userName} className="w-7 h-7 rounded-full object-cover shrink-0 mb-0.5 ring-1 ring-gray-700/60" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-indigo-900/50 border border-indigo-800/40 flex items-center justify-center text-indigo-300 text-xs font-bold shrink-0 mb-0.5">
                  {userName?.[0]?.toUpperCase() ?? "?"}
                </div>
              )}
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={activeCh.placeholder}
                  rows={1}
                  disabled={!userId || sending}
                  className="w-full bg-gray-800 border border-gray-700/50 text-gray-100 text-sm px-3.5 py-2.5 pr-11 rounded-xl resize-none focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 placeholder-gray-600 transition-all disabled:opacity-40"
                  style={{ minHeight: "40px", maxHeight: "120px" }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || sending || !userId}
                  className="absolute right-2 bottom-2 w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Send size={12} />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between mt-2 pl-9">
              <span className="text-[10px] text-gray-700">
                <kbd className="font-mono">Enter</kbd> to send · <kbd className="font-mono">Shift+Enter</kbd> for new line · <kbd className="font-mono">@</kbd> to mention
              </span>
              <span className="text-[10px] text-gray-700">{activeCh.emoji} {activeCh.name}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
