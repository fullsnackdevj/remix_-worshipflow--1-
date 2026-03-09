import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { getAuth } from "firebase/auth";
import { usePushNotifications } from "./usePushNotifications";
import BroadcastOverlay from "./BroadcastOverlay";
import WelcomeToast from "./WelcomeToast";
import AdminPanel from "./AdminPanel";
import HelpPanel from "./HelpPanel";
import NotesPanel from "./NotesPanel";
import { Music, Search, Plus, Edit, Trash2, X, Save, Tag as TagIcon, Menu, ChevronLeft, ChevronRight, ChevronDown, Moon, Sun, ImagePlus, Loader2, ExternalLink, Printer, CheckSquare, Check, Filter, Users, Calendar, Phone, UserPlus, Camera, LayoutGrid, List, BookOpen, Mic2, Copy, Pencil, Shield, Mail, Bell, Guitar, Sliders, Palette, Lock, AlertTriangle, CheckCircle, BookMarked, HandMetal, Headphones, HelpCircle } from "lucide-react";
import { Song, Tag } from "./types";

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

interface Member {
  id: string;
  name: string;
  phone: string;
  email: string;
  photo: string;
  roles: string[];
  status: "active" | "on-leave" | "inactive";
  notes: string;
  created_at?: string;
  updated_at?: string;
}

interface ScheduleMember {
  memberId: string;
  name: string;
  photo: string;
  role: string;
}

interface Schedule {
  id: string;
  date: string;
  serviceType?: string;
  eventName?: string;
  worshipLeader?: ScheduleMember | null;
  backupSingers?: ScheduleMember[];
  musicians?: ScheduleMember[];
  songLineup?: { joyful?: string; solemn?: string };
  assignments?: { role: string; members: ScheduleMember[] }[];
  notes?: string;
}

interface ScheduleMember {
  memberId: string;
  name: string;
  photo: string;
  role: string;
}

interface Schedule {
  id: string;
  date: string;
  serviceType?: string;
  eventName?: string;
  worshipLeader?: ScheduleMember | null;
  backupSingers?: ScheduleMember[];
  musicians?: ScheduleMember[];
  songLineup?: { joyful?: string; solemn?: string };
  notes?: string;
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
  const { user, logOut, userRole } = useAuth();
  const [open, setOpen] = React.useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  if (!user) return null;

  const isQA = userRole === "qa_specialist";
  const effectiveDisplay = isQA && simulatedRole !== "qa_specialist" ? simulatedRole : userRole;
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
                {isQA && simulatedRole !== "qa_specialist" ? `Testing: ${badge.label}` : badge.label}
              </span>
            </div>
          </div>

