import React, { useMemo, useState, useEffect, useCallback } from "react";
import AdminDashboard from "./AdminDashboard";
import {
    Music, Users, Calendar, NotepadText, ChevronRight,
    BookOpen, Clock, Star, TrendingUp, Bug, Lightbulb,
    CheckCircle2, AlertCircle, Mic2, Headphones, Guitar,
    User, Shield, ArrowRight, ClipboardList,
    Bell, UserCheck, AlertTriangle,
    CheckCheck, Megaphone, Plus, UserPlus, Zap, BarChart3,
    Radio, FlaskConical
} from "lucide-react";
import VerseOfTheDay from "./VerseOfTheDay";

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
interface Broadcast { id: string; title: string; message: string; active: boolean; type?: string; }

interface Props {
    isAdmin: boolean; userRole: string; userName: string; userPhoto: string; userEmail: string; userId: string;
    songs: Song[]; members: Member[]; schedules: Schedule[]; notes: Note[];
    onNavigate: (view: "songs" | "members" | "schedule" | "admin") => void;
    canAddSong?: boolean; canWriteSchedule?: boolean; canAddMember?: boolean;
}

// ── Role config — matches App.tsx ROLE_BADGE exactly ──────────────────────────
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
function relativeDate(iso: string) {
    try {
        const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
        if (d === 0) return "Today"; if (d === 1) return "Yesterday";
        if (d < 7) return `${d}d ago`;
        return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
    } catch { return ""; }
}
function daysUntil(dateStr: string) {
    try {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const t = new Date(dateStr + "T00:00:00"); t.setHours(0, 0, 0, 0);
        const d = Math.round((t.getTime() - today.getTime()) / 86400000);
        if (d === 0) return "Today"; if (d === 1) return "Tomorrow";
        if (d > 0) return `In ${d}d`; return `${Math.abs(d)}d ago`;
    } catch { return ""; }
}
function svcLabel(t?: string) {
    return ({ sunday_service: "Sunday Service", midweek_service: "Midweek Service", practice: "Practice", special: "Special Event" })[t ?? ""] ?? t ?? "Event";
}
function svcColor(t?: string) {
    return ({ sunday_service: "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300", midweek_service: "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300", practice: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300", special: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" })[t ?? ""] ?? "bg-gray-100 dark:bg-gray-700 text-gray-600";
}
function greeting() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }

// ── Avatar chip ───────────────────────────────────────────────────────────────
function Chip({ name, photo }: { name: string; photo?: string }) {
    const [err, setErr] = useState(false);
    const init = (name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
    const ok = photo && photo.startsWith("http") && !err;
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-xs text-gray-800 dark:text-gray-200 font-medium">
            {ok ? <img src={photo} className="w-5 h-5 rounded-full object-cover" alt={name} onError={() => setErr(true)} />
                : <div className="w-5 h-5 rounded-full bg-indigo-200 dark:bg-indigo-700 flex items-center justify-center text-[9px] font-bold text-indigo-700 dark:text-indigo-200">{init}</div>}
            {name}
        </div>
    );
}

