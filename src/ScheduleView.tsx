import React, { useState, useEffect, useMemo } from "react";
import { getAuth } from "firebase/auth";
import AutoTextarea from "./AutoTextarea";
import { Member, ScheduleMember, Schedule, Song, Tag } from "./types";
import {
  ChevronLeft, ChevronRight, Plus, Calendar, List, X,
  Copy, Pencil, Lock, Users, Sun, Music, BookOpen, Mail, Eye, Loader2, Heart, SquareKanban, ExternalLink, CheckCircle2,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────
function eventEmoji(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("sunday"))  return "🙌";
  if (n.includes("midweek")) return "✝️";
  if (n.includes("prayer"))  return "🙏";
  if (n.includes("worship")) return "🎵";
  if (n.includes("youth"))   return "👆";
  if (n.includes("revival")) return "🔥";
  return "📅";
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface ScheduleViewProps {
  /** Shared schedules state from App.tsx */
  allSchedules: Schedule[];
  setAllSchedules: React.Dispatch<React.SetStateAction<Schedule[]>>;
  /** Shared data from App.tsx */
  allMembers: Member[];
  allSongs: Song[];
  birthdayMap: Record<string, Member[]>;
  /** Auth flags */
  isAdmin: boolean;
  isLeader: boolean;
  isPlanningLead: boolean;
  canWriteSchedule: boolean;
  user: any; // Firebase user
  /** UI callbacks */
  showToast: (type: string, msg: string) => void;
  showConfirm: (config: {
    title: string;
    message: string;
    confirmText: string;
    confirmClass?: string;
    onConfirm: () => void;
  }) => void;
  closeConfirm: () => void;
  /** Notification deep-link */
  deepLinkEventId?: string | null;
  deepLinkEventDate?: string | null;
  onDeepLinkHandled?: () => void;
  /** Open a YouTube video in the persistent mini player */
  onOpenVideo?: (url: string) => void;
  /** Called when an event panel opens — lets App auto-collapse the sidebar */
  onEventPanelOpen?: () => void;
  /** Navigate to Ministry Hub and open a specific card */
  onNavigateToPlanner?: (target: { boardId: string; cardId: string }) => void;
}

export default function ScheduleView({
  allSchedules,
  setAllSchedules,
  allMembers,
  allSongs,
  birthdayMap,
  isAdmin,
  isLeader,
  isPlanningLead,
  canWriteSchedule,
  user,
  showToast,
  showConfirm,
  closeConfirm,
  deepLinkEventId,
  deepLinkEventDate,
  onDeepLinkHandled,
  onOpenVideo,
  onEventPanelOpen,
  onNavigateToPlanner,
}: ScheduleViewProps) {

  // ── Local scheduling state ────────────────────────────────────────────────
  // (allSchedules & setAllSchedules come from props)
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(false);
const [selectedScheduleDate, setSelectedScheduleDate] = useState<string | null>(null);
const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
const [schedPanelMode, setSchedPanelMode] = useState<"view" | "edit">("view");
const [isSavingSchedule, setIsSavingSchedule] = useState(false);
const [isNotifying, setIsNotifying] = useState(false);
const [isAcking, setIsAcking] = useState(false);
const [showEmailPreview, setShowEmailPreview] = useState(false);
const [scheduleView, setScheduleView] = useState<"month" | "list">("month");

  // ── Ministry Hub assigned cards ───────────────────────────────────────────
  type MyPlannerCard = {
    id: string; boardId: string; boardTitle: string; listId: string;
    title: string; dueDate: string; startDate: string | null; completed: boolean;
  };
  const [myPlannerCards, setMyPlannerCards] = useState<MyPlannerCard[]>([]);
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
const leaderCanAddOnDate = isLeader && !!selectedScheduleDate && selectedScheduleDate >= new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }); // no past dates
const leaderCanEditEvent = isLeader && isServiceEventType;    // leader can only edit service-type events
const [newGroupFocusIdx, setNewGroupFocusIdx] = useState<number | null>(null);
const [editSchedSongLineup, setEditSchedSongLineup] = useState<{ joyful?: string; solemn?: string }>({});
const [joyfulSearch, setJoyfulSearch] = useState("");
const [solemnSearch, setSolemnSearch] = useState("");
const [editSchedNotes, setEditSchedNotes] = useState("");
const [schedMemberSearch, setSchedMemberSearch] = useState("");

  // ── Birthday greeting modal state ─────────────────────────────────────────
  const [bdayModal, setBdayModal] = useState<{
    member: Member;
    dateStr: string;
  } | null>(null);
  const [bdayMsg, setBdayMsg] = useState("");
  const [bdaySending, setBdaySending] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [bdayWishes, setBdayWishes] = useState<any[]>([]);
  const [bdayWishers, setBdayWishers] = useState<string[]>([]);
  const [bdayLoadingWishes, setBdayLoadingWishes] = useState(false);

  const BDAY_QUICK_MSGS = [
    "🎂 Happy Birthday! May God bless you abundantly!",
    "🎉 Wishing you a wonderful birthday filled with joy!",
    "🙏 God's blessings overflow in your life today!",
    "🎵 Have an amazing birthday, praise God for you!",
    "✨ May this birthday bring you closer to your purpose!",
  ];

  const openBdayModal = async (member: Member, dateStr: string) => {
    setBdayModal({ member, dateStr });
    setBdayMsg(BDAY_QUICK_MSGS[0]);
    setBdaySending("idle");
    setBdayWishes([]);
    setBdayWishers([]);
    setBdayLoadingWishes(true);
    try {
      const res = await fetch(`/api/birthday-wish?memberId=${member.id}&date=${dateStr}`);
      const data = await res.json();
      setBdayWishes(data.wishes ?? []);
      setBdayWishers(data.wishers ?? []);
    } catch { /* silent */ } finally { setBdayLoadingWishes(false); }
  };

  const sendBdayWish = async () => {
    if (!bdayModal || bdaySending === "sending") return;
    const cu = getAuth().currentUser;
    if (!cu) return;
    setBdaySending("sending");
    try {
      const res = await fetch("/api/birthday-wish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: bdayModal.member.id,
          memberName: bdayModal.member.name,
          memberEmail: (bdayModal.member.email || "").trim().toLowerCase(),
          date: bdayModal.dateStr,
          senderUserId: cu.uid,
          senderName: cu.displayName || cu.email?.split("@")[0] || "A teammate",
          senderPhoto: cu.photoURL || "",
          message: bdayMsg.trim() || BDAY_QUICK_MSGS[0],
        }),
      });
if (res.status === 429) { showToast("info", "You already sent a birthday wish today!"); setBdaySending("idle"); return; }
      if (!res.ok) throw new Error("Failed");
      setBdaySending("sent");
