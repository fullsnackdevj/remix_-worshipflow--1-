import { useState, useEffect } from "react";
import {
  doc, getDoc, collection, addDoc, updateDoc, serverTimestamp,
} from "firebase/firestore";
import { ref as sRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import {
  Ticket, Calendar, MapPin, Wallet, CheckCircle2,
  Loader2, AlertCircle, ImagePlus, X, UserPlus,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface PaymentInfo {
  gcashQRUrl?: string;
  mayaQRUrl?: string;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  instructions?: string;
}

interface MinistryEvent {
  id: string;
  title: string;
  description?: string;
  date: string;
  time?: string;
  venue: string;
  price: number;
  capacity?: number | null;
  status: "open" | "closed" | "draft";
  paymentInfo: PaymentInfo;
}

type PaymentMethod = "gcash" | "maya" | "bank_transfer";

// ── Helpers ────────────────────────────────────────────────────────────────────
const formatDate = (d: string) => {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-PH", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
  } catch { return d; }
};

// ── Public Registration Page ───────────────────────────────────────────────────
export default function EventRegistrationPage({ eventId, registrantId }: { eventId: string; registrantId?: string }) {
  const isUpdateMode = !!registrantId;
  const [event,      setEvent]      = useState<MinistryEvent | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [notFound,   setNotFound]   = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError,  setFormError]  = useState("");
  const [existingProofUrl, setExistingProofUrl] = useState("");

  // Form
  const [fullName,         setFullName]         = useState("");
  const [phone,            setPhone]            = useState("");
  const [email,            setEmail]            = useState("");
  const [church,           setChurch]           = useState("");
  const [paymentMethod,    setPaymentMethod]    = useState<PaymentMethod>("gcash");
  const [referenceNumber,  setReferenceNumber]  = useState("");
  const [proofFile,        setProofFile]        = useState<File | null>(null);
  const [proofPreview,     setProofPreview]     = useState("");
  const [closeFailed,      setCloseFailed]      = useState(false);

  const uid = () => Math.random().toString(36).slice(2, 10);

  // Load event (and existing registrant if in update mode)
  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, "events", eventId));
        if (!snap.exists()) { setNotFound(true); return; }
        setEvent({ id: snap.id, ...snap.data() } as MinistryEvent);
        // Pick first available payment method
        const p = snap.data().paymentInfo as PaymentInfo;
        if (!p?.gcashQRUrl && p?.mayaQRUrl) setPaymentMethod("maya");
        else if (!p?.gcashQRUrl && !p?.mayaQRUrl && p?.bankName) setPaymentMethod("bank_transfer");

        // If update mode — load the existing registrant and pre-fill
        if (registrantId) {
          const rSnap = await getDoc(doc(db, "events", eventId, "registrants", registrantId));
          if (rSnap.exists()) {
            const r = rSnap.data();
            setFullName(r.fullName ?? "");
            setPhone(r.phone ?? "");
            setEmail(r.email ?? "");
            setChurch(r.church ?? "");
            setPaymentMethod(r.paymentMethod ?? "gcash");
            setReferenceNumber(r.referenceNumber ?? "");
            if (r.proofUrl) setExistingProofUrl(r.proofUrl);
          }
        }
      } catch { setNotFound(true); }
      finally  { setLoading(false); }
    };
    load();
  }, [eventId, registrantId]);

  const handleSubmit = async () => {
    if (!fullName.trim()) { setFormError("Full name is required"); return; }
    if (!phone.trim())    { setFormError("Phone number is required"); return; }
    if (!event)           return;

    setFormError("");
    setSubmitting(true);
    try {
      // Upload proof image if a new one was selected
      let proofUrl = existingProofUrl;
      if (proofFile) {
        const ext  = proofFile.name.split(".").pop() || "jpg";
        const snap = await uploadBytes(
          sRef(storage, `events/${eventId}/proofs/${uid()}.${ext}`),
          proofFile,
        );
        proofUrl = await getDownloadURL(snap.ref);
      }

      if (isUpdateMode && registrantId) {
        // UPDATE existing registrant record
        await updateDoc(doc(db, "events", eventId, "registrants", registrantId), {
          fullName:        fullName.trim(),
          email:           email.trim(),
          phone:           phone.trim(),
          church:          church.trim(),
          paymentMethod,
          referenceNumber: referenceNumber.trim(),
          proofUrl,
          paymentStatus:   "pending_review",   // reset to pending so admin re-reviews
          updatedAt:       serverTimestamp(),
        });
      } else {
        // CREATE new registrant record
        await addDoc(collection(db, "events", eventId, "registrants"), {
          fullName:        fullName.trim(),
          email:           email.trim(),
          phone:           phone.trim(),
          church:          church.trim(),
          paymentMethod,
          referenceNumber: referenceNumber.trim(),
          proofUrl,
          paymentStatus:   "pending_review",
          registeredAt:    serverTimestamp(),
          confirmedBy:     null,
          confirmedAt:     null,
          checkedIn:       false,
        });
      }
      setSubmitted(true);
    } catch {
      setFormError("Failed to submit. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFullName(""); setPhone(""); setEmail(""); setChurch("");
    setReferenceNumber(""); setProofFile(null); setProofPreview("");
    setFormError(""); setSubmitted(false);
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-amber-400" />
      </div>
    );
  }

  // ── Not Found ────────────────────────────────────────────────────────────────
  if (notFound || !event) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle size={40} className="text-gray-600 mb-4" />
        <h2 className="text-lg font-bold text-white mb-2">Event not found</h2>
        <p className="text-sm text-gray-500 max-w-xs">
          This registration link may be invalid or the event has been removed.
        </p>
      </div>
    );
  }

  // ── Closed ───────────────────────────────────────────────────────────────────
  if (event.status === "closed") {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-3xl bg-gray-800 flex items-center justify-center mb-4">
          <Ticket size={28} className="text-gray-600" />
        </div>
        <h2 className="text-lg font-bold text-white mb-2">Registration Closed</h2>
        <p className="text-sm text-gray-500 max-w-xs">
          Registration for <strong className="text-gray-300">{event.title}</strong> is no longer accepting new sign-ups.
        </p>
      </div>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mb-6">
          <CheckCircle2 size={40} className="text-emerald-400" />
        </div>
        <h2 className="text-2xl font-black text-white mb-3">
          {isUpdateMode ? "Payment Updated! ✅" : "You're Registered! 🎉"}
        </h2>
        <p className="text-gray-400 text-sm mb-6 max-w-xs leading-relaxed">
          {isUpdateMode
            ? <>Your payment details for <strong className="text-white">{event.title}</strong> have been updated. Our team will review and confirm your payment.</>            
            : <>Your registration for <strong className="text-white">{event.title}</strong> has been received.{event.price > 0 && " Once your payment is confirmed by our team, your slot will be secured."}</>          
          }
        </p>

        <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-5 w-full max-w-xs text-left space-y-3 mb-8">
          <div className="flex items-center gap-2.5">
            <Calendar size={14} className="text-amber-400 shrink-0" />
            <span className="text-sm text-gray-300">{formatDate(event.date)}{event.time && ` · ${event.time}`}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <MapPin size={14} className="text-violet-400 shrink-0" />
            <span className="text-sm text-gray-300">{event.venue}</span>
          </div>
          {event.price > 0 && (
            <div className="flex items-center gap-2.5">
              <Wallet size={14} className="text-amber-400 shrink-0" />
              <span className="text-sm text-gray-300">
                ₱{event.price.toLocaleString()} — payment under review
              </span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={resetForm}
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold text-sm shadow-lg shadow-amber-500/20 transition-all active:scale-[0.98]"
          >
            <UserPlus size={17} /> Register Another Person
          </button>
          <button
            onClick={() => {
              const closed = window.close();
              if (closed === undefined) setCloseFailed(true);
              setTimeout(() => setCloseFailed(true), 300);
            }}
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl border border-gray-700/60 text-gray-400 hover:bg-gray-800 hover:text-white font-semibold text-sm transition-all active:scale-[0.98]"
          >
            <CheckCircle2 size={17} /> I'm Done
          </button>
          {closeFailed && (
            <p className="text-xs text-gray-600 text-center mt-1">You may now close this tab manually.</p>
          )}
        </div>
      </div>
    );
  }

  // ── Registration Form ────────────────────────────────────────────────────────
  const p = event.paymentInfo;
  const hasPaidFee    = event.price > 0;
  const hasGcash      = !!p?.gcashQRUrl;
  const hasMaya       = !!p?.mayaQRUrl;
  const hasBank       = !!(p?.bankName);
  const hasAnyPayment = hasGcash || hasMaya || hasBank;

  const availableMethods: PaymentMethod[] = [
    ...(hasGcash ? ["gcash"        as const] : []),
    ...(hasMaya  ? ["maya"         as const] : []),
    ...(hasBank  ? ["bank_transfer"as const] : []),
  ];

  const METHOD_ICONS: Record<PaymentMethod, { src: string; alt: string; bg: string; border: string; selectedBorder: string }> = {
    gcash:         { src: "/payments/gcash.png",        alt: "GCash",         bg: "bg-blue-50",   border: "border-gray-700/40", selectedBorder: "border-blue-400"  },
    maya:          { src: "/payments/maya.png",         alt: "Maya",          bg: "bg-black",    border: "border-gray-700/40", selectedBorder: "border-green-400" },
    bank_transfer: { src: "/payments/bank_transfer.png",alt: "Bank Transfer", bg: "bg-purple-50",border: "border-gray-700/40", selectedBorder: "border-purple-400"},
  };

  return (
    <div className="min-h-screen bg-gray-950 pb-24">
      {/* Hero */}
      <div className="bg-gradient-to-b from-amber-600/15 via-orange-600/5 to-gray-950 pt-10 pb-8 px-5">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Ticket size={20} className="text-white" />
            </div>
            <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
              {isUpdateMode ? "Update Your Payment" : "Event Registration"}
            </span>
          </div>

          <h1 className="text-2xl font-black text-white mb-3 leading-tight">{event.title}</h1>
          {event.description && (
            <p className="text-sm text-gray-400 leading-relaxed mb-4">{event.description}</p>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2.5 text-sm text-gray-300">
              <Calendar size={14} className="text-amber-400 shrink-0" />
              {formatDate(event.date)}{event.time && ` · ${event.time}`}
            </div>
            <div className="flex items-center gap-2.5 text-sm text-gray-300">
              <MapPin size={14} className="text-violet-400 shrink-0" />
              {event.venue}
            </div>
            {hasPaidFee && (
              <div className="flex items-center gap-2.5 text-sm text-gray-300">
                <Wallet size={14} className="text-amber-400 shrink-0" />
                Registration Fee: <strong className="text-white ml-1">₱{event.price.toLocaleString()}</strong>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-lg mx-auto px-5 pt-6 space-y-5">

        {/* Personal Info */}
        <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-white">Your Details</h2>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Full Name *</label>
            <input
              value={fullName} onChange={e => setFullName(e.target.value)}
              placeholder="Enter your full name"
              className="w-full px-3 py-3 rounded-xl border border-gray-700/60 bg-gray-900/60 text-sm text-white placeholder-gray-600 outline-none focus:border-amber-500/60 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Phone Number *</label>
            <input
              type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="e.g. 09123456789"
              className="w-full px-3 py-3 rounded-xl border border-gray-700/60 bg-gray-900/60 text-sm text-white placeholder-gray-600 outline-none focus:border-amber-500/60 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Email <span className="normal-case font-normal text-gray-600">(optional)</span>
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-3 py-3 rounded-xl border border-gray-700/60 bg-gray-900/60 text-sm text-white placeholder-gray-600 outline-none focus:border-amber-500/60 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Church / Organization <span className="normal-case font-normal text-gray-600">(optional)</span>
            </label>
            <input
              value={church} onChange={e => setChurch(e.target.value)}
              placeholder="e.g. ICLC Project8"
              className="w-full px-3 py-3 rounded-xl border border-gray-700/60 bg-gray-900/60 text-sm text-white placeholder-gray-600 outline-none focus:border-amber-500/60 transition-colors"
            />
          </div>
        </div>

        {/* Payment Section */}
        {hasPaidFee && (
          <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-5 space-y-5">
            <div>
              <h2 className="text-sm font-bold text-white mb-1">Payment</h2>
              <p className="text-xs text-gray-500">
                Registration fee: <strong className="text-amber-400">₱{event.price.toLocaleString()}</strong>.
                {hasAnyPayment && " Choose your payment method below."}
              </p>
            </div>

            {/* Method selector */}
            {availableMethods.length > 0 && (
              <div className={`grid gap-3 ${
                availableMethods.length === 1 ? "grid-cols-1" :
                availableMethods.length === 2 ? "grid-cols-2" : "grid-cols-3"
              }`}>
                {availableMethods.map(m => {
                  const icon = METHOD_ICONS[m];
                  const isSelected = paymentMethod === m;
                  return (
                    <button
                      key={m}
                      onClick={() => setPaymentMethod(m)}
                      className={`relative overflow-hidden rounded-2xl border-2 transition-all duration-200 ${
                        isSelected
                          ? `${icon.selectedBorder} shadow-lg scale-[1.03]`
                          : `${icon.border} opacity-60 hover:opacity-90 hover:scale-[1.01]`
                      }`}
                      style={{ padding: 0, aspectRatio: "1 / 1" }}
                    >
                      <img
                        src={icon.src}
                        alt={icon.alt}
                        className="w-full h-full object-cover block rounded-2xl"
                      />
                      {isSelected && (
                        <div className="absolute inset-0 ring-2 ring-inset ring-white/20 rounded-2xl pointer-events-none" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* GCash QR */}
            {paymentMethod === "gcash" && hasGcash && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Scan to Pay via GCash</p>
                <div className="flex justify-center">
                  <div className="bg-white p-3 rounded-2xl shadow-xl">
                    <img src={p.gcashQRUrl} className="w-52 h-52 object-contain" alt="GCash QR Code" />
                  </div>
                </div>
                {p?.instructions && (
                  <div className="flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <span className="text-base shrink-0">💡</span>
                    <p className="text-xs text-amber-300/90 leading-relaxed">{p.instructions}</p>
                  </div>
                )}
              </div>
            )}

            {/* Maya QR */}
            {paymentMethod === "maya" && hasMaya && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Scan to Pay via Maya</p>
                <div className="flex justify-center">
                  <div className="bg-white p-3 rounded-2xl shadow-xl">
                    <img src={p.mayaQRUrl} className="w-52 h-52 object-contain" alt="Maya QR Code" />
                  </div>
                </div>
                {p?.instructions && (
                  <div className="flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <span className="text-base shrink-0">💡</span>
                    <p className="text-xs text-amber-300/90 leading-relaxed">{p.instructions}</p>
                  </div>
                )}
              </div>
            )}

            {/* Bank Transfer */}
            {paymentMethod === "bank_transfer" && hasBank && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Bank Transfer Details</p>
                <div className="bg-gray-900/60 rounded-xl p-4 space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Bank</span>
                    <span className="text-sm font-bold text-white">{p.bankName}</span>
                  </div>
                  {p?.bankAccountName && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">Account Name</span>
                      <span className="text-sm font-semibold text-white">{p.bankAccountName}</span>
                    </div>
                  )}
                  {p?.bankAccountNumber && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">Account No.</span>
                      <span className="text-base font-black text-amber-300 font-mono tracking-widest">{p.bankAccountNumber}</span>
                    </div>
                  )}
                </div>
                {p?.instructions && (
                  <div className="flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <span className="text-base shrink-0">💡</span>
                    <p className="text-xs text-amber-300/90 leading-relaxed">{p.instructions}</p>
                  </div>
                )}
              </div>
            )}

            {/* Proof of payment upload */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Proof of Payment{" "}
                <span className="normal-case font-normal text-gray-600">(screenshot / photo — optional)</span>
              </label>
              {proofPreview ? (
                <div className="relative">
                  <img
                    src={proofPreview}
                    alt="Proof of payment"
                    className="w-full rounded-xl object-cover max-h-48 border border-gray-700/60"
                  />
                  <button
                    onClick={() => { setProofFile(null); setProofPreview(""); }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-gray-900/80 text-gray-300 flex items-center justify-center hover:bg-red-600 hover:text-white transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 w-full py-6 rounded-xl border-2 border-dashed border-gray-700/60 cursor-pointer hover:border-amber-500/50 hover:bg-amber-500/5 transition-all">
                  <ImagePlus size={22} className="text-gray-600" />
                  <span className="text-xs text-gray-500">Tap to upload screenshot</span>
                  <span className="text-[10px] text-gray-700">JPG, PNG, HEIC accepted</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setProofFile(f);
                      const reader = new FileReader();
                      reader.onload = ev => setProofPreview(ev.target?.result as string);
                      reader.readAsDataURL(f);
                    }}
                  />
                </label>
              )}
              <p className="text-[11px] text-gray-600 mt-1.5">
                Upload your GCash/Maya screenshot or bank transfer confirmation.
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                GCash / Bank Reference No.{" "}
                <span className="normal-case font-normal text-gray-600">(after sending payment)</span>
              </label>
              <input
                value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)}
                placeholder="e.g. GCash ref no., transaction ID…"
                className="w-full px-3 py-3 rounded-xl border border-gray-700/60 bg-gray-900/60 text-sm text-white placeholder-gray-600 outline-none focus:border-amber-500/60 transition-colors"
              />
              <p className="text-[11px] text-gray-600 mt-1.5">
                Entering this helps our team verify your payment faster.
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {formError && (
          <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertCircle size={15} className="text-red-400 shrink-0" />
            <p className="text-sm text-red-300">{formError}</p>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit} disabled={submitting}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 disabled:opacity-60 text-white text-base font-black shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2.5 active:scale-[0.98]"
        >
          {submitting
            ? <><Loader2 size={18} className="animate-spin" /> Submitting…</>
            : <><CheckCircle2 size={18} /> Submit Registration</>}
        </button>

        <p className="text-center text-xs text-gray-600 pb-4 leading-relaxed">
          By registering, you confirm your intent to attend.<br />
          Your registration will be reviewed by the event organizer.
        </p>
      </div>
    </div>
  );
}
