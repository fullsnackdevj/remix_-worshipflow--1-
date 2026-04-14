import { useState, useEffect } from "react";
import {
  collection, doc, addDoc, onSnapshot,
  query, orderBy, serverTimestamp, updateDoc,
} from "firebase/firestore";
import { ref as sRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import {
  Plus, X, Ticket, Calendar, MapPin, Users, Wallet,
  Copy, Check, CheckCircle2, XCircle, Clock,
  ChevronLeft, Download, Search, Loader2,
  Smartphone, ArrowRight, Building2, QrCode, Share2, ExternalLink,
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
  description: string;
  date: string;
  time?: string;
  venue: string;
  price: number;
  capacity?: number | null;
  status: "open" | "closed" | "draft";
  paymentInfo: PaymentInfo;
  createdBy: string;
  createdAt: any;
}

interface Registrant {
  id: string;
  fullName: string;
  email?: string;
  phone: string;
  church?: string;
  paymentMethod: "gcash" | "maya" | "bank_transfer";
  paymentStatus: "pending_review" | "paid" | "rejected";
  referenceNumber?: string;
  proofUrl?: string;
  archived?: boolean;
  registeredAt: any;
  confirmedBy?: string;
  confirmedAt?: any;
  rejectionNote?: string;
  rejectedAt?: any;
}

interface Props {
  userId: string;
  userName: string;
  isAdmin: boolean;
  onToast: (type: "success" | "error", msg: string) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);
const formatDate = (d: string) => {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-PH", {
      weekday: "short", month: "long", day: "numeric", year: "numeric",
    });
  } catch { return d; }
};
const formatPHP = (n: number) =>
  `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 0 })}`;
