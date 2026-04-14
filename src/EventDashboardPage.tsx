import { useState, useEffect } from "react";
import {
  doc, getDoc, collection, onSnapshot, query, orderBy,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  Calendar, MapPin, Wallet, Users,
  CheckCircle2, Clock, XCircle, RefreshCw,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface MinistryEvent {
  id: string;
  title: string;
  date: string;
  time?: string;
  venue: string;
  price: number;
  capacity?: number | null;
}

interface Registrant {
  id: string;
  fullName: string;
  paymentMethod: string;
  paymentStatus: "pending_review" | "paid" | "rejected";
  church?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const formatDate = (d: string) => {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-PH", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
  } catch { return d; }
};

const METHOD_LABELS: Record<string, string> = {
  gcash: "GCash", maya: "Maya", bank_transfer: "Bank Transfer",
};

const formatPHP = (n: number) => `₱${n.toLocaleString()}`;

// ── Dashboard Page ─────────────────────────────────────────────────────────────
export default function EventDashboardPage({ eventId }: { eventId: string }) {
  const [event,       setEvent]       = useState<MinistryEvent | null>(null);
  const [registrants, setRegistrants] = useState<Registrant[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [notFound,    setNotFound]    = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Load event details
  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, "events", eventId));
        if (!snap.exists()) { setNotFound(true); return; }
        setEvent({ id: snap.id, ...snap.data() } as MinistryEvent);
      } catch { setNotFound(true); }
      finally  { setLoading(false); }
    };
    load();
  }, [eventId]);

  // Real-time registrant subscription
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "events", eventId, "registrants"), orderBy("registeredAt", "asc")),
      snap => {
        setRegistrants(snap.docs.map(d => ({ id: d.id, ...d.data() } as Registrant)));
        setLastUpdated(new Date());
      }
    );
    return unsub;
  }, [eventId]);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-[3px] border-transparent border-t-amber-400 animate-spin" />
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-center p-6">
        <p className="text-2xl mb-2">😕</p>
        <h2 className="text-lg font-bold text-white mb-1">Event not found</h2>
        <p className="text-sm text-gray-500">This dashboard link may be invalid or the event has been removed.</p>
      </div>
    );
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const paid      = registrants.filter(r => r.paymentStatus === "paid");
  const pending   = registrants.filter(r => r.paymentStatus === "pending_review");
  const rejected  = registrants.filter(r => r.paymentStatus === "rejected");
  const collected = paid.length * event.price;
  const outstanding = pending.length * event.price;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header bar */}
      <div className="bg-gradient-to-r from-amber-600/20 to-orange-600/10 border-b border-amber-500/20 px-5 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Users size={15} className="text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Event Dashboard</p>
              <p className="text-sm font-black text-white leading-tight">{event.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <RefreshCw size={10} className="text-emerald-500" />
            <span>Live · {lastUpdated.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-6 space-y-6">
        {/* Event info */}
        <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2.5 text-sm text-gray-300">
            <Calendar size={13} className="text-amber-400 shrink-0" />
            {formatDate(event.date)}{event.time && ` · ${event.time}`}
          </div>
          <div className="flex items-center gap-2.5 text-sm text-gray-300">
            <MapPin size={13} className="text-violet-400 shrink-0" />
            {event.venue}
          </div>
          {event.price > 0 && (
            <div className="flex items-center gap-2.5 text-sm text-gray-300">
              <Wallet size={13} className="text-amber-400 shrink-0" />
              {formatPHP(event.price)} / person
            </div>
          )}
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Registered", value: registrants.length,  color: "text-indigo-400",  bg: "bg-indigo-500/10 border-indigo-500/20" },
            { label: "Paid",       value: paid.length,          color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
            { label: "Pending",    value: pending.length,       color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20" },
            { label: "Rejected",   value: rejected.length,      color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20" },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`rounded-2xl border p-3 text-center ${bg}`}>
              <p className={`text-2xl font-black ${color}`}>{value}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Finance summary */}
        {event.price > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border bg-emerald-500/10 border-emerald-500/20 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Total Collected</p>
              <p className="text-2xl font-black text-emerald-400">{formatPHP(collected)}</p>
              <p className="text-xs text-gray-500 mt-1">{paid.length} paid × {formatPHP(event.price)}</p>
            </div>
            <div className="rounded-2xl border bg-amber-500/10 border-amber-500/20 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Pending</p>
              <p className="text-2xl font-black text-amber-400">{formatPHP(outstanding)}</p>
              <p className="text-xs text-gray-500 mt-1">{pending.length} pending × {formatPHP(event.price)}</p>
            </div>
          </div>
        )}

        {/* Confirmed list */}
        {paid.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <CheckCircle2 size={12} className="text-emerald-400" /> Confirmed Payments ({paid.length})
            </p>
            <div className="space-y-1.5">
              {paid.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
                  <div className="w-7 h-7 rounded-full bg-emerald-600/20 flex items-center justify-center text-emerald-400 font-bold text-xs shrink-0">
                    {r.fullName[0]?.toUpperCase()}
                  </div>
                  <span className="text-sm text-gray-200 flex-1 truncate font-medium">{r.fullName}</span>
                  {r.church && <span className="text-xs text-gray-500 truncate hidden sm:block">{r.church}</span>}
                  <span className="text-xs text-gray-500 shrink-0">{METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending list */}
        {pending.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Clock size={12} className="text-amber-400" /> Awaiting Confirmation ({pending.length})
            </p>
            <div className="space-y-1.5">
              {pending.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-500/5 border border-amber-500/15">
                  <div className="w-7 h-7 rounded-full bg-amber-600/20 flex items-center justify-center text-amber-400 font-bold text-xs shrink-0">
                    {r.fullName[0]?.toUpperCase()}
                  </div>
                  <span className="text-sm text-gray-200 flex-1 truncate font-medium">{r.fullName}</span>
                  {r.church && <span className="text-xs text-gray-500 truncate hidden sm:block">{r.church}</span>}
                  <span className="text-xs text-gray-500 shrink-0">{METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {registrants.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users size={36} className="text-gray-700 mb-3" />
            <p className="text-sm text-gray-500">No registrants yet</p>
            <p className="text-xs text-gray-600 mt-1">This dashboard will update live as people sign up.</p>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-[10px] text-gray-700 pb-4">
          Read-only view · Updates automatically · Powered by WorshipFlow
        </p>
      </div>
    </div>
  );
}
