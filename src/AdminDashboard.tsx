import React, { useMemo, useState } from "react";
import {
    Music, Users, Calendar, NotepadText, ChevronRight, Clock,
    Bug, Lightbulb, CheckCircle2, AlertCircle, Shield, Bell, UserCheck,
    AlertTriangle, CheckCheck, Megaphone, Plus, UserPlus, Zap, BarChart3,
    TrendingUp, ArrowUpRight, Activity, Star,
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
    return ({ sunday_service: "Sunday Service", midweek_service: "Midweek Service", practice: "Practice", special: "Special Event" })[t ?? ""] ?? (t ?? "Event");
}
function greeting() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }

// ── Design tokens — Dark Navy ─────────────────────────────────────────────────
// bg:     #0a1628  (dot-grid background)
// card:   #111f35  border: rgba(255,255,255,0.05)
// card-sm:#0f1c30  border: rgba(255,255,255,0.05)
// text-1: white    text-2: slate-400   text-3: slate-600

const TILE = "bg-[#111f35] border border-white/5 rounded-2xl";
const TILE_SM = "bg-[#0f1c30] border border-white/5 rounded-xl";

const dotGrid: React.CSSProperties = {
    backgroundColor: "#0a1628",
    backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.065) 1px, transparent 1px)",
    backgroundSize: "24px 24px",
};

// ── Bento Tile wrapper ────────────────────────────────────────────────────────
function Tile({ children, className = "", onClick }: {
    children: React.ReactNode; className?: string; onClick?: () => void;
}) {
    return (
        <div onClick={onClick}
            className={`${TILE} overflow-hidden
                ${onClick ? "cursor-pointer hover:border-indigo-500/25 hover:shadow-lg hover:shadow-indigo-900/20 transition-all duration-150" : ""}
                ${className}`}>
            {children}
        </div>
    );
}

// ── Section label ─────────────────────────────────────────────────────────────
function Label({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5 mb-4">
            <span className="text-indigo-400/70">{icon}</span>{children}
        </p>
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
                <ArrowUpRight size={13} className="text-slate-700 mt-0.5" />
            </div>
            <div className="mt-5">
                <p className="text-4xl font-black text-white tracking-tight leading-none">{value}</p>
                <p className="text-sm font-semibold text-slate-400 mt-1.5">{label}</p>
                <p className="text-[11px] text-slate-600 mt-0.5">{sub}</p>
            </div>
        </Tile>
    );
}

