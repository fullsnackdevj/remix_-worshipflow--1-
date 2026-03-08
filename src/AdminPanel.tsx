import { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { UserPlus, Trash2, Shield, Users, Loader2, Check, X, Clock, UserCheck } from "lucide-react";

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
        setTimeout(() => setFeedback(null), 3000);
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
                <p className="text-sm text-gray-400 mt-1">Manage who can access WorshipFlow.</p>
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
                                <li key={u.email} className="flex items-center gap-3 px-4 py-3">
                                    {/* Avatar */}
                                    {u.photo
                                        ? <img src={u.photo} alt={u.name} className="w-9 h-9 rounded-full flex-shrink-0" />
                                        : <div className="w-9 h-9 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-600 font-bold text-sm flex-shrink-0">{u.email[0].toUpperCase()}</div>
                                    }
                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        {u.name && <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{u.name}</p>}
                                        <p className="text-xs text-gray-400 truncate">{u.email}</p>
                                        <p className="text-[10px] text-gray-500 mt-0.5">
                                            Requested {new Date(u.requestedAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
                                        </p>
                                    </div>
                                    {/* Actions */}
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <select
                                            defaultValue="member"
                                            id={`role-${u.email}`}
                                            className="text-xs px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 focus:outline-none"
                                        >
                                            <option value="member">Member</option>
                                            <option value="leader">Worship Leader</option>
                                            <option value="admin">Admin</option>
                                        </select>
                                        <button
                                            onClick={() => {
                                                const sel = document.getElementById(`role-${u.email}`) as HTMLSelectElement;
                                                approve(u.email, sel?.value ?? "member", true);
                                            }}
                                            disabled={approvingEmail === u.email}
                                            className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white text-xs font-semibold rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
                                        >
                                            {approvingEmail === u.email ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={12} />}
                                            Approve
                                        </button>
                                        <button
                                            onClick={() => dismissPending(u.email)}
                                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                            title="Dismiss"
                                        >
                                            <X size={14} />
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
                        <option value="member">Member</option>
                        <option value="leader">Worship Leader</option>
                        <option value="admin">Admin</option>
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
                            <li key={u.email} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                                <div>
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{u.email}</p>
                                    <p className="text-xs text-gray-400 mt-0.5 capitalize">
                                        {u.role}
                                        {u.approvedAt && ` · Added ${new Date(u.approvedAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}`}
                                    </p>
                                </div>
                                <button
                                    onClick={() => revokeUser(u.email)}
                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                >
                                    <Trash2 size={15} />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