const qrUrl = (data: string, size = 260) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&qzone=2&color=000000&bgcolor=FFFFFF`;

const METHOD_LABELS: Record<string, string> = {
  gcash: "GCash", maya: "Maya", bank_transfer: "Bank Transfer",
};

// ── Main Component ─────────────────────────────────────────────────────────────
export default function EventsView({ userId, userName, isAdmin, onToast }: Props) {
  const [events, setEvents] = useState<MinistryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<MinistryEvent | null>(null);
  const [detailTab, setDetailTab] = useState<"registrants" | "finance" | "share">("registrants");
  const [registrants, setRegistrants] = useState<Registrant[]>([]);
  const [registrantsLoading, setRegistrantsLoading] = useState(false);
  const [searchQuery,  setSearchQuery]  = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending_review" | "paid" | "rejected" | "archived">("all");
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [copied,       setCopied]       = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  // ── Rejection flow state ─────────────────────────────────────────────────────
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  // ── Create modal state ───────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [creating, setCreating] = useState(false);
  // Step 1
  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fDate, setFDate] = useState("");
  const [fTime, setFTime] = useState("");
  const [fVenue, setFVenue] = useState("");
  const [fPrice, setFPrice] = useState("");
  const [fCapacity, setFCapacity] = useState("");
  // Step 2
  const [fGcashFile, setFGcashFile] = useState<File | null>(null);
  const [fGcashPreview, setFGcashPreview] = useState("");
  const [fMayaFile, setFMayaFile] = useState<File | null>(null);
  const [fMayaPreview, setFMayaPreview] = useState("");
  const [fBankName, setFBankName] = useState("");
  const [fBankAcctName, setFBankAcctName] = useState("");
  const [fBankAcctNum, setFBankAcctNum] = useState("");
  const [fInstructions, setFInstructions] = useState("");

  // ── Derived ──────────────────────────────────────────────────────────────────
  const regLink = selectedEvent
    ? `${window.location.origin}${window.location.pathname}?event=${selectedEvent.id}`
    : "";

  const active    = registrants.filter(r => !r.archived);
  const archived  = registrants.filter(r =>  r.archived);
  const paid      = active.filter(r => r.paymentStatus === "paid").length;
  const pending   = active.filter(r => r.paymentStatus === "pending_review").length;
  const rejected  = active.filter(r => r.paymentStatus === "rejected").length;
  const collected   = paid * (selectedEvent?.price ?? 0);
  const outstanding = pending * (selectedEvent?.price ?? 0);

  const filtered = (statusFilter === "archived" ? archived : active)
    .filter(r => statusFilter === "all" || statusFilter === "archived" || r.paymentStatus === statusFilter)
    .filter(r => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        r.fullName.toLowerCase().includes(q) ||
        r.phone?.includes(q) ||
        (r.email ?? "").toLowerCase().includes(q)
      );
    });

  const archiveRegistrant  = (id: string) =>
    updateDoc(doc(db, "events", selectedEvent!.id, "registrants", id), { archived: true });
  const restoreRegistrant  = (id: string) =>
    updateDoc(doc(db, "events", selectedEvent!.id, "registrants", id), { archived: false });

  // ── Firestore subscriptions ──────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, "events"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, snap => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as MinistryEvent)));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!selectedEvent) { setRegistrants([]); return; }
    setRegistrantsLoading(true);
    const q = query(
      collection(db, "events", selectedEvent.id, "registrants"),
      orderBy("registeredAt", "desc"),
    );
    const unsub = onSnapshot(q, snap => {
      setRegistrants(snap.docs.map(d => ({ id: d.id, ...d.data() } as Registrant)));
      setRegistrantsLoading(false);
    }, () => setRegistrantsLoading(false));
    return () => unsub();
  }, [selectedEvent?.id]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const resetCreate = () => {
    setFTitle(""); setFDesc(""); setFDate(""); setFTime("");
    setFVenue(""); setFPrice(""); setFCapacity("");
    setFGcashFile(null); setFGcashPreview("");
    setFMayaFile(null); setFMayaPreview("");
    setFBankName(""); setFBankAcctName(""); setFBankAcctNum(""); setFInstructions("");
    setCreateStep(1);
  };

  const pickImage = (
    fileSetter: (f: File) => void,
    previewSetter: (s: string) => void,
  ) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    fileSetter(f);
    const reader = new FileReader();
    reader.onload = ev => previewSetter(ev.target?.result as string);
    reader.readAsDataURL(f);
  };

  const createEvent = async () => {
    if (!fTitle.trim() || !fDate || !fVenue.trim()) {
      onToast("error", "Title, Date and Venue are required"); return;
    }
    setCreating(true);
    try {
      let gcashQRUrl = "";
      let mayaQRUrl  = "";
      if (fGcashFile) {
        const snap = await uploadBytes(sRef(storage, `events/gcash-${uid()}.jpg`), fGcashFile);
        gcashQRUrl = await getDownloadURL(snap.ref);
      }
      if (fMayaFile) {
        const snap = await uploadBytes(sRef(storage, `events/maya-${uid()}.jpg`), fMayaFile);
        mayaQRUrl = await getDownloadURL(snap.ref);
      }
      await addDoc(collection(db, "events"), {
        title:       fTitle.trim(),
        description: fDesc.trim(),
        date:        fDate,
        time:        fTime,
        venue:       fVenue.trim(),
        price:       parseFloat(fPrice) || 0,
        capacity:    fCapacity ? parseInt(fCapacity) : null,
        status:      "open",
        paymentInfo: {
          gcashQRUrl,
          mayaQRUrl,
          bankName:          fBankName.trim(),
          bankAccountName:   fBankAcctName.trim(),
          bankAccountNumber: fBankAcctNum.trim(),
          instructions:      fInstructions.trim(),
        },
        createdBy:  userId,
        createdAt:  serverTimestamp(),
      });
      onToast("success", "🎉 Event created!");
      setShowCreate(false);
      resetCreate();
    } catch (err) {
      console.error(err);
      onToast("error", "Failed to create event");
    } finally {
      setCreating(false);
    }
  };

  const confirmPayment = async (rid: string) => {
    if (!selectedEvent) return;
    setActioningId(rid);
    try {
      await updateDoc(doc(db, "events", selectedEvent.id, "registrants", rid), {
        paymentStatus: "paid",
        confirmedBy:   userName,
        confirmedAt:   serverTimestamp(),
      });
      onToast("success", "✅ Payment confirmed");
    } catch { onToast("error", "Failed to update"); }
    finally   { setActioningId(null); }
  };

  const rejectPayment = async (rid: string, note: string) => {
    if (!selectedEvent) return;
    setActioningId(rid);
    try {
      await updateDoc(doc(db, "events", selectedEvent.id, "registrants", rid), {
        paymentStatus:  "rejected",
        rejectionNote:  note.trim() || null,
        rejectedAt:     serverTimestamp(),
      });
      onToast("success", "Entry marked as rejected");
      setRejectingId(null);
      setRejectNote("");
    } catch { onToast("error", "Failed to update"); }
    finally   { setActioningId(null); }
  };

  const reopenPayment = async (rid: string) => {
    if (!selectedEvent) return;
    setActioningId(rid);
    try {
      await updateDoc(doc(db, "events", selectedEvent.id, "registrants", rid), {
        paymentStatus: "pending_review",
        rejectionNote: null,
        rejectedAt:    null,
      });
      onToast("success", "↩ Entry re-opened for review");
    } catch { onToast("error", "Failed to reopen"); }
    finally   { setActioningId(null); }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(regLink);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  // ── Status badge ─────────────────────────────────────────────────────────────
  const Badge = ({ s }: { s: Registrant["paymentStatus"] }) => {
    const m = {
      paid:           { lbl: "Paid",     cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
      pending_review: { lbl: "Pending",  cls: "bg-amber-500/15  text-amber-400  border-amber-500/30"  },
      rejected:       { lbl: "Rejected", cls: "bg-red-500/15    text-red-400    border-red-500/30"    },
    }[s];
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${m.cls}`}>
        {m.lbl}
      </span>
    );
  };

  // ── EVENT DETAIL VIEW ────────────────────────────────────────────────────────
  if (selectedEvent) {
    const isPast = new Date(selectedEvent.date + "T00:00:00") < new Date();
    return (
      <div className="min-h-[60vh]">
        {/* Back row */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <button
            onClick={() => { setSelectedEvent(null); setRegistrants([]); setSearchQuery(""); }}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={16} /> Back
          </button>
          <span className="text-gray-700">/</span>
          <h1 className="text-sm font-semibold text-white truncate flex-1">{selectedEvent.title}</h1>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${
            selectedEvent.status === "open" && !isPast
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : "bg-gray-500/15 text-gray-400 border-gray-600/30"
          }`}>
            {selectedEvent.status === "open" && !isPast ? "🟢 Open" : "⚫ Closed"}
          </span>
        </div>

        {/* Info strip */}
        <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 rounded-2xl p-4 mb-5 flex flex-wrap gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <Calendar size={13} className="text-amber-400 shrink-0" />
            {formatDate(selectedEvent.date)}{selectedEvent.time && ` · ${selectedEvent.time}`}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <MapPin size={13} className="text-violet-400 shrink-0" />
            {selectedEvent.venue}
          </div>
          {selectedEvent.price > 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <Wallet size={13} className="text-amber-400 shrink-0" />
              {formatPHP(selectedEvent.price)} / person
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <Users size={13} className="text-emerald-400 shrink-0" />
            {registrants.length} registered{selectedEvent.capacity ? ` / ${selectedEvent.capacity} slots` : ""}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-gray-800/60 p-1 rounded-xl">
          {(["registrants", "finance", "share"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setDetailTab(tab)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all capitalize ${
                detailTab === tab
                  ? "bg-indigo-600 text-white shadow"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {tab === "share" ? "Share & QR" : tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === "registrants" && (
                <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  detailTab === tab ? "bg-white/20" : "bg-gray-700"
                }`}>{registrants.length}</span>
              )}
              {tab === "finance" && pending > 0 && (
                <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/30 text-amber-300">{pending}</span>
              )}
            </button>
          ))}
        </div>

        {/* ─── REGISTRANTS tab ─── */}
        {detailTab === "registrants" && (
          <div>
            <div className="relative mb-3">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search name, phone, email…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-indigo-500/60 transition-colors"
              />
            </div>

            {/* Status filter pills */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {([
                { key: "all",            label: "All",      count: active.length },
                { key: "pending_review", label: "Pending",  count: pending },
                { key: "paid",           label: "Paid",     count: paid },
                { key: "rejected",       label: "Rejected", count: rejected },
                { key: "archived",       label: "Archived", count: archived.length },
              ] as const).map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    statusFilter === key
                      ? key === "all"            ? "bg-white/10 border-white/20 text-white"
                      : key === "pending_review" ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                      : key === "paid"           ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                      : key === "archived"       ? "bg-gray-500/20 border-gray-500/40 text-gray-300"
                      :                           "bg-red-500/20 border-red-500/40 text-red-300"
                      : "bg-transparent border-gray-700/50 text-gray-500 hover:border-gray-600 hover:text-gray-400"
                  }`}
                >
                  {label}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    statusFilter === key
                      ? key === "pending_review" ? "bg-amber-500/30 text-amber-200"
                      : key === "paid"           ? "bg-emerald-500/30 text-emerald-200"
                      : key === "rejected"       ? "bg-red-500/30 text-red-200"
                      : key === "archived"       ? "bg-gray-500/30 text-gray-300"
                      :                           "bg-white/10 text-white/70"
                      : "bg-gray-700/60 text-gray-500"
                  }`}>{count}</span>
                </button>
              ))}
            </div>

            {registrantsLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="animate-spin text-amber-400" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Users size={32} className="text-gray-700 mb-3" />
                <p className="text-sm text-gray-500">
                  {statusFilter === "archived" ? "No archived registrants" : searchQuery ? "No matching registrants" : "No registrants yet"}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  {statusFilter === "archived" ? "Check a registrant's checkbox to archive them" : "Share the link to start collecting sign-ups"}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map(r => (
                  <div key={r.id}
                    className={`border rounded-xl transition-all ${
                      r.archived
                        ? "bg-gray-800/30 border-gray-700/20 opacity-60"
                        : r.paymentStatus === "rejected"
                          ? "bg-red-950/20 border-red-800/30"
                          : "bg-gray-800/60 border-gray-700/40"
                    }`}
                  >
                    {/* Main row */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                      {/* Archive checkbox */}
                      <label className="shrink-0 cursor-pointer group" title={r.archived ? "Archived" : "Archive this registrant"}>
                        <input
                          type="checkbox"
                          checked={!!r.archived}
                          onChange={() => r.archived ? restoreRegistrant(r.id) : archiveRegistrant(r.id)}
                          className="hidden"
                        />
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                          r.archived
                            ? "bg-gray-500 border-gray-500"
                            : "border-gray-600 group-hover:border-gray-400"
                        }`}>
                          {r.archived && <Check size={10} className="text-white" />}
                        </div>
                      </label>
                      {/* Avatar */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${
                        r.archived
                          ? "bg-gray-700"
                          : r.paymentStatus === "rejected"
                            ? "bg-gray-700"
                            : "bg-gradient-to-br from-amber-500 to-orange-600"
                      }`}>
                        {r.fullName[0]?.toUpperCase()}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold leading-snug ${
                          r.paymentStatus === "rejected" ? "text-gray-400 line-through" : "text-white"
                        }`}>{r.fullName}</p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                          <span className="text-xs text-gray-400">{r.phone}</span>
                          {r.email  && <span className="text-xs text-gray-500">· {r.email}</span>}
                          {r.church && <span className="text-xs text-gray-500">· {r.church}</span>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <Badge s={r.paymentStatus} />
                          <span className="text-[10px] text-gray-600">via {METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod}</span>
                          {r.referenceNumber && (
                            <span className="text-[10px] text-gray-500">Ref: {r.referenceNumber}</span>
                          )}
                          {r.proofUrl && (
                            <a
                              href={r.proofUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 text-[10px] font-semibold text-violet-400 hover:text-violet-300 border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 rounded-md transition-colors"
                            >
                              <ExternalLink size={9} /> View Proof
                            </a>
                          )}
                        </div>
                        {/* Rejection note */}
                        {r.paymentStatus === "rejected" && r.rejectionNote && (
                          <div className="flex items-start gap-1.5 mt-2 px-2 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <XCircle size={11} className="text-red-400 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-red-300/80 leading-relaxed">{r.rejectionNote}</p>
                          </div>
                        )}
                      </div>
                      {/* Action buttons — hidden on archived cards */}
                      {!r.archived && r.paymentStatus === "pending_review" && rejectingId !== r.id && (
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => {
                              const url = `${window.location.origin}/?event=${selectedEvent.id}&registrant=${r.id}`;
                              navigator.clipboard.writeText(url);
                              setCopiedLinkId(r.id);
                              setTimeout(() => setCopiedLinkId(null), 2000);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 text-xs font-semibold hover:bg-indigo-600/30 transition-colors"
                          >
                            {copiedLinkId === r.id ? <><Check size={11} /> Copied!</> : <><Copy size={11} /> Copy Link</>}
                          </button>
                          <button
                            onClick={() => confirmPayment(r.id)} disabled={actioningId === r.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold hover:bg-emerald-600/30 transition-colors disabled:opacity-50"
                          >
                            {actioningId === r.id
                              ? <Loader2 size={11} className="animate-spin" />
                              : <CheckCircle2 size={13} />}
                            Confirm
                          </button>
                          <button
                            onClick={() => { setRejectingId(r.id); setRejectNote(""); }}
                            disabled={actioningId === r.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 border border-red-500/30 text-xs font-semibold hover:bg-red-600/30 transition-colors disabled:opacity-50"
                          >
                            <XCircle size={13} /> Reject
                          </button>
                        </div>
                      )}
                      {!r.archived && r.paymentStatus === "paid" && (
                        <div className="flex items-center gap-1.5 text-emerald-400 text-xs shrink-0">
                          <CheckCircle2 size={14} />
                          <span className="font-medium">Confirmed{r.confirmedBy ? ` by ${r.confirmedBy}` : ""}</span>
                        </div>
                      )}
                      {/* Reopen + Copy Link for rejected */}
                      {!r.archived && r.paymentStatus === "rejected" && (
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => {
                              const url = `${window.location.origin}/?event=${selectedEvent.id}&registrant=${r.id}`;
                              navigator.clipboard.writeText(url);
                              setCopiedLinkId(r.id);
                              setTimeout(() => setCopiedLinkId(null), 2000);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 text-xs font-semibold hover:bg-indigo-600/30 transition-colors"
                          >
                            {copiedLinkId === r.id ? <><Check size={11} /> Copied!</> : <><Copy size={11} /> Copy Link</>}
                          </button>
                          <button
                            onClick={() => reopenPayment(r.id)} disabled={actioningId === r.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700/60 text-gray-300 border border-gray-600/40 text-xs font-semibold hover:bg-amber-500/20 hover:text-amber-300 hover:border-amber-500/30 transition-all disabled:opacity-50"
                          >
                            {actioningId === r.id
                              ? <Loader2 size={11} className="animate-spin" />
                              : <span className="text-base leading-none">↩</span>}
                            Reopen
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Inline reject reason input — expands when Reject clicked */}
                    {rejectingId === r.id && (
                      <div className="px-4 pb-4 border-t border-red-800/20 pt-3 space-y-2">
                        <p className="text-[11px] text-red-300/70 font-semibold uppercase tracking-wider">Reason for Rejection <span className="normal-case font-normal text-gray-600">(optional)</span></p>
                        <input
                          autoFocus
                          value={rejectNote}
                          onChange={e => setRejectNote(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && rejectPayment(r.id, rejectNote)}
                          placeholder={"e.g. \"Payment name doesn't match\", \"Duplicate entry\"…"}
                          className="w-full px-3 py-2 rounded-lg border border-red-800/40 bg-red-950/30 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-red-500/50 transition-colors"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setRejectingId(null); setRejectNote(""); }}
                            className="flex-1 py-2 rounded-lg border border-gray-700/60 text-xs text-gray-400 hover:bg-gray-800 transition-colors"
                          >Cancel</button>
                          <button
                            onClick={() => rejectPayment(r.id, rejectNote)} disabled={actioningId === r.id}
                            className="flex-1 py-2 rounded-lg bg-red-600/30 hover:bg-red-600/50 text-red-300 border border-red-500/30 text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                          >
                            {actioningId === r.id ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={13} />}
                            Confirm Reject
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── FINANCE tab ─── */}
        {detailTab === "finance" && (
          <div className="space-y-5">
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Registered", value: registrants.length, color: "text-indigo-400",  bg: "bg-indigo-500/10 border-indigo-500/20"  },
                { label: "Paid",       value: paid,               color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
                { label: "Pending",    value: pending,            color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20"     },
                { label: "Rejected",   value: rejected,           color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20"         },
              ].map(s => (
                <div key={s.label} className={`rounded-2xl border ${s.bg} p-4 text-center`}>
                  <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 font-medium">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Money */}
            {selectedEvent.price > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-2xl border bg-emerald-500/10 border-emerald-500/20 p-5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Total Collected</p>
                  <p className="text-3xl font-black text-emerald-400">{formatPHP(collected)}</p>
                  <p className="text-xs text-gray-500 mt-1">{paid} paid × {formatPHP(selectedEvent.price)}</p>
                </div>
                <div className="rounded-2xl border bg-amber-500/10 border-amber-500/20 p-5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Pending</p>
                  <p className="text-3xl font-black text-amber-400">{formatPHP(outstanding)}</p>
                  <p className="text-xs text-gray-500 mt-1">{registrants.length - paid} pending × {formatPHP(selectedEvent.price)}</p>
                </div>
              </div>
            )}

            {/* Confirmed list */}
            {paid > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Confirmed Payments</p>
                <div className="space-y-1.5">
                  {registrants.filter(r => r.paymentStatus === "paid").map(r => (
                    <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/40 border border-gray-700/30">
                      <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                      <span className="text-sm text-gray-200 flex-1 truncate">{r.fullName}</span>
                      <span className="text-xs text-gray-500">{METHOD_LABELS[r.paymentMethod]}</span>
                      {selectedEvent.price > 0 && (
                        <span className="text-sm font-bold text-emerald-400">{formatPHP(selectedEvent.price)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending list */}
            {pending > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Awaiting Confirmation</p>
                <div className="space-y-1.5">
                  {registrants.filter(r => r.paymentStatus === "pending_review").map(r => (
                    <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                      <Clock size={14} className="text-amber-400 shrink-0" />
                      <span className="text-sm text-gray-200 flex-1 truncate">{r.fullName}</span>
                      <span className="text-xs text-gray-500">{METHOD_LABELS[r.paymentMethod]}</span>
                      {r.referenceNumber && (
                        <span className="text-xs text-amber-400/70 font-mono">{r.referenceNumber}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── SHARE tab ─── */}
        {detailTab === "share" && (
          <div className="space-y-6">
            {/* QR */}
            <div className="flex flex-col items-center">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Registration QR Code</p>
              <div className="bg-white p-4 rounded-2xl shadow-2xl">
                <img src={qrUrl(regLink, 220)} alt="Registration QR" className="w-44 h-44 block" />
              </div>
              <p className="text-xs text-gray-500 mt-3 text-center max-w-xs leading-relaxed">
                Share this QR anywhere — social media, group chats, projector screen. Scanning opens the registration form instantly.
              </p>
              <a
                href={qrUrl(regLink, 600)}
                download={`${selectedEvent.title}-qr.png`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                <Download size={15} /> Download QR (High-res)
              </a>
            </div>

            {/* Link */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Shareable Link</p>
              <div className="flex gap-2">
                <div className="flex-1 px-3 py-2.5 bg-gray-800/60 border border-gray-700/50 rounded-xl text-xs text-gray-400 font-mono truncate">
                  {regLink}
                </div>
                <button
                  onClick={copyLink}
                  className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0 ${
                    copied
                      ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600/30"
                  }`}
                >
                  {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-2">Paste this link in your GC, Messenger, Facebook, or anywhere you share event info.</p>
            </div>

            {/* Payment reminder */}
            {selectedEvent.price > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
                <p className="text-xs font-semibold text-amber-400 mb-1">Payment Info on the Form</p>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Registrants will see your GCash QR, Maya QR, and/or bank transfer details directly on the registration page. They enter their reference number and submit — you confirm in the Finance tab.
                </p>
              </div>
            )}

            {/* Dashboard link for pastors/mentors */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Pastor / Mentor Dashboard Link</p>
              <p className="text-xs text-gray-600 mb-2">Share this read-only link so leaders can monitor registrations live — no login needed.</p>
              <div className="flex gap-2">
                <div className="flex-1 px-3 py-2.5 bg-gray-800/60 border border-gray-700/50 rounded-xl text-xs text-gray-400 font-mono truncate">
                  {`${window.location.origin}${window.location.pathname}?event=${selectedEvent.id}&view=dashboard`}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${window.location.origin}${window.location.pathname}?event=${selectedEvent.id}&view=dashboard`
                    );
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0 ${
                    copied
                      ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-violet-600/20 text-violet-400 border border-violet-500/30 hover:bg-violet-600/30"
                  }`}
                >
                  {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
                </button>
              </div>
            </div>

            {/* CSV Export */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Download Report</p>
              <p className="text-xs text-gray-600 mb-2">Export all registrant data as a CSV file for records or follow-up.</p>
              <button
                onClick={() => {
                  const headers = ["Name", "Phone", "Email", "Church", "Payment Method", "Status", "Reference No.", "Registered At"];
                  const rows = registrants.map(r => [
                    r.fullName,
                    r.phone,
                    r.email ?? "",
                    r.church ?? "",
                    r.paymentMethod,
                    r.paymentStatus,
                    r.referenceNumber ?? "",
                    r.registeredAt?.toDate?.()?.toLocaleString("en-PH") ?? "",
                  ]);
                  const csv = [headers, ...rows]
                    .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
                    .join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `${selectedEvent.title.replace(/\s+/g, "_")}_registrants.csv`;
                  a.click();
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-xl text-sm font-semibold transition-colors"
              >
                <Download size={15} /> Download CSV Report
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── EVENTS LIST VIEW ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-[60vh]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Ticket size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Events</h1>
            <p className="text-xs text-gray-400 dark:text-gray-500">Registrations & payment tracking</p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => { resetCreate(); setShowCreate(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-xl font-semibold text-sm shadow shadow-amber-500/20 transition-all"
          >
            <Plus size={16} /> New Event
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="animate-spin text-amber-400" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
            <Ticket size={28} className="text-amber-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-300 mb-1">No events yet</h3>
          <p className="text-sm text-gray-500 max-w-xs leading-relaxed mb-5">
            Create your first event to start collecting registrations and tracking payments automatically.
          </p>
          {isAdmin && (
            <button
              onClick={() => { resetCreate(); setShowCreate(true); }}
              className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl font-semibold text-sm shadow transition-all hover:shadow-lg"
            >
              <Plus size={15} /> Create First Event
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map(ev => {
            const d    = new Date(ev.date + "T00:00:00");
            const past = d < new Date();
            return (
              <button
                key={ev.id}
                onClick={() => { setSelectedEvent(ev); setDetailTab("registrants"); setSearchQuery(""); }}
                className="text-left bg-gray-800/60 border border-gray-700/50 hover:border-amber-500/40 rounded-2xl p-5 transition-all hover:shadow-xl hover:shadow-amber-500/5 group"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    ev.status === "open" && !past
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : "bg-gray-500/15 text-gray-400 border-gray-600/30"
                  }`}>
                    {ev.status === "open" && !past ? "🟢 Open" : "⚫ Closed"}
                  </span>
                  <ArrowRight size={14} className="text-gray-600 group-hover:text-amber-400 transition-colors shrink-0 mt-0.5" />
                </div>

                <h3 className="text-base font-bold text-white leading-snug mb-1 truncate">{ev.title}</h3>

                <div className="space-y-1.5 mb-4">
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Calendar size={11} className="text-amber-400/70 shrink-0" />
                    {d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                    {ev.time && ` · ${ev.time}`}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <MapPin size={11} className="text-violet-400/70 shrink-0" />
                    <span className="truncate">{ev.venue}</span>
                  </div>
                  {ev.price > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Wallet size={11} className="text-amber-400/70 shrink-0" />
                      {formatPHP(ev.price)} / person
                    </div>
                  )}
                </div>

                <div className="flex items-center pt-3 border-t border-gray-700/40 text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <QrCode size={11} /> Share & Register
                  </div>
                  <ArrowRight size={12} className="ml-auto text-gray-600 group-hover:text-amber-400 transition-colors" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Create Event Modal ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700/60 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">

            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-800 shrink-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <Ticket size={15} className="text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-white">New Event</h2>
                <p className="text-[10px] text-gray-500">
                  Step {createStep} of 2 — {createStep === 1 ? "Basic Info" : "Payment Setup"}
                </p>
              </div>
              <div className="flex gap-1.5 mr-2">
                {[1, 2].map(s => (
                  <div key={s} className={`w-2 h-2 rounded-full transition-all ${createStep >= s ? "bg-amber-500" : "bg-gray-700"}`} />
                ))}
              </div>
              <button
                onClick={() => { setShowCreate(false); resetCreate(); }}
                className="p-1.5 text-gray-500 hover:text-gray-200 transition-colors rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {createStep === 1 ? (
                <>
                  {/* Title */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Event Title *</label>
                    <input
                      value={fTitle} onChange={e => setFTitle(e.target.value)}
                      placeholder="e.g. Youth Camp 2025"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white placeholder-gray-600 outline-none focus:border-amber-500/60 transition-colors"
                    />
                  </div>
                  {/* Description */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description</label>
                    <textarea
                      value={fDesc} onChange={e => setFDesc(e.target.value)} rows={2}
                      placeholder="Brief description of the event…"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white placeholder-gray-600 outline-none focus:border-amber-500/60 transition-colors resize-none"
                    />
                  </div>
                  {/* Date + Time */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Date *</label>
                      <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white outline-none focus:border-amber-500/60 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Time</label>
                      <input type="time" value={fTime} onChange={e => setFTime(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white outline-none focus:border-amber-500/60 transition-colors"
                      />
                    </div>
                  </div>
                  {/* Venue */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Venue *</label>
                    <input
                      value={fVenue} onChange={e => setFVenue(e.target.value)}
                      placeholder="e.g. Metro Manila Bible College, Las Piñas"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white placeholder-gray-600 outline-none focus:border-amber-500/60 transition-colors"
                    />
                  </div>
                  {/* Price + Capacity */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Fee (₱)</label>
                      <input
                        type="number" value={fPrice} onChange={e => setFPrice(e.target.value)}
                        placeholder="0 = free"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white placeholder-gray-600 outline-none focus:border-amber-500/60 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Max Slots</label>
                      <input
                        type="number" value={fCapacity} onChange={e => setFCapacity(e.target.value)}
                        placeholder="Unlimited"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white placeholder-gray-600 outline-none focus:border-amber-500/60 transition-colors"
                      />
                    </div>
                  </div>
                </>
              ) : (
                /* Step 2 — Payment Setup */
                <>
                  <div className="flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <span className="text-base shrink-0">💡</span>
                    <p className="text-xs text-amber-300/90 leading-relaxed">
                      Upload your GCash and/or Maya QR images so registrants can see them directly on the form and know exactly how to pay.
                    </p>
                  </div>

                  {/* GCash QR upload */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      GCash QR Code
                    </label>
                    <div className="flex gap-3 items-start">
                      {fGcashPreview ? (
                        <div className="relative shrink-0">
                          <img src={fGcashPreview} className="w-24 h-24 rounded-xl object-contain bg-white p-1" alt="GCash QR" />
                          <button
                            onClick={() => { setFGcashFile(null); setFGcashPreview(""); }}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center"
                          ><X size={11} /></button>
                        </div>
                      ) : (
                        <label className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-700 flex flex-col items-center justify-center cursor-pointer hover:border-amber-500/60 transition-colors shrink-0">
                          <Smartphone size={18} className="text-gray-600 mb-1" />
                          <span className="text-[10px] text-gray-600">Upload</span>
                          <input type="file" accept="image/*" className="hidden"
                            onChange={pickImage(f => setFGcashFile(f), setFGcashPreview)} />
                        </label>
                      )}
                      <div className="flex-1 pt-1">
                        <p className="text-xs text-gray-500 leading-relaxed">Screenshot of your GCash QR — registrants scan this to send payment.</p>
                      </div>
                    </div>
                  </div>

                  {/* Maya QR upload */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Maya QR Code
                    </label>
                    <div className="flex gap-3 items-start">
                      {fMayaPreview ? (
                        <div className="relative shrink-0">
                          <img src={fMayaPreview} className="w-24 h-24 rounded-xl object-contain bg-white p-1" alt="Maya QR" />
                          <button
                            onClick={() => { setFMayaFile(null); setFMayaPreview(""); }}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center"
                          ><X size={11} /></button>
                        </div>
                      ) : (
                        <label className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-700 flex flex-col items-center justify-center cursor-pointer hover:border-amber-500/60 transition-colors shrink-0">
                          <Smartphone size={18} className="text-gray-600 mb-1" />
                          <span className="text-[10px] text-gray-600">Upload</span>
                          <input type="file" accept="image/*" className="hidden"
                            onChange={pickImage(f => setFMayaFile(f), setFMayaPreview)} />
                        </label>
                      )}
                      <div className="flex-1 pt-1">
                        <p className="text-xs text-gray-500 leading-relaxed">Screenshot of your Maya (PayMaya) QR for those who prefer Maya.</p>
                      </div>
                    </div>
                  </div>

                  {/* Bank Transfer */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Bank Transfer Details
                    </label>
                    <div className="space-y-2">
                      <input value={fBankName} onChange={e => setFBankName(e.target.value)}
                        placeholder="Bank Name (e.g. BDO, BPI, Metrobank)"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white placeholder-gray-600 outline-none focus:border-amber-500/60 transition-colors"
                      />
                      <input value={fBankAcctName} onChange={e => setFBankAcctName(e.target.value)}
                        placeholder="Account Name"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white placeholder-gray-600 outline-none focus:border-amber-500/60 transition-colors"
                      />
                      <input value={fBankAcctNum} onChange={e => setFBankAcctNum(e.target.value)}
                        placeholder="Account Number"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white placeholder-gray-600 outline-none focus:border-amber-500/60 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Instructions */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Payment Instructions</label>
                    <textarea
                      value={fInstructions} onChange={e => setFInstructions(e.target.value)} rows={2}
                      placeholder='e.g. "Use your FULL NAME as the reference when sending payment"'
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white placeholder-gray-600 outline-none focus:border-amber-500/60 transition-colors resize-none"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-800 flex gap-3 shrink-0">
              {createStep === 1 ? (
                <>
                  <button
                    onClick={() => { setShowCreate(false); resetCreate(); }}
                    className="flex-1 py-2.5 rounded-xl border border-gray-700 text-sm text-gray-400 hover:bg-gray-800 transition-colors"
                  >Cancel</button>
                  <button
                    onClick={() => {
                      if (!fTitle.trim() || !fDate || !fVenue.trim()) {
                        onToast("error", "Title, Date and Venue are required"); return;
                      }
                      setCreateStep(2);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-sm font-semibold shadow transition-all flex items-center justify-center gap-2"
                  >
                    Next: Payment Setup <ArrowRight size={15} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setCreateStep(1)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-700 text-sm text-gray-400 hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                  >
                    <ChevronLeft size={15} /> Back
                  </button>
                  <button
                    onClick={createEvent} disabled={creating}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 disabled:opacity-60 text-white text-sm font-semibold shadow transition-all flex items-center justify-center gap-2"
                  >
                    {creating
                      ? <><Loader2 size={15} className="animate-spin" /> Creating…</>
                      : <><Ticket size={15} /> Create Event</>}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
