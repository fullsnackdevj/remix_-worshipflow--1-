import React, { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from "react";

import { useAuth } from "./AuthContext";
import { getAuth } from "firebase/auth";
import { usePushNotifications } from "./usePushNotifications";
import { useRealtimeNotifications } from "./useRealtimeNotifications";


// ── Lightweight always-loaded components ────────────────────────────────────
import BroadcastOverlay from "./BroadcastOverlay";
import WelcomeToast from "./WelcomeToast";
import SplashScreen from "./SplashScreen";
import BirthdatePromptModal from "./BirthdatePromptModal";

// ── Heavy views — lazy-loaded on first visit (code splitting) ────────────────
const AdminPanel    = lazy(() => import("./AdminPanel"));
const HelpPanel     = lazy(() => import("./HelpPanel"));
const NotesPanel    = lazy(() => import("./NotesPanel"));
const Dashboard     = lazy(() => import("./Dashboard"));
const DashboardView = lazy(() => import("./DashboardView"));
const Playground    = lazy(() => import("./Playground"));
const ScheduleView  = lazy(() => import("./ScheduleView"));
const SongsView     = lazy(() => import("./SongsView"));
const MembersView   = lazy(() => import("./MembersView"));
const TeamNotesView = lazy(() => import("./TeamNotesView"));
// AutoTextarea & DatePicker are tiny UI primitives — import statically to avoid extra chunk round-trips
import AutoTextarea from "./AutoTextarea";
import DatePicker from "./DatePicker";

import { Music, Search, Plus, Edit, Trash2, X, Save, Tag as TagIcon, Menu, ChevronLeft, ChevronRight, ChevronDown, Moon, Sun, ImagePlus, Loader2, ExternalLink, Printer, CheckSquare, Check, Filter, Users, Calendar, Phone, UserPlus, Camera, LayoutGrid, List, BookOpen, Mic2, Copy, Pencil, Shield, Mail, Bell, Guitar, Sliders, Palette, Lock, AlertTriangle, CheckCircle, BookMarked, HandMetal, Headphones, HelpCircle, Undo2, Redo2, FlaskConical, NotebookPen } from "lucide-react";
import { Song, Tag, Member, ScheduleMember, Schedule } from "./types";
import LineupPlayer, { LineupTrack, CurrentUser } from "./LineupPlayer";


// ── Member Role Constants ────────────────────────────────────────────────────
const ROLE_CATEGORIES = [
  {
    label: "Instrumentalists",
    color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300",
    dot: "bg-indigo-400",
    roles: ["Drummer", "Bassist", "Rhythm Guitar", "Lead Guitar", "Keys / Pianist"],
  },
  {
    label: "Vocals",
    color: "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300",
    dot: "bg-rose-400",
    roles: ["Worship Leader", "Backup Singer"],
  },
  {
    label: "Tech & Production",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
    dot: "bg-amber-400",
    roles: ["OBS / Live Stream", "Presentation", "Lighting", "Camera Operator"],
  },
  {
    label: "Creative Support",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
    dot: "bg-emerald-400",
    roles: ["Designer", "Photographer", "Videographer"],
  },
];

const ALL_ROLES = ROLE_CATEGORIES.flatMap(c => c.roles);

function getRoleStyle(role: string) {
  const cat = ROLE_CATEGORIES.find(c => c.roles.includes(role));
  return cat ? cat.color : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
}

const STATUS_CONFIG = {
  active: { label: "Active", dot: "bg-emerald-400", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" },
  "on-leave": { label: "On Leave", dot: "bg-amber-400", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300" },
  inactive: { label: "Inactive", dot: "bg-gray-400", badge: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400" },
} as const;



// ── Pure utility functions (module-level — no state dependencies) ────────────
function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function eventEmoji(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("sunday")) return "🙌";
  if (n.includes("midweek")) return "✝️";
  if (n.includes("prayer")) return "🙏";
  if (n.includes("worship")) return "🎵";
  if (n.includes("youth")) return "👆";
  if (n.includes("revival")) return "🔥";
  return "📅";
}

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

// ── Chord Transposer ────────────────────────────────────────────────────────
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ENHARMONIC: Record<string, string> = {
  'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
};

function transposeChords(text: string, steps: number): string {
  if (!steps || !text) return text;
  const n = ((steps % 12) + 12) % 12;
  // Smarter regex:
  //   (?<![A-Za-z])  - not preceded by a letter
  //   ([A-G][#b]?)   - chord ROOT (group 1)
  //   (quality)?     - optional chord quality: m, maj, min, dim, aug, sus, add, number (group 2)
  //   (?![a-z])      - NOT followed by a plain lowercase letter
  //                    -> rejects words: "Capo", "Chorus", "God", "Bridge"
  //                    -> accepts chords: "C", "Am", "F#", "Gsus4"
  return text.replace(
    /(?<![A-Za-z])([A-G][#b]?)(m(?:aj\d*)?|maj\d*|min\d*|dim\d*|aug\d*|sus[24]?\d*|add\d+|\d+)?(?![a-z])/g,
    (_: string, root: string, quality: string | undefined) => {
      const normalized = ENHARMONIC[root] ?? root;
      const idx = CHROMATIC.indexOf(normalized);
      if (idx === -1) return _;
      return CHROMATIC[(idx + n) % 12] + (quality ?? '');
    }
  );
}

// ── UserMenu ─────────────────────────────────────────────────────────────────
// ── YouTube embed URL helper (global — used by floating mini player) ──────────
function getYoutubeEmbed(url: string, loop = false): string {
  try {
    const u = new URL(url);
    let id = "";
    if (u.hostname === "youtu.be") id = u.pathname.slice(1);
    else if (u.hostname.includes("youtube.com")) id = u.searchParams.get("v") ?? u.pathname.split("/").pop() ?? "";
    if (id) {
      const loopParams = loop ? `&loop=1&playlist=${id}` : "";
      return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0${loopParams}`;
    }
  } catch { /* noop */ }
  return url;
}

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  admin: { label: "Admin", className: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400" },
  leader: { label: "Worship Leader", className: "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400" },
  planning_lead: { label: "Planning Lead", className: "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400" },
  musician: { label: "Musician", className: "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400" },
  audio_tech: { label: "Audio / Tech", className: "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400" },
  member: { label: "Member", className: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300" },
  qa_specialist: { label: "QA Specialist", className: "bg-fuchsia-100 dark:bg-fuchsia-900/40 text-fuchsia-700 dark:text-fuchsia-400" },
};

const QA_SWITCH_ROLES = [
  { value: "qa_specialist", label: "QA Specialist (default)" },
  { value: "leader", label: "Worship Leader" },
  { value: "planning_lead", label: "Planning Lead" },
  { value: "musician", label: "Musician" },
  { value: "audio_tech", label: "Audio / Tech" },
  { value: "member", label: "Member" },
];

function UserMenu({ simulatedRole, onRoleSwitch }: { simulatedRole: string; onRoleSwitch: (r: string) => void }) {
  const { user, logOut, userRole, isAdmin } = useAuth();
  const [open, setOpen] = React.useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  if (!user) return null;

  const isQA = userRole === "qa_specialist";
  const isAdminUserMenu = userRole === "admin" || isAdmin;
  const canSimulate = isQA; // only QA Specialist can simulate roles (not Admin)
  const effectiveDisplay = canSimulate && simulatedRole !== "qa_specialist" && simulatedRole !== userRole ? simulatedRole : userRole;
  const badge = ROLE_BADGE[effectiveDisplay] ?? ROLE_BADGE.member;
  const qaBadge = ROLE_BADGE.qa_specialist;

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 p-1 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
        {user.photoURL
          ? <img src={user.photoURL} alt={user.displayName ?? ""} className="w-8 h-8 rounded-full border-2 border-indigo-500" />
          : <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-semibold">{user.displayName?.[0] ?? user.email?.[0]?.toUpperCase()}</div>
        }
        <ChevronDown size={14} className="text-gray-400 hidden sm:block" />
      </button>
      {open && (
        <div className="fixed sm:absolute right-2 sm:right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 py-1 overflow-hidden" style={{ width: "min(256px, calc(100vw - 1rem))", top: "calc(var(--header-h, 64px) + 8px)" }}>
          {/* Identity */}
          <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-700">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{user.displayName}</p>
            <p className="text-xs text-gray-400 truncate">{user.email}</p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {isQA && (
                <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold ${qaBadge.className}`}>
                  {qaBadge.label}
                </span>
              )}
              <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold ${badge.className}`}>
                {canSimulate && effectiveDisplay !== userRole ? `Testing: ${badge.label}` : badge.label}
              </span>
            </div>
          </div>

          {/* Role Switcher — for QA Specialist & Admin */}
          {canSimulate && (
            <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-700">
              <p className="text-[10px] font-bold text-fuchsia-500 uppercase tracking-wider mb-1.5">Test as role</p>
              <select
                value={simulatedRole}
                onChange={e => { onRoleSwitch(e.target.value); setOpen(false); }}
                className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
              >
                {QA_SWITCH_ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              {simulatedRole !== "qa_specialist" && simulatedRole !== userRole && (
                <button
                  onClick={() => { onRoleSwitch(userRole); setOpen(false); }}
                  className="mt-1.5 w-full text-[10px] text-fuchsia-500 hover:text-fuchsia-400 font-medium transition-colors"
                >
                  Reset to {ROLE_BADGE[userRole]?.label ?? userRole}
                </button>
              )}
            </div>
          )}

          {/* Sign out */}
          <button onClick={() => { setOpen(false); logOut(); }} className="w-full text-left px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2">
            <X size={14} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [currentView, setCurrentView] = useState<"dashboard" | "songs" | "members" | "schedule" | "playground" | "admin">("dashboard");
  const { isAdmin, userRole, user, status: authStatus } = useAuth();


  // Dashboard is the default landing for all roles — no redirect needed.

  // ── QA Specialist simulated role ──────────────────────────────────────────
  const isQA = userRole === "qa_specialist";
  const isAdminUser = isAdmin || userRole === "admin"; // early check before effectiveRole exists
  const canSimulateRoles = isQA; // only QA Specialist can simulate roles
  // ── Global video player ───────────────────────────────────────────────────
  const [videoModal, setVideoModal] = useState<string | null>(null);
  const [loopVideo, setLoopVideo] = useState(false);
  const [miniPlayer, setMiniPlayer] = useState(false);
  const openVideo = (url: string) => { setVideoModal(url); setLoopVideo(false); setMiniPlayer(false); };
  const closeVideo = () => { setVideoModal(null); setLoopVideo(false); setMiniPlayer(false); };

  const [simulatedRole, setSimulatedRole] = useState<string>(() => {
    try { return localStorage.getItem(`wf_qa_role_${user?.uid}`) || "qa_specialist"; } catch { return "qa_specialist"; }
  });
  // ref so handleRoleSwitch can call showToast before it is defined below
  const showToastRef = useRef<((type: string, msg: string) => void) | null>(null);
  const handleRoleSwitch = (role: string) => {
    setSimulatedRole(role);
    try { localStorage.setItem(`wf_qa_role_${user?.uid}`, role); } catch { /* noop */ }
    const label = role === "qa_specialist"
      ? "Reset to QA Specialist"
      : `Now testing as: ${ROLE_BADGE[role]?.label ?? role}`;
    showToastRef.current?.("info", label);
  };
  // The role used for ALL permission checks
  const effectiveRole = canSimulateRoles ? simulatedRole : userRole;

  // 🔔 Push notifications — iOS-safe: user must tap "Enable" button
  const { showPrompt: showPushPrompt, requestPushPermission, dismissPrompt: dismissPushPrompt } =
    usePushNotifications(user?.uid ?? null, userRole ?? null);

  // ── Real-time notifications ──────────────────────────────────────────────────
  // 10s poll + window focus/visibility — max 10s latency, instant on tab switch
  const {
    notifications,
    setNotifications,
    hasNewArrival,
    refetch: refetchNotifications,
  } = useRealtimeNotifications(user?.uid, effectiveRole);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markAllRead = async () => {
    if (!user) return;
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    await fetch("/api/notifications/read", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user.uid }) });
    setTimeout(() => refetchNotifications(), 500); // re-verify from server
  };

  const markOneRead = async (notifId: string, type: string, resourceId?: string, resourceDate?: string) => {
    if (!user) return;
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, isRead: true } : n));
    setNotifOpen(false);
    await fetch("/api/notifications/read", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user.uid, notifId }) });
    // Deep-link navigation
    if (type === "new_song" && resourceId) {
      setCurrentView("songs");
      // Find song in local state or fetch it
      // Find song in local state, or set pending nav for when SongsView loads
      setPendingNavSongId(resourceId);
      setCurrentView("songs");
      // If already located, clear in SongsView via onPendingNavHandled
    } else if ((type === "new_event" || type === "updated_event") && resourceId && resourceDate) {
      setCurrentView("schedule");
      setPendingDeepLinkEventId(resourceId);
      setPendingDeepLinkEventDate(resourceDate);
    } else if (type === "access_request") {
      setCurrentView("admin");
    } else if (type === "team_note") {
      setCurrentView("team-notes");
    }
  };



  const [notifActionFor, setNotifActionFor] = useState<string | null>(null);

  const markOneUnread = async (notifId: string) => {
    if (!user) return;
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, isRead: false } : n));
    setNotifActionFor(null);
    await fetch("/api/notifications/unread", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user.uid, notifId }) });
  };

  const deleteNotif = async (notifId: string) => {
    if (!user) return;
    setNotifications(prev => prev.filter(n => n.id !== notifId));
    setNotifActionFor(null);
    await fetch(`/api/notifications/${notifId}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user.uid }) });
  };

  const clearAllNotifs = async () => {
    if (!user) return;
    setNotifications([]);
    await fetch("/api/notifications/clear-all", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user.uid }) });
  };

  const notifIcon: Record<string, React.ReactNode> = {
    new_song: <Music size={14} />, new_event: <Calendar size={14} />, updated_event: <Pencil size={14} />, access_request: <Bell size={14} />, team_note: <NotebookPen size={14} />,
  };
  // ── Role-based permission flags ───────────────────────────────────────────
  // All flags use effectiveRole so QA Specialist simulation works correctly
  const isLeader = effectiveRole === "leader";
  const isPlanningLead = effectiveRole === "planning_lead";
  const isRoleAdmin = isAdmin || effectiveRole === "admin"; // covers owner email AND Firestore-assigned admin
  const isQARole = effectiveRole === "qa_specialist"; // effective QA (includes simulated)

  // Songs
  const canAddSong = isRoleAdmin || ["musician", "audio_tech", "leader", "planning_lead", "qa_specialist"].includes(effectiveRole);
  const canEditSong = isRoleAdmin || ["musician", "audio_tech", "leader", "planning_lead", "qa_specialist"].includes(effectiveRole);
  const canDeleteSong = isRoleAdmin || isQARole;    // Admin + QA Specialist only
  const canSelectSongs = isRoleAdmin || isQARole;   // Admin + QA Specialist only

  // Members — own-profile restriction via email matching
  const isMyProfile = (member: any) =>
    !!user?.email && !!member?.email &&
    member.email.trim().toLowerCase() === user.email.trim().toLowerCase();
  const canAddMember = isRoleAdmin || isQARole;                          // Admin + QA Specialist (Worship Leader removed)
  const canEditMember = (member: any) => isRoleAdmin || isQARole || isMyProfile(member); // Admin & QA edit all; others own only
  const canDeleteMember = isRoleAdmin || isQARole;                       // Admin + QA Specialist

  // Schedule helpers
  // Returns true if dateStr falls on a Sunday (0) or Wednesday (3)
  const isServiceDay = (d: string) => { const dow = new Date(d + "T00:00:00").getDay(); return dow === 0 || dow === 3; };

  // Schedule write — Admin, Worship Leader, Planning Lead, QA Specialist
  const canWriteSchedule = isRoleAdmin || isLeader || isPlanningLead || isQARole;

  // ── Scheduling state (kept in App for shared access + notification deep-link) ─
  // ── Schedules shared state — seed from cache for instant dashboard cards ──────────
  const [allSchedules, setAllSchedules] = React.useState<Schedule[]>(() => {
    try {
      const raw = localStorage.getItem("wf_schedules_cache");
      if (!raw) return [];
      const data = JSON.parse(raw);
      const ts = localStorage.getItem("wf_schedules_cache_ts");
      // 15 min TTL — schedules rarely change mid-session
      if (ts && Date.now() - Number(ts) < 15 * 60 * 1000 && Array.isArray(data)) return data;
    } catch { /* noop */ }
    return [];
  });

  // Deep-link: open a specific event when navigating from a notification
  const [pendingDeepLinkEventId, setPendingDeepLinkEventId] = React.useState<string | null>(null);
  const [pendingDeepLinkEventDate, setPendingDeepLinkEventDate] = React.useState<string | null>(null);


  // ── Songs shared state — seed from cache immediately for instant dashboard counts ──
  const [allSongs, setAllSongs] = useState<Song[]>(() => {
    try {
      const raw = localStorage.getItem("wf_songs_cache");
      if (!raw) return [];
      const { songs, ts } = JSON.parse(raw);
      // 30 min TTL — songs library changes infrequently
      if (Date.now() - ts < 30 * 60 * 1000 && Array.isArray(songs)) return songs;
    } catch { /* noop */ }
    return [];
  });
  const [isLoadingSongs, setIsLoadingSongs] = useState(() => {
    try {
      const raw = localStorage.getItem("wf_songs_cache");
      if (!raw) return true;
      const { ts } = JSON.parse(raw);
      return Date.now() - ts > 30 * 60 * 1000; // only show spinner if cache stale
    } catch { return true; }
  });
  const [tags, setTags] = useState<Tag[]>(() => {
    try {
      const raw = localStorage.getItem("wf_songs_cache");
      if (!raw) return [];
      const { tags, ts } = JSON.parse(raw);
      if (Date.now() - ts < 30 * 60 * 1000 && Array.isArray(tags)) return tags;
    } catch { /* noop */ }
    return [];
  });

  // ── Lineup playlist player ────────────────────────────────────────────────
  const [lineupOpen, setLineupOpen] = useState(false);

  const lineupTracks = React.useMemo((): LineupTrack[] => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const in7 = new Date(today); in7.setDate(today.getDate() + 7);
    const relevant = allSchedules.filter(s => {
      const sType = (s.serviceType ?? "").toLowerCase();
      const eName = (s.eventName ?? "").toLowerCase();
      if (!sType.includes("sunday") && !sType.includes("midweek") && !eName.includes("sunday") && !eName.includes("midweek")) return false;
      try {
        const d = new Date(s.date + "T00:00:00");
        return d >= today && d <= in7;
      } catch { return false; }
    }).sort((a, b) => a.date.localeCompare(b.date));

    const tracks: LineupTrack[] = [];
    relevant.forEach(ev => {
      if (ev.songLineup?.joyful) {
        const song = allSongs.find(s => s.id === ev.songLineup!.joyful);
        if (song?.video_url) tracks.push({ songId: song.id, title: song.title, artist: song.artist ?? "", videoUrl: song.video_url, mood: "joyful", eventName: ev.eventName ?? "Service", eventDate: ev.date, serviceType: ev.serviceType });
      }
      if (ev.songLineup?.solemn) {
        const song = allSongs.find(s => s.id === ev.songLineup!.solemn);
        if (song?.video_url) tracks.push({ songId: song.id, title: song.title, artist: song.artist ?? "", videoUrl: song.video_url, mood: "solemn", eventName: ev.eventName ?? "Service", eventDate: ev.date, serviceType: ev.serviceType });
      }
    });
    return tracks;
  }, [allSchedules, allSongs]);



  // ── Members shared state — seed from cache immediately for instant dashboard counts ──
  const [allMembers, setAllMembers] = useState<Member[]>(() => {
    try {
      const raw = localStorage.getItem("wf_members_cache");
      if (!raw) return [];
      const { members, ts } = JSON.parse(raw);
      // 20 min TTL — member list rarely changes mid-session
      if (Date.now() - ts < 20 * 60 * 1000 && Array.isArray(members)) return members;
    } catch { /* noop */ }
    return [];
  });
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  const [pendingNavSongId, setPendingNavSongId] = useState<string | null>(null);




  // ── Toast notifications ──────────────────────────────────────────────
  type ToastType = "success" | "error" | "info" | "warning";
  interface ToastItem { id: number; type: ToastType; message: string; }
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const dismissToast = useCallback((id: number) =>
    setToasts(prev => prev.filter(t => t.id !== id)), []);

  // ── Confirm dialog ─────────────────────────────────────────────────
  interface ConfirmConfig {
    title: string; message: string; detail?: string;
    confirmText: string; confirmClass?: string; onConfirm: () => void;
  }
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig | null>(null);
  const showConfirm = useCallback((config: ConfirmConfig) => setConfirmConfig(config), []);
  const closeConfirm = useCallback(() => setConfirmConfig(null), []);


  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);


  useEffect(() => {
    // ── Boot prefetch: skip if localStorage cache is still fresh ───────────────
    const isSongsCacheFresh = (() => {
      try { const { ts } = JSON.parse(localStorage.getItem("wf_songs_cache") || "{}"); return Date.now() - ts < 30 * 60 * 1000; } catch { return false; }
    })();
    const isMembersCacheFresh = (() => {
      try { const { ts } = JSON.parse(localStorage.getItem("wf_members_cache") || "{}"); return Date.now() - ts < 20 * 60 * 1000; } catch { return false; }
    })();
    const isSchedulesCacheFresh = (() => {
      try { const ts = localStorage.getItem("wf_schedules_cache_ts"); return !!ts && Date.now() - Number(ts) < 15 * 60 * 1000; } catch { return false; }
    })();

    // Songs + tags
    const fetchSongs = async () => {
      try {
        const [songsRes, tagsRes] = await Promise.all([
          fetch("/api/songs"),
          fetch("/api/tags"),
        ]);
        const [songsData, tagsData] = await Promise.all([
          songsRes.json(),
          tagsRes.json(),
        ]);
        const songs = Array.isArray(songsData) ? songsData : [];
        const tags  = Array.isArray(tagsData)  ? tagsData  : [];
        setAllSongs(songs);
        setTags(tags);
        try { localStorage.setItem("wf_songs_cache", JSON.stringify({ songs, tags, ts: Date.now() })); } catch { /* noop */ }
      } catch (e) {
        console.warn("Boot song fetch failed:", e);
      } finally {
        setIsLoadingSongs(false);
      }
    };
    // Members
    const fetchMembers = async () => {
      try {
        const res = await fetch("/api/members");
        const data = await res.json();
        const members = Array.isArray(data) ? data : [];
        setAllMembers(members);
        try { localStorage.setItem("wf_members_cache", JSON.stringify({ members, ts: Date.now() })); } catch { /* noop */ }
      } catch (e) {
        console.warn("Boot members fetch failed:", e);
      }
    };
    // Schedules
    const fetchSchedules = async () => {
      try {
        const res = await fetch("/api/schedules");
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        const schedules = Array.isArray(data) ? data : [];
        setAllSchedules(schedules);
        try {
          localStorage.setItem("wf_schedules_cache", JSON.stringify(schedules));
          localStorage.setItem("wf_schedules_cache_ts", Date.now().toString());
        } catch { /* noop */ }
      } catch (e) {
        console.warn("Boot schedules fetch failed:", e);
        // Fall back to stale cache
        try {
          const cached = localStorage.getItem("wf_schedules_cache");
          if (cached) setAllSchedules(JSON.parse(cached));
        } catch { /* noop */ }
      }
    };
    // Only fire fetches for data whose cache is stale — skip the rest
    if (!isSongsCacheFresh) fetchSongs(); else setIsLoadingSongs(false);
    if (!isMembersCacheFresh) fetchMembers();
    if (!isSchedulesCacheFresh) fetchSchedules();

    // NOTE: View-specific fetch functions in SongsView/MembersView serve as
    // background refresh on mount (stale-while-revalidate pattern).
  }, []);

  /** The currently signed-in user's Member document (matched by email), if any */
  const myMemberProfile = useMemo(() => {
    if (!user?.email) return null;
    const email = user.email.trim().toLowerCase();
    return allMembers.find(m => (m.email || "").trim().toLowerCase() === email) ?? null;
  }, [allMembers, user]);

  /** True when the user has a member profile but hasn't set their birthdate yet */
  const needsBirthdatePrompt = !!myMemberProfile && !myMemberProfile.birthdate;

  /** Map of "MM-DD" -> Member[] for birthday lookups */
  const birthdayMap = useMemo(() => {
    const map: Record<string, Member[]> = {};
    allMembers.forEach(m => {
      if (!m.birthdate) return;
      const mmdd = m.birthdate.slice(5);
      if (!map[mmdd]) map[mmdd] = [];
      map[mmdd].push(m);
    });
    return map;
  }, [allMembers]);

  // ── Dashboard notes — TTL cache: only re-fetch after 8 minutes ──────────
  const [dashboardNotes, setDashboardNotes] = useState<any[]>(() => {
    try {
      const raw = localStorage.getItem("wf_notes_cache");
      if (raw) { const { data, ts } = JSON.parse(raw); if (Date.now() - ts < 8 * 60 * 1000) return data; }
    } catch { /* noop */ } return [];
  });
  useEffect(() => {
    if (currentView !== "dashboard") return;
    const raw = localStorage.getItem("wf_notes_cache");
    if (raw) {
      try {
        const { ts } = JSON.parse(raw);
        if (Date.now() - ts < 8 * 60 * 1000) return; // cache fresh — skip fetch
      } catch { /* noop */ }
    }
    fetch("/api/notes").then(r => r.json()).then(data => {
      if (Array.isArray(data)) {
        setDashboardNotes(data);
        try { localStorage.setItem("wf_notes_cache", JSON.stringify({ data, ts: Date.now() })); } catch { /* noop */ }
      }
    }).catch(() => {});
  }, [currentView]);

  const canWriteMembers = isRoleAdmin || isQARole; // Worship Leader removed; QA Specialist added

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 font-sans text-gray-900 dark:text-gray-100 overflow-hidden">

      {/* 🔔 Push Notification Permission Banner — iOS-safe (requires user tap) */}
      {showPushPrompt && (
        <div className="fixed top-0 left-0 right-0 z-[100] animate-slide-down">
          <div className="mx-3 mt-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 shadow-2xl border border-indigo-500/30 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="shrink-0 w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                <Bell size={18} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white leading-tight">Stay notified!</p>
                <p className="text-[11px] text-indigo-200 leading-tight mt-0.5">Get alerts for new songs & events directly on your phone.</p>
              </div>
              <button
                onClick={requestPushPermission}
                className="shrink-0 px-3.5 py-1.5 bg-white text-indigo-700 text-xs font-bold rounded-xl hover:bg-indigo-50 active:scale-95 transition-all shadow-md"
              >
                Enable
              </button>
              <button
                onClick={dismissPushPrompt}
                className="shrink-0 p-1.5 text-white/70 hover:text-white transition-colors rounded-lg hover:bg-white/10"
                aria-label="Dismiss"
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🎂 Birthdate Prompt — blocks UI for members who haven't set their birthday yet */}
      {needsBirthdatePrompt && myMemberProfile && (
        <BirthdatePromptModal
          memberName={myMemberProfile.name}
          memberId={myMemberProfile.id}
          onSuccess={bdate => {
            // Optimistically update local state so modal closes immediately
            setAllMembers(prev => prev.map(m =>
              m.id === myMemberProfile.id ? { ...m, birthdate: bdate } : m
            ));
          }}
        />
      )}

      {/* 📢 Broadcast Overlay — maintenance / what's new screens */}
      <BroadcastOverlay />

      {/* 👋 Welcome Toast — shows once on very first login */}
      <WelcomeToast />

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

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {!isSidebarCollapsed && (
            <p className="px-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 mt-2">Worship</p>
          )}

          {/* Dashboard — available to all roles */}
          <button
            onClick={() => { setCurrentView("dashboard"); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors font-medium ${currentView === "dashboard"
              ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              } ${isSidebarCollapsed ? "justify-center" : ""}`}
            title="Dashboard"
          >
            <LayoutGrid size={20} className="shrink-0" />
            {!isSidebarCollapsed && <span>Dashboard</span>}
          </button>


          {/* Song Management */}
          <button
            onClick={() => { setCurrentView("songs"); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors font-medium ${currentView === "songs"
              ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              } ${isSidebarCollapsed ? "justify-center" : ""}`}
            title="Song Management"
          >
            <BookOpen size={20} className="shrink-0" />
            {!isSidebarCollapsed && <span>Song Management</span>}
          </button>

          {/* Team Members */}
          <button
            onClick={() => { setCurrentView("members"); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors font-medium ${currentView === "members"
              ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              } ${isSidebarCollapsed ? "justify-center" : ""}`}
            title="Team Members"
          >
            <Users size={20} className="shrink-0" />
            {!isSidebarCollapsed && <span>Team Members</span>}
          </button>

          {/* Scheduling */}
          <button
            onClick={() => { setCurrentView("schedule"); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors font-medium ${currentView === "schedule"
              ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
              } ${isSidebarCollapsed ? "justify-center" : ""}`}
          >
            <Calendar size={20} className="shrink-0" />
            {!isSidebarCollapsed && (
              <span className="flex items-center gap-2">
                Scheduling
              </span>
            )}
          </button>

          {/* Notes */}
          <button
            onClick={() => { setCurrentView("team-notes"); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors font-medium ${currentView === "team-notes"
              ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
              } ${isSidebarCollapsed ? "justify-center" : ""}`}
            title="Notes"
          >
            <NotebookPen size={20} className="shrink-0" />
            {!isSidebarCollapsed && <span>Notes</span>}
          </button>
          {isRoleAdmin && (
            <button
              onClick={() => { setCurrentView("playground"); setIsMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors font-medium ${
                currentView === "playground"
                  ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
              } ${isSidebarCollapsed ? "justify-center" : ""}`}
              title="Playground"
            >
              <FlaskConical size={20} className="shrink-0" />
              {!isSidebarCollapsed && <span>Playground</span>}
            </button>
          )}

          {/* Admin Panel — admin only, always hidden for QA Specialist */}
          {isRoleAdmin && !isQA && (
            <button
              onClick={() => { setCurrentView("admin"); setIsMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors font-medium ${currentView === "admin"
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                } ${isSidebarCollapsed ? "justify-center" : ""}`}
              title="Team Access"
            >
              <Shield size={20} className="shrink-0" />
              {!isSidebarCollapsed && <span>Team Access</span>}
            </button>
          )}

          {/* Preaching — disabled / coming soon */}
          <div
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium opacity-40 cursor-not-allowed select-none text-gray-500 dark:text-gray-500 ${isSidebarCollapsed ? "justify-center" : ""}`}
            title="Preaching — Coming Soon"
          >
            <Mic2 size={20} className="shrink-0" />
            {!isSidebarCollapsed && (
              <span className="flex items-center gap-2">
                Preaching
                <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full">Soon</span>
              </span>
            )}
          </div>
        </nav>

        <div className="p-3 border-t border-gray-200 dark:border-gray-800 flex items-center justify-center gap-2">
          {isAdmin && (
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="flex items-center justify-center p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          )}
        </div>
        {/* Sidebar collapse toggle — floats on the border line */}
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="hidden lg:flex absolute -right-3.5 top-8 -translate-y-1/2 z-40 w-7 h-7 items-center justify-center rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 shadow-sm transition-all"
        >
          {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 py-4 px-4 sm:px-6 flex items-center gap-4 h-16 shrink-0" style={{ ["--header-h" as any]: "64px" }}>
          <button
            className="lg:hidden p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu size={20} />
          </button>

          <div className="flex-1 flex items-center">
            <h1 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white whitespace-nowrap">
              {currentView === "dashboard" ? "Dashboard" : currentView === "schedule" ? "Scheduling" : currentView === "members" ? "Team Members" : currentView === "admin" ? "Team Access" : currentView === "playground" ? "Playground" : currentView === "team-notes" ? "Notes" : "Song Management"}
            </h1>
          </div>
          <div className="flex items-center gap-2">


            {/* Notification Bell */}
            {/* Team Notes */}
            <NotesPanel
              userId={user?.uid ?? ""}
              userName={user?.displayName ?? user?.email ?? "Unknown"}
              userPhoto={user?.photoURL ?? ""}
              userRole={userRole}
              onToast={showToast}
            />

            {/* Help & Knowledge Base */}
            <HelpPanel isAdmin={isAdmin} />



            <div ref={notifRef} className="relative">
              <button
                id="notif-bell-btn"
                onClick={() => { setNotifOpen(o => !o); if (!notifOpen && unreadCount > 0) { } }}
                className="relative p-2 rounded-xl text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                title="Notifications"
              >
                <Bell size={20} className={hasNewArrival ? "bell-ring" : ""} />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-0.5 shadow-md animate-pulse">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <>
                  {/* Mobile backdrop */}
                  <div className="fixed inset-0 z-[199] sm:hidden" onClick={() => setNotifOpen(false)} />
                  <div
                    className="fixed inset-x-0 top-[64px] bottom-0 sm:bottom-auto sm:inset-x-auto sm:absolute sm:top-full sm:mt-2 sm:left-auto sm:right-0 z-[200] sm:w-[370px] bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 sm:border sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5"><Bell size={14} /> Notifications
                        {unreadCount > 0 && <span className="ml-2 text-[10px] bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 px-1.5 py-0.5 rounded-full font-bold">{unreadCount} new</span>}
                      </h3>
                      <div className="flex items-center gap-2">
                        {unreadCount > 0 && (
                          <button onClick={markAllRead} className="text-xs text-indigo-500 hover:text-indigo-700 font-medium transition-colors">Mark all read</button>
                        )}
                        {notifications.length > 0 && (
                          <button onClick={clearAllNotifs} className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors" title="Clear all notifications">Clear all</button>
                        )}
                      </div>
                    </div>

                    {/* List — scrolls freely on mobile (full height), capped on desktop */}
                    <div className="flex-1 overflow-y-auto sm:max-h-[420px] divide-y divide-gray-100 dark:divide-gray-700/60">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-10 text-center">
                          <Bell size={28} className="text-gray-300 mb-2" />
                          <p className="text-sm text-gray-400">You're all caught up!</p>
                        </div>
                      ) : notifications.map(n => (
                        <div
                          key={n.id}
                          className={`group relative flex items-start gap-3 px-4 py-3 transition-colors ${n.isRead ? "hover:bg-gray-50 dark:hover:bg-gray-700/30" : "bg-indigo-50/40 dark:bg-indigo-900/10 hover:bg-indigo-50/70 dark:hover:bg-indigo-900/20"}`}
                        >
                          {/* Clickable main area */}
                          <button
                            onClick={() => markOneRead(n.id, n.type, n.resourceId, n.resourceDate)}
                            className="flex items-start gap-3 flex-1 min-w-0 text-left"
                            title={`Open ${n.type === "new_song" ? "song" : n.type === "access_request" ? "admin panel" : "event"}`}
                          >
                            {/* Actor photo */}
                            <div className="shrink-0 mt-0.5">
                              {n.actorPhoto
                                ? <img src={n.actorPhoto} alt={n.actorName} className="w-8 h-8 rounded-full border-2 border-indigo-400 object-cover" />
                                : <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white">{notifIcon[n.type] || <Bell size={14} />}</div>
                              }
                            </div>
                            <div className="flex-1 min-w-0 pr-6">
                              <div className="flex items-start gap-1">
                                <p className="text-xs font-semibold text-gray-900 dark:text-white leading-tight flex-1">{n.message}</p>
                                {!n.isRead && <span className="shrink-0 w-2 h-2 rounded-full bg-indigo-500 mt-1" />}
                              </div>
                              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">{n.subMessage}</p>
                              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{timeAgo(n.createdAt)}</p>
                            </div>
                          </button>

                          {/* Per-item action menu button */}
                          <div className="absolute right-3 top-3">
                            <button
                              onClick={(e) => { e.stopPropagation(); setNotifActionFor(notifActionFor === n.id ? null : n.id); }}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-all text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                              title="More options"
                            >
                              <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><circle cx="8" cy="2" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="14" r="1.5" /></svg>
                            </button>
                            {notifActionFor === n.id && (
                              <div className="absolute right-0 top-6 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg z-10 overflow-hidden min-w-[140px]">
                                {n.isRead ? (
                                  <button onClick={() => markOneUnread(n.id)} className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center gap-2">
                                    <span>🔵</span> Mark as unread
                                  </button>
                                ) : (
                                  <button onClick={() => { setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, isRead: true } : x)); setNotifActionFor(null); fetch("/api/notifications/read", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user?.uid, notifId: n.id }) }); }} className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center gap-2">
                                    <CheckCircle size={13} /> Mark as read
                                  </button>
                                )}
                                <button onClick={() => deleteNotif(n.id)} className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
                                  <Trash2 size={13} /> Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

            </div>
            <UserMenu simulatedRole={simulatedRole} onRoleSwitch={handleRoleSwitch} />
          </div>
        </header>


        {/* Content Area */}
        <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
          <div className="flex flex-col h-full">
            <div key={currentView} className="view-enter flex-1 p-4 sm:p-6 overflow-auto">
              <Suspense fallback={
                <div className="flex items-center justify-center h-64">
                  <div className="flex items-center gap-3 text-gray-400">
                    <Loader2 size={20} className="animate-spin" />
                    <span className="text-sm">Loading…</span>
                  </div>
                </div>
              }>


              {/* ══════════════════════════════════════════════════════════════
                   DASHBOARD VIEW
              ══════════════════════════════════════════════════════════════ */}
              {currentView === "dashboard" ? (
                <DashboardView
                  allSongs={allSongs}
                  allMembers={allMembers}
                  allSchedules={allSchedules}
                  dashboardNotes={dashboardNotes}
                  isAdmin={isAdmin}
                  authStatus={authStatus}
                  effectiveRole={effectiveRole}
                  canAddSong={canAddSong}
                  canWriteSchedule={canWriteSchedule}
                  canAddMember={canAddMember}
                  user={user}
                  showToast={showToast}
                  setCurrentView={setCurrentView}
                  onOpenLineup={() => setLineupOpen(true)}
                  lineupTrackCount={lineupTracks.length}
                />
              ) : null}


              {/* ══════════════════════════════════════════════════════════════
                   SCHEDULING VIEW
              ══════════════════════════════════════════════════════════════ */}
              {currentView === "schedule" ? (
                <ScheduleView
                  allSchedules={allSchedules}
                  setAllSchedules={setAllSchedules}
                  allMembers={allMembers}
                  allSongs={allSongs}
                  birthdayMap={birthdayMap}
                  isAdmin={isAdmin}
                  isLeader={isLeader}
                  isPlanningLead={isPlanningLead}
                  canWriteSchedule={canWriteSchedule}
                  user={user}
                  showToast={showToast}
                  showConfirm={showConfirm}
                  closeConfirm={closeConfirm}
                  deepLinkEventId={pendingDeepLinkEventId}
                  deepLinkEventDate={pendingDeepLinkEventDate}
                  onDeepLinkHandled={() => {
                    setPendingDeepLinkEventId(null);
                    setPendingDeepLinkEventDate(null);
                  }}
                   onOpenVideo={openVideo}
                />
              ) : null}

              {/* ══════════════════════════════════════════════════════════════
                   ADMIN PANEL VIEW
              ══════════════════════════════════════════════════════════════ */}
              {currentView === "playground" ? (
                /* ══════════════════════════════════════════════════
                     PLAYGROUND — admin only sandbox
                ══════════════════════════════════════════════════ */
                isRoleAdmin ? <Playground allMembers={allMembers} onToast={showToast} /> : null
              ) : currentView === "team-notes" ? (
                <TeamNotesView
                  userId={user?.uid ?? ""}
                  userName={user?.displayName ?? user?.email ?? "Unknown"}
                  userPhoto={user?.photoURL ?? ""}
                  userRole={userRole}
                  onToast={showToast}
                />
              ) : currentView === "admin" ? (
                <AdminPanel
                  onToast={showToast}
                  onConfirm={(msg, onOk) => showConfirm({
                    title: "Are you sure?",
                    message: msg,
                    confirmText: "Confirm",
                    confirmClass: "bg-red-600 hover:bg-red-700 text-white",
                    onConfirm: () => { closeConfirm(); onOk(); },
                  })}
                />
              ) : currentView === "members" ? (
                <MembersView
                  allMembers={allMembers}
                  setAllMembers={setAllMembers}
                  isLoadingMembers={isLoadingMembers}
                  setIsLoadingMembers={setIsLoadingMembers}
                  isAdmin={isAdmin}
                  isLeader={isLeader}
                  canWriteMembers={canWriteMembers}
                  canAddMember={canAddMember}
                  canEditMember={canEditMember}
                  canDeleteMember={canDeleteMember}
                  myMemberProfile={myMemberProfile}
                  user={user}
                  showToast={showToast}
                  showConfirm={showConfirm}
                  closeConfirm={closeConfirm}
                />
              ) : currentView === "songs" ? (
                <SongsView
                  allSongs={allSongs}
                  setAllSongs={setAllSongs}
                  tags={tags}
                  setTags={setTags}
                  isLoadingSongs={isLoadingSongs}
                  setIsLoadingSongs={setIsLoadingSongs}
                  allMembers={allMembers}
                  isAdmin={isAdmin}
                  canAddSong={canAddSong}
                  canEditSong={canEditSong}
                  canDeleteSong={canDeleteSong}
                  user={user}
                  showToast={showToast}
                  showConfirm={showConfirm}
                  closeConfirm={closeConfirm}
                  pendingNavSongId={pendingNavSongId}
                  onPendingNavHandled={() => setPendingNavSongId(null)}
                  onOpenVideo={openVideo}
                />
              ) : null}
              </Suspense>
            </div>
          </div>
        </main>
      </div>

      {/* ── Toast Notification Stack ──────────────────────────────────────── */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => {
          const styles = {
            success: { bar: "bg-emerald-500", icon: "✓", text: "text-emerald-400" },
            error: { bar: "bg-red-500", icon: "✕", text: "text-red-400" },
            warning: { bar: "bg-amber-500", icon: "!", text: "text-amber-400" },
            info: { bar: "bg-indigo-500", icon: "i", text: "text-indigo-400" },
          }[toast.type];
          return (
            <div
              key={toast.id}
              className="pointer-events-auto flex items-start gap-3 min-w-[280px] max-w-[360px] bg-gray-900/95 dark:bg-gray-950/95 backdrop-blur border border-white/10 rounded-xl shadow-2xl px-4 py-3 animate-[slideInRight_0.25s_ease-out]"
              style={{ animation: "slideInRight 0.25s ease-out" }}
            >
              <span className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full ${styles.bar} flex items-center justify-center text-white text-[11px] font-bold`}>
                {styles.icon}
              </span>
              <p className="text-sm text-gray-100 leading-snug flex-1">{toast.message}</p>
              <button
                onClick={() => dismissToast(toast.id)}
                className="flex-shrink-0 text-gray-500 hover:text-gray-200 transition-colors ml-1"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Confirm Dialog ────────────────────────────────────────────────── */}
      {confirmConfig && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeConfirm}
          />
          {/* Panel */}
          <div className="relative w-full max-w-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-200 dark:border-white/10">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{confirmConfig.title}</h2>
              <button
                onClick={closeConfirm}
                className="text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>
            {/* Body */}
            <div className="px-6 py-5 space-y-2">
              <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">{confirmConfig.message}</p>
              {confirmConfig.detail && (
                <p className="text-gray-500 dark:text-gray-400 text-sm font-semibold">{confirmConfig.detail}</p>
              )}
            </div>
            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 pb-6">
              <button
                onClick={closeConfirm}
                className="px-5 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition-colors rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmConfig.onConfirm}
                className={`px-5 py-2 text-sm text-white rounded-xl font-semibold transition-colors ${confirmConfig.confirmClass || "bg-red-500 hover:bg-red-600"}`}
              >
                {confirmConfig.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Global Floating Video Player ────────────────────────────────────
           Lives in App so it persists across ALL module navigations.
           The iframe is always-mounted while a video is open — toggling
           between full-modal and mini-player never restarts playback.
      ──────────────────────────────────────────────────────────────────── */}
      {videoModal && (
        <>
          {/* Backdrop — only in full-modal mode */}
          {!miniPlayer && (
            <div
              className="fixed inset-0 z-[9998] bg-black/80 backdrop-blur-sm"
              onClick={() => setMiniPlayer(true)}
            />
          )}

          {/* Player card */}
          <div
            className={`fixed z-[9999] bg-black shadow-2xl transition-all duration-300 ease-in-out ${
              miniPlayer
                ? "bottom-4 right-4 w-72 rounded-2xl"
                : "rounded-2xl"
            }`}
            style={miniPlayer
              ? {}
              : { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "min(90vw, 896px)" }
            }
          >
            {/* Header */}
            <div className={`flex items-center justify-between bg-gray-900 ${miniPlayer ? "px-3 py-2 rounded-t-2xl" : "px-4 py-2.5 rounded-t-2xl"}`}>
              <span className={`font-medium text-white/70 truncate mr-2 ${miniPlayer ? "text-xs" : "text-sm font-semibold text-white/80"}`}>
                Now Playing
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {/* Loop toggle — full mode only */}
                {!miniPlayer && (
                  <button
                    onClick={() => setLoopVideo(v => !v)}
                    title={loopVideo ? "Loop ON — click to turn off" : "Loop OFF — click to turn on"}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-all ${
                      loopVideo
                        ? "bg-indigo-600 border-indigo-500 text-white"
                        : "border-white/20 text-white/50 hover:text-white/80 hover:border-white/40"
                    }`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0">
                      <polyline points="17 1 21 5 17 9" />
                      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                      <polyline points="7 23 3 19 7 15" />
                      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                    </svg>
                    {loopVideo ? "Loop ON" : "Loop"}
                  </button>
                )}
                {/* Open in YouTube — full mode only */}
                {!miniPlayer && (
                  <a href={videoModal} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                    Open in YouTube ↗
                  </a>
                )}
                {/* Minimize / Maximize */}
                <button
                  onClick={() => setMiniPlayer(v => !v)}
                  title={miniPlayer ? "Expand" : "Minimize — keep playing while you browse"}
                  className="p-1 rounded-full hover:bg-white/10 transition-colors text-white/60 hover:text-white"
                >
                  {miniPlayer ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                      <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                      <line x1="10" y1="14" x2="3" y2="21" /><line x1="21" y1="3" x2="14" y2="10" />
                    </svg>
                  )}
                </button>
                {/* Close */}
                <button
                  onClick={closeVideo}
                  className="p-1 rounded-full hover:bg-white/10 transition-colors text-white/60 hover:text-white"
                  aria-label="Close video"
                >
                  <X size={miniPlayer ? 14 : 18} />
                </button>
              </div>
            </div>
            {/* 16:9 iframe — always mounted, video never restarts */}
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
              <iframe
                src={getYoutubeEmbed(videoModal, loopVideo)}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full border-0 rounded-b-2xl"
                title="Now Playing"
              />
            </div>
          </div>
        </>
      )}

      {/* ── Lineup Playlist Player ──────────────────────────────────────────
           Lives at App root so it persists across ALL module navigations.
      ─────────────────────────────────────────────────────────────────────── */}
      {lineupOpen && lineupTracks.length > 0 && (
        <LineupPlayer
          tracks={lineupTracks}
          currentUser={{ uid: user?.uid ?? "", name: user?.displayName ?? user?.email ?? "Team Member", photo: user?.photoURL ?? "" } as CurrentUser}
          onClose={() => setLineupOpen(false)}
        />
      )}

    </div >
  );
}
