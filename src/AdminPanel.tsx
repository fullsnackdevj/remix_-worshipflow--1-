import { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { UserPlus, Trash2, Shield, Users, Loader2, Check, X } from "lucide-react";

interface ApprovedUser {
    email: string;
    role: string;
    approvedAt: string;
}

export default function AdminPanel() {
    const { isAdmin } = useAuth();
    const [users, setUsers] = useState<ApprovedUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [newEmail, setNewEmail] = useState("");
    const [newRole, setNewRole] = useState("member");
    const [adding, setAdding] = useState(false);
    const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/auth/users");
            const data = await res.json();
            setUsers(data);
        } catch { setUsers([]); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchUsers(); }, []);

    const showFeedback = (type: "success" | "error", msg: string) => {
        setFeedback({ type, msg });
        setTimeout(() => setFeedback(null), 3000);
    };

    const approveUser = async () => {
        const email = newEmail.trim().toLowerCase();
        if (!email || !email.includes("@")) return showFeedback("error", "Enter a valid email address.");
        if (users.find(u => u.email === email)) return showFeedback("error", "This email is already approved.");
        setAdding(true);
        try {
            await fetch("/api/auth/approve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, role: newRole }),
            });
            setNewEmail("");
            setNewRole("member");
            showFeedback("success", `${email} approved as ${newRole}.`);
            fetchUsers();
        } catch { showFeedback("error", "Failed to approve. Try again."); }
        finally { setAdding(false); }
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
            fetchUsers();
        } catch { showFeedback("error", "Failed to revoke. Try again."); }
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
                <p className="text-sm text-gray-400 mt-1">Approve or revoke access for your worship team members.</p>
            </div>

            {/* Feedback */}
            {feedback && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${feedback.type === "success" ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                    {feedback.type === "success" ? <Check size={16} /> : <X size={16} />}
                    {feedback.msg}
                </div>
            )}

            {/* Add member */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <UserPlus size={15} /> Approve a Team Member
                </h3>
                <div className="flex flex-col sm:flex-row gap-2">
                    <input
                        type="email"
                        value={newEmail}
                        onChange={e => setNewEmail(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && approveUser()}
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
                        onClick={approveUser}
                        disabled={adding}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                        {adding ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        Approve
                    </button>
                </div>
            </div>

            {/* Approved members list */}
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
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        <span className="capitalize">{u.role}</span>
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
