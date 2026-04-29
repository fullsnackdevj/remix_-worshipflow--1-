import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { db } from "./firebase";
import { collection, getDocs } from "firebase/firestore";
import { Member, ScheduleMember, Schedule } from "./types";
import VerseOfTheDay from "./VerseOfTheDay";
import BirthdayCard from "./BirthdayCard";
import BirthdayBanner from "./BirthdayBanner";
import AssemblyBell from "./AssemblyBell";
import { toSafeTitle } from "./utils/textFormatting";
import {
    Music, Users, Calendar, NotepadText, ChevronRight, Clock,
    Bug, Lightbulb, CheckCircle2, AlertCircle, Shield, Bell, UserCheck,
    AlertTriangle, CheckCheck, Megaphone, Plus, UserPlus, Zap, BarChart3,
    TrendingUp, ArrowUpRight, Star, Mic2, BookOpen, Radio, ListMusic, Headphones, ListTodo,
    Crown, ClipboardCheck, Music2, User,
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
    onNavigate: (view: string, opts?: { boardId?: string; cardId?: string }) => void;
    broadcasts?: any[]; pendingUsers?: any[]; loadingExtra?: boolean;
    canAddSong?: boolean; canWriteSchedule?: boolean; canAddMember?: boolean;
    onOpenLineup?: () => void;
    lineupTrackCount?: number;
    isLineupOpen?: boolean;
    isLibraryOpen?: boolean;
    isAdmin?: boolean;
}

const ROLE_STYLE: Record<string, { label: string; bg: string; text: string; border: string; glow: string }> = {
    // text: light-mode value first (dark: pair for dark mode) — ensures WCAG AA 4.5:1 contrast in both modes
    admin: { label: "Admin", bg: "bg-amber-500/15", text: "text-amber-700 dark:text-amber-300", border: "border-amber-400/30", glow: "rgba(245,158,11,0.28)" },
    leader: { label: "Worship Leader", bg: "bg-indigo-500/15", text: "text-indigo-700 dark:text-indigo-300", border: "border-indigo-500/40", glow: "rgba(99,102,241,0.28)" },
    planning_lead: { label: "Planning Lead", bg: "bg-rose-500/15", text: "text-rose-700 dark:text-rose-300", border: "border-rose-500/40", glow: "rgba(244,63,94,0.25)" },
    musician: { label: "Musician", bg: "bg-purple-500/15", text: "text-purple-700 dark:text-purple-300", border: "border-purple-500/40", glow: "rgba(168,85,247,0.25)" },
    audio_tech: { label: "Audio / Tech", bg: "bg-teal-500/15", text: "text-teal-700 dark:text-teal-300", border: "border-teal-500/40", glow: "rgba(20,184,166,0.25)" },
    member: { label: "Member", bg: "bg-gray-500/10", text: "text-gray-600 dark:text-gray-400", border: "border-gray-500/20", glow: "none" },
    qa_specialist: { label: "QA Specialist", bg: "bg-fuchsia-500/15", text: "text-fuchsia-700 dark:text-fuchsia-300", border: "border-fuchsia-500/40", glow: "rgba(217,70,239,0.25)" },
};

