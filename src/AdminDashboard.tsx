import React, { useMemo, useState, useEffect } from "react";
import {
    Music, Users, Calendar, NotepadText, ChevronRight, Clock,
    Bug, Lightbulb, CheckCircle2, AlertCircle, Shield, Bell, UserCheck,
    AlertTriangle, CheckCheck, Megaphone, Plus, UserPlus, Zap, BarChart3,
    TrendingUp, MoreHorizontal, ArrowUpRight, Sparkles, Activity,
} from "lucide-react";

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
    userName: string; userPhoto: string;
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
    return ({ sunday_service: "Sunday Service", midweek_service: "Midweek Service", practice: "Practice", special: "Special Event" })[t ?? ""] ?? t ?? "Event";
}
function greeting() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }

// ── Glass card ────────────────────────────────────────────────────────────────
const G = "bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl";
const G_SM = "bg-white/10 backdrop-blur-md border border-white/15 rounded-xl";

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, photo, size = "sm" }: { name: string; photo?: string; size?: "sm" | "md" }) {
    const [err, setErr] = useState(false);
    const init = (name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
    const cls = size === "md" ? "w-10 h-10 text-sm" : "w-6 h-6 text-[10px]";
    const ok = photo && photo.startsWith("http") && !err;
    return ok
        ? <img src={photo} className={`${cls} rounded-full object-cover border-2 border-white/30`} alt={name} onError={() => setErr(true)} />
        : <div className={`${cls} rounded-full bg-gradient-to-br from-violet-400 to-indigo-600 flex items-center justify-center font-bold text-white border-2 border-white/30`}>{init}</div>;
}

// ── Event card (glass node style) ─────────────────────────────────────────────
function EventCard({ ev, isNext }: { ev: Schedule; isNext: boolean }) {
    const du = daysUntil(ev.date);
    const dateObj = new Date(ev.date + "T00:00:00");
    const isUrgent = du === "Today" || du === "Tomorrow";
    return (
        <div className={`relative ${G_SM} p-4 overflow-hidden transition-transform hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-900/30
            ${isNext ? "border-violet-400/40 shadow-md shadow-violet-900/30" : ""}`}>
            {/* glow accent */}
            {isNext && <div className="absolute -top-6 -right-6 w-24 h-24 bg-violet-500/20 rounded-full blur-2xl pointer-events-none" />}
            <div className="relative">
                {/* top row */}
                <div className="flex items-center justify-between mb-3">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border
                        ${isNext ? "bg-violet-500/30 border-violet-400/40 text-violet-200" : "bg-white/10 border-white/15 text-white/60"}`}>
                        {svcLabel(ev.serviceType)}
                    </span>
                    {isUrgent && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${du === "Today" ? "bg-pink-500/30 text-pink-300 border border-pink-400/30" : "bg-amber-500/20 text-amber-300 border border-amber-400/30"}`}>{du}</span>}
                </div>
                {/* date + name */}
                <div className="flex items-start gap-3">
                    <div className={`flex flex-col items-center justify-center w-11 h-11 rounded-xl shrink-0 border
                        ${isNext ? "bg-violet-500/40 border-violet-400/40 text-white" : "bg-white/10 border-white/15 text-white/80"}`}>
                        <p className="text-[9px] font-bold uppercase opacity-80">{dateObj.toLocaleDateString("en", { month: "short" })}</p>
                        <p className="text-base font-black leading-none">{dateObj.getDate()}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-white text-sm leading-tight truncate">{ev.eventName ?? "Service"}</p>
                        <p className="text-xs text-white/50 mt-0.5 truncate">
                            {ev.worshipLeader
                                ? <span className="flex items-center gap-1"><Sparkles size={9} className="text-violet-300" />{ev.worshipLeader.name}</span>
                                : <span className="text-pink-400 flex items-center gap-1"><AlertTriangle size={9} />No leader</span>}
                        </p>
                    </div>
                    {!isUrgent && <span className="text-[10px] font-semibold text-white/40 shrink-0">{du}</span>}
                </div>
                {/* avatar row */}
                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-white/10">
                    <div className="flex -space-x-1.5">
                        {[ev.worshipLeader, ...(ev.musicians ?? []).slice(0, 2)].filter(Boolean).map((m, i) => (
                            <Avatar key={i} name={m!.name} photo={m!.photo} />
                        ))}
                        {(ev.musicians ?? []).length > 2 && (
                            <div className="w-6 h-6 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-[9px] text-white font-bold">
                                +{(ev.musicians ?? []).length - 2}
                            </div>
                        )}
                    </div>
                    <ArrowUpRight size={14} className="text-white/30" />
                </div>
            </div>
        </div>
    );
}

