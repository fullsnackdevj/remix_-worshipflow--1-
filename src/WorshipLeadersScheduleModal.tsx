import React, { useState, useEffect, useRef } from "react";
import { Member, Schedule, WorshipLeaderScheduleItem, MinistryScheduleCategory, PreacherServiceType } from "./types";
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
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Sun,
  Flame,
  Filter,
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
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Manual Edit/Add Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<WorshipLeaderScheduleItem | null>(null);
  const [formCategory, setFormCategory] = useState<MinistryScheduleCategory>("worship_leader");
  const [formPreacherServiceType, setFormPreacherServiceType] = useState<PreacherServiceType>("sunday");
  const [formDate, setFormDate] = useState("");
  const [formLeader, setFormLeader] = useState(""); // Primary Person Name
  const [formBackup1, setFormBackup1] = useState("");
  const [formBackup2, setFormBackup2] = useState("");
  const [formSermonTitle, setFormSermonTitle] = useState("");
  const [formTopicSharing, setFormTopicSharing] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formIsGuestSpeaker, setFormIsGuestSpeaker] = useState(false);
  const [formGuestSpeakerName, setFormGuestSpeakerName] = useState("");
  const [isSavingForm, setIsSavingForm] = useState(false);
  const [showCalendarPopover, setShowCalendarPopover] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());

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
  // ONLY Admin and May Arnuncio can add, edit, and delete rotations.
  // Everyone else gets VIEW-ONLY access.
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

  const canManageItem = (_item: WorshipLeaderScheduleItem) => {
    if (isAdmin) return true;
    if (isUserMayArnuncio(user)) return true;
    return false;
  };

  const canAddRotation = isAdmin || isUserMayArnuncio(user);

  // ── 1. Fetch Items ──────────────────────────────────────────────────────────
  const fetchItems = async () => {
    setIsLoading(true);
    try {
      const q = query(collection(db, "worship_leader_schedules"), orderBy("date", "asc"));
      const snap = await getDocs(q);
      const fetched: WorshipLeaderScheduleItem[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          category: data.category || "worship_leader",
          preacherServiceType: data.preacherServiceType || (data.category === "preacher" ? "sunday" : undefined),
          ...data,
          backupSingers: Array.isArray(data.backupSingers) ? data.backupSingers : [],
        };
      }) as WorshipLeaderScheduleItem[];

      // Auto-cleanup: delete past-date rotations
      const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
      const pastItems = fetched.filter((it) => it.date < todayStr);
      const currentItems = fetched.filter((it) => it.date >= todayStr);

      // Delete past items from Firestore silently
      for (const pastItem of pastItems) {
        try {
          await deleteDoc(doc(db, "worship_leader_schedules", pastItem.id));
        } catch (e) {
          console.warn("Failed to auto-delete past rotation:", pastItem.id, e);
        }
      }

      setItems(currentItems);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(currentItems));
    } catch (e) {
      console.warn("Failed to fetch ministry schedules from Firestore:", e);
      try {
        const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (cached) {
          const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
          const parsed = JSON.parse(cached).filter((it: any) => it.date >= todayStr);
          setItems(parsed);
        }
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

  // ── Member Filtering ────────────────────────────────────────────────────────
  const excludedNames = ["angelica", "ricknel", "iclc project 8", "test account"];
  const isExcludedName = (nameStr: string) => {
    if (!nameStr) return false;
    const lower = nameStr.toLowerCase();
    return excludedNames.some((ex) => lower.includes(ex));
  };

  const selectableMembers = allMembers.filter((m) => !isExcludedName(m.name));

  // ── 2. Member Helper Lookup ────────────────────────────────────────────────
  const findMemberByName = (name: string): Member | undefined => {
    if (!name) return undefined;
    const clean = name.trim().toLowerCase();
    return selectableMembers.find(
      (m) =>
        m.name.toLowerCase() === clean ||
        m.name.toLowerCase().includes(clean) ||
        clean.includes(m.name.toLowerCase())
    );
  };

  // ── 4. Manual Edit/Add Logic ────────────────────────────────────────────────
  const openManualAdd = (
    cat: MinistryScheduleCategory = "worship_leader",
    preacherType: PreacherServiceType = "sunday"
  ) => {
    setEditingItem(null);
    setFormCategory(cat);
    setFormPreacherServiceType(preacherType);
    const today = new Date();
    const dayOfWeek = today.getDay();

    let targetDate = new Date(today);
    if (cat === "preacher" && preacherType === "midweek") {
      // Find next Wednesday (day 3)
      const daysUntilWed = (3 - dayOfWeek + 7) % 7 || 7;
      targetDate.setDate(today.getDate() + daysUntilWed);
    } else {
      // Find next Sunday (day 0)
      const daysUntilSunday = (7 - dayOfWeek) % 7 || 7;
      targetDate.setDate(today.getDate() + daysUntilSunday);
    }
    const dateStr = targetDate.toISOString().split("T")[0];

    setFormDate(dateStr);
    setCalendarMonth(new Date(targetDate.getFullYear(), targetDate.getMonth(), 1, 12, 0, 0));
    setShowCalendarPopover(false);
    setFormLeader("");
    setFormBackup1("");
    setFormBackup2("");
    setFormSermonTitle("");
    setFormTopicSharing("");
    setFormNotes("");
    setFormIsGuestSpeaker(false);
    setFormGuestSpeakerName("");
    setShowAddMenu(false);
    setShowEditModal(true);
  };

  const openManualEdit = (item: WorshipLeaderScheduleItem) => {
    setEditingItem(item);
    setFormCategory(item.category || "worship_leader");
    setFormPreacherServiceType(item.preacherServiceType || "sunday");
    setFormDate(item.date);
    if (item.date) {
      const d = new Date(item.date + "T12:00:00");
      setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0));
    }
    setShowCalendarPopover(false);
    // Detect if this was a guest speaker (name not in member list, for preacher/facilitator)
    const cat = item.category || "worship_leader";
    const isGuest = (cat === "preacher" || cat === "youth_facilitator") &&
      item.worshipLeader &&
      !selectableMembers.some((m) => m.name.toLowerCase() === item.worshipLeader.toLowerCase());
    setFormIsGuestSpeaker(isGuest);
    setFormGuestSpeakerName(isGuest ? item.worshipLeader : "");
    setFormLeader(isGuest ? "__guest__" : item.worshipLeader);
    setFormBackup1(item.backupSingers?.[0] || "");
    setFormBackup2(item.backupSingers?.[1] || "");
    setFormSermonTitle(item.sermonTitle || "");
    setFormTopicSharing(item.topicSharing || "");
    setFormNotes(item.notes || "");
    setShowEditModal(true);
  };

  // ── Date Restriction & Snap Helper ──────────────────────────────────────────
  const validateAndSnapDate = (selectedDateStr: string, cat: MinistryScheduleCategory, preacherType: PreacherServiceType) => {
    if (!selectedDateStr) return "";
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

    // 1. Past date check
    if (selectedDateStr < todayStr) {
      showToast("error", "Past dates cannot be scheduled. Automatically reset to upcoming date.");
      selectedDateStr = todayStr;
    }

    const dateObj = new Date(selectedDateStr + "T00:00:00");
    const dayOfWeek = dateObj.getDay();

    const isMidweek = cat === "preacher" && preacherType === "midweek";
    const targetDay = isMidweek ? 3 : 0; // 3 = Wednesday, 0 = Sunday

    if (dayOfWeek !== targetDay) {
      const dayName = isMidweek ? "Wednesday" : "Sunday";
      const ministryLabel = isMidweek
        ? "Mid-week Preacher"
        : cat === "worship_leader"
        ? "Worship Leader"
        : cat === "preacher"
        ? "Sunday Preacher"
        : "Youth Facilitator";

      showToast(
        "error",
        `${ministryLabel} schedules must be on a ${dayName}. Date automatically snapped to nearest ${dayName}.`
      );

      const diff = (targetDay - dayOfWeek + 7) % 7 || 7;
      const adjusted = new Date(dateObj);
      adjusted.setDate(dateObj.getDate() + diff);
      return adjusted.toISOString().split("T")[0];
    }

    return selectedDateStr;
  };

  const getUpcomingAllowedDates = () => {
    const isMidweek = formCategory === "preacher" && formPreacherServiceType === "midweek";
    const targetDay = isMidweek ? 3 : 0;
    const today = new Date();
    const todayStr = today.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

    const result: { dateStr: string; label: string }[] = [];
    let curr = new Date(today);
    const dayOfWeek = curr.getDay();
    let daysUntilTarget = (targetDay - dayOfWeek + 7) % 7;
    curr.setDate(curr.getDate() + daysUntilTarget);

    for (let i = 0; i < 26; i++) {
      const dStr = curr.toISOString().split("T")[0];
      if (dStr >= todayStr) {
        const formatted = curr.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        result.push({ dateStr: dStr, label: formatted });
      }
      curr.setDate(curr.getDate() + 7);
    }
    return result;
  };

  const handleSaveManualForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

    if (!formDate) {
      showToast("error", "Date is required.");
      return;
    }

    // Resolve the actual person name (could be a guest speaker)
    const resolvedLeaderName = formIsGuestSpeaker ? formGuestSpeakerName.trim() : formLeader.trim();

    if (formIsGuestSpeaker && !formGuestSpeakerName.trim()) {
      showToast("error", "Guest Speaker name is required.");
      return;
    }

    if (!formIsGuestSpeaker && !formLeader.trim()) {
      const roleLabel =
        formCategory === "worship_leader"
          ? "Worship Leader"
          : formCategory === "preacher"
          ? "Preacher Name"
          : "Youth Facilitator Name";
      showToast("error", `${roleLabel} is required.`);
      return;
    }

    if (formDate < todayStr) {
      showToast("error", "Past dates cannot be scheduled. Please select today or a future date.");
      return;
    }

    // Enforce day-of-week restriction
    const dateObj = new Date(formDate + "T00:00:00");
    const dayOfWeek = dateObj.getDay();

    if (formCategory === "preacher" && formPreacherServiceType === "midweek") {
      if (dayOfWeek !== 3) {
        showToast("error", "Mid-week Service Preacher schedules must be on a Wednesday.");
        return;
      }
    } else {
      if (dayOfWeek !== 0) {
        const roleLabel =
          formCategory === "worship_leader"
            ? "Worship Leader"
            : formCategory === "preacher"
            ? "Sunday Preacher"
            : "Youth Facilitator";
        showToast("error", `${roleLabel} schedules must be on a Sunday.`);
        return;
      }
    }

    if (formCategory === "worship_leader") {
      const backups = [formBackup1 ? formBackup1.trim() : "", formBackup2 ? formBackup2.trim() : ""].filter(Boolean);
      if (backups.length === 0) {
        showToast("error", "At least 1 Backup Singer must be assigned for Worship Leader rotations.");
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
    }

    // Check for duplicate entry for the same date & category/service type
    const existingDateItem = items.find(
      (it) =>
        it.date === formDate &&
        (it.category || "worship_leader") === formCategory &&
        (formCategory !== "preacher" || (it.preacherServiceType || "sunday") === formPreacherServiceType) &&
        it.id !== editingItem?.id
    );

    if (existingDateItem) {
      const formattedDate = new Date(formDate + "T00:00:00").toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      const categoryName =
        formCategory === "worship_leader"
          ? "Worship Leader"
          : formCategory === "preacher"
          ? `${formPreacherServiceType === "sunday" ? "Sunday" : "Mid-week"} Preacher`
          : "Youth Facilitator";
      showToast(
        "error",
        `A ${categoryName} schedule for ${formattedDate} already exists (${existingDateItem.worshipLeader}). Please edit that entry instead.`
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

      const backups = formCategory === "worship_leader" ? [formBackup1.trim(), formBackup2.trim()].filter(Boolean) : [];

      const leaderMem = formIsGuestSpeaker ? undefined : findMemberByName(formLeader);
      const docId = editingItem ? editingItem.id : `ms_${formCategory}_${formDate}_${Date.now()}`;

      const newItem: WorshipLeaderScheduleItem = {
        id: docId,
        date: formDate,
        month: monthStr,
        category: formCategory,
        preacherServiceType: formCategory === "preacher" ? formPreacherServiceType : undefined,
        worshipLeader: resolvedLeaderName,
        worshipLeaderId: leaderMem?.id || "",
        worshipLeaderPhoto: leaderMem?.photo || "",
        isGuestSpeaker: formIsGuestSpeaker || undefined,
        backupSingers: backups,
        sermonTitle: formCategory === "preacher" ? formSermonTitle.trim() : undefined,
        topicSharing: formCategory === "youth_facilitator" ? formTopicSharing.trim() : undefined,
        completed: editingItem ? editingItem.completed : false,
        notes: formNotes.trim(),
        created_at: editingItem?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      let savedToCloud = true;
      try {
        const firestoreData = JSON.parse(JSON.stringify(newItem));
        await setDoc(doc(db, "worship_leader_schedules", docId), firestoreData);
      } catch (dbErr) {
        savedToCloud = false;
        console.warn("Firestore save warning (persisting locally):", dbErr);
      }

      setItems((prev) => {
        const filtered = prev.filter((it) => it.id !== docId);
        const next = [...filtered, newItem].sort((a, b) => a.date.localeCompare(b.date));
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
        return next;
      });

      if (savedToCloud) {
        showToast("success", editingItem ? "Schedule entry updated!" : "New schedule entry added!");
      } else {
        showToast("error", "Saved offline only — changes may not appear on other devices. Please check your connection and try again.");
      }
      setShowEditModal(false);
    } catch (err) {
      console.error("Save error:", err);
      showToast("error", "Failed to save schedule entry.");
    } finally {
      setIsSavingForm(false);
    }
  };

  // ── 5. Delete Schedule Entry ────────────────────────────────────────────────
  const handleDeleteItem = (item: WorshipLeaderScheduleItem) => {
    const categoryName =
      (item.category || "worship_leader") === "worship_leader"
        ? "Worship Leader"
        : item.category === "preacher"
        ? `${item.preacherServiceType === "midweek" ? "Mid-week" : "Sunday"} Preacher`
        : "Youth Facilitator";

    showConfirm({
      title: `Delete ${categoryName} Schedule?`,
      message: `Are you sure you want to remove the schedule for ${item.worshipLeader} on ${item.date}?`,
      confirmText: "Delete",
      confirmClass: "bg-red-600 hover:bg-red-700 text-white",
      onConfirm: async () => {
        let deletedFromCloud = true;
        try {
          await deleteDoc(doc(db, "worship_leader_schedules", item.id));
        } catch (e) {
          deletedFromCloud = false;
          console.warn("Firestore delete warning (removing locally):", e);
        }
        setItems((prev) => {
          const next = prev.filter((it) => it.id !== item.id);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
          return next;
        });
        if (deletedFromCloud) {
          showToast("success", "Schedule entry removed.");
        } else {
          showToast("error", "Removed locally only — may reappear on refresh. Check your connection.");
        }
      },
    });
  };

  // ── 6. Sync Schedule Entry to Main Service Calendar Event ─────────────────────
  const handleSyncToSchedule = async (item: WorshipLeaderScheduleItem) => {
    setSyncingId(item.id);
    try {
      const category = item.category || "worship_leader";
      const leaderMember = findMemberByName(item.worshipLeader);

      const formattedPerson = leaderMember
        ? {
            memberId: leaderMember.id,
            name: leaderMember.name,
            photo: leaderMember.photo || "",
            role:
              category === "worship_leader"
                ? "Worship Leader"
                : category === "preacher"
                ? "Preacher"
                : "Youth Facilitator",
          }
        : {
            memberId: "",
            name: item.worshipLeader,
            photo: "",
            role:
              category === "worship_leader"
                ? "Worship Leader"
                : category === "preacher"
                ? "Preacher"
                : "Youth Facilitator",
          };

      let targetServiceType = "sunday";
      let targetEventName = "Sunday Service";

      if (category === "preacher") {
        if (item.preacherServiceType === "midweek") {
          targetServiceType = "midweek";
          targetEventName = "Mid-week Service";
        } else {
          targetServiceType = "sunday";
          targetEventName = "Sunday Service";
        }
      } else if (category === "youth_facilitator") {
        targetServiceType = "youth";
        targetEventName = "Youth Fellowship";
      }

      const existingEv = allSchedules.find(
        (s) => s.date === item.date && (s.serviceType === targetServiceType || !s.serviceType)
      );

      if (category === "worship_leader") {
        const formattedBackups = (item.backupSingers || []).map((name) => {
          const m = findMemberByName(name);
          return {
            memberId: m?.id || "",
            name: m?.name || name,
            photo: m?.photo || "",
            role: "Backup Singer",
          };
        });

        if (existingEv) {
          const updatedEv: Schedule = {
            ...existingEv,
            worshipLeader: formattedPerson,
            backupSingers: formattedBackups,
          };

          const res = await fetch(`/api/schedules/${existingEv.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedEv),
          });

          if (!res.ok) throw new Error("Sync failed");
          setAllSchedules((prev) => prev.map((s) => (s.id === existingEv.id ? updatedEv : s)));
          showToast("success", `Updated ${existingEv.eventName || "Sunday Service"} on ${item.date}!`);
        } else {
          const newEv: Partial<Schedule> = {
            date: item.date,
            serviceType: "sunday",
            eventName: "Sunday Service",
            worshipLeader: formattedPerson,
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
      } else if (category === "preacher") {
        const preacherAssignment = {
          role: "Preacher",
          members: [formattedPerson],
        };

        if (existingEv) {
          const existingAssignments = existingEv.assignments || [];
          const filteredAssignments = existingAssignments.filter((a) => a.role !== "Preacher");
          const updatedEv: Schedule = {
            ...existingEv,
            assignments: [...filteredAssignments, preacherAssignment],
            notes: item.sermonTitle ? `Sermon: ${item.sermonTitle}${existingEv.notes ? `\n${existingEv.notes}` : ""}` : existingEv.notes,
          };

          const res = await fetch(`/api/schedules/${existingEv.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedEv),
          });

          if (!res.ok) throw new Error("Sync failed");
          setAllSchedules((prev) => prev.map((s) => (s.id === existingEv.id ? updatedEv : s)));
          showToast("success", `Updated ${targetEventName} Preacher on ${item.date}!`);
        } else {
          const newEv: Partial<Schedule> = {
            date: item.date,
            serviceType: targetServiceType,
            eventName: targetEventName,
            assignments: [preacherAssignment],
            notes: item.sermonTitle ? `Sermon: ${item.sermonTitle}` : "",
          };

          const res = await fetch("/api/schedules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newEv),
          });

          if (!res.ok) throw new Error("Sync failed");
          const saved = await res.json();
          setAllSchedules((prev) => [...prev, saved]);
          showToast("success", `Created ${targetEventName} event for ${item.date}!`);
        }
      } else if (category === "youth_facilitator") {
        const facilitatorAssignment = {
          role: "Youth Facilitator",
          members: [formattedPerson],
        };

        if (existingEv) {
          const existingAssignments = existingEv.assignments || [];
          const filteredAssignments = existingAssignments.filter((a) => a.role !== "Youth Facilitator");
          const updatedEv: Schedule = {
            ...existingEv,
            assignments: [...filteredAssignments, facilitatorAssignment],
            notes: item.topicSharing ? `Topic: ${item.topicSharing}${existingEv.notes ? `\n${existingEv.notes}` : ""}` : existingEv.notes,
          };

          const res = await fetch(`/api/schedules/${existingEv.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedEv),
          });

          if (!res.ok) throw new Error("Sync failed");
          setAllSchedules((prev) => prev.map((s) => (s.id === existingEv.id ? updatedEv : s)));
          showToast("success", `Updated Youth Fellowship Facilitator on ${item.date}!`);
        } else {
          const newEv: Partial<Schedule> = {
            date: item.date,
            serviceType: "youth",
            eventName: "Youth Fellowship",
            assignments: [facilitatorAssignment],
            notes: item.topicSharing ? `Topic: ${item.topicSharing}` : "",
          };

          const res = await fetch("/api/schedules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newEv),
          });

          if (!res.ok) throw new Error("Sync failed");
          const saved = await res.json();
          setAllSchedules((prev) => [...prev, saved]);
          showToast("success", `Created Youth Fellowship event for ${item.date}!`);
        }
      }
    } catch (e) {
      console.error(e);
      showToast("error", "Failed to sync schedule entry.");
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

      let cleanJsonStr = rawText.trim();
      cleanJsonStr = cleanJsonStr.replace(/^```(json)?\n?/i, "").replace(/\n?```$/i, "").trim();
      const jsonArrayMatch = cleanJsonStr.match(/(\[\s*\{[\s\S]*\}\s*\])/m);
      if (jsonArrayMatch) {
        cleanJsonStr = jsonArrayMatch[1];
      }

      const parsed: any[] = JSON.parse(cleanJsonStr);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("No schedule entries could be detected from the image.");
      }

      const nicknameMap: Record<string, string> = {
        pat: "Patricia", pats: "Patricia", patricia: "Patricia",
        jek: "Jessica", jes: "Jessica", jessica: "Jessica",
        memey: "May Arnuncio", mey: "May Arnuncio", may: "May Arnuncio",
      };

      const normalizeName = (raw: string): string => {
        if (!raw) return raw;
        const trimmed = raw.trim();
        const lower = trimmed.toLowerCase();

        if (nicknameMap[lower]) return nicknameMap[lower];

        const memberMatch = allMembers.find((m) => {
          const memberLower = m.name.toLowerCase();
          const memberFirst = memberLower.split(" ")[0];
          return (
            memberLower === lower ||
            memberFirst === lower ||
            memberLower.includes(lower) ||
            lower.includes(memberFirst)
          );
        });
        if (memberMatch) return memberMatch.name;

        return trimmed
          .split(" ")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(" ");
      };

      const formatted: Partial<WorshipLeaderScheduleItem>[] = parsed.map((entry, idx) => ({
        id: `ocr_${entry.date || idx}_${Date.now()}`,
        date: entry.date || "",
        month: entry.month || "",
        category: "worship_leader",
        worshipLeader: normalizeName(entry.worshipLeader || ""),
        backupSingers: (
          Array.isArray(entry.backupSingers)
            ? entry.backupSingers
            : entry.backupSingers
            ? [entry.backupSingers]
            : []
        ).map((name: string) => normalizeName(name)),
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
        const validBackups = (item.backupSingers || []).filter((b) => b && b.trim());
        if (validBackups.length === 0) {
          showToast("error", `Rotation on ${item.date} is missing a Backup Singer. At least 1 Backup Singer is required.`);
          setIsSavingOcr(false);
          return;
        }

        const dateObj = new Date(item.date + "T00:00:00");
        const monthStr =
          item.month ||
          dateObj.toLocaleDateString("en-US", { month: "long", year: "numeric" });

        const leaderMem = findMemberByName(item.worshipLeader);
        const existingForDate = items.find((it) => it.date === item.date && (it.category || "worship_leader") === "worship_leader");
        const docId = existingForDate
          ? existingForDate.id
          : `ms_worship_leader_${item.date}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;

        const newItem: WorshipLeaderScheduleItem = {
          id: docId,
          date: item.date,
          month: monthStr,
          category: "worship_leader",
          worshipLeader: item.worshipLeader.trim(),
          worshipLeaderId: leaderMem?.id || "",
          worshipLeaderPhoto: leaderMem?.photo || "",
          backupSingers: item.backupSingers || [],
          completed: existingForDate ? existingForDate.completed : false,
          notes: existingForDate?.notes || "",
          created_at: existingForDate?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        let ocrSavedToCloud = true;
        try {
          const firestoreData = JSON.parse(JSON.stringify(newItem));
          await setDoc(doc(db, "worship_leader_schedules", docId), firestoreData);
        } catch (dbErr) {
          ocrSavedToCloud = false;
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
      const allSavedToCloud = newItemsToSave.length > 0;
      if (allSavedToCloud) {
        showToast("success", `Imported ${newItemsToSave.length} rotation schedules!`);
      } else {
        showToast("error", "Imported offline only — changes may not appear on other devices. Check your connection.");
      }
      setOcrPreviewItems(null);
    } catch (e) {
      console.error(e);
      showToast("error", "Failed to save imported schedule items.");
    } finally {
      setIsSavingOcr(false);
    }
  };

  // Group & Filter items by Category and Month
  const availableMonths = Array.from(new Set(items.map((i) => i.month)));

  const filteredItems = items.filter((item) => {
    const cat = item.category || "worship_leader";
    if (selectedCategoryFilter === "worship_leader" && cat !== "worship_leader") return false;
    if (selectedCategoryFilter === "preacher_sunday" && (cat !== "preacher" || (item.preacherServiceType || "sunday") !== "sunday")) return false;
    if (selectedCategoryFilter === "preacher_midweek" && (cat !== "preacher" || item.preacherServiceType !== "midweek")) return false;
    if (selectedCategoryFilter === "youth_facilitator" && cat !== "youth_facilitator") return false;
    if (selectedMonth !== "all" && item.month !== selectedMonth) return false;
    return true;
  });

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
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-gray-100 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/20 shrink-0">
              <Users size={18} className="sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                <h3 className="text-sm sm:text-lg font-black text-gray-900 dark:text-white tracking-tight leading-tight">
                  Ministry Schedule
                </h3>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 shrink-0">
                  Rosters & Rotations
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                Monthly schedules for Worship Leaders, Preachers, and Youth Facilitators
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Add Schedule Button */}
            {canAddRotation && (
              <div className="relative">
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => {
                      if (selectedCategoryFilter === "all") {
                        setShowAddMenu((prev) => !prev);
                      } else if (selectedCategoryFilter === "preacher_sunday") {
                        openManualAdd("preacher", "sunday");
                      } else if (selectedCategoryFilter === "preacher_midweek") {
                        openManualAdd("preacher", "midweek");
                      } else if (selectedCategoryFilter === "youth_facilitator") {
                        openManualAdd("youth_facilitator");
                      } else {
                        openManualAdd("worship_leader");
                      }
                    }}
                    className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-violet-600 hover:bg-violet-700 active:scale-95 text-white text-xs font-bold transition-all shadow-md shadow-violet-500/20 shrink-0"
                  >
                    <Plus size={15} className="shrink-0" />
                    <span className="whitespace-nowrap">Add Schedule</span>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    title="Import Screenshot / Image"
                    className="p-2 rounded-xl bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-white/20 transition-all shrink-0"
                  >
                    <Upload size={15} />
                  </button>
                </div>

                {/* Dropdown Menu when All Roles is selected */}
                {showAddMenu && selectedCategoryFilter === "all" && (
                  <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-white/10 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    <button
                      onClick={() => openManualAdd("worship_leader")}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-violet-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <Users size={15} className="text-violet-600 dark:text-violet-400" />
                      <span>Add Worship Leader</span>
                    </button>
                    <button
                      onClick={() => openManualAdd("preacher", "sunday")}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-amber-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <BookOpen size={15} className="text-amber-600 dark:text-amber-400" />
                      <span>Add Sunday Preacher</span>
                    </button>
                    <button
                      onClick={() => openManualAdd("preacher", "midweek")}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <BookOpen size={15} className="text-blue-600 dark:text-blue-400" />
                      <span>Add Mid-week Preacher</span>
                    </button>
                    <button
                      onClick={() => openManualAdd("youth_facilitator")}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-pink-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <Flame size={15} className="text-pink-600 dark:text-pink-400" />
                      <span>Add Youth Facilitator</span>
                    </button>
                    <hr className="my-1.5 border-gray-100 dark:border-white/10" />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <Upload size={15} className="text-indigo-600 dark:text-indigo-400" />
                      <span>Import Screenshot / Image</span>
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

        {/* Dual Filter Bar: Category Filter Dropdown + Month Filter Dropdown */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-2.5 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-black/20">
          {/* Dropdown 1: Role / Category Filter */}
          <div className="flex items-center gap-2">
            <Filter size={13} className="text-gray-400 shrink-0" />
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Role:</span>
            <div className="relative inline-block">
              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="appearance-none pl-3 pr-8 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-bold focus:ring-2 focus:ring-violet-500 shadow-xs cursor-pointer"
              >
                <option value="all">All Roles</option>
                <option value="worship_leader">🎵 Worship Leaders</option>
                <option value="preacher_sunday">📖 Preachers (Sunday)</option>
                <option value="preacher_midweek">✝️ Preachers (Mid-week)</option>
                <option value="youth_facilitator">👆 Youth Facilitators</option>
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Dropdown 2: Month Filter */}
          <div className="flex items-center gap-2">
            <Calendar size={13} className="text-gray-400 shrink-0" />
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Month:</span>
            <div className="relative inline-block">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="appearance-none pl-3 pr-8 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-bold focus:ring-2 focus:ring-violet-500 shadow-xs cursor-pointer"
              >
                <option value="all">All Months</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
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
                  Google Gemini is analyzing your screenshot to extract schedule entries.
                </p>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && filteredItems.length === 0 && !isOcrProcessing && (
            <div className="py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-violet-50 dark:bg-white/5 text-violet-500 mx-auto flex items-center justify-center mb-4 border border-violet-100 dark:border-white/10">
                <Calendar size={28} />
              </div>
              <h4 className="text-base font-bold text-gray-900 dark:text-white">
                {selectedCategoryFilter === "worship_leader"
                  ? "No Worship Leader Schedules Found"
                  : selectedCategoryFilter === "preacher_sunday"
                  ? "No Sunday Preacher Schedules Found"
                  : selectedCategoryFilter === "preacher_midweek"
                  ? "No Mid-week Preacher Schedules Found"
                  : selectedCategoryFilter === "youth_facilitator"
                  ? "No Youth Facilitator Schedules Found"
                  : "No Ministry Schedules Found"}
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto mt-1 mb-5">
                Add schedule entries manually or import a screenshot image of your roster.
              </p>
              {canAddRotation && (
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => {
                      if (selectedCategoryFilter === "preacher_sunday") openManualAdd("preacher", "sunday");
                      else if (selectedCategoryFilter === "preacher_midweek") openManualAdd("preacher", "midweek");
                      else if (selectedCategoryFilter === "youth_facilitator") openManualAdd("youth_facilitator");
                      else openManualAdd("worship_leader");
                    }}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 active:scale-95 text-white text-xs font-bold transition-all shadow-md shadow-violet-500/20"
                  >
                    <Plus size={15} />
                    <span>Add Schedule</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Loading Spinner */}
          {isLoading && (
            <div className="py-20 text-center">
              <Loader2 size={32} className="animate-spin text-violet-600 mx-auto mb-2" />
              <p className="text-xs font-medium text-gray-500">Loading ministry schedules...</p>
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
                  const category = item.category || "worship_leader";
                  const dateObj = new Date(item.date + "T00:00:00");
                  const formattedDate = dateObj.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  });
                  const dayNum = dateObj.getDate();

                  // Category styling & labels
                  let catBadgeBg = "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200";
                  let catIcon = <User size={13} className="text-violet-600 dark:text-violet-400 shrink-0" />;
                  let catLabel = "Worship Leader";
                  let serviceLabel = "Sunday Service";

                  if (category === "preacher") {
                    const isMidweek = item.preacherServiceType === "midweek";
                    serviceLabel = isMidweek ? "Mid-week Service" : "Sunday Service";
                    catLabel = isMidweek ? "Mid-week Preacher" : "Sunday Preacher";
                    catBadgeBg = isMidweek
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
                    catIcon = <BookOpen size={13} className={isMidweek ? "text-blue-600 dark:text-blue-400 shrink-0" : "text-amber-600 dark:text-amber-400 shrink-0"} />;
                  } else if (category === "youth_facilitator") {
                    serviceLabel = "Youth Fellowship";
                    catLabel = "Youth Facilitator";
                    catBadgeBg = "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200";
                    catIcon = <Flame size={13} className="text-pink-600 dark:text-pink-400 shrink-0" />;
                  }

                  return (
                    <div
                      key={item.id}
                      className="group flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 rounded-2xl border gap-3 transition-all bg-white dark:bg-gray-800/90 border-gray-200 dark:border-white/10 shadow-sm hover:border-violet-300 dark:hover:border-violet-600/50"
                    >
                      {/* Top / Main Info Row: Date & Service Type */}
                      <div className="flex items-center justify-between gap-3 w-full sm:w-auto">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-white/10 flex items-center justify-center font-black text-xs text-violet-700 dark:text-gray-200 shrink-0">
                              {dayNum}
                            </span>
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-gray-900 dark:text-white block whitespace-nowrap">
                                {formattedDate}
                              </span>
                              <span className="text-[10px] text-gray-400 font-medium block">{serviceLabel}</span>
                            </div>
                          </div>
                        </div>

                        {/* Mobile Actions */}
                        <div className="flex items-center gap-1 shrink-0 sm:hidden">
                          {canManageItem(item) && (
                            <>
                              <button
                                onClick={() => openManualEdit(item)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-all"
                              >
                                <Pencil size={15} />
                              </button>
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

                      {/* Middle: Person Name & Role Specific Details */}
                      <div className="flex flex-wrap items-center gap-2.5 sm:gap-4 sm:mx-4">
                        {/* Assigned Person / Leader / Preacher / Facilitator */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] font-extrabold uppercase text-gray-400 dark:text-gray-500">
                            {catLabel}:
                          </span>
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-extrabold shadow-xs ${catBadgeBg}`}>
                            {catIcon}
                            <span className="whitespace-nowrap">{item.worshipLeader}</span>
                            {item.isGuestSpeaker && (
                              <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[9px] font-black uppercase tracking-wide">Guest</span>
                            )}
                          </div>
                        </div>

                        {/* Worship Leader: Backup Singers */}
                        {category === "worship_leader" && (item.backupSingers || []).length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-extrabold uppercase text-gray-400 dark:text-gray-500">
                              Backups:
                            </span>
                            <div className="flex items-center gap-1 flex-wrap">
                              {item.backupSingers.map((bName, bi) => (
                                <span
                                  key={bi}
                                  className="px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold whitespace-nowrap border border-indigo-100 dark:border-indigo-800/30"
                                >
                                  {bName}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Preacher: Sermon Title */}
                        {category === "preacher" && item.sermonTitle && (
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] font-extrabold uppercase text-gray-400 dark:text-gray-500">
                              Sermon:
                            </span>
                            <span className="px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-[11px] font-bold border border-amber-200/60 dark:border-amber-800/30 italic">
                              "{item.sermonTitle}"
                            </span>
                          </div>
                        )}

                        {/* Youth Facilitator: Topic */}
                        {category === "youth_facilitator" && item.topicSharing && (
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] font-extrabold uppercase text-gray-400 dark:text-gray-500">
                              Topic:
                            </span>
                            <span className="px-2 py-0.5 rounded-lg bg-pink-50 dark:bg-pink-900/20 text-pink-800 dark:text-pink-300 text-[11px] font-bold border border-pink-200/60 dark:border-pink-800/30 italic">
                              "{item.topicSharing}"
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Desktop Actions */}
                      <div className="hidden sm:flex items-center gap-1 shrink-0">
                        {canManageItem(item) && (
                          <>
                            <button
                              onClick={() => openManualEdit(item)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-all"
                            >
                              <Pencil size={15} />
                            </button>
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
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-white/10 bg-gray-50/50 dark:bg-white/5">
              <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                {editingItem ? (
                  formCategory === "worship_leader"
                    ? "Edit Worship Leader Schedule"
                    : formCategory === "preacher"
                    ? formPreacherServiceType === "midweek"
                      ? "Edit Mid-week Preacher Schedule"
                      : "Edit Sunday Preacher Schedule"
                    : "Edit Youth Facilitator Schedule"
                ) : (
                  formCategory === "worship_leader"
                    ? "Add Worship Leader Schedule"
                    : formCategory === "preacher"
                    ? formPreacherServiceType === "midweek"
                      ? "Add Mid-week Preacher Schedule"
                      : "Add Sunday Preacher Schedule"
                    : "Add Youth Facilitator Schedule"
                )}
              </h4>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveManualForm} className="p-4 sm:p-5 space-y-4 w-full min-w-0 max-w-full box-border">

              {/* Scheduled Date Field with Inline Calendar */}
              <div className="w-full min-w-0">
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center justify-between">
                  <span>
                    {formCategory === "preacher" && formPreacherServiceType === "midweek"
                      ? "Scheduled Date (Wednesdays Only)"
                      : "Scheduled Date (Sundays Only)"}
                  </span>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-extrabold">
                    {formCategory === "preacher" && formPreacherServiceType === "midweek"
                      ? "✝️ Mid-week (Wed)"
                      : "🙌 Sunday Service"}
                  </span>
                </label>

                {/* Display / Trigger Button */}
                <button
                  type="button"
                  onClick={() => setShowCalendarPopover((prev) => !prev)}
                  className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-bold focus:ring-2 focus:ring-violet-500 shadow-xs cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-violet-600 dark:text-violet-400 shrink-0" />
                    <span>
                      {formDate
                        ? new Date(formDate + "T12:00:00").toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "Select Date..."}
                    </span>
                  </div>
                  <ChevronDown size={14} className={`text-gray-400 shrink-0 transition-transform ${showCalendarPopover ? "rotate-180" : ""}`} />
                </button>

                {/* Inline Collapsible Calendar Grid */}
                {showCalendarPopover && (
                  <div className="mt-2 w-full bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-white/10 p-3.5 animate-in fade-in slide-in-from-top-2 duration-150">
                    {/* Calendar Month Navigation Header */}
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100 dark:border-white/10">
                      <button
                        type="button"
                        onClick={() => {
                          const y = calendarMonth.getFullYear();
                          const m = calendarMonth.getMonth();
                          setCalendarMonth(new Date(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1, 1, 12, 0, 0));
                        }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="text-xs font-extrabold text-gray-900 dark:text-white uppercase tracking-wider">
                        {new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1, 12, 0, 0).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const y = calendarMonth.getFullYear();
                          const m = calendarMonth.getMonth();
                          setCalendarMonth(new Date(m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1, 1, 12, 0, 0));
                        }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>

                    {/* Weekday Labels Header */}
                    <div className="grid grid-cols-7 text-center text-[10px] font-extrabold text-gray-400 mb-1.5">
                      <span className={formCategory === "preacher" && formPreacherServiceType === "midweek" ? "" : "text-violet-600 dark:text-violet-400 font-black"}>S</span>
                      <span>M</span>
                      <span>T</span>
                      <span className={formCategory === "preacher" && formPreacherServiceType === "midweek" ? "text-amber-600 dark:text-amber-400 font-black" : ""}>W</span>
                      <span>T</span>
                      <span>F</span>
                      <span>S</span>
                    </div>

                    {/* Day Cells Grid */}
                    <div className="grid grid-cols-7 gap-1 place-items-center">
                      {(() => {
                        const year = calendarMonth.getFullYear();
                        const month = calendarMonth.getMonth();
                        const firstDow = new Date(year, month, 1, 12, 0, 0).getDay();
                        const daysCount = new Date(year, month + 1, 0, 12, 0, 0).getDate();
                        const now = new Date();
                        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

                        const isMidweek = formCategory === "preacher" && formPreacherServiceType === "midweek";
                        const targetDay = isMidweek ? 3 : 0;

                        const cells: React.ReactNode[] = [];

                        for (let i = 0; i < firstDow; i++) {
                          cells.push(<div key={`pad-${i}`} className="w-8 h-8" />);
                        }

                        for (let d = 1; d <= daysCount; d++) {
                          const dow = new Date(year, month, d, 12, 0, 0).getDay();
                          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                          const isPast = dateStr < todayStr;
                          const isAllowedDay = dow === targetDay;
                          const isDisabled = isPast || !isAllowedDay;
                          const isSelected = formDate === dateStr;
                          const isToday = dateStr === todayStr;

                          cells.push(
                            <button
                              key={`day-${d}`}
                              type="button"
                              disabled={isDisabled}
                              onClick={() => {
                                setFormDate(dateStr);
                                setShowCalendarPopover(false);
                              }}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold transition-all ${
                                isSelected
                                  ? isMidweek
                                    ? "bg-amber-600 text-white shadow-md shadow-amber-500/30 ring-2 ring-amber-400"
                                    : "bg-violet-600 text-white shadow-md shadow-violet-500/30 ring-2 ring-violet-400"
                                  : isDisabled
                                  ? "text-gray-300 dark:text-gray-700 cursor-default"
                                  : isToday
                                  ? isMidweek
                                    ? "bg-amber-200 dark:bg-amber-800/50 text-amber-900 dark:text-amber-100 ring-1 ring-amber-400 hover:bg-amber-500 hover:text-white cursor-pointer"
                                    : "bg-violet-200 dark:bg-violet-800/50 text-violet-900 dark:text-violet-100 ring-1 ring-violet-400 hover:bg-violet-600 hover:text-white cursor-pointer"
                                  : isMidweek
                                  ? "bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 hover:bg-amber-500 hover:text-white cursor-pointer"
                                  : "bg-violet-50 dark:bg-violet-900/20 text-violet-800 dark:text-violet-300 hover:bg-violet-600 hover:text-white cursor-pointer"
                              }`}
                            >
                              {d}
                            </button>
                          );
                        }

                        return cells;
                      })()}
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-gray-100 dark:border-white/10 flex items-center justify-between text-[10px] text-gray-400">
                      <span className="font-semibold">
                        {formCategory === "preacher" && formPreacherServiceType === "midweek"
                          ? "Only Wednesdays are selectable"
                          : "Only Sundays are selectable"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowCalendarPopover(false)}
                        className="text-violet-600 dark:text-violet-400 font-bold hover:underline"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Dynamic Member Selector & Specific Role Fields */}
              {(() => {
                const isWL = (m: Member) => (m.roles || []).some((r) => /worship leader/i.test(r));
                const isBS = (m: Member) => (m.roles || []).some((r) => /backup|singer|vocalist/i.test(r));

                const wlMembers = selectableMembers.filter(isWL);
                const wlOptions = wlMembers.length > 0 ? wlMembers : selectableMembers;

                const bsMembers = selectableMembers.filter(isBS);
                const bsOptionsBase = bsMembers.length > 0 ? bsMembers : selectableMembers;

                return (
                  <>
                    {/* Primary Person Field */}
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                        {formCategory === "worship_leader"
                          ? "Worship Leader"
                          : formCategory === "preacher"
                          ? `Preacher Name (${formPreacherServiceType === "sunday" ? "Sunday" : "Mid-week"})`
                          : "Youth Facilitator Name"}
                      </label>
                      <div className="relative">
                        <select
                          required={!formIsGuestSpeaker}
                          value={formLeader}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "__guest__") {
                              setFormIsGuestSpeaker(true);
                              setFormLeader("__guest__");
                            } else {
                              setFormIsGuestSpeaker(false);
                              setFormGuestSpeakerName("");
                              setFormLeader(val);
                            }
                          }}
                          className="w-full appearance-none pl-3.5 pr-9 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-violet-500 cursor-pointer"
                        >
                          <option value="">
                            {formCategory === "worship_leader"
                              ? "Select Worship Leader..."
                              : formCategory === "preacher"
                              ? "Select Preacher..."
                              : "Select Youth Facilitator..."}
                          </option>
                          {/* Guest Speaker option for Preacher & Youth Facilitator */}
                          {(formCategory === "preacher" || formCategory === "youth_facilitator") && (
                            <option value="__guest__">🎤 Guest Speaker</option>
                          )}
                          {formLeader &&
                            formLeader !== "__guest__" &&
                            !selectableMembers.some((m) => m.name.toLowerCase() === formLeader.toLowerCase()) && (
                              <option value={formLeader}>{formLeader}</option>
                            )}
                          {selectableMembers.map((m) => (
                            <option key={m.id} value={m.name}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>

                      {/* Guest Speaker Name Input */}
                      {formIsGuestSpeaker && (
                        <div className="mt-2">
                          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                            Guest Speaker Name
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Enter the guest speaker's full name"
                            value={formGuestSpeakerName}
                            onChange={(e) => setFormGuestSpeakerName(e.target.value)}
                            className="w-full px-3.5 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/30 text-gray-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-amber-500 placeholder:text-amber-400 dark:placeholder:text-amber-600"
                          />
                        </div>
                      )}
                    </div>

                    {/* Worship Leader Specific: Backup Singers */}
                    {formCategory === "worship_leader" && (
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
                    )}

                    {/* Preacher Specific: Sermon Title */}
                    {formCategory === "preacher" && (
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                          Sermon Title / Topic (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Living in Faith & Grace"
                          value={formSermonTitle}
                          onChange={(e) => setFormSermonTitle(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    )}

                    {/* Youth Facilitator Specific: Topic Sharing */}
                    {formCategory === "youth_facilitator" && (
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                          Sharing Topic / Theme (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Identity in Christ"
                          value={formTopicSharing}
                          onChange={(e) => setFormTopicSharing(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-pink-500"
                        />
                      </div>
                    )}
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
                  placeholder="Special instructions or reminders"
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
                  <span>Save Schedule</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── AI OCR Preview & Confirmation Modal ────────────────────────────────── */}
      {ocrPreviewItems && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-xs">
          <div className="w-full sm:max-w-lg max-h-[90vh] sm:max-h-[85vh] bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 flex flex-col overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-gray-100 dark:border-white/10 bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/40 dark:to-violet-950/30 shrink-0">
              <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200">
                <Sparkles size={18} className="text-indigo-600 dark:text-indigo-400" />
                <div>
                  <h4 className="text-sm font-bold">Review AI Schedule</h4>
                  <p className="text-[10px] text-indigo-600/70 dark:text-indigo-400/60 font-medium">{ocrPreviewItems.length} rotation{ocrPreviewItems.length > 1 ? "s" : ""} detected</p>
                </div>
              </div>
              <button
                onClick={() => setOcrPreviewItems(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/10 transition-all"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable Cards */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                Review the AI-extracted schedule below. Click <strong>Import & Save All</strong> to save these schedule entries.
              </p>

              {ocrPreviewItems.map((item, idx) => {
                const dateObj = item.date ? new Date(item.date + "T00:00:00") : null;
                const displayDate = dateObj
                  ? dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                  : item.date || "No date";
                const dayName = dateObj
                  ? dateObj.toLocaleDateString("en-US", { weekday: "long" })
                  : "";

                return (
                  <div
                    key={idx}
                    className="rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/[0.03] overflow-hidden"
                  >
                    {/* Date Header Bar */}
                    <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-violet-50 dark:bg-violet-950/30 border-b border-violet-100 dark:border-violet-800/30">
                      <span className="w-7 h-7 rounded-lg bg-violet-600 text-white flex items-center justify-center text-xs font-black shrink-0">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-bold text-gray-900 dark:text-white block truncate">
                          {displayDate}
                        </span>
                        <span className="text-[10px] text-violet-500 dark:text-violet-400 font-medium block">
                          {dayName ? `${dayName} Service` : "Sunday Service"}
                        </span>
                      </div>
                    </div>

                    {/* Leader & Backup Fields */}
                    <div className="px-3.5 py-3 space-y-2.5">
                      {/* Worship Leader */}
                      <div>
                        <span className="flex items-center gap-1 text-[10px] font-extrabold uppercase text-gray-400 dark:text-gray-500 mb-1">
                          <User size={10} className="text-violet-500" />
                          Worship Leader
                        </span>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200 text-xs font-extrabold">
                          <span>{item.worshipLeader || "None Specified"}</span>
                        </div>
                      </div>

                      {/* Backup Singers */}
                      <div>
                        <span className="flex items-center gap-1 text-[10px] font-extrabold uppercase text-gray-400 dark:text-gray-500 mb-1">
                          <Users size={10} className="text-indigo-500" />
                          Backup Singers
                        </span>
                        {(item.backupSingers || []).length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {item.backupSingers!.map((name, bi) => (
                              <span
                                key={bi}
                                className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-100 dark:border-indigo-800/30"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No backup singers detected</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-gray-100 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 shrink-0">
              <button
                onClick={() => setOcrPreviewItems(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveOcrPreview}
                disabled={isSavingOcr}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-bold hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 shadow-lg shadow-indigo-500/25 transition-all"
              >
                {isSavingOcr ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                <span>Import & Save All</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