// Role → icon badge config (icon-only, gradient stroke ring — no glow)
const ROLE_ICON: Record<string, { Icon: React.ElementType; iconColor: string; gradA: string; gradB: string }> = {
    admin:        { Icon: Crown,         iconColor: "text-amber-300",  gradA: "#f59e0b", gradB: "#fde68a" },
    leader:       { Icon: Mic2,          iconColor: "text-indigo-300", gradA: "#6366f1", gradB: "#a5b4fc" },
    planning_lead:{ Icon: ClipboardCheck,iconColor: "text-rose-300",   gradA: "#f43f5e", gradB: "#fda4af" },
    musician:     { Icon: Music2,        iconColor: "text-purple-300", gradA: "#a855f7", gradB: "#d8b4fe" },
    audio_tech:   { Icon: Headphones,    iconColor: "text-teal-300",   gradA: "#14b8a6", gradB: "#5eead4" },
    member:       { Icon: User,          iconColor: "text-slate-300",  gradA: "#64748b", gradB: "#cbd5e1" },
    qa_specialist:{ Icon: Shield,        iconColor: "text-fuchsia-300",gradA: "#d946ef", gradB: "#f0abfc" },
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

// ── Design System v2.0: WorshipFlow standard tokens ──────────────────────────
// Card surface: rounded-2xl (16px) everywhere — standardized across all modules
// Padding: 24px internal (p-6) per Overpay Data Card spec
// Radius: 16px (rounded-2xl) for cards, 12px (rounded-xl) for inner elements
// Hover: translate-y-0.5 lift + border accent — no color shift
// Shadow: 2px 12px light / 4px 20px dark (refined from 4px 20px -2px)
const CARD = "bg-white dark:bg-gray-800/90 rounded-2xl border border-gray-200 dark:border-gray-700/60 shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_20px_-2px_rgba(0,0,0,0.35)]";

// ── Bento Tile ────────────────────────────────────────────────────────────────
function Tile({ children, className = "", onClick, style }: {
    children: React.ReactNode; className?: string; onClick?: () => void; style?: React.CSSProperties;
}) {
    return (
        <div onClick={onClick} style={style}
            className={`${CARD} flex flex-col h-full overflow-hidden
                ${onClick ? "cursor-pointer hover:-translate-y-0.5 hover:border-indigo-300/60 dark:hover:border-indigo-600/50 hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.4)] transition-all duration-200" : ""}
                ${className}`}>
            {children}
        </div>
    );
}

// ── Card header — Design System v2.0: icon chip w-8 h-8 (32px), 16px icon ───
function CardHeader({ icon, title, action, onAction }: {
    icon: React.ReactNode; title: string; action?: string; onAction?: () => void;
}) {
    return (
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700/60">
            <div className="flex items-center gap-2.5">
                {/* STANDARD icon chip: w-8 h-8, rounded-xl */}
                <span className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700/80 flex items-center justify-center shrink-0">
                    {icon}
                </span>
                {/* H2 — Card section title: base size, bold, dark */}
                <h2 className="font-bold text-gray-900 dark:text-white text-base tracking-tight">{title}</h2>
            </div>
            {action && onAction && (
                <button onClick={onAction} className="text-sm text-indigo-500 hover:text-indigo-400 flex items-center gap-1 font-medium transition-colors">
                    {action}<ChevronRight size={13} />
                </button>
            )}
        </div>
    );
}

// ── Metric tile — Design System v2.0: w-10 h-10 icon chip, 20px icon ─────────
function MetricTile({ label, value, sub, iconBg, icon, onClick }: {
    label: string; value: number; sub: string; iconBg: string; icon: React.ReactNode; onClick?: () => void;
}) {
    return (
        <Tile className="p-5 sm:p-6 flex flex-col justify-between min-h-[120px]" onClick={onClick}>
            <div className="flex items-start justify-between mb-3">
                {/* Icon chip: w-10 h-10, 20px icon — standard for stat tiles */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>{icon}</div>
                <ArrowUpRight size={16} className="text-gray-300 dark:text-gray-600 mt-0.5 transition-colors" />
            </div>
            <div>
                <p className="text-4xl font-black text-gray-900 dark:text-white tracking-tight leading-none">{value}</p>
                {/* H3 — Stat name: text-base bold, secondary */}
                <h3 className="text-base font-bold text-gray-700 dark:text-gray-300 mt-2 tracking-tight">{label}</h3>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5 font-medium">{sub}</p>
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
        const isValidPhoto = (p?: string) => !!p && (p.startsWith("http") || p.startsWith("data:image"));
        const direct = isValidPhoto(m.photo) ? m.photo! : "";
        if (direct) return direct;
        const byId   = m.memberId ? members.find(mem => mem.id === m.memberId) : undefined;
        if (isValidPhoto(byId?.photo)) return byId!.photo!;
        const lower  = (m.name ?? "").toLowerCase().trim();
        const byFull = members.find(mem => mem.name?.toLowerCase().trim() === lower);
        if (isValidPhoto(byFull?.photo)) return byFull!.photo!;
        // Partial: match by first word of name (less reliable but better than nothing)
        const first  = lower.split(" ")[0];
        const byFirst = first ? members.find(mem => mem.name?.toLowerCase().startsWith(first)) : undefined;
        if (isValidPhoto(byFirst?.photo)) return byFirst!.photo!;
        return "";
    }, [members]);


    if (!ev) return (
        <Tile className="p-6 flex flex-col gap-3 h-full" onClick={onClick}>
            <h2 className="flex items-center gap-2 text-base font-bold text-indigo-600 dark:text-indigo-400 mb-1">
                <Calendar size={15} /> Church Events
            </h2>
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
            <div className="p-5 flex-1 flex flex-col gap-3">
                {/* Date + event — compact header row */}
                <div className="flex items-center gap-3">
                    {/* Compact date chip */}
                    <div className="flex flex-col items-center justify-center w-12 rounded-xl bg-indigo-600 text-white shrink-0 shadow-md py-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300 leading-none">{d.toLocaleDateString("en", { month: "short" })}</p>
                        <p className="text-[26px] font-black leading-tight">{d.getDate()}</p>
                        <p className="text-[10px] font-semibold text-indigo-300 leading-none">{d.toLocaleDateString("en", { weekday: "short" })}</p>
                    </div>
                    {/* Event info */}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1 mb-0.5">
                            <h3 className="text-[15px] font-bold text-gray-900 dark:text-white leading-snug">{ev.eventName ?? "Event"}</h3>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${isUrgent ? "bg-red-500 text-white" : "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"}`}>{du}</span>
                        </div>
                        {ev.worshipLeader && (
                            <p className="text-xs text-gray-400 flex items-center gap-1">
                                <Mic2 size={10} className="shrink-0" />
                                Leader: <span className="font-medium text-gray-600 dark:text-gray-300">{ev.worshipLeader.name}</span>
                            </p>
                        )}
                    </div>
                </div>

                {/* Divider */}
                <div className="border-t border-gray-100 dark:border-gray-700/60" />

                {/* My role */}
                {myRoles.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 shrink-0">My Role</span>
                        {myRoles.map(r => (
                            <span key={r} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
                                <Mic2 size={9} />{r}
                            </span>
                        ))}
                    </div>
                )}

                {/* Songs to prepare */}
                {(solemn || joyful) && (
                    <div className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-1"><Music size={10} />Songs to Prepare</p>
                        {solemn && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/30 rounded-lg text-xs">
                                <Music size={11} className="text-indigo-400 shrink-0" />
                                <span className="text-gray-400 shrink-0">Solemn</span>
                                <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">{toSafeTitle(solemn.title)}</span>
                            </div>
                        )}
                        {joyful && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800/30 rounded-lg text-xs">
                                <Star size={11} className="text-violet-400 shrink-0" />
                                <span className="text-gray-400 shrink-0">Joyful</span>
                                <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">{toSafeTitle(joyful.title)}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Avatar row — mt-auto pins to bottom of card */}
                <div className="mt-auto pt-3 border-t border-gray-100 dark:border-gray-700/60 flex items-center gap-2">
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
                                    className="w-6 h-6 rounded-full object-cover border-2 border-gray-100 dark:border-gray-800"
                                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            ) : (
                                <div key={i} className="w-6 h-6 rounded-full bg-indigo-500 border-2 border-gray-100 dark:border-gray-800 flex items-center justify-center text-[10px] font-bold text-white">
                                    {initials}
                                </div>
                            );
                        })}
                    </div>
                    <p className="text-xs text-gray-400 font-medium">
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

// ── My Tasks card ─────────────────────────────────────────────────────────────
interface TaskItem {
    boardId: string; boardTitle: string;
    cardId: string; cardTitle: string;
    listName: string; completed: boolean;
    assignedBy?: string;
}

function MyTasksCard({
    userName, userEmail, members, onNavigate, onVisibilityChange,
}: {
    userName: string; userEmail: string; members: Member[];
    onNavigate: (view: string, opts?: { boardId?: string; cardId?: string }) => void;
    onVisibilityChange?: (visible: boolean) => void;
}) {
    const [tasks, setTasks] = useState<TaskItem[]>([]);
    const [loading, setLoading] = useState(true);

    // Resolve the member's exact stored name (used in card.members[]) from email
    const resolvedName = useMemo(() => {
        const email = (userEmail || "").toLowerCase().trim();
        const byEmail = members.find(m => m.email?.toLowerCase().trim() === email);
        if (byEmail?.name) return byEmail.name.trim();
        // fallback: use the Firebase display name
        return (userName || "").trim();
    }, [userEmail, members, userName]);

    useEffect(() => {
        if (!resolvedName) { setLoading(false); return; }
        const nameLower = resolvedName.toLowerCase();
        const firstName = nameLower.split(" ")[0];

        // Checks whether a name string in card.members[] belongs to this user
        const isMe = (m: string) => {
            const ml = m.trim().toLowerCase();
            return ml === nameLower || ml.startsWith(firstName + " ") || ml === firstName;
        };

        (async () => {
            try {
                const boardsRes = await fetch("/api/planner/boards").then(r => r.json()).catch(() => []);
                const boards: any[] = Array.isArray(boardsRes) ? boardsRes : [];
                const items: TaskItem[] = [];

                await Promise.all(boards.map(async (b: any) => {
                    try {
                        const [listsRes, cardsRes] = await Promise.all([
                            fetch(`/api/planner/boards/${b.id}/lists`).then(r => r.json()).catch(() => []),
                            fetch(`/api/planner/boards/${b.id}/cards`).then(r => r.json()).catch(() => []),
                        ]);
                        const lists: any[] = Array.isArray(listsRes) ? listsRes : [];
                        const cards: any[] = Array.isArray(cardsRes) ? cardsRes : [];
                        cards.forEach((c: any) => {
                            if ((c.members ?? []).some((m: string) => isMe(m))) {
                                const list = lists.find((l: any) => l.id === c.listId);
                                // Format: "FirstName L." for others, "Self-assigned" for yourself
                                const formatName = (fullName: string) => {
                                    const parts = fullName.trim().split(" ");
                                    if (parts.length === 1) return parts[0];
                                    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
                                };
                                const assignedBy = c.createdBy?.name
                                    ? (isMe(c.createdBy.name) ? "Self-assigned" : formatName(c.createdBy.name))
                                    : "Self-assigned"; // old cards have no createdBy — default to self-assigned
                                items.push({
                                    boardId: b.id, boardTitle: b.title,
                                    cardId: c.id, cardTitle: c.title,
                                    listName: list?.title ?? "",
                                    completed: !!c.completed,
                                    assignedBy,
                                });
                            }
                        });
                    } catch {}
                }));
                setTasks(items);
            } catch {}
            setLoading(false);
        })();
    }, [resolvedName]);

    const todo       = tasks.filter(t => /to.?do|todo/i.test(t.listName));
    const inProgress = tasks.filter(t => /in.?progress/i.test(t.listName));
    const done       = tasks.filter(t => /done|complete/i.test(t.listName));
    const other      = tasks.filter(t => !todo.includes(t) && !inProgress.includes(t) && !done.includes(t));
    const pending    = [...inProgress, ...todo, ...other];
    const ordered    = [...pending, ...done];

    // "All done" state: tasks exist but none are pending
    const allDone = tasks.length > 0 && pending.length === 0;

    // Hide the card entirely when still loading, no tasks, or all done
    if (loading || ordered.length === 0 || allDone) {
        onVisibilityChange?.(false);
        return null;
    }

    onVisibilityChange?.(true);

    return (
        <Tile className="flex flex-col h-full">
            <CardHeader
                icon={<ListTodo size={14} className="text-violet-500" />}
                title="My Tasks"
                action="Ministry Hub"
                onAction={() => onNavigate("planner")}
            />
            <div className="divide-y divide-gray-100 dark:divide-gray-700 overflow-y-auto flex-1" style={{ maxHeight: 240, scrollbarWidth: 'thin' }}>
                {ordered.map(t => {
                    const isIP   = /in.?progress/i.test(t.listName);
                    const isDone = /done|complete/i.test(t.listName);
                    return (
                        <button
                            key={t.cardId}
                            onClick={() => onNavigate("planner", { boardId: t.boardId, cardId: t.cardId })}
                            className="w-full flex items-start gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors text-left group"
                        >
                            {/* Status dot */}
                            <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                                isDone ? 'bg-emerald-500' : isIP ? 'bg-blue-500 animate-pulse' : 'bg-gray-300 dark:bg-gray-600'
                            }`} />
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold truncate ${
                                    isDone ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white group-hover:text-indigo-500 dark:group-hover:text-indigo-400'
                                }`}>{t.cardTitle}</p>
                                <p className="text-sm text-gray-400 truncate mt-0.5">
                                    <span className="font-medium">{t.boardTitle}</span>
                                    {t.assignedBy && (
                                        <span className="ml-1.5">
                                            {" | "}
                                            {t.assignedBy === "Self-assigned"
                                                ? <span className="text-violet-600 dark:text-violet-400">Self-assigned</span>
                                                : <span>Assigned by: <span className="text-gray-600 dark:text-gray-300 font-medium">{t.assignedBy}</span></span>
                                            }
                                        </span>
                                    )}
                                </p>
                            </div>
                            <span className={`shrink-0 text-sm font-bold px-2.5 py-0.5 rounded-full leading-none mt-1 ${
                                isDone ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400'
                                : isIP  ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400'
                                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                            }`}>{isDone ? 'Done' : isIP ? 'In Progress' : 'To Do'}</span>
                        </button>
                    );
                })}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 shrink-0">
                {allDone ? (
                    <p className="text-sm text-emerald-500 font-medium">
                        ✓ {done.length}/{tasks.length} done · all clear
                    </p>
                ) : (
                    <p className="text-sm text-gray-400">
                        {tasks.length} task{tasks.length !== 1 ? 's' : ''} assigned · {inProgress.length} in progress
                    </p>
                )}
            </div>
        </Tile>
    );
}

// ── Top Listeners card ───────────────────────────────────────────────────────
interface ListenerEntry { userId: string; name: string; photo: string; count: number; }

function TopListenersCard({ currentUserId }: { currentUserId: string }) {
    const [entries, setEntries] = useState<ListenerEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/lineup-listens/leaderboard")
            .then(r => r.json())
            .then(data => Array.isArray(data) ? setEntries(data.slice(0, 5)) : [])
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const RANK_STYLES = [
        "bg-amber-400/20 text-amber-600 dark:text-amber-400 border-amber-400/40",   // 🥇 #1 — amber-600 in light for contrast
        "bg-gray-200 dark:bg-gray-300/20 text-gray-600 dark:text-gray-400 border-gray-400/40",      // 🥈 #2
        "bg-orange-400/20 text-orange-600 dark:text-orange-400 border-orange-400/40",// 🥉 #3 — orange-600 in light
        "bg-gray-100 dark:bg-gray-700/20 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-500/20", // #4
        "bg-gray-100 dark:bg-gray-700/20 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-500/20", // #5
    ];
    const RANK_LABELS = ["🥇", "🥈", "🥉", "4", "5"];

    if (loading) return (
        <Tile className="">
            <CardHeader icon={<Headphones size={14} className="text-indigo-500" />} title="Top Song Lineup Listeners" />
            <div className="p-5 space-y-3 animate-pulse">
                {[1,2,3].map(i => (
                    <div key={i} className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700" />
                        <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700" />
                        <div className="flex-1 h-3 bg-gray-200 dark:bg-gray-700 rounded" />
                        <div className="w-10 h-3 bg-gray-200 dark:bg-gray-700 rounded" />
                    </div>
                ))}
            </div>
        </Tile>
    );

    if (entries.length === 0) return (
        <Tile className="">
            <CardHeader icon={<Headphones size={14} className="text-indigo-500" />} title="Top Song Lineup Listeners" />
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-gray-400 px-5 text-center">
                <Headphones size={22} className="opacity-30" />
                <p className="text-sm font-medium">No listens recorded yet</p>
                <p className="text-xs text-gray-400/70">Finish a song in the Lineup Player to appear here</p>
            </div>
        </Tile>
    );

    return (
        <Tile className="">
            <CardHeader icon={<Headphones size={14} className="text-indigo-500" />} title="Top Song Lineup Listeners" />
            <div className="divide-y divide-gray-100 dark:divide-gray-700 flex-1 overflow-y-auto scrollbar-hide">
                {entries.map((e, i) => {
                    const isMe = e.userId === currentUserId;
                    const init = (e.name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
                    return (
                        <div key={e.userId}
                            className={`flex items-center gap-3 px-5 py-3 transition-colors ${
                                isMe ? "bg-indigo-50 dark:bg-indigo-900/15 border-l-2 border-indigo-400 dark:border-indigo-600" : "hover:bg-gray-50 dark:hover:bg-gray-700/30"
                            }`}>
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-black border shrink-0 ${RANK_STYLES[i]}`}>
                                {RANK_LABELS[i]}
                            </div>
                            {e.photo?.startsWith("http") ? (
                                <img src={e.photo} alt={e.name}
                                    className="w-7 h-7 rounded-full object-cover border-2 border-gray-100 dark:border-gray-800 shrink-0" />
                            ) : (
                                <div className="w-7 h-7 rounded-full bg-indigo-500 border-2 border-gray-100 dark:border-gray-800 flex items-center justify-center text-sm font-bold text-white shrink-0">
                                    {init}
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold truncate ${
                                    isMe ? "text-indigo-600 dark:text-indigo-400" : "text-gray-900 dark:text-white"
                                }`}>
                                    {isMe ? `${e.name.split(" ")[0]} (You)` : e.name}
                                </p>
                            </div>
                            <span className="shrink-0 text-sm font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300">
                                {e.count}x listened
                            </span>
                        </div>
                    );
                })}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 shrink-0">
                <p className="text-sm text-gray-400">Auto-tracked · updated when songs finish playing</p>
            </div>
        </Tile>
    );
}

// ── Main AdminDashboard ───────────────────────────────────────────────────────
export default function AdminDashboard({
    userName, userEmail, userId = "", userPhoto, songs, members, schedules, notes, onNavigate,
    broadcasts: broadcastsProp, pendingUsers: pendingUsersProp, loadingExtra = false,
    canAddSong, canWriteSchedule, canAddMember, userRole = "admin",
    onOpenLineup, lineupTrackCount = 0, isLineupOpen = false, isLibraryOpen = false,
    isAdmin = false,
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
    const [hasActiveTasks, setHasActiveTasks] = useState(true); // start true to avoid layout flash
    const [roleBadgeExpanded, setRoleBadgeExpanded] = useState(false);
    const roleBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
            if (!iso || isNaN(d.getTime())) return "Recently";
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            const yy = String(d.getFullYear()).slice(2);
            let h = d.getHours(); const ampm = h >= 12 ? "PM" : "AM";
            h = h % 12 || 12;
            const min = String(d.getMinutes()).padStart(2, "0");
            return `${mm}-${dd}-${yy} | ${h}:${min} ${ampm}`;
        } catch { return "Recently"; }
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
        <div className="space-y-5 p-0">
            {/* ── Hero Header ─────────────────────────────────────────────── */}
            <div className="relative rounded-2xl overflow-hidden bg-white dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700/60 shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_20px_-2px_rgba(0,0,0,0.35)]">
                {/* Gradient accent line at top */}
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500" />
                {/* Subtle glow wash */}
                <div className="absolute inset-y-0 left-0 w-56 bg-gradient-to-r from-indigo-500/[0.04] to-transparent pointer-events-none" />

                {/* Mobile layout: two rows stacked. Desktop: side-by-side */}
                <div className="relative flex flex-col gap-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-5">

                    {/* ── ROW 1 (mobile): Avatar + text. Role badge absolute top-right ── */}
                    <div className="flex items-center gap-4 min-w-0 px-5 pt-5 pb-3 sm:p-0">
                        {/* Circular avatar */}
                        <div className="relative shrink-0">
                            {userPhoto ? (
                                <img src={userPhoto} alt={userName}
                                    className="w-16 h-16 rounded-full object-cover ring-2 ring-indigo-500/40 shadow-lg" />
                            ) : (
                                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg ring-2 ring-indigo-500/40">
                                    <span className="text-2xl font-black text-white">{first[0]}</span>
                                </div>
                            )}
                            <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-gray-800" />
                        </div>
                        {/* Greeting / Name / Date */}
                        <div className="min-w-0 pr-20 sm:pr-0">
                            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-0.5">{greeting()}</p>
                            <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-tight tracking-tight">
                                {first} 👋
                            </h1>
                            <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5 font-medium">
                                {new Date().toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                            </p>
                        </div>
                    </div>

                    {/* Role icon badge — mobile only, clickable smooth pill expand */}
                    {(() => {
                        const ri = ROLE_ICON[userRole] ?? ROLE_ICON.admin;
                        const rs = ROLE_STYLE[userRole] ?? ROLE_STYLE.admin;
                        const ease = "cubic-bezier(0.25, 0.46, 0.45, 0.94)";
                        return (
                            <div className="absolute top-3 right-3 sm:hidden">
                                <button
                                    style={{
                                        display: "flex", alignItems: "center",
                                        height: 36,
                                        maxWidth: roleBadgeExpanded ? 200 : 36,
                                        overflow: "hidden",
                                        borderRadius: 999,
                                        padding: "1.5px",
                                        background: `linear-gradient(135deg, ${ri.gradA}, ${ri.gradB})`,
                                        transition: `max-width 0.42s ${ease}`,
                                        cursor: "pointer",
                                        border: "none",
                                        outline: "none",
                                        whiteSpace: "nowrap",
                                    }}
                                    onClick={() => {
                                        if (roleBadgeTimerRef.current) clearTimeout(roleBadgeTimerRef.current);
                                        setRoleBadgeExpanded(prev => {
                                            if (!prev) {
                                                roleBadgeTimerRef.current = setTimeout(() => setRoleBadgeExpanded(false), 4000);
                                                return true;
                                            }
                                            return false;
                                        });
                                    }}
                                >
                                    <div style={{
                                        display: "flex", alignItems: "center", gap: 6,
                                        width: "100%", height: "100%",
                                        borderRadius: 999,
                                        background: "#111827",
                                        paddingLeft: 7,
                                        paddingRight: roleBadgeExpanded ? 10 : 7,
                                        transition: `padding-right 0.42s ${ease}`,
                                        overflow: "hidden",
                                    }}>
                                        <span style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                            <ri.Icon size={14} className={ri.iconColor} strokeWidth={1.8} />
                                        </span>
                                        <span
                                            className={`text-[11px] font-bold ${ri.iconColor}`}
                                            style={{
                                                opacity: roleBadgeExpanded ? 1 : 0,
                                                transition: roleBadgeExpanded ? "opacity 0.28s ease 0.22s" : "opacity 0.12s ease",
                                                overflow: "hidden",
                                                flexShrink: 0,
                                            }}
                                        >{rs.label}</span>
                                    </div>
                                </button>
                            </div>
                        );
                    })()}


                    {/* ── ROW 2 (mobile): Full-width 50/50 buttons. Desktop: right section ── */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:shrink-0 sm:gap-3 px-5 pb-5 sm:p-0">


                        {/* Buttons: dynamic grid on mobile (2-col with lineup, 1-col without), flex on desktop */}
                        <div className={`grid gap-3 sm:flex sm:gap-2 ${onOpenLineup && lineupTrackCount > 0 ? "grid-cols-2" : "grid-cols-1"}`}>

                            {/* Lineup button — only rendered when available */}
                            {onOpenLineup && lineupTrackCount > 0 && (
                                <div className="relative">
                                    {!isLineupOpen && !isLibraryOpen && (
                                        <span className="absolute inset-0 rounded-2xl bg-indigo-500/30 animate-ping pointer-events-none" />
                                    )}
                                    <button
                                        onClick={isLineupOpen || isLibraryOpen ? undefined : onOpenLineup}
                                        disabled={isLineupOpen || isLibraryOpen}
                                        title={isLineupOpen ? "Now Playing" : isLibraryOpen ? "Close Library Player first" : "Lineup Available"}
                                        className={`relative w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
                                            isLineupOpen || isLibraryOpen
                                                ? "bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                                                : "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md hover:shadow-lg hover:scale-105 active:scale-95"
                                        }`}
                                    >
                                        <ListMusic size={15} /><span>Lineup</span>
                                    </button>
                                </div>
                            )}

                            {/* Admin Panel (admin) OR Calendar (non-admin) — right half */}
                            {isAdmin ? (
                                <button
                                    onClick={() => onNavigate("admin")}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold bg-gray-700/60 dark:bg-gray-700/70 border border-gray-600/40 dark:border-gray-600/50 text-gray-100 dark:text-gray-200 hover:bg-gray-600/60 dark:hover:bg-gray-700 transition-all relative"
                                >
                                    <Shield size={15} className="text-amber-400" /><span>Admin Panel</span>
                                    {!loadingExtra && pendingUsers.length > 0 && (
                                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-black px-1 shadow">
                                            {pendingUsers.length}
                                        </span>
                                    )}
                                </button>
                            ) : (
                                <button
                                    onClick={() => onNavigate("schedule")}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold bg-gray-700/60 dark:bg-gray-700/70 border border-gray-600/40 dark:border-gray-600/50 text-gray-100 dark:text-gray-200 hover:bg-gray-600/60 dark:hover:bg-gray-700 transition-all"
                                >
                                    <Calendar size={15} className="text-indigo-400" /><span>Calendar</span>
                                </button>
                            )}

                        </div>
                    </div>

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
              .scrollbar-hide::-webkit-scrollbar { display: none; }
              .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
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
                                            try { localStorage.setItem(`wf_bday_sent_${userId}_${memberId}_${today}`, "1"); } catch { /* noop */ }
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

            {/* ── Top section — 3-col desktop: [Verse | Tasks | 2×2 stats] ── */}
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1.5fr_1.5fr] gap-4">
                {/* LEFT — Daily Bible Verse: spans 2 cols when tasks are hidden */}
                <div className={hasActiveTasks ? "" : "lg:col-span-2"}>
                  <VerseOfTheDay userId={userId} userName={userName.split(" ")[0] || userName} userPhoto="" />
                </div>
                {/* CENTER — My Tasks */}
                <MyTasksCard userName={userName} userEmail={userEmail} members={members} onNavigate={onNavigate} onVisibilityChange={setHasActiveTasks} />
                {/* RIGHT — 2×2 metric tiles */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="stagger-1">
                    <MetricTile label="Songs" value={songs.length} sub={`${songsUsed} in services`}
                        iconBg="bg-indigo-100 dark:bg-indigo-900/40" icon={<Music size={16} className="text-indigo-600 dark:text-indigo-400" />}
                        onClick={() => onNavigate("songs")} />
                    </div>
                    <div className="stagger-2">
                    <MetricTile label="Members" value={members.length} sub={`${members.filter(m => m.status !== "inactive").length} active`}
                        iconBg="bg-violet-100 dark:bg-violet-900/40" icon={<Users size={16} className="text-violet-600 dark:text-violet-400" />}
                        onClick={() => onNavigate("members")} />
                    </div>
                    <div className="stagger-3">
                    <MetricTile label="Events" value={totalEvents} sub={`${upcomingEvents.length} upcoming`}
                        iconBg="bg-emerald-100 dark:bg-emerald-900/40" icon={<Zap size={16} className="text-emerald-600 dark:text-emerald-400" />}
                        onClick={() => onNavigate("schedule")} />
                    </div>
                    <div className="stagger-4">
                    <MetricTile label="Issues" value={openBugs + openFeqs} sub={`${openBugs} bugs · ${openFeqs} req`}
                        iconBg="bg-amber-100 dark:bg-amber-900/40" icon={<AlertCircle size={16} className="text-amber-600 dark:text-amber-400" />} />
                    </div>
                </div>
            </div>



            {/*
             * BENTO GRID — Design System v2.0 responsive breakpoints:
             * Mobile  (0–639px):   1-col, vertical stack
             * Tablet  (640–1023px): 2-col grid (sm:grid-cols-2)
             * Desktop (1024–1279px): 2-col grid (lg:grid-cols-2)
             * Wide    (1280px+):   3-col grid (xl:grid-cols-3)
             */}
            <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">

                {/* ── ROW 1 ─────────────────────────── */}

                {/* Top Song Lineup Listeners — height is self-managed (collapses when empty) */}
                <div className="stagger-3"><TopListenersCard currentUserId={userId} /></div>

                {/* Church Events */}
                <div className="stagger-4 h-[360px]"><NextServiceTile ev={nextEvent} songs={songs} members={members} myMemberId={myMemberId} onClick={() => onNavigate("schedule")} /></div>

                {/* Upcoming Events — current + next month, including birthdays */}
                {(() => {
                    const now = new Date(); now.setHours(0,0,0,0);
                    const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0); // last day of next month

                    // Schedule events in window
                    const windowEvents = schedules
                        .filter(s => { try { const d = new Date(s.date + "T00:00:00"); return d >= now && d <= endOfNextMonth; } catch { return false; } })
                        .sort((a, b) => a.date.localeCompare(b.date))
                        .map(s => ({ id: s.id, date: s.date, label: s.eventName ?? "Event", sub: isServiceEvent(s) ? (s.worshipLeader?.name ? `Leader: ${s.worshipLeader.name}` : "No leader") : ((s as any).created_by_name ? `By: ${(s as any).created_by_name.split(" ")[0]}` : "Custom event"), kind: "event" as const }));

                    // Birthdays in current + next month window
                    const bdayItems = members
                        .filter(m => m.birthdate && m.birthdate.length >= 5)
                        .flatMap(m => {
                            const mmdd = m.birthdate!.slice(5); // "MM-DD"
                            const years = now.getMonth() === 11 ? [now.getFullYear(), now.getFullYear() + 1] : [now.getFullYear()];
                            return years.map(yr => {
                                const iso = `${yr}-${mmdd}`;
                                try {
                                    const d = new Date(iso + "T00:00:00");
                                    if (d >= now && d <= endOfNextMonth) return { id: `bday-${m.id}-${yr}`, date: iso, label: `🎂 ${m.name?.split(" ")[0]}'s Birthday`, sub: m.name ?? "", kind: "birthday" as const };
                                } catch {}
                                return null;
                            }).filter(Boolean);
                        });

                    const merged = [...windowEvents, ...(bdayItems as any[])]
                        .sort((a, b) => a.date.localeCompare(b.date));

                    const first5 = merged.slice(0, 5);
                    const overflow = merged.slice(5);

                    return (
                        <div className="h-[360px]"><Tile className="">
                            <CardHeader icon={<Clock size={14} className="text-indigo-500" />} title="Upcoming Events" action="Full calendar" onAction={() => onNavigate("schedule")} />
                            <div className="divide-y divide-gray-100 dark:divide-gray-700 flex-1 overflow-y-auto scrollbar-hide">
                                {first5.length === 0 ? (
                                    <div className="flex items-center gap-3 px-5 py-4"><Calendar size={16} className="text-gray-300" /><p className="text-sm text-gray-400">Nothing this month or next</p></div>
                                ) : first5.map((ev, i) => {
                                    const d = new Date(ev.date + "T00:00:00");
                                    const isBday = ev.kind === "birthday";
                                    return (
                                        <div key={ev.id} className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${i === 0 ? "bg-indigo-50/50 dark:bg-indigo-900/10" : ""}`}>
                                            <div className={`flex flex-col items-center justify-center w-10 h-10 rounded-xl shrink-0 ${isBday ? "bg-pink-500 text-white" : i === 0 ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}>
                                                <p className="text-[10px] font-bold uppercase opacity-80">{d.toLocaleDateString("en", { month: "short" })}</p>
                                                <p className="text-sm font-black leading-none">{d.getDate()}</p>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{ev.label}</p>
                                                <p className="text-sm text-gray-400 truncate">{ev.sub}</p>
                                            </div>
                                            <span className={`text-sm font-semibold shrink-0 ${i === 0 ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400"}`}>{daysUntil(ev.date)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            {overflow.length > 0 && (
                                <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 shrink-0">
                                    <p className="text-sm font-semibold text-gray-400 mb-2">+{overflow.length} more</p>
                                    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                                        {overflow.map(ev => {
                                            const d = new Date(ev.date + "T00:00:00");
                                            const isBday = ev.kind === "birthday";
                                            return (
                                                <div key={ev.id} className={`shrink-0 flex flex-col items-center px-3 py-2 rounded-xl border text-center min-w-[68px] ${isBday ? "bg-pink-500/10 border-pink-400/30" : "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800/30"}`}>
                                                    <p className="text-[10px] font-bold uppercase text-gray-400">{d.toLocaleDateString("en", { month: "short" })}</p>
                                                    <p className={`text-base font-black leading-tight ${isBday ? "text-pink-500" : "text-indigo-600 dark:text-indigo-400"}`}>{d.getDate()}</p>
                                                    <p className="text-sm text-gray-400 truncate max-w-[60px]">{ev.label.replace("🎂 ", "").split("'")[0]}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </Tile></div>
                    );
                })()}


                {/* ── ROW 2 ─────────────────────────── */}

                {/* Recently Added Songs */}
                <div className="h-[360px]"><Tile className="" onClick={() => onNavigate("songs")}>
                    <CardHeader icon={<TrendingUp size={16} className="text-violet-500" />} title="Recently Added Songs" action="Library" onAction={() => onNavigate("songs")} />
                    {recentSongs.length === 0 ? (
                        <div className="flex flex-col items-center py-10 gap-3">
                            <BookOpen size={24} className="text-indigo-300 opacity-50" />
                            <p className="text-sm text-gray-400">No songs yet</p>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto scrollbar-hide divide-y divide-gray-100 dark:divide-gray-700/60">
                            {recentSongs.map(s => (
                                <div key={s.id} className="flex items-center gap-3 px-6 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors">
                                    <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                                        <Music size={14} className="text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate tracking-tight">{s.title}</p>
                                        <p className="text-sm text-gray-400 truncate mt-0.5">{s.artist}</p>
                                    </div>
                                    {s.created_at && <p className="text-sm text-gray-400 shrink-0 font-medium">{relDate(s.created_at)}</p>}
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="px-6 py-3.5 border-t border-gray-100/80 dark:border-gray-700/60 bg-gray-50/60 dark:bg-gray-800/40 shrink-0">
                        <p className="text-sm text-gray-400 font-medium">{songs.length} songs · {songsUsed} used in services</p>
                    </div>
                </Tile></div>

                {/* Team by Role */}
                <div className="h-[360px]"><Tile className="" onClick={() => onNavigate("members")}>
                    <CardHeader icon={<Users size={16} className="text-violet-500" />} title="Team by Role" action="All members" onAction={() => onNavigate("members")} />
                    <div className="flex-1 overflow-y-auto scrollbar-hide px-6 py-5 space-y-4">
                        {roleGroups.length === 0 ? (
                            <p className="text-sm text-gray-400">No members yet</p>
                        ) : roleGroups.slice(0, 5).map(([role, count]) => (
                            <div key={role}>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate tracking-tight">{role}</span>
                                    <span className="text-sm font-black text-gray-900 dark:text-white shrink-0 ml-2 tabular-nums">{count}</span>
                                </div>
                                <div className="h-1.5 bg-gray-100 dark:bg-gray-700/80 rounded-full overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500"
                                        style={{ width: members.length > 0 ? `${Math.round(count / members.length * 100)}%` : "0%" }} />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="px-6 py-3.5 border-t border-gray-100/80 dark:border-gray-700/60 bg-gray-50/60 dark:bg-gray-800/40 shrink-0">
                        <p className="text-sm text-gray-400 font-medium">{members.length} total team members</p>
                    </div>
                </Tile></div>

                {/* What's New */}
                <div className="h-[360px]"><Tile className="">
                    <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700/60 shrink-0 gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            {/* STANDARD icon chip w-8 h-8 */}
                            <span className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                                <Megaphone size={16} className="text-amber-500" />
                            </span>
                            <h2 className="font-bold text-gray-900 dark:text-white text-base tracking-tight truncate">
                                {latestBroadcast?.title ?? "What's New in WorshipFlow"}
                            </h2>
                        </div>
                        <button onClick={() => onNavigate("admin")} className="text-sm text-indigo-500 hover:text-indigo-400 flex items-center gap-1 font-medium transition-colors shrink-0 mt-0.5">
                            Manage <ChevronRight size={13} />
                        </button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
                        {loadingExtra ? (
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
                                    <span className="text-sm text-gray-400 font-medium block mb-2">Updated: {formatBroadcastDate(latestBroadcast.createdAt)}</span>
                                )}
                                <p className="text-base text-gray-500 dark:text-gray-400 mb-3">{latestBroadcast.message}</p>
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
                </Tile></div>


            </div>

        </div>
    );
}

