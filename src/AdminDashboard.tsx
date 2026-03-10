import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
    Music, Users, Calendar, NotepadText, ChevronRight, Clock,
    Bug, Lightbulb, CheckCircle2, AlertCircle, Shield, Bell, UserCheck,
    AlertTriangle, CheckCheck, Megaphone, Plus, UserPlus, Zap, BarChart3,
    TrendingUp, ArrowUpRight, Star, Mic2, BookOpen, Radio,
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
interface Member { id: string; name: string; email: string; photo: string; roles: string[]; status: string; }
interface Note { id: string; type: "bug" | "feature" | "general"; content: string; resolved?: boolean; createdAt: string; authorName: string; }

interface Props {
    userName: string; userPhoto: string; userEmail: string;
    songs: Song[]; members: Member[]; schedules: Schedule[]; notes: Note[];
    onNavigate: (view: "songs" | "members" | "schedule" | "admin") => void;
    broadcasts: any[]; pendingUsers: any[]; loadingExtra: boolean;
    canAddSong: boolean; canWriteSchedule: boolean; canAddMember: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysUntil(dateStr: string) {
    try {
        const t = new Date(); t.setHours(0, 0, 0, 0);
        const d = new Date(dateStr + "T00:00:00"); d.setHours(0, 0, 0, 0);
        const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
        if (diff === 0) return "Today"; if (diff === 1) return "Tomorrow";
        if (diff > 0) return `In ${diff}d`; return `${Math.abs(diff)}d ago`;
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
function Tile({ children, className = "", onClick }: {
    children: React.ReactNode; className?: string; onClick?: () => void;
}) {
    return (
        <div onClick={onClick}
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
        <Tile className="p-5 flex flex-col justify-between" onClick={onClick}>
            <div className="flex items-start justify-between">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>{icon}</div>
                <ArrowUpRight size={13} className="text-gray-300 dark:text-gray-600 mt-0.5" />
            </div>
            <div className="mt-5">
                <p className="text-4xl font-black text-gray-900 dark:text-white tracking-tight leading-none">{value}</p>
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mt-1.5">{label}</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>
            </div>
        </Tile>
    );
}

// ── Next service hero tile ────────────────────────────────────────────────────
function NextServiceTile({ ev, songs, members, myMemberId, onClick }: {
    ev: Schedule | null; songs: Song[]; members: Member[]; myMemberId: string | null; onClick: () => void;
}) {
    const getLivePhoto = useCallback((id: string, fb?: string) => {
        const m = members.find(mem => mem.id === id);
        const u = m?.photo ?? fb ?? "";
        return u.startsWith("http") ? u : "";
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
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full mt-1 inline-block ${svcColor(ev.serviceType)}`}>{svcLabel(ev.serviceType)}</span>
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
                        {[ev.worshipLeader, ...(ev.musicians ?? []).slice(0, 3), ...(ev.backupSingers ?? []).slice(0, 1)].filter(Boolean).map((m, i) => {
                            const directPhoto = m!.photo?.startsWith("http") ? m!.photo : "";
                            const byId = members.find(mem => mem.id === m!.memberId);
                            const byName = members.find(mem => mem.name?.toLowerCase() === m!.name?.toLowerCase());
                            const resolved = directPhoto || byId?.photo || byName?.photo || "";
                            const photo = resolved.startsWith("http") ? resolved : "";
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
                    <p className="text-xs text-gray-400">{[ev.worshipLeader, ...(ev.musicians ?? [])].filter(Boolean).length} serving</p>
                </div>
            </div>
        </Tile>
    );
}

// ── Main AdminDashboard ───────────────────────────────────────────────────────
export default function AdminDashboard({
    userName, userEmail, songs, members, schedules, notes, onNavigate,
    broadcasts, pendingUsers, loadingExtra, canAddSong, canWriteSchedule, canAddMember,
}: Props) {
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
    const openBugs = notes.filter(n => n.type === "bug" && !n.resolved).length;
    const openFeqs = notes.filter(n => n.type === "feature" && !n.resolved).length;
    const coverageIssues = upcomingEvents.filter(e => !e.worshipLeader).length;
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

    return (
        <div className="space-y-4 p-0">
            {/* ── Greeting row — name left, Admin badge far right ── */}
            <div className="flex items-center justify-between gap-4 pt-1">
                <div className="flex items-center gap-4">
                    <div className="w-1.5 h-14 rounded-full bg-indigo-500 dark:bg-indigo-400 shrink-0" />
                    <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{greeting()},</p>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white leading-tight">{first} 👋</h1>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{new Date().toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/15 border border-amber-400/30 text-amber-500 dark:text-amber-300"
                        style={{ boxShadow: "0 0 8px 2px rgba(245,158,11,0.25)" }}>
                        <Shield size={12} /> Admin
                    </div>
                    {!loadingExtra && pendingUsers.length > 0 && (
                        <button onClick={() => onNavigate("admin")}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                            <UserCheck size={11} />{pendingUsers.length} pending
                        </button>
                    )}
                </div>
            </div>

            {/* ── Quick actions — full-width equal icon grid ── */}
            <div className="grid grid-cols-4 gap-2">
                {canAddSong && (
                    <button onClick={() => onNavigate("songs")}
                        title="Add Song"
                        className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors">
                        <Music size={18} />
                        <span className="text-[10px] font-semibold hidden sm:block">Songs</span>
                    </button>
                )}
                {canWriteSchedule && (
                    <button onClick={() => onNavigate("schedule")}
                        title="Schedule"
                        className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
                        <Calendar size={18} />
                        <span className="text-[10px] font-semibold hidden sm:block">Schedule</span>
                    </button>
                )}
                {canAddMember && (
                    <button onClick={() => onNavigate("members")}
                        title="Add Member"
                        className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors">
                        <UserPlus size={18} />
                        <span className="text-[10px] font-semibold hidden sm:block">Members</span>
                    </button>
                )}
                <button onClick={() => onNavigate("admin")}
                    title="Broadcast"
                    className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors">
                    <Megaphone size={18} />
                    <span className="text-[10px] font-semibold hidden sm:block">Broadcast</span>
                </button>
            </div>


            {/* ── ROW 1: 4 metrics + Next Service hero (2-col) ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <MetricTile label="Songs" value={songs.length} sub={`${songsUsed} in services`}
                    iconBg="bg-indigo-100 dark:bg-indigo-900/40" icon={<Music size={15} className="text-indigo-600 dark:text-indigo-400" />}
                    onClick={() => onNavigate("songs")} />
                <MetricTile label="Members" value={members.length} sub={`${members.filter(m => m.status !== "inactive").length} active`}
                    iconBg="bg-violet-100 dark:bg-violet-900/40" icon={<Users size={15} className="text-violet-600 dark:text-violet-400" />}
                    onClick={() => onNavigate("members")} />
                <MetricTile label="Church Events" value={totalEvents} sub={`${upcomingEvents.length} upcoming`}
                    iconBg="bg-emerald-100 dark:bg-emerald-900/40" icon={<Zap size={15} className="text-emerald-600 dark:text-emerald-400" />}
                    onClick={() => onNavigate("schedule")} />
                <MetricTile label="Issues" value={openBugs + openFeqs} sub={`${openBugs} bugs · ${openFeqs} req`}
                    iconBg="bg-amber-100 dark:bg-amber-900/40" icon={<AlertCircle size={15} className="text-amber-600 dark:text-amber-400" />} />
                {/* Hero tile — 2 cols */}
                <div className="col-span-2">
                    <NextServiceTile ev={nextEvent} songs={songs} members={members} myMemberId={myMemberId} onClick={() => onNavigate("schedule")} />
                </div>
            </div>

            {/* Alert banners */}
            <div className="flex flex-wrap gap-2">
                {coverageIssues === 0 ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                        <CheckCheck size={12} /> All services have leaders ✓
                    </div>
                ) : (
                    <button onClick={() => onNavigate("schedule")} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-100 transition-colors">
                        <AlertTriangle size={12} />{coverageIssues} service{coverageIssues !== 1 ? "s" : ""} missing a leader
                    </button>
                )}
                {broadcasts.length > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400 text-xs font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                        {broadcasts.length} active broadcast{broadcasts.length !== 1 ? "s" : ""}
                    </div>
                )}
            </div>

            {/* ── ROW 2: Coverage | Upcoming | Broadcasts ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                {/* Coverage */}
                <Tile onClick={() => onNavigate("schedule")}>
                    <CardHeader icon={<AlertTriangle size={14} className="text-amber-500" />} title="Coverage" action="View schedule" onAction={() => onNavigate("schedule")} />
                    <div className="p-5 space-y-2.5">
                        {upcomingEvents.length === 0 ? (
                            <p className="text-sm text-gray-400 dark:text-gray-500">No upcoming events</p>
                        ) : upcomingEvents.slice(0, 5).map(ev => (
                            <div key={ev.id} className="flex items-center gap-2.5">
                                {ev.worshipLeader ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" /> : <AlertTriangle size={13} className="text-red-400 shrink-0" />}
                                <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">{ev.eventName ?? "Event"}</span>
                                <span className="text-xs text-gray-400 shrink-0">{daysUntil(ev.date)}</span>
                            </div>
                        ))}
                    </div>
                </Tile>

                {/* Upcoming timeline */}
                <Tile>
                    <CardHeader icon={<Clock size={14} className="text-indigo-500" />} title="Upcoming Events" action="Full calendar" onAction={() => onNavigate("schedule")} />
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {upcomingEvents.length === 0 ? (
                            <div className="flex items-center gap-3 px-5 py-4"><Calendar size={16} className="text-gray-300" /><p className="text-sm text-gray-400">Nothing scheduled</p></div>
                        ) : upcomingEvents.slice(0, 4).map((ev, i) => {
                            const d = new Date(ev.date + "T00:00:00");
                            return (
                                <div key={ev.id} className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${i === 0 ? "bg-indigo-50/50 dark:bg-indigo-900/10" : ""}`}>
                                    <div className={`flex flex-col items-center justify-center w-10 h-10 rounded-xl shrink-0 ${i === 0 ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}>
                                        <p className="text-[8px] font-bold uppercase opacity-80">{d.toLocaleDateString("en", { month: "short" })}</p>
                                        <p className="text-sm font-black leading-none">{d.getDate()}</p>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{ev.eventName ?? "Event"}</p>
                                        <p className="text-xs text-gray-400 truncate">{ev.worshipLeader?.name ? <span>Leader: {ev.worshipLeader.name}</span> : <span className="text-red-400 flex items-center gap-1"><AlertTriangle size={9} />No leader</span>}</p>
                                    </div>
                                    <span className={`text-xs font-semibold shrink-0 ${i === 0 ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400"}`}>{daysUntil(ev.date)}</span>
                                </div>
                            );
                        })}
                    </div>
                </Tile>

                {/* Broadcasts */}
                <Tile>
                    <CardHeader
                        icon={<Megaphone size={14} className="text-indigo-500" />}
                        title={`Announcements${broadcasts.length > 0 ? ` — ${broadcasts.length} live` : ""}`}
                        action="Manage"
                        onAction={() => onNavigate("admin")}
                    />
                    {loadingExtra ? (
                        <div className="px-5 py-5 animate-pulse flex gap-3"><div className="w-9 h-9 rounded-xl bg-gray-200 dark:bg-gray-700 shrink-0" /><div className="flex-1 space-y-2 pt-1"><div className="h-3 w-1/3 bg-gray-200 dark:bg-gray-700 rounded" /><div className="h-2 w-2/3 bg-gray-200 dark:bg-gray-700 rounded" /></div></div>
                    ) : broadcasts.length === 0 ? (
                        <div className="flex items-center gap-3 px-5 py-5 text-gray-400"><Megaphone size={18} className="opacity-40" /><p className="text-sm">No active announcements</p></div>
                    ) : (
                        <div className="divide-y divide-gray-100 dark:divide-gray-700">
                            {broadcasts.slice(0, 3).map((b: any) => (
                                <div key={b.id} className="flex items-start gap-3 px-5 py-3.5">
                                    <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0 mt-0.5">
                                        {b.type === "maintenance" ? <Radio size={14} className="text-orange-500" /> : <Bell size={14} className="text-indigo-500" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{b.title}</p>
                                        <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{b.message}</p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0 mt-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /><span className="text-[10px] text-green-600 dark:text-green-400 font-semibold">Live</span></div>
                                </div>
                            ))}
                        </div>
                    )}
                </Tile>
            </div>

            {/* ── ROW 3: Songs | Issues | Team ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                {/* Recent songs */}
                <Tile>
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

                {/* Issues */}
                <Tile>
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
                        {openBugs + openFeqs === 0 ? (
                            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
                                <CheckCircle2 size={12} />All clear! 🎉
                            </div>
                        ) : pendingUsers.length > 0 && (
                            <button onClick={() => onNavigate("admin")} className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                                <span className="flex items-center gap-1.5"><UserCheck size={11} />{pendingUsers.length} pending access request{pendingUsers.length !== 1 ? "s" : ""}</span>
                                <ChevronRight size={11} />
                            </button>
                        )}
                    </div>
                </Tile>

                {/* Team by role */}
                <Tile>
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
            </div>
        </div>
    );
}
