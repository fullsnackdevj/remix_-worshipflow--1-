import React, { useMemo } from "react";
import {
    Music, Users, Calendar, NotepadText, ChevronRight,
    BookOpen, Clock, Star, TrendingUp, Bug, Lightbulb,
    CheckCircle2, AlertCircle, Mic2, Headphones, Guitar,
    User, Shield, Lock, LayoutGrid, ArrowRight, ClipboardList, FlaskConical
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Song { id: string; title: string; artist: string; tags?: any[]; createdAt?: string; }
interface Member { id: string; name: string; role: string; photoUrl?: string; }
interface Schedule { id: string; date: string; name: string; type?: string; worshipLeader?: string; musicians?: string[]; audioTech?: string[]; songLineup?: any; }
interface Note { id: string; type: "bug" | "feature" | "general"; content: string; resolved?: boolean; createdAt: string; authorName: string; }

interface Props {
    isAdmin: boolean;
    userRole: string;
    userName: string;
    userPhoto: string;
    songs: Song[];
    members: Member[];
    schedules: Schedule[];
    notes: Note[];
    onNavigate: (view: "songs" | "members" | "schedule" | "admin") => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function relativeDate(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const d = Math.floor(diff / 86400000);
    if (d === 0) return "Today";
    if (d === 1) return "Yesterday";
    if (d < 7) return `${d} days ago`;
    return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
}

function daysUntil(dateStr: string) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr + "T00:00:00"); target.setHours(0, 0, 0, 0);
    const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff > 0) return `In ${diff} days`;
    return `${Math.abs(diff)}d ago`;
}

function roleIcon(role: string) {
    const map: Record<string, React.ReactNode> = {
        admin: <Shield size={12} />, leader: <Mic2 size={12} />, musician: <Guitar size={12} />,
        audio_tech: <Headphones size={12} />, planning_lead: <ClipboardList size={12} />,
        member: <User size={12} />, qa_specialist: <FlaskConical size={12} />,
    };
    return map[role] ?? <User size={12} />;
}

function roleLabel(role: string) {
    const map: Record<string, string> = {
        admin: "Admin", leader: "Worship Leader", musician: "Musician",
        audio_tech: "Audio / Tech", planning_lead: "Planning Lead",
        member: "Member", qa_specialist: "QA Specialist",
    };
    return map[role] ?? role;
}

