import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./AuthContext";
import { UserPlus, Trash2, Shield, Users, Loader2, Check, X, Clock, UserCheck, Pencil, ShieldCheck, ShieldAlert, Megaphone, Plus, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Eye, Sparkles, User, Guitar, Mic2, ClipboardList, Sliders, Wrench, ThumbsUp, FlaskConical, Mail, Activity, Wifi, WifiOff, Timer, RefreshCw } from "lucide-react";
import AutoTextarea from "./AutoTextarea";

interface ApprovedUser {
    email: string;
    role: string;
    approvedAt: string;
}

interface PendingUser {
    email: string;
    name: string;
    photo: string;
    requestedAt: string;
}

const ROLE_OPTIONS = [
    { value: "member", label: "Member", color: "text-gray-500 dark:text-gray-400", bg: "bg-gray-100 dark:bg-gray-700", icon: <User size={12} /> },
    { value: "musician", label: "Musician", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/20", icon: <Guitar size={12} /> },
    { value: "leader", label: "Worship Leader", color: "text-indigo-500 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-900/30", icon: <Mic2 size={12} /> },
    { value: "planning_lead", label: "Planning Lead", color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-900/20", icon: <ClipboardList size={12} /> },
    { value: "audio_tech", label: "Audio / Tech", color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-900/20", icon: <Sliders size={12} /> },
    { value: "admin", label: "Admin", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20", icon: <Shield size={12} /> },
    { value: "qa_specialist", label: "QA Specialist", color: "text-fuchsia-600 dark:text-fuchsia-400", bg: "bg-fuchsia-50 dark:bg-fuchsia-900/20", icon: <FlaskConical size={12} /> },
];

function RoleBadge({ role }: { role: string }) {
    const opt = ROLE_OPTIONS.find(r => r.value === role) ?? ROLE_OPTIONS[0];
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${opt.bg} ${opt.color}`}>
            {opt.icon} {opt.label}
        </span>
    );
}

function fmtBirthdate(ymd: string): string {
    if (!ymd) return "";
    const MONTHS = ["January","February","March","April","May","June",
                    "July","August","September","October","November","December"];
    const [y, m, d] = ymd.split("-").map(Number);
    return `${MONTHS[m-1]} ${d}, ${y}`;
}

function BirthdayTab({ members }: { members: any[] }) {
    const withBday    = members.filter(m => m.birthdate);
    const withoutBday = members.filter(m => !m.birthdate);
    return (
        <div className="space-y-5">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800/40 rounded-2xl px-4 py-3 text-center">
                    <p className="text-2xl font-bold text-pink-600 dark:text-pink-400">{withBday.length}</p>
                    <p className="text-xs text-pink-500 dark:text-pink-400 mt-0.5">Submitted birthdays</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 text-center">
                    <p className="text-2xl font-bold text-gray-500 dark:text-gray-400">{withoutBday.length}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Pending submission</p>
                </div>
            </div>

            {/* Submitted */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">🎂 Birthday Submissions</h3>
                    <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">{withBday.length}</span>
                </div>
                {withBday.length === 0 ? (
                    <p className="text-center py-8 text-sm text-gray-400">No birthdays submitted yet.</p>
                ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                        {withBday.map(m => (
                            <li key={m.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                {m.photo
                                    ? <img src={m.photo} alt={m.name} className="w-9 h-9 rounded-full object-cover shrink-0 ring-2 ring-pink-300 dark:ring-pink-700" />
                                    : <div className="w-9 h-9 rounded-full bg-pink-100 dark:bg-pink-900/40 flex items-center justify-center text-pink-600 dark:text-pink-400 font-bold text-sm shrink-0">{(m.name||"?")[0].toUpperCase()}</div>
                                }
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{m.name}</p>
                                    <p className="text-xs text-gray-400 truncate">{m.email}</p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-sm font-semibold text-pink-600 dark:text-pink-400">{fmtBirthdate(m.birthdate)}</p>
                                    {m.updated_at && <p className="text-[10px] text-gray-400">Saved {new Date(m.updated_at).toLocaleDateString("en", { month:"short", day:"numeric", year:"numeric" })}</p>}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Pending */}
            {withoutBday.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400">⏳ Awaiting Birthday</h3>
                    </div>
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                        {withoutBday.map(m => (
                            <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                                {m.photo
                                    ? <img src={m.photo} alt={m.name} className="w-7 h-7 rounded-full object-cover shrink-0 opacity-60" />
                                    : <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 font-bold text-xs shrink-0">{(m.name||"?")[0].toUpperCase()}</div>
                                }
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{m.name}</p>
                                    <p className="text-xs text-gray-400 truncate">{m.email}</p>
                                </div>
                                <span className="text-[10px] text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full font-semibold">Pending</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

export default function AdminPanel({
    onToast,
    onConfirm,
}: {
    onToast?: (type: "success" | "error" | "info" | "warning", msg: string) => void;
    onConfirm?: (msg: string, onOk: () => void) => void;
}) {
    const { isAdmin } = useAuth();
    const [activeTab, setActiveTab] = useState<"team" | "broadcasts" | "birthdays" | "activity">("team");
    const [members, setMembers] = useState<any[]>([]);
    const [users, setUsers] = useState<ApprovedUser[]>([]);
    const [pending, setPending] = useState<PendingUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [newEmail, setNewEmail] = useState("");
    const [newRole, setNewRole] = useState("member");
    const [adding, setAdding] = useState(false);
    const [approvingEmail, setApprovingEmail] = useState<string | null>(null);
    const [isSendingBlast, setIsSendingBlast] = useState(false);

    // ── Role-edit state ──────────────────────────────────────────────────────
    const [editingRoleFor, setEditingRoleFor] = useState<string | null>(null);
    const [pendingRole, setPendingRole] = useState<string>("");
    const [savingRole, setSavingRole] = useState(false);

    // ── Broadcasts state ─────────────────────────────────────────────────────
    const [broadcasts, setBroadcasts] = useState<any[]>([]);
    const [bLoading, setBLoading] = useState(false);
    const [bType, setBType] = useState<"maintenance" | "whats_new">("whats_new");
    const [bTitle, setBTitle] = useState("");
    const [bMessage, setBMessage] = useState("");
    const [bBullets, setBBullets] = useState(["", "", ""]);
    const [bTargetAll, setBTargetAll] = useState(true);
    const [bSelected, setBSelected] = useState<string[]>([]);
    const [bCreating, setBCreating] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [bAutoGenerating, setBAutoGenerating] = useState(false);
    const [previewBroadcast, setPreviewBroadcast] = useState<any | null>(null);
    const [editingBroadcastId, setEditingBroadcastId] = useState<string | null>(null);

    const autoGenerate = async () => {
        setBAutoGenerating(true);
        try {
            if (bType === "maintenance") {
                // Maintenance — fill with a friendly pre-written template instantly
                const templates = [
                    {
                        title: "Scheduled Maintenance In Progress",
                        message: "We're currently making improvements to WorshipFlow. The app will be back shortly — thank you for your patience!",
                    },
                    {
                        title: "Brief Maintenance Underway",
                        message: "WorshipFlow is undergoing a quick update to bring you a better experience. We'll be back online very soon!",
                    },
                    {
                        title: "App Update In Progress",
                        message: "We're upgrading WorshipFlow right now. Hang tight — exciting improvements are coming your way!",
                    },
                ];
                // Rotate through templates based on current time so it's not always the same
                const pick = templates[Math.floor(Date.now() / 1000) % templates.length];
                setBTitle(pick.title);
                setBMessage(pick.message);
                setBBullets([]);
            } else {
                // What's New — pass whatever the user typed in the message field as a topic hint
                const topic = bMessage.trim();
                const url = topic
                    ? `/api/release-notes?topic=${encodeURIComponent(topic)}`
                    : "/api/release-notes";
                const res = await fetch(url);
                const data = await res.json();
                if (data.title) setBTitle(data.title);
                if (data.message) setBMessage(data.message);
                if (data.bulletPoints?.length) setBBullets(data.bulletPoints);
            }
        } catch { /* silent fail */ }
        finally { setBAutoGenerating(false); }
    };

    const fetchBroadcasts = async () => {
        setBLoading(true);
        try {
            const res = await fetch("/api/broadcasts/all");
            setBroadcasts(await res.json());
        } catch { setBroadcasts([]); }
        finally { setBLoading(false); }
    };

    const toggleBroadcast = async (id: string, active: boolean) => {
        try {
            await fetch(`/api/broadcasts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }) });
            onToast?.("success", active ? "Broadcast activated." : "Broadcast deactivated.");
            fetchBroadcasts();
        } catch { onToast?.("error", "Failed to update broadcast."); }
    };

    const deleteBroadcast = async (id: string) => {
        const doDelete = async () => {
            try {
                await fetch(`/api/broadcasts/${id}`, { method: "DELETE" });
                onToast?.("success", "Broadcast deleted.");
                fetchBroadcasts();

            } catch { onToast?.("error", "Failed to delete broadcast."); }
        };
        if (onConfirm) onConfirm("Delete this broadcast?", doDelete);
        else doDelete();
    };

    const createBroadcast = async () => {
        if (!bTitle.trim()) return;
        setBCreating(true);
        const targetEmails = bTargetAll ? ["__all__"] : bSelected;
        if (!bTargetAll && targetEmails.length === 0) { setBCreating(false); return; }
        const bulletPoints = bBullets.filter(b => b.trim());
        try {
            if (editingBroadcastId) {
                await fetch(`/api/broadcasts/${editingBroadcastId}`, {
                    method: "PUT", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ type: bType, title: bTitle, message: bMessage, bulletPoints, targetEmails }),
                });
                onToast?.("success", "Broadcast updated!");
            } else {
                await fetch("/api/broadcasts", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ type: bType, title: bTitle, message: bMessage, bulletPoints, targetEmails }),
                });
                onToast?.("success", "Broadcast created!");
            }
        } catch { onToast?.("error", "Failed to save broadcast."); }
        setBTitle(""); setBMessage(""); setBBullets(["", "", ""]); setBTargetAll(true); setBSelected([]);
        setShowForm(false); setBCreating(false); setEditingBroadcastId(null);
        fetchBroadcasts();
    };


    const openEditBroadcast = (b: any) => {
        setEditingBroadcastId(b.id);
        setBType(b.type ?? "whats_new");
        setBTitle(b.title ?? "");
        setBMessage(b.message ?? "");
        setBBullets(b.bulletPoints?.length ? b.bulletPoints : [""]);
        setBTargetAll(b.targetEmails?.includes("__all__") ?? true);
        setBSelected(b.targetEmails?.includes("__all__") ? [] : (b.targetEmails ?? []));
        setShowForm(true);
    };

    const toggleUserSelect = (email: string) =>
        setBSelected(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [usersRes, pendingRes] = await Promise.all([
                fetch("/api/auth/users"),
                fetch("/api/auth/pending"),
            ]);
            setUsers(await usersRes.json());
            setPending(await pendingRes.json());
        } catch { setUsers([]); setPending([]); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchAll(); fetchBroadcasts(); }, []);
    useEffect(() => {
        if (activeTab === "birthdays" && members.length === 0) {
            fetch("/api/members").then(r => r.json()).then(setMembers).catch(() => {});
        }
    }, [activeTab]);

    // ── Activity Monitor state ────────────────────────────────────────────────
    const [activityData, setActivityData] = useState<{ online: any[]; lastLogins: any[] }>({ online: [], lastLogins: [] });
    const [activityLoading, setActivityLoading] = useState(false);
    const activityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchActivity = useCallback(async () => {
        try {
            const res = await fetch("/api/activity/sessions");
            const data = await res.json();
            setActivityData(data);
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        if (activeTab !== "activity") {
            if (activityIntervalRef.current) clearInterval(activityIntervalRef.current);
            return;
        }
        setActivityLoading(true);
        fetchActivity().finally(() => setActivityLoading(false));
        activityIntervalRef.current = setInterval(fetchActivity, 30_000);
        return () => { if (activityIntervalRef.current) clearInterval(activityIntervalRef.current); };
    }, [activeTab, fetchActivity]);


    const approve = async (email: string, role = "member", fromPending = false) => {
        if (fromPending) setApprovingEmail(email);
        else setAdding(true);
        try {
            await fetch("/api/auth/approve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, role }),
            });
            if (!fromPending) { setNewEmail(""); setNewRole("member"); }
            onToast?.("success", `${email} approved as ${role}.`);
            fetchAll();
        } catch { onToast?.("error", "Failed to approve. Try again."); }
        finally { setApprovingEmail(null); setAdding(false); }
    };

    const revokeUser = async (email: string) => {
        const doRevoke = async () => {
            try {
                await fetch("/api/auth/revoke", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email }),
                });
                onToast?.("success", `${email} access removed.`);
                fetchAll();
            } catch { onToast?.("error", "Failed to revoke. Try again."); }
        };
        if (onConfirm) onConfirm(`Remove access for ${email}?`, doRevoke);
        else doRevoke();
    };

    const dismissPending = async (email: string) => {
        try {
            await fetch("/api/auth/revoke-pending", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            setPending(p => p.filter(u => u.email !== email));
        } catch { onToast?.("error", "Failed to dismiss request."); }
    };

    const startEditRole = (u: ApprovedUser) => {
        setEditingRoleFor(u.email);
        setPendingRole(u.role);
    };

    const cancelEditRole = () => {
        setEditingRoleFor(null);
        setPendingRole("");
    };

    const saveRole = async (email: string) => {
        setSavingRole(true);
        try {
            const res = await fetch("/api/auth/update-role", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, role: pendingRole }),
            });
            if (!res.ok) throw new Error("Failed");
            // optimistic update
            setUsers(prev => prev.map(u => u.email === email ? { ...u, role: pendingRole } : u));
            onToast?.("success", `Role updated to "${ROLE_OPTIONS.find(r => r.value === pendingRole)?.label}" for ${email}.`);
            setEditingRoleFor(null);
        } catch {
            onToast?.("error", "Failed to update role. Try again.");
        } finally {
            setSavingRole(false);
        }
    };

    const handleWelcomeBlast = async () => {
        if (isSendingBlast) return;
        setIsSendingBlast(true);
        try {
            const res = await fetch("/api/welcome-blast", { method: "POST" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            onToast?.("success", `🎉 Welcome email sent to ${data.sent} members!`);
        } catch (err: any) {
            onToast?.("error", err.message || "Failed to send welcome blast.");
        } finally {
            setIsSendingBlast(false);
        }
    };

    if (!isAdmin) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
                <Shield size={40} className="opacity-40" />
                <p className="text-sm">Admin access required.</p>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
            {/* Header + Tab switcher */}
            <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Shield size={20} className="text-indigo-500" /> Admin Panel
                </h2>
                <p className="text-sm text-gray-400 mt-1">Manage team access and app announcements.</p>
                <div className="flex gap-1 mt-4 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit flex-wrap">
                    <button onClick={() => setActiveTab("team")} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === "team" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                        <span className="flex items-center gap-1.5"><Users size={14} /> Team Access</span>
                    </button>
                    <button onClick={() => setActiveTab("broadcasts")} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === "broadcasts" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                        <span className="flex items-center gap-1.5"><Megaphone size={14} /> Broadcasts {broadcasts.filter(b => b.active).length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />}</span>
                    </button>
                    <button onClick={() => setActiveTab("birthdays")} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === "birthdays" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                        <span className="flex items-center gap-1.5">🎂 Birthdays</span>
                    </button>
                    <button onClick={() => setActiveTab("activity")} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === "activity" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                        <span className="flex items-center gap-1.5">
                            <Activity size={14} /> Activity
                            {activityData.online.length > 0 && (
                                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-bold">{activityData.online.length}</span>
                            )}
                        </span>
                    </button>
                </div>
            </div>

            {/* ── BROADCASTS TAB ─────────────────────────────────────────── */}
            {activeTab === "broadcasts" && (
                <div className="space-y-4">
                    {/* Create button */}
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-500 dark:text-gray-400">{broadcasts.length === 0 ? "No broadcasts yet." : `${broadcasts.length} broadcast${broadcasts.length !== 1 ? "s" : ""}`}</p>
                        <button
                            onClick={() => setShowForm(f => !f)}
                            disabled={showForm}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl transition-all"
                        >
                            <Plus size={14} /> Create Broadcast
                        </button>
                    </div>

                    {/* Create Form */}
                    {showForm && (
                        <div className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Create Broadcast</h3>
                                <div className="flex items-center gap-2">
                                    {/* 👁️ Preview — enabled only when there's content */}
                                    <button
                                        onClick={() => bTitle.trim() && setPreviewBroadcast({ type: bType, title: bTitle, message: bMessage, bulletPoints: bBullets })}
                                        disabled={!bTitle.trim()}
                                        title="Preview"
                                        className="p-1.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-indigo-500 hover:border-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                    >
                                        <Eye size={14} />
                                    </button>
                                    {/* ✨ Auto-generate — works for both types */}
                                    <button
                                        onClick={autoGenerate}
                                        disabled={bAutoGenerating}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-60 text-white transition-all active:scale-95"
                                    >
                                        {bAutoGenerating
                                            ? <><Loader2 size={12} className="animate-spin" /> Generating...</>
                                            : <>Auto-generate</>}
                                    </button>
                                </div>
                            </div>

                            {/* Type toggle */}
                            <div className="flex gap-2">
                                {[{ v: "whats_new", label: "What's New", desc: "Users can dismiss", Icon: Sparkles }, { v: "maintenance", label: "Maintenance", desc: "Blocks app access", Icon: Wrench }].map(t => (
                                    <button key={t.v} onClick={() => { setBType(t.v as any); setBTitle(""); setBMessage(""); setBBullets(["", "", ""]); }}
                                        className={`flex-1 px-3 py-2 rounded-xl border text-left transition-all ${bType === t.v ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" : "border-gray-200 dark:border-gray-700 hover:border-gray-300"}`}>
                                        <p className="text-xs font-semibold text-gray-900 dark:text-white flex items-center gap-1.5"><t.Icon size={11} /> {t.label}</p>
                                        <p className="text-[10px] text-gray-400 mt-0.5">{t.desc}</p>
                                    </button>
                                ))}
                            </div>

                            {/* Title */}
                            <input value={bTitle} onChange={e => setBTitle(e.target.value)} placeholder={bType === "maintenance" ? "e.g. App Under Maintenance" : "e.g. New Features Added!"} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />

                            {/* Message */}
                            <AutoTextarea value={bMessage} onChange={e => setBMessage(e.target.value)} placeholder="Optional message..." minRows={2} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />

                            {/* Bullet points (What's New only) */}
                            {bType === "whats_new" && (
                                <div className="space-y-2">
                                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">Feature bullet points</p>
                                    {bBullets.map((b, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <input
                                                value={b}
                                                onChange={e => { const arr = [...bBullets]; arr[i] = e.target.value; setBBullets(arr); }}
                                                placeholder={`• Feature ${i + 1}`}
                                                className="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                            <button
                                                onClick={() => setBBullets(prev => prev.filter((_, idx) => idx !== i))}
                                                className="shrink-0 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                title="Remove this bullet"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                    <button onClick={() => setBBullets(b => [...b, ""])} className="text-xs text-indigo-500 hover:text-indigo-700">+ Add bullet</button>
                                </div>
                            )}

                            {/* Target audience */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">Who sees this?</p>
                                    <button onClick={() => { setBTargetAll(t => !t); setBSelected([]); }} className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg transition-all ${bTargetAll ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}>
                                        {bTargetAll ? <ToggleRight size={14} /> : <ToggleLeft size={14} />} {bTargetAll ? "All members" : "Selected only"}
                                    </button>
                                </div>
                                {!bTargetAll && (
                                    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                                        {users.map(u => (
                                            <label key={u.email} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                                                <input type="checkbox" checked={bSelected.includes(u.email)} onChange={() => toggleUserSelect(u.email)} className="rounded text-indigo-600" />
                                                <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{u.email}</span>
                                                <RoleBadge role={u.role} />
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-2 pt-1">
                                <button onClick={createBroadcast} disabled={bCreating || !bTitle.trim()} className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2">
                                    {bCreating ? <Loader2 size={14} className="animate-spin" /> : <Megaphone size={14} />}
                                    {editingBroadcastId ? "Save Changes" : "Broadcast Now"}
                                </button>
                                <button onClick={() => { setShowForm(false); setEditingBroadcastId(null); setBTitle(""); setBMessage(""); setBBullets(["", "", ""]); }} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl transition-all">Cancel</button>
                            </div>
                        </div>
                    )}

                    {/* Broadcasts list */}
                    {bLoading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-400" size={20} /></div> : (
                        <div className="space-y-3">
                            {broadcasts.length === 0 && !showForm && <div className="text-center py-10 text-gray-400 text-sm">No broadcasts yet. Create one to push a message to your team.</div>}
                            {broadcasts.map(b => (
                                <div key={b.id} className={`rounded-2xl border p-4 ${b.active ? "border-green-500/30 bg-green-500/5" : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 opacity-60"}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {b.type === "maintenance" ? <Wrench size={14} className="shrink-0 text-amber-500" /> : <Sparkles size={14} className="shrink-0 text-indigo-400" />}
                                                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{b.title}</p>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${b.active ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400" : "bg-gray-100 dark:bg-gray-700 text-gray-500"}`}>{b.active ? "LIVE" : "OFF"}</span>
                                            </div>
                                            {b.message && <p className="text-xs text-gray-400 mt-1 truncate">{b.message}</p>}
                                            <p className="text-[10px] text-gray-400 mt-1">
                                                {b.targetEmails?.includes("__all__") ? "→ All members" : `→ ${b.targetEmails?.length} selected`}
                                                {b.type === "whats_new" && ` · ${b.dismissedBy?.length || 0} dismissed`}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button onClick={() => toggleBroadcast(b.id, !b.active)} title={b.active ? "Deactivate" : "Activate"} className={`p-1.5 rounded-lg transition-all ${b.active ? "text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"}`}>
                                                {b.active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                            </button>
                                            <button onClick={() => openEditBroadcast(b)} title="Edit broadcast" className="p-1.5 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all"><Pencil size={14} /></button>
                                            <button onClick={() => deleteBroadcast(b.id)} title="Delete" className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"><Trash2 size={14} /></button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── TEAM ACCESS TAB ────────────────────────────────────────── */}
            {activeTab === "team" && <>



                {/* ── Pending Access Requests ─────────────────────────────── */}
                {(loading || pending.length > 0) && (
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-amber-500/20 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-2">
                                <Clock size={15} /> Pending Access Requests
                            </h3>
                            {pending.length > 0 && (
                                <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-bold">
                                    {pending.length}
                                </span>
                            )}
                        </div>

                        {loading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 size={18} className="animate-spin text-gray-400" />
                            </div>
                        ) : (
                            <ul className="divide-y divide-amber-500/10">
                                {pending.map(u => (
                                    <li key={u.email} className="px-4 py-3 space-y-3">
                                        {/* Top row: avatar + info */}
                                        <div className="flex items-center gap-3">
                                            {u.photo
                                                ? <img src={u.photo} alt={u.name} className="w-10 h-10 rounded-full flex-shrink-0 ring-2 ring-amber-500/30" />
                                                : <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-600 font-bold flex-shrink-0">{u.email[0].toUpperCase()}</div>
                                            }
                                            <div className="min-w-0">
                                                {u.name && <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{u.name}</p>}
                                                <p className="text-xs text-gray-400 truncate">{u.email}</p>
                                                <p className="text-[10px] text-gray-500 mt-0.5">
                                                    Requested {new Date(u.requestedAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
                                                </p>
                                            </div>
                                        </div>
                                        {/* Bottom row: role + approve + dismiss */}
                                        <div className="flex items-center gap-2">
                                            <select
                                                id={`role-${u.email}`}
                                                defaultValue="member"
                                                className="flex-1 text-sm px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 focus:outline-none"
                                            >
                                                {ROLE_OPTIONS.map(r => (
                                                    <option key={r.value} value={r.value}>{r.icon} {r.label}</option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={() => {
                                                    const sel = document.getElementById(`role-${u.email}`) as HTMLSelectElement;
                                                    approve(u.email, sel?.value ?? "member", true);
                                                }}
                                                disabled={approvingEmail === u.email}
                                                className="flex items-center gap-1.5 px-4 py-2 bg-green-500 text-white text-sm font-semibold rounded-xl hover:bg-green-600 disabled:opacity-50 transition-colors flex-shrink-0"
                                            >
                                                {approvingEmail === u.email ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
                                                Approve
                                            </button>
                                            <button
                                                onClick={() => dismissPending(u.email)}
                                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors flex-shrink-0"
                                                title="Dismiss"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {/* ── Manual Add ─────────────────────────────────────────── */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        <UserPlus size={15} /> Add Member Manually
                    </h3>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <input
                            type="email"
                            value={newEmail}
                            onChange={e => setNewEmail(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && approve(newEmail.trim().toLowerCase(), newRole)}
                            placeholder="member@gmail.com"
                            className="flex-1 px-3 py-2.5 text-sm rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <select
                            value={newRole}
                            onChange={e => setNewRole(e.target.value)}
                            className="px-3 py-2.5 text-sm rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            {ROLE_OPTIONS.map(r => (
                                <option key={r.value} value={r.value}>{r.icon} {r.label}</option>
                            ))}
                        </select>
                        <button
                            onClick={() => approve(newEmail.trim().toLowerCase(), newRole)}
                            disabled={adding || !newEmail.trim()}
                            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                        >
                            {adding ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            Approve
                        </button>
                    </div>
                </div>

                {/* ── Approved Members ───────────────────────────────────── */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                            <Users size={15} /> Approved Members
                        </h3>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                                {users.length} member{users.length !== 1 ? "s" : ""}
                            </span>
                            <button
                                onClick={() => onConfirm
                                    ? onConfirm("Send welcome email to ALL approved members?", handleWelcomeBlast)
                                    : handleWelcomeBlast()}
                                disabled={isSendingBlast || users.length === 0}
                                title="Send welcome email to all members"
                                className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all"
                            >
                                {isSendingBlast
                                    ? <><Loader2 size={12} className="animate-spin" />Sending…</>
                                    : <><Mail size={12} />Welcome All</>}
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-10">
                            <Loader2 size={20} className="animate-spin text-gray-400" />
                        </div>
                    ) : users.length === 0 ? (
                        <div className="text-center py-10 text-gray-400 text-sm">No approved members yet.</div>
                    ) : (
                        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                            {users.map(u => (
                                <li key={u.email} className="px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                    {editingRoleFor === u.email ? (
                                        /* ── Inline role-edit row ── */
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <ShieldAlert size={15} className="text-amber-500 shrink-0" />
                                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{u.email}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <select
                                                    value={pendingRole}
                                                    onChange={e => setPendingRole(e.target.value)}
                                                    className="flex-1 text-sm px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 border border-indigo-300 dark:border-indigo-600 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                                >
                                                    {ROLE_OPTIONS.map(r => (
                                                        <option key={r.value} value={r.value}>{r.icon} {r.label}</option>
                                                    ))}
                                                </select>
                                                <button
                                                    onClick={() => saveRole(u.email)}
                                                    disabled={savingRole || pendingRole === u.role}
                                                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0"
                                                >
                                                    {savingRole ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                                                    Save
                                                </button>
                                                <button
                                                    onClick={cancelEditRole}
                                                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl border border-gray-200 dark:border-gray-600 transition-colors shrink-0"
                                                    title="Cancel"
                                                >
                                                    <X size={15} />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        /* ── Normal display row ── */
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{u.email}</p>
                                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                    <RoleBadge role={u.role} />
                                                    {u.approvedAt && (
                                                        <span className="text-[10px] text-gray-400">
                                                            Added {new Date(u.approvedAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button
                                                    onClick={() => startEditRole(u)}
                                                    title="Change role"
                                                    className="p-1.5 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                                <button
                                                    onClick={() => revokeUser(u.email)}
                                                    title="Remove access"
                                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </>}

            {/* ── BIRTHDAYS TAB ───────────────────────────────────────────── */}
            {activeTab === "birthdays" && (
                <BirthdayTab members={members} />
            )}

            {/* ── ACTIVITY MONITOR TAB ────────────────────────────────────── */}
            {activeTab === "activity" && (
                <div className="space-y-5">
                    {/* Header row */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Live presence updates every <span className="font-semibold text-gray-700 dark:text-gray-300">30s</span>.
                                Sessions expire after <span className="font-semibold text-gray-700 dark:text-gray-300">2 min</span> of inactivity.
                            </p>
                        </div>
                        <button
                            onClick={() => { setActivityLoading(true); fetchActivity().finally(() => setActivityLoading(false)); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-all"
                        >
                            <RefreshCw size={13} className={activityLoading ? "animate-spin" : ""} /> Refresh
                        </button>
                    </div>

                    {/* 🟢 Live Now */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
                                Live Now
                            </h3>
                            <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold">
                                {activityData.online.length} online
                            </span>
                        </div>

                        {activityLoading && activityData.online.length === 0 ? (
                            <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
                        ) : activityData.online.length === 0 ? (
                            <div className="flex flex-col items-center py-10 gap-2 text-gray-400">
                                <WifiOff size={28} className="opacity-40" />
                                <p className="text-sm">No one is online right now.</p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                                {activityData.online.map((u: any) => {
                                    const elapsedMs = u.sessionStart ? Date.now() - new Date(u.sessionStart).getTime() : 0;
                                    const elapsedMin = Math.floor(elapsedMs / 60_000);
                                    const elapsedStr = elapsedMin < 1 ? "Just joined" : elapsedMin < 60 ? `${elapsedMin}m` : `${Math.floor(elapsedMin / 60)}h ${elapsedMin % 60}m`;
                                    const opt = ROLE_OPTIONS.find(r => r.value === u.role) ?? ROLE_OPTIONS[0];
                                    return (
                                        <li key={u.userId} className="flex items-center gap-3 px-4 py-3">
                                            <div className="relative shrink-0">
                                                {u.photo
                                                    ? <img src={u.photo} alt={u.name} className="w-9 h-9 rounded-full object-cover ring-2 ring-emerald-400 dark:ring-emerald-500" />
                                                    : <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold text-sm">{(u.name || u.email || "?")[0].toUpperCase()}</div>
                                                }
                                                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-gray-800" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{u.name || u.email}</p>
                                                <p className="text-xs text-gray-400 truncate">{u.email}</p>
                                            </div>
                                            <div className="flex flex-col items-end gap-1 shrink-0">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${opt.bg} ${opt.color}`}>
                                                    {opt.icon} {opt.label}
                                                </span>
                                                <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                                                    <Timer size={11} /> {elapsedStr}
                                                </span>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    {/* 👤 Last Login per user */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                <Clock size={14} className="text-indigo-400" /> Last Login
                            </h3>
                            <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                                {activityData.lastLogins.length} member{activityData.lastLogins.length !== 1 ? "s" : ""}
                            </span>
                        </div>

                        {activityLoading && activityData.lastLogins.length === 0 ? (
                            <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
                        ) : activityData.lastLogins.length === 0 ? (
                            <div className="text-center py-8 text-sm text-gray-400">No login data yet.</div>
                        ) : (
                            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                                {activityData.lastLogins.map((u: any) => {
                                    const isOnline = activityData.online.some(o => o.userId === u.userId);
                                    const loginTs = u.lastLogin || u.lastSeen;
                                    const loginDate = loginTs ? new Date(loginTs) : null;
                                    const opt = ROLE_OPTIONS.find(r => r.value === u.role) ?? ROLE_OPTIONS[0];
                                    return (
                                        <li key={u.userId} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                            <div className="relative shrink-0">
                                                {u.photo
                                                    ? <img src={u.photo} alt={u.name} className="w-8 h-8 rounded-full object-cover" />
                                                    : <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs">{(u.name || u.email || "?")[0].toUpperCase()}</div>
                                                }
                                                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-800 ${isOnline ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{u.name || u.email}</p>
                                                <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${opt.color}`}>{opt.icon} {opt.label}</span>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                                    {isOnline ? <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Online now</span>
                                                        : loginDate ? loginDate.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }) : "—"}
                                                </p>
                                                {!isOnline && loginDate && (
                                                    <p className="text-[10px] text-gray-400">{loginDate.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</p>
                                                )}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            )}

            {/* ── What's New Preview Modal ─────────────────────────────────── */}
            {previewBroadcast && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" onClick={() => setPreviewBroadcast(null)}>
                    <div className="relative bg-gray-900 border border-gray-700/60 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                        {/* Header gradient strip */}
                        <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

                        {/* Preview badge */}
                        <div className="flex items-center justify-between px-5 pt-4 pb-0">
                            <span className="text-[10px] font-bold tracking-widest text-indigo-400 uppercase">Preview — what your team sees</span>
                            <button onClick={() => setPreviewBroadcast(null)} className="p-1 text-gray-500 hover:text-gray-300 rounded-lg transition-colors">
                                <X size={14} />
                            </button>
                        </div>

                        <div className="px-6 pt-4 pb-8 space-y-5">

                            {previewBroadcast.type === "maintenance" ? (
                                /* ── Maintenance Preview ── */
                                <div className="text-center space-y-5 py-2">
                                    <div className="relative mx-auto w-20 h-20">
                                        <img src="/icon-192x192.png" alt="WorshipFlow" className="w-20 h-20" />
                                        <div className="absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full bg-amber-500/70 flex items-center justify-center animate-bounce" style={{ animationDuration: "1.5s" }}>
                                            <Wrench size={13} className="text-white" />
                                        </div>
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-white">{previewBroadcast.title}</h2>
                                        {previewBroadcast.message && <p className="text-sm text-gray-400 mt-1">{previewBroadcast.message}</p>}
                                    </div>
                                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20">
                                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                        <span className="text-xs text-amber-400 font-medium">Maintenance in progress</span>
                                    </div>
                                    <button className="flex items-center gap-2 mx-auto px-5 py-2 rounded-xl bg-gray-800 border border-gray-700 text-gray-400 text-sm font-medium opacity-60 cursor-default">
                                        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
                                        Sign out
                                    </button>
                                </div>
                            ) : (
                                /* ── What's New Preview ── */
                                <>
                                    <div className="flex items-start gap-4">
                                        <div className="relative shrink-0 w-14 h-14">
                                            <img src="/icon-192x192.png" alt="WorshipFlow" className="w-14 h-14" />
                                            <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-indigo-500/70 flex items-center justify-center animate-bounce" style={{ animationDuration: "1.8s" }}>
                                                <Sparkles size={14} className="text-white" />
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[11px] text-indigo-400 font-bold uppercase tracking-wider mb-0.5">What's New</p>
                                            <h2 className="text-lg font-bold text-white leading-tight">{previewBroadcast.title}</h2>
                                        </div>
                                    </div>
                                    {previewBroadcast.message && <p className="text-sm text-gray-400 leading-relaxed">{previewBroadcast.message}</p>}
                                    {previewBroadcast.bulletPoints?.filter(Boolean).length > 0 && (
                                        <ul className="space-y-2.5">
                                            {previewBroadcast.bulletPoints.filter(Boolean).map((point: string, i: number) => (
                                                <li key={i} className="flex items-start gap-3">
                                                    <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center mt-0.5">
                                                        <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className="text-indigo-400"><path d="M5 13l4 4L19 7" /></svg>
                                                    </span>
                                                    <span className="text-sm text-gray-300 leading-snug">{point}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    <button className="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-sm shadow-lg opacity-70 cursor-default flex items-center justify-center gap-2"><ThumbsUp size={14} /> Got it!</button>
                                </>
                            )}
                            <p className="text-center text-[10px] text-gray-600">Preview only — no action taken</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
