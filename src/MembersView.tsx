import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import DatePicker from "./DatePicker";
import AutoTextarea from "./AutoTextarea";
import { Member } from "./types";
import { STATUS_CONFIG, ROLE_CATEGORIES, getRoleStyle } from "./constants";
import {
  Camera, Trash2, X, Phone, Mail, Search, ImagePlus, AlertTriangle,
  Check, Save, Edit, UserPlus, Users, Loader2, Cake, ChevronRight,
} from "lucide-react";

export interface MembersViewProps {
  allMembers: Member[];
  setAllMembers: React.Dispatch<React.SetStateAction<Member[]>>;
  isLoadingMembers: boolean;
  setIsLoadingMembers: React.Dispatch<React.SetStateAction<boolean>>;
  isAdmin: boolean;
  isLeader: boolean;
  canWriteMembers: boolean;
  canAddMember: boolean;
  canEditMember: (member: any) => boolean;
  canDeleteMember: boolean;
  myMemberProfile: Member | null;
  user: any;
  showToast: (type: string, msg: string) => void;
  showConfirm: (config: any) => void;
  closeConfirm: () => void;
}

const initials = (name: string) => {
  const p = (name || "").trim().split(/\s+/);
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : (p[0]?.[0] ?? "?").toUpperCase();
};

const fmtDate = (iso: string) => {
  if (!iso) return "";
  try { return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); }
  catch { return iso; }
};

const FILTER_TABS = ["All", "Active", "On Leave", "Inactive"] as const;

// ── Reusable Section Card ────────────────────────────────────────────────────
function SectionCard({ label, children, right }: { label: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900/60 border-b border-gray-200 dark:border-gray-700">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">{label}</p>
        {right}
      </div>
      <div className="p-4 bg-white dark:bg-gray-800/40">
        {children}
      </div>
    </div>
  );
}