// ── Next service hero tile ────────────────────────────────────────────────────
function NextServiceTile({ ev, onClick }: { ev: Schedule | null; onClick: () => void; }) {
    if (!ev) return (
        <Tile className="p-6 flex flex-col gap-3 h-full" onClick={onClick}>
            <Label icon={<Star size={10} />}>Next Service</Label>
            <div className="flex flex-col items-center justify-center flex-1 gap-3 py-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
                    <Calendar size={20} className="text-indigo-400" />
                </div>
                <p className="text-slate-500 text-sm text-center">No services scheduled yet</p>
            </div>
        </Tile>
    );
    const du = daysUntil(ev.date);
    const d = new Date(ev.date + "T00:00:00");
    const isUrgent = du === "Today" || du === "Tomorrow";
    return (
        <Tile className="relative p-6 flex flex-col justify-between h-full" onClick={onClick}>
            {/* Top indigo accent line */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-indigo-500 via-violet-500 to-transparent" />
            <div>
                <div className="flex items-center justify-between mb-5">
                    <Label icon={<Star size={10} />}>Next Service</Label>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 -mt-3.5
                        ${isUrgent ? "bg-red-500/15 text-red-400 border-red-500/25" : "bg-indigo-500/15 text-indigo-400 border-indigo-500/25"}`}>
                        {du}
                    </span>
                </div>
                <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 shrink-0 shadow-lg shadow-indigo-900/40">
                        <p className="text-[10px] font-bold uppercase text-indigo-200">{d.toLocaleDateString("en", { month: "short" })}</p>
                        <p className="text-3xl font-black text-white leading-none">{d.getDate()}</p>
                        <p className="text-[9px] text-indigo-300 mt-0.5">{d.toLocaleDateString("en", { weekday: "short" })}</p>
                    </div>
                    <div className="min-w-0">
                        <p className="text-xl font-black text-white leading-tight truncate">{ev.eventName ?? "Service"}</p>
                        <p className="text-sm text-slate-500 mt-1">{svcLabel(ev.serviceType)}</p>
                        {ev.worshipLeader && (
                            <p className="text-xs text-indigo-400 mt-2 flex items-center gap-1.5">
                                <Star size={10} />{ev.worshipLeader.name}
                            </p>
                        )}
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-2 mt-5 pt-4 border-t border-white/5">
                <div className="flex -space-x-2">
                    {[ev.worshipLeader, ...(ev.musicians ?? []).slice(0, 3)].filter(Boolean).map((m, i) => (
                        <div key={i} className="w-7 h-7 rounded-full bg-indigo-700 border-2 border-[#111f35] flex items-center justify-center text-[9px] font-bold text-indigo-200">
                            {(m!.name || "?")[0].toUpperCase()}
                        </div>
                    ))}
                </div>
                <p className="text-xs text-slate-600">
                    {[ev.worshipLeader, ...(ev.musicians ?? [])].filter(Boolean).length} serving
                </p>
            </div>
        </Tile>
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
        .slice(0, 5);
    const roleGroups = useMemo(() => {
        const g: Record<string, number> = {};
        members.forEach(m => { const r = m.roles?.[0] || "Member"; g[r] = (g[r] ?? 0) + 1; });
        return Object.entries(g).sort((a, b) => b[1] - a[1]);
    }, [members]);

    const first = userName.split(" ")[0] || "Admin";
    const nextEvent = upcomingEvents[0] ?? null;

    return (
        <div className="min-h-screen w-full" style={dotGrid}>

            {/* ── Top bar ── */}
            <div className="border-b border-white/5 px-6 py-4 flex items-center justify-between bg-[#0a1628]/80 backdrop-blur-sm sticky top-0 z-20">
                <div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-600 mb-0.5">
                        <span>WorshipFlow</span><ChevronRight size={10} /><span>Admin</span><ChevronRight size={10} /><span className="text-slate-400">Dashboard</span>
                    </div>
                    <h1 className="text-base font-bold text-white">{greeting()}, {first} 👋</h1>
                </div>
                <div className="flex items-center gap-2">
                    {pendingUsers.length > 0 && (
                        <button onClick={() => onNavigate("admin")}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-400/25 text-amber-400 text-xs font-semibold hover:bg-amber-500/15 transition-colors">
                            <UserCheck size={11} />{pendingUsers.length} pending
                        </button>
                    )}
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/8 text-white text-sm font-medium">
                        {userPhoto
                            ? <img src={userPhoto} className="w-5 h-5 rounded-full object-cover" alt="" />
                            : <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[9px] font-bold">{first[0]}</div>}
                        {first}
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/12 border border-amber-400/25 text-amber-300"
                        style={{ boxShadow: "0 0 12px 2px rgba(245,158,11,0.18)" }}>
                        <Shield size={12} /> Admin
                    </div>
                </div>
            </div>

            {/* ── Bento grid body ── */}
            <div className="p-5 max-w-7xl mx-auto space-y-4">

                {/* Quick actions */}
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mr-1">Quick Actions</span>
                    {canAddSong && <button onClick={() => onNavigate("songs")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/12 border border-indigo-500/20 text-indigo-400 text-xs font-semibold hover:bg-indigo-500/20 transition-colors"><Music size={11} />Add Song</button>}
                    {canWriteSchedule && <button onClick={() => onNavigate("schedule")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/12 border border-emerald-500/20 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-colors"><Calendar size={11} />Schedule</button>}
                    {canAddMember && <button onClick={() => onNavigate("members")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500/12 border border-violet-500/20 text-violet-400 text-xs font-semibold hover:bg-violet-500/20 transition-colors"><UserPlus size={11} />Add Member</button>}
                    <button onClick={() => onNavigate("admin")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/12 border border-amber-500/20 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-colors"><Megaphone size={11} />Broadcast</button>
                </div>

                {/* ── ROW 1: 4 metrics + Next Service (2-wide) ── */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <MetricTile label="Songs" value={songs.length} sub={`${songsUsed} in services`}
                        iconBg="bg-indigo-500/15" icon={<Music size={15} className="text-indigo-400" />}
                        onClick={() => onNavigate("songs")} />
                    <MetricTile label="Members" value={members.length} sub={`${members.filter(m => m.status !== "inactive").length} active`}
                        iconBg="bg-violet-500/15" icon={<Users size={15} className="text-violet-400" />}
                        onClick={() => onNavigate("members")} />
                    <MetricTile label="Services" value={totalServices} sub={`${upcomingEvents.length} upcoming`}
                        iconBg="bg-emerald-500/15" icon={<Zap size={15} className="text-emerald-400" />}
                        onClick={() => onNavigate("schedule")} />
                    <MetricTile label="Issues" value={openBugs + openFeqs} sub={`${openBugs} bugs · ${openFeqs} req`}
                        iconBg="bg-amber-500/15" icon={<AlertCircle size={15} className="text-amber-400" />} />
                    {/* Next service — 2 cols wide */}
                    <div className="col-span-2">
                        <NextServiceTile ev={nextEvent} onClick={() => onNavigate("schedule")} />
                    </div>
                </div>

                {/* Alert banners */}
                {(coverageIssues > 0 || pendingUsers.length > 0) && (
                    <div className="flex flex-wrap gap-2">
                        {coverageIssues > 0 && (
                            <button onClick={() => onNavigate("schedule")}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/15 transition-colors">
                                <AlertTriangle size={11} />{coverageIssues} service{coverageIssues !== 1 ? "s" : ""} missing a leader
                            </button>
                        )}
                        {pendingUsers.length > 0 && (
                            <button onClick={() => onNavigate("admin")}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold hover:bg-amber-500/15 transition-colors">
                                <UserCheck size={11} />{pendingUsers.length} pending access request{pendingUsers.length !== 1 ? "s" : ""}
                            </button>
                        )}
                        {coverageIssues === 0 && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/8 border border-emerald-500/15 text-emerald-500 text-xs font-semibold">
                                <CheckCheck size={11} /> All services covered ✓
                            </div>
                        )}
                    </div>
                )}

                {/* ── ROW 2: Coverage | Upcoming | Broadcasts ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    {/* Coverage */}
                    <Tile className="p-5" onClick={() => onNavigate("schedule")}>
                        <Label icon={<Activity size={10} />}>Coverage</Label>
                        {upcomingEvents.length === 0 ? (
                            <p className="text-xs text-slate-600">No upcoming events</p>
                        ) : (
                            <div className="space-y-2.5">
                                {upcomingEvents.slice(0, 4).map(ev => (
                                    <div key={ev.id} className="flex items-center gap-2.5">
                                        {ev.worshipLeader
                                            ? <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                                            : <AlertTriangle size={12} className="text-red-400 shrink-0" />}
                                        <span className="flex-1 text-xs text-slate-400 truncate">{ev.eventName ?? "Event"}</span>
                                        <span className="text-[10px] text-slate-600 shrink-0">{daysUntil(ev.date)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Tile>

                    {/* Upcoming timeline */}
                    <Tile className="p-5" onClick={() => onNavigate("schedule")}>
                        <div className="flex items-center justify-between -mt-0.5 mb-4">
                            <Label icon={<Clock size={10} />}>Upcoming</Label>
                            <span className="text-[10px] text-indigo-400/60 font-medium -mt-3.5">View all</span>
                        </div>
                        {upcomingEvents.length === 0 ? (
                            <p className="text-xs text-slate-600">Nothing scheduled</p>
                        ) : (
                            <div className="space-y-3">
                                {upcomingEvents.slice(0, 4).map((ev, i) => {
                                    const d = new Date(ev.date + "T00:00:00");
                                    return (
                                        <div key={ev.id} className={`flex items-center gap-3 ${i > 0 ? "pt-3 border-t border-white/4" : ""}`}>
                                            <div className={`flex flex-col items-center justify-center w-10 h-10 rounded-xl shrink-0
                                                ${i === 0 ? "bg-indigo-600 shadow-lg shadow-indigo-900/40" : "bg-[#0f1c30] border border-white/5"}`}>
                                                <p className="text-[8px] font-bold uppercase text-current opacity-70">{d.toLocaleDateString("en", { month: "short" })}</p>
                                                <p className={`text-sm font-black leading-none ${i === 0 ? "text-white" : "text-slate-300"}`}>{d.getDate()}</p>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-semibold text-white truncate">{ev.eventName ?? "Event"}</p>
                                                <p className="text-[11px] text-slate-600 truncate">{ev.worshipLeader?.name ?? "No leader assigned"}</p>
                                            </div>
                                            <span className={`text-[10px] font-semibold shrink-0 ${i === 0 ? "text-indigo-400" : "text-slate-700"}`}>{daysUntil(ev.date)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Tile>

                    {/* Broadcasts */}
                    <Tile className="p-5">
                        <div className="flex items-center justify-between -mt-0.5 mb-4">
                            <Label icon={<Megaphone size={10} />}>Broadcasts
                                {broadcasts.length > 0 && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />}
                            </Label>
                            <button onClick={() => onNavigate("admin")} className="text-[10px] text-indigo-400/60 font-medium -mt-3.5 hover:text-indigo-400 transition-colors">Manage</button>
                        </div>
                        {broadcasts.length === 0 ? (
                            <div className="flex items-center gap-2 text-slate-600 text-xs"><Megaphone size={13} className="opacity-30" />No active broadcasts</div>
                        ) : broadcasts.slice(0, 3).map((b: any) => (
                            <div key={b.id} className="flex items-start gap-2.5 mb-3 last:mb-0">
                                <div className="w-6 h-6 rounded-lg bg-amber-500/12 border border-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
                                    <Bell size={10} className="text-amber-400" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold text-white">{b.title}</p>
                                    <p className="text-[11px] text-slate-600 line-clamp-1">{b.message}</p>
                                </div>
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse mt-1.5 shrink-0" />
                            </div>
                        ))}
                    </Tile>
                </div>

                {/* ── ROW 3: Songs | Issues | Team ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    {/* Recent Songs */}
                    <Tile className="p-5" onClick={() => onNavigate("songs")}>
                        <div className="flex items-center justify-between -mt-0.5 mb-4">
                            <Label icon={<TrendingUp size={10} />}>Recent Songs</Label>
                            <span className="text-[10px] text-slate-600 -mt-3.5">{songs.length} total</span>
                        </div>
                        {recentSongs.length === 0 ? (
                            <p className="text-xs text-slate-600">No songs yet</p>
                        ) : (
                            <div className="space-y-2.5">
                                {recentSongs.map((s, i) => (
                                    <div key={s.id} className={`flex items-center gap-3 ${i > 0 ? "pt-2.5 border-t border-white/4" : ""}`}>
                                        <div className="w-7 h-7 rounded-lg bg-indigo-500/12 border border-indigo-500/15 flex items-center justify-center shrink-0">
                                            <Music size={11} className="text-indigo-400" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-white truncate">{s.title}</p>
                                            <p className="text-[10px] text-slate-600 truncate">{s.artist}</p>
                                        </div>
                                        {s.created_at && <p className="text-[9px] text-slate-700 shrink-0">{relDate(s.created_at)}</p>}
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="mt-3 pt-2.5 border-t border-white/4">
                            <p className="text-[10px] text-slate-700">{songsUsed} used in services</p>
                        </div>
                    </Tile>

                    {/* Issues */}
                    <Tile className="p-5">
                        <Label icon={<Bug size={10} />}>Open Issues</Label>
                        <div className="grid grid-cols-2 gap-2.5 mb-3">
                            <div className="flex flex-col items-center py-4 rounded-xl bg-red-500/8 border border-red-500/10">
                                <p className="text-3xl font-black text-red-400">{openBugs}</p>
                                <p className="text-[10px] text-red-500/60 flex items-center gap-0.5 mt-1"><Bug size={9} />Bugs</p>
                            </div>
                            <div className="flex flex-col items-center py-4 rounded-xl bg-amber-500/8 border border-amber-500/10">
                                <p className="text-3xl font-black text-amber-400">{openFeqs}</p>
                                <p className="text-[10px] text-amber-500/60 flex items-center gap-0.5 mt-1"><Lightbulb size={9} />Requests</p>
                            </div>
                        </div>
                        {openBugs + openFeqs === 0 ? (
                            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/8 border border-emerald-500/10 text-emerald-500 text-xs font-medium">
                                <CheckCircle2 size={12} />All clear! 🎉
                            </div>
                        ) : (
                            <button onClick={() => onNavigate("admin")} className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/3 border border-white/6 text-slate-400 text-xs font-medium hover:border-white/10 transition-colors">
                                <span>View all issues</span><ChevronRight size={11} />
                            </button>
                        )}
                    </Tile>

                    {/* Team breakdown */}
                    <Tile className="p-5" onClick={() => onNavigate("members")}>
                        <div className="flex items-center justify-between -mt-0.5 mb-4">
                            <Label icon={<Users size={10} />}>Team by Role</Label>
                            <span className="text-[10px] text-slate-600 -mt-3.5">{members.length} members</span>
                        </div>
                        {roleGroups.length === 0 ? (
                            <p className="text-xs text-slate-600">No members yet</p>
                        ) : (
                            <div className="space-y-3">
                                {roleGroups.slice(0, 5).map(([role, count]) => (
                                    <div key={role}>
                                        <div className="flex justify-between text-[11px] mb-1">
                                            <span className="text-slate-500 truncate">{role}</span>
                                            <span className="text-slate-300 font-semibold shrink-0 ml-2">{count}</span>
                                        </div>
                                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                            <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                                                style={{ width: members.length > 0 ? `${Math.round(count / members.length * 100)}%` : "0%" }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex gap-4 mt-4 pt-3 border-t border-white/4 text-[10px] text-slate-700">
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
