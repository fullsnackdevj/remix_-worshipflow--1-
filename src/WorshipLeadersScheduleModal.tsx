import React, { useState, useEffect, useRef } from "react";
import { Member, Schedule, WorshipLeaderScheduleItem } from "./types";
import { db } from "./firebase";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
} from "firebase/firestore";
import {
  X,
  Plus,
  Calendar,
  Camera,
  Upload,
  Pencil,
  Trash2,
  CheckCircle2,
  Circle,
  Loader2,
  Sparkles,
  Users,
  User,
  RefreshCw,
  Check,
  ChevronDown,
} from "lucide-react";

interface WorshipLeadersScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  allMembers: Member[];
  allSchedules: Schedule[];
  setAllSchedules: React.Dispatch<React.SetStateAction<Schedule[]>>;
  canWriteSchedule: boolean;
  isAdmin: boolean;
  isLeader: boolean;
  user?: any;
  showToast: (type: string, msg: string) => void;
  showConfirm: (config: {
    title: string;
    message: string;
    confirmText: string;
    confirmClass?: string;
    onConfirm: () => void;
  }) => void;
}

const LOCAL_STORAGE_KEY = "wf_worship_leader_schedules_cache";

export default function WorshipLeadersScheduleModal({
  isOpen,
  onClose,
  allMembers,
  allSchedules,
  setAllSchedules,
  canWriteSchedule,
  isAdmin,
  isLeader,
  user,
  showToast,
  showConfirm,
}: WorshipLeadersScheduleModalProps) {
  const [items, setItems] = useState<WorshipLeaderScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Manual Edit/Add Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<WorshipLeaderScheduleItem | null>(null);
  const [formDate, setFormDate] = useState("");
  const [formLeader, setFormLeader] = useState("");
  const [formBackup1, setFormBackup1] = useState("");
  const [formBackup2, setFormBackup2] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [isSavingForm, setIsSavingForm] = useState(false);

  // OCR Processing & Preview State
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [ocrPreviewItems, setOcrPreviewItems] = useState<Partial<WorshipLeaderScheduleItem>[] | null>(null);
  const [isSavingOcr, setIsSavingOcr] = useState(false);

  // Syncing state
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // File Inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // ── Permission Rules ────────────────────────────────────────────────────────
  // 1. Admin
  // 2. May Arnuncio
  // 3. The scheduled Worship Leader on that specific day
  const isUserMayArnuncio = (u: any) => {
    if (!u) return false;
    const nameStr = `${u.displayName || ""} ${u.email || ""}`.toLowerCase();
    if (nameStr.includes("may arnuncio") || nameStr.includes("mayarnuncio") || nameStr.includes("may.arnuncio")) return true;
    const myMem = allMembers.find(
      (m) => m.userId === u?.uid || (m.email && u?.email && m.email.toLowerCase() === u.email.toLowerCase())
    );
    if (myMem && myMem.name.toLowerCase().includes("may arnuncio")) return true;
    return false;
  };

  const canManageItem = (item: WorshipLeaderScheduleItem) => {
    if (isAdmin) return true;
    if (isUserMayArnuncio(user)) return true;

    if (user && item.worshipLeader) {
      const leaderName = item.worshipLeader.trim().toLowerCase();
      const uDisplayName = (user.displayName || "").trim().toLowerCase();
      const uEmail = (user.email || "").trim().toLowerCase();

      if (uDisplayName && (uDisplayName === leaderName || leaderName.includes(uDisplayName) || uDisplayName.includes(leaderName))) {
        return true;
      }
      const myMem = allMembers.find(
        (m) => m.userId === user?.uid || (m.email && uEmail && m.email.toLowerCase() === uEmail)
      );
      if (myMem && myMem.name.trim().toLowerCase() === leaderName) {
        return true;
      }
    }
    return false;
  };

  const canAddRotation = isAdmin || isUserMayArnuncio(user) || isLeader || canWriteSchedule;

  // ── 1. Fetch Items ──────────────────────────────────────────────────────────
  const fetchItems = async () => {
    setIsLoading(true);
    try {
      const q = query(collection(db, "worship_leader_schedules"), orderBy("date", "asc"));
      const snap = await getDocs(q);
      const fetched: WorshipLeaderScheduleItem[] = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as WorshipLeaderScheduleItem[];

      setItems(fetched);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(fetched));
    } catch (e) {
      console.warn("Failed to fetch worship leader schedules from Firestore:", e);
      try {
        const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (cached) setItems(JSON.parse(cached));
      } catch {}
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchItems();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // ── 2. Member Helper Lookup ────────────────────────────────────────────────
  const findMemberByName = (name: string): Member | undefined => {
    if (!name) return undefined;
    const clean = name.trim().toLowerCase();
    return allMembers.find(
      (m) =>
        m.name.toLowerCase() === clean ||
        m.name.toLowerCase().includes(clean) ||
        clean.includes(m.name.toLowerCase())
    );
  };

  // ── 3. Toggle Completion Checklist ──────────────────────────────────────────
  const toggleCompleted = async (item: WorshipLeaderScheduleItem) => {
    const updatedStatus = !item.completed;
    const newItems = items.map((it) =>
      it.id === item.id ? { ...it, completed: updatedStatus } : it
    );
    setItems(newItems);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newItems));

    try {
      await setDoc(
        doc(db, "worship_leader_schedules", item.id),
        { completed: updatedStatus, updated_at: new Date().toISOString() },
        { merge: true }
      );
      showToast(
        "success",
        `Rotation on ${item.date} marked as ${updatedStatus ? "completed" : "pending"}`
      );
    } catch (e) {
      showToast("error", "Failed to save completion status.");
    }
  };

  // ── 4. Manual Edit/Add Logic ────────────────────────────────────────────────
  const openManualAdd = () => {
    setEditingItem(null);
    // Find next upcoming Sunday as default
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilSunday = (7 - dayOfWeek) % 7 || 7;
    const nextSunday = new Date(today);
    nextSunday.setDate(today.getDate() + daysUntilSunday);
    const dateStr = nextSunday.toISOString().split("T")[0];

    setFormDate(dateStr);
    setFormLeader("");
    setFormBackup1("");
    setFormBackup2("");
    setFormNotes("");
    setShowAddMenu(false);
    setShowEditModal(true);
  };

  const openManualEdit = (item: WorshipLeaderScheduleItem) => {
    setEditingItem(item);
    setFormDate(item.date);
    setFormLeader(item.worshipLeader);
    setFormBackup1(item.backupSingers[0] || "");
    setFormBackup2(item.backupSingers[1] || "");
    setFormNotes(item.notes || "");
    setShowEditModal(true);
  };

  const handleSaveManualForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

    if (!formDate || !formLeader.trim()) {
      showToast("error", "Please specify a date and Worship Leader name.");
      return;
    }

    if (formDate < todayStr) {
      showToast("error", "Past dates cannot be scheduled for rotation. Please select today or a future date.");
      return;
    }

    if (formLeader.trim() && (formLeader.trim() === formBackup1.trim() || formLeader.trim() === formBackup2.trim())) {
      showToast("error", "The Worship Leader cannot also be selected as a Backup Singer.");
      return;
    }
    if (formBackup1.trim() && formBackup2.trim() && formBackup1.trim() === formBackup2.trim()) {
      showToast("error", "Backup Singer 1 and Backup Singer 2 cannot be the same person.");
      return;
    }

    // Check for duplicate date
    const existingDateItem = items.find(
      (it) => it.date === formDate && it.id !== editingItem?.id
    );
    if (existingDateItem) {
      const formattedDate = new Date(formDate + "T00:00:00").toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      showToast(
        "error",
        `A schedule rotation for ${formattedDate} already exists (${existingDateItem.worshipLeader}). Please edit that entry instead.`
      );
      return;
    }

    setIsSavingForm(true);
    try {
      const dateObj = new Date(formDate + "T00:00:00");
      const monthStr = dateObj.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });

      const backups = [formBackup1.trim(), formBackup2.trim()].filter(Boolean);

      const leaderMem = findMemberByName(formLeader);
      const docId = editingItem ? editingItem.id : `wls_${formDate}_${Date.now()}`;

      const newItem: WorshipLeaderScheduleItem = {
        id: docId,
        date: formDate,
        month: monthStr,
        worshipLeader: formLeader.trim(),
        worshipLeaderId: leaderMem?.id || "",
        worshipLeaderPhoto: leaderMem?.photo || "",
        backupSingers: backups,
        completed: editingItem ? editingItem.completed : false,
        notes: formNotes.trim(),
        created_at: editingItem?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      try {
        await setDoc(doc(db, "worship_leader_schedules", docId), newItem);
      } catch (dbErr) {
        console.warn("Firestore save warning (persisting locally):", dbErr);
      }

      setItems((prev) => {
        const filtered = prev.filter((it) => it.id !== docId);
        const next = [...filtered, newItem].sort((a, b) => a.date.localeCompare(b.date));
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
        return next;
      });

      showToast("success", editingItem ? "Rotation updated!" : "New rotation added!");
      setShowEditModal(false);
    } catch (err) {
      console.error("Save error:", err);
      showToast("error", "Failed to save schedule rotation.");
    } finally {
      setIsSavingForm(false);
    }
  };

  // ── 5. Delete Rotation Entry ────────────────────────────────────────────────
  const handleDeleteItem = (item: WorshipLeaderScheduleItem) => {
    showConfirm({
      title: "Delete Worship Leader Rotation?",
      message: `Are you sure you want to remove the schedule for ${item.worshipLeader} on ${item.date}?`,
      confirmText: "Delete",
      confirmClass: "bg-red-600 hover:bg-red-700 text-white",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "worship_leader_schedules", item.id));
        } catch (e) {
          console.warn("Firestore delete warning (removing locally):", e);
        }
        setItems((prev) => {
          const next = prev.filter((it) => it.id !== item.id);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
          return next;
        });
        showToast("success", "Rotation removed.");
      },
    });
  };

  // ── 6. Sync Rotation to Sunday Service Calendar Event ───────────────────────
  const handleSyncToSchedule = async (item: WorshipLeaderScheduleItem) => {
    setSyncingId(item.id);
    try {
      const leaderMember = findMemberByName(item.worshipLeader);

      const formattedLeader = leaderMember
        ? {
            memberId: leaderMember.id,
            name: leaderMember.name,
            photo: leaderMember.photo || "",
            role: "Worship Leader",
          }
        : {
            memberId: "",
            name: item.worshipLeader,
            photo: "",
            role: "Worship Leader",
          };

      const formattedBackups = item.backupSingers.map((name) => {
        const m = findMemberByName(name);
        return {
          memberId: m?.id || "",
          name: m?.name || name,
          photo: m?.photo || "",
          role: "Backup Singer",
        };
      });

      const existingEv = allSchedules.find((s) => s.date === item.date);

      if (existingEv) {
        const updatedEv: Schedule = {
          ...existingEv,
          worshipLeader: formattedLeader,
          backupSingers: formattedBackups,
        };

        const res = await fetch(`/api/schedules/${existingEv.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedEv),
        });

        if (!res.ok) throw new Error("Sync failed");
        setAllSchedules((prev) =>
          prev.map((s) => (s.id === existingEv.id ? updatedEv : s))
        );
        showToast("success", `Updated Sunday Service on ${item.date}!`);
      } else {
        const newEv: Partial<Schedule> = {
          date: item.date,
          serviceType: "sunday",
          eventName: "Sunday Service",
          worshipLeader: formattedLeader,
          backupSingers: formattedBackups,
          musicians: [],
          assignments: [],
          songLineup: {},
        };

        const res = await fetch("/api/schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newEv),
        });

        if (!res.ok) throw new Error("Sync failed");
        const saved = await res.json();
        setAllSchedules((prev) => [...prev, saved]);
        showToast("success", `Created Sunday Service event for ${item.date}!`);
      }
    } catch (e) {
      console.error(e);
      showToast("error", "Failed to sync rotation to Sunday Service schedule.");
    } finally {
      setSyncingId(null);
    }
  };

  // ── 7. OCR / Camera Image Processing Logic ─────────────────────────────────
  const processImageFile = async (file: File) => {
    setShowAddMenu(false);
    setIsOcrProcessing(true);

    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1];
          resolve(base64);
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64Data,
          mimeType: file.type || "image/png",
          type: "worship_leader_schedule",
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "OCR processing failed.");
      }

      const data = await res.json();
      const rawText: string = data.text || "";

      // Parse JSON from raw Gemini response
      let cleanJsonStr = rawText.trim();
      if (cleanJsonStr.startsWith("```")) {
        cleanJsonStr = cleanJsonStr.replace(/^```(json)?/, "").replace(/```$/, "").trim();
      }

      const parsed: any[] = JSON.parse(cleanJsonStr);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("No schedule rotations could be detected from the image.");
      }

      const formatted: Partial<WorshipLeaderScheduleItem>[] = parsed.map((entry, idx) => ({
        id: `ocr_${entry.date || idx}_${Date.now()}`,
        date: entry.date || "",
        month: entry.month || "",
        worshipLeader: entry.worshipLeader || "",
        backupSingers: Array.isArray(entry.backupSingers)
          ? entry.backupSingers
          : entry.backupSingers
          ? [entry.backupSingers]
          : [],
        completed: false,
      }));

      setOcrPreviewItems(formatted);
      showToast("success", `AI successfully recognized ${formatted.length} rotation schedule items!`);
    } catch (e: any) {
      console.error("OCR parse failure:", e);
      showToast("error", e.message || "Failed to parse schedule image. Try a clearer screenshot.");
    } finally {
      setIsOcrProcessing(false);
    }
  };

  const handleSaveOcrPreview = async () => {
    if (!ocrPreviewItems || !ocrPreviewItems.length) return;
    setIsSavingOcr(true);

    try {
      const newItemsToSave: WorshipLeaderScheduleItem[] = [];

      for (const item of ocrPreviewItems) {
        if (!item.date || !item.worshipLeader) continue;

        const dateObj = new Date(item.date + "T00:00:00");
        const monthStr =
          item.month ||
          dateObj.toLocaleDateString("en-US", { month: "long", year: "numeric" });

        const leaderMem = findMemberByName(item.worshipLeader);
        const existingForDate = items.find((it) => it.date === item.date);
        const docId = existingForDate
          ? existingForDate.id
          : `wls_${item.date}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;

        const newItem: WorshipLeaderScheduleItem = {
          id: docId,
          date: item.date,
          month: monthStr,
          worshipLeader: item.worshipLeader.trim(),
          worshipLeaderId: leaderMem?.id || "",
          worshipLeaderPhoto: leaderMem?.photo || "",
          backupSingers: item.backupSingers || [],
          completed: existingForDate ? existingForDate.completed : false,
          notes: existingForDate?.notes || "",
          created_at: existingForDate?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        try {
          await setDoc(doc(db, "worship_leader_schedules", docId), newItem);
        } catch (dbErr) {
          console.warn("Firestore save warning (persisting locally):", dbErr);
        }
        newItemsToSave.push(newItem);
      }

      setItems((prev) => {
        const savedDates = new Set(newItemsToSave.map((it) => it.date));
        const filtered = prev.filter((it) => !savedDates.has(it.date));
        const next = [...filtered, ...newItemsToSave].sort((a, b) => a.date.localeCompare(b.date));
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
      showToast("success", `Imported ${newItemsToSave.length} rotation schedules!`);
      setOcrPreviewItems(null);
    } catch (e) {
      console.error(e);
      showToast("error", "Failed to save imported schedule items.");
    } finally {
      setIsSavingOcr(false);
    }
  };

  // Group items by Month
  const availableMonths = Array.from(new Set(items.map((i) => i.month)));
  const filteredItems = selectedMonth === "all" ? items : items.filter((i) => i.month === selectedMonth);

  const groupedByMonth: Record<string, WorshipLeaderScheduleItem[]> = {};
  filteredItems.forEach((it) => {
    if (!groupedByMonth[it.month]) groupedByMonth[it.month] = [];
    groupedByMonth[it.month].push(it);
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) processImageFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) processImageFile(e.target.files[0]);
          e.target.value = "";
        }}
      />

      {/* Main Modal Container */}
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-white/10 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/10 bg-gray-50/50 dark:bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/20">
              <Users size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
                Worship Leaders Schedule
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                  Rotations
                </span>
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Monthly Sunday service worship leaders & backup singers roster
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Add / Import Button */}
            {canAddRotation && (
              <div className="relative">
                <button
                  onClick={() => setShowAddMenu((prev) => !prev)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 active:scale-95 text-white text-xs font-bold transition-all shadow-md shadow-violet-500/20"
                >
                  <Plus size={16} />
                  <span>Add Rotation</span>
                </button>

                {/* Dropdown Menu */}
                {showAddMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-white/10 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    <button
                      onClick={openManualAdd}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-violet-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <Plus size={15} className="text-violet-600 dark:text-violet-400" />
                      <span>Add Manually</span>
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-violet-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <Upload size={15} className="text-indigo-600 dark:text-indigo-400" />
                      <span>Import Screenshot / Image</span>
                    </button>
                    <button
                      onClick={() => cameraInputRef.current?.click()}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-violet-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <Camera size={15} className="text-pink-600 dark:text-pink-400" />
                      <span>Capture from Camera</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-all"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Filter Month Dropdown */}
        {availableMonths.length > 0 && (
          <div className="flex items-center gap-2 px-6 py-2.5 border-b border-gray-100 dark:border-white/5 bg-gray-50/30 dark:bg-black/10">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Filter Month:</span>
            <div className="relative inline-block">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="appearance-none pl-3.5 pr-9 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-bold focus:ring-2 focus:ring-violet-500 shadow-xs cursor-pointer"
              >
                <option value="all">All Months</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* AI OCR Loading Indicator */}
          {isOcrProcessing && (
            <div className="p-6 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/50 flex items-center gap-4 animate-pulse">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0">
                <Loader2 size={20} className="animate-spin" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                  <Sparkles size={16} className="text-indigo-600 dark:text-indigo-400" />
                  AI Schedule Recognition in Progress...
                </h4>
                <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-0.5">
                  Google Gemini is analyzing your screenshot to extract Sunday dates, worship leaders, and backup singers.
                </p>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && items.length === 0 && !isOcrProcessing && (
            <div className="py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-violet-50 dark:bg-white/5 text-violet-500 mx-auto flex items-center justify-center mb-4 border border-violet-100 dark:border-white/10">
                <Calendar size={28} />
              </div>
              <h4 className="text-base font-bold text-gray-900 dark:text-white">
                No Worship Leader Schedules Found
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto mt-1 mb-5">
                Add schedule rotations manually or import a screenshot image of your monthly schedule roster.
              </p>
              {canAddRotation && (
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={openManualAdd}
                    className="px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 transition-all shadow-md"
                  >
                    Add Manually
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200 text-xs font-bold hover:bg-gray-200 dark:hover:bg-white/20 transition-all"
                  >
                    Upload Screenshot
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Loading Spinner */}
          {isLoading && (
            <div className="py-20 text-center">
              <Loader2 size={32} className="animate-spin text-violet-600 mx-auto mb-2" />
              <p className="text-xs font-medium text-gray-500">Loading rotation schedules...</p>
            </div>
          )}

          {/* Grouped Month Cards */}
          {Object.entries(groupedByMonth).map(([monthName, monthList]) => (
            <div
              key={monthName}
              className="bg-gray-50/50 dark:bg-white/5 rounded-2xl p-4 border border-gray-200 dark:border-white/10 space-y-3"
            >
              <h4 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2 border-b border-gray-200 dark:border-white/10 pb-2">
                <Calendar size={15} className="text-violet-600 dark:text-violet-400" />
                {monthName}
              </h4>

              <div className="grid grid-cols-1 gap-2.5">
                {monthList.map((item) => {
                  const dateObj = new Date(item.date + "T00:00:00");
                  const formattedDate = dateObj.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  });
                  const dayNum = dateObj.getDate();

                  return (
                    <div
                      key={item.id}
                      className={`group flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                        item.completed
                          ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40"
                          : "bg-white dark:bg-gray-800/90 border-gray-200 dark:border-white/10 shadow-sm hover:border-violet-300 dark:hover:border-violet-600/50"
                      }`}
                    >
                      {/* Left: Checkbox + Date */}
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          onClick={() => toggleCompleted(item)}
                          className="shrink-0 text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                          title={item.completed ? "Mark as pending" : "Mark as completed"}
                        >
                          {item.completed ? (
                            <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Circle size={20} />
                          )}
                        </button>

                        <div className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-white/10 flex items-center justify-center font-black text-sm text-gray-800 dark:text-gray-200 shrink-0">
                            {dayNum}
                          </span>
                          <div>
                            <span className="text-xs font-bold text-gray-900 dark:text-white block">
                              {formattedDate}
                            </span>
                            <span className="text-[10px] text-gray-400 font-medium">Sunday Service</span>
                          </div>
                        </div>
                      </div>

                      {/* Middle: Worship Leader & Backup Singers */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 mx-4">
                        {/* Worship Leader */}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-extrabold uppercase text-gray-400 dark:text-gray-500">
                            Leader:
                          </span>
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200 text-xs font-extrabold">
                            <User size={13} className="text-violet-600 dark:text-violet-400" />
                            <span>{item.worshipLeader}</span>
                          </div>
                        </div>

                        {/* Backup Singers */}
                        {item.backupSingers.length > 0 && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-extrabold uppercase text-gray-400 dark:text-gray-500">
                              Backups:
                            </span>
                            <div className="flex items-center gap-1 flex-wrap">
                              {item.backupSingers.map((bName, bi) => (
                                <span
                                  key={bi}
                                  className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold"
                                >
                                  {bName}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Right Actions — Accessible ONLY by Admin, May Arnuncio, or scheduled Worship Leader on that day */}
                      <div className="flex items-center gap-1 shrink-0">
                        {canManageItem(item) && (
                          <>
                            {/* Edit button */}
                            <button
                              onClick={() => openManualEdit(item)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-all"
                            >
                              <Pencil size={15} />
                            </button>

                            {/* Delete button */}
                            <button
                              onClick={() => handleDeleteItem(item)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-all"
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Manual Add / Edit Modal ────────────────────────────────────────────── */}
      {showEditModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-white/10 bg-gray-50/50 dark:bg-white/5">
              <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                {editingItem ? "Edit Worship Leader Rotation" : "Add Worship Leader Rotation"}
              </h4>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveManualForm} className="p-5 space-y-4">
              {/* Date */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Sunday Date
                </label>
                <input
                  type="date"
                  required
                  min={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })}
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-violet-500"
                />
              </div>

              {/* ── Role Categorized Dropdown Lists ── */}
              {(() => {
                // Filter members strictly by their registered role
                const isWL = (m: Member) => (m.roles || []).some((r) => /worship leader/i.test(r));
                const isBS = (m: Member) => (m.roles || []).some((r) => /backup|singer|vocalist/i.test(r));

                const wlMembers = allMembers.filter(isWL);
                // Fallback to allMembers if no members have been assigned the "Worship Leader" role yet
                const wlOptions = wlMembers.length > 0 ? wlMembers : allMembers;

                const bsMembers = allMembers.filter(isBS);
                // Fallback to allMembers if no members have been assigned the "Backup Singer" role yet
                const bsOptionsBase = bsMembers.length > 0 ? bsMembers : allMembers;

                return (
                  <>
                    {/* Worship Leader */}
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                        Worship Leader
                      </label>
                      <div className="relative">
                        <select
                          required
                          value={formLeader}
                          onChange={(e) => setFormLeader(e.target.value)}
                          className="w-full appearance-none pl-3.5 pr-9 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-violet-500 cursor-pointer"
                        >
                          <option value="">Select Worship Leader...</option>
                          {formLeader &&
                            !wlOptions.some((m) => m.name.toLowerCase() === formLeader.toLowerCase()) && (
                              <option value={formLeader}>{formLeader}</option>
                            )}
                          {wlOptions.map((m) => (
                            <option key={m.id} value={m.name}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                    </div>

                    {/* Backup Singers */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                          Backup Singer 1
                        </label>
                        <div className="relative">
                          <select
                            value={formBackup1}
                            onChange={(e) => setFormBackup1(e.target.value)}
                            className="w-full appearance-none pl-3.5 pr-9 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-violet-500 cursor-pointer"
                          >
                            <option value="">Select Backup Singer 1...</option>
                            {formBackup1 &&
                              formBackup1.toLowerCase() !== formLeader.toLowerCase() &&
                              formBackup1.toLowerCase() !== formBackup2.toLowerCase() &&
                              !bsOptionsBase.some((m) => m.name.toLowerCase() === formBackup1.toLowerCase()) && (
                                <option value={formBackup1}>{formBackup1}</option>
                              )}
                            {bsOptionsBase
                              .filter(
                                (m) =>
                                  m.name.toLowerCase() !== formLeader.toLowerCase() &&
                                  m.name.toLowerCase() !== formBackup2.toLowerCase()
                              )
                              .map((m) => (
                                <option key={m.id} value={m.name}>
                                  {m.name}
                                </option>
                              ))}
                          </select>
                          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                          Backup Singer 2
                        </label>
                        <div className="relative">
                          <select
                            value={formBackup2}
                            onChange={(e) => setFormBackup2(e.target.value)}
                            className="w-full appearance-none pl-3.5 pr-9 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-violet-500 cursor-pointer"
                          >
                            <option value="">Select Backup Singer 2...</option>
                            {formBackup2 &&
                              formBackup2.toLowerCase() !== formLeader.toLowerCase() &&
                              formBackup2.toLowerCase() !== formBackup1.toLowerCase() &&
                              !bsOptionsBase.some((m) => m.name.toLowerCase() === formBackup2.toLowerCase()) && (
                                <option value={formBackup2}>{formBackup2}</option>
                              )}
                            {bsOptionsBase
                              .filter(
                                (m) =>
                                  m.name.toLowerCase() !== formLeader.toLowerCase() &&
                                  m.name.toLowerCase() !== formBackup1.toLowerCase()
                              )
                              .map((m) => (
                                <option key={m.id} value={m.name}>
                                  {m.name}
                                </option>
                              ))}
                          </select>
                          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Special instructions or theme"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingForm}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-50"
                >
                  {isSavingForm && <Loader2 size={14} className="animate-spin" />}
                  <span>Save Rotation</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── AI OCR Preview & Confirmation Modal ────────────────────────────────── */}
      {ocrPreviewItems && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-xl max-h-[85vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/10 bg-indigo-50/50 dark:bg-indigo-950/30">
              <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200">
                <Sparkles size={18} className="text-indigo-600 dark:text-indigo-400" />
                <h4 className="text-sm font-bold">Review AI Recognized Schedule</h4>
              </div>
              <button
                onClick={() => setOcrPreviewItems(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Please verify or adjust the dates, worship leaders, and backup singers extracted from your image before saving.
              </p>

              {ocrPreviewItems.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 space-y-2"
                >
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-gray-500">Date (YYYY-MM-DD)</label>
                      <input
                        type="date"
                        value={item.date || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setOcrPreviewItems((prev) =>
                            prev!.map((it, i) => (i === idx ? { ...it, date: val } : it))
                          );
                        }}
                        className="w-full px-2 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-gray-500">Worship Leader</label>
                      <input
                        type="text"
                        value={item.worshipLeader || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setOcrPreviewItems((prev) =>
                            prev!.map((it, i) => (i === idx ? { ...it, worshipLeader: val } : it))
                          );
                        }}
                        className="w-full px-2 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-gray-500">Backup Singers</label>
                      <input
                        type="text"
                        value={(item.backupSingers || []).join(", ")}
                        onChange={(e) => {
                          const val = e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean);
                          setOcrPreviewItems((prev) =>
                            prev!.map((it, i) => (i === idx ? { ...it, backupSingers: val } : it))
                          );
                        }}
                        className="w-full px-2 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 dark:border-white/10 bg-gray-50/50 dark:bg-white/5">
              <button
                onClick={() => setOcrPreviewItems(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveOcrPreview}
                disabled={isSavingOcr}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSavingOcr ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                <span>Import & Save All Rotations</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
