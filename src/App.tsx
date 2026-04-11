import React, { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from "react";

import { useAuth } from "./AuthContext";
import { getAuth } from "firebase/auth";
import { usePushNotifications } from "./usePushNotifications";
import { useRealtimeNotifications } from "./useRealtimeNotifications";
import { useSessionTracking } from "./useSessionTracking";


// ── Lightweight always-loaded components ────────────────────────────────────
import BroadcastOverlay from "./BroadcastOverlay";
import WelcomeToast from "./WelcomeToast";

import BirthdatePromptModal from "./BirthdatePromptModal";
import ProfileSetupModal from "./ProfileSetupModal";

// ── Heavy views — lazy-loaded on first visit (code splitting) ────────────────
const AdminPanel    = lazy(() => import("./AdminPanel"));
const HelpPanel     = lazy(() => import("./HelpPanel"));
const ChatWidget    = lazy(() => import("./ChatWidget"));
const NotesPanel    = lazy(() => import("./NotesPanel"));
const Dashboard     = lazy(() => import("./Dashboard"));
const DashboardView = lazy(() => import("./DashboardView"));
const Playground    = lazy(() => import("./Playground"));
const PlannerView      = lazy(() => import("./Planner"));
const RehearsalView    = lazy(() => import("./RehearsalView"));
const ScheduleView     = lazy(() => import("./ScheduleView"));
const SongsView        = lazy(() => import("./SongsView"));
const MembersView      = lazy(() => import("./MembersView"));
const TeamNotesView    = lazy(() => import("./TeamNotesView"));
const FreedomWallView  = lazy(() => import("./FreedomWallView"));
const PreachingView       = lazy(() => import("./PreachingView"));
const DesignRequestsView  = lazy(() => import("./DesignRequestsView"));
// AutoTextarea & DatePicker are tiny UI primitives — import statically to avoid extra chunk round-trips
import AutoTextarea from "./AutoTextarea";
import DatePicker from "./DatePicker";

import { Music, Search, Plus, Edit, Trash2, X, Save, Tag as TagIcon, Menu, ChevronLeft, ChevronRight, ChevronDown, Moon, Sun, ImagePlus, Loader2, ExternalLink, CheckSquare, Check, Filter, Users, Calendar, Phone, UserPlus, Camera, BookOpen, LayoutGrid, Mic2, Copy, Pencil, Shield, Mail, Bell, Lock, AlertTriangle, CheckCircle, HelpCircle, FlaskConical, NotebookPen, SquareKanban, Feather, Palette } from "lucide-react";
import { Song, Tag, Member, ScheduleMember, Schedule } from "./types";
import LineupPlayer, { LineupTrack, CurrentUser } from "./LineupPlayer";
import SongsLibraryPlayer, { LibraryTrack } from "./SongsLibraryPlayer";


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

function UserMenu({ simulatedRole, onRoleSwitch, plannerAccess }: { simulatedRole: string; onRoleSwitch: (r: string) => void; plannerAccess?: boolean }) {
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
          ? (
            <div className={plannerAccess ? 'planner-ring-avatar shrink-0' : 'relative shrink-0'}>
              {/* Admin bouncing crown */}
              {isAdminUserMenu && (
                <span
                  className="crown-bounce"
                  style={{
                    position: 'absolute',
                    top: -13,
                    left: '50%',
                    fontSize: 13,
                    lineHeight: 1,
                    zIndex: 10,
                    pointerEvents: 'none',
                    userSelect: 'none',
                  }}
                >👑</span>
              )}

              <img
                src={user.photoURL}
                alt={user.displayName ?? ""}
                className="rounded-full object-cover block"
                style={{
                  width: 32,
                  height: 32,
                  border: plannerAccess ? 'none' : '2px solid var(--wf-c1-hex)',
                  position: 'relative',
                  zIndex: 1,
                  flexShrink: 0,
                }}
              />
            </div>
          )
          : <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-semibold">{user.displayName?.[0] ?? user.email?.[0]?.toUpperCase()}</div>
        }
        <ChevronDown size={14} className="text-gray-400 hidden sm:block" />
      </button>
      {open && (
        <div className="fixed top-[64px] sm:absolute sm:top-full sm:mt-2 right-2 sm:right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 py-1 overflow-hidden dropdown-enter" style={{ width: "min(256px, calc(100vw - 1rem))" }}>
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
              {plannerAccess && (
                <span className="relative group/pfabadge flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(168,85,247,0.15), rgba(236,72,153,0.15))', border: '1px solid rgba(168,85,247,0.35)' }}>
                  <SquareKanban size={10} style={{ color: '#a855f7', filter: 'drop-shadow(0 0 4px #a855f7aa)' }} />
                  <span style={{ background: 'linear-gradient(90deg, #a855f7, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  Ministry Hub Full Access
                  </span>
                  <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded-lg bg-gray-900 text-white text-[10px] font-semibold whitespace-nowrap opacity-0 group-hover/pfabadge:opacity-100 transition-opacity z-50 shadow-lg">
                    Full Ministry Hub access granted by Admin
                  </span>
                </span>
              )}

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

  // Bug fix: sidebar should NEVER be collapsed on mobile — reset state when below lg breakpoint
  useEffect(() => {
    const checkMobile = () => {
      if (window.innerWidth < 1024) setIsSidebarCollapsed(false);
    };
    checkMobile(); // run on mount
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [currentView, setCurrentView] = useState<"dashboard" | "songs" | "members" | "schedule" | "playground" | "admin" | "team-notes" | "rehearsal" | "freedom-wall" | "preaching" | "design-requests">("dashboard");
  // Bump this key every time user navigates to Design Requests — forces a remount + fresh fetch
  const [designRequestsKey, setDesignRequestsKey] = useState(0);
  useEffect(() => { if (currentView === "design-requests") setDesignRequestsKey(k => k + 1); }, [currentView]);

  // ── New-module glow: glows until user first visits the module ────────────
  // To add a future new module: add a new useState with its own localStorage key
  const [unseenPlanner, setUnseenPlanner] = useState(() => !localStorage.getItem("wf_seen_planner"));
  const [unseenFreedomWall, setUnseenFreedomWall] = useState(() => !localStorage.getItem("wf_seen_freedom_wall"));
  const [unseenPreaching, setUnseenPreaching] = useState(() => !localStorage.getItem("wf_seen_preaching"));
  const [unseenDesignRequests, setUnseenDesignRequests] = useState(() => !localStorage.getItem("wf_seen_design_requests"));
  const markPlannerSeen = () => { if (unseenPlanner) { localStorage.setItem("wf_seen_planner", "1"); setUnseenPlanner(false); } };
  const markFreedomWallSeen = () => { if (unseenFreedomWall) { localStorage.setItem("wf_seen_freedom_wall", "1"); setUnseenFreedomWall(false); } };
  const markPreachingSeen = () => { if (unseenPreaching) { localStorage.setItem("wf_seen_preaching", "1"); setUnseenPreaching(false); } };
  const markDesignRequestsSeen = () => { if (unseenDesignRequests) { localStorage.setItem("wf_seen_design_requests", "1"); setUnseenDesignRequests(false); } };

  // ── Planner deep-link state (from calendar task card ⇒ open specific card) ──
  const [pendingPlannerBoardId, setPendingPlannerBoardId] = useState<string | null>(null);
  const [pendingPlannerCardId, setPendingPlannerCardId] = useState<string | null>(null);

  // 📱 Auto-open mobile sidebar when there are unseen new modules
  // Only on mobile (< 1024px). Stops once all modules are seen.
  useEffect(() => {
    const hasUnseen = unseenPlanner || unseenFreedomWall || unseenPreaching || unseenDesignRequests;
    if (hasUnseen && window.innerWidth < 1024) {
      // Small delay so the app finishes the initial render before sliding the drawer open
      const t = setTimeout(() => setIsMobileMenuOpen(true), 400);
      return () => clearTimeout(t);
    }
  }, []); // run once on mount only
  const [pendingTeamNoteId, setPendingTeamNoteId] = useState<string | null>(null); // deep-link into Team Notes
  const [pendingPreachingTab, setPendingPreachingTab] = useState<'drafts' | 'submitted' | null>(null); // deep-link: force Submitted tab
  const [pendingDesignDraftId, setPendingDesignDraftId] = useState<string | null>(null); // deep-link: highlight card in Design Requests

  /** True when SongsView is displaying a song detail panel (not the list) */
  const [isSongDetailOpen, setIsSongDetailOpen] = useState(false);
  /** Incrementing this tells SongsView to clear its selectedSong */
  const [clearSelectionSignal, setClearSelectionSignal] = useState(0);
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
  const { showPrompt: showPushPrompt, showForcedModal: showForcedPushModal, requestPushPermission, dismissPrompt: dismissPushPrompt, dismissForcedModal: dismissForcedPushModal } =
    usePushNotifications(user?.uid ?? null, userRole ?? null);

  // 👉 Poke — poll every 5s for incoming pokes from admin
  const [activePoke, setActivePoke] = useState<{ fromName: string; fromPhoto: string; message: string } | null>(null);
  useEffect(() => {
    if (!user?.uid) return;
    const checkPokes = async () => {
      try {
        const res = await fetch(`/api/poke/pending?userId=${user.uid}`);
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const latest = data[data.length - 1];
          setActivePoke({ fromName: latest.fromName, fromPhoto: latest.fromPhoto, message: latest.message });
        }
      } catch { /* silent */ }
    };
    checkPokes();
    const id = setInterval(checkPokes, 60_000); // 60s — aligned with notification poll (was 15s, 4× more calls)
    return () => clearInterval(id);
  }, [user?.uid]);

  // 📊 Session tracking — writes presence + session history for Admin Activity Monitor
  useSessionTracking(
    user?.uid ?? null,
    user?.displayName ?? null,
    user?.email ?? null,
    userRole ?? null,
    user?.photoURL ?? null,
    currentView,   // ← kept in sync so admin sees the user's last active section
  );

  // 🔗 Deep-link from email: read ?notif=new_event&id=...&date=... on first auth
  // The "View Schedule →" email button lands here — navigate to the right view and strip params.
  useEffect(() => {
    if (!user) return; // wait until authenticated
    const params = new URLSearchParams(window.location.search);
    const notif  = params.get("notif");
    const id     = params.get("id");
    const date   = params.get("date");
    if (!notif) return; // no deep-link params, nothing to do
    // Navigate based on notif type
    if ((notif === "new_event" || notif === "updated_event") && id && date) {
      setCurrentView("schedule");
      setPendingDeepLinkEventId(id);
      setPendingDeepLinkEventDate(date);
    } else if (notif === "new_song" && id) {
      setCurrentView("songs");
      setPendingNavSongId(id);
    } else if (notif === "access_request") {
      setCurrentView("admin");
    }
    // Strip params from URL bar so refresh doesn't re-trigger navigation
    window.history.replaceState({}, "", window.location.pathname);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]); // run once when user first becomes available

  // 🎸 Auto-collapse sidebar when entering Rehearsal mode (needs full width)
  // Desktop/tablet only  — on mobile the sidebar is already a drawer overlay
  useEffect(() => {
    if ((currentView === "rehearsal" || currentView === "freedom-wall") && window.innerWidth >= 1024) {
      setIsSidebarCollapsed(true);
    }
  }, [currentView]);

  // 🗂️ Auto-collapse sidebar when a Playground card modal opens (desktop only)
  useEffect(() => {
    const onCardOpen = () => { if (window.innerWidth >= 1024) setIsSidebarCollapsed(true); };
    window.addEventListener('pg-card-open', onCardOpen);
    return () => window.removeEventListener('pg-card-open', onCardOpen);
  }, []);

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
    } else if (["team_note", "note_resolved", "note_done", "note_acknowledged", "note_followup"].includes(type)) {
      // Navigate to the Team Notes module and deep-link to the specific note
      setCurrentView("team-notes");
      if (resourceId) setPendingTeamNoteId(resourceId);
    } else if (type === "new_design_request") {
      // Audio/Tech: go to Design Requests and highlight the specific sermon card
      setCurrentView("design-requests");
      if (resourceId) setPendingDesignDraftId(resourceId);
    } else if (type === "design_claimed" || type === "design_done") {
      // Preacher: go to Preaching module → force Submitted tab so they see the status badge
      setCurrentView("preaching");
      setPendingPreachingTab("submitted");
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
    note_resolved: <CheckCircle size={14} className="text-green-400" />,
    note_done: <CheckCircle size={14} className="text-indigo-400" />,
    note_acknowledged: <CheckCircle size={14} className="text-sky-400" />,
    note_followup: <Bell size={14} className="text-amber-400" />,
    new_design_request: <Palette size={14} className="text-purple-400" />,
    design_claimed: <Feather size={14} className="text-purple-400" />,
    design_done: <CheckCircle size={14} className="text-emerald-400" />,
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
  const canAddMember_base = isRoleAdmin || isQARole;                     // Admin + QA Specialist
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
  // Parse once — reused by allSongs, isLoadingSongs, and tags initialisers
  const _songsCacheRaw = (() => { try { return JSON.parse(localStorage.getItem("wf_songs_cache") || "null"); } catch { return null; } })();
  const _songsCacheFresh = !!_songsCacheRaw && Date.now() - (_songsCacheRaw.ts ?? 0) < 30 * 60 * 1000;

  const [allSongs, setAllSongs] = useState<Song[]>(() =>
    _songsCacheFresh && Array.isArray(_songsCacheRaw.songs) ? _songsCacheRaw.songs : []
  );
  const [isLoadingSongs, setIsLoadingSongs] = useState(() => !_songsCacheFresh);
  const [tags, setTags] = useState<Tag[]>(() =>
    _songsCacheFresh && Array.isArray(_songsCacheRaw.tags) ? _songsCacheRaw.tags : []
  );

  // Capture initial freshness in a ref so the boot effect can reuse them
  // without re-reading localStorage (avoids 6 duplicate reads per page load).
  const _initCacheFreshRef = useRef({ songs: _songsCacheFresh });

  // ── Lineup playlist player ────────────────────────────────────────────────
  const [lineupOpen, setLineupOpen] = useState(false);

  // ── Songs Library player (lifted here so it persists across all views) ───
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryStartIndex, setLibraryStartIndex] = useState(0);

  const songsWithVideo = useMemo<LibraryTrack[]>(() =>
    allSongs
      .filter(s => !!s.video_url)
      .map(s => ({ id: s.id, title: s.title, artist: s.artist ?? "", videoUrl: s.video_url! })),
    [allSongs]
  );

  const openLibraryPlayer = (songId?: string) => {
    if (songsWithVideo.length === 0) return;
    // Conflict guard: lineup player is already open
    if (lineupOpen) {
showToast("warning", "️ Another player is active. Please close the Lineup Player first.");
      return;
    }
    const idx = songId ? songsWithVideo.findIndex(t => t.id === songId) : 0;
    setLibraryStartIndex(idx >= 0 ? idx : 0);
    setLibraryOpen(true);
  };

  const openLineupPlayer = () => {
    // Conflict guard: library player is already open
    if (libraryOpen) {
showToast("warning", "️ Another player is active. Please close the Song Library Player first.");
      return;
    }
    setLineupOpen(true);
  };

  // All songs assigned to the lineup (joyful + solemn) for the relevant upcoming event.
  // Used for the button count — includes songs even if they have no video_url.
  const { lineupTracks, lineupSongCount } = React.useMemo(() => {
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

    let songCount = 0;
    const tracks: LineupTrack[] = [];
    relevant.forEach(ev => {
      if (ev.songLineup?.joyful) {
        const song = allSongs.find(s => s.id === ev.songLineup!.joyful);
        if (song) {
          songCount++;
          // Only add to playable tracks if it has a video
          if (song.video_url) tracks.push({ songId: song.id, title: song.title, artist: song.artist ?? "", videoUrl: song.video_url, mood: "joyful", eventName: ev.eventName ?? "Service", eventDate: ev.date, serviceType: ev.serviceType });
        }
      }
      if (ev.songLineup?.solemn) {
        const song = allSongs.find(s => s.id === ev.songLineup!.solemn);
        if (song) {
          songCount++;
          if (song.video_url) tracks.push({ songId: song.id, title: song.title, artist: song.artist ?? "", videoUrl: song.video_url, mood: "solemn", eventName: ev.eventName ?? "Service", eventDate: ev.date, serviceType: ev.serviceType });
        }
      }
    });
    return { lineupTracks: tracks, lineupSongCount: songCount };
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

  // ── Profile check: ONLY mark ready once allMembers actually has loaded data ──
  // Reactive watcher (not a timer) — avoids race where timer fires before
  // network fetch completes and myMemberProfile is temporarily null.
  const [profileCheckReady, setProfileCheckReady] = useState(false);
  useEffect(() => {
    if (allMembers.length > 0 && !profileCheckReady) {
      setProfileCheckReady(true);
    }
  }, [allMembers]); // fires whenever allMembers updates

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
    // ── Hard reset: if user hasn't visited in 12+ hours, wipe all caches ──────
    // This handles returning users (overnight / 3+ days) so first render is
    // always fresh — no grey buttons, no missing birthdays.
    const HARD_RESET_MS = 12 * 60 * 60 * 1000;
    const lastActive = Number(localStorage.getItem("wf_last_active") ?? "0");
    const didHardReset = Date.now() - lastActive > HARD_RESET_MS;
    if (didHardReset) {
      ["wf_songs_cache", "wf_members_cache", "wf_schedules_cache",
       "wf_schedules_cache_ts", "wf_notes_cache"].forEach(k => {
        try { localStorage.removeItem(k); } catch { /* noop */ }
      });
    }
    try { localStorage.setItem("wf_last_active", Date.now().toString()); } catch { /* noop */ }

    // ── Boot prefetch: skip if localStorage cache is still fresh ───────────────
    // After a hard reset all caches are wiped, so we must fetch everything.
    // Otherwise reuse the freshness flags already evaluated at render time
    // (stored in _initCacheFreshRef) to avoid re-reading localStorage.
    const isSongsCacheFresh = !didHardReset && _initCacheFreshRef.current.songs;
    const isMembersCacheFresh = !didHardReset && (() => {
      try { const { ts } = JSON.parse(localStorage.getItem("wf_members_cache") || "{}"); return Date.now() - ts < 20 * 60 * 1000; } catch { return false; }
    })();
    const isSchedulesCacheFresh = !didHardReset && (() => {
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

  /** True when logged-in user has no team member profile yet → show setup modal.
   *  Guard allMembers.length > 0 prevents false-positive while members are loading. */
  const needsProfileSetup = profileCheckReady && !!user && !myMemberProfile && allMembers.length > 0;

  /** Final canAddMember: base admin/QA OR no profile yet (self-register case) */
  const canAddMember = canAddMember_base || needsProfileSetup;

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

      {/* 🔔 Forced Push Notification Modal — shows after 2 skips, every session until enabled */}
      {showForcedPushModal && (
        <div className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-4 sm:pb-0">
          <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700">
            {/* Top gradient strip */}
            <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

            <div className="px-6 pt-6 pb-7 space-y-5">
              {/* Icon + heading */}
              <div className="flex flex-col items-center text-center gap-3">
                <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                  <Bell size={30} className="text-white" />
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 border-2 border-white dark:border-gray-900 animate-pulse" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Enable Notifications</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-snug">
                    Stay in sync with your team — don't miss a beat.
                  </p>
                </div>
              </div>

              {/* Benefit bullets */}
              <ul className="space-y-2.5">
                {[
                  { icon: "📣", text: "Get instant alerts when an Assembly Call is triggered" },
                  { icon: "🎵", text: "Know when new songs or setlists are added" },
                  { icon: "📅", text: "Never miss schedule updates or event changes" },
                  { icon: "📬", text: "Receive team broadcasts even when the app is closed" },
                ].map(({ icon, text }) => (
                  <li key={text} className="flex items-start gap-2.5">
                    <span className="text-base shrink-0 mt-0.5">{icon}</span>
                    <span className="text-sm text-gray-600 dark:text-gray-300 leading-snug">{text}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                onClick={requestPushPermission}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <Bell size={16} />
                Enable Notifications
              </button>

              {/* Low-key skip */}
              <button
                onClick={dismissForcedPushModal}
                className="w-full text-center text-xs text-gray-400 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-500 transition-colors py-1"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 👉 POKE RECEIVED — funny centered interrupt */}
      {activePoke && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="w-full max-w-xs bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700 text-center">
            {/* Rainbow top bar */}
            <div className="h-2 w-full bg-gradient-to-r from-pink-500 via-yellow-400 to-indigo-500" />

            <div className="px-6 pt-6 pb-7 space-y-4">
              {/* Bouncing poke finger + sender avatar */}
              <div className="flex flex-col items-center gap-3">
                <span className="text-5xl select-none animate-bounce">👉</span>
                {activePoke.fromPhoto
                  ? <img src={activePoke.fromPhoto} alt={activePoke.fromName} className="w-14 h-14 rounded-full ring-4 ring-indigo-400 object-cover" />
                  : <div className="w-14 h-14 rounded-full bg-indigo-200 dark:bg-indigo-800 flex items-center justify-center text-2xl font-bold text-indigo-700 dark:text-indigo-300">{activePoke.fromName?.[0]?.toUpperCase() ?? "?"}</div>
                }
              </div>

              {/* Text */}
              <div>
                <p className="text-base font-bold text-gray-900 dark:text-white">
                  {activePoke.fromName} poked you! 😳
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-snug">{activePoke.message}</p>
              </div>

              {/* Dismiss */}
              <button
                onClick={() => setActivePoke(null)}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-pink-500 to-indigo-500 text-white font-bold text-sm shadow-lg active:scale-95 transition-all"
              >
                😂 Got it!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 👤 Profile Setup — blocks UI for users who haven't created their Team Member profile yet */}
      {needsProfileSetup && (
        <ProfileSetupModal
          user={user}
          onSuccess={(newMember) => {
            // newMember now contains the full submitted payload + server id
            // Normalise email to lowercase so myMemberProfile (email match) resolves immediately
            // → needsProfileSetup flips false → modal closes without waiting for a re-fetch
            setAllMembers(prev => [
              ...prev,
              {
                id: newMember.id ?? `tmp-${Date.now()}`,
                ...newMember,
                email: (newMember.email || user?.email || "").trim().toLowerCase(),
              },
            ]);
          }}
        />
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
      <div className={`fixed lg:static inset-y-0 left-0 z-30 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col transition-all duration-300 transform overflow-x-visible ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} ${isSidebarCollapsed ? "w-20" : "w-64"}`}>

        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between h-16">
          <div className={`flex items-center gap-2 overflow-hidden whitespace-nowrap ${isSidebarCollapsed ? "justify-center w-full" : ""}`}>
            <img src="/icon-192x192.png" alt="WorshipFlow" className="w-8 h-8 shrink-0 shadow-md" />
            {!isSidebarCollapsed && <span className="text-xl font-bold dark:text-white">WorshipFlow</span>}
          </div>
          <button
            className="lg:hidden p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto overflow-x-hidden">
          {!isSidebarCollapsed && (
            <p className="px-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 mt-2">Worship</p>
          )}

          {/* Dashboard — available to all roles */}
          <div className="relative group/tip">
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
            {isSidebarCollapsed && <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity z-50 shadow-lg">Dashboard</span>}
          </div>


          {/* Song Management */}
          <div className="relative group/tip">
            <button
              onClick={() => { setCurrentView("songs"); setIsMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors font-medium ${currentView === "songs"
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                } ${isSidebarCollapsed ? "justify-center" : ""}`}
              title="Song Management"
            >
              <Music size={20} className="shrink-0" />
              {!isSidebarCollapsed && <span>Song Management</span>}
            </button>
            {isSidebarCollapsed && <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity z-50 shadow-lg">Song Management</span>}
          </div>

          {/* Team Members */}
          <div className="relative group/tip">
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
            {isSidebarCollapsed && <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity z-50 shadow-lg">Team Members</span>}
          </div>

          {/* Scheduling */}
          <div className="relative group/tip">
            <button
              onClick={() => { setCurrentView("schedule"); setIsMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors font-medium ${currentView === "schedule"
                ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:white"
                } ${isSidebarCollapsed ? "justify-center" : ""}`}
              title="Scheduling"
            >
              <Calendar size={20} className="shrink-0" />
              {!isSidebarCollapsed && <span>Scheduling</span>}
            </button>
            {isSidebarCollapsed && <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity z-50 shadow-lg">Scheduling</span>}
          </div>

          {/* Notes */}
          <div className="relative group/tip">
            <button
              onClick={() => { setCurrentView("team-notes"); setIsMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors font-medium ${currentView === "team-notes"
                ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:white"
                } ${isSidebarCollapsed ? "justify-center" : ""}`}
              title="Notes"
            >
              <NotebookPen size={20} className="shrink-0" />
              {!isSidebarCollapsed && <span>Notes</span>}
            </button>
            {isSidebarCollapsed && <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity z-50 shadow-lg">Notes</span>}
          </div>

          {/* Rehearsal */}
          <div className="relative group/tip">
            <button
              onClick={() => { setCurrentView("rehearsal"); setIsMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors font-medium ${currentView === "rehearsal"
                ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:white"
                } ${isSidebarCollapsed ? "justify-center" : ""}`}
              title="Rehearsal"
            >
              <Mic2 size={20} className="shrink-0" />
              {!isSidebarCollapsed && <span>Rehearsal</span>}
            </button>
            {isSidebarCollapsed && <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity z-50 shadow-lg">Rehearsal</span>}
          </div>

          {/* Planner — open to all users */}
          <div className="relative group/tip">
            <button
              onClick={() => { setCurrentView("planner"); setIsMobileMenuOpen(false); markPlannerSeen(); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium ${
                currentView === "planner"
                  ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                  : unseenPlanner
                    ? "text-indigo-400 dark:text-indigo-300 hover:bg-indigo-900/20"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:white"
              } ${isSidebarCollapsed ? "justify-center" : ""}`}
              style={unseenPlanner && currentView !== "planner" ? {
                boxShadow: "0 0 0 1px rgba(99,102,241,0.4), 0 0 12px rgba(99,102,241,0.25)",
                animation: "newModulePulse 2s ease-in-out infinite",
              } : {}}
              title="Ministry Hub"
            >
              <span className="relative shrink-0">
                <SquareKanban size={20} />
                {unseenPlanner && currentView !== "planner" && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-400 border border-[#1a1f2e]" />
                )}
              </span>
              {!isSidebarCollapsed && <span>Ministry Hub</span>}
              {!isSidebarCollapsed && unseenPlanner && currentView !== "planner" && (
                <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">NEW</span>
              )}
            </button>
            {isSidebarCollapsed && <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity z-50 shadow-lg">Ministry Hub</span>}
          </div>

          {/* Freedom Wall — anonymous thoughts board */}
          <div className="relative group/tip">
            <button
              onClick={() => { setCurrentView("freedom-wall"); setIsMobileMenuOpen(false); markFreedomWallSeen(); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium ${
                currentView === "freedom-wall"
                  ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                  : unseenFreedomWall
                    ? "text-indigo-400 dark:text-indigo-300 hover:bg-indigo-900/20"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:white"
              } ${isSidebarCollapsed ? "justify-center" : ""}`}
              style={unseenFreedomWall && currentView !== "freedom-wall" ? {
                boxShadow: "0 0 0 1px rgba(99,102,241,0.4), 0 0 12px rgba(99,102,241,0.25)",
                animation: "newModulePulse 2s ease-in-out infinite",
              } : {}}
              title="Freedom Wall"
            >
              <span className="relative shrink-0">
                <Feather size={20} />
                {unseenFreedomWall && currentView !== "freedom-wall" && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-400 border border-[#1a1f2e]" />
                )}
              </span>
              {!isSidebarCollapsed && <span>Freedom Wall</span>}
              {!isSidebarCollapsed && unseenFreedomWall && currentView !== "freedom-wall" && (
                <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">NEW</span>
              )}
            </button>
            {isSidebarCollapsed && <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity z-50 shadow-lg">Freedom Wall</span>}
          </div>

          {/* Design Requests — Audio/Tech + Admin only */}
          {(isRoleAdmin || effectiveRole === "audio_tech") && (
            <div className="relative group/tip">
              <button
                onClick={() => { setCurrentView("design-requests"); setIsMobileMenuOpen(false); markDesignRequestsSeen(); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium ${
                  currentView === "design-requests"
                    ? "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300"
                    : unseenDesignRequests
                      ? "text-violet-400 dark:text-violet-300 hover:bg-violet-900/20"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                } ${isSidebarCollapsed ? "justify-center" : ""}`}
                style={unseenDesignRequests && currentView !== "design-requests" ? {
                  boxShadow: "0 0 0 1px rgba(var(--wf-c3),0.4), 0 0 12px rgba(var(--wf-c3),0.25)",
                  animation: "newModulePulse 2s ease-in-out infinite",
                } : {}}
                title="Design Requests"
              >
                <span className="relative shrink-0">
                  <Palette size={20} />
                  {unseenDesignRequests && currentView !== "design-requests" && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-violet-400 border border-[#1a1f2e]" />
                  )}
                </span>
                {!isSidebarCollapsed && <span>Design Requests</span>}
                {!isSidebarCollapsed && unseenDesignRequests && currentView !== "design-requests" && (
                  <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">NEW</span>
                )}
              </button>
              {isSidebarCollapsed && <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity z-50 shadow-lg">Design Requests</span>}
            </div>
          )}

          {/* Preaching — Admin only; everyone else sees Coming Soon */}
          <div className="relative group/tip">
            {isRoleAdmin ? (
              // Admin: full access button with glow
              <button
                onClick={() => { setCurrentView("preaching"); setIsMobileMenuOpen(false); markPreachingSeen(); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all ${
                  currentView === "preaching"
                    ? "bg-indigo-600/20 text-indigo-400"
                    : unseenPreaching
                      ? "text-indigo-400 dark:text-indigo-300 hover:bg-indigo-900/20"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/60 hover:text-gray-800 dark:hover:text-gray-200"
                } ${isSidebarCollapsed ? "justify-center" : ""}`}
                style={unseenPreaching && currentView !== "preaching" ? {
                  boxShadow: "0 0 0 1px rgba(99,102,241,0.4), 0 0 12px rgba(99,102,241,0.25)",
                  animation: "newModulePulse 2s ease-in-out infinite",
                } : {}}
                title="Preaching"
              >
                <span className="relative shrink-0">
                  <BookOpen size={20} />
                  {unseenPreaching && currentView !== "preaching" && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-400 border border-[#1a1f2e]" />
                  )}
                </span>
                {!isSidebarCollapsed && (
                  <span className="flex items-center gap-2">
                    Preaching
                    {unseenPreaching && currentView !== "preaching" && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">NEW</span>
                    )}
                  </span>
                )}
              </button>
            ) : (
              // Non-admin: disabled Coming Soon state
              <div
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium cursor-not-allowed opacity-40 ${
                  isSidebarCollapsed ? "justify-center" : ""
                }`}
                title="Preaching — Admin only"
              >
                <BookOpen size={20} className="shrink-0 text-gray-400" />
                {!isSidebarCollapsed && (
                  <span className="flex items-center gap-2 text-gray-400">
                    Preaching
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-500/20 text-gray-500 px-1.5 py-0.5 rounded-full">Admin</span>
                  </span>
                )}
              </div>
            )}
            {isSidebarCollapsed && <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity z-50 shadow-lg">{isRoleAdmin ? "Preaching" : "Preaching (Admin only)"}</span>}
          </div>

          {/* Admin Panel — admin only, always hidden for QA Specialist */}
          {isRoleAdmin && !isQA && (
            <div className="relative group/tip">
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
              {isSidebarCollapsed && <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity z-50 shadow-lg">Team Access</span>}
            </div>
          )}
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
          onClick={() => { setIsSidebarCollapsed(!isSidebarCollapsed); window.dispatchEvent(new CustomEvent('pg-sidebar-toggle')); }}
          className="hidden lg:flex absolute -right-3.5 top-8 -translate-y-1/2 z-40 w-7 h-7 items-center justify-center rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 shadow-sm transition-all"
        >
          {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 py-4 px-4 sm:px-6 flex items-center gap-3 h-16 shrink-0" style={{ ["--header-h" as any]: "64px" }}>

          {/* Dashboard: show hamburger (opens sidebar drawer on mobile) */}
          {currentView === "dashboard" && (
            <button
              className="lg:hidden p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
          )}

          {/* ← Back button — replaces the hamburger on every non-dashboard view
              Mobile  : always shown (sidebar is hidden, user needs an escape route)
              Desktop : only on "detached" views (rehearsal, admin, playground, team-notes)
                        — sidebar handles navigation for songs / members / schedule       */}
          {currentView !== "dashboard" && (
            <button
              onClick={() => {
                // If we're on songs and a song detail is open, go BACK to the song list
                if (currentView === "songs" && isSongDetailOpen) {
                  setClearSelectionSignal(s => s + 1);
                } else {
                  setCurrentView("dashboard");
                }
              }}
              className={[
                currentView === "songs" || currentView === "members" || currentView === "schedule" || currentView === "freedom-wall" || currentView === "preaching"
                  ? "lg:hidden"   // desktop sidebar-accessible views — mobile only
                  : "",           // detached views — always visible
                "flex items-center gap-1 py-1.5 pl-1 pr-3 rounded-xl font-semibold",
                "text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400",
                "hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all active:scale-95",
              ].join(" ")}
              title={currentView === "songs" && isSongDetailOpen ? "Back to Song List" : "Back to Dashboard"}
            >
              <ChevronLeft size={22} strokeWidth={2.5} />
              <span className="hidden sm:inline text-sm">Back</span>
            </button>
          )}

          <div className="flex-1 flex items-center min-w-0">
            <h1 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white whitespace-nowrap truncate">
              {currentView === "dashboard" ? "Dashboard" : currentView === "schedule" ? "Scheduling" : currentView === "members" ? "Team Members" : currentView === "admin" ? "Team Access" : currentView === "playground" ? "Playground" : currentView === "planner" ? "Ministry Hub" : currentView === "team-notes" ? "Notes" : currentView === "rehearsal" ? "Rehearsal" : currentView === "freedom-wall" ? "Freedom Wall" : currentView === "preaching" ? "Preaching" : currentView === "design-requests" ? "Design Requests" : "Song Management"}
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

            {/* Team Chat */}
            <ChatWidget
              isAdmin={isRoleAdmin}
              userId={user?.uid ?? ""}
              userName={user?.displayName ?? ""}
              userPhoto={user?.photoURL ?? ""}
              allMembers={allMembers}
            />

            {/* Help & Knowledge Base */}
            <HelpPanel
              isAdmin={isRoleAdmin}
              userId={user?.uid ?? ""}
              userName={user?.displayName ?? ""}
              userEmail={user?.email ?? ""}
              userPhoto={user?.photoURL ?? ""}
              allMembers={allMembers}
            />



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
            <UserMenu simulatedRole={simulatedRole} onRoleSwitch={handleRoleSwitch} plannerAccess={isAdmin || (myMemberProfile?.plannerAccess ?? false)} />
          </div>
        </header>


        {/* Content Area — overflow-x MUST be hidden to prevent Freedom Wall's
             4000px canvas from bleeding into the rest of the app layout */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50 dark:bg-gray-900">
          <div className="flex flex-col h-full">
            <div className={`view-enter flex-1 overflow-x-hidden ${
                currentView === "freedom-wall" || currentView === "preaching" || currentView === "design-requests"
                  ? "overflow-y-hidden p-0 flex flex-col"
                  : "overflow-y-auto p-4 sm:p-6"
              }`}>
              <Suspense fallback={null}>


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
                  onNavigateToPlanner={({ boardId, cardId }) => {
                    // Empty strings = landing page nav → clear any pending deep-link
                    setPendingPlannerBoardId(boardId || null);
                    setPendingPlannerCardId(cardId || null);
                    setCurrentView('planner');
                    markPlannerSeen();
                  }}
                  onOpenLineup={openLineupPlayer}
                  lineupTrackCount={lineupSongCount}
                  isLineupOpen={lineupOpen}
                  isLibraryOpen={libraryOpen}
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
                   onEventPanelOpen={() => {
                     if (window.innerWidth >= 768) setIsSidebarCollapsed(true);
                   }}
                   onNavigateToPlanner={({ boardId, cardId }: { boardId: string; cardId: string }) => {
                     setPendingPlannerBoardId(boardId);
                     setPendingPlannerCardId(cardId);
                     setCurrentView("planner");
                     markPlannerSeen();
                   }}
                />
              ) : null}

              {/* ══════════════════════════════════════════════════════════════
                   ADMIN PANEL VIEW
              ══════════════════════════════════════════════════════════════ */}
              {currentView === "playground" ? (
                /* ══════════════════════════════════════════════════
                     PLAYGROUND — admin only sandbox
                ══════════════════════════════════════════════════ */
                isRoleAdmin ? <Playground allMembers={allMembers} currentUser={myMemberProfile ? { name: myMemberProfile.name, photo: myMemberProfile.photo } : undefined} onToast={showToast} /> : null
              ) : currentView === "planner" ? (
                /* ══════════════════════════════════════════════════
                     PLANNER — Kanban board (all roles)
                ══════════════════════════════════════════════════ */
                <PlannerView
                  allMembers={allMembers}
                  currentUser={myMemberProfile
                    ? { name: myMemberProfile.name, photo: myMemberProfile.photo || myMemberProfile.photoURL || "" }
                    : (user ? { name: user.displayName || user.email?.split('@')[0] || "Me", photo: user.photoURL || "" } : undefined)}
                  onToast={showToast}
                  isFullAccess={isAdmin || (myMemberProfile?.plannerAccess ?? false)}
                  deepLinkBoardId={pendingPlannerBoardId}
                  deepLinkCardId={pendingPlannerCardId}
                />
              ) : currentView === "team-notes" ? (
                <TeamNotesView
                  userId={user?.uid ?? ""}
                  userName={user?.displayName ?? user?.email ?? "Unknown"}
                  userPhoto={user?.photoURL ?? ""}
                  userRole={userRole}
                  onToast={showToast}
                  pendingNoteId={pendingTeamNoteId ?? undefined}
                  onPendingNoteHandled={() => setPendingTeamNoteId(null)}
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
                  onSelectedSongChange={(hasSong) => setIsSongDetailOpen(hasSong)}
                  clearSelectionSignal={clearSelectionSignal}
                  onOpenLibraryPlayer={openLibraryPlayer}
                  isLibraryPlayerOpen={libraryOpen}
                  isLineupOpen={lineupOpen}
                />
              ) : currentView === "rehearsal" ? (
                <RehearsalView
                  allSchedules={allSchedules}
                  allSongs={allSongs}
                  lineupTracks={lineupTracks}
                  onOpenLineup={openLineupPlayer}
                  isLineupOpen={lineupOpen}
                  isLibraryOpen={libraryOpen}
                  currentUser={user}
                  canEditSong={canEditSong}
                  showToast={showToast}
                  onSongUpdated={(updated) => {
                    setAllSongs(prev => prev.map(s => s.id === updated.id ? updated : s));
                    // Also update the local songs cache so the change persists across navigations
                    try {
                      const raw = localStorage.getItem("wf_songs_cache");
                      if (raw) {
                        const parsed = JSON.parse(raw);
                        if (parsed?.songs) {
                          parsed.songs = parsed.songs.map((s: Song) => s.id === updated.id ? updated : s);
                          localStorage.setItem("wf_songs_cache", JSON.stringify(parsed));
                        }
                      }
                    } catch { /* noop */ }
                  }}
                />
              ) : currentView === "freedom-wall" ? (
                <FreedomWallView
                  isAdmin={isRoleAdmin}
                  currentUserId={user?.uid ?? null}
                  onToast={showToast}
                />
              ) : currentView === "design-requests" ? (
                (isRoleAdmin || effectiveRole === "audio_tech") ? (
                  <DesignRequestsView
                    key={designRequestsKey}
                    currentUserId={user?.uid ?? ""}
                    currentUserName={user?.displayName || user?.email?.split("@")[0] || "Team Member"}
                    currentUserPhoto={user?.photoURL ?? ""}
                    isAdmin={isRoleAdmin}
                    onToast={showToast}
                    pendingDraftId={pendingDesignDraftId}
                    onPendingDraftHandled={() => setPendingDesignDraftId(null)}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <Palette size={28} className="text-gray-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-700 dark:text-gray-300">Design Requests</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">This section is for Audio / Tech team members.</p>
                    </div>
                  </div>
                )
              ) : currentView === "preaching" ? (
                isRoleAdmin ? (
                  <PreachingView
                    currentUser={{ uid: user?.uid ?? "", name: user?.displayName || user?.email || "", email: user?.email || "", photo: user?.photoURL || "" }}
                    onToast={showToast}
                    initialTab={pendingPreachingTab ?? undefined}
                  />
                ) : (
                  // Non-admin locked screen
                  <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <BookOpen size={28} className="text-gray-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-700 dark:text-gray-300">Preaching Module</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">This module is coming soon. Only Admins have access during the preview period.</p>
                    </div>
                    <span className="px-4 py-1.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider">Coming Soon</span>
                  </div>
                )
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
          currentUser={{ uid: user?.uid ?? "", name: user?.displayName ?? user?.email ?? "Team Member", photo: user?.photoURL ?? "", email: user?.email ?? "" } as CurrentUser}
          onClose={() => setLineupOpen(false)}
        />
      )}

      {/* ── Songs Library Player — persists across ALL views ──────────────────
           Lives at App root so it persists across ALL module navigations.
      ─────────────────────────────────────────────────────────────────────── */}
      {libraryOpen && songsWithVideo.length > 0 && (
        <SongsLibraryPlayer
          tracks={songsWithVideo}
          startIndex={libraryStartIndex}
          onClose={() => setLibraryOpen(false)}
        />
      )}

    </div >
  );
}