          {/* QA Role Switcher */}
          {isQA && (
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
              {simulatedRole !== "qa_specialist" && (
                <button
                  onClick={() => { onRoleSwitch("qa_specialist"); setOpen(false); }}
                  className="mt-1.5 w-full text-[10px] text-fuchsia-500 hover:text-fuchsia-400 font-medium transition-colors"
                >
                  Reset to QA Specialist
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
  const [currentView, setCurrentView] = useState<"songs" | "members" | "schedule" | "admin">("songs");
  const { isAdmin, userRole, user } = useAuth();

  // ── QA Specialist simulated role ──────────────────────────────────────────
  const isQA = userRole === "qa_specialist";
  const [simulatedRole, setSimulatedRole] = useState<string>(() => {
    try { return localStorage.getItem(`wf_qa_role_${user?.uid}`) || "qa_specialist"; } catch { return "qa_specialist"; }
  });
  const handleRoleSwitch = (role: string) => {
    setSimulatedRole(role);
    try { localStorage.setItem(`wf_qa_role_${user?.uid}`, role); } catch { /* noop */ }
  };
  // The role used for ALL permission checks
  const effectiveRole = isQA ? simulatedRole : userRole;

  // 🔔 Push notifications — iOS-safe: user must tap "Enable" button
  const { showPrompt: showPushPrompt, requestPushPermission, dismissPrompt: dismissPushPrompt } =
    usePushNotifications(user?.uid ?? null, userRole ?? null);

  // ── Notification state ───────────────────────────────────────────
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/notifications?role=${userRole}&userId=${user.uid}`);
      if (res.ok) setNotifications(await res.json());
    } catch { /* silent */ }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000); // poll every 60s
    const onFocus = () => fetchNotifications();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(interval); window.removeEventListener("focus", onFocus); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userRole]);

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
      const found = allSongs.find(s => s.id === resourceId);
      if (found) {
        setSelectedSong(found);
        setIsEditing(false);
      } else {
        // Song not in cache yet — switch to songs view and let user see it
        setCurrentView("songs");
      }
    } else if ((type === "new_event" || type === "updated_event") && resourceId && resourceDate) {
      setCurrentView("schedule");
      setSelectedScheduleDate(resourceDate);
      setSelectedEventId(resourceId);
      setSchedPanelMode("view");
    } else if (type === "access_request") {
      setCurrentView("admin");
    }
  };

  const timeAgo = (iso: string) => {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
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
    new_song: <Music size={14} />, new_event: <Calendar size={14} />, updated_event: <Pencil size={14} />, access_request: <Bell size={14} />,
  };
  // ── Role-based permission flags ───────────────────────────────────────────
  // All flags use effectiveRole so QA Specialist simulation works correctly
  const isLeader = effectiveRole === "leader";
  const isPlanningLead = effectiveRole === "planning_lead";

  // Songs
  const canAddSong = isAdmin || ["musician", "audio_tech", "leader", "planning_lead", "qa_specialist"].includes(effectiveRole);
  const canEditSong = isAdmin || ["musician", "audio_tech", "leader", "planning_lead", "qa_specialist"].includes(effectiveRole);
  const canDeleteSong = isAdmin; // only admin can delete songs
  const canSelectSongs = isAdmin; // selection mode leads to bulk delete

  // Members — admin only
  const canWriteMembers = true; // TODO: restrict to own-profile edit only

  // Schedule helpers
  // Returns true if dateStr falls on a Sunday (0) or Wednesday (3)
  const isServiceDay = (d: string) => { const dow = new Date(d + "T00:00:00").getDay(); return dow === 0 || dow === 3; };

  // Full schedule write — admin & Planning Lead have identical full access
  const canWriteSchedule = isAdmin || isPlanningLead;

  // ── Scheduling state ─────────────────────────────────────────────────────
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(false);
  const [selectedScheduleDate, setSelectedScheduleDate] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [schedPanelMode, setSchedPanelMode] = useState<"view" | "edit">("view");
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [scheduleView, setScheduleView] = useState<"month" | "list">("month");
  const [calendarMonth, setCalendarMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  // Edit form fields
  const [editSchedServiceType, setEditSchedServiceType] = useState<"sunday" | "midweek">("sunday");
  const [editSchedEventName, setEditSchedEventName] = useState("");
  const [editSchedWorshipLeader, setEditSchedWorshipLeader] = useState<ScheduleMember | null>(null);
  const [editSchedBackupSingers, setEditSchedBackupSingers] = useState<ScheduleMember[]>([]);
  const [editSchedMusicians, setEditSchedMusicians] = useState<ScheduleMember[]>([]);
  const [pendingRolePick, setPendingRolePick] = useState<{ m: typeof allMembers[0]; roles: string[] } | null>(null);
  const [editSchedAssignments, setEditSchedAssignments] = useState<{ role: string; members: ScheduleMember[]; search: string }[]>([]);
  const [newRoleInput, setNewRoleInput] = useState("");
  // Leader-specific schedule derived flags (placed here, after state declarations)
  const isServiceEventType = ["sunday service", "midweek service"].includes(editSchedEventName.toLowerCase());
  const leaderCanAddOnDate = isLeader && !!selectedScheduleDate && isServiceDay(selectedScheduleDate);
  const leaderCanEditEvent = isLeader && isServiceEventType;
  const [newGroupFocusIdx, setNewGroupFocusIdx] = useState<number | null>(null);
  const [editSchedSongLineup, setEditSchedSongLineup] = useState<{ joyful?: string; solemn?: string }>({});
  const [joyfulSearch, setJoyfulSearch] = useState("");
  const [solemnSearch, setSolemnSearch] = useState("");
  const [editSchedNotes, setEditSchedNotes] = useState("");
  const [schedMemberSearch, setSchedMemberSearch] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  // allSongs: the full cached list from server — never filtered directly
  const [allSongs, setAllSongs] = useState<Song[]>([]);
  const [isLoadingSongs, setIsLoadingSongs] = useState(true);
  const [tags, setTags] = useState<Tag[]>([]);
  const fetchAbortRef = useRef<AbortController | null>(null);

  // ── Member state ──────────────────────────────────────────────────────────
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isEditingMember, setIsEditingMember] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [memberFormErrors, setMemberFormErrors] = useState<{ firstName?: string; lastName?: string; phone?: string; email?: string }>({});

  // Member form fields
  const [editMemberFirstName, setEditMemberFirstName] = useState("");
  const [editMemberMiddleInitial, setEditMemberMiddleInitial] = useState("");
  const [editMemberLastName, setEditMemberLastName] = useState("");
  const [editMemberPhone, setEditMemberPhone] = useState("");
  const [editMemberEmail, setEditMemberEmail] = useState("");
  const [editMemberPhoto, setEditMemberPhoto] = useState("");
  const [editMemberRoles, setEditMemberRoles] = useState<string[]>([]);
  const [editMemberStatus, setEditMemberStatus] = useState<"active" | "on-leave" | "inactive">("active");
  const [editMemberNotes, setEditMemberNotes] = useState("");
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSavingMember, setIsSavingMember] = useState(false);
  const memberPhotoInputRef = useRef<HTMLInputElement>(null);
  const memberCameraInputRef = useRef<HTMLInputElement>(null); // kept for mobile fallback
  // Camera modal
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // ── Push notification deep-link handling ──────────────────────────────────
  // Stores a song ID to navigate to once allSongs has loaded
  const [pendingNavSongId, setPendingNavSongId] = useState<string | null>(null);

  // On app boot: check if we were opened via a push notification tap
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notifType = params.get("notif");
    const resourceId = params.get("id");
    const resourceDate = params.get("date");
    if (!notifType) return;

    // Clean the URL immediately (no page reload, just cosmetic)
    window.history.replaceState({}, "", "/");

    if (notifType === "new_song" && resourceId) {
      setCurrentView("songs");
      setPendingNavSongId(resourceId); // will open once allSongs loads
    } else if ((notifType === "new_event" || notifType === "updated_event") && resourceId && resourceDate) {
      setCurrentView("schedule");
      setSelectedScheduleDate(resourceDate);
      setSelectedEventId(resourceId);
      setSchedPanelMode("view");
    } else if (notifType === "access_request") {
      setCurrentView("admin");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Once songs load, apply any pending song navigation from push tap
  useEffect(() => {
    if (!pendingNavSongId || !allSongs.length) return;
    const found = allSongs.find(s => s.id === pendingNavSongId);
    if (found) {
      setSelectedSong(found);
      setIsEditing(false);
      setPendingNavSongId(null);
    }
  }, [pendingNavSongId, allSongs]);

  // Form states
  const [editTitle, setEditTitle] = useState("");
  const [editArtist, setEditArtist] = useState("");
  const [editVideoUrl, setEditVideoUrl] = useState("");
  const [editLyrics, setEditLyrics] = useState("");
  const [editChords, setEditChords] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [isOcrLoading, setIsOcrLoading] = useState<"lyrics" | "chords" | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>([]);
  const [formErrors, setFormErrors] = useState<{ title?: string; artist?: string; lyrics?: string; tags?: string }>({});
  const [copiedField, setCopiedField] = useState<"lyrics" | "chords" | null>(null);
  const [transposeSteps, setTransposeSteps] = useState(0);

  const lyricsInputRef = useRef<HTMLInputElement>(null);
  const chordsInputRef = useRef<HTMLInputElement>(null);

  const LYRICS_TEMPLATE = "Verse:\n\nPre Chorus:\n\nChorus:\n\nBridge:";
  const CHORDS_TEMPLATE = "Verse:\n\nPre Chorus:\n\nChorus:\n\nBridge:";

  // Tag form states
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("bg-gray-100 text-gray-800");

  // Song view mode: grid (default) or list
  const [songView, setSongView] = useState<"grid" | "list">(() => {
    try { return (localStorage.getItem("wf_song_view") as "grid" | "list") || "grid"; } catch { return "grid"; }
  });
  const toggleSongView = (v: "grid" | "list") => {
    setSongView(v);
    try { localStorage.setItem("wf_song_view", v); } catch { /* noop */ }
  };

  // Pagination (9 songs per page)
  const SONGS_PER_PAGE = 9;
  const [currentPage, setCurrentPage] = useState(1);


  // ── Toast notifications ──────────────────────────────────────────────
  type ToastType = "success" | "error" | "info" | "warning";
  interface ToastItem { id: number; type: ToastType; message: string; }
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = (type: ToastType, message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  };

  const dismissToast = (id: number) =>
    setToasts(prev => prev.filter(t => t.id !== id));

  // ── Confirm dialog ─────────────────────────────────────────────────
  interface ConfirmConfig {
    title: string;
    message: string;
    detail?: string;
    confirmText: string;
    confirmClass?: string;
    onConfirm: () => void;
  }
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig | null>(null);

  const showConfirm = (config: ConfirmConfig) => setConfirmConfig(config);
  const closeConfirm = () => setConfirmConfig(null);


  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Debounce the search query so filtering reacts ~300ms after the user stops typing
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    // Prefetch both songs and members in parallel on mount.
    // Members will be cache-ready when user navigates to Team Members tab.
    fetchSongs();
    fetchMembers({ background: true });
    fetchSchedules({ background: true });
  }, []);

  // Keep this for when the user switches to members and cache is empty (edge case)
  useEffect(() => {
    if (currentView === "members" && allMembers.length === 0 && !isLoadingMembers) {
      fetchMembers();
    }
  }, [currentView]);

  // ── Schedule helpers ──────────────────────────────────────────────────────
  const SCHED_CACHE_KEY = "wf_schedules_cache";
  const SCHED_CACHE_TS_KEY = "wf_schedules_cache_ts";

  const writeSchedulesCache = (data: Schedule[]) => {
    try { localStorage.setItem(SCHED_CACHE_KEY, JSON.stringify(data)); localStorage.setItem(SCHED_CACHE_TS_KEY, Date.now().toString()); } catch { }
  };

  const eventEmoji = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes("sunday")) return "🙌";
    if (n.includes("midweek")) return "✝️";
    if (n.includes("prayer")) return "🙏";
    if (n.includes("worship")) return "🎵";
    if (n.includes("youth")) return "👆";
    if (n.includes("revival")) return "🔥";
    return "📅";
  };

  const fetchSchedules = async ({ background = false } = {}) => {
    if (!background) setIsLoadingSchedules(true);
    try {
      const res = await fetch("/api/schedules");
      if (!res.ok) throw new Error("fetch failed");
      const data: Schedule[] = await res.json();
      setAllSchedules(data);
      writeSchedulesCache(data);
    } catch {
      try {
        const cached = localStorage.getItem(SCHED_CACHE_KEY);
        if (cached) setAllSchedules(JSON.parse(cached));
      } catch { }
    } finally {
      if (!background) setIsLoadingSchedules(false);
    }
  };

  // derived: map dateStr -> Schedule[]
  const dateEventsMap = allSchedules.reduce<Record<string, Schedule[]>>((acc, s) => {
    if (!acc[s.date]) acc[s.date] = [];
    acc[s.date].push(s);
    return acc;
  }, {});

  const selectedDateEvents: Schedule[] = selectedScheduleDate ? (dateEventsMap[selectedScheduleDate] ?? []) : [];
  const editingExisting: Schedule | null = selectedEventId ? (allSchedules.find(s => s.id === selectedEventId) ?? null) : null;

  const openBlankEventForm = (dateStr: string) => {
    setSelectedScheduleDate(dateStr);
    setSelectedEventId(null);
    setSchedPanelMode("edit");
    // Auto-select event name for Worship Leaders based on day of week
    const dow = new Date(dateStr + "T00:00:00").getDay();
    const autoName = isLeader
      ? (dow === 0 ? "Sunday Service" : "Midweek Service")
      : "";
    setEditSchedEventName(autoName);
    setEditSchedServiceType(dow === 3 ? "midweek" : "sunday");
    setEditSchedWorshipLeader(null);
    setEditSchedBackupSingers([]);
    setEditSchedMusicians([]);
    setEditSchedAssignments([]);
    setNewRoleInput("");
    setEditSchedSongLineup({});
    setJoyfulSearch("");
    setSolemnSearch("");
    setEditSchedNotes("");
    setSchedMemberSearch("");
  };

  const openEventById = (eventId: string, dateStr: string) => {
    const ev = allSchedules.find(s => s.id === eventId);
    if (!ev) return;
    setSelectedScheduleDate(dateStr);
    setSelectedEventId(eventId);
    setSchedPanelMode("view");
    setEditSchedEventName((ev as any).eventName || (ev.serviceType === "sunday" ? "Sunday Service" : "Midweek Service"));
    setEditSchedServiceType((ev.serviceType as any) || "sunday");
    setEditSchedWorshipLeader(ev.worshipLeader ?? null);
    setEditSchedBackupSingers(ev.backupSingers ?? []);
    setEditSchedMusicians(ev.musicians ?? []);
    setEditSchedAssignments(((ev as any).assignments ?? []).map((a: any) => ({ ...a, search: "" })));
    setNewRoleInput("");
    setEditSchedSongLineup(ev.songLineup ?? {});
    setJoyfulSearch("");
    setSolemnSearch("");
    setEditSchedNotes(ev.notes ?? "");
    setSchedMemberSearch("");
  };

  const openScheduleEditor = (dateStr: string) => {
    const todayStr = new Date().toISOString().split("T")[0];
    const isPastDate = dateStr < todayStr;
    setSelectedScheduleDate(dateStr);
    const eventsOnDate = allSchedules.filter(s => s.date === dateStr);
    if (eventsOnDate.length === 0) {
      if (isPastDate) {
        setSelectedScheduleDate(null);
        showToast("error", "This date has passed. New events can't be added.");
        return;
      }
      // Just select the date — user clicks +Add Event to open the form
      setSchedPanelMode("view");
      setSelectedEventId(null);
    } else if (eventsOnDate.length === 1) {
      openEventById(eventsOnDate[0].id, dateStr);
    } else {
      // Day view — show list
      setSelectedEventId(null);
      setSchedPanelMode("view");
    }
  };

  const closeScheduleEditor = () => {
    setSelectedScheduleDate(null);
    setSelectedEventId(null);
    setSchedPanelMode("view");
  };

  const handleSaveSchedule = async () => {
    if (!selectedScheduleDate || isSavingSchedule) return;
    if (!editSchedEventName.trim()) { showToast("error", "Event name is required."); return; }
    const isServiceEvent = ["sunday service", "midweek service"].includes(editSchedEventName.toLowerCase());
    const isMidweekSvc = editSchedEventName.toLowerCase() === "midweek service";
    const isSundaySvc = editSchedEventName.toLowerCase() === "sunday service";
    if (isServiceEvent && !editSchedWorshipLeader) { showToast("error", "Worship Leader is required for service events."); return; }
    if (isServiceEvent && editSchedMusicians.length === 0) { showToast("error", "At least one Musician is required for service events."); return; }
    if (isMidweekSvc && !editSchedSongLineup.solemn) { showToast("error", "A Solemn song is required for Midweek Service."); return; }
    if (isSundaySvc && !editSchedSongLineup.joyful) { showToast("error", "A Joyful song is required for Sunday Service."); return; }
    if (isSundaySvc && !editSchedSongLineup.solemn) { showToast("error", "A Solemn song is required for Sunday Service."); return; }
    setIsSavingSchedule(true);
    const cu = getAuth().currentUser;
    const actorDisplayName = cu?.displayName || cu?.email?.split("@")[0] || user?.displayName || "Worship Team";
    const payload: any = {
      date: selectedScheduleDate,
      serviceType: editSchedServiceType,
      eventName: editSchedEventName,
      worshipLeader: editSchedWorshipLeader,
      backupSingers: editSchedBackupSingers,
      musicians: editSchedMusicians,
      assignments: editSchedAssignments.map(({ role, members }) => ({ role, members })),
      songLineup: editSchedSongLineup,
      notes: editSchedNotes,
      actorName: actorDisplayName,
      actorPhoto: cu?.photoURL || user?.photoURL || "",
      actorUserId: cu?.uid || user?.uid || "",
    };
    try {
      let res: Response;
      if (editingExisting) {
        res = await fetch(`/api/schedules/${editingExisting.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      } else {
        res = await fetch("/api/schedules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      }
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Save failed"); }
      const saved = await res.json();
      if (editingExisting) {
        setAllSchedules(prev => prev.map(s => s.id === editingExisting.id ? { ...s, ...payload, id: editingExisting.id } : s));
        showToast("success", "Event updated!");
      } else {
        const newEv: Schedule = { id: saved.id, ...payload };
        setAllSchedules(prev => [...prev, newEv]);
        setSelectedEventId(saved.id);
        showToast("success", "Event saved!");
      }
      setSchedPanelMode("view");
      writeSchedulesCache(allSchedules);
    } catch (err: any) {
      showToast("error", err.message || "Could not save event.");
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleDeleteSchedule = () => {
    if (!editingExisting) return;
    const targetEvent = editingExisting; // capture before state changes
    showConfirm({
      title: "Remove Event",
      message: `Remove "${(targetEvent as any).eventName || "this event"}" from ${targetEvent.date}?`,
      confirmText: "Remove",
      confirmClass: "bg-red-500 hover:bg-red-600",
      onConfirm: () => {
        // ── Optimistic: dismiss dialog + update UI instantly ──────────────
        closeConfirm();
        const remaining = allSchedules.filter(s => s.date === selectedScheduleDate && s.id !== targetEvent.id);
        setAllSchedules(prev => prev.filter(s => s.id !== targetEvent.id));
        if (remaining.length === 0) closeScheduleEditor();
        else if (remaining.length === 1) openEventById(remaining[0].id, selectedScheduleDate!);
        else { setSelectedEventId(null); setSchedPanelMode("view"); }
        showToast("success", "Event removed.");
        // ── Fire DELETE in background — restore on failure ─────────────────
        fetch(`/api/schedules/${targetEvent.id}`, { method: "DELETE" })
          .then(res => { if (!res.ok) throw new Error("Server error"); })
          .catch(() => {
            setAllSchedules(prev => [...prev, targetEvent]); // restore
            showToast("error", "Could not remove event. Please try again.");
          });
      }
    });
  };

  // Close filter dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isSelectionMode) {
          setIsSelectionMode(false);
          setSelectedSongIds([]);
        } else if (selectedSong) {
          setSelectedSong(null);
        } else if (isEditing) {
          setIsEditing(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSelectionMode, selectedSong, isEditing]);

  const handlePrint = (song: Song) => {
    const printHTML = `<!DOCTYPE html>
<html>
  <head>
    <title>${song.title}${song.artist ? ` - ${song.artist}` : ''}</title>
    <style>
      body { font-family: sans-serif; padding: 32px; line-height: 1.6; color: #111; }
      h1 { margin-bottom: 4px; font-size: 28px; }
      h2 { color: #555; margin-top: 0; font-weight: normal; margin-bottom: 24px; font-size: 18px; }
      .container { display: flex; gap: 40px; }
      .column { flex: 1; min-width: 0; }
      h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; border-bottom: 1px solid #eee; padding-bottom: 6px; margin-bottom: 12px; }
      pre { white-space: pre-wrap; font-family: inherit; font-size: 14px; margin: 0; }
      .chords pre { font-family: monospace; background: #f5f5f5; padding: 12px; border-radius: 6px; font-size: 13px; }
      @media (max-width: 500px) { .container { flex-direction: column; } }
    </style>
  </head>
  <body>
    <h1>${song.title}</h1>
    ${song.artist ? `<h2>${song.artist}</h2>` : ''}
    <div class="container">
      <div class="column"><h3>Lyrics</h3><pre>${song.lyrics || 'No lyrics added.'}</pre></div>
      <div class="column chords"><h3>Chords</h3><pre>${song.chords || 'No chords added.'}</pre></div>
    </div>
  </body>
</html>`;

    // Use hidden iframe — window.open is blocked on mobile browsers
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) { document.body.removeChild(iframe); return; }
    doc.open(); doc.write(printHTML); doc.close();
    setTimeout(() => {
      try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch (_) { }
      setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 1000);
    }, 300);
  };


  // ── Cache helpers ───────────────────────────────────────────────────────────
  const CACHE_KEY = "wf_songs_cache";
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  const readCache = (): { songs: any[]; tags: any[] } | null => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const { songs, tags, ts } = JSON.parse(raw);
      if (Date.now() - ts > CACHE_TTL_MS) return null;
      return { songs, tags };
    } catch {
      return null;
    }
  };

  const writeCache = (songs: any[], tags: any[]) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ songs, tags, ts: Date.now() }));
    } catch {
      // storage quota exceeded — ignore
    }
  };

  const clearSongsCache = () => {
    try { localStorage.removeItem(CACHE_KEY); } catch { /* noop */ }
  };

  // ── Fetch: songs + tags in parallel, with localStorage cache ────────────────
  const fetchSongs = useCallback(async ({ background = false } = {}) => {
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    // 1. Serve from cache immediately (stale-while-revalidate)
    if (!background) {
      const cached = readCache();
      if (cached) {
        setAllSongs(cached.songs);
        setTags(cached.tags);
        setIsLoadingSongs(false);
        // Revalidate silently in background
        fetchSongs({ background: true });
        return;
      }
      setIsLoadingSongs(true);
    }

    try {
      // 2. Fetch songs + tags in parallel
      const [songsRes, tagsRes] = await Promise.all([
        fetch("/api/songs", { signal: controller.signal }),
        fetch("/api/tags", { signal: controller.signal }),
      ]);

      const [songsData, tagsData] = await Promise.all([
        songsRes.json(),
        tagsRes.json(),
      ]);

      const songs = Array.isArray(songsData) ? songsData : [];
      const tags = Array.isArray(tagsData) ? tagsData : [];

      setAllSongs(songs);
      setTags(tags);
      writeCache(songs, tags);
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        console.error("Failed to load songs/tags", error);
        if (!background) {
          setAllSongs([]);
          setTags([]);
        }
      }
    } finally {
      if (!controller.signal.aborted) setIsLoadingSongs(false);
    }
  }, []);

  const fetchTags = fetchSongs; // aliases — tags are always loaded together


  // Instant client-side filtering — no network, no stale results
  const filteredSongs = useMemo(() => {
    let result = allSongs;

    // Text search across title, artist, lyrics, chords, and tags
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.trim().toLowerCase();
      result = result.filter(song =>
        song.title?.toLowerCase().includes(q) ||
        song.artist?.toLowerCase().includes(q) ||
        (song.lyrics as any)?.toLowerCase().includes(q) ||
        (song.chords as any)?.toLowerCase().includes(q) ||
        song.tags?.some((t: any) => t.name?.toLowerCase().includes(q))
      );
    }

    // Tag filters
    const tagFilters = selectedTagIds.filter(id => id !== "recently-added");
    const recentlyAdded = selectedTagIds.includes("recently-added");

    if (tagFilters.length > 0) {
      result = result.filter(song =>
        tagFilters.some(tagId => (song as any).tagIds?.includes(tagId))
      );
    }

    // Sort
    if (recentlyAdded) {
      result = [...result].sort((a, b) =>
        new Date((b as any).created_at).getTime() - new Date((a as any).created_at).getTime()
      );
    }

    return result;
  }, [allSongs, debouncedQuery, selectedTagIds]);

  // Pagination derived values — must come after filteredSongs
  const totalPages = Math.max(1, Math.ceil(filteredSongs.length / SONGS_PER_PAGE));
  const paginatedSongs = filteredSongs.slice((currentPage - 1) * SONGS_PER_PAGE, currentPage * SONGS_PER_PAGE);

  // Reset to page 1 when search or filters change
  useEffect(() => { setCurrentPage(1); }, [debouncedQuery, selectedTagIds]);
  // Reset transposer when switching songs
  useEffect(() => { setTransposeSteps(0); }, [selectedSong?.id]);

  // ── Member Functions ────────────────────────────────────────────────────────
  const MEMBERS_CACHE_KEY = "wf_members_cache";
  const MEMBERS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  const readMembersCache = (): any[] | null => {
    try {
      const raw = localStorage.getItem(MEMBERS_CACHE_KEY);
      if (!raw) return null;
      const { members, ts } = JSON.parse(raw);
      if (Date.now() - ts > MEMBERS_CACHE_TTL_MS) return null;
      return members;
    } catch { return null; }
  };

  const writeMembersCache = (members: any[]) => {
    try {
      localStorage.setItem(MEMBERS_CACHE_KEY, JSON.stringify({ members, ts: Date.now() }));
    } catch { /* quota exceeded — ignore */ }
  };

  const clearMembersCache = () => {
    try { localStorage.removeItem(MEMBERS_CACHE_KEY); } catch { /* noop */ }
  };

  const fetchMembers = useCallback(async ({ background = false } = {}) => {
    // Serve from cache instantly, then revalidate in background
    if (!background) {
      const cached = readMembersCache();
      if (cached) {
        setAllMembers(cached);
        setIsLoadingMembers(false);
        fetchMembers({ background: true }); // silent refresh
        return;
      }
      setIsLoadingMembers(true);
    }
    try {
      const res = await fetch("/api/members");
      const data = await res.json();
      const members = Array.isArray(data) ? data : [];
      setAllMembers(members);
      writeMembersCache(members);
    } catch (error) {
      console.error("Failed to fetch members", error);
      if (!background) setAllMembers([]);
    } finally {
      if (!background) setIsLoadingMembers(false);
    }
  }, []);


  const filteredMembers = useMemo(() => {
    if (!memberSearchQuery.trim()) return allMembers;
    const q = memberSearchQuery.trim().toLowerCase();
    return allMembers.filter(m =>
      m.name?.toLowerCase().includes(q) ||
      m.phone?.toLowerCase().includes(q) ||
      m.roles?.some(r => r.toLowerCase().includes(q))
    );
  }, [allMembers, memberSearchQuery]);

  const openMemberEditor = (member?: Member) => {
    if (member) {
      setSelectedMember(member);
      const parts = (member.name || "").trim().split(/\s+/);
      setEditMemberFirstName(parts[0] || "");
      // If the second part is a single letter (with or without dot) treat it as middle initial
      if (parts.length >= 3 && /^[A-Za-z]\.?$/.test(parts[1])) {
        setEditMemberMiddleInitial(parts[1].replace('.', ''));
        setEditMemberLastName(parts.slice(2).join(" ") || "");
      } else {
        setEditMemberMiddleInitial("");
        setEditMemberLastName(parts.slice(1).join(" ") || "");
      }
      setEditMemberPhone(member.phone);
      setEditMemberEmail((member as any).email || "");
      setEditMemberPhoto(member.photo || "");
      setEditMemberRoles(member.roles || []);
      setEditMemberStatus(member.status || "active");
      setEditMemberNotes(member.notes || "");
    } else {
      setSelectedMember(null);
      setEditMemberFirstName("");
      setEditMemberMiddleInitial("");
      setEditMemberLastName("");
      setEditMemberPhone("");
      setEditMemberEmail("");
      setEditMemberPhoto("");
      setEditMemberRoles([]);
      setEditMemberStatus("active");
      setEditMemberNotes("");
    }
    setMemberFormErrors({});
    setIsEditingMember(true);
  };

  const handleSaveMember = async () => {
    if (isSavingMember) return; // guard against double-click
    const errors: { firstName?: string; lastName?: string; phone?: string; email?: string } = {};
    if (!editMemberFirstName.trim()) errors.firstName = "First name is required.";
    if (!editMemberLastName.trim()) errors.lastName = "Last name is required.";
    if (!editMemberPhone.trim()) errors.phone = "Phone number is required.";
    if (!editMemberEmail.trim()) errors.email = "Email address is required.";
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(editMemberEmail.trim())) errors.email = "Please enter a valid email address.";
    if (Object.keys(errors).length > 0) { setMemberFormErrors(errors); return; }
    setMemberFormErrors({});

    // Build full name: "First [M.] Last"
    const mi = editMemberMiddleInitial.trim().replace(/\.$/, '');
    const fullName = `${editMemberFirstName.trim()}${mi ? ' ' + mi.toUpperCase() + '.' : ''} ${editMemberLastName.trim()}`;

    // ── Duplicate detection (new members only) ──────────────────────────────
    // allMembers is always current via optimistic updates — no network call needed
    if (!selectedMember?.id) {
      const firstLower = editMemberFirstName.trim().toLowerCase();
      const lastLower = editMemberLastName.trim().toLowerCase();
      const phoneDigits = editMemberPhone.trim().replace(/\D/g, '');
      const duplicate = allMembers.find((m: any) => {
        const parts = (m.name || "").trim().split(/\s+/);
        const mFirst = (parts[0] || "").toLowerCase();
        // Skip middle initial (single letter ± dot) — same logic as openMemberEditor
        let mLast: string;
        if (parts.length >= 3 && /^[A-Za-z]\.?$/.test(parts[1])) {
          mLast = parts.slice(2).join(" ").toLowerCase();
        } else {
          mLast = parts.slice(1).join(" ").toLowerCase();
        }
        return mFirst === firstLower && mLast === lastLower &&
          m.phone.replace(/\D/g, '') === phoneDigits;
      });
      if (duplicate) {
        showToast("error", `"${duplicate.name}" with the same phone number already exists.`);
        return;
      }
    }

    const payload = {
      name: fullName,
      phone: editMemberPhone,
      email: editMemberEmail.trim().toLowerCase(),
      photo: editMemberPhoto,
      roles: editMemberRoles,
      status: editMemberStatus,
      notes: editMemberNotes,
    };

    setIsSavingMember(true);
    try {
      const editingId = selectedMember?.id;
      let response;
      if (editingId) {
        response = await fetch(`/api/members/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        response = await fetch("/api/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to save member");
      }
      const responseData = await response.json();

      // ── Optimistic update: mutate local state instantly, no re-fetch ──────
      setAllMembers(prev => {
        let updated: Member[];
        if (editingId) {
          // Replace in-place
          updated = prev.map(m => m.id === editingId
            ? { ...m, ...payload, name: responseData.name ?? payload.name }
            : m
          );
        } else {
          // Prepend new member from server response
          const newMember: Member = {
            id: responseData.id,
            name: responseData.name ?? payload.name,
            phone: payload.phone,
            email: payload.email,
            photo: payload.photo,
            roles: payload.roles,
            status: payload.status,
            notes: payload.notes,
          };
          updated = [newMember, ...prev];
        }
        writeMembersCache(updated); // keep cache in sync
        return updated;
      });

      setIsEditingMember(false);
      setSelectedMember(null);
      showToast("success", editingId
        ? `Member "${payload.name}" updated successfully!`
        : `Member "${payload.name}" added successfully!`
      );
    } catch (error: any) {
      console.error("Failed to save member", error);
      showToast("error", error.message || "Failed to save member.");
    } finally {
      setIsSavingMember(false);
    }
  };

  const handleDeleteMember = async (id: string) => {
    const member = allMembers.find(m => m.id === id);
    showConfirm({
      title: "Remove Member",
      message: `Are you sure you want to remove "${member?.name || "this member"}"?`,
      detail: "This will permanently remove their profile and roles from the worship team list.",
      confirmText: "Yes, Remove",
      confirmClass: "bg-red-500 hover:bg-red-600",
      onConfirm: async () => {
        // ── Optimistic: remove from state instantly before API responds ──────
        const memberName = member?.name || "Member";
        setAllMembers(prev => {
          const updated = prev.filter(m => m.id !== id);
          writeMembersCache(updated);
          return updated;
        });
        if (selectedMember?.id === id) {
          setSelectedMember(null);
          setIsEditingMember(false);
        }
        closeConfirm();
        showToast("success", `"${memberName}" removed successfully.`);

        // Fire-and-forget: delete on server in background
        try {
          const res = await fetch(`/api/members/${id}`, { method: "DELETE" });
          if (!res.ok) throw new Error("Failed to delete member");
        } catch (error) {
          console.error("Failed to delete member", error);
          // Rollback: re-fetch to restore correct state
          showToast("error", "Failed to remove member. Restoring list...");
          clearMembersCache();
          fetchMembers();
        }
      }
    });
  };

  const MAX_PHOTO_SIZE_MB = 2;
  const handleMemberPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // ── Photo size guard ──────────────────────────────────────────────────────
    if (file.size > MAX_PHOTO_SIZE_MB * 1024 * 1024) {
      showToast("error", `Photo is too large. Please use an image under ${MAX_PHOTO_SIZE_MB}MB.`);
      if (e.target) e.target.value = "";
      return;
    }
    setIsUploadingPhoto(true);
    try {
      const reader = new FileReader();
      reader.onload = () => {
        setEditMemberPhoto(reader.result as string);
        setIsUploadingPhoto(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setIsUploadingPhoto(false);
    } finally {
      if (e.target) e.target.value = "";
    }
  };

  const openCamera = async () => {
    setCameraError("");
    setShowCameraModal(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      cameraStreamRef.current = stream;
      setTimeout(() => {
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          cameraVideoRef.current.play().catch(() => { });
        }
      }, 120);
    } catch {
      setCameraError("Camera access was denied or is unavailable. Please allow camera permission and try again.");
    }
  };

  const closeCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(t => t.stop());
      cameraStreamRef.current = null;
    }
    setShowCameraModal(false);
    setCameraError("");
  };

  const snapPhoto = () => {
    const video = cameraVideoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setEditMemberPhoto(dataUrl);
    closeCamera();
  };

  const toggleMemberRole = (role: string) => {
    setEditMemberRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };


  const fetchTagsStandalone = async () => {
    // No-op: tags are now always loaded as part of fetchSongs (parallel)
  };



  const validateForm = () => {
    const errors: { title?: string; artist?: string; lyrics?: string; tags?: string } = {};
    if (!editTitle.trim()) errors.title = "Title is required.";
    if (!editArtist.trim()) errors.artist = "Artist is required.";
    if (!editLyrics.trim() || editLyrics.trim() === "Verse:\n\nPre Chorus:\n\nChorus:\n\nBridge:") errors.lyrics = "Lyrics are required.";
    if (editTags.length === 0) errors.tags = "Please select at least one tag.";
    return errors;
  };

  const handleSaveSong = async () => {
    // Validate required fields for both new songs and edits
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});

    const cu = getAuth().currentUser;
    const payload = {
      title: editTitle,
      artist: editArtist,
      lyrics: editLyrics,
      chords: editChords,
      tags: editTags,
      video_url: editVideoUrl,
      actorName: cu?.displayName || cu?.email?.split("@")[0] || user?.displayName || "Worship Team",
      actorPhoto: cu?.photoURL || user?.photoURL || "",
      actorUserId: cu?.uid || user?.uid || "",
    };

    try {
      let response;
      if (selectedSong?.id) {
        response = await fetch(`/api/songs/${selectedSong.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        response = await fetch("/api/songs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save song");
      }

      const isEdit = !!selectedSong?.id;
      setIsEditing(false);
      setSelectedSong(null);
      clearSongsCache();
      await fetchSongs(); // refresh + re-cache
      showToast("success", isEdit
        ? `Song "${payload.title}" updated successfully!`
        : `Song "${payload.title}" saved successfully!`
      );
    } catch (error: any) {
      console.error("Failed to save song", error);
      showToast("error", error.message || "Failed to save song. Please check if Firebase is configured correctly.");
    }
  };

  const handleDeleteSong = async (id: string) => {
    const song = allSongs.find(s => s.id === id);
    showConfirm({
      title: "Delete Song",
      message: `Are you sure you want to delete "${song?.title || "this song"}"?`,
      detail: "This action cannot be undone. The song will be permanently removed from the database.",
      confirmText: "Yes, Delete",
      confirmClass: "bg-red-500 hover:bg-red-600",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/songs/${id}`, { method: "DELETE" });
          if (!res.ok) throw new Error("Failed to delete song");

          if (selectedSong?.id === id) {
            setSelectedSong(null);
            setIsEditing(false);
          }
          clearSongsCache();
          fetchSongs();
          showToast("success", "Song deleted successfully.");
          closeConfirm();
        } catch (error) {
          console.error("Failed to delete song", error);
          showToast("error", "Failed to delete song. Please try again.");
          closeConfirm();
        }
      }
    });
  };

  const handleBulkDelete = async () => {
    if (selectedSongIds.length === 0) return;
    showConfirm({
      title: "Bulk Delete Songs",
      message: `Are you sure you want to delete ${selectedSongIds.length} selected song(s)?`,
      detail: "This will permanently remove all selected items from your directory.",
      confirmText: `Delete ${selectedSongIds.length} Songs`,
      confirmClass: "bg-red-500 hover:bg-red-600",
      onConfirm: async () => {
        try {
          await Promise.all(selectedSongIds.map(id => fetch(`/api/songs/${id}`, { method: "DELETE" })));
          setSelectedSongIds([]);
          setIsSelectionMode(false);
          clearSongsCache();
          fetchSongs();
          showToast("success", `${selectedSongIds.length} songs deleted successfully.`);
          closeConfirm();
        } catch (error) {
          console.error("Failed to delete songs", error);
          showToast("error", "Failed to delete some songs. Please try again.");
          closeConfirm();
        }
      }
    });
  };

  const toggleSongSelection = (id: string) => {
    setSelectedSongIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName, color: newTagColor }),
      });
      setNewTagName("");
      fetchTags();
    } catch (error) {
      console.error("Failed to create tag", error);
    }
  };

  const handleDeleteTag = async (id: string) => {
    showConfirm({
      title: "Delete Tag",
      message: "Are you sure you want to delete this tag?",
      detail: "This will remove the tag from all songs that use it. This action cannot be undone.",
      confirmText: "Delete Tag",
      confirmClass: "bg-red-500 hover:bg-red-600",
      onConfirm: async () => {
        try {
          await fetch(`/api/tags/${id}`, { method: "DELETE" });
          clearSongsCache();
          fetchSongs();
          showToast("success", "Tag deleted successfully.");
          closeConfirm();
        } catch (error) {
          console.error("Failed to delete tag", error);
          showToast("error", "Failed to delete tag.");
          closeConfirm();
        }
      }
    });
  };

  const openEditor = (song?: Song) => {
    if (song) {
      setSelectedSong(song);
      setEditTitle(song.title);
      setEditArtist(song.artist || "");
      setEditVideoUrl(song.video_url || "");
      setEditLyrics(song.lyrics);
      setEditChords(song.chords);
      setEditTags(Array.isArray(song.tags) ? song.tags.map((t) => t.id) : []);
    } else {
      setSelectedSong(null);
      setEditTitle("");
      setEditArtist("");
      setEditVideoUrl("");
      setEditLyrics(LYRICS_TEMPLATE);
      setEditChords(CHORDS_TEMPLATE);
      setEditTags([]);
    }
    setIsEditing(true);
    setFormErrors({});
  };

  const toggleTagSelection = (tagId: string) => {
    // Single-select: clicking active tag deselects, clicking another replaces
    setEditTags((prev) =>
      prev.includes(tagId) ? [] : [tagId]
    );
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "lyrics" | "chords") => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOcrLoading(type);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(",")[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64Data,
          mimeType: file.type,
          type
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "OCR failed on server");
      }

      const data = await response.json();
      const extractedText = data.text?.replace(/\*\*/g, "");
      if (extractedText) {
        if (type === "lyrics") {
          setEditLyrics(extractedText);
        } else {
          setEditChords(extractedText);
        }
      }
    } catch (error) {
      console.error("OCR failed", error);
      showToast("error", "Failed to extract text from image. Please try again.");
    } finally {
      setIsOcrLoading(null);
      if (e.target) e.target.value = "";
    }
  };

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

          {/* Dashboard — coming soon */}
          <div
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium opacity-40 cursor-not-allowed select-none text-gray-500 dark:text-gray-500 ${isSidebarCollapsed ? "justify-center" : ""}`}
            title="Dashboard — Coming Soon"
          >
            <LayoutGrid size={20} className="shrink-0" />
            {!isSidebarCollapsed && (
              <span className="flex items-center gap-2">
                Dashboard
                <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full">Soon</span>
              </span>
            )}
          </div>

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
            onClick={() => setCurrentView("schedule")}
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

          {/* Admin Panel — admin only, always hidden for QA Specialist */}
          {isAdmin && !isQA && (
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
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="flex items-center justify-center p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
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
              {currentView === "schedule" ? "Scheduling" : currentView === "members" ? "Team Members" : currentView === "admin" ? "Team Access" : "Song Management"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Team Notes */}
            <NotesPanel
              userId={user?.uid ?? ""}
              userName={user?.displayName ?? user?.email ?? "Unknown"}
              userPhoto={user?.photoURL ?? ""}
              userRole={userRole}
            />

            {/* Help & Knowledge Base */}
            <HelpPanel isAdmin={isAdmin} />

            {/* Notification Bell */}
            <div ref={notifRef} className="relative">
              <button
                id="notif-bell-btn"
                onClick={() => { setNotifOpen(o => !o); if (!notifOpen && unreadCount > 0) { } }}
                className="relative p-2 rounded-xl text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                title="Notifications"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-0.5 shadow-md animate-pulse">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div
                  className="fixed top-[72px] left-1/2 -translate-x-1/2 sm:absolute sm:top-full sm:mt-2 sm:left-auto sm:translate-x-0 sm:right-0 z-[200] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl overflow-hidden"
                  style={{ width: "min(370px, calc(100vw - 20px))" }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
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

                  {/* List */}
                  <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700/60">
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
              )}

            </div>
            <UserMenu simulatedRole={simulatedRole} onRoleSwitch={handleRoleSwitch} />
          </div>
        </header>

        {/* QA Specialist floating testing indicator */}
        {isQA && simulatedRole !== "qa_specialist" && (
          <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[300] pointer-events-none">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-fuchsia-600/90 backdrop-blur-sm shadow-lg border border-fuchsia-400/30">
              <span className="w-2 h-2 rounded-full bg-fuchsia-300 animate-pulse" />
              <span className="text-xs font-semibold text-white tracking-wide">
                Testing as: {ROLE_BADGE[simulatedRole]?.label ?? simulatedRole}
              </span>
            </div>
          </div>
        )}

        {/* Content Area */}
        <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
          <div className="flex flex-col h-full">
            <div className="flex-1 p-4 sm:p-6 overflow-auto">

              {/* ══════════════════════════════════════════════════════════════
                   SCHEDULING VIEW
              ══════════════════════════════════════════════════════════════ */}
              {currentView === "schedule" ? (() => {
                const todayStr = new Date().toISOString().split("T")[0];
                const year = calendarMonth.getFullYear();
                const month = calendarMonth.getMonth();
                const firstDow = new Date(year, month, 1).getDay();
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                const monthSchedules = allSchedules.filter(s => {
                  const d = new Date(s.date + "T00:00:00");
                  return d.getFullYear() === year && d.getMonth() === month;
                });
                return (
                  <div className="max-w-5xl mx-auto">
                    {/* ── Scheduling Header ── */}
                    <div className="flex flex-col gap-2 mb-4">
                      {/* Row 1: centered month navigation */}
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => setCalendarMonth(new Date(year, month - 1, 1))} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"><ChevronLeft size={18} /></button>
                        <h2 className="font-bold text-gray-900 dark:text-white text-lg min-w-[140px] text-center">
                          {calendarMonth.toLocaleDateString("en", { month: "long", year: "numeric" })}
                        </h2>
                        <button onClick={() => setCalendarMonth(new Date(year, month + 1, 1))} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"><ChevronRight size={18} /></button>
                      </div>
                      {/* Row 2: view toggles left | add event right */}
                      <div className="flex items-center justify-between">
                        {/* View toggle — icon-only on <xs, icon+label on sm+ */}
                        <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-0.5 gap-0.5">
                          <button onClick={() => setScheduleView("month")} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all ${scheduleView === "month" ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white"}`}>
                            <Calendar size={14} />
                            <span className="hidden min-[375px]:inline">Month</span>
                          </button>
                          <button onClick={() => setScheduleView("list")} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all ${scheduleView === "list" ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white"}`}>
                            <List size={14} />
                            <span className="hidden min-[375px]:inline">List</span>
                          </button>
                        </div>
                        {/* Add Event button — smart context-aware */}
                        {(() => {
                          const isListView = scheduleView === "list";
                          const hasExisting = selectedDateEvents.length > 0;
                          const hasDate = !!selectedScheduleDate && selectedScheduleDate >= todayStr;
                          const isPast = !!selectedScheduleDate && selectedScheduleDate < todayStr;
                          const isEditingExistingEvent = schedPanelMode === "edit" && !!selectedEventId;
                          const isFormOpen = schedPanelMode === "edit"; // true for both new & existing event form
                          // Enable only in month view, future empty date, form not already open
                          const canAdd = (canWriteSchedule || leaderCanAddOnDate) && !isListView && hasDate && !hasExisting && !isFormOpen;
                          const label = isListView || hasExisting ? "Add Another Event" : "Add Event";
                          const disabledTitle = (!canWriteSchedule && !isLeader)
                            ? "You don't have permission to add events"
                            : (isLeader && !leaderCanAddOnDate)
                              ? "Worship Leaders can only add Sunday or Midweek Service events"
                              : isFormOpen
                                ? "Close the current form before adding a new event"
                                : isListView
                                  ? "Switch to Month view to add events"
                                  : hasExisting ? "This date already has events — open a card to edit"
                                    : isPast ? "Past date — cannot add events"
                                      : "Select an empty date on the calendar first";
                          if (canAdd) {
                            return (
                              <button onClick={() => { setSelectedEventId(null); setSchedPanelMode("edit"); openBlankEventForm(selectedScheduleDate!); }}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-medium transition-colors">
                                <Plus size={16} /> {label}
                              </button>
                            );
                          }
                          return (
                            <button disabled title={disabledTitle}
                              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed select-none">
                              <Plus size={16} /> {label}
                            </button>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="flex gap-4 relative">
                      <div className="flex-1 min-w-0">
                        {scheduleView === "month" ? (
                          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-700">
                              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                                <div key={d} className="py-2 text-center text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{d}</div>
                              ))}
                            </div>
                            <div className="grid grid-cols-7">
                              {Array.from({ length: firstDow }).map((_, i) => (
                                <div key={`e${i}`} className="min-h-[70px] border-b border-r border-gray-200 dark:border-gray-700/50" />
                              ))}
                              {Array.from({ length: daysInMonth }).map((_, i) => {
                                const day = i + 1;
                                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                                const schedEvents = dateEventsMap[dateStr] ?? [];
                                const isToday = dateStr === todayStr;
                                const isSelected = dateStr === selectedScheduleDate;
                                const isCellPast = dateStr < todayStr;
                                const cellHasEvents = schedEvents.length > 0;
                                return (
                                  <button
                                    key={dateStr}
                                    onClick={() => openScheduleEditor(dateStr)}
                                    title={isCellPast && !cellHasEvents ? "Past date — no new events can be added" : undefined}
                                    className={`group relative min-h-[70px] border-b border-r border-gray-200 dark:border-gray-700/50 p-1.5 text-left transition-colors ${isCellPast && !cellHasEvents ? "opacity-40 cursor-not-allowed" : "hover:bg-indigo-50 dark:hover:bg-indigo-900/20"} ${isSelected ? "bg-indigo-50 dark:bg-indigo-900/30" : ""}`}
                                  >
                                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium mb-1 ${isToday ? "bg-indigo-600 text-white" : "text-gray-700 dark:text-gray-300"}`}>{day}</span>
                                    {!isCellPast && (canWriteSchedule || (isLeader && isServiceDay(dateStr))) && (
                                      <span
                                        onClick={e => { e.stopPropagation(); openBlankEventForm(dateStr); }}
                                        className="hidden sm:flex absolute top-1.5 right-1.5 w-5 h-5 items-center justify-center rounded-full bg-indigo-600 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:bg-indigo-700"
                                        title="Add event on this day"
                                      >+</span>
                                    )}
                                    {schedEvents.length > 0 && (() => {
                                      const palette = [
                                        { dot: "bg-indigo-500", text: "text-indigo-600 dark:text-indigo-400" },
                                        { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
                                        { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
                                        { dot: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" },
                                        { dot: "bg-violet-500", text: "text-violet-600 dark:text-violet-400" },
                                      ];
                                      if (schedEvents.length >= 3) {
                                        return (
                                          <div className="flex flex-col gap-0.5">
                                            <p className="text-[10px] font-semibold text-fuchsia-600 dark:text-fuchsia-300 leading-tight">● {schedEvents.length} events</p>
                                          </div>
                                        );
                                      }
                                      return (
                                        <div className="flex flex-col gap-0.5">
                                          {schedEvents.map((ev, ei) => {
                                            const nm = (ev as any).eventName || (ev.serviceType === "sunday" ? "Sunday Service" : "Midweek Service");
                                            const clr = palette[ei % palette.length];
                                            return (
                                              <div key={ei} className="flex items-center gap-0.5">
                                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${clr.dot}`} />
                                                <p className={`text-[10px] font-medium truncate leading-tight ${clr.text}`}>{nm}</p>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      );
                                    })()}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          /* LIST VIEW */
                          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                            {monthSchedules.length === 0 ? (
                              <div className="text-center py-16 text-gray-400">
                                <Calendar size={40} className="mx-auto mb-3 opacity-40" />
                                <p className="font-semibold">No events this month</p>
                                <p className="text-sm mt-1">Click a date on the calendar to add one.</p>
                              </div>
                            ) : (
                              <div className={`grid gap-px bg-gray-100 dark:bg-gray-700 ${selectedScheduleDate ? "grid-cols-1 md:grid-cols-1 lg:grid-cols-2" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"}`}>
                                {monthSchedules.sort((a, b) => a.date.localeCompare(b.date)).map(s => {
                                  const d = new Date(s.date + "T00:00:00");
                                  const isPast = s.date < todayStr;
                                  const evName = (s as any).eventName || (s.serviceType === "sunday" ? "Sunday Service" : "Midweek Service");
                                  return (
                                    <div key={s.id} className={`relative flex items-center gap-4 p-4 cursor-pointer group transition-colors ${selectedEventId === s.id ? "bg-indigo-50 dark:bg-indigo-900/30 border-l-4 border-indigo-500" : "bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 border-l-4 border-transparent"}`} onClick={() => openEventById(s.id, s.date)}>
                                      {/* Date badge */}
                                      <div className={`shrink-0 rounded-xl px-3 py-2 text-center min-w-[52px] ${isPast ? "bg-gray-100 dark:bg-gray-700" : "bg-indigo-50 dark:bg-indigo-900/30"}`}>
                                        <div className={`text-xs font-semibold uppercase ${isPast ? "text-gray-400" : "text-indigo-500"}`}>{d.toLocaleDateString("en", { month: "short" })}</div>
                                        <div className={`text-xl font-bold leading-none ${isPast ? "text-gray-400 dark:text-gray-500" : "text-indigo-700 dark:text-indigo-300"}`}>{d.getDate()}</div>
                                        <div className={`text-[10px] ${isPast ? "text-gray-400" : "text-indigo-400"}`}>{d.toLocaleDateString("en", { weekday: "short" })}</div>
                                      </div>
                                      {/* Event info */}
                                      <div className="flex-1 min-w-0 pr-7">
                                        <p className="font-semibold text-gray-900 dark:text-white text-sm">{eventEmoji(evName)} {evName}</p>
                                        {s.worshipLeader && <p className="text-xs text-gray-500 mt-0.5">{s.worshipLeader.name}</p>}
                                        {s.notes && <p className="text-xs text-gray-400 truncate mt-0.5">{s.notes}</p>}
                                      </div>
                                      {/* Copy button */}
                                      <button
                                        type="button"
                                        title="Copy event details"
                                        onClick={e => {
                                          e.stopPropagation();
                                          const dateLabel = d.toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" });
                                          const isServiceEvt = ["sunday service", "midweek service"].includes(evName.toLowerCase());
                                          const lines: string[] = [evName, dateLabel];
                                          if (isServiceEvt) {
                                            if (s.worshipLeader) { lines.push(""); lines.push(`Worship Leader: ${s.worshipLeader.name}`); }
                                            const bs = (s.backupSingers || []);
                                            if (bs.length > 0) { lines.push(""); lines.push(`Backup Singers: ${bs.map((b: any) => b.name).join(", ")}`); }
                                            const mu = (s.musicians || []);
                                            if (mu.length > 0) { lines.push(""); lines.push(`Musicians / Instruments: ${mu.map((m: any) => `${m.name} (${m.role})`).join(", ")}`); }
                                            const jSong = allSongs.find(sg => sg.id === s.songLineup?.joyful);
                                            const sSong = allSongs.find(sg => sg.id === s.songLineup?.solemn);
                                            if (jSong || sSong) {
                                              lines.push(""); lines.push("Song Line-up:");
                                              if (jSong) { lines.push(`Joyful: ${jSong.title}${jSong.artist ? ` - ${jSong.artist}` : ""}`); if (jSong.video_url) lines.push(`Link: ${jSong.video_url}`); }
                                              if (sSong) { lines.push(""); lines.push(`Solemn: ${sSong.title}${sSong.artist ? ` - ${sSong.artist}` : ""}`); if (sSong.video_url) lines.push(`Link: ${sSong.video_url}`); }
                                            }
                                          } else {
                                            (s.assignments || []).forEach((a: any) => { lines.push(""); lines.push(`${a.role}: ${(a.members || []).map((m: any) => m.name).join(", ") || "(none)"}`); });
                                          }
                                          if (s.notes) { lines.push(""); lines.push("*Notes:"); lines.push(s.notes); }
                                          navigator.clipboard.writeText(lines.join("\n")).then(() => showToast("success", "Copied!"));
                                        }}
                                        className="absolute top-3 right-3 p-1.5 text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400 opacity-40 sm:opacity-0 sm:group-hover:opacity-100 transition-all rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                                      >
                                        <Copy size={14} />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* SIDE PANEL */}
                      {selectedScheduleDate && (selectedDateEvents.length > 0 || schedPanelMode === "edit") && (
                        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={closeScheduleEditor} />
                      )}
                      {selectedScheduleDate && (selectedDateEvents.length > 0 || schedPanelMode === "edit") && (() => {
                        const isDatePast = selectedScheduleDate < todayStr;
                        const showDayView = selectedDateEvents.length >= 2 && !selectedEventId && schedPanelMode !== "edit";
                        if (showDayView) {
                          const dateLabel = new Date(selectedScheduleDate + "T00:00:00").toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
                          return (
                            <div className="fixed bottom-0 left-0 right-0 z-50 md:static md:z-auto w-full md:w-80 md:shrink-0 bg-white dark:bg-gray-800 rounded-t-3xl md:rounded-2xl border-t border-gray-200 dark:border-gray-700 md:border p-5 max-h-[85dvh] md:max-h-[calc(100vh-200px)] overflow-y-auto md:self-start md:sticky md:top-0">
                              <div className="flex items-center justify-between mb-4">
                                <div>
                                  <h3 className="font-bold text-gray-900 dark:text-white text-base">{dateLabel.split(",")[0]}</h3>
                                  <p className="text-xs text-indigo-500 font-medium mt-0.5">{dateLabel}</p>
                                </div>
                                <button onClick={closeScheduleEditor} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"><X size={18} /></button>
                              </div>
                              <div className="space-y-2 mb-4">
                                {selectedDateEvents.map(ev => {
                                  const evName = (ev as any).eventName || (ev.serviceType === "sunday" ? "Sunday Service" : "Midweek Service");
                                  return (
                                    <button key={ev.id} onClick={() => openEventById(ev.id, selectedScheduleDate!)}
                                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-100 dark:border-gray-700 hover:border-indigo-300 transition-all text-left">
                                      <span className="text-xl">{eventEmoji(evName)}</span>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{evName}</p>
                                        {ev.worshipLeader && <p className="text-xs text-gray-400 truncate">{ev.worshipLeader.name}</p>}
                                      </div>
                                      <ChevronRight size={16} className="text-gray-400 shrink-0" />
                                    </button>
                                  );
                                })}
                              </div>
                              {!isDatePast && (
                                <button onClick={() => openBlankEventForm(selectedScheduleDate!)}
                                  className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-sm font-medium transition-colors">
                                  <Plus size={16} /> Add Another Event
                                </button>
                              )}
                            </div>
                          );
                        }
                        // Single event panel
                        const isServiceEvent = ["sunday service", "midweek service"].includes(editSchedEventName.toLowerCase());
                        const dow = selectedScheduleDate ? new Date(selectedScheduleDate + "T00:00:00").getDay() : -1;
                        // Leaders see only the relevant service preset; others see full list
                        const presets = isLeader
                          ? (dow === 0 ? ["Sunday Service"] : ["Midweek Service"])
                          : dow === 0
                            ? ["Sunday Service", "Prayer Night", "Worship Night", "Youth Service", "Revival"]
                            : ["Midweek Service", "Prayer Night", "Worship Night", "Youth Service", "Revival"];
                        const pickerMembers = schedMemberSearch.trim()
                          ? allMembers.filter(m => m.name.toLowerCase().includes(schedMemberSearch.toLowerCase()))
                          : allMembers;
                        return (
                          <div className="fixed bottom-0 left-0 right-0 z-50 md:static md:z-auto w-full md:w-80 md:shrink-0 bg-white dark:bg-gray-800 rounded-t-3xl md:rounded-2xl border-t border-gray-200 dark:border-gray-700 md:border p-5 max-h-[85dvh] md:max-h-[calc(100vh-200px)] overflow-y-auto md:self-start md:sticky md:top-0">
                            {isDatePast && (
                              <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl px-3 py-2 mb-3 text-xs text-amber-700 dark:text-amber-400">
                                <Lock size={13} className="shrink-0" /><span>This date has passed — view only</span>
                              </div>
                            )}
                            {selectedDateEvents.length >= 2 && selectedEventId && (
                              <button onClick={() => { setSelectedEventId(null); setSchedPanelMode("view"); }}
                                className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium mb-3 transition-colors">
                                <ChevronLeft size={14} /> All events this day
                              </button>
                            )}
                            <div className="flex items-center justify-between mb-4">
                              <div>
                                <h3 className="font-bold text-gray-900 dark:text-white text-base">
                                  {schedPanelMode === "view" && editingExisting
                                    ? `${eventEmoji(editSchedEventName)} ${editSchedEventName}`
                                    : editingExisting ? "Edit Event" : "New Event"}
                                </h3>
                                <p className="text-xs text-indigo-500 font-medium mt-0.5">
                                  {new Date(selectedScheduleDate + "T00:00:00").toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                                </p>
                              </div>
                              <div className="flex items-center gap-1">
                                {schedPanelMode === "view" && editingExisting && !isDatePast && (canWriteSchedule || leaderCanEditEvent) && (
                                  <button onClick={() => setSchedPanelMode("edit")} className="p-1.5 text-gray-400 hover:text-indigo-500 rounded-lg transition-colors"><Pencil size={16} /></button>
                                )}
                                {editingExisting && (
                                  <button onClick={() => {
                                    const label = editSchedEventName || "Event";
                                    const dateLabel = new Date(selectedScheduleDate + "T00:00:00").toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" });
                                    const isServiceEvtCopy = ["sunday service", "midweek service"].includes(label.toLowerCase());
                                    const lines: string[] = [];
                                    lines.push(label);
                                    lines.push(dateLabel);
                                    if (isServiceEvtCopy) {
                                      if (editSchedWorshipLeader) { lines.push(""); lines.push(`Worship Leader: ${editSchedWorshipLeader.name}`); }
                                      if (editSchedBackupSingers.length > 0) { lines.push(""); lines.push(`Backup Singers: ${editSchedBackupSingers.map(b => b.name).join(", ")}`); }
                                      if (editSchedMusicians.length > 0) { lines.push(""); lines.push(`Musicians / Instruments: ${editSchedMusicians.map(m => `${m.name} (${m.role})`).join(", ")}`); }
                                      const jSong = allSongs.find(sg => sg.id === editSchedSongLineup.joyful);
                                      const sSong = allSongs.find(sg => sg.id === editSchedSongLineup.solemn);
                                      if (jSong || sSong) {
                                        lines.push(""); lines.push("Song Line-up:");
                                        if (jSong) { lines.push(`Joyful: ${jSong.title}${jSong.artist ? ` - ${jSong.artist}` : ""}`); if (jSong.video_url) lines.push(`Link: ${jSong.video_url}`); }
                                        if (sSong) { lines.push(""); lines.push(`Solemn: ${sSong.title}${sSong.artist ? ` - ${sSong.artist}` : ""}`); if (sSong.video_url) lines.push(`Link: ${sSong.video_url}`); }
                                      }
                                    } else {
                                      editSchedAssignments.forEach(asgn => { lines.push(""); lines.push(`${asgn.role}: ${asgn.members.map(m => m.name).join(", ") || "(none)"}`); });
                                    }
                                    if (editSchedNotes) { lines.push(""); lines.push("*Notes:"); lines.push(editSchedNotes); }
                                    navigator.clipboard.writeText(lines.join("\n")).then(() => showToast("success", "Copied to clipboard!"));
                                  }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"><Copy size={16} /></button>
                                )}
                                <button onClick={closeScheduleEditor} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"><X size={18} /></button>
                              </div>
                            </div>

                            {schedPanelMode === "view" && editingExisting ? (
                              /* ── VIEW MODE ── */
                              <div className="space-y-4">
                                {isServiceEvent && (() => {
                                  // Helper: get live photo from allMembers by memberId
                                  const livePhoto = (memberId: string) => allMembers.find(m => m.id === memberId)?.photo || "";
                                  const Avatar = ({ m, color }: { m: ScheduleMember; color: string }) => {
                                    const photo = livePhoto(m.memberId);
                                    return photo
                                      ? <img src={photo} className="w-9 h-9 rounded-full object-cover shrink-0 ring-2 ring-white dark:ring-gray-800" alt={m.name} />
                                      : <div className="w-9 h-9 rounded-full ${color} flex items-center justify-center text-white text-sm font-bold shrink-0">{m.name[0]}</div>;
                                  };
                                  return (
                                    <>
                                      {editSchedWorshipLeader && (
                                        <div>
                                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Worship Leader</p>
                                          <div className="flex items-center gap-3">
                                            <Avatar m={editSchedWorshipLeader} color="bg-indigo-500" />
                                            <div>
                                              <p className="font-semibold text-sm text-gray-900 dark:text-white">{editSchedWorshipLeader.name}</p>
                                              <p className="text-[11px] text-indigo-400">Worship Leader</p>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                      {editSchedBackupSingers.length > 0 && (
                                        <div>
                                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Backup Singers</p>
                                          <div className="flex flex-col gap-2">
                                            {editSchedBackupSingers.map((m, i) => (
                                              <div key={i} className="flex items-center gap-3">
                                                <Avatar m={m} color="bg-pink-500" />
                                                <div>
                                                  <p className="font-semibold text-sm text-gray-900 dark:text-white">{m.name}</p>
                                                  <p className="text-[11px] text-pink-400">Backup Singer</p>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {editSchedMusicians.length > 0 && (
                                        <div>
                                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Musicians</p>
                                          <div className="flex flex-col gap-2">
                                            {editSchedMusicians.map((m, i) => (
                                              <div key={i} className="flex items-center gap-3">
                                                <Avatar m={m} color="bg-indigo-600" />
                                                <div>
                                                  <p className="font-semibold text-sm text-gray-900 dark:text-white">{m.name}</p>
                                                  <p className="text-[11px] text-teal-400">{m.role}</p>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {(editSchedSongLineup.joyful || editSchedSongLineup.solemn) && (
                                        <div>
                                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Song Line-Up</p>
                                          {editSchedSongLineup.joyful && (() => { const s = allSongs.find(sg => sg.id === editSchedSongLineup.joyful); return s ? <p className="text-sm mb-1"><Sun size={12} className="inline-block mr-1" /> <span className="font-semibold text-amber-500 uppercase text-xs">Joyful</span>{" "}{s.video_url ? <a href={s.video_url} target="_blank" rel="noopener noreferrer" className="text-gray-900 dark:text-white hover:text-amber-500 dark:hover:text-amber-400 underline underline-offset-2 decoration-amber-400/60 transition-colors">{s.title} <span className="inline-block text-[10px] text-amber-400 align-middle">↗</span></a> : <span className="text-gray-900 dark:text-white">{s.title}</span>}</p> : null; })()}
                                          {editSchedSongLineup.solemn && (() => { const s = allSongs.find(sg => sg.id === editSchedSongLineup.solemn); return s ? <p className="text-sm"><Music size={12} className="inline-block mr-1" /> <span className="font-semibold text-indigo-400 uppercase text-xs">Solemn</span>{" "}{s.video_url ? <a href={s.video_url} target="_blank" rel="noopener noreferrer" className="text-gray-900 dark:text-white hover:text-indigo-400 dark:hover:text-indigo-300 underline underline-offset-2 decoration-indigo-400/60 transition-colors">{s.title} <span className="inline-block text-[10px] text-indigo-400 align-middle">↗</span></a> : <span className="text-gray-900 dark:text-white">{s.title}</span>}</p> : null; })()}
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}

                                {editSchedNotes && (
                                  <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Notes</p>
                                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{editSchedNotes}</p>
                                  </div>
                                )}
                                {editSchedAssignments.length > 0 && !isServiceEvent && (
                                  <div className="space-y-3">
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5"><Users size={12} /> Lead Facilitators</p>
                                    {editSchedAssignments.map((asgn, gi) => (
                                      <div key={gi} className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
                                        <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">{asgn.role}</p>
                                        <div className="flex flex-col gap-1.5">
                                          {asgn.members.map((m, mi) => (
                                            <div key={mi} className="flex items-center gap-2">
                                              {(() => {
                                                const p = allMembers.find(mb => mb.id === m.memberId)?.photo || m.photo || ""; return p
                                                  ? <img src={p} className="w-8 h-8 rounded-full object-cover shrink-0 ring-2 ring-white dark:ring-gray-800" alt={m.name} />
                                                  : <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">{m.name[0]}</div>;
                                              })()}
                                              <p className="text-sm text-gray-900 dark:text-white">{m.name}</p>
                                            </div>
                                          ))}
                                          {asgn.members.length === 0 && <p className="text-xs text-gray-400 italic">No members assigned</p>}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : schedPanelMode === "edit" ? (
                              /* ── EDIT / NEW MODE ── */
                              <div className="space-y-4">
                                {/* Event Name */}
                                <div>
                                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Event Name</label>
                                  <div className="flex flex-wrap gap-1.5 mb-2">
                                    {(() => {
                                      return presets.map(preset => (
                                        <button key={preset} type="button" onClick={() => setEditSchedEventName(preset)}
                                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${editSchedEventName === preset ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-500"}`}>
                                          {eventEmoji(preset)} {preset}
                                        </button>
                                      ));
                                    })()}
                                  </div>
                                  {/* Custom event name input — hidden for Worship Leaders */}
                                  {!isLeader && (
                                    <input
                                      type="text" value={editSchedEventName} onChange={e => setEditSchedEventName(e.target.value)}
                                      placeholder="Or type a custom event name…"
                                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
                                    />
                                  )}
                                </div>

                                {/* Grouped Role Assignments — only for NON-service events */}
                                {editSchedEventName.trim() && !isServiceEvent && (
                                  <div className="space-y-3">
                                    <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                      <Users size={12} /> Lead Facilitators
                                    </label>

                                    {/* Existing role assignment groups */}
                                    {editSchedAssignments.map((asgn, gi) => {
                                      const suggestions = asgn.search.trim()
                                        ? allMembers.filter(m =>
                                          m.name.toLowerCase().includes(asgn.search.toLowerCase()) &&
                                          !asgn.members.some(am => am.memberId === m.id)
                                        )
                                        : [];
                                      return (
                                        <div key={gi} className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
                                          {/* Role label row */}
                                          <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">{asgn.role}</span>
                                            <button onClick={() => setEditSchedAssignments(prev => prev.filter((_, j) => j !== gi))}
                                              className="text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors"><X size={14} /></button>
                                          </div>
                                          {/* Assigned member chips */}
                                          {asgn.members.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mb-2">
                                              {asgn.members.map((m, mi) => (
                                                <span key={mi} className="flex items-center gap-1 bg-white dark:bg-gray-700 border border-indigo-200 dark:border-indigo-700 text-gray-800 dark:text-gray-200 text-xs px-2 py-1 rounded-full">
                                                  {m.photo
                                                    ? <img src={m.photo} className="w-4 h-4 rounded-full object-cover" alt="" />
                                                    : <span className="w-4 h-4 rounded-full bg-indigo-400 flex items-center justify-center text-white text-[9px] font-bold shrink-0">{m.name[0]}</span>
                                                  }
                                                  {m.name}
                                                  <button onClick={() => setEditSchedAssignments(prev => prev.map((a, j) => j === gi ? { ...a, members: a.members.filter((_, k) => k !== mi) } : a))}
                                                    className="ml-0.5 text-gray-400 hover:text-red-400 transition-colors"><X size={9} /></button>
                                                </span>
                                              ))}
                                            </div>
                                          )}
                                          {/* Per-role member search */}
                                          <div className="relative">
                                            <input
                                              type="text"
                                              autoFocus={gi === newGroupFocusIdx}
                                              value={asgn.search}
                                              onChange={e => setEditSchedAssignments(prev => prev.map((a, j) => j === gi ? { ...a, search: e.target.value } : a))}
                                              onFocus={() => { if (gi === newGroupFocusIdx) setNewGroupFocusIdx(null); }}
                                              placeholder="Type a name to add…"
                                              className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
                                            />
                                            {/* Auto-suggest dropdown */}
                                            {suggestions.length > 0 && (
                                              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg z-50 max-h-36 overflow-y-auto">
                                                {suggestions.map(m => {
                                                  const memberRole = (m as any).roles?.join(", ") || "Member";
                                                  return (
                                                    <button key={m.id} type="button"
                                                      onMouseDown={e => e.preventDefault()}
                                                      onClick={() => {
                                                        setEditSchedAssignments(prev => prev.map((a, j) => j === gi
                                                          ? { ...a, members: [...a.members, { memberId: m.id, name: m.name, photo: m.photo, role: memberRole }], search: "" }
                                                          : a
                                                        ));
                                                      }}
                                                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors text-left">
                                                      {m.photo
                                                        ? <img src={m.photo} className="w-6 h-6 rounded-full object-cover shrink-0" alt="" />
                                                        : <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">{m.name[0]}</div>
                                                      }
                                                      <div className="min-w-0">
                                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{m.name}</p>
                                                        <p className="text-[10px] text-gray-400 truncate">{memberRole}</p>
                                                      </div>
                                                    </button>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}

                                    {/* Add new role */}
                                    <div className="flex gap-2">
                                      <input
                                        type="text"
                                        value={newRoleInput}
                                        onChange={e => setNewRoleInput(e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === "Enter" && newRoleInput.trim()) {
                                            setEditSchedAssignments(prev => {
                                              const next = [...prev, { role: newRoleInput.trim(), members: [], search: "" }];
                                              setNewGroupFocusIdx(next.length - 1);
                                              return next;
                                            });
                                            setNewRoleInput("");
                                          }
                                        }}
                                        placeholder="Add assignment group (e.g. Food / Beverages)…"
                                        className="flex-1 px-3 py-2 rounded-xl border border-dashed border-indigo-300 dark:border-indigo-600 bg-transparent text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
                                      />
                                      <button
                                        type="button"
                                        disabled={!newRoleInput.trim()}
                                        onClick={() => {
                                          if (newRoleInput.trim()) {
                                            setEditSchedAssignments(prev => {
                                              const next = [...prev, { role: newRoleInput.trim(), members: [], search: "" }];
                                              setNewGroupFocusIdx(next.length - 1);
                                              return next;
                                            });
                                            setNewRoleInput("");
                                          }
                                        }}
                                        className="px-3 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1">
                                        <Plus size={14} /> Add
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Service fields — only for Sunday/Midweek */}
                                {isServiceEvent && (() => {
                                  // Role-based filtering using exact ROLE_CATEGORIES values
                                  const INSTRUMENTALIST_ROLES = ["Drummer", "Bassist", "Rhythm Guitar", "Lead Guitar", "Keys / Pianist"];
                                  const isWLRole = (m: typeof allMembers[0]) => m.roles.includes("Worship Leader");
                                  const isBSRole = (m: typeof allMembers[0]) => m.roles.includes("Backup Singer");
                                  const isMuRole = (m: typeof allMembers[0]) => m.roles.some(r => INSTRUMENTALIST_ROLES.includes(r));
                                  // Exclusions: selected members don't appear in other sections
                                  const wlCandidates = allMembers.filter(m =>
                                    isWLRole(m) &&
                                    m.id !== editSchedWorshipLeader?.memberId &&
                                    !editSchedBackupSingers.some(b => b.memberId === m.id) &&
                                    !editSchedMusicians.some(mu => mu.memberId === m.id)
                                  );
                                  const bsCandidates = allMembers.filter(m =>
                                    isBSRole(m) &&
                                    m.id !== editSchedWorshipLeader?.memberId &&
                                    !editSchedBackupSingers.some(b => b.memberId === m.id) &&
                                    !editSchedMusicians.some(mu => mu.memberId === m.id)
                                  );
                                  const muCandidates = allMembers.filter(m =>
                                    isMuRole(m) &&
                                    m.id !== editSchedWorshipLeader?.memberId &&
                                    !editSchedBackupSingers.some(b => b.memberId === m.id) &&
                                    !editSchedMusicians.some(mu => mu.memberId === m.id)
                                  );
                                  const isMidweek = editSchedEventName.toLowerCase() === "midweek service";
                                  // Filter songs by mood tag, then optionally by search
                                  const joyfulTagged = allSongs.filter(s => s.tags?.some(t => /joyful/i.test(t.name)));
                                  const solemnTagged = allSongs.filter(s => s.tags?.some(t => /solemn/i.test(t.name)));
                                  // Fall back to all songs if no tagged songs found (avoids empty list)
                                  const joyfulBase = joyfulTagged.length > 0 ? joyfulTagged : allSongs;
                                  const solemnBase = solemnTagged.length > 0 ? solemnTagged : allSongs;
                                  const joyfulSongs = joyfulSearch.trim()
                                    ? joyfulBase.filter(s => s.title.toLowerCase().includes(joyfulSearch.toLowerCase()) || s.artist?.toLowerCase().includes(joyfulSearch.toLowerCase()))
                                    : joyfulBase;
                                  const solemnSongs = solemnSearch.trim()
                                    ? solemnBase.filter(s => s.title.toLowerCase().includes(solemnSearch.toLowerCase()) || s.artist?.toLowerCase().includes(solemnSearch.toLowerCase()))
                                    : solemnBase;
                                  return (
                                    <>
                                      {/* ── WORSHIP LEADER ─────────────────────── */}
                                      <div>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Worship Leader</p>
                                        {editSchedWorshipLeader && (
                                          <div className="flex items-center gap-3 bg-indigo-500/10 dark:bg-indigo-900/30 border border-indigo-300 dark:border-indigo-700 rounded-xl px-3 py-2.5 mb-2">
                                            {editSchedWorshipLeader.photo
                                              ? <img src={editSchedWorshipLeader.photo} className="w-9 h-9 rounded-full object-cover shrink-0" alt="" />
                                              : <div className="w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center text-white text-sm font-bold shrink-0">{editSchedWorshipLeader.name[0]}</div>
                                            }
                                            <div className="flex-1 min-w-0">
                                              <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{editSchedWorshipLeader.name}</p>
                                              <p className="text-[11px] text-indigo-500 dark:text-indigo-400">Worship Leader</p>
                                            </div>
                                            <button onClick={() => setEditSchedWorshipLeader(null)} className="text-gray-400 hover:text-red-400 transition-colors shrink-0"><X size={16} /></button>
                                          </div>
                                        )}
                                        <div className="space-y-0.5 max-h-44 overflow-y-auto pr-1">
                                          {wlCandidates.map(m => {
                                            const memberRoles = ((m as any).roles || []).join(", ") || "Member";
                                            return (
                                              <button key={m.id} type="button"
                                                onClick={() => setEditSchedWorshipLeader({ memberId: m.id, name: m.name, photo: m.photo, role: "Worship Leader" })}
                                                className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors">
                                                {m.photo
                                                  ? <img src={m.photo} className="w-9 h-9 rounded-full object-cover shrink-0" alt="" />
                                                  : <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold shrink-0">{m.name[0]}</div>
                                                }
                                                <div className="flex-1 text-left min-w-0">
                                                  <p className="font-semibold text-sm truncate text-gray-900 dark:text-white">{m.name}</p>
                                                  <p className="text-[10px] text-gray-400 truncate">{memberRoles}</p>
                                                </div>
                                                <Plus size={18} className="text-gray-400 shrink-0" />
                                              </button>
                                            );
                                          })}
                                          {wlCandidates.length === 0 && !editSchedWorshipLeader && <p className="text-xs text-gray-400 italic px-2">No members with Worship Leader role found</p>}
                                        </div>
                                      </div>

                                      {/* ── BACKUP SINGERS ─────────────────────── */}
                                      <div>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Backup Singers</p>
                                        {editSchedBackupSingers.length > 0 && (
                                          <div className="space-y-1.5 mb-2">
                                            {editSchedBackupSingers.map((bs, i) => (
                                              <div key={i} className="flex items-center gap-3 bg-pink-500/10 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800 rounded-xl px-3 py-2">
                                                {bs.photo
                                                  ? <img src={bs.photo} className="w-8 h-8 rounded-full object-cover shrink-0" alt="" />
                                                  : <div className="w-8 h-8 rounded-full bg-pink-500 flex items-center justify-center text-white text-xs font-bold shrink-0">{bs.name[0]}</div>
                                                }
                                                <p className="flex-1 font-semibold text-sm text-gray-900 dark:text-white truncate">{bs.name}</p>
                                                <span className="text-[11px] font-medium text-pink-500 shrink-0">Backup Singer</span>
                                                <button onClick={() => setEditSchedBackupSingers(prev => prev.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400 ml-1 shrink-0"><X size={15} /></button>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        <div className="space-y-0.5 max-h-36 overflow-y-auto pr-1">
                                          {bsCandidates.map(m => {
                                            const memberRoles = ((m as any).roles || []).join(", ") || "Member";
                                            return (
                                              <button key={m.id} type="button"
                                                onClick={() => setEditSchedBackupSingers(prev => [...prev, { memberId: m.id, name: m.name, photo: m.photo, role: "Backup Singer" }])}
                                                className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors">
                                                {m.photo
                                                  ? <img src={m.photo} className="w-9 h-9 rounded-full object-cover shrink-0" alt="" />
                                                  : <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-sm font-bold shrink-0">{m.name[0]}</div>
                                                }
                                                <div className="flex-1 text-left min-w-0">
                                                  <p className="font-semibold text-sm truncate text-gray-900 dark:text-white">{m.name}</p>
                                                  <p className="text-[10px] text-gray-400 truncate">{memberRoles}</p>
                                                </div>
                                                <Plus size={18} className="text-gray-400 shrink-0" />
                                              </button>
                                            );
                                          })}
                                          {bsCandidates.length === 0 && editSchedBackupSingers.length === 0 && <p className="text-xs text-gray-400 italic px-2">No members with Backup Singer role found</p>}
                                        </div>
                                      </div>

                                      {/* ── MUSICIANS / INSTRUMENTS ─────────────── */}
                                      <div>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Musicians / Instruments</p>
                                        {editSchedMusicians.length > 0 && (
                                          <div className="space-y-1.5 mb-2">
                                            {editSchedMusicians.map((mu, i) => (
                                              <div key={i} className="flex items-center gap-3 bg-indigo-600/10 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-xl px-3 py-2">
                                                {mu.photo
                                                  ? <img src={mu.photo} className="w-8 h-8 rounded-full object-cover shrink-0" alt="" />
                                                  : <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">{mu.name[0]}</div>
                                                }
                                                <div className="flex-1 min-w-0">
                                                  <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{mu.name}</p>
                                                  <p className="text-[11px] text-indigo-500 dark:text-indigo-400 truncate">{mu.role}</p>
                                                </div>
                                                <button onClick={() => setEditSchedMusicians(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-400 shrink-0"><X size={15} /></button>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        <div className="space-y-0.5 max-h-44 overflow-y-auto pr-1">
                                          {muCandidates.map(m => {
                                            const memberRoles: string[] = ((m as any).roles || []).filter((r: string) => r.trim());
                                            const isPending = pendingRolePick?.m.id === m.id;
                                            return (
                                              <div key={m.id}>
                                                <button type="button"
                                                  onClick={() => {
                                                    if (memberRoles.length <= 1) {
                                                      setEditSchedMusicians(prev => [...prev, { memberId: m.id, name: m.name, photo: m.photo, role: memberRoles[0] || "Musician" }]);
                                                      setPendingRolePick(null);
                                                    } else {
                                                      setPendingRolePick(isPending ? null : { m, roles: memberRoles });
                                                    }
                                                  }}
                                                  className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl transition-colors ${isPending ? "bg-indigo-50 dark:bg-indigo-900/30" : "hover:bg-gray-50 dark:hover:bg-gray-700/60"}`}>
                                                  {m.photo
                                                    ? <img src={m.photo} className="w-9 h-9 rounded-full object-cover shrink-0" alt="" />
                                                    : <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-400 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0">{m.name[0]}</div>
                                                  }
                                                  <div className="flex-1 text-left min-w-0">
                                                    <p className="font-semibold text-sm truncate text-gray-900 dark:text-white">{m.name}</p>
                                                    <p className="text-[10px] text-gray-400 truncate">{memberRoles.join(", ") || "Musician"}</p>
                                                  </div>
                                                  {memberRoles.length > 1
                                                    ? <span className="text-[10px] text-indigo-400 shrink-0 font-medium">{isPending ? "▲ pick role" : "▼ pick role"}</span>
                                                    : <Plus size={18} className="text-gray-400 shrink-0" />
                                                  }
                                                </button>
                                                {isPending && (
                                                  <div className="px-2.5 pb-2 pt-1 flex flex-wrap gap-1.5">
                                                    {memberRoles.map(role => (
                                                      <button key={role} type="button"
                                                        onClick={() => {
                                                          setEditSchedMusicians(prev => [...prev, { memberId: m.id, name: m.name, photo: m.photo, role }]);
                                                          setPendingRolePick(null);
                                                        }}
                                                        className="px-2.5 py-1 text-[11px] font-medium rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors border border-indigo-200 dark:border-indigo-700">
                                                        {role}
                                                      </button>
                                                    ))}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                          {muCandidates.length === 0 && editSchedMusicians.length === 0 && <p className="text-xs text-gray-400 italic px-2">No members with instrument roles found</p>}
                                        </div>
                                      </div>

                                      {/* ── SONG LINE-UP ─────────────────────────── */}
                                      <div>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Song Line-Up</p>
                                        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-3 py-2.5 mb-3 text-xs text-amber-700 dark:text-amber-400">
                                          <BookOpen size={14} className="shrink-0" />
                                          <span>Add new songs in <strong className="text-amber-800 dark:text-amber-300">Song Management</strong> before building the lineup, especially for new songs.</span>
                                        </div>

                                        {/* Joyful — hidden for Midweek Service */}
                                        {!isMidweek && (
                                          <div className="mb-3">
                                            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1.5 flex items-center gap-1.5"><Sun size={12} /> JOYFUL <span className="text-gray-400 font-normal normal-case">(pick one)</span></p>
                                            <input type="text" value={joyfulSearch} onChange={e => setJoyfulSearch(e.target.value)}
                                              placeholder="Search joyful songs…"
                                              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder-gray-400 mb-2" />
                                            <div className="space-y-0.5 max-h-40 overflow-y-auto pr-1">
                                              {joyfulSongs.map(sg => (
                                                <button key={sg.id} type="button"
                                                  onClick={() => setEditSchedSongLineup(prev => ({ ...prev, joyful: prev.joyful === sg.id ? undefined : sg.id }))}
                                                  className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-sm transition-colors ${editSchedSongLineup.joyful === sg.id ? "bg-amber-500 text-white" : "hover:bg-gray-50 dark:hover:bg-gray-700/60 text-gray-900 dark:text-white"}`}>
                                                  <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${editSchedSongLineup.joyful === sg.id ? "border-white" : "border-gray-300 dark:border-gray-500"}`}>
                                                    {editSchedSongLineup.joyful === sg.id && <div className="w-2 h-2 rounded-full bg-white" />}
                                                  </div>
                                                  <div className="flex-1 text-left min-w-0">
                                                    <p className="font-medium truncate">{sg.title}</p>
                                                    {sg.artist && <p className={`text-[11px] truncate ${editSchedSongLineup.joyful === sg.id ? "text-amber-100" : "text-gray-400"}`}>{sg.artist}</p>}
                                                  </div>
                                                </button>
                                              ))}
                                            </div>
                                          </div>
                                        )}

                                        {/* Solemn */}
                                        <div>
                                          <p className="text-xs font-semibold text-indigo-500 dark:text-indigo-400 mb-1.5 flex items-center gap-1.5"><Music size={12} /> SOLEMN <span className="text-gray-400 font-normal normal-case">(pick one)</span></p>
                                          <input type="text" value={solemnSearch} onChange={e => setSolemnSearch(e.target.value)}
                                            placeholder="Search solemn songs…"
                                            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400 mb-2" />
                                          <div className="space-y-0.5 max-h-40 overflow-y-auto pr-1">
                                            {solemnSongs.map(sg => (
                                              <button key={sg.id} type="button"
                                                onClick={() => setEditSchedSongLineup(prev => ({ ...prev, solemn: prev.solemn === sg.id ? undefined : sg.id }))}
                                                className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-sm transition-colors ${editSchedSongLineup.solemn === sg.id ? "bg-indigo-600 text-white" : "hover:bg-gray-50 dark:hover:bg-gray-700/60 text-gray-900 dark:text-white"}`}>
                                                <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${editSchedSongLineup.solemn === sg.id ? "border-white" : "border-gray-300 dark:border-gray-500"}`}>
                                                  {editSchedSongLineup.solemn === sg.id && <div className="w-2 h-2 rounded-full bg-white" />}
                                                </div>
                                                <div className="flex-1 text-left min-w-0">
                                                  <p className="font-medium truncate">{sg.title}</p>
                                                  {sg.artist && <p className={`text-[11px] truncate ${editSchedSongLineup.solemn === sg.id ? "text-indigo-200" : "text-gray-400"}`}>{sg.artist}</p>}
                                                </div>
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    </>
                                  );
                                })()}

                                {/* Notes */}
                                <div>
                                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Notes / Announcements</label>
                                  <textarea value={editSchedNotes} onChange={e => setEditSchedNotes(e.target.value)} rows={3}
                                    placeholder="Add notes, reminders, or announcements…"
                                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400 resize-none" />
                                </div>

                                {/* Save / Delete */}
                                {!isDatePast && (
                                  <div className="flex flex-col gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                                    <button onClick={handleSaveSchedule} disabled={isSavingSchedule}
                                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60">
                                      {isSavingSchedule ? "Saving…" : editingExisting ? "Update Event" : "Save Event"}
                                    </button>
                                    {editingExisting && (
                                      <button onClick={handleDeleteSchedule} className="w-full py-2 text-red-500 hover:text-red-600 text-sm font-medium rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                        Remove Event
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })() : null}

              {/* ══════════════════════════════════════════════════════════════
                   ADMIN PANEL VIEW
              ══════════════════════════════════════════════════════════════ */}
              {currentView === "admin" ? (
                <AdminPanel />
              ) : currentView === "members" ? (
                <div className="max-w-5xl mx-auto">

                  {/* ── Camera Modal ── */}
                  {showCameraModal && (
                    <div className="fixed inset-0 bg-black/80 z-[999] flex items-center justify-center p-4" onClick={closeCamera}>
                      <div className="bg-gray-900 rounded-2xl overflow-hidden w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                          <p className="text-white font-semibold flex items-center gap-2"><Camera size={16} className="text-indigo-400" /> Take a Photo</p>
                          <button onClick={closeCamera} className="p-1.5 text-gray-400 hover:text-white rounded-lg transition-colors"><X size={18} /></button>
                        </div>
                        {cameraError ? (
                          <div className="p-8 text-center">
                            <Camera size={40} className="mx-auto mb-3 text-gray-600" />
                            <p className="text-sm text-red-400">{cameraError}</p>
                            <button onClick={closeCamera} className="mt-4 px-4 py-2 bg-gray-700 text-white rounded-xl text-sm hover:bg-gray-600 transition-colors">Close</button>
                          </div>
                        ) : (
                          <>
                            <div className="relative bg-black" style={{ aspectRatio: "3/4" }}>
                              <video ref={cameraVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                              {/* Rule-of-thirds grid */}
                              <div className="absolute inset-0 pointer-events-none" style={{
                                backgroundImage: `
                                  linear-gradient(to right, rgba(255,255,255,0.25) 1px, transparent 1px),
                                  linear-gradient(to bottom, rgba(255,255,255,0.25) 1px, transparent 1px)
                                `,
                                backgroundSize: "33.333% 33.333%"
                              }} />
                            </div>
                            <div className="flex items-center justify-center gap-4 p-4">
                              <button onClick={closeCamera} className="px-4 py-2 rounded-xl bg-gray-700 text-white text-sm hover:bg-gray-600 transition-colors">Cancel</button>
                              <button
                                onClick={snapPhoto}
                                className="w-14 h-14 rounded-full bg-white border-4 border-indigo-500 flex items-center justify-center hover:bg-indigo-50 transition-colors shadow-lg"
                                title="Take Photo"
                              >
                                <Camera size={22} className="text-indigo-600" />
                              </button>
                              <div className="w-20" /> {/* spacer for balance */}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Member Form ── */}
                  {isEditingMember ? (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold">{selectedMember ? "Edit Member" : "Add Member"}</h2>
                        <button onClick={() => setIsEditingMember(false)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"><X size={22} /></button>
                      </div>

                      <div className="space-y-6">
                        {/* Photo upload */}
                        <div className="flex flex-col items-center gap-2">
                          {/* Avatar — click to open camera */}
                          <div
                            onClick={openCamera}
                            className="relative w-28 h-28 rounded-full overflow-hidden border-4 border-indigo-200 dark:border-indigo-700 bg-gray-100 dark:bg-gray-700 cursor-pointer hover:border-indigo-400 transition-colors group"
                          >
                            {editMemberPhoto ? (
                              <img src={editMemberPhoto} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-400 group-hover:text-indigo-400 transition-colors px-2">
                                <Camera size={24} />
                                <span className="text-[9px] text-center leading-tight">Click to open camera</span>
                              </div>
                            )}
                            {/* Hover overlay */}
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Camera size={20} className="text-white" />
                            </div>
                            {isUploadingPhoto && (
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                <Loader2 size={22} className="text-white animate-spin" />
                              </div>
                            )}
                          </div>

                          {/* Secondary actions */}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => memberPhotoInputRef.current?.click()}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              <ImagePlus size={14} /> Gallery
                            </button>
                            {editMemberPhoto && (
                              <button
                                type="button"
                                onClick={() => setEditMemberPhoto("")}
                                className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                title="Remove photo"
                              >
                                <X size={13} />
                              </button>
                            )}
                          </div>
                          <input type="file" ref={memberPhotoInputRef} onChange={handleMemberPhotoUpload} className="hidden" accept="image/*" />
                        </div>

                        {/* First Name | MI | Last Name */}
                        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 72px 1fr' }}>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name <span className="text-red-500">*</span></label>
                            <input
                              type="text"
                              value={editMemberFirstName}
                              onChange={e => { setEditMemberFirstName(e.target.value); if (memberFormErrors.firstName) setMemberFormErrors(p => ({ ...p, firstName: undefined })); }}
                              className={`w-full px-4 py-2 border ${memberFormErrors.firstName ? "border-red-400 focus:border-red-400 focus:ring-red-200" : "border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-indigo-200"} bg-white dark:bg-gray-700 rounded-xl focus:ring-2 outline-none`}
                              placeholder="Juan"
                            />
                            {memberFormErrors.firstName && <p className="mt-1 text-xs text-red-500">{memberFormErrors.firstName}</p>}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">M.I. <span className="text-gray-400 font-normal text-xs">(opt.)</span></label>
                            <input
                              type="text"
                              maxLength={2}
                              value={editMemberMiddleInitial}
                              onChange={e => setEditMemberMiddleInitial(e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase())}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-indigo-200 bg-white dark:bg-gray-700 rounded-xl focus:ring-2 outline-none text-center uppercase tracking-widest"
                              placeholder="M"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name <span className="text-red-500">*</span></label>
                            <input
                              type="text"
                              value={editMemberLastName}
                              onChange={e => { setEditMemberLastName(e.target.value); if (memberFormErrors.lastName) setMemberFormErrors(p => ({ ...p, lastName: undefined })); }}
                              className={`w-full px-4 py-2 border ${memberFormErrors.lastName ? "border-red-400 focus:border-red-400 focus:ring-red-200" : "border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-indigo-200"} bg-white dark:bg-gray-700 rounded-xl focus:ring-2 outline-none`}
                              placeholder="dela Cruz"
                            />
                            {memberFormErrors.lastName && <p className="mt-1 text-xs text-red-500">{memberFormErrors.lastName}</p>}
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number <span className="text-red-500">*</span></label>
                          <div className="relative">
                            <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                              type="tel"
                              value={editMemberPhone}
                              onChange={e => { setEditMemberPhone(e.target.value); if (memberFormErrors.phone) setMemberFormErrors(p => ({ ...p, phone: undefined })); }}
                              className={`w-full pl-9 pr-4 py-2 border ${memberFormErrors.phone ? "border-red-400 focus:border-red-400 focus:ring-red-200" : "border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-indigo-200"} bg-white dark:bg-gray-700 rounded-xl focus:ring-2 outline-none`}
                              placeholder="+63 912 345 6789"
                            />
                          </div>
                          {memberFormErrors.phone && <p className="mt-1 text-xs text-red-500">{memberFormErrors.phone}</p>}
                        </div>

                        {/* Email */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address <span className="text-red-500">*</span></label>
                          <div className="relative">
                            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                              type="email"
                              value={editMemberEmail}
                              onChange={e => { setEditMemberEmail(e.target.value); if (memberFormErrors.email) setMemberFormErrors(p => ({ ...p, email: undefined })); }}
                              className={`w-full pl-9 pr-4 py-2 border ${memberFormErrors.email ? "border-red-400 focus:border-red-400 focus:ring-red-200" : "border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-indigo-200"} bg-white dark:bg-gray-700 rounded-xl focus:ring-2 outline-none`}
                              placeholder="member@gmail.com"
                            />
                          </div>
                          {memberFormErrors.email
                            ? <p className="mt-1 text-xs text-red-500">{memberFormErrors.email}</p>
                            : <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg px-2.5 py-1.5">
                              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                              <span>Make sure this is the same email address this person will use to <strong>sign in to the app</strong>. This is how their access is linked to their profile.</span>
                            </p>
                          }
                        </div>

                        {/* Status */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
                          <div className="flex gap-2 flex-wrap">
                            {(["active", "on-leave", "inactive"] as const).map(s => (
                              <button
                                key={s}
                                onClick={() => setEditMemberStatus(s)}
                                className={`px-4 py-1.5 rounded-full text-sm font-medium border-2 transition-all ${editMemberStatus === s
                                  ? STATUS_CONFIG[s].badge + " border-transparent ring-2 ring-offset-1 ring-indigo-400"
                                  : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-gray-300"
                                  }`}
                              >
                                <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${STATUS_CONFIG[s].dot}`} />
                                {STATUS_CONFIG[s].label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Roles */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Roles <span className="text-gray-400 font-normal">(select all that apply)</span></label>
                          <div className="space-y-3">
                            {ROLE_CATEGORIES.map(cat => (
                              <div key={cat.label}>
                                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">{cat.label}</p>
                                <div className="flex flex-wrap gap-2">
                                  {cat.roles.map(role => {
                                    const isSelected = editMemberRoles.includes(role);
                                    return (
                                      <button
                                        key={role}
                                        type="button"
                                        onClick={() => toggleMemberRole(role)}
                                        className={`px-3 py-1 rounded-full text-sm font-medium border-2 transition-all ${isSelected
                                          ? cat.color + " border-transparent ring-2 ring-offset-1 ring-indigo-400"
                                          : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-gray-300"
                                          }`}
                                      >
                                        {isSelected && <Check size={12} className="inline mr-1" />}
                                        {role}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Notes */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                          <textarea
                            value={editMemberNotes}
                            onChange={e => setEditMemberNotes(e.target.value)}
                            rows={3}
                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none resize-none"
                            placeholder="Available weekends only, plays both keys and acoustic..."
                          />
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                          <button onClick={() => setIsEditingMember(false)} className="px-6 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 font-medium transition-colors">Cancel</button>
                          <button
                            onClick={handleSaveMember}
                            disabled={isSavingMember}
                            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {isSavingMember ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            {isSavingMember ? "Saving..." : "Save Member"}
                          </button>
                        </div>
                      </div>
                    </div>

                    /* ── Member Detail ── */
                  ) : selectedMember ? (
                    <div className="max-w-2xl mx-auto">
                      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                        {/* Top banner + avatar */}
                        <div className="h-24 bg-gradient-to-r from-indigo-500 via-purple-500 to-rose-400" />
                        <div className="px-6 pb-6">
                          <div className="-mt-12 mb-4 flex items-end justify-between">
                            <div className="w-24 h-24 rounded-full border-4 border-white dark:border-gray-800 overflow-hidden bg-gray-200 dark:bg-gray-700 shrink-0">
                              {selectedMember.photo
                                ? <img src={selectedMember.photo} alt={selectedMember.name} className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-gray-400">{selectedMember.name?.[0]?.toUpperCase()}</div>}
                            </div>
                            <div className="flex items-center gap-2 mb-1">
                              {canWriteMembers && (
                                <button onClick={() => openMemberEditor(selectedMember)} className="relative group text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                                  <Edit size={18} />
                                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-0.5 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">Edit</span>
                                </button>
                              )}
                              {canWriteMembers && (
                                <button onClick={() => handleDeleteMember(selectedMember.id)} className="relative group text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                                  <Trash2 size={18} />
                                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-0.5 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">Remove</span>
                                </button>
                              )}
                              <button onClick={() => setSelectedMember(null)} className="relative group text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                                <X size={18} />
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-0.5 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">Close</span>
                              </button>
                            </div>
                          </div>

                          <div className="space-y-4">
                            {/* Name + status */}
                            <div>
                              <div className="flex items-center gap-3 flex-wrap">
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{selectedMember.name}</h2>
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_CONFIG[selectedMember.status ?? "active"].badge}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[selectedMember.status ?? "active"].dot}`} />
                                  {STATUS_CONFIG[selectedMember.status ?? "active"].label}
                                </span>
                              </div>
                              {/* Phone */}
                              <a href={`tel:${selectedMember.phone}`} className="inline-flex items-center gap-1.5 mt-1 text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 font-medium text-sm">
                                <Phone size={14} />{selectedMember.phone}
                              </a>
                              {/* Email */}
                              {(selectedMember as any).email && (
                                <a href={`mailto:${(selectedMember as any).email}`} className="inline-flex items-center gap-1.5 mt-1 ml-3 text-gray-500 dark:text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 font-medium text-sm">
                                  <Mail size={14} />{(selectedMember as any).email}
                                </a>
                              )}
                            </div>

                            {/* Roles */}
                            {selectedMember.roles?.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Roles</p>
                                <div className="flex flex-wrap gap-2">
                                  {selectedMember.roles.map(role => (
                                    <span key={role} className={`px-3 py-1 rounded-full text-xs font-semibold ${getRoleStyle(role)}`}>{role}</span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Notes */}
                            {selectedMember.notes && (
                              <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Notes</p>
                                <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{selectedMember.notes}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    /* ── Member List ── */
                  ) : (
                    <div className="space-y-5">
                      {/* Toolbar */}
                      <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                          {isLoadingMembers
                            ? <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400 animate-spin" width={18} height={18} viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
                            : <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />}
                          <input
                            type="text"
                            placeholder="Search by name, role, or phone..."
                            value={memberSearchQuery}
                            onChange={e => setMemberSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-8 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-900 outline-none text-sm dark:text-white"
                          />
                          {memberSearchQuery && (
                            <button onClick={() => setMemberSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><X size={14} /></button>
                          )}
                        </div>
                        {canWriteMembers && (
                          <button
                            onClick={() => openMemberEditor()}
                            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium shadow-sm text-sm shrink-0"
                          >
                            <UserPlus size={18} />
                            <span className="hidden sm:inline">Add Member</span>
                          </button>
                        )}
                      </div>


                      {/* Count badge */}
                      <div className="text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-xl inline-block">
                        {memberSearchQuery
                          ? <>{filteredMembers.length} of {allMembers.length} Members</>
                          : <>{allMembers.length} {allMembers.length === 1 ? "Member" : "Members"} Total</>}
                      </div>

                      {/* Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {isLoadingMembers
                          ? Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm animate-pulse">
                              <div className="flex items-center gap-3 mb-3">
                                <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
                                <div className="flex-1 space-y-2">
                                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                                  <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-1/2" />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <div className="h-5 w-16 bg-gray-100 dark:bg-gray-700 rounded-full" />
                                <div className="h-5 w-20 bg-gray-100 dark:bg-gray-700 rounded-full" />
                              </div>
                            </div>
                          ))
                          : filteredMembers.map(member => (
                            <div
                              key={member.id}
                              onClick={() => setSelectedMember(member)}
                              className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-500 cursor-pointer transition-all group"
                            >
                              <div className="flex items-center gap-3 mb-3">
                                <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-indigo-400 to-purple-500 text-white flex items-center justify-center font-bold text-lg shrink-0">
                                  {member.photo
                                    ? <img src={member.photo} alt={member.name} className="w-full h-full object-cover" />
                                    : member.name?.[0]?.toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">{member.name}</p>
                                  <a
                                    href={`tel:${member.phone}`}
                                    onClick={e => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-indigo-500 transition-colors"
                                  >
                                    <Phone size={11} />{member.phone}
                                  </a>
                                </div>
                                {/* Status dot */}
                                <span title={STATUS_CONFIG[member.status ?? "active"].label} className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_CONFIG[member.status ?? "active"].dot}`} />
                              </div>
                              {/* Role badges */}
                              <div className="flex flex-wrap gap-1.5">
                                {(member.roles || []).slice(0, 3).map(role => (
                                  <span key={role} className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${getRoleStyle(role)}`}>{role}</span>
                                ))}
                                {(member.roles || []).length > 3 && (
                                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-500">+{member.roles.length - 3}</span>
                                )}
                                {(!member.roles || member.roles.length === 0) && (
                                  <span className="text-xs text-gray-400">No roles assigned</span>
                                )}
                              </div>
                            </div>
                          ))
                        }
                        {/* Empty state */}
                        {!isLoadingMembers && filteredMembers.length === 0 && (
                          <div className="col-span-full py-16 text-center">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 mb-4">
                              <Users size={30} />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                              {memberSearchQuery ? "No members found" : "No team members yet"}
                            </h3>
                            <p className="text-sm text-gray-400 mb-4">
                              {memberSearchQuery
                                ? `No results for "${memberSearchQuery}"`
                                : "Add your first team member to get started."}
                            </p>
                            {!memberSearchQuery && (
                              <button onClick={() => openMemberEditor()} className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium text-sm transition-colors">
                                <UserPlus size={16} /> Add First Member
                              </button>
                            )}
                            {memberSearchQuery && (
                              <button onClick={() => setMemberSearchQuery("")} className="text-sm text-indigo-500 hover:underline">Clear search</button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

              ) : currentView !== "schedule" ? (
                <div>
                  {/* ══════════════════════════════════════════════════════════════
                     SONG MANAGEMENT VIEW
                ══════════════════════════════════════════════════════════════ */}
                  {isEditing ? (
                    <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold">{selectedSong ? "Edit Song" : "New Song"}</h2>
                        <button
                          onClick={() => setIsEditing(false)}
                          className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                        >
                          <X size={24} />
                        </button>
                      </div>

                      <div className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Title <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => { setEditTitle(e.target.value); if (formErrors.title) setFormErrors(p => ({ ...p, title: undefined })); }}
                              className={`w-full px-4 py-2 border ${formErrors.title ? "border-red-400 focus:border-red-400 focus:ring-red-200" : "border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-indigo-200"} bg-white dark:bg-gray-700 rounded-xl focus:ring-2 outline-none`}
                              placeholder="Song Title"
                            />
                            {formErrors.title && <p className="mt-1 text-xs text-red-500">{formErrors.title}</p>}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Artist <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={editArtist}
                              onChange={(e) => { setEditArtist(e.target.value); if (formErrors.artist) setFormErrors(p => ({ ...p, artist: undefined })); }}
                              className={`w-full px-4 py-2 border ${formErrors.artist ? "border-red-400 focus:border-red-400 focus:ring-red-200" : "border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-indigo-200"} bg-white dark:bg-gray-700 rounded-xl focus:ring-2 outline-none`}
                              placeholder="Artist Name"
                            />
                            {formErrors.artist && <p className="mt-1 text-xs text-red-500">{formErrors.artist}</p>}
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Video Link (YouTube/Reference)</label>
                          <input
                            type="text"
                            value={editVideoUrl}
                            onChange={(e) => setEditVideoUrl(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                            placeholder="https://www.youtube.com/watch?v=..."
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Tags <span className="text-red-500">*</span>
                          </label>
                          <div className={`flex flex-wrap gap-2 p-2 rounded-xl ${formErrors.tags ? "border border-red-400" : ""}`}>
                            {tags.map((tag) => {
                              const isSelected = editTags.includes(tag.id);
                              const isDisabled = editTags.length > 0 && !isSelected;
                              return (
                                <button
                                  key={tag.id}
                                  type="button"
                                  disabled={isDisabled}
                                  onClick={() => { toggleTagSelection(tag.id); if (formErrors.tags) setFormErrors(p => ({ ...p, tags: undefined })); }}
                                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium transition-colors border ${isSelected
                                    ? `${tag.color} border-transparent ring-2 ring-offset-1 ring-indigo-400`
                                    : isDisabled
                                      ? "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-400 border-gray-300 dark:border-gray-500 opacity-65 cursor-not-allowed"
                                      : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                                    }`}
                                >
                                  <TagIcon size={14} />
                                  {tag.name}
                                </button>
                              );
                            })}
                          </div>
                          {formErrors.tags && <p className="mt-1 text-xs text-red-500">{formErrors.tags}</p>}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                          {/* ── Lyrics Column ── */}
                          <div className="flex flex-col">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Lyrics <span className="text-red-500">*</span>
                            </label>

                            {/* Upload Zone — Lyrics */}
                            <button
                              type="button"
                              onClick={() => lyricsInputRef.current?.click()}
                              disabled={!!isOcrLoading}
                              className="w-full mb-3 group relative flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {isOcrLoading === "lyrics" ? (
                                <>
                                  <Loader2 size={28} className="text-indigo-500 animate-spin" />
                                  <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">Extracting text from image...</p>
                                </>
                              ) : (
                                <>
                                  <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                                    <ImagePlus size={20} className="text-indigo-600 dark:text-indigo-400" />
                                  </div>
                                  <div className="text-center">
                                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Drop an image or click to upload</p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Supports PNG, JPG, WEBP — AI will extract lyrics</p>
                                  </div>
                                  <span className="px-3 py-1 text-xs font-medium bg-indigo-600 text-white rounded-full group-hover:bg-indigo-700 transition-colors">
                                    Upload Screenshot
                                  </span>
                                </>
                              )}
                            </button>
                            <input
                              type="file"
                              ref={lyricsInputRef}
                              onChange={(e) => handleImageUpload(e, "lyrics")}
                              className="hidden"
                              accept="image/*"
                            />

                            {/* Seamless textarea box */}
                            <div className={`rounded-xl overflow-hidden border ${formErrors.lyrics ? "border-red-400" : "border-gray-300 dark:border-gray-600"}`}>
                              <textarea
                                value={editLyrics}
                                onChange={(e) => { setEditLyrics(e.target.value); if (formErrors.lyrics) setFormErrors(p => ({ ...p, lyrics: undefined })); }}
                                rows={14}
                                className="w-full h-full px-4 py-3 bg-gray-50 dark:bg-gray-900 outline-none font-sans resize-none focus:ring-2 focus:ring-inset focus:ring-indigo-300 dark:focus:ring-indigo-700"
                                placeholder="Paste lyrics here..."
                              />
                            </div>
                            {formErrors.lyrics && <p className="mt-1 text-xs text-red-500">{formErrors.lyrics}</p>}
                          </div>

                          {/* ── Chords Column ── */}
                          <div className="flex flex-col">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Chords</label>

                            {/* Upload Zone — Chords */}
                            <button
                              type="button"
                              onClick={() => chordsInputRef.current?.click()}
                              disabled={!!isOcrLoading}
                              className="w-full mb-3 group relative flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-xl border-2 border-dashed border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-950/20 hover:border-purple-500 dark:hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {isOcrLoading === "chords" ? (
                                <>
                                  <Loader2 size={28} className="text-purple-500 animate-spin" />
                                  <p className="text-sm font-medium text-purple-600 dark:text-purple-400">Extracting chords from image...</p>
                                </>
                              ) : (
                                <>
                                  <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                                    <ImagePlus size={20} className="text-purple-600 dark:text-purple-400" />
                                  </div>
                                  <div className="text-center">
                                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Drop an image or click to upload</p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Supports PNG, JPG, WEBP — AI will extract chords</p>
                                  </div>
                                  <span className="px-3 py-1 text-xs font-medium bg-purple-600 text-white rounded-full group-hover:bg-purple-700 transition-colors">
                                    Upload Screenshot
                                  </span>
                                </>
                              )}
                            </button>
                            <input
                              type="file"
                              ref={chordsInputRef}
                              onChange={(e) => handleImageUpload(e, "chords")}
                              className="hidden"
                              accept="image/*"
                            />

                            {/* Seamless textarea box */}
                            <div className="rounded-xl overflow-hidden border border-gray-300 dark:border-gray-600">
                              <textarea
                                value={editChords}
                                onChange={(e) => setEditChords(e.target.value)}
                                rows={14}
                                className="w-full h-full px-4 py-3 bg-gray-50 dark:bg-gray-900 outline-none font-sans text-sm resize-none focus:ring-2 focus:ring-inset focus:ring-purple-300 dark:focus:ring-purple-700"
                                placeholder="Paste chords here..."
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                          <button
                            onClick={() => setIsEditing(false)}
                            className="px-6 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 font-medium transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveSong}
                            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium transition-colors"
                          >
                            <Save size={18} />
                            Save Song
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : selectedSong ? (
                    <div className="max-w-4xl mx-auto space-y-4">

                      {/* Minimalist Header Card */}
                      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 sm:p-6 lg:p-8">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            {/* Tags */}
                            <div className="flex flex-wrap gap-2 mb-4">
                              {selectedSong.tags.map((tag) => (
                                <span key={tag.id} className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs sm:text-sm font-semibold ${tag.color}`}>
                                  {tag.name}
                                </span>
                              ))}
                            </div>
                            {/* Title & Artist */}
                            <h2 className="text-xl sm:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-1 leading-tight">{selectedSong.title}</h2>
                            {selectedSong.artist && (
                              <p className="text-indigo-500 dark:text-indigo-400 font-semibold text-base sm:text-lg">{selectedSong.artist}</p>
                            )}
                          </div>
                          {/* Action Buttons */}
                          <div className="flex items-center gap-2 sm:gap-3 shrink-0 pt-1">
                            <button onClick={() => handlePrint(selectedSong)} className="hidden sm:block relative group text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors duration-150">
                              <Printer size={20} />
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">Print</span>
                            </button>
                            {canEditSong && (
                              <button onClick={() => openEditor(selectedSong)} className="relative group text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors duration-150">
                                <Edit size={20} />
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">Edit</span>
                              </button>
                            )}
                            {canDeleteSong && (
                              <button onClick={() => handleDeleteSong(selectedSong.id)} className="relative group text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors duration-150">
                                <Trash2 size={20} />
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">Delete</span>
                              </button>
                            )}
                            <button onClick={() => setSelectedSong(null)} className="relative group text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors duration-150">
                              <X size={20} />
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">Close</span>
                            </button>
                          </div>
                        </div>

                        {/* Divider + Meta */}
                        <div className="mt-5 pt-5 border-t border-gray-200 dark:border-gray-700 space-y-1">
                          <p className="text-sm text-gray-400 dark:text-gray-500">
                            <span className="font-medium text-gray-500 dark:text-gray-400">Added:</span>{" "}
                            {selectedSong.created_at ? new Date(selectedSong.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : "Unknown"}
                          </p>
                          <p className="text-sm text-gray-400 dark:text-gray-500">
                            <span className="font-medium text-gray-500 dark:text-gray-400">Updated:</span>{" "}
                            {selectedSong.updated_at ? new Date(selectedSong.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : "Never"}
                          </p>
                          {selectedSong.video_url && (
                            <a
                              href={selectedSong.video_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors pt-1"
                            >
                              Watch Reference Video
                              <ExternalLink size={14} />
                            </a>
                          )}
                        </div>
                      </div>


                      {/* Lyrics & Chords Cards */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                        <div className="bg-white dark:bg-[#1E2938] rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col">
                          <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-indigo-500" />
                              <h3 className="font-bold text-gray-900 dark:text-white tracking-wide text-sm uppercase">Lyrics</h3>
                            </div>
                            {selectedSong.lyrics && (
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(selectedSong.lyrics);
                                  setCopiedField("lyrics");
                                  setTimeout(() => setCopiedField(null), 1500);
                                }}
                                title="Copy lyrics"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                              >
                                {copiedField === "lyrics" ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
                              </button>
                            )}
                          </div>
                          <div className="p-4 sm:p-6 flex-1 overflow-auto">
                            <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{selectedSong.lyrics || "No lyrics added."}</pre>
                          </div>
                        </div>
                        <div className="bg-white dark:bg-[#1E2938] rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col">
                          {/* Chords Header with Transposer */}
                          <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-purple-500" />
                              <h3 className="font-bold text-gray-900 dark:text-white tracking-wide text-sm uppercase">Chords</h3>
                            </div>
                            {selectedSong.chords && (
                              <div className="flex items-center gap-1">
                                {/* – semitone */}
                                <button
                                  onClick={() => setTransposeSteps(s => s - 1)}
                                  title="Transpose down"
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 hover:text-purple-600 dark:hover:text-purple-400 font-bold text-base transition-colors"
                                >−</button>

                                {/* Key badge — click to reset */}
                                <button
                                  onClick={() => setTransposeSteps(0)}
                                  title="Reset to original key"
                                  className={`px-2 py-0.5 rounded-md text-xs font-semibold min-w-[52px] text-center transition-colors ${transposeSteps === 0
                                    ? "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                                    : "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300"
                                    }`}
                                >
                                  {transposeSteps === 0 ? "Original" : transposeSteps > 0 ? `+${transposeSteps}` : `${transposeSteps}`}
                                </button>

                                {/* + semitone */}
                                <button
                                  onClick={() => setTransposeSteps(s => s + 1)}
                                  title="Transpose up"
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 hover:text-purple-600 dark:hover:text-purple-400 font-bold text-base transition-colors"
                                >+</button>

                                {/* Divider */}
                                <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-1" />

                                {/* Copy (copies transposed version) */}
                                <button
                                  onClick={() => {
                                    const text = transposeChords(selectedSong.chords!, transposeSteps);
                                    navigator.clipboard.writeText(text);
                                    setCopiedField("chords");
                                    setTimeout(() => setCopiedField(null), 1500);
                                  }}
                                  title="Copy chords"
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-purple-500 dark:hover:text-purple-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                  {copiedField === "chords" ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="p-4 sm:p-6 flex-1 overflow-auto">
                            {selectedSong.chords ? (
                              <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
                                {transposeChords(selectedSong.chords, transposeSteps)}
                              </pre>
                            ) : (
                              <div className="h-full flex flex-col items-center justify-center text-center py-12 text-gray-400 dark:text-gray-600">
                                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
                                  <Music size={22} className="text-gray-400 dark:text-gray-500" />
                                </div>
                                <p className="text-sm font-medium">No chords added</p>
                                <p className="text-xs mt-1 text-gray-300 dark:text-gray-600">Edit the song to add chord notations</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (

                    <div className="space-y-3">
                      {/* Filter & Search Bar */}
                      {!isEditing && !selectedSong && (
                        <div className="flex flex-col gap-3">
                          {/* Row 1: Search + Actions */}
                          <div className="flex items-center gap-3">
                            <div className="relative flex-1">
                              {/* Left icon: spinner while loading, search otherwise */}
                              {isLoadingSongs ? (
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400 animate-spin" width={18} height={18} viewBox="0 0 24 24" fill="none">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                </svg>
                              ) : (
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                              )}
                              <input
                                type="text"
                                placeholder="Search by title, artist, or tags..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-8 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-900 transition-all outline-none text-sm dark:text-white"
                              />
                              {/* Clear button */}
                              {searchQuery && (
                                <button
                                  onClick={() => setSearchQuery("")}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                  title="Clear search"
                                  aria-label="Clear search"
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {isSelectionMode ? (
                                <>
                                  <button
                                    onClick={handleBulkDelete}
                                    disabled={selectedSongIds.length === 0}
                                    className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-medium shadow-sm text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <Trash2 size={18} />
                                    <span className="hidden sm:inline">Delete ({selectedSongIds.length})</span>
                                    <span className="sm:hidden">{selectedSongIds.length}</span>
                                  </button>
                                  <button
                                    onClick={() => { setIsSelectionMode(false); setSelectedSongIds([]); }}
                                    className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium text-sm"
                                  >
                                    <X size={18} />
                                    <span className="hidden sm:inline">Cancel</span>
                                  </button>
                                </>
                              ) : (
                                <>
                                  {canSelectSongs && (
                                    <button
                                      onClick={() => setIsSelectionMode(true)}
                                      className="p-2 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 rounded-xl transition-colors relative group"
                                      title="Select Songs"
                                    >
                                      <CheckSquare size={20} />
                                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                                        Select Songs
                                      </span>
                                    </button>
                                  )}
                                  {canAddSong && (
                                    <button
                                      onClick={() => openEditor()}
                                      className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium shadow-sm text-sm"
                                    >
                                      <Plus size={18} />
                                      <span className="hidden sm:inline">Add Song</span>
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>

                          {/* Row 2: Multi-select Filter Dropdown + Total Songs */}
                          <div className="flex items-center gap-2 py-3">
                            {/* Left group: Filter + Count + Toggle — always on first line */}
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className="relative flex-shrink-0" ref={filterDropdownRef}>
                                <button
                                  onClick={() => setIsFilterOpen(prev => !prev)}
                                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${selectedTagIds.length > 0
                                    ? "bg-indigo-600 text-white border-transparent shadow-sm"
                                    : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400"
                                    }`}
                                >
                                  <Filter size={15} />
                                  {/* Show text on sm+, icon-only on xs */}
                                  <span className="hidden xs:inline sm:inline">
                                    {selectedTagIds.length === 0
                                      ? "Filter"
                                      : `${selectedTagIds.length} Filter${selectedTagIds.length > 1 ? "s" : ""}`}
                                  </span>
                                  {selectedTagIds.length > 0 && (
                                    <span
                                      onClick={(e) => { e.stopPropagation(); setSelectedTagIds([]); }}
                                      className="ml-0.5 hover:opacity-70 transition-opacity"
                                      role="button"
                                      title="Clear filters"
                                    >
                                      <X size={13} />
                                    </span>
                                  )}
                                  <ChevronDown size={14} className={`transition-transform ${isFilterOpen ? "rotate-180" : ""}`} />
                                </button>

                                {isFilterOpen && (
                                  <div className="absolute left-0 top-full mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl z-50 overflow-hidden">
                                    <div className="p-2">
                                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-3 py-2">Sort</p>
                                      <button
                                        onClick={() => setSelectedTagIds(prev =>
                                          prev.includes("recently-added") ? prev.filter(id => id !== "recently-added") : [...prev, "recently-added"]
                                        )}
                                        className="flex items-center gap-3 w-full px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm text-gray-700 dark:text-gray-300"
                                      >
                                        <div className={`w-4 h-4 rounded flex items-center justify-center border-2 transition-colors shrink-0 ${selectedTagIds.includes("recently-added")
                                          ? "bg-indigo-600 border-indigo-600"
                                          : "border-gray-300 dark:border-gray-600"
                                          }`}>
                                          {selectedTagIds.includes("recently-added") && <Check size={10} className="text-white" strokeWidth={3} />}
                                        </div>
                                        <span>Recently Added</span>
                                      </button>

                                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-3 pt-3 pb-2 mt-1 border-t border-gray-100 dark:border-gray-700">Tags</p>
                                      {Array.isArray(tags) && tags.map((tag) => (
                                        <button
                                          key={tag.id}
                                          onClick={() => setSelectedTagIds(prev =>
                                            prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                                          )}
                                          className="flex items-center gap-3 w-full px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm text-gray-700 dark:text-gray-300"
                                        >
                                          <div className={`w-4 h-4 rounded flex items-center justify-center border-2 transition-colors shrink-0 ${selectedTagIds.includes(tag.id)
                                            ? "bg-indigo-600 border-indigo-600"
                                            : "border-gray-300 dark:border-gray-600"
                                            }`}>
                                            {selectedTagIds.includes(tag.id) && <Check size={10} className="text-white" strokeWidth={3} />}
                                          </div>
                                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tag.color}`}>{tag.name}</span>
                                        </button>
                                      ))}

                                      {selectedTagIds.length > 0 && (
                                        <button
                                          onClick={() => setSelectedTagIds([])}
                                          className="w-full mt-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors font-medium border-t border-gray-100 dark:border-gray-700"
                                        >
                                          Clear all filters
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                              {/* Total Songs Count */}
                              <div className="text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-xl whitespace-nowrap flex-shrink-0">
                                {debouncedQuery || selectedTagIds.length > 0
                                  ? <>{filteredSongs.length}<span className="hidden sm:inline"> of {allSongs.length}</span> <span className="hidden sm:inline">{allSongs.length === 1 ? 'Song' : 'Songs'}</span></>
                                  : <>{allSongs.length} <span className="hidden sm:inline">{allSongs.length === 1 ? 'Song' : 'Songs'} Total</span><span className="sm:hidden">Songs</span></>
                                }
                              </div>
                              {/* Grid / List toggle */}
                              <div className="hidden sm:flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-0.5 gap-0.5 flex-shrink-0">
                                <button
                                  onClick={() => toggleSongView("grid")}
                                  title="Grid view"
                                  className={`p-1.5 rounded-lg transition-all ${songView === "grid"
                                    ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                                    : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                    }`}
                                >
                                  <LayoutGrid size={16} />
                                </button>
                                <button
                                  onClick={() => toggleSongView("list")}
                                  title="List view"
                                  className={`hidden sm:flex p-1.5 rounded-lg transition-all ${songView === "list"
                                    ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                                    : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                    }`}
                                >
                                  <List size={16} />
                                </button>
                              </div>
                            </div>

                            {/* Pagination — ml-auto on desktop, w-full justify-end on mobile wrap */}
                            {totalPages > 1 && !isLoadingSongs && (
                              <div className="flex items-center gap-1 ml-auto flex-shrink-0">
                                <button
                                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                  disabled={currentPage === 1}
                                  className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                  <ChevronLeft size={14} />
                                </button>
                                {(() => {
                                  const pages: (number | "…")[] = [];
                                  if (totalPages <= 5) {
                                    for (let i = 1; i <= totalPages; i++) pages.push(i);
                                  } else {
                                    pages.push(1);
                                    if (currentPage > 3) pages.push("…");
                                    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
                                    if (currentPage < totalPages - 2) pages.push("…");
                                    pages.push(totalPages);
                                  }
                                  return pages.map((p, idx) =>
                                    p === "…" ? (
                                      <span key={`el-${idx}`} className="text-[11px] text-gray-400 px-0.5 select-none">…</span>
                                    ) : (
                                      <button
                                        key={p}
                                        onClick={() => setCurrentPage(p as number)}
                                        className={`w-7 h-7 rounded-lg text-xs font-semibold transition-all ${currentPage === p
                                          ? "bg-indigo-600 text-white"
                                          : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                                          }`}
                                      >{p}</button>
                                    )
                                  );
                                })()}
                                <button
                                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                  disabled={currentPage === totalPages}
                                  className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                  <ChevronRight size={14} />
                                </button>
                              </div>
                            )}
                          </div>

                        </div>
                      )}


                      {/* ── GRID VIEW ─────────────────────────────────── */}
                      {songView === "grid" && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                          {isLoadingSongs ? (
                            Array.from({ length: 6 }).map((_, i) => (
                              <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm animate-pulse">
                                <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded-lg mb-3 w-3/4" />
                                <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-lg mb-4 w-1/2" />
                                <div className="flex gap-2 mb-4">
                                  <div className="h-5 w-16 bg-gray-100 dark:bg-gray-700 rounded-full" />
                                  <div className="h-5 w-20 bg-gray-100 dark:bg-gray-700 rounded-full" />
                                </div>
                                <div className="space-y-2">
                                  <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-full" />
                                  <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-5/6" />
                                  <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-4/6" />
                                </div>
                              </div>
                            ))
                          ) : Array.isArray(filteredSongs) && paginatedSongs.map((song) => (

                            <div
                              key={song.id}
                              onClick={() => isSelectionMode ? toggleSongSelection(song.id) : setSelectedSong(song)}
                              className={`bg-white dark:bg-gray-800 rounded-2xl p-6 border transition-all cursor-pointer group flex flex-col h-full relative ${selectedSongIds.includes(song.id)
                                ? "border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900 shadow-md"
                                : "border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-500"
                                }`}
                            >
                              {isSelectionMode && (
                                <div className="absolute top-4 right-4 z-10">
                                  {selectedSongIds.includes(song.id) ? (
                                    <div className="bg-indigo-600 text-white p-1 rounded-md"><Check size={16} /></div>
                                  ) : (
                                    <div className="bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 p-1 rounded-md w-6 h-6" />
                                  )}
                                </div>
                              )}
                              <div className="flex items-start justify-between gap-2 mb-0.5">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1">
                                  {song.title}
                                </h3>
                                {!isSelectionMode && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    {song.video_url && (
                                      <a href={song.video_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors relative group/tooltip">
                                        <CustomYoutubeIcon size={24} />
                                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">Watch Video</span>
                                      </a>
                                    )}
                                  </div>
                                )}
                              </div>
                              {song.artist && <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">{song.artist}</p>}
                              <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-3 uppercase tracking-wider font-medium">
                                {song.created_at ? new Date(song.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : ""}
                              </p>
                              <div className="flex flex-wrap gap-2 mb-4">
                                {Array.isArray(song.tags) && song.tags.slice(0, 3).map((tag) => (
                                  <span key={tag.id} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tag.color}`}>{tag.name}</span>
                                ))}
                                {Array.isArray(song.tags) && song.tags.length > 3 && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">+{song.tags.length - 3}</span>
                                )}
                              </div>
                              <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-3 mt-auto">{song.lyrics}</p>
                            </div>
                          ))}
                          {!isLoadingSongs && (!Array.isArray(filteredSongs) || filteredSongs.length === 0) && (
                            <div className="col-span-full py-12 text-center">
                              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 mb-4"><Search size={32} /></div>
                              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No songs found</h3>
                              <p className="text-gray-500 dark:text-gray-400">{debouncedQuery ? `No results for "${debouncedQuery}". Try a different search.` : "Try adjusting your search or filter."}</p>
                              {debouncedQuery && <button onClick={() => setSearchQuery("")} className="mt-3 px-4 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl transition-colors font-medium">Clear search</button>}
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── LIST VIEW ─────────────────────────────────── */}
                      {songView === "list" && (
                        <div className="flex flex-col gap-1">
                          {/* List header */}
                          {!isLoadingSongs && Array.isArray(filteredSongs) && filteredSongs.length > 0 && (
                            <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                              <span>Title / Artist</span>
                              <span className="w-40 text-left">Tags</span>
                              <span className="w-32 text-left">Added</span>
                              <span className="w-6" />
                            </div>
                          )}

                          {isLoadingSongs ? (
                            Array.from({ length: 8 }).map((_, i) => (
                              <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-xl animate-pulse">
                                <div className="flex-1 space-y-1.5">
                                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/5" />
                                  <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-1/4" />
                                </div>
                                <div className="h-5 w-20 bg-gray-100 dark:bg-gray-700 rounded-full" />
                                <div className="h-3 w-24 bg-gray-100 dark:bg-gray-700 rounded" />
                              </div>
                            ))
                          ) : Array.isArray(filteredSongs) && paginatedSongs.map((song) => (

                            <div
                              key={song.id}
                              onClick={() => isSelectionMode ? toggleSongSelection(song.id) : setSelectedSong(song)}
                              className={`grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 sm:gap-4 items-center px-4 py-3 rounded-xl border cursor-pointer group transition-all ${selectedSongIds.includes(song.id)
                                ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700"
                                : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:border-indigo-200 dark:hover:border-indigo-700"
                                }`}
                            >
                              {/* Title + Artist */}
                              <div className="flex items-center gap-3 min-w-0">
                                {isSelectionMode && (
                                  <div className="shrink-0">
                                    {selectedSongIds.includes(song.id)
                                      ? <div className="bg-indigo-600 text-white p-1 rounded-md"><Check size={14} /></div>
                                      : <div className="bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-md w-5 h-5" />}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="font-semibold text-sm text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">{song.title}</p>
                                  {song.artist && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{song.artist}</p>}
                                </div>
                              </div>
                              {/* Tags */}
                              <div className="flex flex-wrap gap-1 w-40">
                                {Array.isArray(song.tags) && song.tags.slice(0, 2).map((tag) => (
                                  <span key={tag.id} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${tag.color}`}>{tag.name}</span>
                                ))}
                                {Array.isArray(song.tags) && song.tags.length > 2 && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">+{song.tags.length - 2}</span>
                                )}
                              </div>
                              {/* Date */}
                              <p className="text-[11px] text-gray-400 dark:text-gray-500 w-32 whitespace-nowrap">
                                {song.created_at ? new Date(song.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : "—"}
                              </p>
                              {/* Video icon */}
                              <div className="w-6 flex items-center justify-end">
                                {song.video_url && !isSelectionMode && (
                                  <a href={song.video_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="opacity-0 group-hover:opacity-100 transition-opacity">
                                    <CustomYoutubeIcon size={18} />
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}

                          {!isLoadingSongs && (!Array.isArray(filteredSongs) || filteredSongs.length === 0) && (
                            <div className="py-12 text-center">
                              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 mb-4"><Search size={32} /></div>
                              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No songs found</h3>
                              <p className="text-gray-500 dark:text-gray-400">{debouncedQuery ? `No results for "${debouncedQuery}". Try a different search.` : "Try adjusting your search or filter."}</p>
                              {debouncedQuery && <button onClick={() => setSearchQuery("")} className="mt-3 px-4 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl transition-colors font-medium">Clear search</button>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : null}
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
          <div className="relative w-full max-w-sm bg-gray-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/10">
              <h2 className="text-lg font-bold text-white">{confirmConfig.title}</h2>
              <button
                onClick={closeConfirm}
                className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>
            {/* Body */}
            <div className="px-6 py-5 space-y-2">
              <p className="text-gray-300 text-sm leading-relaxed">{confirmConfig.message}</p>
              {confirmConfig.detail && (
                <p className="text-gray-400 text-sm font-semibold">{confirmConfig.detail}</p>
              )}
            </div>
            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 pb-6">
              <button
                onClick={closeConfirm}
                className="px-5 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded-xl hover:bg-white/10 font-medium"
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

    </div >
  );
}