// ── Glass stat card ───────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon, accent, onClick }: {
    label: string; value: number; sub: string; icon: React.ReactNode;
    accent: string; onClick?: () => void;
}) {
    return (
        <button onClick={onClick} className={`${G} p-5 text-left w-full group hover:-translate-y-0.5 transition-transform`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${accent}`}>
                {icon}
            </div>
            <p className="text-3xl font-black text-white mb-0.5">{value}</p>
            <p className="text-sm font-semibold text-white/80">{label}</p>
            <p className="text-[11px] text-white/40 mt-0.5">{sub}</p>
        </button>
    );
}

// ── Main AdminDashboard ───────────────────────────────────────────────────────
export default function AdminDashboard({
    userName, userPhoto, songs, members, schedules, notes, onNavigate,
    broadcasts, pendingUsers, loadingExtra, canAddSong, canWriteSchedule, canAddMember,
}: Props) {
    const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

    const upcomingEvents = useMemo(() =>
        schedules.filter(s => { try { return new Date(s.date + "T00:00:00") >= today; } catch { return false; } })
            .sort((a, b) => a.date.localeCompare(b.date))
        , [schedules, today]);

    const totalServices = schedules.filter(s => ["sunday_service", "midweek_service"].includes(s.serviceType ?? "")).length;
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
        .slice(0, 4);

    const first = userName.split(" ")[0] || "Admin";

    // Role breakdown
    const roleGroups = useMemo(() => {
        const g: Record<string, number> = {};
        members.forEach(m => { const r = m.roles?.[0] || "Member"; g[r] = (g[r] ?? 0) + 1; });
        return Object.entries(g).sort((a, b) => b[1] - a[1]);
    }, [members]);

    return (
        <div className="min-h-screen w-full relative overflow-hidden">
            {/* ── Gradient background ── */}
            <div className="fixed inset-0 bg-gradient-to-br from-violet-900 via-indigo-900 to-slate-900 -z-10" />
            {/* Ambient orbs */}
            <div className="fixed top-0 left-1/4 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl -z-10 pointer-events-none" />
            <div className="fixed bottom-0 right-1/4 w-80 h-80 bg-indigo-500/15 rounded-full blur-3xl -z-10 pointer-events-none" />
            <div className="fixed top-1/2 left-0 w-64 h-64 bg-purple-700/10 rounded-full blur-3xl -z-10 pointer-events-none" />

            {/* ── Top bar ── */}
            <div className="sticky top-0 z-20 bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-3.5">
                <div className="flex items-center justify-between max-w-7xl mx-auto">
                    <div className="flex items-center gap-2 text-sm text-white/50">
                        <span className="text-white/30">WorshipFlow</span>
                        <ChevronRight size={12} className="text-white/20" />
                        <span className="text-white/30">Admin</span>
                        <ChevronRight size={12} className="text-white/20" />
                        <span className="text-white font-medium">Dashboard</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                        {pendingUsers.length > 0 && (
                            <button onClick={() => onNavigate("admin")}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400/20 border border-amber-400/30 text-amber-300 text-xs font-semibold hover:bg-amber-400/30 transition-colors">
                                <UserCheck size={12} />{pendingUsers.length} pending
                            </button>
                        )}
                        {/* User pill */}
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 text-white text-sm">
                            <Avatar name={userName} photo={userPhoto} size="sm" />
                            <span className="font-medium">{first}</span>
                        </div>
                        {/* Admin badge */}
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold bg-violet-500/25 border border-violet-400/40 text-violet-200"
                            style={{ boxShadow: "0 0 16px 3px rgba(167,139,250,0.25)" }}>
                            <Shield size={13} /> Admin
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Main content ── */}
            <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">

                {/* Greeting */}
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div>
                        <p className="text-white/50 text-sm">{greeting()},</p>
                        <h1 className="text-4xl font-black text-white tracking-tight">{first} <span className="text-violet-300">👋</span></h1>
                        <p className="text-white/30 text-xs mt-1">{new Date().toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
                    </div>
                    {/* Quick actions */}
                    <div className="flex flex-wrap items-center gap-2">
                        {canAddSong && <button onClick={() => onNavigate("songs")} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-500/30 border border-violet-400/40 text-violet-200 text-xs font-bold hover:bg-violet-500/40 transition-all hover:shadow-lg hover:shadow-violet-900/40"><Music size={12} />Add Song</button>}
                        {canWriteSchedule && <button onClick={() => onNavigate("schedule")} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500/20 border border-cyan-400/30 text-cyan-200 text-xs font-bold hover:bg-cyan-500/30 transition-all"><Calendar size={12} />Schedule</button>}
                        {canAddMember && <button onClick={() => onNavigate("members")} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-pink-500/20 border border-pink-400/30 text-pink-200 text-xs font-bold hover:bg-pink-500/30 transition-all"><UserPlus size={12} />Add Member</button>}
                        <button onClick={() => onNavigate("admin")} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-200 text-xs font-bold hover:bg-amber-500/30 transition-all"><Megaphone size={12} />Broadcast</button>
                    </div>
                </div>

                {/* ── Stat cards row ── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard label="Songs" value={songs.length} sub={`${songsUsed} used in services`}
                        icon={<Music size={18} className="text-violet-300" />} accent="bg-violet-500/30"
                        onClick={() => onNavigate("songs")} />
                    <StatCard label="Team Members" value={members.length} sub={`${members.filter(m => m.status !== "inactive").length} active`}
                        icon={<Users size={18} className="text-cyan-300" />} accent="bg-cyan-500/30"
                        onClick={() => onNavigate("members")} />
                    <StatCard label="Total Services" value={totalServices} sub={`${upcomingEvents.length} upcoming`}
                        icon={<Zap size={18} className="text-pink-300" />} accent="bg-pink-500/30"
                        onClick={() => onNavigate("schedule")} />
                    <StatCard label="Open Issues" value={openBugs + openFeqs} sub={`${openBugs} bugs · ${openFeqs} requests`}
                        icon={<AlertCircle size={18} className="text-amber-300" />} accent="bg-amber-500/30" />
                </div>

                {/* ── Alerts row ── */}
                <div className="flex flex-wrap gap-3">
                    {coverageIssues === 0 ? (
                        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-400/25 text-emerald-300 text-xs font-semibold">
                            <CheckCheck size={13} /> All upcoming services have leaders ✓
                        </div>
                    ) : (
                        <button onClick={() => onNavigate("schedule")} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/15 border border-red-400/25 text-red-300 text-xs font-semibold hover:bg-red-500/20 transition-colors">
                            <AlertTriangle size={13} /> {coverageIssues} service{coverageIssues !== 1 ? "s" : ""} missing a leader — tap to review
                        </button>
                    )}
                    {pendingUsers.length > 0 && (
                        <button onClick={() => onNavigate("admin")} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/15 border border-amber-400/25 text-amber-300 text-xs font-semibold hover:bg-amber-500/20 transition-colors">
                            <UserCheck size={13} /> {pendingUsers.length} pending access request{pendingUsers.length !== 1 ? "s" : ""}
                        </button>
                    )}
                    {broadcasts.length > 0 && (
                        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-500/15 border border-violet-400/25 text-violet-300 text-xs font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse inline-block" />
                            {broadcasts.length} live broadcast{broadcasts.length !== 1 ? "s" : ""}
                        </div>
                    )}
                </div>

                {/* ── Upcoming events: glass node cards ── */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-base font-bold text-white flex items-center gap-2">
                            <Clock size={15} className="text-violet-300" /> Upcoming Services
                        </h2>
                        <button onClick={() => onNavigate("schedule")} className="text-xs text-violet-300 hover:text-violet-200 flex items-center gap-0.5 font-medium">
                            Full calendar <ChevronRight size={12} />
                        </button>
                    </div>
                    {upcomingEvents.length === 0 ? (
                        <div className={`${G} p-8 flex flex-col items-center gap-3 text-center`}>
                            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
                                <Calendar size={24} className="text-violet-300" />
                            </div>
                            <p className="text-white/50 text-sm">No upcoming services scheduled</p>
                            {canWriteSchedule && (
                                <button onClick={() => onNavigate("schedule")} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors shadow-lg shadow-violet-900/50">
                                    <Plus size={12} /> Add Service
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {upcomingEvents.slice(0, 6).map((ev, i) => <EventCard key={ev.id} ev={ev} isNext={i === 0} />)}
                        </div>
                    )}
                </div>

                {/* ── Bottom 3-col grid ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                    {/* Broadcasts */}
                    <div className={`${G} overflow-hidden`}>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                            <p className="text-sm font-bold text-white flex items-center gap-2">
                                <Megaphone size={14} className="text-amber-300" /> Broadcasts
                            </p>
                            <button onClick={() => onNavigate("admin")} className="text-[11px] text-violet-300 hover:text-violet-200 flex items-center gap-0.5 font-medium">Manage <ChevronRight size={11} /></button>
                        </div>
                        {broadcasts.length === 0 ? (
                            <div className="flex items-center gap-2 px-5 py-5 text-white/30 text-sm">
                                <Megaphone size={15} className="opacity-30" /> No active announcements
                            </div>
                        ) : (
                            <div className="divide-y divide-white/5">
                                {broadcasts.slice(0, 3).map((b: any) => (
                                    <div key={b.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-white/5 transition-colors">
                                        <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-400/20 flex items-center justify-center shrink-0 mt-0.5">
                                            <Bell size={12} className="text-amber-300" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold text-white">{b.title}</p>
                                            <p className="text-[11px] text-white/40 line-clamp-1 mt-0.5">{b.message}</p>
                                        </div>
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse mt-2 shrink-0" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Recent Songs */}
                    <div className={`${G} overflow-hidden`}>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                            <p className="text-sm font-bold text-white flex items-center gap-2">
                                <TrendingUp size={14} className="text-violet-300" /> Recent Songs
                            </p>
                            <button onClick={() => onNavigate("songs")} className="text-[11px] text-violet-300 hover:text-violet-200 flex items-center gap-0.5 font-medium">Library <ChevronRight size={11} /></button>
                        </div>
                        {recentSongs.length === 0 ? (
                            <div className="flex items-center gap-2 px-5 py-5 text-white/30 text-sm">
                                <Music size={15} className="opacity-30" /> No songs yet
                            </div>
                        ) : (
                            <div className="divide-y divide-white/5">
                                {recentSongs.map(s => (
                                    <div key={s.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-colors">
                                        <div className="w-7 h-7 rounded-lg bg-violet-500/25 border border-violet-400/20 flex items-center justify-center shrink-0">
                                            <Music size={12} className="text-violet-300" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-white truncate">{s.title}</p>
                                            <p className="text-[11px] text-white/40 truncate">{s.artist}</p>
                                        </div>
                                        {s.created_at && <p className="text-[10px] text-white/25 shrink-0">{relDate(s.created_at)}</p>}
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="px-5 py-2.5 border-t border-white/5">
                            <p className="text-[10px] text-white/25">{songs.length} total · {songsUsed} used in services</p>
                        </div>
                    </div>

                    {/* Issues + Team */}
                    <div className="space-y-4">
                        {/* Issues */}
                        <div className={`${G} p-4`}>
                            <p className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                <Bug size={14} className="text-pink-300" /> Open Issues
                            </p>
                            <div className="grid grid-cols-2 gap-2 mb-3">
                                <div className="flex flex-col items-center py-3 rounded-xl bg-red-500/15 border border-red-400/20">
                                    <p className="text-2xl font-black text-red-300">{openBugs}</p>
                                    <p className="text-[10px] text-red-400 flex items-center gap-0.5 mt-0.5"><Bug size={9} />Bugs</p>
                                </div>
                                <div className="flex flex-col items-center py-3 rounded-xl bg-amber-500/15 border border-amber-400/20">
                                    <p className="text-2xl font-black text-amber-300">{openFeqs}</p>
                                    <p className="text-[10px] text-amber-400 flex items-center gap-0.5 mt-0.5"><Lightbulb size={9} />Requests</p>
                                </div>
                            </div>
                            {openBugs + openFeqs === 0 && (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-400/20 text-emerald-300 text-xs">
                                    <CheckCircle2 size={12} /> All clear! 🎉
                                </div>
                            )}
                        </div>

                        {/* Team by role mini */}
                        <div className={`${G} p-4`}>
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-sm font-bold text-white flex items-center gap-2"><Users size={14} className="text-cyan-300" />Team</p>
                                <button onClick={() => onNavigate("members")} className="text-[11px] text-violet-300 font-medium flex items-center gap-0.5">All <ChevronRight size={11} /></button>
                            </div>
                            {roleGroups.length === 0 ? (
                                <p className="text-xs text-white/30">No members yet</p>
                            ) : roleGroups.slice(0, 4).map(([role, count]) => (
                                <div key={role} className="flex items-center gap-2 mb-2">
                                    <div className="flex-1 min-w-0 text-xs text-white/50 truncate">{role}</div>
                                    <div className="w-24 bg-white/10 rounded-full h-1.5 overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-violet-400 to-cyan-400 rounded-full"
                                            style={{ width: members.length > 0 ? `${Math.round(count / members.length * 100)}%` : "0%" }} />
                                    </div>
                                    <span className="text-xs font-bold text-white w-4 text-right shrink-0">{count}</span>
                                </div>
                            ))}
                            <div className="mt-2 pt-2 border-t border-white/10 flex justify-between text-[10px] text-white/30">
                                <span>{members.length} total members</span>
                                <span>{members.filter(m => m.status === "active").length} active</span>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
