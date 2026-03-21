import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { db } from "./firebase";
import { collection, getDocs } from "firebase/firestore";
import { Member, ScheduleMember, Schedule } from "./types";
import VerseOfTheDay from "./VerseOfTheDay";
import BirthdayCard from "./BirthdayCard";
import BirthdayBanner from "./BirthdayBanner";
import AssemblyBell from "./AssemblyBell";
import {
    Music, Users, Calendar, NotepadText, ChevronRight, Clock,
    Bug, Lightbulb, CheckCircle2, AlertCircle, Shield, Bell, UserCheck,
    AlertTriangle, CheckCheck, Megaphone, Plus, UserPlus, Zap, BarChart3,
    TrendingUp, ArrowUpRight, Star, Mic2, BookOpen, Radio, ListMusic,
} from "lucide-react";

// Member, ScheduleMember, Schedule are imported from ./types
interface Song { id: string; title: string; artist: string; created_at?: string; }
interface Note { id: string; type: "bug" | "feature" | "general"; content: string; resolved?: boolean; createdAt: string; authorName: string; reactions?: Record<string, string[]>; }

// Module-level cache: approved_users roles are fetched once per page load.
// This avoids re-querying Firestore every time AdminDashboard remounts.
let _approvedRolesCache: Record<string, string> | null = null;



interface Props {
    userName: string; userEmail: string; userId?: string; userPhoto?: string; userRole?: string;
    songs: Song[]; members: Member[]; schedules: Schedule[]; notes: Note[];
    onNavigate: (view: "songs" | "members" | "schedule" | "admin") => void;
    broadcasts?: any[]; pendingUsers?: any[]; loadingExtra?: boolean;
    canAddSong?: boolean; canWriteSchedule?: boolean; canAddMember?: boolean;
    onOpenLineup?: () => void;
    lineupTrackCount?: number;
    isLineupOpen?: boolean;
}

