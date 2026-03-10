import React, { useMemo, useState } from "react";
import {
    Music, Users, Calendar, NotepadText, ChevronRight, Clock,
    Bug, Lightbulb, CheckCircle2, AlertCircle, Shield, Bell, UserCheck,
    AlertTriangle, CheckCheck, Megaphone, Plus, UserPlus, Zap, BarChart3,
    TrendingUp, ArrowUpRight, Activity, Layers, Star,
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
    return ({ sunday_service: "Sunday Service", midweek_service: "Midweek Service", practice: "Practice", special: "Special Event" })[t ?? ""] ?? (t ?? "Event");
}
function greeting() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }

// ── Bento tile base ───────────────────────────────────────────────────────────
function Tile({ children, className = "", onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
    return (
        <div onClick={onClick}
            className={`bg-[#141414] border border-white/6 rounded-2xl overflow-hidden
                ${onClick ? "cursor-pointer hover:border-white/15 hover:bg-[#1a1a1a] transition-all duration-150" : ""}
                ${className}`}>
            {children}
        </div>
    );
}

// ── Big metric ────────────────────────────────────────────────────────────────
function BigMetric({ label, value, sub, color, icon, onClick }: {
    label: string; value: number | string; sub: string; color: string; icon: React.ReactNode; onClick?: () => void;
}) {
    return (
        <Tile className="p-5 flex flex-col justify-between h-full" onClick={onClick}>
            <div className="flex items-start justify-between">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
                    {icon}
                </div>
                <ArrowUpRight size={14} className="text-white/15 mt-0.5" />
            </div>
            <div className="mt-4">
                <p className="text-4xl font-black text-white tracking-tight leading-none">{value}</p>
                <p className="text-sm font-semibold text-white/50 mt-1.5">{label}</p>
                <p className="text-[11px] text-white/25 mt-0.5">{sub}</p>
            </div>
        </Tile>
    );
}

// ── Next service big card ─────────────────────────────────────────────────────
function NextServiceTile({ ev, onClick }: { ev: Schedule | null; onClick: () => void }) {
    if (!ev) return (
        <Tile className="p-6 flex flex-col gap-2 h-full" onClick={onClick}>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/25 mb-2">
                <Star size={10} /> Next Service
            </div>
            <p className="text-white/40 text-sm">Nothing scheduled yet</p>
            <p className="text-white/20 text-xs">Add a service to get started</p>
        </Tile>
    );
    const du = daysUntil(ev.date);
    const d = new Date(ev.date + "T00:00:00");
    const isUrgent = du === "Today" || du === "Tomorrow";
    return (
        <Tile className="relative p-6 flex flex-col justify-between h-full overflow-hidden" onClick={onClick}>
            {/* color accent strip */}
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-transparent" />
            {/* top row */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-white/30 flex items-center gap-1.5">
                        <Star size={10} className="text-indigo-400" /> Next Service
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isUrgent ? "bg-red-500/20 text-red-400 border border-red-500/20" : "bg-indigo-500/15 text-indigo-400 border border-indigo-500/20"}`}>{du}</span>
                </div>
                {/* big date */}
                <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 shrink-0">
                        <p className="text-[10px] font-bold uppercase text-indigo-200">{d.toLocaleDateString("en", { month: "short" })}</p>
                        <p className="text-3xl font-black text-white leading-none">{d.getDate()}</p>
                        <p className="text-[9px] text-indigo-300 mt-0.5">{d.toLocaleDateString("en", { weekday: "short" })}</p>
                    </div>
                    <div>
                        <p className="text-xl font-black text-white leading-tight">{ev.eventName ?? "Service"}</p>
                        <p className="text-sm text-white/40 mt-1">{svcLabel(ev.serviceType)}</p>
                        {ev.worshipLeader && <p className="text-xs text-indigo-400 mt-2 flex items-center gap-1"><Star size={10} />{ev.worshipLeader.name}</p>}
                    </div>
                </div>
            </div>
            {/* avatars */}
            <div className="flex items-center gap-2 mt-5 pt-4 border-t border-white/5">
                <div className="flex -space-x-2">
                    {[ev.worshipLeader, ...(ev.musicians ?? []).slice(0, 3)].filter(Boolean).map((m, i) => (
                        <div key={i} className="w-7 h-7 rounded-full bg-indigo-700 border-2 border-[#141414] flex items-center justify-center text-[9px] font-bold text-indigo-200">
                            {(m!.name || "?")[0].toUpperCase()}
                        </div>
                    ))}
                </div>
                <p className="text-xs text-white/25">
                    {[ev.worshipLeader, ...(ev.musicians ?? [])].filter(Boolean).length} serving
                </p>
            </div>
        </Tile>
    );
}

// ── Coverage tile ─────────────────────────────────────────────────────────────
function CoverageTile({ events, onClick }: { events: Schedule[]; onClick: () => void }) {
    const issues = events.filter(e => !e.worshipLeader);
    return (
        <Tile className="p-5 h-full" onClick={onClick}>
            <div className="flex items-center justify-between mb-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-white/30 flex items-center gap-1.5">
                    <Activity size={10} className="text-amber-400" /> Coverage
                </p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${issues.length === 0 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/15" : "bg-red-500/10 text-red-400 border-red-500/15"}`}>
                    {issues.length === 0 ? "All good" : `${issues.length} gap${issues.length !== 1 ? "s" : ""}`}
                </span>
            </div>
            <div className="space-y-2">
                {events.slice(0, 4).map(ev => (
                    <div key={ev.id} className="flex items-center gap-2.5 py-1.5">
                        {ev.worshipLeader
                            ? <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                            : <AlertTriangle size={12} className="text-red-400 shrink-0" />}
                        <span className="flex-1 text-xs text-white/50 truncate">{ev.eventName ?? "Event"}</span>
                        <span className="text-[10px] text-white/25 shrink-0">{daysUntil(ev.date)}</span>
                    </div>
                ))}
                {events.length === 0 && <p className="text-xs text-white/25">No upcoming events</p>}
            </div>
        </Tile>
    );
}

