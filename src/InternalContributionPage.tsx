import { useState, useEffect } from "react";
import {
  doc, getDoc, collection, onSnapshot, query, orderBy,
  updateDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { CheckCircle2, Circle, Users, Wallet, AlertTriangle, Loader2 } from "lucide-react";

interface Contribution {
  id: string;
  memberName: string;
  memberPhoto?: string;
  memberType: "working" | "student";
  amount: number;
  paid: boolean;
  paidAt?: any;
  markedBy?: string;
}

interface EventData {
  title: string;
  date: string;
  venue: string;
  collectorToken: string;
  collectorName: string;
  workingAmount: number;
  studentAmount: number;
  expenses?: { label: string; amount: number }[];
}

interface Props {
  eventId: string;
  token: string;
}

const formatDate = (d: string) => {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-PH", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
  } catch { return d; }
};

const formatPHP = (n: number) =>
  `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 0 })}`;

export default function InternalContributionPage({ eventId, token }: Props) {
  const [event, setEvent] = useState<EventData | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // ── Load event & verify token ──────────────────────────────────────────────
  useEffect(() => {
    getDoc(doc(db, "events", eventId)).then(snap => {
      if (!snap.exists()) { setError("Event not found."); setLoading(false); return; }
      const data = snap.data() as EventData;
      if (data.collectorToken !== token) {
        setError("Invalid or expired collector link. Please ask the admin for a new link.");
        setLoading(false);
        return;
      }
      setEvent(data);
      setLoading(false);
    }).catch(() => { setError("Failed to load event."); setLoading(false); });
  }, [eventId, token]);

  // ── Real-time contributions listener ──────────────────────────────────────
  useEffect(() => {
    if (!event) return;
    const unsub = onSnapshot(
      query(collection(db, "events", eventId, "contributions"), orderBy("memberName", "asc")),
      snap => setContributions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Contribution))),
      () => {}
    );
    return () => unsub();
  }, [eventId, event]);

  // ── Toggle paid ───────────────────────────────────────────────────────────
  const togglePaid = async (c: Contribution) => {
    setTogglingId(c.id);
    try {
      await updateDoc(doc(db, "events", eventId, "contributions", c.id), {
        paid: !c.paid,
        paidAt: !c.paid ? serverTimestamp() : null,
        markedBy: "collector",
      });
    } catch { /* noop */ }
    setTogglingId(null);
  };

  // ── Derived stats ─────────────────────────────────────────────────────────
  const totalPaid   = contributions.filter(c => c.paid).length;
  const totalCount  = contributions.length;
  const amountPaid  = contributions.filter(c => c.paid).reduce((s, c) => s + c.amount, 0);
  const totalTarget = contributions.reduce((s, c) => s + c.amount, 0);

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 size={28} className="text-amber-400 animate-spin" />
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="bg-gray-900 border border-red-500/30 rounded-2xl p-8 max-w-sm w-full text-center">
          <AlertTriangle size={36} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-white font-bold text-lg mb-2">Access Denied</h2>
          <p className="text-gray-400 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 pb-10">
      {/* Header */}
      <div className="bg-gradient-to-b from-gray-900 to-gray-950 border-b border-gray-800/60 px-4 pt-10 pb-6">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2.5 py-1 rounded-full">
              Collector View
            </span>
          </div>
          <h1 className="text-2xl font-black text-white leading-tight">{event!.title}</h1>
          <p className="text-sm text-gray-400 mt-1">{formatDate(event!.date)}</p>
          {event!.venue && <p className="text-xs text-gray-500 mt-0.5">📍 {event!.venue}</p>}
          <p className="text-xs text-gray-500 mt-2">
            Collector: <span className="text-white font-semibold">{event!.collectorName}</span>
          </p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pt-5 space-y-4">
        {/* Summary card */}
        <div className="bg-gray-900 border border-gray-700/40 rounded-2xl p-4 grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-2xl font-black text-white">{totalPaid}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">of {totalCount} paid</p>
          </div>
          <div className="text-center border-x border-gray-800">
            <p className="text-2xl font-black text-emerald-400">{formatPHP(amountPaid)}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">collected</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black text-amber-400">{formatPHP(totalTarget - amountPaid)}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">remaining</p>
          </div>
        </div>

        {/* Contribution rates legend */}
        <div className="flex gap-2">
          <div className="flex-1 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-3 py-2 text-center">
            <p className="text-xs text-indigo-300 font-semibold">Working</p>
            <p className="text-base font-black text-white">{formatPHP(event!.workingAmount)}</p>
          </div>
          <div className="flex-1 bg-violet-500/10 border border-violet-500/20 rounded-xl px-3 py-2 text-center">
            <p className="text-xs text-violet-300 font-semibold">Student</p>
            <p className="text-base font-black text-white">{formatPHP(event!.studentAmount)}</p>
          </div>
        </div>

        {/* Members list */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Users size={14} className="text-gray-500" />
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Members</p>
          </div>
          <div className="space-y-2">
            {contributions.length === 0 ? (
              <div className="text-center py-10 text-gray-600 text-sm">
                No members added yet.
              </div>
            ) : contributions.map(c => (
              <button
                key={c.id}
                onClick={() => togglePaid(c)}
                disabled={togglingId === c.id}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all text-left active:scale-[0.98] ${
                  c.paid
                    ? "bg-emerald-900/20 border-emerald-700/30"
                    : "bg-gray-900 border-gray-700/40 hover:border-gray-600"
                }`}
              >
                {/* Check icon */}
                <div className={`shrink-0 transition-colors ${c.paid ? "text-emerald-400" : "text-gray-600"}`}>
                  {togglingId === c.id
                    ? <Loader2 size={20} className="animate-spin text-amber-400" />
                    : c.paid
                      ? <CheckCircle2 size={22} />
                      : <Circle size={22} />
                  }
                </div>

                {/* Avatar */}
                {c.memberPhoto ? (
                  <img src={c.memberPhoto} alt={c.memberName}
                    className="w-9 h-9 rounded-full object-cover shrink-0 border-2 border-gray-700" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {c.memberName[0]?.toUpperCase()}
                  </div>
                )}

                {/* Name + type */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold leading-snug ${c.paid ? "text-emerald-300" : "text-white"}`}>
                    {c.memberName}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {c.memberType === "student" ? "Student" : "Working"} · {formatPHP(c.amount)}
                  </p>
                </div>

                {/* Status badge */}
                <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full ${
                  c.paid
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "bg-gray-700/50 text-gray-500 border border-gray-700"
                }`}>
                  {c.paid ? "PAID" : "UNPAID"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Expenses (read-only) */}
        {(event!.expenses ?? []).length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Wallet size={14} className="text-gray-500" />
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Budget Items</p>
            </div>
            <div className="bg-gray-900 border border-gray-700/40 rounded-xl overflow-hidden">
              {event!.expenses!.map((e, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-gray-800 last:border-0">
                  <p className="text-sm text-gray-300">{e.label}</p>
                  <p className="text-sm font-semibold text-white">{formatPHP(e.amount)}</p>
                </div>
              ))}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-800/40">
                <p className="text-sm font-bold text-white">Total Need</p>
                <p className="text-sm font-black text-amber-400">
                  {formatPHP(event!.expenses!.reduce((s, e) => s + e.amount, 0))}
                </p>
              </div>
            </div>
          </div>
        )}

        <p className="text-center text-[11px] text-gray-700 pb-2">
          Tap a name to toggle paid / unpaid — the admin sees your updates in real time.
        </p>
      </div>
    </div>
  );
}
