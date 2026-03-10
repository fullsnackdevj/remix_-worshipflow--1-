import React, { useMemo, useState, useEffect } from "react";
import {
    Music, Users, Calendar, NotepadText, ChevronRight, BookOpen, Clock,
    Bug, Lightbulb, CheckCircle2, AlertCircle, Shield, Bell, UserCheck,
    AlertTriangle, CheckCheck, Megaphone, Plus, UserPlus, Zap, BarChart3,
    TrendingUp, Radio, ArrowRight, MoreHorizontal, Move, Command,
    Thermometer, Database, Edit3, Image, AlignJustify, LayoutGrid,
} from "lucide-react";

// ── Types (mirrors Dashboard.tsx) ─────────────────────────────────────────────
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

// ── Dark nav card  ─────────────────────────────────────────────────────────────
const CARD = "bg-[#111f35] border border-white/5 rounded-2xl";
const CARD_SM = "bg-[#0f1c30] border border-white/5 rounded-xl";

// ── Left panel nav item ───────────────────────────────────────────────────────
function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }) {
    return (
        <button onClick={onClick}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-full text-sm font-medium transition-all text-left
                ${active ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200 hover:bg-white/5"}`}>
            <span className="shrink-0">{icon}</span>
            <span>{label}</span>
        </button>
    );
}

// ── Dark "node card" — for upcoming events ────────────────────────────────────
function EventCard({ ev, isNext }: { ev: Schedule; isNext: boolean }) {
    const du = daysUntil(ev.date);
    const dateObj = new Date(ev.date + "T00:00:00");
    return (
        <div className={`relative ${CARD_SM} p-4 shadow-lg ${isNext ? "ring-1 ring-indigo-500/40 shadow-indigo-900/30" : ""}`}>
            {/* header row */}
            <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/8 text-slate-300 border border-white/10">
                    {svcLabel(ev.serviceType)}
                </span>
                <MoreHorizontal size={14} className="text-slate-500" />
            </div>
            {/* date + name */}
            <div className="flex items-start gap-3">
                <div className={`flex flex-col items-center justify-center w-11 h-11 rounded-xl shrink-0 ${isNext ? "bg-indigo-600" : "bg-white/8"}`}>
                    <p className="text-[9px] font-bold uppercase">{dateObj.toLocaleDateString("en", { month: "short" })}</p>
                    <p className="text-base font-black leading-none">{dateObj.getDate()}</p>
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-white text-sm leading-tight truncate">{ev.eventName ?? "Service"}</p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                        {ev.worshipLeader ? ev.worshipLeader.name : <span className="text-red-400 flex items-center gap-1"><AlertTriangle size={9} />No leader</span>}
                    </p>
                </div>
            </div>
            {/* footer */}
            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-white/5">
                <div className="flex -space-x-1.5">
                    {[ev.worshipLeader, ...(ev.musicians ?? []).slice(0, 2)].filter(Boolean).map((m, i) => (
                        <div key={i} className="w-5 h-5 rounded-full bg-indigo-700 border border-[#0f1c30] flex items-center justify-center text-[8px] font-bold text-indigo-200 shrink-0">
                            {(m!.name || "?")[0].toUpperCase()}
                        </div>
                    ))}
                </div>
                <span className={`text-[10px] font-bold ${du === "Today" ? "text-red-400" : du === "Tomorrow" ? "text-amber-400" : "text-indigo-400"}`}>{du}</span>
            </div>
        </div>
    );
}

// ── Stat pill ─────────────────────────────────────────────────────────────────
function StatPill({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
    return (
        <div className={`flex items-center gap-3 px-4 py-3 ${CARD_SM}`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>{icon}</div>
            <div><p className="text-lg font-bold text-white leading-tight">{value}</p><p className="text-[10px] text-slate-500 leading-tight">{label}</p></div>
        </div>
    );
}

// ── Right toolbar ─────────────────────────────────────────────────────────────
function RightToolbar({ onNavigate, canAddSong, canWriteSchedule, canAddMember }:
    { onNavigate: (v: any) => void; canAddSong: boolean; canWriteSchedule: boolean; canAddMember: boolean }) {
    const tools = [
        { icon: <Music size={16} />, tip: "Songs", action: () => onNavigate("songs"), show: true },
        { icon: <Calendar size={16} />, tip: "Schedule", action: () => onNavigate("schedule"), show: true },
        { icon: <Users size={16} />, tip: "Members", action: () => onNavigate("members"), show: true },
        { icon: <Megaphone size={16} />, tip: "Broadcasts", action: () => onNavigate("admin"), show: true },
        { icon: <BarChart3 size={16} />, tip: "Analytics", action: () => onNavigate("schedule"), show: true },
        { icon: <NotepadText size={16} />, tip: "Notes", action: () => onNavigate("admin"), show: true },
    ].filter(t => t.show);
    return (
        <div className={`hidden lg:flex flex-col items-center gap-1 p-2 ${CARD} w-12 shrink-0`}>
            {tools.map((t, i) => (
                <button key={i} title={t.tip} onClick={t.action}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all">
                    {t.icon}
                </button>
            ))}
        </div>
    );
}

// ── Main AdminDashboard ───────────────────────────────────────────────────────
export default function AdminDashboard({
    userName, userPhoto, songs, members, schedules, notes, onNavigate,
    broadcasts, pendingUsers, loadingExtra, canAddSong, canWriteSchedule, canAddMember,
}: Props) {
    const [activeNav, setActiveNav] = useState("flows");
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
    const recentSongs = [...songs].filter(s => s.created_at).sort((a, b) => { try { return new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime(); } catch { return 0; } }).slice(0, 3);

    const first = userName.split(" ")[0] || "Admin";

    // dot grid style
    const dotGrid: React.CSSProperties = {
        backgroundColor: "#0a1628",
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
    };

    return (
        <div className="min-h-screen w-full" style={dotGrid}>
            {/* ── Top bar ── */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                <div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <span>WorshipFlow</span><ChevronRight size={11} /><span>Admin</span><ChevronRight size={11} /><span className="text-slate-300">Dashboard</span>
                    </div>
                    <h1 className="text-xl font-bold text-white mt-0.5">Admin Dashboard</h1>
                </div>
                <div className="flex items-center gap-3">
                    {pendingUsers.length > 0 && (
                        <button onClick={() => onNavigate("admin")}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold hover:bg-amber-500/20 transition-colors">
                            <UserCheck size={12} />{pendingUsers.length} pending
                        </button>
                    )}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-medium">
                        {userPhoto ? <img src={userPhoto} className="w-6 h-6 rounded-full object-cover" alt="" /> : <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold">{first[0]}</div>}
                        <span>Hey, {first}</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold bg-amber-500/15 border border-amber-400/30 text-amber-300" style={{ boxShadow: "0 0 12px 2px rgba(245,158,11,0.2)" }}>
                        <Shield size={13} /> Admin
                    </div>
                </div>
            </div>

            {/* ── Body ── */}
            <div className="flex gap-4 p-5">

                {/* Left panel */}
                <div className={`hidden md:flex flex-col gap-1 w-52 shrink-0 ${CARD} p-3`}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 pt-1 pb-2">Navigation</p>
                    <NavItem icon={<Zap size={15} />} label="Overview" active={activeNav === "flows"} onClick={() => setActiveNav("flows")} />
                    <NavItem icon={<BarChart3 size={15} />} label="Analytics" active={activeNav === "analytics"} onClick={() => setActiveNav("analytics")} />
                    <NavItem icon={<Music size={15} />} label="Songs" active={activeNav === "songs"} onClick={() => { setActiveNav("songs"); onNavigate("songs"); }} />
                    <NavItem icon={<Calendar size={15} />} label="Schedule" active={activeNav === "sched"} onClick={() => { setActiveNav("sched"); onNavigate("schedule"); }} />
                    <NavItem icon={<Users size={15} />} label="Team Members" active={activeNav === "members"} onClick={() => { setActiveNav("members"); onNavigate("members"); }} />
                    <NavItem icon={<Megaphone size={15} />} label="Broadcasts" active={activeNav === "admin"} onClick={() => { setActiveNav("admin"); onNavigate("admin"); }} />
                    <NavItem icon={<NotepadText size={15} />} label="Issues" active={activeNav === "issues"} onClick={() => setActiveNav("issues")} />
                    <div className="mt-auto pt-3 border-t border-white/5">
                        {/* mini stats */}
                        <div className="space-y-2 px-1">
                            <div className="flex justify-between text-xs text-slate-500"><span>Songs</span><span className="text-white font-bold">{songs.length}</span></div>
                            <div className="flex justify-between text-xs text-slate-500"><span>Members</span><span className="text-white font-bold">{members.length}</span></div>
                            <div className="flex justify-between text-xs text-slate-500"><span>Services</span><span className="text-white font-bold">{totalServices}</span></div>
                        </div>
                    </div>
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0 space-y-4">

                    {/* Greeting row */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-400">{greeting()},</p>
                            <h2 className="text-2xl font-bold text-white">{first} 👋</h2>
                            <p className="text-xs text-slate-500 mt-0.5">{new Date().toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
                        </div>
                        {/* Quick add buttons */}
                        <div className="flex items-center gap-2">
                            {canAddSong && <button onClick={() => onNavigate("songs")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs font-semibold hover:bg-indigo-600/30 transition-colors"><Music size={12} />Add Song</button>}
                            {canWriteSchedule && <button onClick={() => onNavigate("schedule")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold hover:bg-emerald-600/30 transition-colors"><Calendar size={12} />Schedule</button>}
                            {canAddMember && <button onClick={() => onNavigate("members")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-300 text-xs font-semibold hover:bg-violet-600/30 transition-colors"><UserPlus size={12} />Add Member</button>}
                            <button onClick={() => onNavigate("admin")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600/20 border border-amber-500/30 text-amber-300 text-xs font-semibold hover:bg-amber-600/30 transition-colors"><Megaphone size={12} />Broadcast</button>
                        </div>
                    </div>

                    {/* Stat pills */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <StatPill label="Songs" value={songs.length} icon={<Music size={15} />} color="bg-indigo-500/20 text-indigo-400" />
                        <StatPill label="Team Members" value={members.length} icon={<Users size={15} />} color="bg-violet-500/20 text-violet-400" />
                        <StatPill label="Total Services" value={totalServices} icon={<Zap size={15} />} color="bg-emerald-500/20 text-emerald-400" />
                        <StatPill label="Open Issues" value={openBugs + openFeqs} icon={<AlertCircle size={15} />} color="bg-amber-500/20 text-amber-400" />
                    </div>

                    {/* Issues + Coverage row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Coverage */}
                        <div className={`${CARD} p-4 space-y-3`}>
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-white flex items-center gap-2"><AlertTriangle size={14} className="text-amber-400" />Coverage</p>
                                <button onClick={() => onNavigate("schedule")} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5">View <ChevronRight size={11} /></button>
                            </div>
                            {coverageIssues === 0 ? (
                                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium"><CheckCheck size={13} />All services covered ✓</div>
                            ) : (
                                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium"><AlertTriangle size={13} />{coverageIssues} service{coverageIssues !== 1 ? "s" : ""} missing a leader</div>
                            )}
                            {upcomingEvents.slice(0, 3).map(ev => (
                                <div key={ev.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/4 border border-white/5 text-xs">
                                    {ev.worshipLeader ? <CheckCircle2 size={11} className="text-emerald-400 shrink-0" /> : <AlertTriangle size={11} className="text-red-400 shrink-0" />}
                                    <span className="flex-1 text-slate-300 truncate">{ev.eventName ?? "Event"}</span>
                                    <span className="text-slate-500">{daysUntil(ev.date)}</span>
                                </div>
                            ))}
                        </div>

                        {/* Issues */}
                        <div className={`${CARD} p-4 space-y-3`}>
                            <p className="text-sm font-semibold text-white flex items-center gap-2"><Bug size={14} className="text-red-400" />Open Issues</p>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="flex flex-col items-center py-3 rounded-xl bg-red-500/10 border border-red-500/15">
                                    <p className="text-2xl font-black text-red-400">{openBugs}</p>
                                    <p className="text-[10px] text-red-500 flex items-center gap-1"><Bug size={9} />Bugs</p>
                                </div>
                                <div className="flex flex-col items-center py-3 rounded-xl bg-amber-500/10 border border-amber-500/15">
                                    <p className="text-2xl font-black text-amber-400">{openFeqs}</p>
                                    <p className="text-[10px] text-amber-500 flex items-center gap-1"><Lightbulb size={9} />Requests</p>
                                </div>
                            </div>
                            {pendingUsers.length > 0 && (
                                <button onClick={() => onNavigate("admin")} className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold hover:bg-amber-500/15 transition-colors">
                                    <span className="flex items-center gap-1.5"><UserCheck size={12} />{pendingUsers.length} pending access request{pendingUsers.length !== 1 ? "s" : ""}</span>
                                    <ChevronRight size={12} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Upcoming events grid (the "card nodes" from screenshot) */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-semibold text-white flex items-center gap-2"><Clock size={14} className="text-indigo-400" />Upcoming Services</p>
                            <button onClick={() => onNavigate("schedule")} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5">Full calendar<ChevronRight size={11} /></button>
                        </div>
                        {upcomingEvents.length === 0 ? (
                            <div className={`${CARD} p-8 flex flex-col items-center gap-3 text-center`}>
                                <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 flex items-center justify-center"><Calendar size={22} className="text-indigo-400" /></div>
                                <p className="text-slate-400 text-sm">No upcoming services scheduled</p>
                                {canWriteSchedule && <button onClick={() => onNavigate("schedule")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"><Plus size={12} />Add Service</button>}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {upcomingEvents.slice(0, 6).map((ev, i) => <EventCard key={ev.id} ev={ev} isNext={i === 0} />)}
                            </div>
                        )}
                    </div>

                    {/* Bottom row: broadcasts + songs */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Broadcasts */}
                        <div className={`${CARD} overflow-hidden`}>
                            <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/5">
                                <p className="text-sm font-semibold text-white flex items-center gap-2"><Megaphone size={14} className="text-amber-400" />Broadcasts
                                    {broadcasts.length > 0 && <span className="text-[9px] font-bold bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />{broadcasts.length} live</span>}
                                </p>
                                <button onClick={() => onNavigate("admin")} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5">Manage<ChevronRight size={11} /></button>
                            </div>
                            {broadcasts.length === 0 ? (
                                <div className="flex items-center gap-3 px-4 py-5 text-slate-500 text-sm"><Megaphone size={16} className="opacity-40" />No active announcements</div>
                            ) : (
                                <div className="divide-y divide-white/5">
                                    {broadcasts.slice(0, 3).map((b: any) => (
                                        <div key={b.id} className="flex items-start gap-3 px-4 py-3 hover:bg-white/3 transition-colors">
                                            <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0 mt-0.5"><Bell size={12} className="text-indigo-400" /></div>
                                            <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-white">{b.title}</p><p className="text-[11px] text-slate-500 line-clamp-1">{b.message}</p></div>
                                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse mt-2 shrink-0" />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Recent songs */}
                        <div className={`${CARD} overflow-hidden`}>
                            <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/5">
                                <p className="text-sm font-semibold text-white flex items-center gap-2"><TrendingUp size={14} className="text-violet-400" />Recent Songs</p>
                                <button onClick={() => onNavigate("songs")} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5">Library<ChevronRight size={11} /></button>
                            </div>
                            {recentSongs.length === 0 ? (
                                <div className="flex items-center gap-3 px-4 py-5 text-slate-500 text-sm"><Music size={16} className="opacity-40" />No songs yet</div>
                            ) : (
                                <div className="divide-y divide-white/5">
                                    {recentSongs.map(s => (
                                        <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors">
                                            <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0"><Music size={12} className="text-indigo-400" /></div>
                                            <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-white truncate">{s.title}</p><p className="text-[11px] text-slate-500 truncate">{s.artist}</p></div>
                                            {s.created_at && <p className="text-[10px] text-slate-600 shrink-0">{relDate(s.created_at)}</p>}
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="px-4 py-2.5 border-t border-white/5 bg-white/2">
                                <p className="text-[10px] text-slate-600">{songs.length} songs · {songsUsed} used in services</p>
                            </div>
                        </div>
                    </div>

                    {/* Team by role */}
                    <div className={`${CARD} p-4`}>
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-sm font-semibold text-white flex items-center gap-2"><Users size={14} className="text-violet-400" />Team by Role</p>
                            <button onClick={() => onNavigate("members")} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5">All members<ChevronRight size={11} /></button>
                        </div>
                        {members.length === 0 ? (
                            <p className="text-xs text-slate-500">No team members yet</p>
                        ) : (() => {
                            const g: Record<string, number> = {};
                            members.forEach(m => { const r = m.roles?.[0] || "Member"; g[r] = (g[r] ?? 0) + 1; });
                            return Object.entries(g).sort((a, b) => b[1] - a[1]).map(([role, count]) => (
                                <div key={role} className="flex items-center gap-3 mb-2">
                                    <div className="w-32 shrink-0 text-xs text-slate-400 truncate">{role}</div>
                                    <div className="flex-1 bg-white/5 rounded-full h-1.5 overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full" style={{ width: members.length > 0 ? `${Math.round(count / members.length * 100)}%` : "0%" }} />
                                    </div>
                                    <span className="text-xs font-bold text-white w-5 text-right shrink-0">{count}</span>
                                </div>
                            ));
                        })()}
                    </div>

                </div>

                {/* Right toolbar */}
                <RightToolbar onNavigate={onNavigate} canAddSong={canAddSong} canWriteSchedule={canWriteSchedule} canAddMember={canAddMember} />
            </div>
        </div>
    );
}