// ── Coming Soon Screen (non-admins) ───────────────────────────────────────────
function ComingSoonDashboard({ userRole, userName }: { userRole: string; userName: string }) {
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

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard({ isAdmin, userRole, userName, userPhoto, songs, members, schedules, notes, onNavigate }: Props) {

    if (!isAdmin) return <ComingSoonDashboard userRole={userRole} userName={userName} />;

    // ── Derived data ─────────────────────────────────────────────────────────
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const upcomingEvents = useMemo(() =>
        schedules
            .filter(s => new Date(s.date + "T00:00:00") >= today)
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(0, 5),
        [schedules]
    );

    const nextEvent = upcomingEvents[0] ?? null;

    const eventsThisMonth = useMemo(() => {
        const y = today.getFullYear(), m = today.getMonth();
        return schedules.filter(s => {
            const d = new Date(s.date + "T00:00:00");
            return d.getFullYear() === y && d.getMonth() === m;
        }).length;
    }, [schedules]);

    const openBugs = notes.filter(n => n.type === "bug" && !n.resolved).length;
    const openFeatures = notes.filter(n => n.type === "feature" && !n.resolved).length;
    const unresolvedNotes = notes.filter(n => !n.resolved).length;
    const recentNotes = [...notes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 3);

    const recentSongs = [...songs]
        .filter(s => s.createdAt)
        .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
        .slice(0, 4);

    const roleGroups = useMemo(() => {
        const groups: Record<string, number> = {};
        members.forEach(m => { groups[m.role] = (groups[m.role] ?? 0) + 1; });
        return Object.entries(groups).sort((a, b) => b[1] - a[1]);
    }, [members]);

    const eventTypeColor = (type?: string) => {
        const map: Record<string, string> = {
            sunday_service: "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300",
            midweek_service: "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300",
            practice: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
            special: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
        };
        return map[type ?? ""] ?? "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300";
    };

    const eventTypeLabel = (type?: string) => {
        const map: Record<string, string> = {
            sunday_service: "Sunday Service", midweek_service: "Midweek Service",
            practice: "Practice", special: "Special Event",
        };
        return map[type ?? ""] ?? type ?? "Event";
    };

    const greeting = () => {
        const h = new Date().getHours();
        if (h < 12) return "Good morning";
        if (h < 17) return "Good afternoon";
        return "Good evening";
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-10">

            {/* ── Welcome Header ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{greeting()},</p>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        {userName.split(" ")[0]} 👋
                    </h1>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {new Date().toLocaleDateString("en", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                    </p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
                    <Shield size={13} /> Admin Dashboard
                </div>
            </div>

            {/* ── Stat Tiles ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {[
                    { label: "Songs", value: songs.length, icon: <Music size={20} />, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-900/30", view: "songs" as const },
                    { label: "Team Members", value: members.length, icon: <Users size={20} />, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-900/30", view: "members" as const },
                    { label: "Events This Month", value: eventsThisMonth, icon: <Calendar size={20} />, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/30", view: "schedule" as const },
                    { label: "Open Notes", value: unresolvedNotes, icon: <NotepadText size={20} />, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/30", view: null },
                ].map(({ label, value, icon, color, bg, view }) => (
                    <button
                        key={label}
                        onClick={() => view && onNavigate(view)}
                        className={`flex flex-col gap-3 p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all text-left ${view ? "hover:-translate-y-0.5 active:scale-99 cursor-pointer" : "cursor-default"}`}
                    >
                        <div className={`w-10 h-10 rounded-xl ${bg} ${color} flex items-center justify-center`}>
                            {icon}
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                        </div>
                    </button>
                ))}
            </div>

            {/* ── Main Grid: Next Service + Notes ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                {/* Next Service Card */}
                <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                            <Calendar size={16} className="text-indigo-500" /> Next Event
                        </div>
                        <button onClick={() => onNavigate("schedule")} className="text-xs text-indigo-500 hover:text-indigo-400 flex items-center gap-1 font-medium">
                            View all <ChevronRight size={13} />
                        </button>
                    </div>

                    {nextEvent ? (
                        <div className="p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                                <div>
                                    <p className="text-lg font-bold text-gray-900 dark:text-white">{nextEvent.name}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${eventTypeColor(nextEvent.type)}`}>
                                            {eventTypeLabel(nextEvent.type)}
                                        </span>
                                        <span className="text-xs text-gray-400">
                                            {new Date(nextEvent.date + "T00:00:00").toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}
                                        </span>
                                    </div>
                                </div>
                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${daysUntil(nextEvent.date) === "Today" ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400" :
                                        daysUntil(nextEvent.date) === "Tomorrow" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" :
                                            "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                                    }`}>
                                    {daysUntil(nextEvent.date)}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                                {nextEvent.worshipLeader && (
                                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Worship Leader</p>
                                        <p className="text-gray-900 dark:text-white font-medium text-sm">
                                            {members.find(m => m.id === nextEvent.worshipLeader)?.name ?? nextEvent.worshipLeader}
                                        </p>
                                    </div>
                                )}
                                {nextEvent.musicians && nextEvent.musicians.length > 0 && (
                                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Musicians ({nextEvent.musicians.length})</p>
                                        <p className="text-gray-900 dark:text-white font-medium text-sm truncate">
                                            {nextEvent.musicians.map(id => members.find(m => m.id === id)?.name ?? id).join(", ")}
                                        </p>
                                    </div>
                                )}
                                {nextEvent.audioTech && nextEvent.audioTech.length > 0 && (
                                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Audio / Tech</p>
                                        <p className="text-gray-900 dark:text-white font-medium text-sm truncate">
                                            {nextEvent.audioTech.map(id => members.find(m => m.id === id)?.name ?? id).join(", ")}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {nextEvent.songLineup && (nextEvent.songLineup.solemn || nextEvent.songLineup.joyful) && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {nextEvent.songLineup.solemn && (
                                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-xs">
                                            <Music size={12} className="text-indigo-500" />
                                            <span className="text-gray-500 dark:text-gray-400">Solemn:</span>
                                            <span className="font-semibold text-gray-800 dark:text-gray-100">{songs.find(s => s.id === nextEvent.songLineup.solemn)?.title ?? "—"}</span>
                                        </div>
                                    )}
                                    {nextEvent.songLineup.joyful && (
                                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 dark:bg-violet-900/30 rounded-xl text-xs">
                                            <Star size={12} className="text-violet-500" />
                                            <span className="text-gray-500 dark:text-gray-400">Joyful:</span>
                                            <span className="font-semibold text-gray-800 dark:text-gray-100">{songs.find(s => s.id === nextEvent.songLineup.joyful)?.title ?? "—"}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="px-5 py-10 text-center text-gray-400">
                            <Calendar size={32} className="mx-auto mb-2 opacity-30" />
                            <p className="text-sm">No upcoming events scheduled</p>
                            <button onClick={() => onNavigate("schedule")} className="mt-3 text-xs text-indigo-500 hover:text-indigo-400 font-medium flex items-center gap-1 mx-auto">
                                Add an event <ArrowRight size={12} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Open Notes / Issues */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white text-sm">
                            <AlertCircle size={16} className="text-amber-500" /> Open Issues
                        </div>
                    </div>
                    <div className="p-4 space-y-3">
                        {/* Bug / Feature counts */}
                        <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col items-center justify-center py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40">
                                <p className="text-xl font-bold text-red-600 dark:text-red-400">{openBugs}</p>
                                <div className="flex items-center gap-1 text-[11px] text-red-500 font-medium mt-0.5"><Bug size={11} /> Bugs</div>
                            </div>
                            <div className="flex flex-col items-center justify-center py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40">
                                <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{openFeatures}</p>
                                <div className="flex items-center gap-1 text-[11px] text-amber-500 font-medium mt-0.5"><Lightbulb size={11} /> Features</div>
                            </div>
                        </div>

                        {/* Recent notes */}
                        <div className="space-y-2">
                            {recentNotes.length === 0 ? (
                                <div className="text-center py-4 text-gray-400">
                                    <CheckCircle2 size={24} className="mx-auto mb-1 opacity-30" />
                                    <p className="text-xs">All clear! No open notes.</p>
                                </div>
                            ) : recentNotes.map(n => (
                                <div key={n.id} className={`flex gap-2 p-2.5 rounded-xl border text-xs ${n.type === "bug" ? "bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30" :
                                        n.type === "feature" ? "bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/30" :
                                            "bg-gray-50 dark:bg-gray-700/30 border-gray-100 dark:border-gray-700"
                                    }`}>
                                    <span className="shrink-0 mt-0.5">
                                        {n.type === "bug" ? <Bug size={12} className="text-red-500" /> :
                                            n.type === "feature" ? <Lightbulb size={12} className="text-amber-500" /> :
                                                <NotepadText size={12} className="text-gray-400" />}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-gray-700 dark:text-gray-200 line-clamp-2 leading-snug">{n.content.slice(0, 80)}{n.content.length > 80 ? "…" : ""}</p>
                                        <p className="text-gray-400 mt-0.5">{n.authorName} · {relativeDate(n.createdAt)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Upcoming Events Timeline ── */}
            {upcomingEvents.length > 1 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white text-sm">
                            <Clock size={16} className="text-indigo-500" /> Upcoming Schedule
                        </div>
                        <button onClick={() => onNavigate("schedule")} className="text-xs text-indigo-500 hover:text-indigo-400 flex items-center gap-1 font-medium">
                            Full calendar <ChevronRight size={13} />
                        </button>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {upcomingEvents.slice(0, 5).map(ev => (
                            <div key={ev.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                <div className="w-10 text-center shrink-0">
                                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">
                                        {new Date(ev.date + "T00:00:00").toLocaleDateString("en", { month: "short" })}
                                    </p>
                                    <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                                        {new Date(ev.date + "T00:00:00").getDate()}
                                    </p>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{ev.name}</p>
                                    <p className="text-xs text-gray-400 truncate">
                                        {ev.worshipLeader ? `Leader: ${members.find(m => m.id === ev.worshipLeader)?.name ?? ev.worshipLeader}` : "No leader assigned"}
                                    </p>
                                </div>
                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${eventTypeColor(ev.type)}`}>
                                    {eventTypeLabel(ev.type)}
                                </span>
                                <span className="text-[11px] text-gray-400 shrink-0">{daysUntil(ev.date)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Bottom Grid: Songs + Team ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Recent Songs */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white text-sm">
                            <TrendingUp size={16} className="text-indigo-500" /> Recently Added Songs
                        </div>
                        <button onClick={() => onNavigate("songs")} className="text-xs text-indigo-500 hover:text-indigo-400 flex items-center gap-1 font-medium">
                            Library <ChevronRight size={13} />
                        </button>
                    </div>
                    {recentSongs.length === 0 ? (
                        <div className="px-5 py-8 text-center text-gray-400">
                            <BookOpen size={28} className="mx-auto mb-2 opacity-30" />
                            <p className="text-sm">No songs in library yet</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100 dark:divide-gray-700">
                            {recentSongs.map(s => (
                                <div key={s.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                    <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                                        <Music size={14} className="text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{s.title}</p>
                                        <p className="text-xs text-gray-400 truncate">{s.artist}</p>
                                    </div>
                                    {s.createdAt && <p className="text-xs text-gray-400 shrink-0">{relativeDate(s.createdAt)}</p>}
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                        <p className="text-xs text-gray-400">{songs.length} total songs in library</p>
                    </div>
                </div>

                {/* Team by Role */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white text-sm">
                            <Users size={16} className="text-violet-500" /> Team by Role
                        </div>
                        <button onClick={() => onNavigate("members")} className="text-xs text-indigo-500 hover:text-indigo-400 flex items-center gap-1 font-medium">
                            All members <ChevronRight size={13} />
                        </button>
                    </div>
                    <div className="p-5 space-y-3">
                        {roleGroups.length === 0 ? (
                            <div className="text-center py-6 text-gray-400">
                                <Users size={28} className="mx-auto mb-2 opacity-30" />
                                <p className="text-sm">No members yet</p>
                            </div>
                        ) : roleGroups.map(([role, count]) => (
                            <div key={role} className="flex items-center gap-3">
                                <div className="flex items-center gap-2 min-w-[130px]">
                                    <span className="text-gray-400">{roleIcon(role)}</span>
                                    <span className="text-sm text-gray-700 dark:text-gray-300">{roleLabel(role)}</span>
                                </div>
                                <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all"
                                        style={{ width: `${Math.round((count / members.length) * 100)}%` }}
                                    />
                                </div>
                                <span className="text-sm font-bold text-gray-900 dark:text-white w-5 text-right">{count}</span>
                            </div>
                        ))}
                    </div>
                    <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                        <p className="text-xs text-gray-400">{members.length} total team members</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