showToast("success", `Birthday wish sent to ${bdayModal.member.name.split("")[0]}!`);
      // Refresh wishes list
      const fresh = await fetch(`/api/birthday-wish?memberId=${bdayModal.member.id}&date=${bdayModal.dateStr}`);
      const freshData = await fresh.json();
      setBdayWishes(freshData.wishes ?? []);
      setBdayWishers(freshData.wishers ?? []);
    } catch { setBdaySending("error"); setTimeout(() => setBdaySending("idle"), 2000); }
  };

  // ── Schedule cache helpers ────────────────────────────────────────────────
// ── Schedule helpers ──────────────────────────────────────────────────────
const SCHED_CACHE_KEY = "wf_schedules_cache";
const SCHED_CACHE_TS_KEY = "wf_schedules_cache_ts";

const writeSchedulesCache = (data: Schedule[]) => {
  try { localStorage.setItem(SCHED_CACHE_KEY, JSON.stringify(data)); localStorage.setItem(SCHED_CACHE_TS_KEY, Date.now().toString()); } catch { }
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

// derived: map dateStr -> Schedule[] (memoized to avoid recomputation every render)
const dateEventsMap = useMemo(() => allSchedules.reduce<Record<string, Schedule[]>>((acc, s) => {
  if (!acc[s.date]) acc[s.date] = [];
  acc[s.date].push(s);
  return acc;
}, {}), [allSchedules]);



/** The currently signed-in user's Member document (matched by email), if any */
const myMemberProfile = useMemo(() => {
  if (!user?.email) return null;
  const email = user.email.trim().toLowerCase();
  return allMembers.find(m => (m.email || "").trim().toLowerCase() === email) ?? null;
}, [allMembers, user]);

/** True when the user has a member profile but hasn't set their birthdate yet */
const needsBirthdatePrompt = !!myMemberProfile && !myMemberProfile.birthdate;

const selectedDateEvents: Schedule[] = useMemo(
  () => selectedScheduleDate ? (dateEventsMap[selectedScheduleDate] ?? []) : [],
  [selectedScheduleDate, dateEventsMap]
);
const editingExisting: Schedule | null = useMemo(
  () => selectedEventId ? (allSchedules.find(s => s.id === selectedEventId) ?? null) : null,
  [selectedEventId, allSchedules]
);

const openBlankEventForm = (dateStr: string) => {
  // Absolute rule: past dates are view-only for everyone — no exceptions
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  if (dateStr < todayStr) {
showToast("error", "This date has passed. Events cannot be added.");
    return;
  }
  setSelectedScheduleDate(dateStr);
  setSelectedEventId(null);
  setSchedPanelMode("edit");
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
  onEventPanelOpen?.();
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
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const isPastDate = dateStr < todayStr;
  const eventsOnDate = allSchedules.filter(s => s.date === dateStr);
  const mmdd = dateStr.slice(5);
  const hasBirthdays = (birthdayMap[mmdd] ?? []).length > 0;
  setSelectedScheduleDate(dateStr);
  if (eventsOnDate.length === 0) {
    if (isPastDate && !hasBirthdays) {
      // Past date with no events and no birthdays — nothing to show
      setSelectedScheduleDate(null);
      return;
    }
    // Has birthdays or it's a future date — open panel in view mode
    setSchedPanelMode("view");
    setSelectedEventId(null);
    if (hasBirthdays) onEventPanelOpen?.();
  } else if (eventsOnDate.length === 1) {
    openEventById(eventsOnDate[0].id, dateStr);
    // onEventPanelOpen called inside openEventById
  } else {
    // Day view — show list
    setSelectedEventId(null);
    setSchedPanelMode("view");
    onEventPanelOpen?.();
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
    if (!res.ok) {
      let errMsg = "Save failed. Please try again.";
      try { const err = await res.json(); errMsg = err.error || errMsg; } catch { /* empty body — keep default message */ }
      throw new Error(errMsg);
    }
    const saved = await res.json().catch(() => ({}));
    if (editingExisting) {
      // ── Bug fix: compute updated list BEFORE setState so cache gets fresh data ──
      const updatedSchedules = allSchedules.map(s =>
        s.id === editingExisting.id ? { ...s, ...payload, id: editingExisting.id } : s
      );
      setAllSchedules(updatedSchedules);
      writeSchedulesCache(updatedSchedules); // ← fresh data, not stale closure
showToast("success", "Event updated!");
    } else {
      const newEv: Schedule = { id: saved.id, ...payload };
      const updatedSchedules = [...allSchedules, newEv];
      setAllSchedules(updatedSchedules);
      writeSchedulesCache(updatedSchedules); // ← fresh data, not stale closure
      setSelectedEventId(saved.id);
showToast("success", "Event saved!");
    }
    setSchedPanelMode("view");
    // ── Background re-sync with Firestore so local state == server state ──
    fetchSchedules({ background: true });
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

const handleNotifyTeam = async () => {
  if (!editingExisting || isNotifying) return;
  setIsNotifying(true);
  try {
    const cu = getAuth().currentUser;
    const actorName = cu?.displayName || cu?.email?.split("@")[0] || user?.displayName || "Team Admin";
    const res = await fetch(`/api/schedules/${editingExisting.id}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorName }),
    });
    let data: any = {};
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
    // Update local state so cooldown shows immediately
    setAllSchedules(prev => prev.map(s =>
      s.id === editingExisting.id ? { ...s, lastNotifiedAt: new Date().toISOString() } as any : s
    ));
showToast("success", "Team notified via email!");
  } catch (err: any) {
showToast("error", err.message || "Could not send notification.");
  } finally {
    setIsNotifying(false);
  }
};

// \u2500\u2500 Lineup acknowledgment (heart) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const handleLineupAck = async (scheduleId: string) => {
  if (isAcking) return;
  const cu = getAuth().currentUser;
if (!cu) { showToast("error", "You must be signed in to acknowledge."); return; }
  const userId = cu.uid;
  const userName = cu.displayName || cu.email?.split("@")[0] || "Team Member";
  const photo = cu.photoURL || "";
  setIsAcking(true);

  // Optimistic update
  const existing = allSchedules.find(s => s.id === scheduleId);
  const acksNow = existing?.lineupAcks ?? [];
  const alreadyAcked = acksNow.some(a => a.userId === userId);
  const optimisticAcks = alreadyAcked
    ? acksNow.filter(a => a.userId !== userId)
    : [...acksNow, { userId, userName, photo }];
  setAllSchedules(prev => prev.map(s =>
    s.id === scheduleId ? { ...s, lineupAcks: optimisticAcks } : s
  ));

  try {
    const res = await fetch(`/api/schedules/${scheduleId}/ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, userName, photo }),
    });
    if (!res.ok) throw new Error("ack failed");
    const data = await res.json();
    setAllSchedules(prev => prev.map(s =>
      s.id === scheduleId ? { ...s, lineupAcks: data.lineupAcks ?? optimisticAcks } : s
    ));
  } catch {
    // Revert on error
    setAllSchedules(prev => prev.map(s =>
      s.id === scheduleId ? { ...s, lineupAcks: acksNow } : s
    ));
showToast("error", "Could not save acknowledgment. Try again.");
  } finally {
    setIsAcking(false);
  }
};


  useEffect(() => {
    if (allSchedules.length > 0) {
      // Data already seeded from App.tsx cache — silent background refresh
      fetchSchedules({ background: true });
    } else {
      fetchSchedules();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch my assigned Ministry Hub cards ──────────────────────────────────
  // Cards store members as display names (not emails), so we query by memberName.
  // We also pass userEmail as a secondary key in case some cards were stored with email.
  useEffect(() => {
    const email = user?.email?.trim().toLowerCase();
    if (!email) return;
    // myMemberProfile.name is the display name stored in cards' members[] array
    const memberName = myMemberProfile?.name?.trim() ?? "";
    const params = new URLSearchParams();
    params.set("userEmail", email);
    if (memberName) params.set("memberName", memberName);
    fetch(`/api/planner/my-cards?${params.toString()}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setMyPlannerCards(data); })
      .catch(() => {});
  }, [user?.email, myMemberProfile?.name]);

  // ── Deep-link: open specific event from notification ─────────────────────
  useEffect(() => {
    if (!deepLinkEventId || !deepLinkEventDate || !allSchedules.length) return;
    openEventById(deepLinkEventId, deepLinkEventDate);
    onDeepLinkHandled?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkEventId, deepLinkEventDate, allSchedules.length]);

  // ── Render ────────────────────────────────────────────────────────────────
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthSchedules = allSchedules.filter(s => {
    const d = new Date(s.date + "T00:00:00");
    return d.getFullYear() === year && d.getMonth() === month;
  });

  return (
    <>
    <div className="max-w-7xl mx-auto">
      {/* Single toolbar row: [Month|List] — [< Apr 2026 >] — [Add Event] */}
      <div className="flex items-center justify-between gap-2 mb-4">

        {/* Left: view toggle */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-0.5 gap-0.5 shrink-0">
          <button onClick={() => setScheduleView("month")} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all ${scheduleView === "month" ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white"}`}>
            <Calendar size={14} />
            <span className="hidden min-[375px]:inline">Month</span>
          </button>
          <button onClick={() => setScheduleView("list")} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all ${scheduleView === "list" ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white"}`}>
            <List size={14} />
            <span className="hidden min-[375px]:inline">List</span>
          </button>
        </div>

        {/* Center: month navigation */}
        <div className="flex items-center gap-1 sm:gap-2">
          <button onClick={() => setCalendarMonth(new Date(year, month - 1, 1))} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"><ChevronLeft size={18} /></button>
          <h2 className="font-bold text-gray-900 dark:text-white text-base sm:text-lg min-w-[120px] sm:min-w-[160px] text-center">
            {calendarMonth.toLocaleDateString("en", { month: "long", year: "numeric" })}
          </h2>
          <button onClick={() => setCalendarMonth(new Date(year, month + 1, 1))} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"><ChevronRight size={18} /></button>
        </div>

        {/* Right: Add Event button */}
        <div className="shrink-0">
          {(() => {
            const isListView = scheduleView === "list";
            const hasExisting = selectedDateEvents.length > 0;
            const canBypassPast = false;
            const hasDate = !!selectedScheduleDate && selectedScheduleDate >= todayStr;
            const isPast = !!selectedScheduleDate && selectedScheduleDate < todayStr;
            const isFormOpen = schedPanelMode === "edit";
            const canAdd = (canWriteSchedule || leaderCanAddOnDate) && !isListView && hasDate && !isFormOpen && selectedDateEvents.length === 0;
            const label = hasExisting ? "Add Another Event" : "Add Event";
            const disabledTitle = isPast && !canBypassPast
               ? "This date has passed — cannot add events"
               : (!canWriteSchedule && !isLeader)
                 ? "You don't have permission to add events"
                 : isFormOpen
                   ? "Close the current form before adding a new event"
                   : isListView
                     ? "Switch to Month view to add events"
                     : "Select a date on the calendar first";
            if (canAdd) {
              return (
                <button onClick={() => { setSelectedEventId(null); setSchedPanelMode("edit"); openBlankEventForm(selectedScheduleDate!); }}
                  className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-medium transition-colors whitespace-nowrap">
                  <Plus size={16} />
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">Add</span>
                </button>
              );
            }
            return (
              <button disabled title={disabledTitle}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed select-none whitespace-nowrap">
                <Plus size={16} />
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">Add</span>
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
                  <div key={`e${i}`} className="min-h-[80px] lg:min-h-[110px] border-b border-r border-gray-200 dark:border-gray-700/50" />
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
                      className={`group relative min-h-[80px] lg:min-h-[110px] border-b border-r border-gray-200 dark:border-gray-700/50 p-1.5 lg:p-2 text-left transition-colors ${isCellPast && !cellHasEvents ? "opacity-40 cursor-not-allowed" : "hover:bg-indigo-50 dark:hover:bg-indigo-900/20"} ${isSelected ? "bg-indigo-50 dark:bg-indigo-900/30" : ""}`}
                    >
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium mb-1 ${isToday ? "bg-indigo-600 text-white" : "text-gray-700 dark:text-gray-300"}`}>{day}</span>
                      {(canWriteSchedule || isLeader) && !isCellPast && (
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
                              <p className="text-xs font-semibold text-fuchsia-600 dark:text-fuchsia-300 leading-tight">● {schedEvents.length} events</p>
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
                                   <p className={`text-[11px] lg:text-xs font-medium truncate leading-tight ${clr.text}`}>{nm}</p>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                      {/* Ministry Hub task pill */}
                      {(() => {
                        const tasksOnDay = myPlannerCards.filter(c => c.dueDate === dateStr);
                        if (!tasksOnDay.length) return null;
                        const allDone = tasksOnDay.every(c => c.completed);
                        const doneCt = tasksOnDay.filter(c => c.completed).length;
                        return (
                          <div className="flex items-center gap-0.5 mt-0.5">
                            <SquareKanban size={9} className={allDone ? "text-emerald-500" : "text-amber-500"} />
                            <p className={`text-[10px] font-semibold leading-tight ${allDone ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                              {doneCt}/{tasksOnDay.length} task{tasksOnDay.length !== 1 ? "s" : ""}
                            </p>
                          </div>
                        );
                      })()}
                      {/* Birthday avatars */}
                      {(() => {
                        const mmdd = dateStr.slice(5);
                        const bdays = birthdayMap[mmdd] ?? [];
                        if (!bdays.length) return null;
                        const shown = bdays.slice(0, 3);
                        const extra = bdays.length - shown.length;
                        const bdc = ["bg-pink-500","bg-rose-500","bg-fuchsia-500","bg-violet-500"];
                        return (
                          <div className="flex items-center gap-0.5 mt-0.5 flex-wrap">
                            {shown.map((bm, mi) => (
                              <div key={bm.id} title={`🎂 ${bm.name}'s Birthday`} className="relative shrink-0">
                                {bm.photo
                                  ? <img src={bm.photo} alt={bm.name} className="w-5 h-5 rounded-full object-cover ring-1 ring-pink-300 dark:ring-pink-700" />
                                  : <div className={`w-5 h-5 rounded-full ${bdc[mi % bdc.length]} flex items-center justify-center text-white text-[8px] font-bold ring-1 ring-pink-300 dark:ring-pink-700`}>{bm.name[0].toUpperCase()}</div>
                                }
                                <span className="absolute -bottom-0.5 -right-0.5 text-[7px] leading-none">🎂</span>
                              </div>
                            ))}
                            {extra > 0 && (
                              <span className="text-[9px] font-bold text-pink-500 dark:text-pink-400">+{extra}</span>
                            )}
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
            (() => {
              // Merge schedule events + birthday celebrants into one date-sorted list
              type ListItem =
                | { kind: "event"; date: string; data: typeof monthSchedules[0] }
                | { kind: "bday";  date: string; members: typeof allMembers };

              const items: ListItem[] = [];

              monthSchedules.forEach(s => items.push({ kind: "event", date: s.date, data: s }));

              // Add birthday rows for each day in the current month that has celebrants
              Array.from({ length: daysInMonth }).forEach((_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const mmdd = dateStr.slice(5);
                const bdays = birthdayMap[mmdd] ?? [];
                if (bdays.length > 0) items.push({ kind: "bday", date: dateStr, members: bdays });
              });

              items.sort((a, b) => a.date.localeCompare(b.date));

              if (items.length === 0) {
                return (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 text-center py-16 text-gray-400">
                    <Calendar size={40} className="mx-auto mb-3 opacity-40" />
                    <p className="font-semibold">No events or birthdays this month</p>
                    <p className="text-sm mt-1">Click a date on the calendar to add one.</p>
                  </div>
                );
              }

              return (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className={`grid gap-px bg-gray-100 dark:bg-gray-700 ${selectedScheduleDate ? "grid-cols-1 md:grid-cols-1 lg:grid-cols-2" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"}`}>
                    {items.map((item, idx) => {
                      const d = new Date(item.date + "T00:00:00");
                      const isPast = item.date < todayStr;

                      if (item.kind === "bday") {
                        // ── Birthday row ──────────────────────────────────────
                        return (
                          <div key={`bday-${item.date}`} className="relative flex items-center gap-4 p-4 bg-white dark:bg-gray-800 border-l-4 border-pink-400 dark:border-pink-600">
                            {/* Date badge — pink theme */}
                            <div className={`shrink-0 rounded-xl px-3 py-2 text-center min-w-[52px] ${isPast ? "bg-gray-100 dark:bg-gray-700" : "bg-pink-50 dark:bg-pink-900/30"}`}>
                              <div className={`text-xs font-semibold uppercase ${isPast ? "text-gray-400" : "text-pink-500"}`}>{d.toLocaleDateString("en", { month: "short" })}</div>
                              <div className={`text-xl font-bold leading-none ${isPast ? "text-gray-400 dark:text-gray-500" : "text-pink-700 dark:text-pink-300"}`}>{d.getDate()}</div>
                              <div className={`text-[10px] ${isPast ? "text-gray-400" : "text-pink-400"}`}>{d.toLocaleDateString("en", { weekday: "short" })}</div>
                            </div>
                            {/* Celebrant info */}
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-pink-600 dark:text-pink-400 text-sm flex items-center gap-1.5">
                                🎂 Birthday Celebration
                              </p>
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                {item.members.map(bm => (
                                  <div key={bm.id} className="flex items-center gap-1 bg-pink-50 dark:bg-pink-900/20 rounded-full pl-0.5 pr-2 py-0.5">
                                    {bm.photo
                                      ? <img src={bm.photo} alt={bm.name} className="w-5 h-5 rounded-full object-cover ring-1 ring-pink-300" />
                                      : <div className="w-5 h-5 rounded-full bg-pink-500 flex items-center justify-center text-white text-[9px] font-bold">{bm.name[0]}</div>
                                    }
                                    <span className="text-xs font-medium text-pink-700 dark:text-pink-300">{bm.name.split(" ")[0]}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      // ── Schedule event row ────────────────────────────────
                      const s = item.data;
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
                </div>
              );
            })()
          )}
        </div>

        {/* SIDE PANEL */}
        {selectedScheduleDate && (() => { const _mmdd = selectedScheduleDate.slice(5); const _hasBd = (birthdayMap[_mmdd] ?? []).length > 0; const _hasTasks = myPlannerCards.some(c => c.dueDate === selectedScheduleDate); return (selectedDateEvents.length > 0 || schedPanelMode === "edit" || _hasBd || _hasTasks); })() && (
          <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={closeScheduleEditor} />
        )}
        {selectedScheduleDate && (() => { const _mmdd = selectedScheduleDate.slice(5); const _hasBd = (birthdayMap[_mmdd] ?? []).length > 0; const _hasTasks = myPlannerCards.some(c => c.dueDate === selectedScheduleDate); return (selectedDateEvents.length > 0 || schedPanelMode === "edit" || _hasBd || _hasTasks); })() && (() => {
          const isDatePast = selectedScheduleDate < todayStr;
          const tasksOnThisDay = myPlannerCards.filter(c => c.dueDate === selectedScheduleDate);
          const showDayView = (selectedDateEvents.length >= 1 || (birthdayMap[selectedScheduleDate.slice(5)] ?? []).length > 0 || tasksOnThisDay.length > 0) && !selectedEventId && schedPanelMode !== "edit";
          const bdaysOnDate = birthdayMap[selectedScheduleDate.slice(5)] ?? [];
          if (showDayView) {
            const dateLabel = new Date(selectedScheduleDate + "T00:00:00").toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
            return (
              <div className="fixed top-1/2 -translate-y-1/2 left-4 right-4 z-50 md:static md:translate-y-0 md:z-auto md:w-80 md:shrink-0 bg-white dark:bg-gray-800 rounded-2xl md:rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl p-5 max-h-[85dvh] md:max-h-[calc(100vh-200px)] overflow-y-auto md:self-start md:sticky md:top-0">
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
                  {/* Birthday celebrant cards — clickable when date is not past */}
                  {bdaysOnDate.map(bm => {
                    const bdColors = ["bg-pink-500","bg-rose-500","bg-fuchsia-500","bg-violet-500"];
                    const bdBg = bdColors[bm.name.charCodeAt(0) % bdColors.length];
                    // Only allow greeting on the celebrant's actual birthday (today)
                    const canGreet = selectedScheduleDate === todayStr;
                    const CardEl = canGreet ? "button" : "div";
                    return (
                      <CardEl
                        key={bm.id}
                        {...(canGreet ? { onClick: () => openBdayModal(bm, selectedScheduleDate!) } : {})}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800/50 text-left transition-all ${
                          canGreet ? "hover:bg-pink-100 dark:hover:bg-pink-900/40 hover:border-pink-300 cursor-pointer active:scale-[0.98]" : "select-none"
                        }`}
                      >
                        <div className="relative shrink-0">
                          {bm.photo
                            ? <img src={bm.photo} alt={bm.name} className="w-9 h-9 rounded-full object-cover ring-2 ring-pink-300 dark:ring-pink-700" />
                            : <div className={`w-9 h-9 rounded-full ${bdBg} flex items-center justify-center text-white text-sm font-bold ring-2 ring-pink-300 dark:ring-pink-700`}>{bm.name[0].toUpperCase()}</div>
                          }
                          <span className="absolute -bottom-0.5 -right-0.5 text-[11px] leading-none">🎂</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-pink-700 dark:text-pink-300 truncate">{bm.name}</p>
                          <p className="text-xs text-pink-500 dark:text-pink-400">{canGreet ? "🎉 Tap to send birthday greetings!" : "🎉 It's their birthday!"}</p>
                        </div>
                        {canGreet && <Heart size={15} className="text-pink-400 shrink-0" />}
                      </CardEl>
                    );
                  })}
                </div>

                {/* ── Ministry Hub tasks due on this date ── */}
                {(() => {
                  if (!tasksOnThisDay.length) return null;
                  const doneCount = tasksOnThisDay.filter(c => c.completed).length;
                  return (
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <SquareKanban size={12} className="text-amber-500" />
                          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">My Tasks</p>
                        </div>
                        <span className="text-[10px] font-semibold text-gray-400">{doneCount}/{tasksOnThisDay.length} done</span>
                      </div>
                      <div className="space-y-1.5">
                        {tasksOnThisDay.map(card => (
                          <div key={card.id} className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all ${
                            card.completed
                              ? "bg-emerald-50 dark:bg-emerald-900/15 border-emerald-300 dark:border-emerald-700/50"
                              : "bg-amber-50 dark:bg-amber-900/15 border-amber-200 dark:border-amber-700/40"
                          }`}>
                            <div className="shrink-0 mt-0.5">
                              {card.completed
                                ? <CheckCircle2 size={14} className="text-emerald-500" />
                                : <div className="w-3.5 h-3.5 rounded-full border-2 border-amber-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-medium leading-snug ${
                                card.completed ? "line-through text-emerald-600 dark:text-emerald-400" : "text-gray-800 dark:text-gray-100"
                              }`}>{card.title}</p>
                              <p className={`text-[10px] mt-0.5 truncate ${
                                card.completed ? "text-emerald-600 dark:text-emerald-500" : "text-amber-600 dark:text-amber-500"
                              }`}>{card.boardTitle}</p>
                            </div>
                            {onNavigateToPlanner && (
                              <button
                                onClick={() => onNavigateToPlanner({ boardId: card.boardId, cardId: card.id })}
                                title="Open card in Ministry Hub"
                                className={`shrink-0 p-1.5 rounded-lg transition-all ${
                                  card.completed
                                    ? "text-emerald-500 hover:text-white hover:bg-emerald-500 dark:hover:bg-emerald-600"
                                    : "text-amber-500 hover:text-white hover:bg-amber-500 dark:hover:bg-amber-600"
                                }`}
                              >
                                <ExternalLink size={12} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {isDatePast ? (
                  <div className="w-full flex items-center gap-2 py-2.5 px-3 border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-xl text-xs font-medium">
                    <Lock size={13} className="shrink-0" />
                    This date has passed — view only
                  </div>
                ) : (
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
            <div className="fixed top-1/2 -translate-y-1/2 left-4 right-4 z-50 md:static md:translate-y-0 md:z-auto md:w-80 md:shrink-0 bg-white dark:bg-gray-800 rounded-2xl md:rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl p-5 max-h-[85dvh] md:max-h-[calc(100vh-200px)] overflow-y-auto md:self-start md:sticky md:top-0">
              {isDatePast && (
                <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl px-3 py-2 mb-3 text-xs text-amber-700 dark:text-amber-400">
                  <Lock size={13} className="shrink-0" />
                  <span>This date has passed — view only</span>
                </div>
              )}


              {selectedDateEvents.length >= 1 && selectedEventId && (() => {
                // Heart pill vars — computed here so both the row and header can use them
                const cu = getAuth().currentUser;
                const myUid = cu?.uid ?? "";
                const acksForThisEvent = editingExisting?.lineupAcks ?? [];
                const iHaveAcked = acksForThisEvent.some(a => a.userId === myUid);
                const ackCount = acksForThisEvent.length;
                const ackTooltip = acksForThisEvent.length === 0
                  ? "Be the first to acknowledge this event"
                  : acksForThisEvent.slice(0, 5).map(a => a.userName).join(", ") +
                    (acksForThisEvent.length > 5 ? ` +${acksForThisEvent.length - 5} more` : "");
                return (
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={() => { setSelectedEventId(null); setSchedPanelMode("view"); }}
                      className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium transition-colors"
                    >
                      <ChevronLeft size={14} /> All events this day
                    </button>
                    {/* Heart ack — only in view mode for upcoming events */}
                    {schedPanelMode === "view" && editingExisting && !isDatePast && (
                      <button
                        onClick={() => handleLineupAck(editingExisting.id)}
                        disabled={isAcking}
                        title={ackTooltip}
                        className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold transition-all ${
                          iHaveAcked
                            ? "bg-pink-100 dark:bg-pink-900/40 text-pink-600 dark:text-pink-400"
                            : "text-gray-400 hover:text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/20"
                        }`}
                      >
                        <Heart size={16} className={iHaveAcked ? "fill-pink-500 text-pink-500" : ""} />
                        {ackCount > 0 && <span className="text-sm">{ackCount}</span>}
                      </button>
                    )}
                  </div>
                );
              })()}
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
                    <button
                      onClick={() => {
                        // Bug fix: always reload form from latest editingExisting data
                        const ev = editingExisting;
                        setEditSchedEventName((ev as any).eventName || (ev.serviceType === "sunday" ? "Sunday Service" : "Midweek Service"));
                        setEditSchedServiceType((ev.serviceType as any) || "sunday");
                        setEditSchedWorshipLeader(ev.worshipLeader ?? null);
                        setEditSchedBackupSingers(ev.backupSingers ?? []);
                        setEditSchedMusicians(ev.musicians ?? []);
                        setEditSchedAssignments(((ev as any).assignments ?? []).map((a: any) => ({ ...a, search: "" })));
                        setEditSchedSongLineup(ev.songLineup ?? {});
                        setEditSchedNotes(ev.notes ?? "");
                        setSchedMemberSearch("");
                        setJoyfulSearch("");
                        setSolemnSearch("");
                        setPendingRolePick(null);
                        setSchedPanelMode("edit");
                      }}
                      className="p-1.5 text-gray-400 hover:text-indigo-500 rounded-lg transition-colors"
                    >
                      <Pencil size={16} />
                    </button>
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
                <>
                <div className="space-y-4">
                  {/* Created by — always shown at top */}
                  {editingExisting.created_by_name && (() => {
                    const name = editingExisting.created_by_name!;
                    const photo = allMembers.find(m => m.name?.toLowerCase().startsWith(name.split(" ")[0].toLowerCase()))?.photo || editingExisting.created_by_photo || "";
                    const colors = ["bg-indigo-500","bg-violet-500","bg-pink-500","bg-emerald-500","bg-amber-500"];
                    const bg = colors[name.charCodeAt(0) % colors.length];
                    const parts = name.trim().split(/\s+/);
                    const fmtName = parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0]}.`;
                    return (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-700/40 border border-gray-100 dark:border-gray-700">
                        {photo
                          ? <img src={photo} className="w-6 h-6 rounded-full object-cover shrink-0" alt={name} />
                          : <div className={`w-6 h-6 rounded-full ${bg} flex items-center justify-center text-white text-[9px] font-bold shrink-0`}>{name[0].toUpperCase()}</div>
                        }
                        <span className="text-xs text-gray-500 dark:text-gray-400">Created by <span className="font-semibold text-gray-700 dark:text-gray-200">{fmtName}</span></span>
                      </div>
                    );
                  })()}
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
                            {editSchedSongLineup.joyful && (() => { const s = allSongs.find(sg => sg.id === editSchedSongLineup.joyful); return s ? <p className="text-sm mb-1"><Sun size={12} className="inline-block mr-1" /> <span className="font-semibold text-amber-500 uppercase text-xs">Joyful</span>{" "}{s.video_url ? <button onClick={() => onOpenVideo?.(s.video_url!)} className="text-gray-900 dark:text-white hover:text-amber-500 dark:hover:text-amber-400 underline underline-offset-2 decoration-amber-400/60 transition-colors">{s.title} <span className="inline-block text-[10px] text-amber-400 align-middle">▶</span></button> : <span className="text-gray-900 dark:text-white">{s.title}</span>}</p> : null; })()}
                            {editSchedSongLineup.solemn && (() => { const s = allSongs.find(sg => sg.id === editSchedSongLineup.solemn); return s ? <p className="text-sm"><Music size={12} className="inline-block mr-1" /> <span className="font-semibold text-indigo-400 uppercase text-xs">Solemn</span>{" "}{s.video_url ? <button onClick={() => onOpenVideo?.(s.video_url!)} className="text-gray-900 dark:text-white hover:text-indigo-400 dark:hover:text-indigo-300 underline underline-offset-2 decoration-indigo-400/60 transition-colors">{s.title} <span className="inline-block text-[10px] text-indigo-400 align-middle">▶</span></button> : <span className="text-gray-900 dark:text-white">{s.title}</span>}</p> : null; })()}
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
                {/* ── Notify Team button — Admin/Leader only, future events ── */}
                {(isAdmin || isLeader) && !isDatePast && editingExisting && schedPanelMode === "view" && (() => {
                  const lastNotifiedAt = (editingExisting as any).lastNotifiedAt;
                  const lastDate = lastNotifiedAt ? new Date(lastNotifiedAt) : null;
                  const hoursSince = lastDate ? (Date.now() - lastDate.getTime()) / 3_600_000 : 999;
                  const onCooldown = hoursSince < 24;
                  const lastLabel = lastDate
                    ? lastDate.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", hour12: true })
                    : null;
                  // Build song title labels for preview
                  const jSongPreview = allSongs.find(sg => sg.id === editSchedSongLineup.joyful);
                  const sSongPreview = allSongs.find(sg => sg.id === editSchedSongLineup.solemn);
                  return (
                    <div className="mt-4 space-y-1.5">
                      <div className="flex gap-2">
                        {/* ── Email Preview button ── */}
                        <button
                          onClick={() => setShowEmailPreview(true)}
                          title="Preview email before sending"
                          className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-all bg-white dark:bg-gray-700/50"
                        >
                          <Eye size={15} />
                        </button>
                        {/* ── Notify Team button ── */}
                        <button
                          onClick={handleNotifyTeam}
                          disabled={isNotifying || onCooldown}
                          title={onCooldown ? `Already notified today at ${lastLabel} — wait 24h` : "Send schedule email to all team members"}
                          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                            onCooldown
                              ? "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                              : "bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white shadow-sm"
                          }`}
                        >
                          {isNotifying
                            ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Sending…</>
                            : <><Mail size={15} />{onCooldown ? `Notified at ${lastLabel}` : "Notify Team"}</>}
                        </button>
                      </div>
                      {onCooldown && (
                        <p className="text-center text-[11px] text-gray-400">Next notification available in {Math.ceil(24 - hoursSince)}h</p>
                      )}

                    </div>
                  );
                })()}

                {/* ── Birthday celebrant cards (single-event view) ── */}
                {(() => {
                  const bdSingle = birthdayMap[selectedScheduleDate!.slice(5)] ?? [];
                  if (!bdSingle.length) return null;
                  const bdColors = ["bg-pink-500","bg-rose-500","bg-fuchsia-500","bg-violet-500"];
                  return (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold text-pink-400 uppercase tracking-wider">🎂 Birthday Celebrants</p>
                      {bdSingle.map(bm => {
                        const bdBg = bdColors[bm.name.charCodeAt(0) % bdColors.length];
                        // Only allow greeting on the celebrant's actual birthday (today)
                        const canGreet = selectedScheduleDate === todayStr;
                        const CardEl = canGreet ? "button" : "div";
                        return (
                          <CardEl
                            key={bm.id}
                            {...(canGreet ? { onClick: () => openBdayModal(bm, selectedScheduleDate!) } : {})}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800/50 text-left transition-all ${
                              canGreet ? "hover:bg-pink-100 dark:hover:bg-pink-900/40 hover:border-pink-300 cursor-pointer active:scale-[0.98]" : "select-none"
                            }`}
                          >
                            <div className="relative shrink-0">
                              {bm.photo
                                ? <img src={bm.photo} alt={bm.name} className="w-9 h-9 rounded-full object-cover ring-2 ring-pink-300 dark:ring-pink-700" />
                                : <div className={`w-9 h-9 rounded-full ${bdBg} flex items-center justify-center text-white text-sm font-bold ring-2 ring-pink-300 dark:ring-pink-700`}>{bm.name[0].toUpperCase()}</div>
                              }
                              <span className="absolute -bottom-0.5 -right-0.5 text-[11px] leading-none">🎂</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-pink-700 dark:text-pink-300 truncate">{bm.name}</p>
                              <p className="text-xs text-pink-500 dark:text-pink-400">{canGreet ? "🎉 Tap to send birthday greetings!" : "🎉 It's their birthday!"}</p>
                            </div>
                            {canGreet && <Heart size={15} className="text-pink-400 shrink-0" />}
                          </CardEl>
                        );
                      })}
                    </div>
                  );
                })()}
                {/* ── Add Another Event (view mode only, future dates) ── */}
                {!isDatePast && (canWriteSchedule || leaderCanAddOnDate) && (
                  <button
                    onClick={() => openBlankEventForm(selectedScheduleDate!)}
                    className="w-full flex items-center justify-center gap-2 mt-4 py-2.5 border-2 border-dashed border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-sm font-medium transition-colors"
                  >
                    <Plus size={16} /> Add Another Event
                  </button>
                )}
                </>
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
                              // Only show the member's INSTRUMENT roles in the picker (not ALL roles).
                              // A member like Jamielyn may have ["Backup Singer", "Rhythm Guitar"] —
                              // we must only offer the instrument role in the musician section.
                              const allRoles: string[] = ((m as any).roles || []).filter((r: string) => r.trim());
                              const instrumentRoles = allRoles.filter(r => INSTRUMENTALIST_ROLES.includes(r));
                              // Fall back to all roles if no specific instrument role found
                              const memberRoles = instrumentRoles.length > 0 ? instrumentRoles : allRoles;
                              const isPending = pendingRolePick?.m.id === m.id;
                              return (
                                <div key={m.id}>
                                  <button type="button"
                                    onClick={() => {
                                      if (memberRoles.length <= 1) {
                                        // Single instrument role → add immediately, no picker needed
                                        setEditSchedMusicians(prev => [...prev, { memberId: m.id, name: m.name, photo: m.photo, role: memberRoles[0] || "Musician" }]);
                                        setPendingRolePick(null);
                                      } else {
                                        // Multiple instrument roles → show picker (toggle)
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
                    <AutoTextarea
                      value={editSchedNotes}
                      onChange={e => setEditSchedNotes(e.target.value)}
                      minRows={3}
                      maxRows={8}
                      placeholder="Add notes, reminders, or announcements…"
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
                    />
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

    {/* ── Email Preview Modal — rendered at root so it truly covers the full screen ── */}
    {showEmailPreview && editingExisting && (() => {
      const _ev = editingExisting as any;
      const dateLabel = new Date(_ev.date + "T00:00:00").toLocaleDateString("en", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      const st = _ev.serviceType || "";
      const _evName = editSchedEventName || "";
      const _isStandardSvc = ["sunday service", "midweek service"].includes(_evName.trim().toLowerCase());
      // Redundancy fix: custom events just say "Event" — no need to repeat the event name as the badge
      const serviceLabel = _isStandardSvc
        ? (st === "sunday" ? "Sunday Service" : st === "midweek" ? "Mid-Week Service" : "Event")
        : "Event";
      const jSong = allSongs.find(sg => sg.id === editSchedSongLineup.joyful);
      const sSong = allSongs.find(sg => sg.id === editSchedSongLineup.solemn);
      return (
        <div
          className="fixed inset-0 z-[600] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setShowEmailPreview(false)}
        >
          <div
            className="relative w-full max-w-[480px] max-h-[90dvh] flex flex-col rounded-2xl overflow-hidden shadow-2xl ring-1 ring-black/10"
            onClick={e => e.stopPropagation()}
          >
            {/* ─ Sticky top bar ─ */}
            <div className="flex-shrink-0 flex items-center justify-between bg-white border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <Eye size={14} className="text-violet-600" />
                <span className="text-xs font-semibold text-violet-600 tracking-wide">Email Preview</span>
                <span className="text-xs text-slate-400">— what your team will receive</span>
              </div>
              <button
                onClick={() => setShowEmailPreview(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-all"
              >
                <X size={14} />
              </button>
            </div>
            {/* ─ Scrollable email body (light theme matching actual email) ─ */}
            <div className="overflow-y-auto" style={{ background: "#f1f5f9", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
              <div style={{ padding: "20px 14px" }}>
                <div style={{ background: "#ffffff", borderRadius: 14, overflow: "hidden", border: "1px solid #e2e8f0", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                  {/* Header gradient */}
                  <div style={{ background: "linear-gradient(135deg,#6d28d9,#4f46e5)", padding: "24px 20px", textAlign: "center" }}>
                    <div style={{ fontSize: 34, marginBottom: 8 }}>🎵</div>
                    <div style={{ color: "#fff", fontSize: 20, fontWeight: 800 }}>WorshipFlow</div>
                    <div style={{ color: "#ddd6fe", fontSize: 11, marginTop: 5, letterSpacing: "0.5px", textTransform: "uppercase" }}>Team Schedule Update</div>
                  </div>
                  {/* Body */}
                  <div style={{ padding: "20px 20px 16px" }}>
                    <p style={{ color: "#475569", fontSize: 13, margin: "0 0 16px", lineHeight: 1.6 }}>
                      🎉 <strong style={{ color: "#1e293b" }}>You</strong> has scheduled a new event for your team.
                    </p>
                    {/* Event card */}
                    <div style={{ background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", padding: "14px 16px" }}>
                      <div style={{ fontSize: 10, color: "#6d28d9", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 3 }}>{serviceLabel}</div>
                      <div style={{ color: "#0f172a", fontSize: 17, fontWeight: 800, marginBottom: 14 }}>{editSchedEventName || "Worship Service"}</div>
                      {/* Date */}
                      <div style={{ paddingTop: 10, paddingBottom: 10, borderTop: "1px solid #e2e8f0" }}>
                        <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>📅 Date</div>
                        <div style={{ color: "#1e293b", fontSize: 14, fontWeight: 600, marginTop: 4 }}>{dateLabel}</div>
                      </div>
                      {/* Lead Facilitators — non-service events only */}
                      {editSchedAssignments.length > 0 && (
                        <div style={{ paddingTop: 10, paddingBottom: 10, borderTop: "1px solid #e2e8f0" }}>
                          <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>👥 Lead Facilitators</div>
                          {editSchedAssignments.map((asgn, gi) => (
                            <div key={gi} style={{ marginTop: 8 }}>
                              <div style={{ color: "#6d28d9", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>{asgn.role}</div>
                              {asgn.members.length > 0
                                ? asgn.members.map((m, mi) => (
                                    <div key={mi} style={{ color: "#1e293b", fontSize: 13, fontWeight: 500, marginTop: 2 }}>{m.name}</div>
                                  ))
                                : <div style={{ color: "#94a3b8", fontSize: 12, fontStyle: "italic" }}>No members assigned</div>
                              }
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Worship Leader */}
                      {editSchedWorshipLeader && (
                        <div style={{ paddingTop: 10, paddingBottom: 10, borderTop: "1px solid #e2e8f0" }}>
                          <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>🎤 Worship Leader</div>
                          <div style={{ color: "#1e293b", fontSize: 14, fontWeight: 600, marginTop: 4 }}>{editSchedWorshipLeader.name}</div>
                        </div>
                      )}
                      {/* Backup Singers */}
                      {editSchedBackupSingers.length > 0 && (
                        <div style={{ paddingTop: 10, paddingBottom: 10, borderTop: "1px solid #e2e8f0" }}>
                          <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>🎙️ Backup Singers</div>
                          {editSchedBackupSingers.map((m, i) => (
                            <div key={i} style={{ color: "#1e293b", fontSize: 13, fontWeight: 500, marginTop: 4 }}>
                              {m.name}{m.role ? <span style={{ color: "var(--wf-c2-hex)", fontSize: 11, fontWeight: 600, marginLeft: 4 }}>({m.role})</span> : null}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Musicians */}
                      {editSchedMusicians.length > 0 && (
                        <div style={{ paddingTop: 10, paddingBottom: 10, borderTop: "1px solid #e2e8f0" }}>
                          <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>🎸 Musicians</div>
                          {editSchedMusicians.map((m, i) => (
                            <div key={i} style={{ color: "#1e293b", fontSize: 13, fontWeight: 500, marginTop: 4 }}>
                              {m.name}{m.role ? <span style={{ color: "#0891b2", fontSize: 11, fontWeight: 600, marginLeft: 4 }}>({m.role})</span> : null}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Song Lineup */}
                      {(sSong || jSong) && (
                        <div style={{ paddingTop: 10, paddingBottom: 10, borderTop: "1px solid #e2e8f0" }}>
                          <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>🎵 Song Lineup</div>
                          {sSong && (
                            <div style={{ color: "#1e293b", fontSize: 13, fontWeight: 500, marginTop: 5 }}>
                              <span style={{ display: "inline-block", background: "#ede9fe", color: "#6d28d9", fontSize: 10, fontWeight: 700, textTransform: "uppercase", padding: "2px 7px", borderRadius: 4, marginRight: 6 }}>Solemn</span>
                              {sSong.title}
                            </div>
                          )}
                          {jSong && (
                            <div style={{ color: "#1e293b", fontSize: 13, fontWeight: 500, marginTop: 5 }}>
                              <span style={{ display: "inline-block", background: "#dcfce7", color: "#166534", fontSize: 10, fontWeight: 700, textTransform: "uppercase", padding: "2px 7px", borderRadius: 4, marginRight: 6 }}>Joyful</span>
                              {jSong.title}
                            </div>
                          )}
                        </div>
                      )}
                      {/* Notes */}
                      {editSchedNotes?.trim() && (
                        <div style={{ paddingTop: 10, paddingBottom: 10, borderTop: "1px solid #e2e8f0" }}>
                          <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>📝 Notes</div>
                          <div style={{ color: "#475569", fontSize: 13, lineHeight: 1.6, marginTop: 5, whiteSpace: "pre-wrap" }}>{editSchedNotes.trim()}</div>
                        </div>
                      )}
                    </div>
                    {/* CTA */}
                    <div style={{ textAlign: "center", marginTop: 18 }}>
                      <div style={{ display: "inline-block", background: "linear-gradient(135deg,#6d28d9,#4f46e5)", color: "#fff", padding: "11px 30px", borderRadius: 10, fontSize: 14, fontWeight: 700 }}>View Schedule →</div>
                    </div>
                  </div>
                  {/* Footer */}
                  <div style={{ padding: "12px 20px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", textAlign: "center" }}>
                    <div style={{ color: "#94a3b8", fontSize: 10 }}>WorshipFlow · worshipflow.dev · You're receiving this because you're part of the worship team.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    })()}
    {/* ── BIRTHDAY GREETING MODAL ──────────────────────────────────────────── */}
    {bdayModal && (
      <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" onClick={() => setBdayModal(null)}>
        <div className="w-full max-w-sm bg-white dark:bg-gray-800 border border-pink-200 dark:border-pink-800/60 rounded-2xl shadow-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎂</span>
              <div>
                <p className="text-sm font-bold text-gray-800 dark:text-white">Birthday Greetings</p>
                <p className="text-xs text-pink-500 font-medium">{bdayModal.member.name}</p>
              </div>
            </div>
            <button onClick={() => setBdayModal(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Celebrant avatar */}
          <div className="flex justify-center">
            {bdayModal.member.photo
              ? <img src={bdayModal.member.photo} alt={bdayModal.member.name} className="w-16 h-16 rounded-full object-cover ring-4 ring-pink-300 dark:ring-pink-600" />
              : <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-2xl font-bold ring-4 ring-pink-300 dark:ring-pink-600">{bdayModal.member.name[0].toUpperCase()}</div>
            }
          </div>

          {/* Already wished state */}
          {bdaySending === "sent" ? (
            <div className="text-center py-2">
              <p className="text-2xl mb-1">🎉</p>
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Wish sent!</p>
              <p className="text-xs text-gray-500 mt-0.5">Your birthday greeting has been delivered.</p>
              <button onClick={() => setBdayModal(null)} className="mt-3 px-4 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Close</button>
            </div>
          ) : (
            <>
              {/* Quick-pick messages */}
              <div className="flex flex-wrap gap-1.5">
                {BDAY_QUICK_MSGS.map(q => (
                  <button
                    key={q}
                    onClick={() => setBdayMsg(q)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                      bdayMsg === q
                        ? "bg-pink-500 text-white border-pink-500"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-pink-400"
                    }`}
                  >{q}</button>
                ))}
              </div>

              {/* Custom message */}
              <textarea
                value={bdayMsg}
                onChange={e => setBdayMsg(e.target.value)}
                placeholder="Or write your own heartfelt message..."
                maxLength={200}
                rows={3}
                className="w-full text-sm px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-400 resize-none"
              />

              {/* Actions */}
              <div className="flex gap-2">
                <button onClick={() => setBdayModal(null)} className="flex-1 py-2 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded-xl border border-gray-200 dark:border-gray-600">
                  Cancel
                </button>
                <button
                  onClick={sendBdayWish}
                  disabled={!bdayMsg.trim() || bdaySending === "sending"}
                  className="flex-[2] py-2 text-sm font-bold rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white hover:from-pink-600 hover:to-rose-600 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {bdaySending === "sending" ? <Loader2 size={14} className="animate-spin" /> : <><Heart size={13} /> Send Greeting</>}
                </button>
              </div>
            </>
          )}

          {/* Who already wished */}
          {(bdayLoadingWishes || bdayWishes.length > 0) && bdaySending !== "sent" && (
            <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                💖 Wishes sent ({bdayWishes.length})
              </p>
              {bdayLoadingWishes ? (
                <div className="flex justify-center py-2"><Loader2 size={16} className="animate-spin text-pink-400" /></div>
              ) : (
                <div className="space-y-1.5 max-h-28 overflow-y-auto">
                  {bdayWishes.map((w: any, i: number) => (
                    <div key={i} className="flex items-start gap-2">
                      {w.photo
                        ? <img src={w.photo} alt={w.name} className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5" />
                        : <div className="w-6 h-6 rounded-full bg-pink-100 dark:bg-pink-900/40 flex items-center justify-center text-pink-600 text-[10px] font-bold shrink-0 mt-0.5">{(w.name||"?")[0].toUpperCase()}</div>
                      }
                      <div className="min-w-0">
                        <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">{w.name}: </span>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">{w.message || "Happy Birthday!"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )}
    </>
  );
}
