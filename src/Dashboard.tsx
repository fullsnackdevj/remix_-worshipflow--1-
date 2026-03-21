import React, { useMemo, useState, useEffect, useCallback } from "react";
import AdminDashboard from "./AdminDashboard";
import { Member, ScheduleMember, Schedule } from "./types";
import {
    Music, Users, Calendar, NotepadText, ChevronRight,
    BookOpen, Clock, Star, TrendingUp, Bug, Lightbulb,
    CheckCircle2, AlertCircle, Mic2, Headphones, Guitar,
    User, Shield, ArrowRight, ClipboardList,
    Bell, UserCheck, AlertTriangle,
    CheckCheck, Megaphone, Plus, UserPlus, Zap, BarChart3,
    Radio, FlaskConical, ArrowUpRight
} from "lucide-react";
import VerseOfTheDay from "./VerseOfTheDay";

// ── Helpers ───────────────────────────────────────────────────────────────────
function greetingStr() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }

const ROLE_COLORS: Record<string, string> = {
    admin: "bg-amber-500/15 border-amber-400/30 text-amber-500",
    leader: "bg-indigo-500/15 border-indigo-400/30 text-indigo-400",
    planning_lead: "bg-rose-500/15 border-rose-400/30 text-rose-400",
    musician: "bg-purple-500/15 border-purple-400/30 text-purple-400",
    audio_tech: "bg-teal-500/15 border-teal-400/30 text-teal-400",
    qa_specialist: "bg-fuchsia-500/15 border-fuchsia-400/30 text-fuchsia-400",
    member: "bg-gray-500/15 border-gray-400/30 text-gray-400",
};
const ROLE_LABELS: Record<string, string> = {
    admin: "Admin", leader: "Worship Leader", planning_lead: "Planning Lead",
    musician: "Musician", audio_tech: "Audio / Tech", qa_specialist: "QA Specialist", member: "Member",
};
function RoleBadgeChip({ role }: { role: string }) {
    const color = ROLE_COLORS[role] ?? ROLE_COLORS.member;
    const label = ROLE_LABELS[role] ?? role;
    return (
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${color}`}>
            {label}
        </div>
    );
}

// Member, ScheduleMember, Schedule, Song are imported from ./types
interface Note { id: string; type: "bug" | "feature" | "general"; content: string; resolved?: boolean; createdAt: string; authorName: string; }
interface Broadcast { id: string; title: string; message: string; active: boolean; type?: string; }
interface Song { id: string; title: string; artist: string; created_at?: string; }

interface Props {
    isAdmin: boolean; userRole: string; userName: string; userPhoto: string; userEmail: string; userId: string;
    songs: Song[]; members: Member[]; schedules: Schedule[]; notes: Note[];
    onNavigate: (view: "songs" | "members" | "schedule" | "admin") => void;
    canAddSong?: boolean; canWriteSchedule?: boolean; canAddMember?: boolean;
  onOpenLineup?: () => void;
  lineupTrackCount?: number;
  isLineupOpen?: boolean;
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
                            <React.Fragment key={m.memberId}><Chip name={m.name} photo={getLivePhoto(m.memberId, m.photo)} /></React.Fragment>
                        ))}
                        {(schedule.backupSingers ?? []).filter(m => m.memberId !== myMemberId).map(m => (
                            <React.Fragment key={m.memberId}><Chip name={m.name} photo={getLivePhoto(m.memberId, m.photo)} /></React.Fragment>
                        ))}
                        {(schedule.assignments ?? []).flatMap(a => a.members).filter(m => m.memberId !== myMemberId).map(m => (
                            <React.Fragment key={m.memberId}><Chip name={m.name} photo={getLivePhoto(m.memberId, m.photo)} /></React.Fragment>
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
    onOpenLineup, lineupTrackCount = 0, isLineupOpen = false,
}: Props) {
    const [broadcasts, setBroadcasts] = useState<any[]>([]);
    const [pendingUsers, setPendingUsers] = useState<any[]>([]);
    const [loadingExtra, setLoadingExtra] = useState(true);

    useEffect(() => {
    const PENDING_TTL   = 5 * 60 * 1000;
    const BROADCAST_TTL = 3 * 60 * 1000;
    const now = Date.now();

    let cachedPending: any[] | null = null;
    try {
      const rp = localStorage.getItem("wf_pending_cache");
      if (rp) { const { data, ts } = JSON.parse(rp); if (now - ts < PENDING_TTL) cachedPending = data; }
    } catch { /* noop */ }

    let cachedBroadcasts: any[] | null = null;
    try {
      const rb = localStorage.getItem("wf_broadcast_cache");
      if (rb) {
        const { data, ts } = JSON.parse(rb);
        // Skip empty cache — stale empty should always re-fetch
        if (now - ts < BROADCAST_TTL && Array.isArray(data) && data.length > 0) cachedBroadcasts = data;
      }
    } catch { /* noop */ }

    // Serve cache immediately then always re-fetch broadcasts in background (stale-while-revalidate)
    if (cachedBroadcasts) setBroadcasts(cachedBroadcasts);

    Promise.all([
      cachedPending
        ? Promise.resolve(cachedPending)
        : fetch("/api/auth/pending").then(r => r.json()).catch(() => []),
      // Always re-fetch broadcasts fresh (cache above gives instant display)
      fetch("/api/broadcasts/all").then(r => r.json()).catch(() => cachedBroadcasts ?? []),
    ]).then(([p, b]) => {
      const pending    = Array.isArray(p) ? p : [];
      const broadcasts = Array.isArray(b) ? b : [];
      setPendingUsers(pending);
      setBroadcasts(broadcasts);
      try {
        if (!cachedPending) localStorage.setItem("wf_pending_cache", JSON.stringify({ data: pending, ts: now }));
        if (broadcasts.length > 0) localStorage.setItem("wf_broadcast_cache", JSON.stringify({ data: broadcasts, ts: now }));
      } catch { /* noop */ }
    }).finally(() => setLoadingExtra(false));
    }, []);

    // All roles see the full bento dashboard
    return (
        <AdminDashboard
            userName={userName} userEmail={userEmail} userId={userId} userRole={userRole} userPhoto={userPhoto}
            songs={songs} members={members} schedules={schedules} notes={notes}
            onNavigate={onNavigate}
            broadcasts={broadcasts} pendingUsers={pendingUsers} loadingExtra={loadingExtra}
            canAddSong={canAddSong} canWriteSchedule={canWriteSchedule} canAddMember={canAddMember}
            onOpenLineup={onOpenLineup} lineupTrackCount={lineupTrackCount} isLineupOpen={isLineupOpen}
        />
    );
}
