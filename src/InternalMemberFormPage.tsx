import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { CheckCircle2, Loader2, Users, Calendar, MapPin, AlertCircle } from "lucide-react";

interface ContributionTier { name: string; amount: number; }

interface EventData {
  title: string;
  date: string;
  time?: string;
  venue: string;
  contributionTiers?: ContributionTier[];
  workingAmount?: number;
  studentAmount?: number;
}

const formatPHP = (n: number) =>
  `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 0 })}`;

const formatDate = (d: string) => {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-PH", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
  } catch { return d; }
};

// Make a safe doc ID from the member's typed name
const nameToId = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

export default function InternalMemberFormPage() {
  const params  = new URLSearchParams(window.location.search);
  const eventId = params.get("event") ?? "";

  const [event,         setEvent]         = useState<EventData | null>(null);
  const [tiers,         setTiers]         = useState<ContributionTier[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");

  // Form fields
  const [name,          setName]          = useState("");
  const [selectedTier,  setSelectedTier]  = useState<ContributionTier | null>(null);
  const [customAmount,  setCustomAmount]  = useState("");

  // Submission state
  const [submitting,    setSubmitting]    = useState(false);
  const [submitted,     setSubmitted]     = useState(false);
  const [alreadySigned, setAlreadySigned] = useState(false);
  const [checkingDupe,  setCheckingDupe]  = useState(false);

  useEffect(() => {
    if (!eventId) { setError("Invalid link."); setLoading(false); return; }
    getDoc(doc(db, "events", eventId))
      .then(snap => {
        if (!snap.exists()) { setError("Event not found."); return; }
        const d = snap.data();
        const ev: EventData = {
          title: d.title, date: d.date, time: d.time, venue: d.venue,
        };
        let resolvedTiers: ContributionTier[] = [];
        if (d.contributionTiers?.length) {
          resolvedTiers = d.contributionTiers;
        } else if (d.workingAmount || d.studentAmount) {
          resolvedTiers = [
            { name: "Working", amount: d.workingAmount ?? 0 },
            { name: "Student", amount: d.studentAmount ?? 0 },
          ];
        }
        setEvent(ev);
        setTiers(resolvedTiers);
        if (resolvedTiers.length > 0) {
          setSelectedTier(resolvedTiers[0]);
          setCustomAmount(String(resolvedTiers[0].amount));
        }
      })
      .catch(() => setError("Failed to load event."))
      .finally(() => setLoading(false));
  }, [eventId]);

  // Duplicate check: fires when user stops typing their name (on blur)
  const checkDuplicate = async () => {
    const id = nameToId(name);
    if (!id || !eventId) return;
    setCheckingDupe(true);
    setAlreadySigned(false);
    const snap = await getDoc(doc(db, "events", eventId, "contributions", id));
    setAlreadySigned(snap.exists());
    setCheckingDupe(false);
  };

  // When tier changes, reset custom amount to tier's default
  const handleTierSelect = (t: ContributionTier) => {
    setSelectedTier(t);
    setCustomAmount(String(t.amount));
  };

  const isValidAmount = () => {
    const v = parseFloat(customAmount);
    return !isNaN(v) && v >= 0;
  };

  const handleSubmit = async () => {
    if (!name.trim() || !selectedTier || !isValidAmount()) return;
    const docId = nameToId(name);
    if (!docId) return;
    setSubmitting(true);
    try {
      await setDoc(doc(db, "events", eventId, "contributions", docId), {
        memberName:  name.trim(),
        memberPhoto: "",
        memberType:  selectedTier.name,
        amount:      parseFloat(customAmount),
        paid:        false,
        paidAt:      null,
        markedBy:    null,
      });
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setError("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#0d0f14] flex items-center justify-center">
      <Loader2 size={28} className="text-amber-400 animate-spin" />
    </div>
  );

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error || !event) return (
    <div className="min-h-screen bg-[#0d0f14] flex items-center justify-center p-4">
      <div className="text-center">
        <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
        <p className="text-white font-semibold">{error || "Something went wrong."}</p>
      </div>
    </div>
  );

  // ── Success ──────────────────────────────────────────────────────────────────
  if (submitted && selectedTier) return (
    <div className="min-h-screen bg-[#0d0f14] flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={32} className="text-emerald-400" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">You're in! 🎉</h1>
        <p className="text-sm text-gray-400 leading-relaxed">
          Hi <span className="text-white font-bold">{name.trim()}</span>! Your contribution of{" "}
          <span className="text-white font-bold">{formatPHP(parseFloat(customAmount) || 0)}</span>{" "}
          <span className="text-gray-500">({selectedTier.name})</span> has been noted for{" "}
          <span className="text-amber-300 font-semibold">{event.title}</span>.
        </p>
        <p className="text-xs text-gray-600 mt-4">
          The collector will mark you as paid once your money is received. You can close this tab.
        </p>
      </div>
    </div>
  );

  const canSubmit = name.trim().length >= 2 && selectedTier && isValidAmount() && !alreadySigned && !checkingDupe;

  return (
    <div className="min-h-screen bg-[#0d0f14] flex flex-col items-center justify-start py-8 px-4 overflow-x-hidden">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
            <Users size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-amber-400 font-bold uppercase tracking-widest">Team Contribution</p>
            <h1 className="text-lg font-bold text-white leading-tight truncate">{event.title}</h1>
          </div>
        </div>

        {/* Event info strip */}
        <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-4 mb-6 space-y-2">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Calendar size={14} className="text-amber-400 shrink-0" />
            <span className="leading-snug">{formatDate(event.date)}{event.time && ` · ${event.time}`}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <MapPin size={14} className="text-violet-400 shrink-0" />
            <span className="leading-snug">{event.venue}</span>
          </div>
          {/* Tier rate chips */}
          {tiers.length > 0 && (
            <div className="pt-2 border-t border-gray-700/40 flex flex-wrap gap-2">
              {tiers.map((t, i) => (
                <div key={i} className="px-3 py-1.5 bg-gray-700/40 rounded-xl text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">{t.name}</p>
                  <p className="text-sm font-bold text-white">{formatPHP(t.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Form card */}
        <div className="bg-gray-900/80 border border-gray-700/40 rounded-2xl p-5 space-y-5">
          <h2 className="text-base font-bold text-white">Sign Up for this Event</h2>

          {/* ── 1. Name ──────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Your Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setAlreadySigned(false); }}
              onBlur={checkDuplicate}
              placeholder="e.g. Jay Halichic"
              className="w-full px-3 py-3 rounded-xl border border-gray-700/60 bg-gray-800/60 text-base text-white placeholder-gray-600 outline-none focus:border-amber-500/60 transition-colors"
            />
            {checkingDupe && (
              <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" /> Checking…
              </p>
            )}
            {alreadySigned && !checkingDupe && (
              <p className="text-sm text-amber-400 mt-1.5 flex items-center gap-1.5">
                <AlertCircle size={14} /> You've already signed up for this event.
              </p>
            )}
          </div>

          {/* ── 2. Category ──────────────────────────────────── */}
          {tiers.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                My Category *
              </label>
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${Math.min(tiers.length, 2)}, 1fr)` }}
              >
                {tiers.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => handleTierSelect(t)}
                    className={`py-3 px-3 rounded-xl border text-left transition-all ${
                      selectedTier?.name === t.name
                        ? "bg-indigo-500/20 border-indigo-500/50"
                        : "border-gray-700/50 hover:border-gray-600"
                    }`}
                  >
                    <p className={`text-sm font-semibold ${selectedTier?.name === t.name ? "text-indigo-300" : "text-gray-500"}`}>
                      {t.name}
                    </p>
                    <p className={`text-base font-black mt-0.5 ${selectedTier?.name === t.name ? "text-white" : "text-gray-400"}`}>
                      {formatPHP(t.amount)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── 3. Actual Amount ─────────────────────────────── */}
          <div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex-1 min-w-0">
                Amount I Can Contribute *
              </label>
              {selectedTier && parseFloat(customAmount) !== selectedTier.amount && (
                <button
                  onClick={() => setCustomAmount(String(selectedTier.amount))}
                  className="text-xs text-amber-400 hover:text-amber-300 transition-colors shrink-0"
                >
                  Reset to {formatPHP(selectedTier.amount)}
                </button>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-base">₱</span>
              <input
                type="number"
                min="0"
                value={customAmount}
                onChange={e => setCustomAmount(e.target.value)}
                placeholder="Enter amount"
                className="w-full pl-8 pr-3 py-3 rounded-xl border border-gray-700/60 bg-gray-800/60 text-lg font-bold text-white placeholder-gray-600 outline-none focus:border-amber-500/60 transition-colors"
              />
            </div>
            {selectedTier && parseFloat(customAmount) > selectedTier.amount && (
              <p className="text-sm text-emerald-400 mt-1.5">
                🙏 Exceeding target — thank you for the extra generosity!
              </p>
            )}
            {selectedTier && parseFloat(customAmount) < selectedTier.amount && parseFloat(customAmount) >= 0 && customAmount !== "" && (
              <p className="text-sm text-amber-400 mt-1.5">
                ⚠️ Below the {selectedTier.name} rate of {formatPHP(selectedTier.amount)}
              </p>
            )}
          </div>

          {/* ── Submit ───────────────────────────────────────── */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-base shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
          >
            {submitting
              ? <><Loader2 size={16} className="animate-spin" /> Submitting…</>
              : alreadySigned
                ? "Already Signed Up"
                : "✓ Confirm My Participation"}
          </button>

          <p className="text-xs text-gray-600 text-center leading-relaxed">
            The collector will mark you as paid once your money is received.
          </p>
        </div>

        <p className="text-center text-xs text-gray-700 mt-6">WorshipFlow · Team Events</p>
      </div>
    </div>
  );
}
