import React, { useState, useEffect } from "react";
import {
  collection, doc, addDoc, getDocs, onSnapshot,
  query, orderBy, serverTimestamp, updateDoc, setDoc, deleteDoc,
} from "firebase/firestore";
import { Member } from "./types";
import { ref as sRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import {
  Plus, X, Ticket, Calendar, MapPin, Users, Wallet,
  Copy, Check, CheckCircle2, XCircle, Clock, Circle, UserCheck, Trash2, Pencil,
  ChevronLeft, Download, Search, Loader2, RefreshCw,
  Smartphone, ArrowRight, Building2, QrCode, Share2, ExternalLink, Image,
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
  // Internal contribution fields
  type?: "external" | "internal";
  workingAmount?: number;
  studentAmount?: number;
  collectorId?: string;
  collectorName?: string;
  collectorToken?: string;
  expenses?: { label: string; amount: number }[];
  contributionTiers?: { name: string; amount: number }[];  // flexible tiers e.g. Working, Student, Honorary…
  memberOptions?: { id: string; name: string; photo: string }[]; // roster for self-reg form
  bannerUrl?: string;
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

interface Props {
  userId: string;
  userName: string;
  isAdmin: boolean;
  members: Member[];
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
export default function EventsView({ userId, userName, isAdmin, members, onToast }: Props) {
  const [events, setEvents] = useState<MinistryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<MinistryEvent | null>(null);
  const [detailTab, setDetailTab] = useState<"registrants" | "finance" | "share" | "contributions" | "budget">("registrants");
  const [registrants, setRegistrants] = useState<Registrant[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [contributionsLoading, setContributionsLoading] = useState(false);
  const [registrantsLoading, setRegistrantsLoading] = useState(false);
  const [searchQuery,  setSearchQuery]  = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending_review" | "paid" | "rejected" | "archived">("all");
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [copiedId,     setCopiedId]     = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [copiedCollector, setCopiedCollector] = useState(false);
  // helper: flash a named copy button for 2 s
  const flashCopy = (id: string) => { setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); };

  // ── Internal event form state ─────────────────────────────────────────────
  const [fType, setFType] = useState<"external" | "internal">("external");
  const [fTiers, setFTiers] = useState<{name: string; amount: string}[]>([
    { name: "Working", amount: "" }, { name: "Student", amount: "" },
  ]);
  const [fCollectorId, setFCollectorId] = useState("");
  const [fExpenses, setFExpenses] = useState<{label: string; amount: string}[]>([{ label: "", amount: "" }]);

  // ── Rejection flow state ─────────────────────────────────────────────────────
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  // ── Create modal state ───────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [creating,   setCreating]   = useState(false);

  // ── Edit modal state ─────────────────────────────────────────────────────────
  const [showEdit, setShowEdit]   = useState(false);
  const [saving,   setSaving]     = useState(false);

  // ── Delete confirm state ─────────────────────────────────────────────────────
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting,           setDeleting]           = useState(false);

  // ── Inline amount editing (contributions) ────────────────────────────────────
  const [editingAmountId,  setEditingAmountId]  = useState<string | null>(null);
  const [editingAmountVal, setEditingAmountVal] = useState("");
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

  // Banner
  const [fBannerFile, setFBannerFile] = useState<File | null>(null);
  const [fBannerPreview, setFBannerPreview] = useState("");
  const [fBannerError, setFBannerError] = useState("");

  // Path-based URLs: /r/ID (registration), /d/ID (dashboard)
  // iOS PWA standalone mode silently drops query params from shared links
  // but always preserves the URL path — so /r/ID format works reliably on mobile.
  const origin  = window.location.origin;
  const regLink = selectedEvent ? `${origin}/r/${selectedEvent.id}` : "";

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

  // ── Firestore: load events once (one-time fetch, not real-time) ──────────────
  // getDocs saves ~95% reads vs onSnapshot — no need for live updates on the events list.
  const fetchEvents = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "events"), orderBy("createdAt", "desc")));
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as MinistryEvent)));
    } catch { /* noop */ }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchEvents(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Contributions listener (internal events only) ──────────────────────────
  useEffect(() => {
    if (!selectedEvent || selectedEvent.type !== "internal") {
      setContributions([]); return;
    }
    setContributionsLoading(true);
    const unsub = onSnapshot(
      query(collection(db, "events", selectedEvent.id, "contributions"), orderBy("memberName", "asc")),
      snap => {
        setContributions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Contribution)));
        setContributionsLoading(false);
      },
      () => setContributionsLoading(false)
    );
    return () => unsub();
  }, [selectedEvent?.id, selectedEvent?.type]);

  // Toggle contribution paid status (admin)
  const toggleContribution = async (c: Contribution) => {
    if (!selectedEvent) return;
    await updateDoc(doc(db, "events", selectedEvent.id, "contributions", c.id), {
      paid: !c.paid,
      paidAt: !c.paid ? serverTimestamp() : null,
      markedBy: userName,
    });
  };

  // Cycle through contribution tiers for a member
  const toggleMemberType = async (c: Contribution) => {
    if (!selectedEvent) return;
    const tiers = selectedEvent.contributionTiers
      ?? (selectedEvent.workingAmount || selectedEvent.studentAmount
        ? [{ name: "Working", amount: selectedEvent.workingAmount ?? 0 }, { name: "Student", amount: selectedEvent.studentAmount ?? 0 }]
        : [{ name: c.memberType, amount: c.amount }]);
    const currentIdx = tiers.findIndex(t => t.name.toLowerCase() === c.memberType.toLowerCase());
    const nextTier = tiers[(currentIdx + 1) % tiers.length];
    await updateDoc(doc(db, "events", selectedEvent.id, "contributions", c.id), {
      memberType: nextTier.name,
      amount: nextTier.amount,
    });
  };

  // Save a custom actual amount for a contribution
  const saveContributionAmount = async (c: Contribution) => {
    if (!selectedEvent) return;
    const newVal = parseFloat(editingAmountVal);
    if (isNaN(newVal) || newVal < 0) { setEditingAmountId(null); return; }
    await updateDoc(doc(db, "events", selectedEvent.id, "contributions", c.id), {
      amount: newVal,
    });
    setEditingAmountId(null);
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const resetCreate = () => {
    setFTitle(""); setFDesc(""); setFDate(""); setFTime("");
    setFVenue(""); setFPrice(""); setFCapacity("");
    setFGcashFile(null); setFGcashPreview("");
    setFMayaFile(null); setFMayaPreview("");
    setFBankName(""); setFBankAcctName(""); setFBankAcctNum(""); setFInstructions("");
    setFType("external"); setFTiers([{ name: "Working", amount: "" }, { name: "Student", amount: "" }]);
    setFCollectorId(""); setFExpenses([{ label: "", amount: "" }]);
    setFBannerFile(null); setFBannerPreview(""); setFBannerError("");
    setCreateStep(1);
  };

  // ── Open edit modal — pre-fill form state from selectedEvent ─────────────────
  const openEdit = (ev: MinistryEvent) => {
    setFTitle(ev.title);
    setFDesc(ev.description ?? "");
    setFDate(ev.date);
    setFTime(ev.time ?? "");
    setFVenue(ev.venue);
    setFPrice(ev.price > 0 ? String(ev.price) : "");
    setFCapacity(ev.capacity ? String(ev.capacity) : "");
    setFType(ev.type ?? "external");
    // Populate tiers from contributionTiers if available, else fall back to legacy fields
    if (ev.contributionTiers && ev.contributionTiers.length > 0) {
      setFTiers(ev.contributionTiers.map(t => ({ name: t.name, amount: String(t.amount) })));
    } else {
      setFTiers([
        { name: "Working", amount: ev.workingAmount ? String(ev.workingAmount) : "" },
        { name: "Student", amount: ev.studentAmount ? String(ev.studentAmount) : "" },
      ]);
    }
    setFCollectorId(ev.collectorId ?? "");
    setFExpenses(
      (ev.expenses ?? []).length > 0
        ? ev.expenses!.map(e => ({ label: e.label, amount: String(e.amount) }))
        : [{ label: "", amount: "" }]
    );
    // Pre-fill banner preview if event has one
    setFBannerFile(null);
    setFBannerPreview(ev.bannerUrl ?? "");
    setFBannerError("");
    setShowEdit(true);
  };

  // ── Save edited event ────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedEvent) return;
    if (!fTitle.trim() || !fDate || !fVenue.trim()) {
      onToast("error", "Title, Date, and Venue are required"); return;
    }
    setSaving(true);
    try {
      // Upload new banner if selected
      let bannerUrl = selectedEvent.bannerUrl ?? "";
      if (fBannerFile) {
        const snap = await uploadBytes(sRef(storage, `events/banners/${uid()}_${fBannerFile.name}`), fBannerFile);
        bannerUrl = await getDownloadURL(snap.ref);
      } else if (!fBannerPreview) {
        bannerUrl = ""; // user cleared the banner
      }
      const updates: Record<string, unknown> = {
        title:       fTitle.trim(),
        description: fDesc.trim(),
        date:        fDate,
        time:        fTime,
        venue:       fVenue.trim(),
        price:       parseFloat(fPrice) || 0,
        capacity:    fCapacity ? parseInt(fCapacity) : null,
        bannerUrl,
      };
      if (selectedEvent.type === "internal") {
        const collectorMember = members.find(m => m.id === fCollectorId);
        const validTiers = fTiers.filter(t => t.name.trim()).map(t => ({ name: t.name.trim(), amount: parseFloat(t.amount) || 0 }));
        updates.contributionTiers = validTiers;
        // Keep legacy fields for backward compat
        updates.workingAmount  = validTiers.find(t => t.name.toLowerCase() === "working")?.amount ?? (parseFloat(fTiers[0]?.amount) || 0);
        updates.studentAmount  = validTiers.find(t => t.name.toLowerCase() === "student")?.amount ?? (parseFloat(fTiers[1]?.amount) || 0);
        updates.collectorId    = fCollectorId;
        updates.collectorName  = collectorMember?.name ?? "";
        updates.expenses       = fExpenses
          .filter(e => e.label.trim())
          .map(e => ({ label: e.label.trim(), amount: parseFloat(e.amount) || 0 }));
      }
      await updateDoc(doc(db, "events", selectedEvent.id), updates);
      // Update local selectedEvent so the detail view reflects changes immediately
      setSelectedEvent({ ...selectedEvent, ...updates } as MinistryEvent);
      // Also update the events list
      setEvents(prev => prev.map(e => e.id === selectedEvent.id ? { ...e, ...updates } as MinistryEvent : e));
      setShowEdit(false);
      onToast("success", "✅ Event updated!");
    } catch (err) {
      console.error(err);
      onToast("error", "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete event ─────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!selectedEvent) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "events", selectedEvent.id));
      setEvents(prev => prev.filter(e => e.id !== selectedEvent.id));
      setSelectedEvent(null);
      setShowDeleteConfirm(false);
      onToast("success", "🗑️ Event deleted.");
    } catch (err) {
      console.error(err);
      onToast("error", "Failed to delete event");
    } finally {
      setDeleting(false);
    }
  };

  const pickImage = (
    fileSetter: (f: File) => void,
    previewSetter: (s: string) => void,
    maxMB = 5,
    errorSetter?: (s: string) => void,
  ) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > maxMB * 1024 * 1024) {
      errorSetter?.(`File too large — max ${maxMB} MB`);
      e.target.value = "";
      return;
    }
    errorSetter?.("");
    fileSetter(f);
    const reader = new FileReader();
    reader.onload = ev => previewSetter(ev.target?.result as string);
    reader.readAsDataURL(f);
  };

  const pickBanner = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setFBannerError("Banner is too large — maximum file size is 5 MB.");
      e.target.value = "";
      return;
    }
    setFBannerError("");
    setFBannerFile(f);
    const reader = new FileReader();
    reader.onload = ev => setFBannerPreview(ev.target?.result as string);
    reader.readAsDataURL(f);
  };

  const createEvent = async () => {
    if (!fTitle.trim() || !fDate || !fVenue.trim()) {
      onToast("error", "Title, Date and Venue are required"); return;
    }
    if (fType === "internal") {
      const collectorMember = members.find(m => m.id === fCollectorId);
      const validTiersCheck = fTiers.filter(t => t.name.trim() && t.amount);
      if (validTiersCheck.length === 0) {
        onToast("error", "Add at least one contribution tier with a name and amount"); return;
      }
      if (!collectorMember) {
        onToast("error", "Please assign a collector"); return;
      }
    }
    setCreating(true);
    try {
      const collectorMember = members.find(m => m.id === fCollectorId);
      const collectorToken = uid() + uid(); // 16-char random token

      let gcashQRUrl = "";
      let mayaQRUrl  = "";
      let bannerUrl  = "";
      if (fBannerFile) {
        const snap = await uploadBytes(sRef(storage, `events/banners/${uid()}_${fBannerFile.name}`), fBannerFile);
        bannerUrl = await getDownloadURL(snap.ref);
      }
      if (fType === "external") {
        if (fGcashFile) {
          const snap = await uploadBytes(sRef(storage, `events/gcash-${uid()}.jpg`), fGcashFile);
          gcashQRUrl = await getDownloadURL(snap.ref);
        }
        if (fMayaFile) {
          const snap = await uploadBytes(sRef(storage, `events/maya-${uid()}.jpg`), fMayaFile);
          mayaQRUrl = await getDownloadURL(snap.ref);
        }
      }

      const baseData: Record<string, unknown> = {
        type:        fType,
        title:       fTitle.trim(),
        description: fDesc.trim(),
        date:        fDate,
        time:        fTime,
        venue:       fVenue.trim(),
        price:       parseFloat(fPrice) || 0,
        capacity:    fCapacity ? parseInt(fCapacity) : null,
        status:      "open",
        bannerUrl,
        paymentInfo: { gcashQRUrl, mayaQRUrl,
          bankName: fBankName.trim(), bankAccountName: fBankAcctName.trim(),
          bankAccountNumber: fBankAcctNum.trim(), instructions: fInstructions.trim(),
        },
        createdBy:  userId,
        createdAt:  serverTimestamp(),
      };

      if (fType === "internal") {
        const validTiers = fTiers.filter(t => t.name.trim()).map(t => ({ name: t.name.trim(), amount: parseFloat(t.amount) || 0 }));
        baseData.contributionTiers = validTiers;
        // Legacy compat fields
        baseData.workingAmount  = validTiers.find(t => t.name.toLowerCase() === "working")?.amount ?? (parseFloat(fTiers[0]?.amount) || 0);
        baseData.studentAmount  = validTiers.find(t => t.name.toLowerCase() === "student")?.amount ?? (parseFloat(fTiers[1]?.amount) || 0);
        baseData.collectorId    = fCollectorId;
        baseData.collectorName  = collectorMember?.name ?? "";
        baseData.collectorToken = collectorToken;
        baseData.expenses       = fExpenses
          .filter(e => e.label.trim())
          .map(e => ({ label: e.label.trim(), amount: parseFloat(e.amount) || 0 }));
        // Store member roster in the same write (no separate updateDoc needed)
        baseData.memberOptions  = members
          .filter(m => m.status === "active")
          .map(m => ({ id: m.id, name: m.name, photo: m.photo || "" }));
      }

      const eventRef = await addDoc(collection(db, "events"), baseData);

      onToast("success", "🎉 Event created!");
      setShowCreate(false);
      resetCreate();
      fetchEvents(); // refresh list after creating
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
    flashCopy("reg-link");
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
        {/* ── Slim Header ── */}
        <div className="mb-5">
          {/* Back row */}
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => { setSelectedEvent(null); setRegistrants([]); setSearchQuery(""); }}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors font-medium"
            >
              <ChevronLeft size={15} /> Back to Events
            </button>
            <span className="text-gray-700 text-xs">/</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
              selectedEvent.status === "open" && !isPast
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : "bg-gray-700/60 text-gray-500 border-gray-600/40"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${selectedEvent.status === "open" && !isPast ? "bg-emerald-400" : "bg-gray-500"}`} />
              {selectedEvent.status === "open" && !isPast ? "Open" : "Closed"}
            </span>
            {isAdmin && (
              <div className="flex items-center gap-1.5 ml-auto">
                <button onClick={() => openEdit(selectedEvent)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-300 bg-gray-800 hover:bg-gray-700 border border-gray-700/60 hover:border-gray-600 transition-all">
                  <Pencil size={11} /> Edit
                </button>
                <button onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-400 bg-red-900/20 hover:bg-red-900/40 border border-red-800/40 transition-all">
                  <Trash2 size={11} /> Delete
                </button>
              </div>
            )}
          </div>

          {/* ── Banner image ── */}
          {selectedEvent.bannerUrl && (
            <div className="w-full overflow-x-auto mb-4">
              <div className="min-w-[640px] rounded-2xl overflow-hidden border border-gray-700/40 shadow-lg shadow-black/30">
                <img
                  src={selectedEvent.bannerUrl}
                  alt={`${selectedEvent.title} banner`}
                  className="w-full h-auto block"
                />
              </div>
            </div>
          )}

          {/* Title + meta */}
          <h1 className="text-xl font-black text-white tracking-tight leading-tight mb-2">{selectedEvent.title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <Calendar size={11} className="text-amber-400" />
              {formatDate(selectedEvent.date)}{selectedEvent.time && ` · ${selectedEvent.time}`}
            </span>
            <span className="text-gray-700">·</span>
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <MapPin size={11} className="text-violet-400" />
              {selectedEvent.venue}
            </span>
            {selectedEvent.type !== "internal" && selectedEvent.price > 0 && (
              <>
                <span className="text-gray-700">·</span>
                <span className="flex items-center gap-1.5 text-xs text-gray-400">
                  <Wallet size={11} className="text-emerald-400" />
                  {formatPHP(selectedEvent.price)}/person
                </span>
              </>
            )}
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-800">
            {[
              { label: "Total",    value: active.length,   cls: "text-white",        dot: "bg-gray-500" },
              { label: "Pending",  value: pending,         cls: "text-amber-400",   dot: "bg-amber-400" },
              { label: "Paid",     value: paid,            cls: "text-emerald-400", dot: "bg-emerald-400" },
              { label: "Rejected", value: rejected,        cls: "text-red-400",     dot: "bg-red-400" },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-800/80 border border-gray-700/50">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
                <span className={`text-sm font-black ${s.cls}`}>{s.value}</span>
                <span className="text-[10px] text-gray-500 font-medium">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-0 mb-5 border-b border-gray-800">
          {selectedEvent.type === "internal" ? (
            (["contributions", "budget", "share"] as const).map(tab => (
              <button key={tab} onClick={() => setDetailTab(tab)}
                className={`relative px-4 py-2.5 text-xs font-bold transition-all ${
                  detailTab === tab
                    ? "text-amber-400"
                    : "text-gray-500 hover:text-gray-300"
                }`}>
                {tab === "contributions" ? "Members" : tab === "budget" ? "Budget" : "Share"}
                {tab === "contributions" && (
                  <span className={`ml-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                    detailTab === tab ? "bg-amber-500/25 text-amber-300" : "bg-gray-700 text-gray-500"
                  }`}>{contributions.length}</span>
                )}
                {detailTab === tab && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400 rounded-full" />}
              </button>
            ))
          ) : (
            (["registrants", "finance", "share"] as const).map(tab => (
              <button key={tab} onClick={() => setDetailTab(tab)}
                className={`relative px-4 py-2.5 text-xs font-bold transition-all ${
                  detailTab === tab ? "text-amber-400" : "text-gray-500 hover:text-gray-300"
                }`}>
                {tab === "registrants" ? "Registrants" : tab === "finance" ? "Finance" : "Share"}
                {tab === "registrants" && (
                  <span className={`ml-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                    detailTab === tab ? "bg-amber-500/25 text-amber-300" : "bg-gray-700 text-gray-500"
                  }`}>{active.length}</span>
                )}
                {tab === "finance" && pending > 0 && (
                  <span className="ml-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-red-900/60 text-red-300">{pending}</span>
                )}
                {detailTab === tab && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400 rounded-full" />}
              </button>
            ))
          )}
        </div>

        {/* ─── REGISTRANTS tab ─── */}
        {detailTab === "registrants" && (
          <div>
            {/* Search + filter row */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                <input
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search name, phone, email…"
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-gray-700/60 bg-gray-800/50 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-amber-500/40 transition-colors"
                />
              </div>
              <div className="flex gap-1">
                {([
                  { key: "all",            label: "All",      count: active.length },
                  { key: "pending_review", label: "Pending",  count: pending },
                  { key: "paid",           label: "Paid",     count: paid },
                  { key: "rejected",       label: "Rejected", count: rejected },
                  { key: "archived",       label: "Archived", count: archived.length },
                ] as const).map(({ key, label, count }) => (
                  <button key={key} onClick={() => setStatusFilter(key)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                      statusFilter === key
                        ? key === "pending_review" ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                        : key === "paid"           ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                        : key === "rejected"       ? "bg-red-500/20 border-red-500/40 text-red-300"
                        : key === "archived"       ? "bg-gray-600/30 border-gray-500/40 text-gray-300"
                        :                           "bg-white/10 border-white/20 text-white"
                        : "bg-transparent border-gray-700/40 text-gray-600 hover:text-gray-400 hover:border-gray-600"
                    }`}>
                    {label} <span className="font-black opacity-60">{count}</span>
                  </button>
                ))}
              </div>
            </div>

            {registrantsLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={22} className="animate-spin text-amber-400" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-12 h-12 rounded-2xl bg-gray-800 border border-gray-700 flex items-center justify-center mb-3">
                  <Users size={20} className="text-gray-600" />
                </div>
                <p className="text-sm font-semibold text-gray-400 mb-1">
                  {statusFilter === "archived" ? "No archived entries" : searchQuery ? "No matches" : "No registrants yet"}
                </p>
                <p className="text-xs text-gray-600">
                  {statusFilter !== "archived" && !searchQuery && "Share the link to collect sign-ups"}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-700/50 overflow-hidden">
                {/* Table header */}
                <div className="hidden sm:grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center px-4 py-2.5 bg-gray-800/80 border-b border-gray-700/50">
                  <div className="w-4" />
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Registrant</p>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Status</p>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Actions</p>
                </div>

                <div className="divide-y divide-gray-800/80">
                  {filtered.map((r, idx) => (
                    <div key={r.id} className={`transition-colors ${
                      r.archived ? "bg-gray-800/20 opacity-50"
                      : r.paymentStatus === "paid" ? "bg-emerald-950/20 hover:bg-emerald-950/30"
                      : r.paymentStatus === "rejected" ? "bg-red-950/15 hover:bg-red-950/25"
                      : "bg-gray-900/60 hover:bg-gray-800/60"
                    }`}>
                      {/* Main compact row */}
                      <div className="flex items-center gap-3 px-4 py-3">
                        {/* Archive checkbox */}
                        <label className="shrink-0 cursor-pointer" title={r.archived ? "Restore" : "Archive"}>
                          <input type="checkbox" checked={!!r.archived}
                            onChange={() => r.archived ? restoreRegistrant(r.id) : archiveRegistrant(r.id)}
                            className="hidden" />
                          <div className={`w-3.5 h-3.5 rounded border-[1.5px] flex items-center justify-center transition-all ${
                            r.archived ? "bg-gray-500 border-gray-500" : "border-gray-600 hover:border-gray-400"
                          }`}>
                            {r.archived && <Check size={9} className="text-white" />}
                          </div>
                        </label>

                        {/* Avatar */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-xs shrink-0 ${
                          r.archived ? "bg-gray-700"
                          : r.paymentStatus === "paid" ? "bg-gradient-to-br from-emerald-500 to-teal-600"
                          : r.paymentStatus === "rejected" ? "bg-gray-700"
                          : "bg-gradient-to-br from-amber-500 to-orange-600"
                        }`}>
                          {r.fullName[0]?.toUpperCase()}
                        </div>

                        {/* Name + details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-sm font-semibold leading-none ${
                              r.paymentStatus === "rejected" ? "text-gray-500 line-through" : "text-white"
                            }`}>{r.fullName}</p>
                            {/* Status badge */}
                            <span className={`inline-flex items-center h-4 px-1.5 rounded text-[9px] font-black uppercase tracking-wide border ${
                              r.paymentStatus === "paid"           ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                              : r.paymentStatus === "rejected"     ? "bg-red-500/15 text-red-400 border-red-500/25"
                              :                                       "bg-amber-500/15 text-amber-400 border-amber-500/25"
                            }`}>
                              {r.paymentStatus === "paid" ? "Paid" : r.paymentStatus === "rejected" ? "Rejected" : "Pending"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-[11px] text-gray-500">{r.phone}</span>
                            {r.email && <span className="text-[11px] text-gray-600">· {r.email}</span>}
                            {r.church && <span className="text-[11px] text-gray-600">· {r.church}</span>}
                            <span className="text-[11px] text-gray-600">via {METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod}</span>
                            {r.referenceNumber && <span className="text-[11px] text-gray-600">Ref: {r.referenceNumber}</span>}
                            {r.proofUrl && (
                              <a href={r.proofUrl} target="_blank" rel="noreferrer"
                                className="text-[10px] font-bold text-violet-400 hover:text-violet-300 flex items-center gap-0.5 transition-colors">
                                <ExternalLink size={9} /> Proof
                              </a>
                            )}
                          </div>
                          {r.paymentStatus === "rejected" && r.rejectionNote && (
                            <p className="text-[10px] text-red-400/70 mt-0.5 italic">↳ {r.rejectionNote}</p>
                          )}
                          {r.paymentStatus === "paid" && r.confirmedBy && (
                            <p className="text-[10px] text-emerald-500/70 mt-0.5">✓ Confirmed by {r.confirmedBy}</p>
                          )}
                        </div>

                        {/* Action buttons */}
                        {!r.archived && rejectingId !== r.id && (
                          <div className="flex items-center gap-1 shrink-0 ml-auto">
                            {r.paymentStatus === "pending_review" && (
                              <>
                                <button
                                  onClick={() => { const url = `${origin}/r/${selectedEvent.id}?registrant=${r.id}`; navigator.clipboard.writeText(url); setCopiedLinkId(r.id); setTimeout(() => setCopiedLinkId(null), 2000); }}
                                  className="h-7 px-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 text-[10px] font-bold hover:border-indigo-500/50 hover:text-indigo-400 transition-all flex items-center gap-1"
                                >
                                  {copiedLinkId === r.id ? <><Check size={9} /> OK</> : <><Copy size={9} /> Link</>}
                                </button>
                                <button onClick={() => confirmPayment(r.id)} disabled={actioningId === r.id}
                                  className="h-7 px-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-black hover:bg-emerald-500/25 transition-all disabled:opacity-50 flex items-center gap-1">
                                  {actioningId === r.id ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />} Confirm
                                </button>
                                <button onClick={() => { setRejectingId(r.id); setRejectNote(""); }} disabled={actioningId === r.id}
                                  className="h-7 px-2.5 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-[10px] font-black hover:bg-red-500/20 transition-all disabled:opacity-50 flex items-center gap-1">
                                  <XCircle size={10} /> Reject
                                </button>
                              </>
                            )}
                            {r.paymentStatus === "rejected" && (
                              <>
                                <button
                                  onClick={() => { const url = `${origin}/r/${selectedEvent.id}?registrant=${r.id}`; navigator.clipboard.writeText(url); setCopiedLinkId(r.id); setTimeout(() => setCopiedLinkId(null), 2000); }}
                                  className="h-7 px-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 text-[10px] font-bold hover:border-indigo-500/50 hover:text-indigo-400 transition-all flex items-center gap-1"
                                >
                                  {copiedLinkId === r.id ? <><Check size={9} /> OK</> : <><Copy size={9} /> Link</>}
                                </button>
                                <button onClick={() => reopenPayment(r.id)} disabled={actioningId === r.id}
                                  className="h-7 px-2.5 rounded-lg bg-gray-700/60 border border-gray-600 text-gray-300 text-[10px] font-bold hover:bg-amber-500/20 hover:text-amber-300 hover:border-amber-500/30 transition-all disabled:opacity-50 flex items-center gap-1">
                                  {actioningId === r.id ? <Loader2 size={10} className="animate-spin" /> : null} ↩ Reopen
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Inline reject reason input */}
                      {rejectingId === r.id && (
                        <div className="px-4 pb-3 pt-0 border-t border-red-900/30">
                          <p className="text-[10px] text-red-400/60 font-semibold uppercase tracking-wider mb-1.5 mt-2">Rejection reason <span className="normal-case font-normal opacity-60">(optional)</span></p>
                          <div className="flex gap-2">
                            <input autoFocus value={rejectNote} onChange={e => setRejectNote(e.target.value)}
                              onKeyDown={e => e.key === "Enter" && rejectPayment(r.id, rejectNote)}
                              placeholder="e.g. Payment name doesn't match…"
                              className="flex-1 px-3 py-1.5 rounded-lg border border-red-800/40 bg-red-950/30 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-red-500/50" />
                            <button onClick={() => { setRejectingId(null); setRejectNote(""); }}
                              className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-400 hover:bg-gray-800 transition-colors">Cancel</button>
                            <button onClick={() => rejectPayment(r.id, rejectNote)} disabled={actioningId === r.id}
                              className="px-3 py-1.5 rounded-lg bg-red-600/30 hover:bg-red-600/50 text-red-300 border border-red-500/30 text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5">
                              {actioningId === r.id ? <Loader2 size={10} className="animate-spin" /> : <XCircle size={12} />} Reject
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
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
                { label: "Registered", value: registrants.length, color: "text-indigo-300",  bg: "bg-indigo-500/10 border-indigo-500/20", icon: "🎟" },
                { label: "Paid",       value: paid,               color: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/20", icon: "✅" },
                { label: "Pending",    value: pending,            color: "text-amber-300",   bg: "bg-amber-500/10 border-amber-500/20",   icon: "⏳" },
                { label: "Rejected",   value: rejected,           color: "text-red-300",     bg: "bg-red-500/10 border-red-500/20",       icon: "❌" },
              ].map(s => (
                <div key={s.label} className={`rounded-2xl border ${s.bg} p-4 text-center hover:-translate-y-0.5 transition-transform duration-200`}>
                  <p className="text-lg mb-0.5">{s.icon}</p>
                  <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
                  <p className="text-[11px] text-gray-500 mt-1 font-semibold uppercase tracking-wide">{s.label}</p>
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

        {/* ─── CONTRIBUTIONS tab (internal events) ─── */}
        {detailTab === "contributions" && selectedEvent.type === "internal" && (
          <div>
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: "Paid", value: contributions.filter(c => c.paid).length, color: "text-emerald-400" },
                { label: "Unpaid", value: contributions.filter(c => !c.paid).length, color: "text-amber-400" },
                { label: "Collected", value: formatPHP(contributions.filter(c => c.paid).reduce((s, c) => s + c.amount, 0)), color: "text-indigo-400", small: true },
              ].map(s => (
                <div key={s.label} className="bg-gray-800/60 border border-gray-700/40 rounded-xl p-3 text-center">
                  <p className={`${s.small ? "text-base" : "text-2xl"} font-black ${s.color}`}>{s.value}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {contributionsLoading ? (
              <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-amber-400" /></div>
            ) : contributions.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Users size={20} className="text-amber-400" />
                </div>
                <p className="text-sm font-semibold text-white">No members signed up yet</p>
                <p className="text-xs text-gray-500 max-w-xs leading-relaxed">
                  Share the <span className="text-amber-400">Member Sign-Up Link</span> (in the Share tab) with your team so they can register their participation.
                </p>
                <button onClick={() => setDetailTab("share")}
                  className="text-xs text-amber-400 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 px-4 py-2 rounded-xl font-semibold transition-colors">
                  Go to Share Tab →
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {contributions.map(c => (
                  <div key={c.id} className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all ${
                    c.paid ? "bg-emerald-900/10 border-emerald-700/20" : "bg-gray-800/50 border-gray-700/40"
                  }`}>
                    {/* Pay toggle */}
                    <button onClick={() => toggleContribution(c)}
                      className={`shrink-0 transition-colors ${c.paid ? "text-emerald-400" : "text-gray-600 hover:text-gray-400"}`}>
                      {c.paid ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                    </button>
                    {/* Avatar */}
                    {c.memberPhoto ? (
                      <img src={c.memberPhoto} alt={c.memberName}
                        className="w-8 h-8 rounded-full object-cover shrink-0 border border-gray-700" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                        {c.memberName[0]?.toUpperCase()}
                      </div>
                    )}
                    {/* Name + editable amount */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${c.paid ? "text-emerald-300" : "text-white"}`}>
                        {c.memberName}
                      </p>
                      {editingAmountId === c.id ? (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[11px] text-gray-500">₱</span>
                          <input
                            type="number"
                            value={editingAmountVal}
                            onChange={e => setEditingAmountVal(e.target.value)}
                            onBlur={() => saveContributionAmount(c)}
                            onKeyDown={e => { if (e.key === "Enter") saveContributionAmount(c); if (e.key === "Escape") setEditingAmountId(null); }}
                            autoFocus
                            className="w-20 px-1 py-0.5 text-[11px] text-white bg-gray-700 border border-amber-500/50 rounded-md outline-none"
                          />
                          <button onClick={() => saveContributionAmount(c)} className="text-emerald-400 hover:text-emerald-300">
                            <Check size={12} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingAmountId(c.id); setEditingAmountVal(String(c.amount)); }}
                          className="text-[11px] text-gray-500 hover:text-amber-400 transition-colors"
                          title="Click to edit actual amount"
                        >
                          {formatPHP(c.amount)} <span className="text-gray-700 text-[10px]">✎</span>
                        </button>
                      )}
                    </div>
                    {/* Type toggle */}
                    <button
                      onClick={() => toggleMemberType(c)}
                      className={`text-[10px] font-bold px-2 py-1 rounded-full border transition-colors ${
                        c.memberType === "student"
                          ? "bg-violet-500/15 text-violet-300 border-violet-500/30 hover:bg-violet-500/25"
                          : "bg-indigo-500/15 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/25"
                      }`}
                    >
                      {c.memberType === "student" ? "Student" : "Working"}
                    </button>
                    {/* Paid badge */}
                    {c.paid && (
                      <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/25 px-2 py-0.5 rounded-full shrink-0">
                        PAID
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-gray-600 text-center mt-4">
              Tap ✓ to mark paid · tap Working/Student to switch rate · tap amount (✎) to edit actual amount
            </p>
          </div>
        )}

        {/* ─── BUDGET tab (internal events) ─── */}
        {detailTab === "budget" && selectedEvent.type === "internal" && (() => {
          const expenses = selectedEvent.expenses ?? [];
          const totalExpenses   = expenses.reduce((s, e) => s + e.amount, 0);
          const totalCollected  = contributions.filter(c => c.paid).reduce((s, c) => s + c.amount, 0);
          const totalTarget     = contributions.reduce((s, c) => s + c.amount, 0);
          const surplus         = totalCollected - totalExpenses;
          return (
            <div className="space-y-5">
              {/* Expense items */}
              {expenses.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Budget Items</p>
                  <div className="bg-gray-800/60 border border-gray-700/40 rounded-xl overflow-hidden">
                    {expenses.map((e, i) => (
                      <div key={i} className="flex justify-between px-4 py-3 border-b border-gray-700/40 last:border-0">
                        <p className="text-sm text-gray-300">{e.label}</p>
                        <p className="text-sm font-semibold text-white">{formatPHP(e.amount)}</p>
                      </div>
                    ))}
                    <div className="flex justify-between px-4 py-3 bg-gray-700/30">
                      <p className="text-sm font-bold text-white">Total Need</p>
                      <p className="text-sm font-black text-amber-400">{formatPHP(totalExpenses)}</p>
                    </div>
                  </div>
                </div>
              )}
              {/* Financial summary */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Collection Summary</p>
                <div className="space-y-2">
                  {[
                    { label: "Expected (all working)", value: totalTarget, color: "text-gray-300" },
                    { label: "Collected so far", value: totalCollected, color: "text-emerald-400" },
                    { label: "Remaining", value: totalTarget - totalCollected, color: "text-amber-400" },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between px-4 py-2.5 bg-gray-800/40 rounded-xl border border-gray-700/30">
                      <p className="text-sm text-gray-400">{row.label}</p>
                      <p className={`text-sm font-bold ${row.color}`}>{formatPHP(row.value)}</p>
                    </div>
                  ))}
                </div>
              </div>
              {/* Surplus/Deficit */}
              {expenses.length > 0 && (
                <div className={`flex justify-between px-4 py-4 rounded-xl border ${
                  surplus >= 0
                    ? "bg-emerald-900/20 border-emerald-700/30"
                    : "bg-red-900/20 border-red-700/30"
                }`}>
                  <p className="text-sm font-bold text-white">{surplus >= 0 ? "Surplus" : "Shortfall"}</p>
                  <p className={`text-lg font-black ${surplus >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {surplus >= 0 ? "+" : ""}{formatPHP(surplus)}
                  </p>
                </div>
              )}
              {/* Contribution rates */}
              <div className="flex gap-3">
                <div className="flex-1 bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 text-center">
                  <p className="text-xs text-indigo-300 mb-1">Working Rate</p>
                  <p className="text-lg font-black text-white">{formatPHP(selectedEvent.workingAmount ?? 0)}</p>
                </div>
                <div className="flex-1 bg-violet-500/10 border border-violet-500/20 rounded-xl p-3 text-center">
                  <p className="text-xs text-violet-300 mb-1">Student Rate</p>
                  <p className="text-lg font-black text-white">{formatPHP(selectedEvent.studentAmount ?? 0)}</p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ─── SHARE tab ─── */}
        {detailTab === "share" && (
          <div className="space-y-5">

            {/* ── Internal Event: Member Sign-Up + Collector Links ── */}
            {selectedEvent.type === "internal" && (
              <>
                {/* Member Sign-Up Link */}
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                      <Users size={13} className="text-amber-400" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-amber-300 uppercase tracking-wider">Member Sign-Up Link</p>
                      <p className="text-[11px] text-gray-500">Share with your team — they pick their name &amp; confirm their contribution</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 px-3 py-2 bg-gray-900/60 border border-gray-700/50 rounded-xl text-[11px] text-gray-400 font-mono truncate">
                      {`${origin}/?event=${selectedEvent.id}&view=member-register`}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${origin}/?event=${selectedEvent.id}&view=member-register`);
                        setCopiedCollector(true); setTimeout(() => setCopiedCollector(false), 2000);
                      }}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${copiedCollector ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30" : "bg-amber-600/20 text-amber-400 border border-amber-500/30 hover:bg-amber-600/30"}`}
                    >
                      {copiedCollector ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
                    </button>
                  </div>
                </div>

                {/* Collector Link */}
                <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0">
                      <UserCheck size={13} className="text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Collector Link</p>
                      <p className="text-[11px] text-gray-500">Share only with <span className="text-white font-semibold">{selectedEvent.collectorName || "the assigned collector"}</span> — marks who paid</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 px-3 py-2 bg-gray-900/60 border border-gray-700/50 rounded-xl text-[11px] text-gray-400 font-mono truncate">
                      {`${origin}/?event=${selectedEvent.id}&view=collector&token=${selectedEvent.collectorToken}`}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${origin}/?event=${selectedEvent.id}&view=collector&token=${selectedEvent.collectorToken}`);
                        flashCopy("collector");
                      }}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${copiedId === "collector" ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30" : "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600/30"}`}
                    >
                      {copiedId === "collector" ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ── External Event: QR + Links ── */}
            {selectedEvent.type !== "internal" && <>
            {/* QR — premium card */}
            <div className="bg-gradient-to-br from-indigo-900/40 to-violet-900/30 border border-indigo-500/20 rounded-2xl p-6 flex flex-col items-center">
              <p className="text-xs font-bold text-indigo-300 uppercase tracking-widest mb-4">📷 Registration QR Code</p>
              <div className="bg-white p-4 rounded-2xl shadow-2xl ring-4 ring-indigo-500/20">
                <img src={qrUrl(regLink, 220)} alt="Registration QR" className="w-44 h-44 block" />
              </div>
              <p className="text-xs text-gray-400 mt-4 text-center max-w-xs leading-relaxed">
                Share this QR anywhere — social media, group chats, projector screen. Scanning opens the registration form instantly.
              </p>
              <a
                href={qrUrl(regLink, 600)}
                download={`${selectedEvent.title}-qr.png`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-indigo-500/30"
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
                    copiedId === "reg-link"
                      ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600/30"
                  }`}
                >
                  {copiedId === "reg-link" ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
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
                  {`${origin}/d/${selectedEvent.id}`}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${origin}/d/${selectedEvent.id}`
                    );
                    flashCopy("dashboard");
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0 ${
                    copiedId === "dashboard"
                      ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-violet-600/20 text-violet-400 border border-violet-500/30 hover:bg-violet-600/30"
                  }`}
                >
                  {copiedId === "dashboard" ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
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
            </> /* end external event share */}
          </div>
        )}

      {/* ── Edit Event Modal ── */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700/60 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-800 shrink-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                <Pencil size={14} className="text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-white">Edit Event</h2>
                <p className="text-[11px] text-gray-500 truncate">{selectedEvent.title}</p>
              </div>
              <button onClick={() => setShowEdit(false)} className="p-1.5 text-gray-500 hover:text-gray-200 transition-colors rounded-lg">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Event Title *</label>
                <input value={fTitle} onChange={e => setFTitle(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white outline-none focus:border-indigo-500/60 transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description</label>
                <textarea value={fDesc} onChange={e => setFDesc(e.target.value)} rows={2}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white outline-none focus:border-indigo-500/60 transition-colors resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Date *</label>
                  <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white outline-none focus:border-indigo-500/60 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Time</label>
                  <input type="time" value={fTime} onChange={e => setFTime(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white outline-none focus:border-indigo-500/60 transition-colors" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Venue *</label>
                <input value={fVenue} onChange={e => setFVenue(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white outline-none focus:border-indigo-500/60 transition-colors" />
              </div>

              {/* ── Banner Image ── */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Image size={11} /> Event Banner
                    <span className="normal-case font-normal text-gray-600 ml-1">(optional)</span>
                  </label>
                  <span className="text-[10px] text-gray-600">1200 × 400 px · Max 5 MB</span>
                </div>

                {fBannerPreview ? (
                  <div className="space-y-2">
                    {/* Preview */}
                    <div className="relative rounded-xl overflow-hidden border border-gray-700/60">
                      <img
                        src={fBannerPreview}
                        alt="Event banner"
                        className="w-full h-auto block"
                      />
                    </div>
                    {/* Action row — clearly visible below the image */}
                    <div className="flex items-center gap-2">
                      <label className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 text-xs font-semibold cursor-pointer transition-all">
                        <input type="file" accept="image/*" onChange={pickBanner} className="hidden" />
                        <Image size={12} />
                        {fBannerFile ? "Replace Image" : "Change Image"}
                      </label>
                      <button
                        type="button"
                        onClick={() => { setFBannerFile(null); setFBannerPreview(""); setFBannerError(""); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-400 text-xs font-semibold transition-all"
                      >
                        <X size={12} /> Remove
                      </button>
                    </div>
                    {fBannerFile && (
                      <p className="text-[10px] text-gray-500 truncate">New file: {fBannerFile.name}</p>
                    )}
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-24 rounded-xl border-2 border-dashed border-gray-700/60 hover:border-indigo-500/50 bg-gray-800/30 hover:bg-gray-800/60 cursor-pointer transition-all group">
                    <input type="file" accept="image/*" onChange={pickBanner} className="hidden" />
                    <Image size={18} className="text-gray-600 group-hover:text-indigo-400 mb-1 transition-colors" />
                    <p className="text-xs text-gray-500 group-hover:text-gray-300 transition-colors">Click to upload banner</p>
                    <p className="text-[10px] text-gray-600 mt-0.5">PNG, JPG, WebP · Max 5 MB</p>
                  </label>
                )}
                {fBannerError && (
                  <p className="text-[11px] text-red-400 mt-1.5 flex items-center gap-1">
                    <XCircle size={11} /> {fBannerError}
                  </p>
                )}
              </div>

              {selectedEvent.type === "internal" ? (
                <>
                  {/* Dynamic contribution tiers */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Contribution Tiers *</label>
                      <span className="text-[10px] text-gray-600">e.g. Working, Student, Honorary…</span>
                    </div>
                    <div className="space-y-2">
                      {fTiers.map((t, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <input
                            value={t.name}
                            onChange={e => { const arr = [...fTiers]; arr[i].name = e.target.value; setFTiers(arr); }}
                            placeholder="Category name"
                            className="flex-1 px-3 py-2 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white placeholder-gray-600 outline-none focus:border-indigo-500/60 transition-colors"
                          />
                          <div className="relative w-28 shrink-0">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">₱</span>
                            <input type="number" value={t.amount}
                              onChange={e => { const arr = [...fTiers]; arr[i].amount = e.target.value; setFTiers(arr); }}
                              placeholder="0"
                              className="w-full pl-6 pr-2 py-2 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white outline-none focus:border-indigo-500/60 transition-colors"
                            />
                          </div>
                          {fTiers.length > 1 && (
                            <button onClick={() => setFTiers(fTiers.filter((_, j) => j !== i))} className="text-gray-600 hover:text-red-400 transition-colors shrink-0">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button onClick={() => setFTiers([...fTiers, { name: "", amount: "" }])}
                        className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors mt-1">
                        <Plus size={12} /> Add tier
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                      <UserCheck size={12} className="inline mr-1" />Collector
                    </label>
                    <select value={fCollectorId} onChange={e => setFCollectorId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white outline-none focus:border-indigo-500/60 transition-colors">
                      <option value="">— Select a collector —</option>
                      {members.filter(m => m.status === "active").map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Budget Items</label>
                    <div className="space-y-2">
                      {fExpenses.map((exp, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <input value={exp.label}
                            onChange={e => { const arr = [...fExpenses]; arr[i].label = e.target.value; setFExpenses(arr); }}
                            placeholder="e.g. Court Fee"
                            className="flex-1 px-3 py-2 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white placeholder-gray-600 outline-none focus:border-indigo-500/60 transition-colors" />
                          <div className="relative w-28 shrink-0">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">₱</span>
                            <input type="number" value={exp.amount}
                              onChange={e => { const arr = [...fExpenses]; arr[i].amount = e.target.value; setFExpenses(arr); }}
                              placeholder="0"
                              className="w-full pl-6 pr-2 py-2 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white outline-none focus:border-indigo-500/60 transition-colors" />
                          </div>
                          <button onClick={() => setFExpenses(fExpenses.filter((_, j) => j !== i))}
                            className="text-gray-600 hover:text-red-400 transition-colors shrink-0">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      <button onClick={() => setFExpenses([...fExpenses, { label: "", amount: "" }])}
                        className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors mt-1">
                        <Plus size={12} /> Add item
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Price / Person</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₱</span>
                      <input type="number" value={fPrice} onChange={e => setFPrice(e.target.value)} placeholder="0"
                        className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white outline-none focus:border-indigo-500/60 transition-colors" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Capacity (slots)</label>
                    <input type="number" value={fCapacity} onChange={e => setFCapacity(e.target.value)} placeholder="Unlimited"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white outline-none focus:border-indigo-500/60 transition-colors" />
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-800 flex gap-3 shrink-0">
              <button onClick={() => setShowEdit(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-700 text-sm text-gray-400 hover:bg-gray-800 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 disabled:opacity-60 text-white text-sm font-semibold shadow transition-all flex items-center justify-center gap-2">
                {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Check size={15} /> Save Changes</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-red-500/20 rounded-3xl w-full max-w-sm shadow-2xl p-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={24} className="text-red-400" />
            </div>
            <h2 className="text-lg font-bold text-white mb-2">Delete Event?</h2>
            <p className="text-sm text-gray-400 mb-1">
              <span className="text-white font-semibold">"{selectedEvent.title}"</span> will be permanently removed.
            </p>
            <p className="text-xs text-gray-600 mb-6">
              {selectedEvent.type === "internal"
                ? "Contributions data will remain in Firestore but will no longer be accessible."
                : "All registrant data will become inaccessible."}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl border border-gray-700 text-sm text-gray-400 hover:bg-gray-800 transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2">
                {deleting ? <><Loader2 size={15} className="animate-spin" /> Deleting…</> : <><Trash2 size={15} /> Yes, Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
    );
  }

  // ── EVENTS LIST VIEW ───────────────────────────────────────────────────────
  return (
    <div className="min-h-[60vh]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/25">
            <Ticket size={20} className="text-white" />
          </span>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-gray-900 dark:text-white">Events</h1>
            <p className="text-xs text-gray-400 dark:text-gray-500">Registrations & payment tracking</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchEvents()}
            className="p-2.5 text-gray-400 hover:text-white border border-gray-700/50 hover:border-gray-600 rounded-xl transition-all hover:bg-gray-800/60"
            title="Refresh events list"
          >
            <RefreshCw size={14} />
          </button>
          {isAdmin && (
            <button
              onClick={() => { resetCreate(); setShowCreate(true); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl font-semibold text-sm shadow-md shadow-amber-500/25 transition-all"
            >
              <Plus size={16} /> New Event
            </button>
          )}
        </div>
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
            const isOpen = ev.status === "open" && !past;
            return (
              <button
                key={ev.id}
                onClick={() => { setSelectedEvent(ev); setDetailTab(ev.type === "internal" ? "contributions" : "registrants"); setSearchQuery(""); }}
                className="text-left bg-gray-800/60 border border-gray-700/50 hover:border-amber-500/40 rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-xl hover:shadow-amber-500/10 hover:-translate-y-0.5 group"
              >
                {/* Banner image OR thin accent bar */}
                {ev.bannerUrl ? (
                  <div className="relative w-full h-32">
                    <img src={ev.bannerUrl} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-gray-900/70 via-transparent to-black/30" />
                    <div className="absolute top-2.5 left-3 right-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border backdrop-blur-sm ${
                          isOpen ? "bg-emerald-900/60 text-emerald-300 border-emerald-500/40" : "bg-gray-900/60 text-gray-400 border-gray-600/40"
                        }`}>{isOpen ? "● Open" : "● Closed"}</span>
                        {ev.type === "internal" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-900/60 text-violet-300 border border-violet-500/40 backdrop-blur-sm">Team</span>
                        )}
                      </div>
                      <ArrowRight size={14} className="text-white/60 group-hover:text-amber-400 transition-colors shrink-0" />
                    </div>
                  </div>
                ) : (
                  <div className={`h-1 ${
                    ev.type === "internal" ? "bg-gradient-to-r from-violet-500 to-purple-600"
                    : isOpen ? "bg-gradient-to-r from-amber-500 to-orange-500" : "bg-gray-700"
                  }`} />
                )}

                <div className="p-5">
                  {/* Status row — only when no banner */}
                  {!ev.bannerUrl && (
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          isOpen ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-gray-500/15 text-gray-400 border-gray-600/30"
                        }`}>{isOpen ? "● Open" : "● Closed"}</span>
                        {ev.type === "internal" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/15 text-violet-400 border border-violet-500/30">Team</span>
                        )}
                      </div>
                      <ArrowRight size={14} className="text-gray-600 group-hover:text-amber-400 transition-colors shrink-0 mt-0.5" />
                    </div>
                  )}

                  <h3 className="text-base font-bold text-white leading-snug mb-3 truncate">{ev.title}</h3>

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
                  {ev.type !== "internal" && ev.price > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Wallet size={11} className="text-amber-400/70 shrink-0" />
                      {formatPHP(ev.price)} / person
                    </div>
                  )}
                  {ev.type === "internal" && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 flex-wrap">
                      <Wallet size={11} className="text-amber-400/70 shrink-0" />
                      {(ev.contributionTiers ?? [
                        { name: "Working", amount: ev.workingAmount ?? 0 },
                        { name: "Student", amount: ev.studentAmount ?? 0 },
                      ]).map((t, i) => (
                        <span key={i}>{t.name}: {formatPHP(t.amount)}{i < ((ev.contributionTiers?.length ?? 2) - 1) ? " ·" : ""}&nbsp;</span>
                      ))}
                    </div>
                  )}
                </div>

                  <div className="flex items-center pt-3 border-t border-gray-700/40 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <QrCode size={11} /> Share &amp; Register
                    </div>
                    <ArrowRight size={12} className="ml-auto text-gray-600 group-hover:text-amber-400 transition-colors" />
                  </div>
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

            {/* Gradient Header */}
            <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-400 px-6 py-4 flex items-center gap-3 shrink-0">
              <span className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                <Ticket size={15} className="text-white" />
              </span>
              <div className="flex-1">
                <h2 className="text-base font-bold text-white">New Event</h2>
                <p className="text-[10px] text-white/70">
                  Step {createStep} of 2 — {createStep === 1 ? "Basic Info" : "Payment Setup"}
                </p>
              </div>
              <div className="flex gap-1.5 mr-2">
                {[1, 2].map(s => (
                  <div key={s} className={`w-2 h-2 rounded-full transition-all ${createStep >= s ? "bg-white" : "bg-white/30"}`} />
                ))}
              </div>
              <button
                onClick={() => { setShowCreate(false); resetCreate(); }}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/20 hover:bg-white/30 text-white transition-all"
              >
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {createStep === 1 ? (
                <>
                  {/* Event Type Toggle */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Event Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["external", "internal"] as const).map(t => (
                        <button key={t} onClick={() => setFType(t)}
                          className={`py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                            fType === t
                              ? t === "internal"
                                ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                                : "bg-indigo-500/20 border-indigo-500/50 text-indigo-300"
                              : "border-gray-700/50 text-gray-500 hover:text-gray-300"
                          }`}>
                          {t === "external" ? "🎟 External (Public)" : "🤝 Internal (Team)"}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-gray-600 mt-1.5">
                      {fType === "internal"
                        ? "Team contribution fund — members sign up via a shared form link."
                        : "Public registration form — anyone can sign up and pay."}
                    </p>
                  </div>

                  {/* Title */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Event Title *</label>
                    <input
                      value={fTitle} onChange={e => setFTitle(e.target.value)}
                      placeholder="e.g. Sports Day 2025"
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

                  {/* ── Event Banner ── */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Image size={11} /> Event Banner
                        <span className="normal-case font-normal text-gray-600 ml-1">(optional)</span>
                      </label>
                      <span className="text-[10px] text-gray-600">Recommended: 1200 × 400 px · Max 5 MB</span>
                    </div>

                    {fBannerPreview ? (
                      <div className="relative">
                        <img
                          src={fBannerPreview}
                          alt="Event banner preview"
                          className="w-full h-28 object-cover rounded-xl border border-gray-700/60"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent rounded-xl" />
                        <button
                          type="button"
                          onClick={() => { setFBannerFile(null); setFBannerPreview(""); setFBannerError(""); }}
                          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 hover:bg-red-600 text-white flex items-center justify-center transition-colors"
                          title="Remove banner"
                        >
                          <X size={12} />
                        </button>
                        <span className="absolute bottom-2 left-2 text-[10px] text-white/70 font-medium">
                          {fBannerFile ? fBannerFile.name : "Current banner"}
                        </span>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-28 rounded-xl border-2 border-dashed border-gray-700/60 hover:border-amber-500/50 bg-gray-800/30 hover:bg-gray-800/60 cursor-pointer transition-all group">
                        <input type="file" accept="image/*" onChange={pickBanner} className="hidden" />
                        <Image size={20} className="text-gray-600 group-hover:text-amber-400 mb-1.5 transition-colors" />
                        <p className="text-xs text-gray-500 group-hover:text-gray-300 transition-colors font-medium">Click to upload banner</p>
                        <p className="text-[10px] text-gray-600 mt-0.5">PNG, JPG, WebP · Max 5 MB</p>
                      </label>
                    )}
                    {fBannerError && (
                      <p className="text-[11px] text-red-400 mt-1.5 flex items-center gap-1">
                        <XCircle size={11} /> {fBannerError}
                      </p>
                    )}
                  </div>

                  {/* Price + Capacity — external events only */}
                  {fType !== "internal" && (
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
                  )}
                </>
              ) : (
                /* Step 2 — Payment Setup (external) or Contribution Setup (internal) */
                <>
                  {fType === "internal" ? (
                    /* ── Internal: Contribution Settings ── */
                    <>
                      <div className="flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                        <span className="text-base shrink-0">🤝</span>
                        <p className="text-xs text-amber-300/90 leading-relaxed">
                          Set your contribution tiers (e.g. Working, Student) and assign a collector. Members sign up via the form link.
                        </p>
                      </div>
                       {/* Dynamic contribution tiers */}
                       <div>
                         <div className="flex items-center justify-between mb-2">
                           <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Contribution Tiers *</label>
                           <span className="text-[10px] text-gray-600">e.g. Working, Student, Honorary…</span>
                         </div>
                         <div className="space-y-2">
                           {fTiers.map((t, i) => (
                             <div key={i} className="flex gap-2 items-center">
                               <input
                                 value={t.name}
                                 onChange={e => { const arr = [...fTiers]; arr[i].name = e.target.value; setFTiers(arr); }}
                                 placeholder="Category name"
                                 className="flex-1 px-3 py-2 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white placeholder-gray-600 outline-none focus:border-amber-500/60 transition-colors"
                               />
                               <div className="relative w-28 shrink-0">
                                 <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">₱</span>
                                 <input type="number" value={t.amount}
                                   onChange={e => { const arr = [...fTiers]; arr[i].amount = e.target.value; setFTiers(arr); }}
                                   placeholder="0"
                                   className="w-full pl-6 pr-2 py-2 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white outline-none focus:border-amber-500/60 transition-colors"
                                 />
                               </div>
                               {fTiers.length > 1 && (
                                 <button onClick={() => setFTiers(fTiers.filter((_, j) => j !== i))} className="text-gray-600 hover:text-red-400 transition-colors shrink-0">
                                   <Trash2 size={14} />
                                 </button>
                               )}
                             </div>
                           ))}
                           <button onClick={() => setFTiers([...fTiers, { name: "", amount: "" }])}
                             className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors mt-1">
                             <Plus size={12} /> Add tier
                           </button>
                         </div>
                       </div>
                      {/* Collector picker */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                          <UserCheck size={12} className="inline mr-1" />Assign Collector *
                        </label>
                        <select value={fCollectorId} onChange={e => setFCollectorId(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white outline-none focus:border-amber-500/60 transition-colors">
                          <option value="">— Select a collector —</option>
                          {members.filter(m => m.status === "active").map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      </div>
                      {/* Expense items */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Budget Items</label>
                        <div className="space-y-2">
                          {fExpenses.map((exp, i) => (
                            <div key={i} className="flex gap-2 items-center">
                              <input
                                value={exp.label}
                                onChange={e => { const arr = [...fExpenses]; arr[i].label = e.target.value; setFExpenses(arr); }}
                                placeholder="e.g. Court Fee"
                                className="flex-1 px-3 py-2 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white placeholder-gray-600 outline-none focus:border-amber-500/60 transition-colors"
                              />
                              <div className="relative w-28 shrink-0">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">₱</span>
                                <input type="number"
                                  value={exp.amount}
                                  onChange={e => { const arr = [...fExpenses]; arr[i].amount = e.target.value; setFExpenses(arr); }}
                                  placeholder="0"
                                  className="w-full pl-6 pr-2 py-2 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white placeholder-gray-600 outline-none focus:border-amber-500/60 transition-colors"
                                />
                              </div>
                              <button onClick={() => setFExpenses(fExpenses.filter((_, j) => j !== i))}
                                className="text-gray-600 hover:text-red-400 transition-colors shrink-0">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                          <button onClick={() => setFExpenses([...fExpenses, { label: "", amount: "" }])}
                            className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors mt-1">
                            <Plus size={12} /> Add item
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    /* ── External: Payment QR Setup ── */
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
                    Next: {fType === "internal" ? "Contribution Setup" : "Payment Setup"} <ArrowRight size={15} />
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

      {/* ── Edit Event Modal ── */}
      {showEdit && selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700/60 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            {/* Gradient Header */}
            <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 px-6 py-4 flex items-center gap-3 shrink-0">
              <span className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                <Pencil size={14} className="text-white" />
              </span>
              <div className="flex-1">
                <h2 className="text-base font-bold text-white">Edit Event</h2>
                <p className="text-[11px] text-white/70 truncate">{selectedEvent.title}</p>
              </div>
              <button onClick={() => setShowEdit(false)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/20 hover:bg-white/30 text-white transition-all">
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Event Title *</label>
                <input value={fTitle} onChange={e => setFTitle(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white placeholder-gray-600 outline-none focus:border-indigo-500/60 transition-colors" />
              </div>
              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description</label>
                <textarea value={fDesc} onChange={e => setFDesc(e.target.value)} rows={2}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white placeholder-gray-600 outline-none focus:border-indigo-500/60 transition-colors resize-none" />
              </div>
              {/* Date + Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Date *</label>
                  <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white outline-none focus:border-indigo-500/60 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Time</label>
                  <input type="time" value={fTime} onChange={e => setFTime(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white outline-none focus:border-indigo-500/60 transition-colors" />
                </div>
              </div>
              {/* Venue */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Venue *</label>
                <input value={fVenue} onChange={e => setFVenue(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white placeholder-gray-600 outline-none focus:border-indigo-500/60 transition-colors" />
              </div>
              {/* Internal fields */}
              {selectedEvent.type === "internal" ? (
                <>
                  {/* Dynamic contribution tiers */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Contribution Tiers *</label>
                      <span className="text-[10px] text-gray-600">e.g. Working, Student, Honorary…</span>
                    </div>
                    <div className="space-y-2">
                      {fTiers.map((t, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <input
                            value={t.name}
                            onChange={e => { const arr = [...fTiers]; arr[i].name = e.target.value; setFTiers(arr); }}
                            placeholder="Category name"
                            className="flex-1 px-3 py-2 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white placeholder-gray-600 outline-none focus:border-indigo-500/60 transition-colors"
                          />
                          <div className="relative w-28 shrink-0">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">₱</span>
                            <input type="number" value={t.amount}
                              onChange={e => { const arr = [...fTiers]; arr[i].amount = e.target.value; setFTiers(arr); }}
                              placeholder="0"
                              className="w-full pl-6 pr-2 py-2 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white outline-none focus:border-indigo-500/60 transition-colors"
                            />
                          </div>
                          {fTiers.length > 1 && (
                            <button onClick={() => setFTiers(fTiers.filter((_, j) => j !== i))} className="text-gray-600 hover:text-red-400 transition-colors shrink-0">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button onClick={() => setFTiers([...fTiers, { name: "", amount: "" }])}
                        className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors mt-1">
                        <Plus size={12} /> Add tier
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                      <UserCheck size={12} className="inline mr-1" />Collector
                    </label>
                    <select value={fCollectorId} onChange={e => setFCollectorId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white outline-none focus:border-indigo-500/60 transition-colors">
                      <option value="">— Select a collector —</option>
                      {members.filter(m => m.status === "active").map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Budget Items</label>
                    <div className="space-y-2">
                      {fExpenses.map((exp, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <input value={exp.label}
                            onChange={e => { const arr = [...fExpenses]; arr[i].label = e.target.value; setFExpenses(arr); }}
                            placeholder="e.g. Court Fee"
                            className="flex-1 px-3 py-2 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white placeholder-gray-600 outline-none focus:border-indigo-500/60 transition-colors" />
                          <div className="relative w-28 shrink-0">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">₱</span>
                            <input type="number" value={exp.amount}
                              onChange={e => { const arr = [...fExpenses]; arr[i].amount = e.target.value; setFExpenses(arr); }}
                              placeholder="0"
                              className="w-full pl-6 pr-2 py-2 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white outline-none focus:border-indigo-500/60 transition-colors" />
                          </div>
                          <button onClick={() => setFExpenses(fExpenses.filter((_, j) => j !== i))}
                            className="text-gray-600 hover:text-red-400 transition-colors shrink-0">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      <button onClick={() => setFExpenses([...fExpenses, { label: "", amount: "" }])}
                        className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors mt-1">
                        <Plus size={12} /> Add item
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* External: Price + Capacity */
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Price / Person</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₱</span>
                      <input type="number" value={fPrice} onChange={e => setFPrice(e.target.value)} placeholder="0"
                        className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white outline-none focus:border-indigo-500/60 transition-colors" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Capacity (slots)</label>
                    <input type="number" value={fCapacity} onChange={e => setFCapacity(e.target.value)} placeholder="Unlimited"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-700/60 bg-gray-800/60 text-sm text-white outline-none focus:border-indigo-500/60 transition-colors" />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-800 flex gap-3 shrink-0">
              <button onClick={() => setShowEdit(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-700 text-sm text-gray-400 hover:bg-gray-800 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 disabled:opacity-60 text-white text-sm font-semibold shadow transition-all flex items-center justify-center gap-2">
                {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Check size={15} /> Save Changes</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {showDeleteConfirm && selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-red-500/20 rounded-3xl w-full max-w-sm shadow-2xl p-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={24} className="text-red-400" />
            </div>
            <h2 className="text-lg font-bold text-white mb-2">Delete Event?</h2>
            <p className="text-sm text-gray-400 mb-1">
              <span className="text-white font-semibold">"{selectedEvent.title}"</span> will be permanently removed.
            </p>
            <p className="text-xs text-gray-600 mb-6">
              {selectedEvent.type === "internal"
                ? "Contributions data will remain in Firestore but will no longer be accessible."
                : "All registrant data linked to this event will become inaccessible."}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl border border-gray-700 text-sm text-gray-400 hover:bg-gray-800 transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2">
                {deleting ? <><Loader2 size={15} className="animate-spin" /> Deleting…</> : <><Trash2 size={15} /> Yes, Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