export default function MembersView({
  allMembers, setAllMembers, isLoadingMembers, setIsLoadingMembers,
  isAdmin, isLeader, canWriteMembers, canAddMember, canEditMember, canDeleteMember,
  myMemberProfile, user, showToast, showConfirm, closeConfirm,
}: MembersViewProps) {

  const [view, setView] = useState<"list" | "detail" | "form">("list");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [filterTab, setFilterTab] = useState<typeof FILTER_TABS[number]>("All");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [fFirstName, setFFirstName] = useState("");
  const [fMI, setFMI] = useState("");
  const [fLastName, setFLastName] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fPhoto, setFPhoto] = useState<string>("");
  const [fRoles, setFRoles] = useState<string[]>([]);
  const [fStatus, setFStatus] = useState<"active" | "on-leave" | "inactive">("active");
  const [fBirthdate, setFBirthdate] = useState("");
  const [fNotes, setFNotes] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ── Cache ──────────────────────────────────────────────────────────────────
  const CACHE_KEY = "wf_members_cache";
  const CACHE_TTL = 20 * 60 * 1000;
  const readCache = (): any[] | null => {
    try { const r = localStorage.getItem(CACHE_KEY); if (!r) return null; const { members, ts } = JSON.parse(r); return Date.now() - ts > CACHE_TTL ? null : members; } catch { return null; }
  };
  const writeCache = (m: any[]) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ members: m, ts: Date.now() })); } catch {} };
  const clearCache = () => { try { localStorage.removeItem(CACHE_KEY); } catch {} };

  const fetchMembers = useCallback(async ({ background = false } = {}) => {
    if (!background) {
      const c = readCache();
      if (c) { setAllMembers(c); setIsLoadingMembers(false); fetchMembers({ background: true }); return; }
      setIsLoadingMembers(true);
    }
    try {
      const res = await fetch("/api/members");
      const data = await res.json();
      const members = Array.isArray(data) ? data : [];
      setAllMembers(members); writeCache(members);
    } catch { showToast("error", "Failed to load members."); if (!background) setAllMembers([]); }
    finally { if (!background) setIsLoadingMembers(false); }
  }, []);

  useEffect(() => {
    if (allMembers.length > 0) { setIsLoadingMembers(false); fetchMembers({ background: true }); }
    else fetchMembers();
    const t = setTimeout(() => setIsLoadingMembers(false), 10_000);
    return () => clearTimeout(t);
  }, []);

  const filtered = useMemo(() => {
    let list = allMembers;
    if (filterTab !== "All") {
      const map: Record<string, string> = { "Active": "active", "On Leave": "on-leave", "Inactive": "inactive" };
      list = list.filter(m => (m.status ?? "active") === map[filterTab]);
    }
    if (!searchQ.trim()) return list;
    const q = searchQ.toLowerCase();
    return list.filter(m =>
      m.name?.toLowerCase().includes(q) || m.phone?.toLowerCase().includes(q) ||
      m.roles?.some(r => r.toLowerCase().includes(q))
    );
  }, [allMembers, searchQ, filterTab]);

  const counts = useMemo(() => ({
    active: allMembers.filter(m => (m.status ?? "active") === "active").length,
    onLeave: allMembers.filter(m => m.status === "on-leave").length,
  }), [allMembers]);

  // ── Editor ─────────────────────────────────────────────────────────────────
  const openEditor = (member?: Member) => {
    setIsAddingNew(!member);
    if (member) {
      setSelectedMember(member);
      let fn = member.firstName || "", ln = member.lastName || "";
      if (!fn) {
        const p = (member.name || "").trim().split(/\s+/);
        fn = p[0] || "";
        ln = (p.length >= 3 && /^[A-Za-z]\.?$/.test(p[1]) ? p.slice(2) : p.slice(1)).join(" ");
      }
      setFFirstName(fn); setFMI(member.middleInitial || ""); setFLastName(ln);
      setFPhone(member.phone); setFEmail(member.email || ""); setFPhoto(member.photo || "");
      setFRoles(member.roles || []); setFStatus(member.status || "active");
      setFBirthdate(member.birthdate || ""); setFNotes(member.notes || "");
    } else {
      setSelectedMember(null);
      setFFirstName(""); setFMI(""); setFLastName(""); setFPhone(""); setFEmail("");
      setFPhoto(""); setFRoles([]); setFStatus("active"); setFBirthdate(""); setFNotes("");
    }
    setFormErrors({});
    setView("form");
  };

  const handleSave = async () => {
    if (isSaving) return;
    const errs: Record<string, string> = {};
    if (!fFirstName.trim()) errs.firstName = "Required";
    if (!fLastName.trim()) errs.lastName = "Required";
    if (!fPhone.trim()) errs.phone = "Required";
    if (!fEmail.trim()) errs.email = "Required";
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fEmail.trim())) errs.email = "Invalid email";
    if (!fBirthdate) errs.birthdate = "Required";
    if (Object.keys(errs).length) { setFormErrors(errs); return; }
    setFormErrors({});

    const mi = fMI.trim().replace(/\.$/, '');
    const fullName = `${fFirstName.trim()}${mi ? " " + mi.toUpperCase() + "." : ""} ${fLastName.trim()}`;

    if (!selectedMember?.id) {
      const dup = allMembers.find(m => {
        const p = (m.name || "").trim().split(/\s+/);
        const mF = (p[0] || "").toLowerCase();
        const mL = (p.length >= 3 && /^[A-Za-z]\.?$/.test(p[1]) ? p.slice(2) : p.slice(1)).join(" ").toLowerCase();
        return mF === fFirstName.trim().toLowerCase() && mL === fLastName.trim().toLowerCase() && m.phone.replace(/\D/g, '') === fPhone.replace(/\D/g, '');
      });
      if (dup) { showToast("error", `"${dup.name}" already exists.`); return; }
    }

    const payload = {
      name: fullName, firstName: fFirstName.trim(), middleInitial: mi, lastName: fLastName.trim(),
      phone: fPhone, email: fEmail.trim().toLowerCase(), photo: fPhoto, roles: fRoles,
      status: fStatus, birthdate: fBirthdate || undefined, notes: fNotes,
    };

    setIsSaving(true);
    try {
      const editId = selectedMember?.id;
      const res = editId
        ? await fetch(`/api/members/${editId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      const rd = await res.json();
      setAllMembers(prev => {
        const updated = editId
          ? prev.map(m => m.id === editId ? { ...m, ...payload, name: rd.name ?? payload.name } : m)
          : [{ id: rd.id, name: rd.name ?? payload.name, phone: payload.phone, email: payload.email, photo: payload.photo, roles: payload.roles, status: payload.status, notes: payload.notes } as Member, ...prev];
        writeCache(updated); return updated;
      });
      setView("list"); setSelectedMember(null);
      showToast("success", editId ? `"${payload.name}" updated!` : `"${payload.name}" added!`);
    } catch (e: any) { showToast("error", e.message || "Failed to save."); }
    finally { setIsSaving(false); }
  };

  const handleDelete = (id: string) => {
    const member = allMembers.find(m => m.id === id);
    showConfirm({
      title: "Remove Member", message: `Remove "${member?.name}"?`,
      detail: "This will permanently remove their profile.",
      confirmText: "Remove", confirmClass: "bg-red-500 hover:bg-red-600",
      onConfirm: async () => {
        setAllMembers(prev => { const u = prev.filter(m => m.id !== id); writeCache(u); return u; });
        setView("list"); setSelectedMember(null); closeConfirm();
        showToast("success", `"${member?.name}" removed.`);
        try { await fetch(`/api/members/${id}`, { method: "DELETE" }); }
        catch { showToast("error", "Failed. Restoring..."); clearCache(); fetchMembers(); }
      }
    });
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { showToast("error", "Photo must be under 2MB."); return; }
    setIsUploadingPhoto(true);
    const reader = new FileReader();
    reader.onload = () => { setFPhoto(reader.result as string); setIsUploadingPhoto(false); };
    reader.readAsDataURL(f);
    if (e.target) e.target.value = "";
  };

  const openCamera = async () => {
    setCameraError(""); setShowCamera(true);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = s;
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); } }, 120);
    } catch { setCameraError("Camera unavailable."); }
  };
  const closeCamera = () => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; setShowCamera(false); setCameraError(""); };
  const snapPhoto = () => {
    const v = videoRef.current; if (!v) return;
    const c = document.createElement("canvas"); c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
    c.getContext("2d")?.drawImage(v, 0, 0); setFPhoto(c.toDataURL("image/jpeg", 0.92)); closeCamera();
  };

  const previewName = [fFirstName, fMI ? fMI.toUpperCase() + "." : "", fLastName].filter(Boolean).join(" ") || "New Member";

  // ── Input className helper ─────────────────────────────────────────────────
  const inp = (err?: string) =>
    `w-full px-3.5 py-2.5 text-sm rounded-xl border outline-none transition-all dark:text-white placeholder:text-gray-300 dark:placeholder:text-gray-600 ${err
      ? "border-red-400 bg-red-50 dark:bg-red-900/10"
      : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/30"
    }`;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto">

      {/* ── Camera Modal ──────────────────────────────────────────────────── */}
      {showCamera && (
        <div className="fixed inset-0 z-[999] bg-black/80 backdrop-blur flex items-end sm:items-center justify-center" onClick={closeCamera}>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-t-3xl sm:rounded-2xl overflow-hidden w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-800">
              <span className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Camera size={14} className="text-indigo-500" /> Camera</span>
              <button onClick={closeCamera} className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"><X size={13} /></button>
            </div>
            {cameraError
              ? <div className="p-10 text-center"><p className="text-sm text-red-500 mb-4">{cameraError}</p><button onClick={closeCamera} className="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm text-gray-700 dark:text-gray-200">Close</button></div>
              : <>
                <div className="bg-black" style={{ aspectRatio: "3/4" }}><video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" /></div>
                <div className="flex items-center justify-center gap-8 p-5 bg-black">
                  <button onClick={closeCamera} className="text-white/40 hover:text-white text-sm font-medium transition-colors">Cancel</button>
                  <button onClick={snapPhoto} className="w-14 h-14 rounded-full bg-white border-4 border-indigo-500 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-xl"><Camera size={20} className="text-indigo-600" /></button>
                  <div className="w-16" />
                </div>
              </>
            }
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          FORM VIEW
      ══════════════════════════════════════════════════════════════════════ */}
      {view === "form" && (
        <div className="wf-card overflow-hidden flex flex-col">
          {/* ── Form Top Bar ────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">{isAddingNew ? "Add Member" : "Edit Member"}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{isAddingNew ? "Fill in the new member's information" : "Update profile details"}</p>
            </div>
            <button onClick={() => setView("list")} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"><X size={16} /></button>
          </div>

          <div className="flex flex-col lg:flex-row flex-1 min-h-0">
            {/* ── Left Sidebar ──────────────────────────────────────────── */}
            <div className="lg:w-56 shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
              {/* Mobile: horizontal row. Desktop: vertical column */}
              <div className="flex flex-row lg:flex-col items-start lg:items-center gap-4 p-4 lg:p-5 lg:gap-5">

                {/* Avatar + Gallery — left on mobile, centered on desktop */}
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <div
                    onClick={openCamera}
                    className="relative w-20 h-20 lg:w-24 lg:h-24 rounded-2xl overflow-hidden cursor-pointer group ring-4 ring-white dark:ring-gray-800 shadow-md bg-gradient-to-br from-indigo-500 to-indigo-700">
                    {fPhoto
                      ? <img src={fPhoto} alt="Preview" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-2xl lg:text-3xl font-black text-white select-none">{initials(previewName)}</div>
                    }
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 flex-col">
                      <Camera size={16} className="text-white" />
                      <span className="text-[9px] font-bold text-white/80 uppercase tracking-widest">Camera</span>
                    </div>
                    {isUploadingPhoto && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><Loader2 size={18} className="text-white animate-spin" /></div>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => photoInputRef.current?.click()}
                      className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 hover:border-gray-300 transition-all">
                      <ImagePlus size={11} /> Gallery
                    </button>
                    {fPhoto && <button type="button" onClick={() => setFPhoto("")}
                      className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <X size={12} />
                    </button>}
                  </div>
                </div>
                <input type="file" ref={photoInputRef} onChange={handlePhotoUpload} className="hidden" accept="image/*" />

                {/* Name preview + Status — right of avatar on mobile, below on desktop */}
                <div className="flex-1 lg:w-full space-y-3">
                  <div className="lg:text-center">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">{previewName}</p>
                  </div>

                  {/* Compact segmented status control */}
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <div className="px-3 py-1.5 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Status</p>
                    </div>
                    <div className="flex divide-x divide-gray-100 dark:divide-gray-700">
                      {(["active", "on-leave", "inactive"] as const).map(s => (
                        <button key={s} type="button" onClick={() => setFStatus(s)}
                          className={`flex-1 flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-semibold transition-all uppercase tracking-wide ${
                            fStatus === s
                              ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300"
                              : "bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/80"
                          }`}>
                          <span className={`w-2 h-2 rounded-full ${STATUS_CONFIG[s].dot}`} />
                          {STATUS_CONFIG[s].label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Right Panel ───────────────────────────────────────────── */}
            <div className="flex-1 bg-white dark:bg-gray-800 lg:overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              <div className="p-4 lg:p-6 space-y-4">

                {/* ── Personal Info section ──────────────────────────── */}
                <SectionCard label="Personal Info">
                  <div className="space-y-4">
                    {/* Row 1: First Name + M.I. */}
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">First Name <span className="text-red-500">*</span></label>
                        <input value={fFirstName} onChange={e => { setFFirstName(e.target.value); setFormErrors(p => ({ ...p, firstName: "" })); }} placeholder="Juan" className={inp(formErrors.firstName)} />
                        {formErrors.firstName && <p className="mt-1 text-xs text-red-500">{formErrors.firstName}</p>}
                      </div>
                      <div className="w-16 shrink-0">
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">M.I.</label>
                        <input value={fMI} maxLength={2} onChange={e => setFMI(e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase())} placeholder="M"
                          className="w-full px-2 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/30 text-center uppercase tracking-widest dark:text-white transition-all" />
                      </div>
                    </div>
                    {/* Row 2: Last Name */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Last Name <span className="text-red-500">*</span></label>
                      <input value={fLastName} onChange={e => { setFLastName(e.target.value); setFormErrors(p => ({ ...p, lastName: "" })); }} placeholder="dela Cruz" className={inp(formErrors.lastName)} />
                      {formErrors.lastName && <p className="mt-1 text-xs text-red-500">{formErrors.lastName}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Birthdate <span className="text-red-500">*</span></label>
                      <DatePicker value={fBirthdate} max={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })} onChange={v => { setFBirthdate(v); setFormErrors(p => ({ ...p, birthdate: "" })); }} error={!!formErrors.birthdate} placeholder="Select birthdate" />
                      {formErrors.birthdate && <p className="mt-1 text-xs text-red-500">{formErrors.birthdate}</p>}
                    </div>
                  </div>
                </SectionCard>

                {/* ── Contact section ────────────────────────────────── */}
                <SectionCard label="Contact">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Phone Number <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <Phone size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        <input type="tel" value={fPhone} onChange={e => { setFPhone(e.target.value); setFormErrors(p => ({ ...p, phone: "" })); }} placeholder="+63 912 345 6789" className={`${inp(formErrors.phone)} pl-9`} />
                      </div>
                      {formErrors.phone && <p className="mt-1 text-xs text-red-500">{formErrors.phone}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Email Address <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <Mail size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        <input type="email" value={fEmail} onChange={e => { setFEmail(e.target.value); setFormErrors(p => ({ ...p, email: "" })); }} placeholder="member@gmail.com" className={`${inp(formErrors.email)} pl-9`} />
                      </div>
                      {formErrors.email
                        ? <p className="mt-1 text-xs text-red-500">{formErrors.email}</p>
                        : <p className="mt-2 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-lg px-3 py-2 leading-relaxed">
                            <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                            <span>Must match the email used to <strong>sign in to the app</strong> to link their account.</span>
                          </p>
                      }
                    </div>
                  </div>
                </SectionCard>

                {/* ── Roles section ──────────────────────────────────── */}
                <SectionCard
                  label="Roles"
                  right={fRoles.length > 0 ? <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">{fRoles.length} selected</span> : undefined}
                >
                  <div className="space-y-4">
                    {ROLE_CATEGORIES.map(cat => (
                      <div key={cat.label}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600 mb-2">{cat.label}</p>
                        <div className="flex flex-wrap gap-2">
                          {cat.roles.map(role => {
                            const sel = fRoles.includes(role);
                            return (
                              <button key={role} type="button" onClick={() => setFRoles(p => p.includes(role) ? p.filter(r => r !== role) : [...p, role])}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${sel
                                  ? "border-indigo-400 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300"
                                  : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
                                }`}>
                                {sel && <Check size={10} strokeWidth={3} className="text-indigo-500" />}
                                {role}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                {/* ── Notes section ──────────────────────────────────── */}
                <SectionCard label="Notes — optional">
                  <AutoTextarea value={fNotes} onChange={e => setFNotes(e.target.value)} minRows={3}
                    className="w-full px-3.5 py-3 text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/30 outline-none dark:text-white placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-all resize-none"
                    placeholder="Available weekends only, plays both keys and acoustic..." />
                </SectionCard>
              </div>

            </div>
          </div>

          {/* ── Sticky footer — OUTSIDE the scroll panels, always visible ── */}
          <div className="flex justify-end gap-3 px-4 lg:px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
            <button onClick={() => setView("list")}
              className="flex-1 sm:flex-none px-5 py-3 sm:py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-900 dark:hover:text-white transition-all">
              Cancel
            </button>
            <button onClick={handleSave} disabled={isSaving}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 sm:py-2.5 text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97] transition-all shadow-sm shadow-indigo-500/20">
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {isSaving ? "Saving…" : "Save Member"}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          DETAIL VIEW
      ══════════════════════════════════════════════════════════════════════ */}
      {view === "detail" && selectedMember && (
        <div className="max-w-xl mx-auto space-y-3">

          {/* ── Profile card ──────────────────────────────────────────── */}
          <div className="wf-card overflow-hidden">
            {/* Header bar */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 dark:border-gray-700">
              <button onClick={() => setView("list")} className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium transition-colors">
                ← Back to team
              </button>
              <div className="flex items-center gap-1.5">
                {canEditMember(selectedMember) && (
                  <button onClick={() => openEditor(selectedMember)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 transition-all">
                    <Edit size={12} /> Edit
                  </button>
                )}
                {canDeleteMember && (
                  <button onClick={() => handleDelete(selectedMember.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 border border-transparent hover:border-red-200 dark:hover:border-red-800/60 transition-all">
                    <Trash2 size={12} /> Remove
                  </button>
                )}
              </div>
            </div>

            {/* Profile identity */}
            <div className="flex items-center gap-4 px-5 py-5">
              <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-sm">
                {selectedMember.photo
                  ? <img src={selectedMember.photo} alt={selectedMember.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-xl font-black text-white select-none">{initials(selectedMember.name)}</div>
                }
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight leading-snug">{selectedMember.name}</h2>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className={`w-2 h-2 rounded-full ${STATUS_CONFIG[selectedMember.status ?? "active"].dot}`} />
                  <span className="text-sm text-gray-500 dark:text-gray-400">{STATUS_CONFIG[selectedMember.status ?? "active"].label}</span>
                  {selectedMember.roles?.length > 0 && (
                    <span className="text-gray-300 dark:text-gray-700 mx-1">·</span>
                  )}
                  {selectedMember.roles?.length > 0 && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">{selectedMember.roles.length} role{selectedMember.roles.length !== 1 ? "s" : ""}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Contact card ──────────────────────────────────────────── */}
          <div className="wf-card overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Contact</p>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
              <a href={`tel:${selectedMember.phone}`}
                className="flex items-center gap-3.5 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors group">
                <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center shrink-0">
                  <Phone size={13} className="text-indigo-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-wider mb-0.5">Phone</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{selectedMember.phone}</p>
                </div>
                <ChevronRight size={14} className="text-gray-300 dark:text-gray-600 group-hover:text-indigo-400 shrink-0 transition-colors" />
              </a>

              {(selectedMember as any).email && (
                <a href={`mailto:${(selectedMember as any).email}`}
                  className="flex items-center gap-3.5 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors group">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center shrink-0">
                    <Mail size={13} className="text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-wider mb-0.5">Email</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{(selectedMember as any).email}</p>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 dark:text-gray-600 group-hover:text-indigo-400 shrink-0 transition-colors" />
                </a>
              )}

              {(selectedMember as any).birthdate && (
                <div className="flex items-center gap-3.5 px-5 py-3.5">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center shrink-0">
                    <Cake size={13} className="text-indigo-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-wider mb-0.5">Birthday</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{fmtDate((selectedMember as any).birthdate)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Roles card ────────────────────────────────────────────── */}
          {selectedMember.roles?.length > 0 && (
            <div className="wf-card overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Roles</p>
              </div>
              <div className="px-5 py-4 flex flex-wrap gap-2">
                {selectedMember.roles.map(role => (
                  <span key={role} className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                    {role}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Notes card ────────────────────────────────────────────── */}
          {selectedMember.notes && (
            <div className="wf-card overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Notes</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{selectedMember.notes}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          LIST VIEW
      ══════════════════════════════════════════════════════════════════════ */}
      {view === "list" && (
        <div className="space-y-5">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Team Members</h1>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
                {allMembers.length} total
                {counts.active > 0 && <> · <span className="text-emerald-500">{counts.active} active</span></>}
                {counts.onLeave > 0 && <> · <span className="text-amber-500">{counts.onLeave} on leave</span></>}
              </p>
            </div>
            {canAddMember && (
              <button onClick={() => openEditor()} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-all shadow-sm shadow-indigo-500/20 active:scale-[0.97] shrink-0">
                <UserPlus size={15} />
                <span className="hidden sm:inline">Add Member</span>
              </button>
            )}
          </div>

          {/* Search + filter */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              {isLoadingMembers
                ? <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-500 animate-spin" width={14} height={14} viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
                : <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              }
              <input type="text" placeholder="Search by name, role, or phone…" value={searchQ} onChange={e => setSearchQ(e.target.value)}
                className="w-full pl-10 pr-9 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/30 outline-none transition-all"
              />
              {searchQ && <button onClick={() => setSearchQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"><X size={13} /></button>}
            </div>
            <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-1 rounded-xl">
              {FILTER_TABS.map(tab => (
                <button key={tab} onClick={() => setFilterTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${filterTab === tab
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm border border-gray-200 dark:border-gray-600"
                    : "text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}>
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Member grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {isLoadingMembers && allMembers.length === 0
              ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="wf-card p-4 animate-pulse">
                  <div className="flex gap-3 mb-4">
                    <div className="w-11 h-11 rounded-xl bg-gray-200 dark:bg-gray-700 shrink-0" />
                    <div className="flex-1 space-y-2 pt-1"><div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded-lg w-3/4" /><div className="h-3 bg-gray-100 dark:bg-gray-700/60 rounded-lg w-1/2" /></div>
                  </div>
                  <div className="flex gap-2"><div className="h-5 w-20 bg-gray-100 dark:bg-gray-700/60 rounded-lg" /><div className="h-5 w-14 bg-gray-100 dark:bg-gray-700/60 rounded-lg" /></div>
                </div>
              ))
              : filtered.map(member => (
                <div key={member.id}
                  className="wf-card overflow-hidden flex flex-col group hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-md transition-all duration-150">

                  {/* ── Card body ────────────────────────────────────── */}
                  <div className="p-5 flex-1 space-y-4">

                    {/* Avatar + Name + Status */}
                    <div className="flex items-start gap-3.5">
                      <div className="w-14 h-14 rounded-2xl overflow-hidden shrink-0 bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-md ring-2 ring-white dark:ring-gray-700">
                        {member.photo
                          ? <img src={member.photo} alt={member.name} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-lg font-extrabold text-white select-none">{initials(member.name)}</div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-[15px] text-gray-900 dark:text-white leading-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{member.name}</p>
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold mt-2 px-2.5 py-1 rounded-full ${
                          (member.status ?? "active") === "active"
                            ? "bg-emerald-100 dark:bg-emerald-900/25 text-emerald-700 dark:text-emerald-400"
                            : member.status === "on-leave"
                            ? "bg-amber-100 dark:bg-amber-900/25 text-amber-700 dark:text-amber-400"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[member.status ?? "active"].dot}`} />
                          {STATUS_CONFIG[member.status ?? "active"].label}
                        </span>
                      </div>
                    </div>

                    {/* Contact rows */}
                    <div className="space-y-2">
                      {(member as any).email && (
                        <a href={`mailto:${(member as any).email}`} onClick={e => e.stopPropagation()}
                          className="flex items-center gap-2.5 text-[13px] text-gray-600 dark:text-gray-300 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors group/link">
                          <Mail size={13} className="shrink-0 text-gray-400 dark:text-gray-500 group-hover/link:text-indigo-400" />
                          <span className="truncate">{(member as any).email}</span>
                        </a>
                      )}
                      <a href={`tel:${member.phone}`} onClick={e => e.stopPropagation()}
                        className="flex items-center gap-2.5 text-[13px] text-gray-600 dark:text-gray-300 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors group/link">
                        <Phone size={13} className="shrink-0 text-gray-400 dark:text-gray-500 group-hover/link:text-indigo-400" />
                        <span>{member.phone}</span>
                      </a>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-dashed border-gray-100 dark:border-gray-700/60" />

                    {/* Role pills */}
                    <div className="flex flex-wrap gap-1.5">
                      {(member.roles || []).slice(0, 3).map(role => (
                        <span key={role} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-700/80 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600/60">{role}</span>
                      ))}
                      {(member.roles || []).length > 3 && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-700/80 text-gray-500 dark:text-gray-500 border border-gray-200 dark:border-gray-600/60">+{member.roles.length - 3}</span>
                      )}
                      {(!member.roles || member.roles.length === 0) && (
                        <span className="text-[11px] text-gray-300 dark:text-gray-700 italic">No roles assigned</span>
                      )}
                    </div>
                  </div>

                  {/* ── Action footer (tinted tray) ───────────────────── */}
                  <div className="flex border-t border-gray-100 dark:border-gray-700/80 bg-gray-50 dark:bg-gray-800/60">
                    <button
                      onClick={() => { setSelectedMember(member); setView("detail"); }}
                      className="flex-1 flex items-center justify-center gap-2 py-3 text-[13px] font-semibold text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white/60 dark:hover:bg-indigo-900/20 transition-all rounded-bl-2xl">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      View
                    </button>
                    {canEditMember(member) && (
                      <>
                        <div className="w-px bg-gray-100 dark:bg-gray-700/80" />
                        <button
                          onClick={e => { e.stopPropagation(); openEditor(member); }}
                          className="flex-1 flex items-center justify-center gap-2 py-3 text-[13px] font-semibold text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white/60 dark:hover:bg-indigo-900/20 transition-all rounded-br-2xl">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          Edit
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            }
          </div>

          {/* Empty state */}
          {!isLoadingMembers && filtered.length === 0 && (
            <div className="py-24 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 mb-4">
                <Users size={24} className="text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1.5">
                {searchQ ? "No members found" : filterTab !== "All" ? `No ${filterTab.toLowerCase()} members` : "No team members yet"}
              </h3>
              <p className="text-sm text-gray-400 dark:text-gray-500 mb-6 max-w-xs mx-auto">
                {searchQ ? `No results for "${searchQ}".` : filterTab !== "All" ? `Switch to "All" to see everyone.` : "Add your first team member to get started."}
              </p>
              {!searchQ && filterTab === "All" && canAddMember && (
                <button onClick={() => openEditor()} className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-all shadow-sm shadow-indigo-500/20">
                  <UserPlus size={15} /> Add First Member
                </button>
              )}
              {(searchQ || filterTab !== "All") && (
                <button onClick={() => { setSearchQ(""); setFilterTab("All"); }} className="text-sm font-medium text-indigo-500 dark:text-indigo-400 hover:underline">Clear filters</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
