import { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { UserPlus, Trash2, Shield, Users, Loader2, Check, X, Clock, UserCheck, Pencil, ShieldCheck, ShieldAlert } from "lucide-react";

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
    { value: "member", label: "Member", color: "text-gray-500 dark:text-gray-400", bg: "bg-gray-100 dark:bg-gray-700", icon: "👤" },
    { value: "musician", label: "Musician", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/20", icon: "🎸" },
    { value: "leader", label: "Worship Leader", color: "text-indigo-500 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-900/30", icon: "🎤" },
    { value: "planning_lead", label: "Planning Lead", color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-900/20", icon: "📋" },
    { value: "audio_tech", label: "Audio / Tech", color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-900/20", icon: "🎛️" },
    { value: "admin", label: "Admin", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20", icon: "🛡️" },
];

function RoleBadge({ role }: { role: string }) {
    const opt = ROLE_OPTIONS.find(r => r.value === role) ?? ROLE_OPTIONS[0];
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${opt.bg} ${opt.color}`}>
            {opt.icon} {opt.label}
        </span>
    );
}

export default function AdminPanel() {
    const { isAdmin } = useAuth();
    const [users, setUsers] = useState<ApprovedUser[]>([]);
    const [pending, setPending] = useState<PendingUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [newEmail, setNewEmail] = useState("");
    const [newRole, setNewRole] = useState("member");
    const [adding, setAdding] = useState(false);
    const [approvingEmail, setApprovingEmail] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

    // ── Role-edit state ──────────────────────────────────────────────────────
    const [editingRoleFor, setEditingRoleFor] = useState<string | null>(null); // email currently being edited
    const [pendingRole, setPendingRole] = useState<string>("");
    const [savingRole, setSavingRole] = useState(false);

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

    useEffect(() => { fetchAll(); }, []);

    const showFeedback = (type: "success" | "error", msg: string) => {
        setFeedback({ type, msg });
        setTimeout(() => setFeedback(null), 3500);
    };

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
            showFeedback("success", `${email} approved as ${role}.`);
            fetchAll();
        } catch { showFeedback("error", "Failed to approve. Try again."); }
        finally { setApprovingEmail(null); setAdding(false); }
    };

    const revokeUser = async (email: string) => {
        if (!confirm(`Remove access for ${email}?`)) return;
        try {
            await fetch("/api/auth/revoke", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            showFeedback("success", `${email} access removed.`);
            fetchAll();
        } catch { showFeedback("error", "Failed to revoke. Try again."); }
    };

    const dismissPending = async (email: string) => {
        try {
            await fetch("/api/auth/revoke-pending", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            setPending(p => p.filter(u => u.email !== email));
        } catch { }
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
            showFeedback("success", `Role updated to "${ROLE_OPTIONS.find(r => r.value === pendingRole)?.label}" for ${email}.`);
            setEditingRoleFor(null);
        } catch {
            showFeedback("error", "Failed to update role. Try again.");
        } finally {
            setSavingRole(false);
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
            {/* Header */}
            <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Shield size={20} className="text-indigo-500" /> Team Access
                </h2>
                <p className="text-sm text-gray-400 mt-1">Manage who can access WorshipFlow and their permission level.</p>
            </div>

            {/* Feedback */}
            {feedback && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${feedback.type === "success" ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                    {feedback.type === "success" ? <Check size={16} /> : <X size={16} />}
                    {feedback.msg}
                </div>
            )}

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
                        <div className="flex items-center justify-center py-8 text-gray-400">
                            <Loader2 size={18} className="animate-spin mr-2" /> Loading...
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
                    <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                        {users.length} member{users.length !== 1 ? "s" : ""}
                    </span>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-10 text-gray-400">
                        <Loader2 size={20} className="animate-spin mr-2" /> Loading...
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
        </div>
    );
}