// ── Shared Header ─────────────────────────────────────────────────────────────
function DashHeader({ userName, userRole, pendingCount, onNavigate, loadingExtra }: {
    userName: string; userRole: string; pendingCount: number; onNavigate: (v: any) => void; loadingExtra: boolean;
}) {
    const rs = ROLE_STYLE[userRole] ?? ROLE_STYLE.member;
    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2">
            <div className="flex items-center gap-4">
                <div className="w-1.5 h-14 rounded-full bg-indigo-500 dark:bg-indigo-400 shrink-0" />
                <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{greeting()},</p>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white leading-tight tracking-tight">
                        {(userName || "User").split(" ")[0]} 👋
                    </h1>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {new Date().toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold ${rs.bg} border ${rs.border} ${rs.text}`}
                    style={{ boxShadow: rs.glow !== "none" ? `0 0 14px 3px ${rs.glow}` : undefined }}>
                    <Shield size={14} /> {rs.label}
                </div>
                {!loadingExtra && pendingCount > 0 && (
                    <button onClick={() => onNavigate("admin")}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400 text-sm font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                        <UserCheck size={14} /> {pendingCount} pending {pendingCount === 1 ? "request" : "requests"}
                    </button>
                )}
            </div>
        </div>
    );
}

// ── My Next Service card ──────────────────────────────────────────────────────
function MyServiceCard({ schedule, myMemberId, songs, members, onNavigate }: {
    schedule: Schedule | null; myMemberId: string | null; songs: Song[]; members: Member[]; onNavigate: (v: any) => void;
}) {
    const getLivePhoto = useCallback((id: string, fb?: string) => {
        const m = members.find(mem => mem.id === id);
        const u = m?.photo ?? fb ?? "";
        return u.startsWith("http") ? u : "";
    }, [members]);

    if (!schedule) return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 flex flex-col sm:flex-row items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                <Calendar size={22} className="text-gray-400" />
            </div>
            <div className="flex-1">
                <p className="font-semibold text-gray-900 dark:text-white">Not scheduled for any upcoming services</p>
                <p className="text-sm text-gray-400 mt-0.5">Check with your leader or Planning Lead for assignments.</p>
            </div>
            <button onClick={() => onNavigate("schedule")} className="shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors">
                View Schedule <ChevronRight size={13} />
            </button>
        </div>
    );

    // Find my roles in this service
    const myRoles: string[] = [];
    if (schedule.worshipLeader?.memberId === myMemberId) myRoles.push("Worship Leader");
    if ((schedule.backupSingers ?? []).some(m => m.memberId === myMemberId)) myRoles.push("Backup Singer");
    if ((schedule.musicians ?? []).some(m => m.memberId === myMemberId)) {
        const mu = schedule.musicians!.find(m => m.memberId === myMemberId);
        myRoles.push(mu?.role || "Musician");
    }
    (schedule.assignments ?? []).forEach(a => {
        if (a.members.some(m => m.memberId === myMemberId)) myRoles.push(a.role);
    });

    const solemn = schedule.songLineup?.solemn ? songs.find(s => s.id === schedule.songLineup?.solemn) : null;
    const joyful = schedule.songLineup?.joyful ? songs.find(s => s.id === schedule.songLineup?.joyful) : null;
    const du = daysUntil(schedule.date);

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-indigo-200 dark:border-indigo-800/50 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-indigo-100 dark:border-indigo-800/30 bg-indigo-50/50 dark:bg-indigo-900/10">
                <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                    <Calendar size={15} /> My Next Service
                </div>
                <button onClick={() => onNavigate("schedule")} className="text-xs text-indigo-500 hover:text-indigo-400 flex items-center gap-1 font-medium">
                    Full schedule <ChevronRight size={13} />
                </button>
            </div>
            <div className="p-5 space-y-4">
                {/* Top row */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-indigo-600 text-white shrink-0">
                            <p className="text-[9px] font-bold uppercase">{new Date(schedule.date + "T00:00:00").toLocaleDateString("en", { month: "short" })}</p>
                            <p className="text-xl font-black leading-tight">{new Date(schedule.date + "T00:00:00").getDate()}</p>
                        </div>
                        <div>
                            <p className="text-lg font-bold text-gray-900 dark:text-white">{schedule.eventName ?? "Upcoming Event"}</p>
                            <div className="flex items-center gap-2 flex-wrap mt-0.5">
                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${svcColor(schedule.serviceType)}`}>{svcLabel(schedule.serviceType)}</span>
                                <span className="text-xs text-gray-400">{new Date(schedule.date + "T00:00:00").toLocaleDateString("en", { weekday: "long" })}</span>
                            </div>
                        </div>
                    </div>
                    <span className={`px-3 py-1.5 rounded-full text-xs font-bold shrink-0 ${du === "Today" ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400" : du === "Tomorrow" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" : "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"}`}>
                        {du}
                    </span>
                </div>

                {/* My role */}
                {myRoles.length > 0 && (
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Your Role</p>
                        <div className="flex flex-wrap gap-1.5">
                            {myRoles.map(r => (
                                <span key={r} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
                                    <Mic2 size={10} /> {r}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Songs to prepare */}
                {(solemn || joyful) && (
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5 flex items-center gap-1"><Music size={10} /> Songs to Prepare</p>
                        <div className="flex flex-wrap gap-2">
                            {solemn && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/30 rounded-xl text-sm">
                                    <Music size={12} className="text-indigo-500 shrink-0" />
                                    <span className="text-gray-400 text-xs">Solemn:</span>
                                    <span className="font-semibold text-gray-900 dark:text-gray-100">{solemn.title}</span>
                                </div>
                            )}
                            {joyful && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800/30 rounded-xl text-sm">
                                    <Star size={12} className="text-violet-500 shrink-0" />
                                    <span className="text-gray-400 text-xs">Joyful:</span>
                                    <span className="font-semibold text-gray-900 dark:text-gray-100">{joyful.title}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Who else is serving */}
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Serving Together</p>
                    <div className="flex flex-wrap gap-1.5">
                        {schedule.worshipLeader && schedule.worshipLeader.memberId !== myMemberId && (
                            <Chip name={schedule.worshipLeader.name} photo={getLivePhoto(schedule.worshipLeader.memberId, schedule.worshipLeader.photo)} />
                        )}
                        {(schedule.musicians ?? []).filter(m => m.memberId !== myMemberId).map(m => (
                            <Chip key={m.memberId} name={m.name} photo={getLivePhoto(m.memberId, m.photo)} />
                        ))}
                        {(schedule.backupSingers ?? []).filter(m => m.memberId !== myMemberId).map(m => (
                            <Chip key={m.memberId} name={m.name} photo={getLivePhoto(m.memberId, m.photo)} />
                        ))}
                        {(schedule.assignments ?? []).flatMap(a => a.members).filter(m => m.memberId !== myMemberId).map(m => (
                            <Chip key={m.memberId} name={m.name} photo={getLivePhoto(m.memberId, m.photo)} />
                        ))}
                        {/* Fallback if solo */}
                        {!schedule.worshipLeader && (schedule.musicians ?? []).length === 0 && (schedule.backupSingers ?? []).length === 0 && (schedule.assignments ?? []).length === 0 && (
                            <p className="text-xs text-gray-400">No other assignments yet</p>
                        )}
                    </div>
                </div>

                {schedule.notes && (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-700/40 text-xs text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                        <NotepadText size={12} className="text-gray-400 shrink-0 mt-0.5" /> {schedule.notes}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Broadcasts ────────────────────────────────────────────────────────────────
function BroadcastsCard({ broadcasts, loading, isAdmin, onNavigate }: {
    broadcasts: any[]; loading: boolean; isAdmin: boolean; onNavigate: (v: any) => void;
}) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white text-sm">
                    <Megaphone size={15} className="text-indigo-500" /> Team Announcements
                    {broadcasts.length > 0 && <span className="text-[10px] font-bold bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded-full flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" /> {broadcasts.length} live</span>}
                </div>
                {isAdmin && <button onClick={() => onNavigate("admin")} className="text-xs text-indigo-500 hover:text-indigo-400 flex items-center gap-1 font-medium">Manage <ChevronRight size={13} /></button>}
            </div>
            {loading ? (
                <div className="px-5 py-5 animate-pulse flex gap-3"><div className="w-9 h-9 rounded-xl bg-gray-200 dark:bg-gray-700 shrink-0" /><div className="flex-1 space-y-2 pt-1"><div className="h-3 w-1/3 bg-gray-200 dark:bg-gray-700 rounded" /><div className="h-2 w-2/3 bg-gray-200 dark:bg-gray-700 rounded" /></div></div>
            ) : broadcasts.length === 0 ? (
                <div className="flex items-center gap-3 px-5 py-5 text-gray-400">
                    <Megaphone size={18} className="opacity-40 shrink-0" />
                    <p className="text-sm">No active announcements right now</p>
                </div>
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
                            <div className="flex items-center gap-1 shrink-0 mt-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                <span className="text-[10px] text-green-600 dark:text-green-400 font-semibold">Live</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard({
    isAdmin, userRole, userName, userPhoto, userEmail, userId, songs, members, schedules, notes, onNavigate,
    canAddSong = false, canWriteSchedule = false, canAddMember = false,
}: Props) {
    const [broadcasts, setBroadcasts] = useState<any[]>([]);
    const [pendingUsers, setPendingUsers] = useState<any[]>([]);
    const [loadingExtra, setLoadingExtra] = useState(true);

    useEffect(() => {
        Promise.all([
            fetch("/api/auth/pending").then(r => r.json()).catch(() => []),
            fetch("/api/broadcasts").then(r => r.json()).catch(() => []),
        ]).then(([p, b]) => {
            setPendingUsers(Array.isArray(p) ? p : []);
            setBroadcasts(Array.isArray(b) ? b : []);
        }).finally(() => setLoadingExtra(false));
    }, []);

    // ── Admin → Bento grid dashboard ──────────────────────────────────────
    if (isAdmin) {
        return (
            <div className="space-y-0">
                <VerseOfTheDay userId={userId} userName={userName} userPhoto={userPhoto} />
                <AdminDashboard
                    userName={userName} userPhoto={""} userEmail={userEmail}
                    songs={songs} members={members} schedules={schedules} notes={notes}
                    onNavigate={onNavigate}
                    broadcasts={broadcasts} pendingUsers={pendingUsers} loadingExtra={loadingExtra}
                    canAddSong={canAddSong} canWriteSchedule={canWriteSchedule} canAddMember={canAddMember}
                />
            </div>
        );
    }



    // Role flags
    const isLeader = userRole === "leader";
    const isPlanningLead = userRole === "planning_lead";
    const canSeeSchedule = isAdmin || isLeader || isPlanningLead;
    const canSeeTeam = isAdmin || isLeader || isPlanningLead;
    const canSeeSongs = userRole !== "member";

    const today = new Date(); today.setHours(0, 0, 0, 0);

    // Find current user's member record by email
    const myMember = useMemo(() =>
        members.find(m => m.email?.toLowerCase().trim() === userEmail?.toLowerCase().trim())
        , [members, userEmail]);
    const myMemberId = myMember?.id ?? null;

    // Upcoming events
    const upcomingEvents = useMemo(() =>
        schedules.filter(s => { try { return new Date(s.date + "T00:00:00") >= today; } catch { return false; } })
            .sort((a, b) => a.date.localeCompare(b.date))
        , [schedules]);

    // My upcoming services
    const myServices = useMemo(() => {
        if (!myMemberId) return [];
        return upcomingEvents.filter(s =>
            s.worshipLeader?.memberId === myMemberId ||
            (s.musicians ?? []).some(m => m.memberId === myMemberId) ||
            (s.backupSingers ?? []).some(m => m.memberId === myMemberId) ||
            (s.assignments ?? []).some(a => a.members.some(m => m.memberId === myMemberId))
        );
    }, [upcomingEvents, myMemberId]);

    const myNextService = myServices[0] ?? null;

    // Admin stats
    const getLivePhoto = useCallback((id: string, fb?: string) => {
        const m = members.find(mem => mem.id === id); const u = m?.photo ?? fb ?? "";
        return u.startsWith("http") ? u : "";
    }, [members]);

    const eventsThisMonth = useMemo(() => {
        const y = today.getFullYear(), mo = today.getMonth();
        return schedules.filter(s => { try { const d = new Date(s.date + "T00:00:00"); return d.getFullYear() === y && d.getMonth() === mo; } catch { return false; } }).length;
    }, [schedules]);
    const totalServicesAllTime = schedules.filter(s => s.serviceType === "sunday_service" || s.serviceType === "midweek_service").length;
    const songsUsedInServices = useMemo(() => {
        const ids = new Set<string>();
        schedules.forEach(s => { if (s.songLineup?.solemn) ids.add(s.songLineup.solemn); if (s.songLineup?.joyful) ids.add(s.songLineup.joyful); });
        return ids.size;
    }, [schedules]);
    const roleGroups = useMemo(() => {
        const g: Record<string, number> = {};
        members.forEach(m => { const r = m.roles?.[0] || "member"; g[r] = (g[r] ?? 0) + 1; });
        return Object.entries(g).sort((a, b) => b[1] - a[1]);
    }, [members]);
    const coverageWarnings = useMemo(() => upcomingEvents.slice(0, 5).filter(e => !e.worshipLeader), [upcomingEvents]);
    const coverageOk = useMemo(() => upcomingEvents.slice(0, 5).filter(e => !!e.worshipLeader), [upcomingEvents]);
    const openBugs = notes.filter(n => n.type === "bug" && !n.resolved).length;
    const openFeatures = notes.filter(n => n.type === "feature" && !n.resolved).length;
    const unresolvedNotes = notes.filter(n => !n.resolved).length;
    const recentNotes = [...notes].sort((a, b) => { try { return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); } catch { return 0; } }).slice(0, 3);
    const recentSongs = [...songs].filter(s => s.created_at).sort((a, b) => { try { return new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime(); } catch { return 0; } }).slice(0, 4);

    // Quick Actions — filtered by permissions
    const quickActions = [
        canAddSong && { label: "Add Song", icon: <Music size={14} className="text-indigo-400" />, action: () => onNavigate("songs") },
        canWriteSchedule && { label: "Schedule Service", icon: <Calendar size={14} className="text-emerald-400" />, action: () => onNavigate("schedule") },
        canAddMember && { label: "Add Member", icon: <UserPlus size={14} className="text-violet-400" />, action: () => onNavigate("members") },
        isAdmin && { label: "New Broadcast", icon: <Megaphone size={14} className="text-amber-400" />, action: () => onNavigate("admin") },
        // View-only links for everyone
        !canAddSong && { label: "Song Library", icon: <Music size={14} className="text-indigo-400" />, action: () => onNavigate("songs") },
        !canWriteSchedule && { label: "View Schedule", icon: <Calendar size={14} className="text-emerald-400" />, action: () => onNavigate("schedule") },
    ].filter(Boolean).filter((v, i, arr) => { const a = v as any; return arr.findIndex((x: any) => x && a && x.label === a.label) === i; }) as { label: string; icon: React.ReactNode; action: () => void }[];

    return (
        <div className="max-w-6xl mx-auto space-y-5 pb-12">

            {/* Verse of the Day — shown to all users at the top */}
            <VerseOfTheDay userId={userId} userName={userName} userPhoto={userPhoto} />

            {/* Header */}
            <DashHeader userName={userName} userRole={userRole}
                pendingCount={isAdmin ? pendingUsers.length : 0}
                onNavigate={onNavigate} loadingExtra={loadingExtra} />

            {/* Quick Actions */}
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mr-1">Quick Actions</span>
                {quickActions.map(({ label, icon, action }) => (
                    <button key={label} onClick={action}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-indigo-400/50 dark:hover:border-indigo-500/50 hover:bg-gray-200 dark:hover:bg-gray-700/60 text-gray-700 dark:text-gray-300 text-xs font-medium transition-all">
                        {icon} {label}
                    </button>
                ))}
            </div>

            {/* My Next Service — everyone */}
            <MyServiceCard schedule={myNextService} myMemberId={myMemberId} songs={songs} members={members} onNavigate={onNavigate} />

            {/* Broadcasts — everyone */}
            <BroadcastsCard broadcasts={broadcasts} loading={loadingExtra} isAdmin={isAdmin} onNavigate={onNavigate} />

            {/* Admin & Leaders: stat tiles + full schedule */}
            {canSeeSchedule && (
                <>
                    {/* Stat tiles — admin/leader/planningLead */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {[
                            { label: "Songs", value: songs.length, sub: `${songsUsedInServices} used in services`, icon: <Music size={20} />, c: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-900/30", border: "border-indigo-100 dark:border-indigo-800/50", view: "songs" as const },
                            { label: "Team Members", value: members.length, sub: `${members.filter(m => m.status !== "inactive").length} active`, icon: <Users size={20} />, c: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-900/30", border: "border-violet-100 dark:border-violet-800/50", view: "members" as const },
                            { label: "Events This Month", value: eventsThisMonth, sub: `${totalServicesAllTime} all-time`, icon: <Calendar size={20} />, c: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/30", border: "border-emerald-100 dark:border-emerald-800/50", view: "schedule" as const },
                            { label: "Open Notes", value: unresolvedNotes, sub: `${openBugs} bugs · ${openFeatures} requests`, icon: <NotepadText size={20} />, c: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/30", border: "border-amber-100 dark:border-amber-800/50", view: null as null },
                        ].map(({ label, value, sub, icon, c, bg, border, view }) => (
                            <button key={label} onClick={() => view && onNavigate(view)}
                                className={`flex flex-col gap-3 p-4 rounded-2xl bg-white dark:bg-gray-800 border ${border} shadow-sm hover:shadow-md transition-all text-left ${view ? "hover:-translate-y-0.5 cursor-pointer" : "cursor-default"}`}>
                                <div className={`w-10 h-10 rounded-xl ${bg} ${c} flex items-center justify-center`}>{icon}</div>
                                <div>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
                                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</p>
                                    <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Service Coverage + Issues (side by side) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Coverage */}
                        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                            <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-700 font-semibold text-gray-900 dark:text-white text-sm">
                                <AlertTriangle size={15} className="text-amber-500" /> Service Coverage
                            </div>
                            <div className="p-4 space-y-2">
                                {upcomingEvents.length === 0 ? (
                                    <div className="flex flex-col items-center py-4 gap-2 text-center"><CheckCheck size={20} className="text-gray-300" /><p className="text-xs text-gray-400">No upcoming events</p></div>
                                ) : coverageWarnings.length === 0 ? (
                                    <div className="flex items-center gap-2 px-3 py-3 rounded-xl bg-green-50 dark:bg-green-900/20 text-sm text-green-700 dark:text-green-400 font-medium"><CheckCheck size={15} /> All upcoming events have leaders ✓</div>
                                ) : coverageWarnings.slice(0, 3).map(ev => (
                                    <div key={ev.id} className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/15 border border-red-100 dark:border-red-800/30 text-xs">
                                        <AlertTriangle size={12} className="text-red-500 shrink-0 mt-0.5" />
                                        <div><p className="font-semibold text-red-700 dark:text-red-400">{ev.eventName ?? "Event"}</p><p className="text-red-400">{new Date(ev.date + "T00:00:00").toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })} · No leader</p></div>
                                    </div>
                                ))}
                                {coverageOk.slice(0, 3).map(ev => (
                                    <div key={ev.id} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs bg-gray-50 dark:bg-gray-700/30">
                                        <CheckCircle2 size={12} className="text-green-500 shrink-0" />
                                        <span className="truncate text-gray-500 dark:text-gray-400">{ev.eventName ?? "Event"}</span>
                                        <span className="ml-auto text-gray-400 shrink-0">{ev.worshipLeader?.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Open Issues — Admin only */}
                        {isAdmin ? (
                            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                                <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-700 font-semibold text-gray-900 dark:text-white text-sm">
                                    <AlertCircle size={15} className="text-amber-500" /> Open Issues
                                </div>
                                <div className="p-4 space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="flex flex-col items-center py-3 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40">
                                            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{openBugs}</p>
                                            <div className="flex items-center gap-1 text-xs text-red-500 font-medium mt-0.5"><Bug size={11} /> Bugs</div>
                                        </div>
                                        <div className="flex flex-col items-center py-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40">
                                            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{openFeatures}</p>
                                            <div className="flex items-center gap-1 text-xs text-amber-500 font-medium mt-0.5"><Lightbulb size={11} /> Requests</div>
                                        </div>
                                    </div>
                                    {recentNotes.length === 0 ? (
                                        <div className="flex flex-col items-center py-3 gap-1.5 text-center"><CheckCircle2 size={22} className="text-green-400 opacity-70" /><p className="text-xs text-gray-400">All clear! 🎉</p></div>
                                    ) : recentNotes.map(n => (
                                        <div key={n.id} className={`flex gap-2 p-2.5 rounded-xl border text-xs ${n.type === "bug" ? "bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30" : n.type === "feature" ? "bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/30" : "bg-gray-50 dark:bg-gray-700/30 border-gray-100 dark:border-gray-700"}`}>
                                            <span className="shrink-0 mt-0.5">{n.type === "bug" ? <Bug size={11} className="text-red-500" /> : n.type === "feature" ? <Lightbulb size={11} className="text-amber-500" /> : <NotepadText size={11} className="text-gray-400" />}</span>
                                            <div className="min-w-0"><p className="text-gray-700 dark:text-gray-200 line-clamp-1">{(n.content ?? "").slice(0, 55)}{(n.content ?? "").length > 55 ? "…" : ""}</p><p className="text-gray-400 mt-0.5">{n.authorName}</p></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            /* For leaders: show their upcoming services instead */
                            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                                <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-700 font-semibold text-gray-900 dark:text-white text-sm">
                                    <Star size={15} className="text-indigo-500" /> My Upcoming Services
                                </div>
                                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {myServices.length === 0 ? (
                                        <div className="flex items-center gap-2 px-5 py-5 text-gray-400 text-sm">No upcoming assignments</div>
                                    ) : myServices.slice(0, 4).map((s, i) => (
                                        <div key={s.id} className={`flex items-center gap-3 px-5 py-3 ${i === 0 ? "bg-indigo-50/40 dark:bg-indigo-900/10" : ""}`}>
                                            <div className={`w-9 h-9 rounded-xl flex flex-col items-center justify-center shrink-0 ${i === 0 ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-gray-700"}`}>
                                                <p className="text-[8px] font-bold uppercase">{new Date(s.date + "T00:00:00").toLocaleDateString("en", { month: "short" })}</p>
                                                <p className={`text-sm font-black leading-tight ${i === 0 ? "text-white" : "text-gray-900 dark:text-white"}`}>{new Date(s.date + "T00:00:00").getDate()}</p>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{s.eventName ?? "Event"}</p>
                                                <p className="text-xs text-gray-400 truncate">{svcLabel(s.serviceType)}</p>
                                            </div>
                                            <span className="text-xs font-semibold text-indigo-500 shrink-0">{daysUntil(s.date)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Full Upcoming Timeline */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white text-sm"><Clock size={15} className="text-indigo-500" /> Upcoming Schedule</div>
                            <button onClick={() => onNavigate("schedule")} className="text-xs text-indigo-500 hover:text-indigo-400 flex items-center gap-1 font-medium">Full calendar <ChevronRight size={13} /></button>
                        </div>
                        {upcomingEvents.length === 0 ? (
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-5 py-5">
                                <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700/60 flex items-center justify-center"><Calendar size={18} className="text-gray-400" /></div><p className="text-sm text-gray-500 dark:text-gray-400">No upcoming events scheduled</p></div>
                                {canWriteSchedule && <button onClick={() => onNavigate("schedule")} className="shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"><Plus size={13} /> Add Event</button>}
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
                                            <p className="text-xs mt-0.5 truncate">{ev.worshipLeader?.name ? <span className="text-gray-400">Leader: {ev.worshipLeader.name}</span> : <span className="text-red-400 flex items-center gap-1"><AlertTriangle size={9} /> No leader assigned</span>}</p>
                                        </div>
                                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${svcColor(ev.serviceType)}`}>{svcLabel(ev.serviceType)}</span>
                                        <span className={`text-xs font-semibold shrink-0 ${i === 0 ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400"}`}>{daysUntil(ev.date)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Milestones — everyone */}
            <div className="grid grid-cols-3 gap-3">
                {[
                    { label: "Total Services", value: totalServicesAllTime, icon: <Zap size={15} />, c: "text-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-900/20" },
                    { label: "Songs in Library", value: songs.length, icon: <Music size={15} />, c: "text-violet-500", bg: "bg-violet-50 dark:bg-violet-900/20" },
                    { label: "Used in Services", value: songsUsedInServices, icon: <BarChart3 size={15} />, c: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
                ].map(({ label, value, icon, c, bg }) => (
                    <div key={label} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
                        <div className={`w-9 h-9 rounded-xl ${bg} ${c} flex items-center justify-center shrink-0`}>{icon}</div>
                        <div><p className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{value}</p><p className="text-[10px] text-gray-400 leading-tight">{label}</p></div>
                    </div>
                ))}
            </div>

            {/* Bottom grid: Recent Songs + Team breakdown */}
            {(canSeeSongs || canSeeTeam) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {canSeeSongs && (
                        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                                <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white text-sm"><TrendingUp size={15} className="text-indigo-500" /> Recently Added Songs</div>
                                <button onClick={() => onNavigate("songs")} className="text-xs text-indigo-500 hover:text-indigo-400 flex items-center gap-1 font-medium">Library <ChevronRight size={13} /></button>
                            </div>
                            {recentSongs.length === 0 ? (
                                <div className="flex flex-col items-center py-8 gap-3 text-center px-5">
                                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center"><BookOpen size={22} className="text-indigo-400" /></div>
                                    <div><p className="text-sm font-medium text-gray-500 dark:text-gray-400">No songs yet</p></div>
                                    {canAddSong && <button onClick={() => onNavigate("songs")} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"><Plus size={12} /> Add First Song</button>}
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
                                <p className="text-xs text-gray-400">{songs.length} songs · {songsUsedInServices} used in services</p>
                            </div>
                        </div>
                    )}
                    {canSeeTeam && (
                        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                                <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white text-sm"><Users size={15} className="text-violet-500" /> Team by Role</div>
                                <button onClick={() => onNavigate("members")} className="text-xs text-indigo-500 hover:text-indigo-400 flex items-center gap-1 font-medium">All members <ChevronRight size={13} /></button>
                            </div>
                            <div className="p-5 space-y-3">
                                {roleGroups.length === 0 ? (
                                    <div className="flex flex-col items-center py-4 gap-2 text-center"><UserPlus size={22} className="text-violet-400 opacity-50" /><p className="text-xs text-gray-400">No team members yet</p></div>
                                ) : roleGroups.map(([role, count]) => (
                                    <div key={role} className="flex items-center gap-3">
                                        <div className="flex items-center gap-1.5 w-36 shrink-0 text-sm text-gray-700 dark:text-gray-300 truncate">{role}</div>
                                        <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden"><div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full" style={{ width: members.length > 0 ? `${Math.round((count / members.length) * 100)}%` : "0%" }} /></div>
                                        <span className="text-sm font-bold text-gray-900 dark:text-white w-5 text-right shrink-0">{count}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                                <p className="text-xs text-gray-400">{members.length} total team members</p>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