const ROLE_STYLE: Record<string, { label: string; bg: string; text: string; border: string; glow: string }> = {
    admin: { label: "Admin", bg: "bg-amber-500/15", text: "text-amber-300", border: "border-amber-400/30", glow: "rgba(245,158,11,0.28)" },
    leader: { label: "Worship Leader", bg: "bg-indigo-500/15", text: "text-indigo-300", border: "border-indigo-500/40", glow: "rgba(99,102,241,0.28)" },
    planning_lead: { label: "Planning Lead", bg: "bg-rose-500/15", text: "text-rose-300", border: "border-rose-500/40", glow: "rgba(244,63,94,0.25)" },
    musician: { label: "Musician", bg: "bg-purple-500/15", text: "text-purple-300", border: "border-purple-500/40", glow: "rgba(168,85,247,0.25)" },
    audio_tech: { label: "Audio / Tech", bg: "bg-teal-500/15", text: "text-teal-300", border: "border-teal-500/40", glow: "rgba(20,184,166,0.25)" },
    member: { label: "Member", bg: "bg-gray-500/10", text: "text-gray-400", border: "border-gray-500/20", glow: "none" },
    qa_specialist: { label: "QA Specialist", bg: "bg-fuchsia-500/15", text: "text-fuchsia-300", border: "border-fuchsia-500/40", glow: "rgba(217,70,239,0.25)" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysUntil(dateStr: string) {
    try {
        const t = new Date(); t.setHours(0, 0, 0, 0);
        const d = new Date(dateStr + "T00:00:00"); d.setHours(0, 0, 0, 0);
        const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
        if (diff === 0) return "Today"; if (diff === 1) return "Tomorrow";
        if (diff > 0) return `In ${diff} d`; return `${Math.abs(diff)}d ago`;
    } catch { return ""; }
}
function relDate(iso: string) {
    try {
        const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
        if (d === 0) return "Today"; if (d === 1) return "Yesterday";
        if (d < 7) return `${d}d ago`;
        return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
    } catch { return ""; }
}
function svcLabel(t?: string) {
    return ({ sunday_service: "Sunday Service", sunday: "Sunday Service", midweek_service: "Midweek Service", midweek: "Midweek Service", practice: "Practice", special: "Special Event" })[t ?? ""] ?? (t ?? "Event");
}
function svcColor(t?: string) {
    return ({
        sunday_service: "bg-indigo-100 dark:bg-indigo-600/30 text-indigo-700 dark:text-indigo-200",
        sunday: "bg-indigo-100 dark:bg-indigo-600/30 text-indigo-700 dark:text-indigo-200",
        midweek_service: "bg-violet-100 dark:bg-violet-600/30 text-violet-700 dark:text-violet-200",
        midweek: "bg-violet-100 dark:bg-violet-600/30 text-violet-700 dark:text-violet-200",
        practice: "bg-green-100 dark:bg-green-600/30 text-green-700 dark:text-green-200",
        special: "bg-amber-100 dark:bg-amber-600/30 text-amber-700 dark:text-amber-200",
    })[t ?? ""] ?? "bg-violet-100 dark:bg-violet-600/30 text-violet-700 dark:text-violet-200";
}
function greeting() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }

// ── Original app card ─────────────────────────────────────────────────────────
const CARD = "bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm";

// ── Bento Tile ────────────────────────────────────────────────────────────────
function Tile({ children, className = "", onClick, style }: {
    children: React.ReactNode; className?: string; onClick?: () => void; style?: React.CSSProperties;
}) {
    return (
        <div onClick={onClick} style={style}
            className={`${CARD} overflow-hidden
                ${onClick ? "cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all duration-150" : ""}
                ${className}`}>
            {children}
        </div>
    );
}

// ── Card header ───────────────────────────────────────────────────────────────
function CardHeader({ icon, title, action, onAction }: {
    icon: React.ReactNode; title: string; action?: string; onAction?: () => void;
}) {
    return (
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white text-sm">
                {icon}{title}
            </div>
            {action && onAction && (
                <button onClick={onAction} className="text-xs text-indigo-500 hover:text-indigo-400 flex items-center gap-1 font-medium">
                    {action}<ChevronRight size={13} />
                </button>
            )}
        </div>
    );
}

// ── Big metric tile ───────────────────────────────────────────────────────────
function MetricTile({ label, value, sub, iconBg, icon, onClick }: {
    label: string; value: number; sub: string; iconBg: string; icon: React.ReactNode; onClick?: () => void;
}) {
    return (
        <Tile className="p-4 flex flex-col justify-between" onClick={onClick}>
            <div className="flex items-start justify-between">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>{icon}</div>
                <ArrowUpRight size={13} className="text-gray-300 dark:text-gray-600 mt-0.5" />
            </div>
            <div className="mt-2">
                <p className="text-3xl font-black text-gray-900 dark:text-white tracking-tight leading-none">{value}</p>
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mt-1">{label}</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>
            </div>
        </Tile>
    );
}

// ── Next service hero tile ────────────────────────────────────────────────────
function NextServiceTile({ ev, songs, members, myMemberId, onClick }: {
    ev: Schedule | null; songs: Song[]; members: Member[]; myMemberId: string | null; onClick: () => void;
}) {
    // Resolve the best available photo for a ScheduleMember.
    // Priority: directPhoto (stored on record) → by Firestore doc ID → by full name → by first name
    const resolvePhoto = useCallback((m: { memberId?: string; name?: string; photo?: string }): string => {
        const direct = m.photo?.startsWith("http") ? m.photo : "";
        if (direct) return direct;
        const byId   = m.memberId ? members.find(mem => mem.id === m.memberId) : undefined;
        if (byId?.photo?.startsWith("http")) return byId.photo;
        const lower  = (m.name ?? "").toLowerCase().trim();
        const byFull = members.find(mem => mem.name?.toLowerCase().trim() === lower);
        if (byFull?.photo?.startsWith("http")) return byFull.photo;
        // Partial: match by first word of name (less reliable but better than nothing)
        const first  = lower.split(" ")[0];
        const byFirst = first ? members.find(mem => mem.name?.toLowerCase().startsWith(first)) : undefined;
        if (byFirst?.photo?.startsWith("http")) return byFirst.photo;
        return "";
    }, [members]);


    if (!ev) return (
        <Tile className="p-6 flex flex-col gap-3 h-full" onClick={onClick}>
            <div className="flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400 mb-1">
                <Calendar size={15} /> Church Events
            </div>
            <div className="flex flex-col items-center justify-center flex-1 gap-3 py-4">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    <Calendar size={22} className="text-gray-400" />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">No upcoming services</p>
            </div>
        </Tile>
    );

    const du = daysUntil(ev.date);
    const d = new Date(ev.date + "T00:00:00");
    const isUrgent = du === "Today" || du === "Tomorrow";
    const solemn = ev.songLineup?.solemn ? songs.find(s => s.id === ev.songLineup?.solemn) : null;
    const joyful = ev.songLineup?.joyful ? songs.find(s => s.id === ev.songLineup?.joyful) : null;

    const myRoles: string[] = [];
    if (ev.worshipLeader?.memberId === myMemberId) myRoles.push("Worship Leader");
    if ((ev.backupSingers ?? []).some(m => m.memberId === myMemberId)) myRoles.push("Backup Singer");
    if ((ev.musicians ?? []).some(m => m.memberId === myMemberId)) {
        const mu = ev.musicians!.find(m => m.memberId === myMemberId);
        myRoles.push(mu?.role || "Musician");
    }
    (ev.assignments ?? []).forEach(a => { if (a.members.some(m => m.memberId === myMemberId)) myRoles.push(a.role); });

    return (
        <Tile className="relative flex flex-col h-full" onClick={onClick}>
            <CardHeader
                icon={<Star size={14} className="text-indigo-500" />}
                title="Church Events"
                action="Full schedule"
                onAction={onClick}
            />
            <div className="p-5 flex-1 space-y-4">
                {/* Date + event */}
                <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-indigo-600 text-white shrink-0 shadow-md">
                        <p className="text-[9px] font-bold uppercase text-indigo-200">{d.toLocaleDateString("en", { month: "short" })}</p>
                        <p className="text-2xl font-black leading-tight">{d.getDate()}</p>
                        <p className="text-[9px] text-indigo-300">{d.toLocaleDateString("en", { weekday: "short" })}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                            <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight truncate">{ev.eventName ?? "Event"}</p>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${isUrgent ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400" : "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"}`}>{du}</span>
                        </div>
                        {["sunday service", "midweek service"].includes((ev.eventName ?? "").toLowerCase())
                            ? <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full mt-1 inline-block ${svcColor(ev.serviceType)}`}>{svcLabel(ev.serviceType)}</span>
                            : <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full mt-1 inline-block bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Custom Event</span>
                        }
                        {ev.worshipLeader && <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Mic2 size={10} />Leader: {ev.worshipLeader.name}</p>}
                    </div>
                </div>
                {/* My role */}
                {myRoles.length > 0 && (
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">My Role</p>
                        <div className="flex flex-wrap gap-1.5">
                            {myRoles.map(r => (
                                <span key={r} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
                                    <Mic2 size={10} />{r}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
                {/* Songs */}
                {(solemn || joyful) && (
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5 flex items-center gap-1"><Music size={9} />Songs to Prepare</p>
                        <div className="space-y-1.5">
                            {solemn && <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/30 rounded-xl text-xs"><Music size={11} className="text-indigo-500" /><span className="text-gray-400">Solemn:</span><span className="font-semibold text-gray-900 dark:text-gray-100 truncate">{solemn.title}</span></div>}
                            {joyful && <div className="flex items-center gap-2 px-3 py-1.5 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800/30 rounded-xl text-xs"><Star size={11} className="text-violet-500" /><span className="text-gray-400">Joyful:</span><span className="font-semibold text-gray-900 dark:text-gray-100 truncate">{joyful.title}</span></div>}
                        </div>
                    </div>
                )}
                {/* Avatar row */}
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex -space-x-1.5">
                        {[
                            ev.worshipLeader,
                            ...(ev.musicians ?? []).slice(0, 2),
                            ...(ev.backupSingers ?? []).slice(0, 1),
                            ...(ev.assignments ?? []).flatMap(a => a.members).slice(0, 2),
                        ].filter(Boolean).map((m, i) => {
                            const photo = resolvePhoto(m!);
                            const initials = (m!.name || "?")[0].toUpperCase();
                            return photo ? (
                                <img key={i} src={photo} alt={m!.name}
                                    className="w-6 h-6 rounded-full object-cover border-2 border-white dark:border-gray-800"
                                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            ) : (
                                <div key={i} className="w-6 h-6 rounded-full bg-indigo-500 border-2 border-white dark:border-gray-800 flex items-center justify-center text-[9px] font-bold text-white">
                                    {initials}
                                </div>
                            );
                        })}
                    </div>
                    <p className="text-xs text-gray-400">
                        {[
                            ev.worshipLeader,
                            ...(ev.musicians ?? []),
                            ...(ev.backupSingers ?? []),
                            ...(ev.assignments ?? []).flatMap(a => a.members),
                        ].filter(Boolean).length} serving
                    </p>
                </div>
            </div>
        </Tile>
    );
}

// ── Main AdminDashboard ───────────────────────────────────────────────────────
export default function AdminDashboard({
    userName, userEmail, userId = "", userPhoto, songs, members, schedules, notes, onNavigate,
    broadcasts: broadcastsProp, pendingUsers: pendingUsersProp, loadingExtra = false,
    canAddSong, canWriteSchedule, canAddMember, userRole = "admin",
    onOpenLineup, lineupTrackCount = 0, isLineupOpen = false,
}: Props) {
    const broadcasts = broadcastsProp ?? [];
    const pendingUsers = pendingUsersProp ?? [];
    const canAdd = canAddSong ?? false, canSched = canWriteSchedule ?? false, canMember = canAddMember ?? false;
    const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

    const upcomingEvents = useMemo(() =>
        schedules.filter(s => { try { return new Date(s.date + "T00:00:00") >= today; } catch { return false; } })
            .sort((a, b) => a.date.localeCompare(b.date))
        , [schedules, today]);

    const totalEvents = schedules.length;
    const songsUsed = useMemo(() => {
        const ids = new Set<string>();
        schedules.forEach(s => { if (s.songLineup?.solemn) ids.add(s.songLineup.solemn); if (s.songLineup?.joyful) ids.add(s.songLineup.joyful); });
        return ids.size;
    }, [schedules]);
    const isDismissed = (n: Note) => (n.reactions?.nevermind?.length ?? 0) > 0;
    const openBugs = notes.filter(n => n.type === "bug" && !n.resolved && !isDismissed(n)).length;
    const openFeqs = notes.filter(n => n.type === "feature" && !n.resolved && !isDismissed(n)).length;

    const resolvedNotes = notes.filter(n => n.resolved).length;
    const totalNotes = notes.length;
    // Only events literally named "Sunday Service" or "Midweek Service" require a worship leader.
    // serviceType is always "sunday"/"midweek" even for custom events (form default), so we can't use it.
    const isServiceEvent = (e: Schedule) => ["sunday service", "midweek service"].includes((e.eventName ?? "").toLowerCase());
    const coverageIssues = upcomingEvents.filter(e => isServiceEvent(e) && !e.worshipLeader).length;
    const recentSongs = [...songs].filter(s => s.created_at)
        .sort((a, b) => { try { return new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime(); } catch { return 0; } })
        .slice(0, 5);
    const roleGroups = useMemo(() => {
        const g: Record<string, number> = {};
        members.forEach(m => { const r = m.roles?.[0] || "Member"; g[r] = (g[r] ?? 0) + 1; });
        return Object.entries(g).sort((a, b) => b[1] - a[1]);
    }, [members]);

    const myMember = useMemo(() => members.find(m => m.email?.toLowerCase().trim() === userEmail?.toLowerCase().trim()), [members, userEmail]);
    const myMemberId = myMember?.id ?? null;
    const first = userName.split(" ")[0] || "Admin";
    const nextEvent = upcomingEvents[0] ?? null;

    // ── What's New tile: always pick the latest active whats_new broadcast ─────
    // This replaces the old static /release-notes.json fetch so the tile updates
    // immediately every time a new broadcast is posted from Admin Panel.
    const latestBroadcast = useMemo(() => {
        const active = (broadcasts ?? [])
            .filter((b: any) => b.type === "whats_new" && b.active !== false)
            .sort((a: any, b: any) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
        return active[0] ?? null;
    }, [broadcasts]);

    const formatBroadcastDate = (iso: string) => {
        try {
            const d = new Date(iso);
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            const yy = String(d.getFullYear()).slice(2);
            let h = d.getHours(); const ampm = h >= 12 ? "PM" : "AM";
            h = h % 12 || 12;
            const min = String(d.getMinutes()).padStart(2, "0");
            return `${mm}-${dd}-${yy} | ${h}:${min} ${ampm}`;
        } catch { return ""; }
    };

    // ── Birthday detection ─────────────────────────────────────────────────────
    // Memoized so it only recomputes when the date actually changes (not on every render)
    const todayMMDD = useMemo(() =>
        `${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`,
        [] // stable for the lifetime of this component mount (one session = one day)
    );
    const celebrants: Member[] = useMemo(
        () => members.filter(m => m.birthdate?.slice(5) === todayMMDD),
        [members, todayMMDD]
    );

    // Stable string key for dep array — avoids creating new array/string on every render
    const celebrantKey = useMemo(() => celebrants.map(c => c.id).join(","), [celebrants]);

    // Module-level cache so getDocs is only called ONCE per app session, not on every remount.
    // Cleared automatically when the page reloads.
    const [celebrantRoles, setCelebrantRoles] = useState<Record<string, string>>({});
    useEffect(() => {
        if (celebrants.length === 0) return;
        // Use module-level cache to avoid re-fetching approved_users on every remount
        if (_approvedRolesCache) {
            const resolved: Record<string, string> = {};
            celebrants.forEach(m => {
                const role = _approvedRolesCache![m.email?.toLowerCase() ?? ""];
                if (role) resolved[m.id] = role;
            });
            setCelebrantRoles(resolved);
            return;
        }
        getDocs(collection(db, "approved_users"))
            .then(snap => {
                const roleMap: Record<string, string> = {};
                snap.forEach(d => {
                    const data = d.data();
                    if (data.email && data.role) roleMap[String(data.email).toLowerCase()] = data.role;
                });
                _approvedRolesCache = roleMap; // cache for this session
                const resolved: Record<string, string> = {};
                celebrants.forEach(m => {
                    const role = roleMap[m.email?.toLowerCase() ?? ""];
                    if (role) resolved[m.id] = role;
                });
                setCelebrantRoles(resolved);
            })
            .catch(() => {});
    }, [celebrantKey]); // stable dep — only re-runs when celebrant IDs actually change

    // Ref for scrolling to birthday cards section
    const birthdayRef = useRef<HTMLDivElement>(null);

    // Modal: auto-open ONCE per birthday day, but ONLY if the user hasn't already
    // sent a greeting to every celebrant. Both keys live in localStorage so they
    // survive app restarts AND mobile tab-discard events (sessionStorage is wiped
    // by iOS/Android whenever the OS kills the browser tab to free memory).
    const [birthdayModalOpen, setBirthdayModalOpen] = useState(() => false);
    useEffect(() => {
        if (celebrants.length === 0 || !userId) return;
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

        // Check if the user has greeted ALL celebrants today
        const allGreeted = celebrants.every(c =>
            localStorage.getItem(`wf_bday_sent_${userId}_${c.id}_${today}`) === "1"
        );
        if (allGreeted) return; // already greeted everyone — never open

        // Only pop once per calendar day (prevent re-open when switching views).
        // Using localStorage (not sessionStorage) so it survives mobile tab-discard.
        const shownKey = `wf_bday_modal_shown_${userId}_${today}`;
        if (!localStorage.getItem(shownKey)) {
            setBirthdayModalOpen(true);
            try { localStorage.setItem(shownKey, "1"); } catch { /* quota — ignore */ }
        }
    }, [celebrants.length, userId]);


    return (
        <div className="space-y-4 p-0">
            {/* ── Greeting row — name left, Admin badge far right ── */}
            <div className="flex items-center justify-between gap-4 pt-1">
                <div className="flex items-center gap-4">
                    <div className="w-1.5 h-14 rounded-full bg-indigo-500 dark:bg-indigo-400 shrink-0" />
                    <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {greeting()},{" "}
                            <span className={`font-semibold ${(ROLE_STYLE[userRole] ?? ROLE_STYLE.admin).text}`}>
                                {(ROLE_STYLE[userRole] ?? ROLE_STYLE.admin).label}
                            </span>
                        </p>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white leading-tight">{first} 👋</h1>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{new Date().toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                    {/* ── Listen to Lineup button — visible to all roles when lineup tracks exist */}
                    {onOpenLineup && (
                        <button
                            onClick={isLineupOpen ? undefined : onOpenLineup}
                            disabled={lineupTrackCount === 0 || isLineupOpen}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                                isLineupOpen
                                    ? "bg-gray-100 dark:bg-gray-700/60 text-gray-400 dark:text-gray-500 cursor-not-allowed pointer-events-none"
                                    : lineupTrackCount > 0
                                        ? "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40"
                                        : "bg-gray-100 dark:bg-gray-700/60 text-gray-400 dark:text-gray-500 cursor-not-allowed pointer-events-none"
                            }`}
                            title={
                                isLineupOpen
                                    ? "Player is already open"
                                    : lineupTrackCount === 0
                                        ? "No upcoming service with a song lineup this week"
                                        : `Play ${lineupTrackCount} song${lineupTrackCount !== 1 ? "s" : ""} from this week's lineup`
                            }
                        >
                            <ListMusic size={15} className={lineupTrackCount > 0 && !isLineupOpen ? "text-white" : ""} />
                            {lineupTrackCount > 0 ? `Listen to Lineup (${lineupTrackCount})` : "Listen to Lineup"}
                        </button>
                    )}

                    {/* ── Assembly Bell — Admin only ───────────────────────── */}
                    {userRole === "admin" && userId && (
                        <AssemblyBell
                            userId={userId}
                            userName={userName}
                            userPhoto={userPhoto || ""}
                        />
                    )}

                    {!loadingExtra && pendingUsers.length > 0 && (
                        <button onClick={() => onNavigate("admin")}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                            <UserCheck size={11} />{pendingUsers.length} pending
                        </button>
                    )}
                </div>
            </div>


            {/* ── Birthday Banner — static, informational only ─────────── */}
            {celebrants.length > 0 && (
                <BirthdayBanner
                    celebrants={celebrants}
                />
            )}

            {/* ── Birthday Modal ──────────────────────────────────────────── */}
            <style>{`
              @keyframes bdBackdropIn {
                from { opacity: 0; }
                to   { opacity: 1; }
              }
              @keyframes bdModalIn {
                from { opacity: 0; transform: scale(0.93) translateY(10px); }
                to   { opacity: 1; transform: scale(1) translateY(0); }
              }
              .bd-backdrop { animation: bdBackdropIn 0.2s ease both; }
              .bd-modal-in { animation: bdModalIn 0.25s cubic-bezier(0.175,0.885,0.32,1.275) both; }
            `}</style>
            {birthdayModalOpen && celebrants.length > 0 && (
                <div
                    className="bd-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
                    style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)" }}
                >
                    {/* Outer wrapper: relative so close btn can be absolute */}
                    <div
                        className="bd-modal-in relative w-full max-w-sm"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Close button — absolute, outside scroll area, no layout shift */}
                        <button
                            onClick={() => setBirthdayModalOpen(false)}
                            className="absolute -top-3 -right-3 z-30 w-8 h-8 flex items-center justify-center rounded-full bg-gray-900 border border-white/10 hover:bg-gray-700 text-white transition-colors text-sm shadow-lg"
                            aria-label="Close birthday card"
                        >
                            ✕
                        </button>

                        {/* Scrollable card area — no negative margin */}
                        <div
                            className="max-h-[88vh] overflow-y-auto rounded-2xl flex flex-col gap-3"
                            style={{ scrollbarWidth: "thin" }}
                        >
                            {celebrants.map(m => {
                                const myMember = members.find(mb =>
                                    mb.email?.trim().toLowerCase() === userEmail?.trim().toLowerCase()
                                );
                                return (
                                    <BirthdayCard
                                        key={m.id}
                                        member={m}
                                        currentUserId={userId ?? ""}
                                        currentUserName={userName}
                                        currentUserEmail={userEmail}
                                        currentUserPhoto={myMember?.photo || userPhoto}
                                        celebrantRole={celebrantRoles[m.id]}
                                        onGreetingSent={(memberId) => {
                                            if (!userId) return;
                                            const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
                                            // Write IMMEDIATELY — this is called before the API fetch,
                                            // so the key exists the moment the user taps Send.
                                            try { localStorage.setItem(`wf_bday_sent_${userId}_${memberId}_${today}`, "1"); } catch { /* noop */ }
                                            // If ALL celebrants are now greeted, close the modal right away.
                                            const allDone = celebrants.every(c =>
                                                localStorage.getItem(`wf_bday_sent_${userId}_${c.id}_${today}`) === "1"
                                            );
                                            if (allDone) setBirthdayModalOpen(false);
                                        }}
                                    />
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Top section: Daily Verse (left) + 2×2 metric tiles (right) ── */}
            {/* grid: mobile=1col, lg+=2col with 3:2 ratio. Grid cells auto-stretch to equal height */}
            <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-3">
                {/* LEFT — Daily Bible Verse fills the full grid cell height */}
                <VerseOfTheDay userId={userId} userName={userName.split(" ")[0] || userName} userPhoto="" />
                {/* RIGHT — 2×2 metric tiles: Songs | Members on top, Events | Issues on bottom */}
                <div className="grid grid-cols-2 gap-3">
                    <MetricTile label="Songs" value={songs.length} sub={`${songsUsed} in services`}
                        iconBg="bg-indigo-100 dark:bg-indigo-900/40" icon={<Music size={15} className="text-indigo-600 dark:text-indigo-400" />}
                        onClick={() => onNavigate("songs")} />
                    <MetricTile label="Members" value={members.length} sub={`${members.filter(m => m.status !== "inactive").length} active`}
                        iconBg="bg-violet-100 dark:bg-violet-900/40" icon={<Users size={15} className="text-violet-600 dark:text-violet-400" />}
                        onClick={() => onNavigate("members")} />
                    <MetricTile label="Events" value={totalEvents} sub={`${upcomingEvents.length} upcoming`}
                        iconBg="bg-emerald-100 dark:bg-emerald-900/40" icon={<Zap size={15} className="text-emerald-600 dark:text-emerald-400" />}
                        onClick={() => onNavigate("schedule")} />
                    <MetricTile label="Issues" value={openBugs + openFeqs} sub={`${openBugs} bugs · ${openFeqs} req`}
                        iconBg="bg-amber-100 dark:bg-amber-900/40" icon={<AlertCircle size={15} className="text-amber-600 dark:text-amber-400" />} />
                </div>
            </div>



            {/*
             * BENTO GRID 3×2
             * Row 1: [What's New]  [Church Events]      [Upcoming Events]
             * Row 2: [Songs]       [Team by Role]        [Open Issues]
             * Responsive: 1-col mobile → 2-col lg → 3-col xl
             */}
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">

                {/* ── ROW 1 ─────────────────────────── */}

                {/* What's New */}
                <Tile className="h-[380px] flex flex-col">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
                        <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white text-base">
                            <Megaphone size={15} className="text-amber-500" />
                            {latestBroadcast?.title ?? "What's New in WorshipFlow"}
                        </div>
                        <button onClick={() => onNavigate("admin")} className="text-xs text-indigo-500 hover:text-indigo-400 flex items-center gap-1 font-medium">
                            Manage <ChevronRight size={13} />
                        </button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
                        {loadingExtra ? (
                            /* Skeleton shimmer while broadcasts are fetching */
                            <div className="animate-pulse space-y-3 pt-1">
                                <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
                                <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded" />
                                <div className="h-3 w-5/6 bg-gray-200 dark:bg-gray-700 rounded" />
                                <div className="space-y-2 pt-2">
                                    {[1,2,3].map(i => (
                                        <div key={i} className="flex items-start gap-2">
                                            <div className="w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700 mt-1.5 shrink-0" />
                                            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded flex-1" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : latestBroadcast ? (
                            <>
                                {latestBroadcast.createdAt && (
                                    <span className="text-xs text-gray-400 font-medium block mb-2">Updated: {formatBroadcastDate(latestBroadcast.createdAt)}</span>
                                )}
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{latestBroadcast.message}</p>
                                <ul className="space-y-2.5">
                                    {(latestBroadcast.bulletPoints ?? []).filter(Boolean).map((h: string, i: number) => (
                                        <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-200">
                                            <span className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                                            {h}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : (
                            <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
                                <Megaphone size={16} className="opacity-40" /> No announcements yet
                            </div>
                        )}
                    </div>

                </Tile>

                {/* Church Events — NextServiceTile renders its own Tile with h-full;
                     no outer Tile wrapper needed so h-full correctly fills the grid row */}
                <NextServiceTile ev={nextEvent} songs={songs} members={members} myMemberId={myMemberId} onClick={() => onNavigate("schedule")} />

                {/* Upcoming Events */}
                <Tile className="min-h-[260px]">
                    <CardHeader icon={<Clock size={14} className="text-indigo-500" />} title="Upcoming Events" action="Full calendar" onAction={() => onNavigate("schedule")} />
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {upcomingEvents.length === 0 ? (
                            <div className="flex items-center gap-3 px-5 py-4"><Calendar size={16} className="text-gray-300" /><p className="text-sm text-gray-400">Nothing scheduled</p></div>
                        ) : upcomingEvents.slice(0, 6).map((ev, i) => {
                            const d = new Date(ev.date + "T00:00:00");
                            return (
                                <div key={ev.id} className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${i === 0 ? "bg-indigo-50/50 dark:bg-indigo-900/10" : ""}`}>
                                    <div className={`flex flex-col items-center justify-center w-10 h-10 rounded-xl shrink-0 ${i === 0 ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}>
                                        <p className="text-[8px] font-bold uppercase opacity-80">{d.toLocaleDateString("en", { month: "short" })}</p>
                                        <p className="text-sm font-black leading-none">{d.getDate()}</p>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{ev.eventName ?? "Event"}</p>
                                        <p className="text-xs text-gray-400 truncate">
                                            {isServiceEvent(ev)
                                                ? ev.worshipLeader?.name
                                                    ? <span>Leader: {ev.worshipLeader.name}</span>
                                                    : <span className="text-red-400 flex items-center gap-1"><AlertTriangle size={9} />No leader assigned</span>
                                                : (ev as any).created_by_name
                                                    ? <span>Added by: {(ev as any).created_by_name.split(" ")[0]}</span>
                                                    : <span className="text-gray-400">Custom event</span>
                                            }
                                        </p>
                                    </div>
                                    <span className={`text-xs font-semibold shrink-0 ${i === 0 ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400"}`}>{daysUntil(ev.date)}</span>
                                </div>
                            );
                        })}
                    </div>
                </Tile>

                {/* ── ROW 2 ─────────────────────────── */}

                {/* Recently Added Songs */}
                <Tile className="min-h-[260px]" onClick={() => onNavigate("songs")}>
                    <CardHeader icon={<TrendingUp size={14} className="text-violet-500" />} title="Recently Added Songs" action="Library" onAction={() => onNavigate("songs")} />
                    {recentSongs.length === 0 ? (
                        <div className="flex flex-col items-center py-8 gap-3"><BookOpen size={22} className="text-indigo-300" /><p className="text-sm text-gray-400">No songs yet</p></div>
                    ) : (
                        <div className="divide-y divide-gray-100 dark:divide-gray-700">
                            {recentSongs.map(s => (
                                <div key={s.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                    <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0"><Music size={14} className="text-indigo-600 dark:text-indigo-400" /></div>
                                    <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{s.title}</p><p className="text-xs text-gray-400 truncate">{s.artist}</p></div>
                                    {s.created_at && <p className="text-xs text-gray-400 shrink-0">{relDate(s.created_at)}</p>}
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                        <p className="text-xs text-gray-400">{songs.length} songs · {songsUsed} used in services</p>
                    </div>
                </Tile>

                {/* Team by Role */}
                <Tile className="min-h-[260px]" onClick={() => onNavigate("members")}>
                    <CardHeader icon={<Users size={14} className="text-violet-500" />} title="Team by Role" action="All members" onAction={() => onNavigate("members")} />
                    <div className="p-5 space-y-3">
                        {roleGroups.length === 0 ? (
                            <p className="text-sm text-gray-400">No members yet</p>
                        ) : roleGroups.slice(0, 5).map(([role, count]) => (
                            <div key={role}>
                                <div className="flex justify-between text-sm mb-1.5">
                                    <span className="text-gray-700 dark:text-gray-300 truncate">{role}</span>
                                    <span className="text-gray-900 dark:text-white font-bold shrink-0 ml-2">{count}</span>
                                </div>
                                <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                                        style={{ width: members.length > 0 ? `${Math.round(count / members.length * 100)}%` : "0%" }} />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                        <p className="text-xs text-gray-400">{members.length} total team members</p>
                    </div>
                </Tile>

                {/* Open Issues */}
                <Tile className="min-h-[260px]">
                    <CardHeader icon={<Bug size={14} className="text-red-500" />} title="Open Issues" action="Admin panel" onAction={() => onNavigate("admin")} />
                    <div className="p-5 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col items-center py-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40">
                                <p className="text-3xl font-black text-red-500 dark:text-red-400">{openBugs}</p>
                                <p className="text-[10px] text-red-400 flex items-center gap-0.5 mt-1"><Bug size={9} />Bugs</p>
                            </div>
                            <div className="flex flex-col items-center py-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40">
                                <p className="text-3xl font-black text-amber-500 dark:text-amber-400">{openFeqs}</p>
                                <p className="text-[10px] text-amber-400 flex items-center gap-0.5 mt-1"><Lightbulb size={9} />Requests</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col items-center py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/40">
                                <p className="text-2xl font-black text-emerald-500 dark:text-emerald-400">{resolvedNotes}</p>
                                <p className="text-[10px] text-emerald-500 dark:text-emerald-400 flex items-center gap-0.5 mt-1"><CheckCheck size={9} />Resolved</p>
                            </div>
                            <div className="flex flex-col items-center py-3 rounded-xl bg-sky-50 dark:bg-sky-900/20 border border-sky-100 dark:border-sky-900/40">
                                <p className="text-2xl font-black text-sky-500 dark:text-sky-400">{totalNotes}</p>
                                <p className="text-[10px] text-sky-500 dark:text-sky-400 flex items-center gap-0.5 mt-1"><NotepadText size={9} />Total Notes</p>
                            </div>
                        </div>
                        {openBugs + openFeqs === 0 ? (
                            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
                                <CheckCircle2 size={12} />All clear! 🎉
                            </div>
                        ) : pendingUsers.length > 0 && (
                            <button onClick={() => onNavigate("admin")} className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                                <span className="flex items-center gap-1.5"><UserCheck size={11} />{pendingUsers.length} pending request{pendingUsers.length !== 1 ? "s" : ""}</span>
                                <ChevronRight size={11} />
                            </button>
                        )}
                    </div>
                </Tile>

            </div>

        </div>
    );
}

