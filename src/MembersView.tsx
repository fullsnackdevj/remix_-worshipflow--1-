import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import DatePicker from "./DatePicker";
import AutoTextarea from "./AutoTextarea";
import { Member } from "./types";
import { STATUS_CONFIG, ROLE_CATEGORIES, getRoleStyle, ALL_ROLES } from "./constants";
import {
  Camera, Trash2, X, Plus, Search, User, Upload, Phone, Mail, Calendar,
  ChevronDown, Loader2, ImagePlus, AlertTriangle, Check, Save, Edit, UserPlus, Users,
} from "lucide-react";

// ── Props ─────────────────────────────────────────────────────────────────────
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

export default function MembersView({
  allMembers,
  setAllMembers,
  isLoadingMembers,
  setIsLoadingMembers,
  isAdmin,
  isLeader,
  canWriteMembers,
  canAddMember,
  canEditMember,
  canDeleteMember,
  myMemberProfile,
  user,
  showToast,
  showConfirm,
  closeConfirm,
}: MembersViewProps) {

  // ── Members local state ───────────────────────────────────────────────────
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isEditingMember, setIsEditingMember] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [memberFormErrors, setMemberFormErrors] = useState<{ firstName?: string; lastName?: string; phone?: string; email?: string; birthdate?: string }>({}); 
  const [editMemberFirstName, setEditMemberFirstName] = useState("");
  const [editMemberMiddleInitial, setEditMemberMiddleInitial] = useState("");
  const [editMemberLastName, setEditMemberLastName] = useState("");
  const [editMemberPhone, setEditMemberPhone] = useState("");
  const [editMemberEmail, setEditMemberEmail] = useState("");
  const [editMemberPhoto, setEditMemberPhoto] = useState<string | null>(null);
  const [editMemberRoles, setEditMemberRoles] = useState<string[]>([]);
  const [editMemberStatus, setEditMemberStatus] = useState<"active" | "on-leave" | "inactive">("active");
  const [editMemberBirthdate, setEditMemberBirthdate] = useState("");
  const [editMemberNotes, setEditMemberNotes] = useState("");
  const [isSavingMember, setIsSavingMember] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const memberPhotoInputRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  // ── Members helpers + handlers ────────────────────────────────────────────
  // ── Member Functions ────────────────────────────────────────────────────────
  const MEMBERS_CACHE_KEY = "wf_members_cache";
  const MEMBERS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  const readMembersCache = (): any[] | null => {
    try {
      const raw = localStorage.getItem(MEMBERS_CACHE_KEY);
      if (!raw) return null;
      const { members, ts } = JSON.parse(raw);
      if (Date.now() - ts > MEMBERS_CACHE_TTL_MS) return null;
      return members;
    } catch { return null; }
  };

  const writeMembersCache = (members: any[]) => {
    try {
      localStorage.setItem(MEMBERS_CACHE_KEY, JSON.stringify({ members, ts: Date.now() }));
    } catch { /* quota exceeded — ignore */ }
  };

  const clearMembersCache = () => {
    try { localStorage.removeItem(MEMBERS_CACHE_KEY); } catch { /* noop */ }
  };

  const fetchMembers = useCallback(async ({ background = false } = {}) => {
    // Serve from cache instantly, then revalidate in background
    if (!background) {
      const cached = readMembersCache();
      if (cached) {
        setAllMembers(cached);
        setIsLoadingMembers(false);
        fetchMembers({ background: true }); // silent refresh
        return;
      }
      setIsLoadingMembers(true);
    }
    try {
      const res = await fetch("/api/members");
      const data = await res.json();
      const members = Array.isArray(data) ? data : [];
      setAllMembers(members);
      writeMembersCache(members);
    } catch (error) {
      console.error("Failed to fetch members", error);
      showToast("error", "Failed to load members. Please refresh.");
      if (!background) setAllMembers([]);
    } finally {
      if (!background) setIsLoadingMembers(false);
    }
  }, []);


  const filteredMembers = useMemo(() => {
    if (!memberSearchQuery.trim()) return allMembers;
    const q = memberSearchQuery.trim().toLowerCase();
    return allMembers.filter(m =>
      m.name?.toLowerCase().includes(q) ||
      m.phone?.toLowerCase().includes(q) ||
      m.roles?.some(r => r.toLowerCase().includes(q))
    );
  }, [allMembers, memberSearchQuery]);

  const openMemberEditor = (member?: Member) => {
    if (member) {
      setSelectedMember(member);
      // Prefer stored structured name fields; fall back to parsing the combined name
      if (member.firstName) {
        setEditMemberFirstName(member.firstName);
        setEditMemberMiddleInitial(member.middleInitial || "");
        setEditMemberLastName(member.lastName || "");
      } else {
        const parts = (member.name || "").trim().split(/\s+/);
        setEditMemberFirstName(parts[0] || "");
        // If the second part is a single letter (with or without dot) treat it as middle initial
        if (parts.length >= 3 && /^[A-Za-z]\.?$/.test(parts[1])) {
          setEditMemberMiddleInitial(parts[1].replace('.', ''));
          setEditMemberLastName(parts.slice(2).join(" ") || "");
        } else {
          setEditMemberMiddleInitial("");
          setEditMemberLastName(parts.slice(1).join(" ") || "");
        }
      }
      setEditMemberPhone(member.phone);
      setEditMemberEmail(member.email || "");
      setEditMemberPhoto(member.photo || "");
      setEditMemberRoles(member.roles || []);
      setEditMemberStatus(member.status || "active");
      setEditMemberBirthdate(member.birthdate || "");
      setEditMemberNotes(member.notes || "");
    } else {
      setSelectedMember(null);
      setEditMemberFirstName("");
      setEditMemberMiddleInitial("");
      setEditMemberLastName("");
      setEditMemberPhone("");
      setEditMemberEmail("");
      setEditMemberPhoto("");
      setEditMemberRoles([]);
      setEditMemberStatus("active");
      setEditMemberBirthdate("");
      setEditMemberNotes("");
    }
    setMemberFormErrors({});
    setIsEditingMember(true);
  };

  const handleSaveMember = async () => {
    if (isSavingMember) return; // guard against double-click
    const errors: { firstName?: string; lastName?: string; phone?: string; email?: string; birthdate?: string } = {};
    if (!editMemberFirstName.trim()) errors.firstName = "First name is required.";
    if (!editMemberLastName.trim()) errors.lastName = "Last name is required.";
    if (!editMemberPhone.trim()) errors.phone = "Phone number is required.";
    if (!editMemberEmail.trim()) errors.email = "Email address is required.";
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(editMemberEmail.trim())) errors.email = "Please enter a valid email address.";
    if (!editMemberBirthdate) errors.birthdate = "Birthdate is required.";
    if (Object.keys(errors).length > 0) { setMemberFormErrors(errors); return; }
    setMemberFormErrors({});

    // Build full name: "First [M.] Last"
    const mi = editMemberMiddleInitial.trim().replace(/\.$/, '');
    const fullName = `${editMemberFirstName.trim()}${mi ? ' ' + mi.toUpperCase() + '.' : ''} ${editMemberLastName.trim()}`;

    // ── Duplicate detection (new members only) ──────────────────────────────
    // allMembers is always current via optimistic updates — no network call needed
    if (!selectedMember?.id) {
      const firstLower = editMemberFirstName.trim().toLowerCase();
      const lastLower = editMemberLastName.trim().toLowerCase();
      const phoneDigits = editMemberPhone.trim().replace(/\D/g, '');
      const duplicate = allMembers.find((m: any) => {
        const parts = (m.name || "").trim().split(/\s+/);
        const mFirst = (parts[0] || "").toLowerCase();
        // Skip middle initial (single letter ± dot) — same logic as openMemberEditor
        let mLast: string;
        if (parts.length >= 3 && /^[A-Za-z]\.?$/.test(parts[1])) {
          mLast = parts.slice(2).join(" ").toLowerCase();
        } else {
          mLast = parts.slice(1).join(" ").toLowerCase();
        }
        return mFirst === firstLower && mLast === lastLower &&
          m.phone.replace(/\D/g, '') === phoneDigits;
      });
      if (duplicate) {
        showToast("error", `"${duplicate.name}" with the same phone number already exists.`);
        return;
      }
    }

    const payload = {
      name: fullName,
      firstName: editMemberFirstName.trim(),
      middleInitial: editMemberMiddleInitial.trim().replace(/\.$/, ''),
      lastName: editMemberLastName.trim(),
      phone: editMemberPhone,
      email: editMemberEmail.trim().toLowerCase(),
      photo: editMemberPhoto,
      roles: editMemberRoles,
      status: editMemberStatus,
      birthdate: editMemberBirthdate || undefined,
      notes: editMemberNotes,
    };

    setIsSavingMember(true);
    try {
      const editingId = selectedMember?.id;
      let response;
      if (editingId) {
        response = await fetch(`/api/members/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        response = await fetch("/api/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to save member");
      }
      const responseData = await response.json();

      // ── Optimistic update: mutate local state instantly, no re-fetch ──────
      setAllMembers(prev => {
        let updated: Member[];
        if (editingId) {
          // Replace in-place
          updated = prev.map(m => m.id === editingId
            ? { ...m, ...payload, name: responseData.name ?? payload.name }
            : m
          );
        } else {
          // Prepend new member from server response
          const newMember: Member = {
            id: responseData.id,
            name: responseData.name ?? payload.name,
            phone: payload.phone,
            email: payload.email,
            photo: payload.photo,
            roles: payload.roles,
            status: payload.status,
            notes: payload.notes,
          };
          updated = [newMember, ...prev];
        }
        writeMembersCache(updated); // keep cache in sync
        return updated;
      });

      setIsEditingMember(false);
      setSelectedMember(null);
      showToast("success", editingId
        ? `Member "${payload.name}" updated successfully!`
        : `Member "${payload.name}" added successfully!`
      );
    } catch (error: any) {
      console.error("Failed to save member", error);
      showToast("error", error.message || "Failed to save member.");
    } finally {
      setIsSavingMember(false);
    }
  };

  const handleDeleteMember = async (id: string) => {
    const member = allMembers.find(m => m.id === id);
    showConfirm({
      title: "Remove Member",
      message: `Are you sure you want to remove "${member?.name || "this member"}"?`,
      detail: "This will permanently remove their profile and roles from the worship team list.",
      confirmText: "Yes, Remove",
      confirmClass: "bg-red-500 hover:bg-red-600",
      onConfirm: async () => {
        // ── Optimistic: remove from state instantly before API responds ──────
        const memberName = member?.name || "Member";
        setAllMembers(prev => {
          const updated = prev.filter(m => m.id !== id);
          writeMembersCache(updated);
          return updated;
        });
        if (selectedMember?.id === id) {
          setSelectedMember(null);
          setIsEditingMember(false);
        }
        closeConfirm();
        showToast("success", `"${memberName}" removed successfully.`);

        // Fire-and-forget: delete on server in background
        try {
          const res = await fetch(`/api/members/${id}`, { method: "DELETE" });
          if (!res.ok) throw new Error("Failed to delete member");
        } catch (error) {
          console.error("Failed to delete member", error);
          // Rollback: re-fetch to restore correct state
          showToast("error", "Failed to remove member. Restoring list...");
          clearMembersCache();
          fetchMembers();
        }
      }
    });
  };

  const MAX_PHOTO_SIZE_MB = 2;
  const handleMemberPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // ── Photo size guard ──────────────────────────────────────────────────────
    if (file.size > MAX_PHOTO_SIZE_MB * 1024 * 1024) {
      showToast("error", `Photo is too large. Please use an image under ${MAX_PHOTO_SIZE_MB}MB.`);
      if (e.target) e.target.value = "";
      return;
    }
    setIsUploadingPhoto(true);
    try {
      const reader = new FileReader();
      reader.onload = () => {
        setEditMemberPhoto(reader.result as string);
        setIsUploadingPhoto(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setIsUploadingPhoto(false);
    } finally {
      if (e.target) e.target.value = "";
    }
  };

  const openCamera = async () => {
    setCameraError("");
    setShowCameraModal(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      cameraStreamRef.current = stream;
      setTimeout(() => {
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          cameraVideoRef.current.play().catch(() => { });
        }
      }, 120);
    } catch {
      setCameraError("Camera access was denied or is unavailable. Please allow camera permission and try again.");
    }
  };

  const closeCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(t => t.stop());
      cameraStreamRef.current = null;
    }
    setShowCameraModal(false);
    setCameraError("");
  };

  const snapPhoto = () => {
    const video = cameraVideoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setEditMemberPhoto(dataUrl);
    closeCamera();
  };

  const toggleMemberRole = (role: string) => {
    setEditMemberRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };







  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto">

      {/* ── Camera Modal ── */}
      {showCameraModal && (
        <div className="fixed inset-0 bg-black/80 z-[999] flex items-center justify-center p-4" onClick={closeCamera}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <p className="text-gray-900 dark:text-white font-semibold flex items-center gap-2"><Camera size={16} className="text-indigo-500 dark:text-indigo-400" /> Take a Photo</p>
              <button onClick={closeCamera} className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-lg transition-colors"><X size={18} /></button>
            </div>
            {cameraError ? (
              <div className="p-8 text-center">
                <Camera size={40} className="mx-auto mb-3 text-gray-600" />
                <p className="text-sm text-red-400">{cameraError}</p>
                <button onClick={closeCamera} className="mt-4 px-4 py-2 bg-gray-700 text-white rounded-xl text-sm hover:bg-gray-600 transition-colors">Close</button>
              </div>
            ) : (
              <>
                <div className="relative bg-black" style={{ aspectRatio: "3/4" }}>
                  <video ref={cameraVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  {/* Rule-of-thirds grid */}
                  <div className="absolute inset-0 pointer-events-none" style={{
                    backgroundImage: `
                      linear-gradient(to right, rgba(255,255,255,0.25) 1px, transparent 1px),
                      linear-gradient(to bottom, rgba(255,255,255,0.25) 1px, transparent 1px)
                    `,
                    backgroundSize: "33.333% 33.333%"
                  }} />
                </div>
                <div className="flex items-center justify-center gap-4 p-4">
                  <button onClick={closeCamera} className="px-4 py-2 rounded-xl bg-gray-700 text-white text-sm hover:bg-gray-600 transition-colors">Cancel</button>
                  <button
                    onClick={snapPhoto}
                    className="w-14 h-14 rounded-full bg-white border-4 border-indigo-500 flex items-center justify-center hover:bg-indigo-50 transition-colors shadow-lg"
                    title="Take Photo"
                  >
                    <Camera size={22} className="text-indigo-600" />
                  </button>
                  <div className="w-20" /> {/* spacer for balance */}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Member Form ── */}
      {isEditingMember ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">{selectedMember ? "Edit Member" : "Add Member"}</h2>
            <button onClick={() => setIsEditingMember(false)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"><X size={22} /></button>
          </div>

          <div className="space-y-6">
            {/* Photo upload */}
            <div className="flex flex-col items-center gap-2">
              {/* Avatar — click to open camera */}
              <div
                onClick={openCamera}
                className="relative w-28 h-28 rounded-full overflow-hidden border-4 border-indigo-200 dark:border-indigo-700 bg-gray-100 dark:bg-gray-700 cursor-pointer hover:border-indigo-400 transition-colors group"
              >
                {editMemberPhoto ? (
                  <img src={editMemberPhoto} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-400 group-hover:text-indigo-400 transition-colors px-2">
                    <Camera size={24} />
                    <span className="text-[9px] text-center leading-tight">Click to open camera</span>
                  </div>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera size={20} className="text-white" />
                </div>
                {isUploadingPhoto && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 size={22} className="text-white animate-spin" />
                  </div>
                )}
              </div>

              {/* Secondary actions */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => memberPhotoInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <ImagePlus size={14} /> Gallery
                </button>
                {editMemberPhoto && (
                  <button
                    type="button"
                    onClick={() => setEditMemberPhoto("")}
                    className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Remove photo"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <input type="file" ref={memberPhotoInputRef} onChange={handleMemberPhotoUpload} className="hidden" accept="image/*" />
            </div>

            {/* First Name | MI | Last Name */}
            <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 72px 1fr' }}>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={editMemberFirstName}
                  onChange={e => { setEditMemberFirstName(e.target.value); if (memberFormErrors.firstName) setMemberFormErrors(p => ({ ...p, firstName: undefined })); }}
                  className={`w-full px-4 py-2 border ${memberFormErrors.firstName ? "border-red-400 focus:border-red-400 focus:ring-red-200" : "border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-indigo-200"} bg-white dark:bg-gray-700 rounded-xl focus:ring-2 outline-none`}
                  placeholder="Juan"
                />
                {memberFormErrors.firstName && <p className="mt-1 text-xs text-red-500">{memberFormErrors.firstName}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">M.I. <span className="text-gray-400 font-normal text-xs">(opt.)</span></label>
                <input
                  type="text"
                  maxLength={2}
                  value={editMemberMiddleInitial}
                  onChange={e => setEditMemberMiddleInitial(e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase())}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-indigo-200 bg-white dark:bg-gray-700 rounded-xl focus:ring-2 outline-none text-center uppercase tracking-widest"
                  placeholder="M"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={editMemberLastName}
                  onChange={e => { setEditMemberLastName(e.target.value); if (memberFormErrors.lastName) setMemberFormErrors(p => ({ ...p, lastName: undefined })); }}
                  className={`w-full px-4 py-2 border ${memberFormErrors.lastName ? "border-red-400 focus:border-red-400 focus:ring-red-200" : "border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-indigo-200"} bg-white dark:bg-gray-700 rounded-xl focus:ring-2 outline-none`}
                  placeholder="dela Cruz"
                />
                {memberFormErrors.lastName && <p className="mt-1 text-xs text-red-500">{memberFormErrors.lastName}</p>}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number <span className="text-red-500">*</span></label>
              <div className="relative">
                <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="tel"
                  value={editMemberPhone}
                  onChange={e => { setEditMemberPhone(e.target.value); if (memberFormErrors.phone) setMemberFormErrors(p => ({ ...p, phone: undefined })); }}
                  className={`w-full pl-9 pr-4 py-2 border ${memberFormErrors.phone ? "border-red-400 focus:border-red-400 focus:ring-red-200" : "border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-indigo-200"} bg-white dark:bg-gray-700 rounded-xl focus:ring-2 outline-none`}
                  placeholder="+63 912 345 6789"
                />
              </div>
              {memberFormErrors.phone && <p className="mt-1 text-xs text-red-500">{memberFormErrors.phone}</p>}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address <span className="text-red-500">*</span></label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={editMemberEmail}
                  onChange={e => { setEditMemberEmail(e.target.value); if (memberFormErrors.email) setMemberFormErrors(p => ({ ...p, email: undefined })); }}
                  className={`w-full pl-9 pr-4 py-2 border ${memberFormErrors.email ? "border-red-400 focus:border-red-400 focus:ring-red-200" : "border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-indigo-200"} bg-white dark:bg-gray-700 rounded-xl focus:ring-2 outline-none`}
                  placeholder="member@gmail.com"
                />
              </div>
              {memberFormErrors.email
                ? <p className="mt-1 text-xs text-red-500">{memberFormErrors.email}</p>
                : <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg px-2.5 py-1.5">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  <span>Make sure this is the same email address this person will use to <strong>sign in to the app</strong>. This is how their access is linked to their profile.</span>
                </p>
              }
            </div>

            {/* Birthdate */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Birthdate <span className="text-red-500">*</span>
              </label>
              <DatePicker
                value={editMemberBirthdate}
                max={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })}
                onChange={v => { setEditMemberBirthdate(v); if (memberFormErrors.birthdate) setMemberFormErrors(p => ({ ...p, birthdate: undefined })); }}
                error={!!memberFormErrors.birthdate}
                placeholder="Select birthdate"
              />
              {memberFormErrors.birthdate && <p className="mt-1 text-xs text-red-500">{memberFormErrors.birthdate}</p>}
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
              <div className="flex gap-2 flex-wrap">
                {(["active", "on-leave", "inactive"] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setEditMemberStatus(s)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium border-2 transition-all ${editMemberStatus === s
                      ? STATUS_CONFIG[s].badge + " border-transparent ring-2 ring-offset-1 ring-indigo-400"
                      : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-gray-300"
                      }`}
                  >
                    <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${STATUS_CONFIG[s].dot}`} />
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Roles */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Roles <span className="text-gray-400 font-normal">(select all that apply)</span></label>
              <div className="space-y-3">
                {ROLE_CATEGORIES.map(cat => (
                  <div key={cat.label}>
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">{cat.label}</p>
                    <div className="flex flex-wrap gap-2">
                      {cat.roles.map(role => {
                        const isSelected = editMemberRoles.includes(role);
                        return (
                          <button
                            key={role}
                            type="button"
                            onClick={() => toggleMemberRole(role)}
                            className={`px-3 py-1 rounded-full text-sm font-medium border-2 transition-all ${isSelected
                              ? cat.color + " border-transparent ring-2 ring-offset-1 ring-indigo-400"
                              : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-gray-300"
                              }`}
                          >
                            {isSelected && <Check size={12} className="inline mr-1" />}
                            {role}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
              <AutoTextarea
                value={editMemberNotes}
                onChange={e => setEditMemberNotes(e.target.value)}
                minRows={3}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                placeholder="Available weekends only, plays both keys and acoustic..."
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
              <button onClick={() => setIsEditingMember(false)} className="px-6 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 font-medium transition-colors">Cancel</button>
              <button
                onClick={handleSaveMember}
                disabled={isSavingMember}
                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSavingMember ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {isSavingMember ? "Saving..." : "Save Member"}
              </button>
            </div>
          </div>
        </div>

        /* ── Member Detail ── */
      ) : selectedMember ? (
        <div className="max-w-2xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            {/* Top banner + avatar */}
            <div className="h-24 bg-gradient-to-r from-indigo-500 via-purple-500 to-rose-400" />
            <div className="px-6 pb-6">
              <div className="-mt-12 mb-4 flex items-end justify-between">
                <div className="w-24 h-24 rounded-full border-4 border-white dark:border-gray-800 overflow-hidden bg-gray-200 dark:bg-gray-700 shrink-0">
                  {selectedMember.photo
                    ? <img src={selectedMember.photo} alt={selectedMember.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-gray-400">{selectedMember.name?.[0]?.toUpperCase()}</div>}
                </div>
                <div className="flex items-center gap-2 mb-1">
                  {canEditMember(selectedMember) && (
                    <button onClick={() => openMemberEditor(selectedMember)} className="relative group text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                      <Edit size={18} />
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-0.5 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">Edit</span>
                    </button>
                  )}
                  {canDeleteMember && selectedMember && (
                    <button onClick={() => handleDeleteMember(selectedMember.id)} className="relative group text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                      <Trash2 size={18} />
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-0.5 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">Remove</span>
                    </button>
                  )}
                  <button onClick={() => setSelectedMember(null)} className="relative group text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                    <X size={18} />
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-0.5 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">Close</span>
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {/* Name + status */}
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{selectedMember.name}</h2>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_CONFIG[selectedMember.status ?? "active"].badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[selectedMember.status ?? "active"].dot}`} />
                      {STATUS_CONFIG[selectedMember.status ?? "active"].label}
                    </span>
                  </div>
                  {/* Phone */}
                  <a href={`tel:${selectedMember.phone}`} className="inline-flex items-center gap-1.5 mt-1 text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 font-medium text-sm">
                    <Phone size={14} />{selectedMember.phone}
                  </a>
                  {/* Email */}
                  {(selectedMember as any).email && (
                    <a href={`mailto:${(selectedMember as any).email}`} className="inline-flex items-center gap-1.5 mt-1 ml-3 text-gray-500 dark:text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 font-medium text-sm">
                      <Mail size={14} />{(selectedMember as any).email}
                    </a>
                  )}
                </div>

                {/* Roles */}
                {selectedMember.roles?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Roles</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedMember.roles.map(role => (
                        <span key={role} className={`px-3 py-1 rounded-full text-xs font-semibold ${getRoleStyle(role)}`}>{role}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {selectedMember.notes && (
                  <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Notes</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{selectedMember.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        /* ── Member List ── */
      ) : (
        <div className="space-y-5">
          {/* Toolbar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              {isLoadingMembers
                ? <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400 animate-spin" width={18} height={18} viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
                : <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />}
              <input
                type="text"
                placeholder="Search by name, role, or phone..."
                value={memberSearchQuery}
                onChange={e => setMemberSearchQuery(e.target.value)}
                className="w-full pl-10 pr-8 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-900 outline-none text-sm dark:text-white"
              />
              {memberSearchQuery && (
                <button onClick={() => setMemberSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><X size={14} /></button>
              )}
            </div>
            {canAddMember && (
              <button
                onClick={() => openMemberEditor()}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium shadow-sm text-sm shrink-0"
              >
                <UserPlus size={18} />
                <span className="hidden sm:inline">Add Member</span>
              </button>
            )}
          </div>


          {/* Count badge */}
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-xl inline-block">
            {memberSearchQuery
              ? <>{filteredMembers.length} of {allMembers.length} Members</>
              : <>{allMembers.length} {allMembers.length === 1 ? "Member" : "Members"} Total</>}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {isLoadingMembers
              ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm animate-pulse">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                      <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-1/2" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-5 w-16 bg-gray-100 dark:bg-gray-700 rounded-full" />
                    <div className="h-5 w-20 bg-gray-100 dark:bg-gray-700 rounded-full" />
                  </div>
                </div>
              ))
              : filteredMembers.map(member => (
                <div
                  key={member.id}
                  onClick={() => setSelectedMember(member)}
                  className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-500 cursor-pointer transition-all group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-indigo-400 to-purple-500 text-white flex items-center justify-center font-bold text-lg shrink-0">
                      {member.photo
                        ? <img src={member.photo} alt={member.name} className="w-full h-full object-cover" />
                        : member.name?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">{member.name}</p>
                      <a
                        href={`tel:${member.phone}`}
                        onClick={e => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-indigo-500 transition-colors"
                      >
                        <Phone size={11} />{member.phone}
                      </a>
                    </div>
                    {/* Status dot */}
                    <span title={STATUS_CONFIG[member.status ?? "active"].label} className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_CONFIG[member.status ?? "active"].dot}`} />
                  </div>
                  {/* Role badges */}
                  <div className="flex flex-wrap gap-1.5">
                    {(member.roles || []).slice(0, 3).map(role => (
                      <span key={role} className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${getRoleStyle(role)}`}>{role}</span>
                    ))}
                    {(member.roles || []).length > 3 && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-500">+{member.roles.length - 3}</span>
                    )}
                    {(!member.roles || member.roles.length === 0) && (
                      <span className="text-xs text-gray-400">No roles assigned</span>
                    )}
                  </div>
                </div>
              ))
            }
            {/* Empty state */}
            {!isLoadingMembers && filteredMembers.length === 0 && (
              <div className="col-span-full py-16 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 mb-4">
                  <Users size={30} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  {memberSearchQuery ? "No members found" : "No team members yet"}
                </h3>
                <p className="text-sm text-gray-400 mb-4">
                  {memberSearchQuery
                    ? `No results for "${memberSearchQuery}"`
                    : "Add your first team member to get started."}
                </p>
                {!memberSearchQuery && (
                  <button onClick={() => openMemberEditor()} className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium text-sm transition-colors">
                    <UserPlus size={16} /> Add First Member
                  </button>
                )}
                {memberSearchQuery && (
                  <button onClick={() => setMemberSearchQuery("")} className="text-sm text-indigo-500 hover:underline">Clear search</button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
