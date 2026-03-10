import React, { useMemo, useState, useEffect } from "react";
import {
    Music, Users, Calendar, NotepadText, ChevronRight,
    BookOpen, Clock, Star, TrendingUp, Bug, Lightbulb,
    CheckCircle2, AlertCircle, Mic2, Headphones, Guitar,
    User, Shield, Lock, LayoutGrid, ArrowRight, ClipboardList,
    FlaskConical, Bell, UserCheck, AlertTriangle,
    CheckCheck, Megaphone, Plus, UserPlus, Zap, BarChart3, Radio
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ScheduleMember { memberId: string; name: string; photo: string; role: string; }
interface Schedule {
    id: string; date: string; serviceType?: string; eventName?: string;
    worshipLeader?: ScheduleMember | null; backupSingers?: ScheduleMember[];
    musicians?: ScheduleMember[]; songLineup?: { joyful?: string; solemn?: string };
    assignments?: { role: string; members: ScheduleMember[] }[]; notes?: string;
}
interface Song { id: string; title: string; artist: string; created_at?: string; }
interface Member { id: string; name: string; role: string; photoUrl?: string; }
interface Note { id: string; type: "bug" | "feature" | "general"; content: string; resolved?: boolean; createdAt: string; authorName: string; }
interface PendingUser { email: string; name: string; photo?: string; requestedAt?: string; }
interface Broadcast { id: string; title: string; message: string; active: boolean; type?: string; }

interface Props {
    isAdmin: boolean; userRole: string; userName: string; userPhoto: string;
    songs: Song[]; members: Member[]; schedules: Schedule[]; notes: Note[];
    onNavigate: (view: "songs" | "members" | "schedule" | "admin") => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function relativeDate(iso: string) {
    try {
        const diff = Date.now() - new Date(iso).getTime();
        const d = Math.floor(diff / 86400000);
        if (d === 0) return "Today"; if (d === 1) return "Yesterday";
        if (d < 7) return `${d} days ago`;
        return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
    } catch { return ""; }
}
function daysUntil(dateStr: string) {
    try {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const target = new Date(dateStr + "T00:00:00"); target.setHours(0, 0, 0, 0);
        const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
        if (diff === 0) return "Today"; if (diff === 1) return "Tomorrow";
        if (diff > 0) return `In ${diff}d`; return `${Math.abs(diff)}d ago`;
    } catch { return ""; }
}
function roleIcon(role: string) {
    const map: Record<string, React.ReactNode> = {
        admin: <Shield size={13} />, leader: <Mic2 size={13} />, musician: <Guitar size={13} />,
        audio_tech: <Headphones size={13} />, planning_lead: <ClipboardList size={13} />,
        member: <User size={13} />, qa_specialist: <FlaskConical size={13} />,
    };
    return map[role] ?? <User size={13} />;
}
function roleLabel(role: string) {
    const map: Record<string, string> = {
        admin: "Admin", leader: "Worship Leader", musician: "Musician",
        audio_tech: "Audio / Tech", planning_lead: "Planning Lead",
        member: "Member", qa_specialist: "QA Specialist",
    };
    return map[role] ?? role;
}
function svcColor(type?: string) {
    const map: Record<string, string> = {
        sunday_service: "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300",
        midweek_service: "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300",
        practice: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
        special: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
    };
    return map[type ?? ""] ?? "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300";
}
function svcLabel(type?: string) {
    const map: Record<string, string> = {
        sunday_service: "Sunday Service", midweek_service: "Midweek Service",
        practice: "Practice", special: "Special Event",
    };
    return map[type ?? ""] ?? type ?? "Event";
}

// ── Avatar chip ───────────────────────────────────────────────────────────────
function MemberChip({ name, photo }: { name: string; photo?: string }) {
    const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-xs text-gray-800 dark:text-gray-200 font-medium">
            {photo ? (
                <img src={photo} className="w-5 h-5 rounded-full object-cover" alt={name} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : (
                <div className="w-5 h-5 rounded-full bg-indigo-200 dark:bg-indigo-700 flex items-center justify-center text-[9px] font-bold text-indigo-700 dark:text-indigo-200">{initials}</div>
            )}
            {name}
        </div>
    );
}

// ── Coming Soon ───────────────────────────────────────────────────────────────
function ComingSoonDashboard({ userName }: { userName: string }) {
    return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6 gap-6">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center">
                <LayoutGrid size={36} className="text-indigo-400" />
            </div>
            <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Dashboard Coming Soon</h2>
                <p className="text-gray-500 dark:text-gray-400 max-w-sm">
                    Hey <strong className="text-gray-700 dark:text-gray-300">{userName}</strong>! The dashboard is being built for your role. Check back soon. 🙌
                </p>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm">
                <Lock size={14} /> Currently available to Admins only
            </div>
        </div>
    );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard({ isAdmin, userRole, userName, songs, members, schedules, notes, onNavigate }: Props) {

    if (!isAdmin) return <ComingSoonDashboard userName={userName} />;

    const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
    const [activeBroadcasts, setActiveBroadcasts] = useState<Broadcast[]>([]);
    const [loadingExtra, setLoadingExtra] = useState(true);

    useEffect(() => {
        Promise.all([
            fetch("/api/auth/pending").then(r => r.json()).catch(() => []),
            fetch("/api/broadcasts").then(r => r.json()).catch(() => []),
        ]).then(([pending, broadcasts]) => {
            setPendingUsers(Array.isArray(pending) ? pending : []);
            setActiveBroadcasts(Array.isArray(broadcasts) ? broadcasts : []);
        }).finally(() => setLoadingExtra(false));
    }, []);

    const today = new Date(); today.setHours(0, 0, 0, 0);

    const upcomingEvents = useMemo(() =>
        schedules.filter(s => { try { return new Date(s.date + "T00:00:00") >= today; } catch { return false; } })
            .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6),
        [schedules]);
    const nextEvent = upcomingEvents[0] ?? null;

    const eventsThisMonth = useMemo(() => {
        const y = today.getFullYear(), m = today.getMonth();
        return schedules.filter(s => { try { const d = new Date(s.date + "T00:00:00"); return d.getFullYear() === y && d.getMonth() === m; } catch { return false; } }).length;
    }, [schedules]);

    const totalServicesAllTime = schedules.filter(s => s.serviceType === "sunday_service" || s.serviceType === "midweek_service").length;

    const songsUsedInSchedules = useMemo(() => {
        const ids = new Set<string>();
        schedules.forEach(s => { if (s.songLineup?.solemn) ids.add(s.songLineup.solemn); if (s.songLineup?.joyful) ids.add(s.songLineup.joyful); });
        return ids.size;
    }, [schedules]);

    const coverageWarnings = useMemo(() => upcomingEvents.slice(0, 5).filter(ev => !ev.worshipLeader), [upcomingEvents]);
    const coverageOk = useMemo(() => upcomingEvents.slice(0, 5).filter(ev => ev.worshipLeader), [upcomingEvents]);

    const openBugs = notes.filter(n => n.type === "bug" && !n.resolved).length;
    const openFeatures = notes.filter(n => n.type === "feature" && !n.resolved).length;
    const unresolvedNotes = notes.filter(n => !n.resolved).length;
    const recentNotes = [...notes].sort((a, b) => { try { return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); } catch { return 0; } }).slice(0, 3);

    const recentSongs = [...songs].filter(s => s.created_at)
        .sort((a, b) => { try { return new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime(); } catch { return 0; } }).slice(0, 4);

    const roleGroups = useMemo(() => {
        const groups: Record<string, number> = {};
        members.forEach(m => { groups[m.role] = (groups[m.role] ?? 0) + 1; });
        return Object.entries(groups).sort((a, b) => b[1] - a[1]);
    }, [members]);

    const greeting = () => { const h = new Date().getHours(); if (h < 12) return "Good morning"; if (h < 17) return "Good afternoon"; return "Good evening"; };

    // Next event helpers
    const nextEventLeader = nextEvent?.worshipLeader ?? null;
    const nextEventMusicians = nextEvent?.musicians ?? [];
    const nextEventBackup = nextEvent?.backupSingers ?? [];
    const nextEventAudio = nextEvent?.assignments?.filter(a => a.role?.toLowerCase().includes("audio") || a.role?.toLowerCase().includes("tech")).flatMap(a => a.members ?? []) ?? [];

    return (
        <div className="max-w-6xl mx-auto space-y-5 pb-12">

            {/* ══ HERO HEADER ══════════════════════════════════════════════════ */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 px-6 py-6 shadow-lg">
                <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full bg-white/5 blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-1/3 w-40 h-40 rounded-full bg-violet-500/20 blur-2xl pointer-events-none" />
                <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <p className="text-indigo-200 text-sm">{greeting()},</p>
                        <h1 className="text-2xl sm:text-3xl font-bold text-white mt-0.5">{(userName || "Admin").split(" ")[0]} 👋</h1>
                        <p className="text-indigo-300 text-xs mt-1">{new Date().toLocaleDateString("en", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
                    </div>
                    <div className="flex flex-col items-start sm:items-end gap-2">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 text-white text-xs font-semibold border border-white/20">
                            <Shield size={12} /> Admin Dashboard
                        </div>
                        {!loadingExtra && pendingUsers.length > 0 && (
                            <button onClick={() => onNavigate("admin")} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-400/90 hover:bg-amber-400 text-amber-900 text-xs font-bold transition-colors">
                                <UserCheck size={12} /> {pendingUsers.length} pending {pendingUsers.length === 1 ? "request" : "requests"} — Review
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ══ QUICK ACTIONS ════════════════════════════════════════════════ */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: "Add Song", icon: <Music size={17} />, color: "from-indigo-500 to-indigo-600", action: () => onNavigate("songs") },
                    { label: "Schedule Service", icon: <Calendar size={17} />, color: "from-emerald-500 to-emerald-600", action: () => onNavigate("schedule") },
                    { label: "Add Member", icon: <UserPlus size={17} />, color: "from-violet-500 to-violet-600", action: () => onNavigate("members") },
                    { label: "New Broadcast", icon: <Megaphone size={17} />, color: "from-amber-500 to-orange-500", action: () => onNavigate("admin") },
                ].map(({ label, icon, color, action }) => (
                    <button key={label} onClick={action}
                        className={`flex items-center justify-center gap-2 px-3 py-3 rounded-2xl bg-gradient-to-br ${color} text-white text-sm font-semibold shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all`}>
                        {icon} {label}
                    </button>
                ))}
            </div>

            {/* ══ STAT TILES ═══════════════════════════════════════════════════ */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: "Songs", value: songs.length, sub: `${songsUsedInSchedules} used in services`, icon: <Music size={20} />, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-900/30", border: "border-indigo-100 dark:border-indigo-800/50", view: "songs" as const },
                    { label: "Team Members", value: members.length, sub: `${roleGroups.length} role${roleGroups.length !== 1 ? "s" : ""}`, icon: <Users size={20} />, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-900/30", border: "border-violet-100 dark:border-violet-800/50", view: "members" as const },
                    { label: "Events This Month", value: eventsThisMonth, sub: `${totalServicesAllTime} total all-time`, icon: <Calendar size={20} />, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/30", border: "border-emerald-100 dark:border-emerald-800/50", view: "schedule" as const },
                    { label: "Open Notes", value: unresolvedNotes, sub: `${openBugs} bugs · ${openFeatures} features`, icon: <NotepadText size={20} />, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/30", border: "border-amber-100 dark:border-amber-800/50", view: null },
                ].map(({ label, value, sub, icon, color, bg, border, view }) => (
                    <button key={label} onClick={() => view && onNavigate(view)}
                        className={`flex flex-col gap-3 p-4 rounded-2xl bg-white dark:bg-gray-800 border ${border} shadow-sm hover:shadow-md transition-all text-left ${view ? "hover:-translate-y-0.5 cursor-pointer" : "cursor-default"}`}>
                        <div className={`w-10 h-10 rounded-xl ${bg} ${color} flex items-center justify-center`}>{icon}</div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
                        </div>
                    </button>
                ))}
            </div>

            {/* ══ MINISTRY MILESTONES ══════════════════════════════════════════ */}
            <div className="grid grid-cols-3 gap-3">
                {[
                    { label: "Total Services", value: totalServicesAllTime, icon: <Zap size={15} />, color: "text-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-900/20" },
                    { label: "Songs in Library", value: songs.length, icon: <Music size={15} />, color: "text-violet-500", bg: "bg-violet-50 dark:bg-violet-900/20" },
                    { label: "Used in Services", value: songsUsedInSchedules, icon: <BarChart3 size={15} />, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
                ].map(({ label, value, icon, color, bg }) => (
                    <div key={label} className={`flex items-center gap-3 px-4 py-3 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm`}>
                        <div className={`w-9 h-9 rounded-xl ${bg} ${color} flex items-center justify-center shrink-0`}>{icon}</div>
                        <div>
                            <p className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{value}</p>
                            <p className="text-[10px] text-gray-400 leading-tight">{label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* ══ NEXT EVENT — full width, rich ═══════════════════════════════ */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white text-sm">
                        <Calendar size={16} className="text-indigo-500" /> Next Event
                    </div>
                    <button onClick={() => onNavigate("schedule")} className="text-xs text-indigo-500 hover:text-indigo-400 flex items-center gap-1 font-medium">
                        View all <ChevronRight size={13} />
                    </button>
                </div>

                {nextEvent ? (
                    <div className="p-5 space-y-5">
                        {/* Header row */}
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex items-center gap-4">
                                {/* Date block */}
                                <div className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white shadow-sm shrink-0">
                                    <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">
                                        {new Date(nextEvent.date + "T00:00:00").toLocaleDateString("en", { month: "short" })}
                                    </p>
                                    <p className="text-2xl font-black leading-tight">
                                        {new Date(nextEvent.date + "T00:00:00").getDate()}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xl font-bold text-gray-900 dark:text-white">{nextEvent.eventName ?? "Upcoming Event"}</p>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${svcColor(nextEvent.serviceType)}`}>{svcLabel(nextEvent.serviceType)}</span>
                                        <span className="text-xs text-gray-400">{new Date(nextEvent.date + "T00:00:00").toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}</span>
                                    </div>
                                </div>
                            </div>
                            <span className={`px-4 py-1.5 rounded-full text-sm font-bold shrink-0 ${daysUntil(nextEvent.date) === "Today" ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400" :
                                    daysUntil(nextEvent.date) === "Tomorrow" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" :
                                        "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"}`}>
                                {daysUntil(nextEvent.date)}
                            </span>
                        </div>

                        {/* Team grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            {/* Leader */}
                            <div className={`rounded-2xl p-4 ${nextEventLeader ? "bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/40" : "bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800/40"}`}>
                                <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1 ${nextEventLeader ? "text-indigo-500" : "text-red-500"}`}>
                                    <Mic2 size={10} /> Worship Leader
                                </p>
                                {nextEventLeader ? (
                                    <MemberChip name={nextEventLeader.name} photo={nextEventLeader.photo} />
                                ) : (
                                    <p className="text-red-500 text-xs flex items-center gap-1 font-medium"><AlertTriangle size={11} /> Not assigned</p>
                                )}
                            </div>

                            {/* Musicians */}
                            <div className="rounded-2xl p-4 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800/40">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-violet-500 mb-2 flex items-center gap-1"><Guitar size={10} /> Musicians</p>
                                {nextEventMusicians.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {nextEventMusicians.map(m => <MemberChip key={m.memberId} name={m.name} photo={m.photo} />)}
                                    </div>
                                ) : <p className="text-xs text-gray-400">None assigned</p>}
                            </div>

                            {/* Audio/Tech */}
                            <div className="rounded-2xl p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 mb-2 flex items-center gap-1"><Headphones size={10} /> Audio / Tech</p>
                                {nextEventAudio.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {nextEventAudio.map(m => <MemberChip key={m.memberId} name={m.name} photo={m.photo} />)}
                                    </div>
                                ) : <p className="text-xs text-gray-400">None assigned</p>}
                            </div>

                            {/* Backup Singers */}
                            <div className="rounded-2xl p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-2 flex items-center gap-1"><Mic2 size={10} /> Backup Singers</p>
                                {nextEventBackup.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {nextEventBackup.map(m => <MemberChip key={m.memberId} name={m.name} photo={m.photo} />)}
                                    </div>
                                ) : <p className="text-xs text-gray-400">None assigned</p>}
                            </div>
                        </div>

                        {/* Song lineup */}
                        {nextEvent.songLineup && (nextEvent.songLineup.solemn || nextEvent.songLineup.joyful) && (
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1"><Music size={10} /> Song Lineup</p>
                                <div className="flex flex-wrap gap-2">
                                    {nextEvent.songLineup.solemn && (
                                        <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40 rounded-xl text-sm">
                                            <Music size={13} className="text-indigo-500 shrink-0" />
                                            <span className="text-gray-500 dark:text-gray-400 text-xs">Solemn:</span>
                                            <span className="font-semibold text-gray-900 dark:text-gray-100">{songs.find(s => s.id === nextEvent.songLineup?.solemn)?.title ?? "—"}</span>
                                        </div>
                                    )}
                                    {nextEvent.songLineup.joyful && (
                                        <div className="flex items-center gap-2 px-4 py-2 bg-violet-50 dark:bg-violet-900/30 border border-violet-100 dark:border-violet-800/40 rounded-xl text-sm">
                                            <Star size={13} className="text-violet-500 shrink-0" />
                                            <span className="text-gray-500 dark:text-gray-400 text-xs">Joyful:</span>
                                            <span className="font-semibold text-gray-900 dark:text-gray-100">{songs.find(s => s.id === nextEvent.songLineup?.joyful)?.title ?? "—"}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Notes */}
                        {nextEvent.notes && (
                            <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-700/40 text-xs text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                                <NotepadText size={13} className="text-gray-400 shrink-0 mt-0.5" />
                                <p>{nextEvent.notes}</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-8">
                        <div className="flex items-center gap-4 text-gray-400">
                            <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                                <Calendar size={28} className="text-indigo-400" />
                            </div>
                            <div>
                                <p className="text-base font-semibold text-gray-600 dark:text-gray-300">No upcoming events scheduled</p>
                                <p className="text-sm text-gray-400 mt-0.5">Plan your next worship service to see it here</p>
                            </div>
                        </div>
                        <button onClick={() => onNavigate("schedule")} className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors">
                            <Plus size={15} /> Schedule Now
                        </button>
                    </div>
                )}
            </div>

            {/* ══ COVERAGE + ISSUES side by side ══════════════════════════════ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* Coverage */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-700 font-semibold text-gray-900 dark:text-white text-sm">
                        <AlertTriangle size={15} className="text-amber-500" /> Service Coverage
                    </div>
                    <div className="p-4 space-y-2">
                        {upcomingEvents.length === 0 ? (
                            <div className="flex flex-col items-center py-5 gap-2 text-center">
                                <CheckCheck size={22} className="text-gray-300" />
                                <p className="text-xs text-gray-400">No upcoming events to check</p>
                            </div>
                        ) : coverageWarnings.length === 0 ? (
                            <div className="flex items-center gap-2 px-3 py-3 rounded-xl bg-green-50 dark:bg-green-900/20 text-sm text-green-700 dark:text-green-400 font-medium">
                                <CheckCheck size={15} /> All upcoming events have leaders ✓
                            </div>
                        ) : (
                            coverageWarnings.slice(0, 3).map(ev => (
                                <div key={ev.id} className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/15 border border-red-100 dark:border-red-800/30 text-xs">
                                    <AlertTriangle size={12} className="text-red-500 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-semibold text-red-700 dark:text-red-400">{ev.eventName ?? "Event"}</p>
                                        <p className="text-red-400">{new Date(ev.date + "T00:00:00").toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })} · No leader assigned</p>
                                    </div>
                                </div>
                            ))
                        )}
                        {coverageOk.slice(0, 3).map(ev => (
                            <div key={ev.id} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/30">
                                <CheckCircle2 size={12} className="text-green-500 shrink-0" />
                                <span className="truncate">{ev.eventName ?? "Event"}</span>
                                <span className="ml-auto text-gray-400 shrink-0">{ev.worshipLeader?.name}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Open Issues */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-700 font-semibold text-gray-900 dark:text-white text-sm">
                        <AlertCircle size={15} className="text-amber-500" /> Open Issues
                    </div>
                    <div className="p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col items-center py-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40">
                                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{openBugs}</p>
                                <div className="flex items-center gap-1 text-xs text-red-500 font-medium mt-1"><Bug size={11} /> Bugs</div>
                            </div>
                            <div className="flex flex-col items-center py-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40">
                                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{openFeatures}</p>
                                <div className="flex items-center gap-1 text-xs text-amber-500 font-medium mt-1"><Lightbulb size={11} /> Requests</div>
                            </div>
                        </div>
                        {recentNotes.length === 0 ? (
                            <div className="flex flex-col items-center py-4 gap-1.5 text-center">
                                <CheckCircle2 size={24} className="text-green-400 opacity-70" />
                                <p className="text-xs text-gray-400">No open notes — all clear! 🎉</p>
                            </div>
                        ) : recentNotes.map(n => (
                            <div key={n.id} className={`flex gap-2 p-2.5 rounded-xl border text-xs ${n.type === "bug" ? "bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30" : n.type === "feature" ? "bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/30" : "bg-gray-50 dark:bg-gray-700/30 border-gray-100 dark:border-gray-700"}`}>
                                <span className="shrink-0 mt-0.5">{n.type === "bug" ? <Bug size={11} className="text-red-500" /> : n.type === "feature" ? <Lightbulb size={11} className="text-amber-500" /> : <NotepadText size={11} className="text-gray-400" />}</span>
                                <div className="min-w-0">
                                    <p className="text-gray-700 dark:text-gray-200 line-clamp-1">{(n.content ?? "").slice(0, 55)}{(n.content ?? "").length > 55 ? "…" : ""}</p>
                                    <p className="text-gray-400 mt-0.5">{n.authorName}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ══ BROADCASTS — always shown ════════════════════════════════════ */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white text-sm">
                        <Megaphone size={16} className="text-indigo-500" /> Active Broadcasts
                        {activeBroadcasts.length > 0 && (
                            <span className="text-[10px] font-bold bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" /> {activeBroadcasts.length} live
                            </span>
                        )}
                    </div>
                    <button onClick={() => onNavigate("admin")} className="text-xs text-indigo-500 hover:text-indigo-400 flex items-center gap-1 font-medium">Manage <ChevronRight size={13} /></button>
                </div>
                {loadingExtra ? (
                    <div className="px-5 py-5 animate-pulse flex gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gray-200 dark:bg-gray-700 shrink-0" />
                        <div className="flex-1 space-y-2 pt-1"><div className="h-3 w-1/3 bg-gray-200 dark:bg-gray-700 rounded" /><div className="h-2 w-2/3 bg-gray-200 dark:bg-gray-700 rounded" /></div>
                    </div>
                ) : activeBroadcasts.length === 0 ? (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-5 py-5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700/60 flex items-center justify-center">
                                <Megaphone size={18} className="text-gray-400" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">No active broadcasts</p>
                                <p className="text-xs text-gray-400">Send an announcement to your whole team</p>
                            </div>
                        </div>
                        <button onClick={() => onNavigate("admin")} className="shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
                            <Plus size={13} /> New Broadcast
                        </button>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {activeBroadcasts.slice(0, 3).map(b => (
                            <div key={b.id} className="flex items-start gap-3 px-5 py-3.5">
                                <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0 mt-0.5">
                                    {b.type === "maintenance" ? <Radio size={14} className="text-orange-500" /> : <Bell size={14} className="text-indigo-500" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{b.title}</p>
                                    <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{b.message}</p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0 mt-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                    <span className="text-[10px] text-green-600 dark:text-green-400 font-semibold">Live</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ══ UPCOMING TIMELINE ═══════════════════════════════════════════ */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white text-sm">
                        <Clock size={16} className="text-indigo-500" /> Upcoming Schedule
                    </div>
                    <button onClick={() => onNavigate("schedule")} className="text-xs text-indigo-500 hover:text-indigo-400 flex items-center gap-1 font-medium">Full calendar <ChevronRight size={13} /></button>
                </div>
                {upcomingEvents.length === 0 ? (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-5 py-5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700/60 flex items-center justify-center"><Calendar size={18} className="text-gray-400" /></div>
                            <div>
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">No upcoming events scheduled</p>
                                <p className="text-xs text-gray-400">Plan your next worship services here</p>
                            </div>
                        </div>
                        <button onClick={() => onNavigate("schedule")} className="shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"><Plus size={13} /> Add Event</button>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {upcomingEvents.slice(0, 5).map((ev, i) => (
                            <div key={ev.id} className={`flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${i === 0 ? "bg-indigo-50/50 dark:bg-indigo-900/10" : ""}`}>
                                <div className={`w-10 h-10 rounded-xl shrink-0 flex flex-col items-center justify-center ${i === 0 ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-gray-700"}`}>
                                    <p className="text-[9px] font-bold uppercase opacity-80">{new Date(ev.date + "T00:00:00").toLocaleDateString("en", { month: "short" })}</p>
                                    <p className={`text-base font-black leading-tight ${i === 0 ? "text-white" : "text-gray-900 dark:text-white"}`}>{new Date(ev.date + "T00:00:00").getDate()}</p>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{ev.eventName ?? "Event"}</p>
                                    <p className="text-xs mt-0.5 truncate">
                                        {ev.worshipLeader?.name ? <span className="text-gray-400">Leader: {ev.worshipLeader.name}</span> : <span className="text-red-400 flex items-center gap-1"><AlertTriangle size={9} /> No leader assigned</span>}
                                    </p>
                                </div>
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${svcColor(ev.serviceType)}`}>{svcLabel(ev.serviceType)}</span>
                                <span className={`text-xs font-semibold shrink-0 ${i === 0 ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400"}`}>{daysUntil(ev.date)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ══ BOTTOM GRID ══════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Recent Songs */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white text-sm">
                            <TrendingUp size={16} className="text-indigo-500" /> Recently Added Songs
                        </div>
                        <button onClick={() => onNavigate("songs")} className="text-xs text-indigo-500 hover:text-indigo-400 flex items-center gap-1 font-medium">Library <ChevronRight size={13} /></button>
                    </div>
                    {recentSongs.length === 0 ? (
                        <div className="flex flex-col items-center py-8 gap-3 text-center px-5">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center"><BookOpen size={22} className="text-indigo-400" /></div>
                            <div><p className="text-sm font-medium text-gray-500 dark:text-gray-400">No songs yet</p><p className="text-xs text-gray-400 mt-0.5">Start building your worship library</p></div>
                            <button onClick={() => onNavigate("songs")} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"><Plus size={12} /> Add First Song</button>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100 dark:divide-gray-700">
                            {recentSongs.map(s => (
                                <div key={s.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                    <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0"><Music size={14} className="text-indigo-600 dark:text-indigo-400" /></div>
                                    <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{s.title}</p><p className="text-xs text-gray-400 truncate">{s.artist}</p></div>
                                    {s.created_at && <p className="text-xs text-gray-400 shrink-0">{relativeDate(s.created_at)}</p>}
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                        <p className="text-xs text-gray-400">{songs.length} songs in library · {songsUsedInSchedules} used in services</p>
                    </div>
                </div>

                {/* Team by Role */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white text-sm">
                            <Users size={16} className="text-violet-500" /> Team by Role
                        </div>
                        <button onClick={() => onNavigate("members")} className="text-xs text-indigo-500 hover:text-indigo-400 flex items-center gap-1 font-medium">All members <ChevronRight size={13} /></button>
                    </div>
                    <div className="p-5">
                        {roleGroups.length === 0 ? (
                            <div className="flex flex-col items-center py-6 gap-3 text-center">
                                <div className="w-12 h-12 rounded-2xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center"><UserPlus size={22} className="text-violet-400" /></div>
                                <div><p className="text-sm font-medium text-gray-500 dark:text-gray-400">No team members yet</p><p className="text-xs text-gray-400 mt-0.5">Add your worship team to get started</p></div>
                                <button onClick={() => onNavigate("members")} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white transition-colors"><Plus size={12} /> Add Member</button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {roleGroups.map(([role, count]) => (
                                    <div key={role} className="flex items-center gap-3">
                                        <div className="flex items-center gap-2 w-36 shrink-0">
                                            <span className="text-gray-400">{roleIcon(role)}</span>
                                            <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{roleLabel(role)}</span>
                                        </div>
                                        <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                                            <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-700"
                                                style={{ width: members.length > 0 ? `${Math.round((count / members.length) * 100)}%` : "0%" }} />
                                        </div>
                                        <span className="text-sm font-bold text-gray-900 dark:text-white w-5 text-right shrink-0">{count}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                        <p className="text-xs text-gray-400">{members.length} total team members</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