// ── Main ──────────────────────────────────────────────────────────────────────
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
    const recentSongs = [...songs].filter(s => s.created_at)
        .sort((a, b) => { try { return new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime(); } catch { return 0; } })
        .slice(0, 5);
    const roleGroups = useMemo(() => {
        const g: Record<string, number> = {};
        members.forEach(m => { const r = m.roles?.[0] || "Member"; g[r] = (g[r] ?? 0) + 1; });
        return Object.entries(g).sort((a, b) => b[1] - a[1]);
    }, [members]);
    const first = userName.split(" ")[0] || "Admin";
    const nextEvent = upcomingEvents[0] ?? null;

    return (
        <div className="min-h-screen w-full bg-[#0c0c0c]">
            {/* ── Top bar ── */}
            <div className="border-b border-white/5 px-6 py-4 flex items-center justify-between bg-[#0f0f0f]">
                <div>
                    <div className="flex items-center gap-1.5 text-xs text-white/25 mb-0.5">
                        <span>WorshipFlow</span><ChevronRight size={10} className="opacity-40" /><span>Admin</span><ChevronRight size={10} className="opacity-40" /><span className="text-white/50">Dashboard</span>
                    </div>
                    <h1 className="text-base font-bold text-white">{greeting()}, {first} 👋</h1>
                </div>
                <div className="flex items-center gap-2">
                    {pendingUsers.length > 0 && (
                        <button onClick={() => onNavigate("admin")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold hover:bg-amber-500/15 transition-colors">
                            <UserCheck size={11} />{pendingUsers.length} pending
                        </button>
                    )}
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/8 text-white text-xs font-medium">
                        {userPhoto ? <img src={userPhoto} className="w-5 h-5 rounded-full object-cover" alt="" /> : <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[9px] font-bold">{first[0]}</div>}
                        {first}
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-400/20 text-amber-400 text-xs font-bold"
                        style={{ boxShadow: "0 0 10px 1px rgba(245,158,11,0.15)" }}>
                        <Shield size={11} /> Admin
                    </div>
                </div>
            </div>

            {/* ── Bento grid ── */}
            <div className="p-5 max-w-7xl mx-auto">
                {/* Quick actions strip */}
                <div className="flex items-center gap-2 mb-5 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/20 mr-1">Actions</span>
                    {canAddSong && <button onClick={() => onNavigate("songs")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/15 border border-indigo-500/20 text-indigo-400 text-xs font-semibold hover:bg-indigo-600/25 transition-colors"><Music size={11} />Add Song</button>}
                    {canWriteSchedule && <button onClick={() => onNavigate("schedule")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/15 border border-emerald-500/20 text-emerald-400 text-xs font-semibold hover:bg-emerald-600/25 transition-colors"><Calendar size={11} />Schedule</button>}
                    {canAddMember && <button onClick={() => onNavigate("members")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600/15 border border-violet-500/20 text-violet-400 text-xs font-semibold hover:bg-violet-600/25 transition-colors"><UserPlus size={11} />Add Member</button>}
                    <button onClick={() => onNavigate("admin")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600/15 border border-amber-500/20 text-amber-400 text-xs font-semibold hover:bg-amber-600/25 transition-colors"><Megaphone size={11} />Broadcast</button>
                </div>

                {/* ── Row 1: Big metrics + Next Service ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-3">
                    {/* Metrics — each 1 col */}
                    <BigMetric label="Songs" value={songs.length} sub={`${songsUsed} in services`}
                        icon={<Music size={16} className="text-indigo-400" />} color="bg-indigo-500/15"
                        onClick={() => onNavigate("songs")} />
                    <BigMetric label="Members" value={members.length} sub={`${members.filter(m => m.status !== "inactive").length} active`}
                        icon={<Users size={16} className="text-violet-400" />} color="bg-violet-500/15"
                        onClick={() => onNavigate("members")} />
                    <BigMetric label="Services" value={totalServices} sub={`${upcomingEvents.length} upcoming`}
                        icon={<Zap size={16} className="text-emerald-400" />} color="bg-emerald-500/15"
                        onClick={() => onNavigate("schedule")} />
                    <BigMetric label="Issues" value={openBugs + openFeqs} sub={`${openBugs} bugs · ${openFeqs} req`}
                        icon={<AlertCircle size={16} className="text-amber-400" />} color="bg-amber-500/15" />
                    {/* Next service — spans 2 cols */}
                    <div className="col-span-2 row-span-1">
                        <NextServiceTile ev={nextEvent} onClick={() => onNavigate("schedule")} />
                    </div>
                </div>

                {/* ── Row 2: Coverage + Timeline + Broadcasts ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
                    {/* Coverage */}
                    <CoverageTile events={upcomingEvents.slice(0, 4)} onClick={() => onNavigate("schedule")} />

                    {/* Upcoming timeline */}
                    <Tile className="p-5">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-white/30 flex items-center gap-1.5"><Clock size={10} className="text-indigo-400" />Upcoming</p>
                            <button onClick={() => onNavigate("schedule")} className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-0.5">All <ChevronRight size={10} /></button>
                        </div>
                        {upcomingEvents.length === 0 ? (
                            <p className="text-xs text-white/25">No upcoming events</p>
                        ) : (
                            <div className="space-y-3">
                                {upcomingEvents.slice(0, 4).map((ev, i) => {
                                    const d = new Date(ev.date + "T00:00:00");
                                    return (
                                        <div key={ev.id} className={`flex items-center gap-3 ${i > 0 ? "pt-3 border-t border-white/4" : ""}`}>
                                            <div className={`flex flex-col items-center justify-center w-10 h-10 rounded-xl shrink-0 ${i === 0 ? "bg-indigo-600 text-white" : "bg-white/5 text-white/60"}`}>
                                                <p className="text-[8px] font-bold uppercase">{d.toLocaleDateString("en", { month: "short" })}</p>
                                                <p className="text-sm font-black leading-none">{d.getDate()}</p>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-semibold text-white truncate">{ev.eventName ?? "Event"}</p>
                                                <p className="text-[11px] text-white/30 truncate">{ev.worshipLeader?.name ?? "No leader"}</p>
                                            </div>
                                            <span className={`text-[10px] font-semibold shrink-0 ${i === 0 ? "text-indigo-400" : "text-white/20"}`}>{daysUntil(ev.date)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Tile>

                    {/* Broadcasts */}
                    <Tile className="p-5">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-white/30 flex items-center gap-1.5">
                                <Megaphone size={10} className="text-amber-400" />Broadcasts
                                {broadcasts.length > 0 && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />}
                            </p>
                            <button onClick={() => onNavigate("admin")} className="text-[10px] text-indigo-400 font-medium">Manage</button>
                        </div>
                        {broadcasts.length === 0 ? (
                            <p className="text-xs text-white/25">No active broadcasts</p>
                        ) : broadcasts.slice(0, 3).map((b: any) => (
                            <div key={b.id} className="flex items-start gap-2.5 mb-3 last:mb-0">
                                <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                                    <Bell size={10} className="text-amber-400" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold text-white">{b.title}</p>
                                    <p className="text-[11px] text-white/30 line-clamp-1">{b.message}</p>
                                </div>
                            </div>
                        ))}
                    </Tile>
                </div>

                {/* ── Row 3: Songs + Issues + Team ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    {/* Recent Songs — 1 col */}
                    <Tile className="p-5" onClick={() => onNavigate("songs")}>
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-white/30 flex items-center gap-1.5"><TrendingUp size={10} className="text-violet-400" />Recent Songs</p>
                            <span className="text-[10px] text-white/20">{songs.length} total</span>
                        </div>
                        {recentSongs.length === 0 ? (
                            <p className="text-xs text-white/25">No songs yet</p>
                        ) : (
                            <div className="space-y-2.5">
                                {recentSongs.map((s, i) => (
                                    <div key={s.id} className={`flex items-center gap-3 ${i > 0 ? "pt-2.5 border-t border-white/4" : ""}`}>
                                        <div className="w-7 h-7 rounded-lg bg-violet-500/15 border border-violet-500/10 flex items-center justify-center shrink-0">
                                            <Music size={11} className="text-violet-400" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-white truncate">{s.title}</p>
                                            <p className="text-[10px] text-white/30 truncate">{s.artist}</p>
                                        </div>
                                        {s.created_at && <p className="text-[9px] text-white/20 shrink-0">{relDate(s.created_at)}</p>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </Tile>

                    {/* Issues */}
                    <Tile className="p-5">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-white/30 flex items-center gap-1.5 mb-4"><Bug size={10} className="text-red-400" />Issues</p>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div className="flex flex-col items-center py-4 rounded-xl bg-red-500/8 border border-red-500/10">
                                <p className="text-3xl font-black text-red-400">{openBugs}</p>
                                <p className="text-[10px] text-red-500/70 flex items-center gap-0.5 mt-1"><Bug size={9} />Bugs</p>
                            </div>
                            <div className="flex flex-col items-center py-4 rounded-xl bg-amber-500/8 border border-amber-500/10">
                                <p className="text-3xl font-black text-amber-400">{openFeqs}</p>
                                <p className="text-[10px] text-amber-500/70 flex items-center gap-0.5 mt-1"><Lightbulb size={9} />Requests</p>
                            </div>
                        </div>
                        {openBugs + openFeqs === 0 ? (
                            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/8 border border-emerald-500/10 text-emerald-400 text-xs">
                                <CheckCircle2 size={12} />All clear 🎉
                            </div>
                        ) : pendingUsers.length > 0 && (
                            <button onClick={() => onNavigate("admin")} className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-amber-500/8 border border-amber-500/10 text-amber-400 text-xs font-semibold hover:bg-amber-500/12 transition-colors">
                                <span className="flex items-center gap-1.5"><UserCheck size={11} />{pendingUsers.length} pending request{pendingUsers.length !== 1 ? "s" : ""}</span>
                                <ChevronRight size={11} />
                            </button>
                        )}
                    </Tile>

                    {/* Team breakdown */}
                    <Tile className="p-5" onClick={() => onNavigate("members")}>
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-white/30 flex items-center gap-1.5"><Users size={10} className="text-cyan-400" />Team</p>
                            <span className="text-[10px] text-white/20">{members.length} members</span>
                        </div>
                        {roleGroups.length === 0 ? (
                            <p className="text-xs text-white/25">No members yet</p>
                        ) : (
                            <div className="space-y-3">
                                {roleGroups.map(([role, count]) => (
                                    <div key={role}>
                                        <div className="flex justify-between text-[11px] mb-1">
                                            <span className="text-white/40 truncate">{role}</span>
                                            <span className="text-white/60 font-semibold shrink-0 ml-2">{count}</span>
                                        </div>
                                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                            <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500"
                                                style={{ width: members.length > 0 ? `${Math.round(count / members.length * 100)}%` : "0%" }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex gap-3 mt-4 pt-3 border-t border-white/4 text-[10px] text-white/20">
                            <span>{members.filter(m => m.status === "active").length} active</span>
                            <span>{members.filter(m => m.status === "on-leave").length} on leave</span>
                            <span>{members.filter(m => m.status === "inactive").length} inactive</span>
                        </div>
                    </Tile>
                </div>
            </div>
        </div>
    );
}
