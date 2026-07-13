import React, { useState, useEffect, useMemo } from "react";
import { db } from "./firebase";
import { collection, getDocs, addDoc, query, orderBy, Timestamp, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { ChevronLeft, ChevronRight, ChevronDown, Plus, CalendarOff, Trash2, X, Loader2, CheckCircle2, AlertCircle, List, Calendar as CalendarIcon, RefreshCw } from "lucide-react";
import { Member } from "./types";
import DatePicker from "./DatePicker";

export interface LeaveRequest {
  id: string;
  memberId: string;
  memberName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  reason: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
}

export interface LeaveCalendarViewProps {
  allMembers: Member[];
  isAdmin: boolean;
  isLeader: boolean;
  user: any; // Firebase user
  myMemberProfile: Member | null;
  showToast: (type: string, msg: string) => void;
  showConfirm: (config: any) => void;
  closeConfirm: () => void;
}

export default function LeaveCalendarView({
  allMembers,
  isAdmin,
  isLeader,
  user,
  myMemberProfile,
  showToast,
  showConfirm,
  closeConfirm,
}: LeaveCalendarViewProps) {
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filter & View state
  const [selectedMemberFilter, setSelectedMemberFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");

  // Form state
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formReason, setFormReason] = useState("");
  const [formMemberId, setFormMemberId] = useState(""); // For admins to submit on behalf of others

  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);

  // Check if current user is an admin or leader who can approve
  const canApprove = isAdmin || isLeader;

  // ── Fetch Leaves ─────────────────────────────────────────────────────────────
  const fetchLeaves = async () => {
    setIsLoading(true);
    try {
      const q = query(collection(db, "leaves"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest));
      setLeaves(data);
    } catch (err) {
      console.error("Failed to fetch leaves:", err);
      showToast("error", "Failed to load leave requests");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleOpenForm = (date?: string) => {
    setFormStartDate(date || "");
    setFormEndDate(date || "");
    setFormReason("");
    setFormMemberId(myMemberProfile?.id || "");
    setShowRequestForm(true);
  };

  const handleSubmitLeave = async () => {
    if (!formStartDate || !formEndDate) {
      showToast("error", "Start and End dates are required.");
      return;
    }
    if (formEndDate < formStartDate) {
      showToast("error", "End date cannot be before start date.");
      return;
    }
    
    const memberIdToUse = formMemberId || myMemberProfile?.id;
    if (!memberIdToUse) {
      showToast("error", "No member selected.");
      return;
    }

    const memberName = allMembers.find(m => m.id === memberIdToUse)?.name || "Unknown Member";

    // Prevent overlapping leave requests
    const hasOverlap = leaves.some(l => {
      if (l.memberId !== memberIdToUse) return false;
      if (l.status === "rejected") return false; // Only block pending or approved
      return l.startDate <= formEndDate && l.endDate >= formStartDate;
    });

    if (hasOverlap) {
      showToast("error", "These dates overlap with an existing leave request.");
      return;
    }

    setIsSubmitting(true);
    try {
      const newLeave = {
        memberId: memberIdToUse,
        memberName,
        startDate: formStartDate,
        endDate: formEndDate,
        reason: formReason.trim(),
        status: canApprove ? "approved" : "pending",
        createdAt: Date.now(),
      };

      const addedDoc = await addDoc(collection(db, "leaves"), newLeave);

      // Add a notification for admins/leaders
      await addDoc(collection(db, "notifications"), {
        type: "leave_requested",
        message: `${memberName} requested a leave`,
        subMessage: `${formStartDate} to ${formEndDate}`,
        actorName: user?.displayName || "System",
        actorPhoto: user?.photoURL || "",
        actorUserId: user?.uid || "",
        targetAudience: "admin_only",
        createdAt: new Date().toISOString(),
        isRead: false
      });

      showToast("success", "Leave request submitted successfully.");
      setShowRequestForm(false);
      setLeaves(prev => [{ id: addedDoc.id, ...newLeave } as LeaveRequest, ...prev]);
    } catch (err) {
      console.error(err);
      showToast("error", "Failed to submit leave request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: "approved" | "rejected") => {
    try {
      await updateDoc(doc(db, "leaves", id), { status: newStatus });
      
      const targetLeave = leaves.find(l => l.id === id);
      if (targetLeave) {
        const targetMember = allMembers.find(m => m.id === targetLeave.memberId);
        if (targetMember && targetMember.userId) {
          await addDoc(collection(db, "notifications"), {
            type: "leave_status_updated",
            message: `Your leave request was ${newStatus}`,
            subMessage: `${targetLeave.startDate} to ${targetLeave.endDate}`,
            actorName: user?.displayName || "Admin",
            actorPhoto: user?.photoURL || "",
            actorUserId: user?.uid || "",
            targetUserId: targetMember.userId,
            createdAt: new Date().toISOString(),
            isRead: false
          });
        }
      }

      setLeaves(prev => prev.map(l => l.id === id ? { ...l, status: newStatus } : l));
      showToast("success", `Leave ${newStatus}.`);
    } catch (err) {
      showToast("error", "Failed to update status.");
    }
  };

  const handleDeleteLeave = (id: string) => {
    showConfirm({
      title: "Delete Leave Request",
      message: "Are you sure you want to delete this leave request?",
      confirmText: "Delete",
      confirmClass: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        closeConfirm();
        try {
          await deleteDoc(doc(db, "leaves", id));
          setLeaves(prev => prev.filter(l => l.id !== id));
          showToast("success", "Leave deleted successfully.");
          setSelectedLeave(null);
        } catch (err) {
          showToast("error", "Failed to delete request.");
        }
      }
    });
  };

  // ── Calendar Rendering ──────────────────────────────────────────────────────
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toLocaleDateString('en-CA');

  // Group leaves by date for rendering in cells
  const leavesByDate = useMemo(() => {
    const map: Record<string, LeaveRequest[]> = {};
    const filteredLeaves = selectedMemberFilter === "all" 
      ? leaves 
      : leaves.filter(l => l.memberId === selectedMemberFilter);

    filteredLeaves.forEach(leave => {
      // Create a date range to span across multiple days
      const start = new Date(leave.startDate + "T00:00:00");
      const end = new Date(leave.endDate + "T00:00:00");
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toLocaleDateString('en-CA');
        if (!map[dateStr]) map[dateStr] = [];
        map[dateStr].push(leave);
      }
    });
    return map;
  }, [leaves, selectedMemberFilter]);

  const listViewLeaves = useMemo(() => {
    let list = leaves;
    if (selectedMemberFilter !== "all") {
      list = list.filter(l => l.memberId === selectedMemberFilter);
    }
    if (statusFilter !== "all") {
      list = list.filter(l => l.status === statusFilter);
    }
    return list;
  }, [leaves, selectedMemberFilter, statusFilter]);

  const getDurationDays = (start: string, end: string) => {
    const s = new Date(start + "T00:00:00");
    const e = new Date(end + "T00:00:00");
    return Math.max(1, Math.ceil((e.getTime() - s.getTime()) / (1000 * 3600 * 24)) + 1);
  };

  return (
    <div className="max-w-7xl mx-auto h-full flex flex-col pb-20 sm:pb-8">
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        
        {/* LEFT — Month title + nav arrows */}
        <div className="flex items-center gap-2">
          <h2 className="font-black text-gray-900 dark:text-white text-xl sm:text-2xl tracking-tight uppercase">
            {calendarMonth.toLocaleDateString("en", { month: "long", year: "numeric" })}
          </h2>
          <div className="flex items-center gap-0.5 ml-2">
            <button
              onClick={() => setCalendarMonth(new Date(year, month - 1, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-teal-50 dark:hover:bg-white/10 transition-all text-gray-400 hover:text-teal-700 dark:hover:text-teal-400"
            ><ChevronLeft size={18} /></button>
            <button
              onClick={() => setCalendarMonth(new Date(year, month + 1, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-teal-50 dark:hover:bg-white/10 transition-all text-gray-400 hover:text-teal-700 dark:hover:text-teal-400"
            ><ChevronRight size={18} /></button>
          </div>
          <button 
            onClick={() => setCalendarMonth(new Date())}
            className="text-xs font-bold text-teal-600 dark:text-teal-400 ml-2 px-2 py-1 rounded-md hover:bg-teal-50 dark:hover:bg-teal-900/30 transition-colors"
          >
            TODAY
          </button>
        </div>

        {/* RIGHT — Filter & Add Button */}
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
          
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-1 shrink-0">
            <button
              onClick={() => setViewMode("calendar")}
              className={`p-1.5 rounded-lg flex items-center justify-center transition-all ${viewMode === "calendar" ? "bg-white dark:bg-gray-700 shadow-sm text-teal-600 dark:text-teal-400" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
              title="Calendar View"
            >
              <CalendarIcon size={16} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-lg flex items-center justify-center transition-all ${viewMode === "list" ? "bg-white dark:bg-gray-700 shadow-sm text-teal-600 dark:text-teal-400" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
              title="List View"
            >
              <List size={16} />
            </button>
          </div>

          <div className="relative flex-1 sm:w-48">
            <select
              value={selectedMemberFilter}
              onChange={(e) => setSelectedMemberFilter(e.target.value)}
              className="w-full appearance-none bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm rounded-xl pl-3 pr-10 py-2 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">All Members</option>
              {allMembers.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          <button
            onClick={() => handleOpenForm()}
            className="flex items-center justify-center gap-1.5 h-9 px-4 bg-gradient-to-r from-teal-500 to-emerald-600 text-white rounded-xl hover:from-teal-400 hover:to-emerald-500 active:scale-[0.97] text-xs font-bold transition-all shadow-lg shadow-teal-500/30 shrink-0"
          >
            <Plus size={14} />
            <span className="whitespace-nowrap">Request Leave</span>
          </button>
        </div>
      </div>

      {/* ── Calendar Grid ───────────────────────────────────────────────────── */}
      {viewMode === "calendar" && (
      <div className="flex-1 bg-white dark:bg-gray-900/90 rounded-2xl border border-gray-200 dark:border-white/8 overflow-hidden shadow-xl dark:shadow-black/40 flex flex-col">
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 bg-teal-50/50 dark:bg-teal-900/10 border-b border-gray-100 dark:border-white/8 shrink-0">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
            <div key={d} className="py-3 text-center text-[10px] font-bold text-teal-600/70 dark:text-teal-500/70 uppercase tracking-widest">{d}</div>
          ))}
        </div>
        
        {/* Grid Cells */}
        <div className="grid grid-cols-7 flex-1 auto-rows-fr">
          {Array.from({ length: firstDow }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[100px] border-b border-r border-gray-100 dark:border-white/5 bg-gray-50/30 dark:bg-black/15" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isToday = dateStr === todayStr;
            const isCellPast = dateStr < todayStr;
            const dayLeaves = leavesByDate[dateStr] || [];

            return (
              <div
                key={dateStr}
                onClick={() => {
                  if (!isCellPast) handleOpenForm(dateStr);
                }}
                className={`group relative min-h-[100px] border-b border-r border-gray-100 dark:border-white/5 p-1.5 text-left transition-colors flex flex-col ${
                  isCellPast ? "bg-gray-50/30 dark:bg-black/10 cursor-not-allowed" : "hover:bg-teal-50/40 dark:hover:bg-teal-900/10 cursor-pointer"
                }`}
              >
                <div className="flex items-center justify-between mb-1 shrink-0">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-all ${
                    isToday
                      ? "bg-teal-600 text-white shadow-sm"
                      : isCellPast
                        ? "text-gray-300 dark:text-gray-600"
                        : "text-gray-700 dark:text-gray-300 group-hover:text-teal-700 dark:group-hover:text-teal-300"
                  }`}>{day}</span>
                  {!isCellPast && (
                    <span className="hidden sm:flex w-5 h-5 items-center justify-center rounded-full bg-teal-600 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      +
                    </span>
                  )}
                </div>

                {/* Leaves for this day */}
                <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar w-full">
                  {dayLeaves.map(leave => (
                    <div 
                      key={leave.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedLeave(leave);
                      }}
                      className={`w-full text-left truncate text-[10px] sm:text-xs font-semibold px-1.5 py-0.5 rounded border cursor-pointer ${
                        leave.status === "approved" 
                          ? "bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-200 border-teal-200 dark:border-teal-800"
                          : leave.status === "rejected"
                            ? "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800 line-through opacity-50"
                            : "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800 border-dashed"
                      }`}
                      title={`${leave.memberName} - ${leave.reason || 'No reason'}`}
                    >
                      {leave.status === "pending" && <span className="mr-1 text-[9px]">⏳</span>}
                      {leave.memberName}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* ── List View ──────────────────────────────────────────────────────── */}
      {viewMode === "list" && (
        <div className="flex-1 flex flex-col bg-white dark:bg-gray-900/90 rounded-2xl border border-gray-200 dark:border-white/8 overflow-hidden shadow-xl dark:shadow-black/40">
          <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-900/30">
            <h3 className="font-bold text-gray-700 dark:text-gray-300">All Leave Requests</h3>
            <div className="flex items-center gap-4">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm px-3 py-1.5 pr-8 focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium text-gray-700 dark:text-gray-200 cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
              <button
                onClick={(e) => { e.stopPropagation(); fetchLeaves(); }}
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title="Refresh leaves"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {listViewLeaves.length === 0 ? (
              <div className="text-center text-gray-500 py-10 font-medium">No leave requests found.</div>
            ) : (
              listViewLeaves.map((leave) => (
                <div key={leave.id} onClick={() => setSelectedLeave(leave)} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800/50 hover:border-teal-300 dark:hover:border-teal-700 cursor-pointer transition-colors">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider ${
                        leave.status === "approved" ? "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200"
                        : leave.status === "rejected" ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                      }`}>
                        {leave.status}
                      </span>
                      <span className="font-bold text-gray-900 dark:text-white">{leave.memberName}</span>
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      <span className="font-semibold text-gray-700 dark:text-gray-300">{leave.startDate}</span> to <span className="font-semibold text-gray-700 dark:text-gray-300">{leave.endDate}</span>
                      <span className="ml-2 text-xs opacity-70">({getDurationDays(leave.startDate, leave.endDate)} days)</span>
                    </div>
                    {leave.reason && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 italic mt-1 line-clamp-1">"{leave.reason}"</p>
                    )}
                  </div>
                  
                  {/* Quick Actions (Admin) */}
                  {canApprove && leave.status === "pending" && (
                    <div className="flex gap-2 shrink-0">
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleUpdateStatus(leave.id, "approved"); }}
                        className="px-4 py-1.5 text-sm font-bold bg-teal-500 hover:bg-teal-600 text-white rounded-lg transition-colors"
                      >Approve</button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleUpdateStatus(leave.id, "rejected"); }}
                        className="px-4 py-1.5 text-sm font-bold bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                      >Reject</button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Request Form Modal ──────────────────────────────────────────────── */}
      {showRequestForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-gray-200 dark:border-gray-800">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50">
              <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400">
                <CalendarOff size={18} />
                <h3 className="font-bold">Request Leave</h3>
              </div>
              <button 
                onClick={() => setShowRequestForm(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-400 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              
              {isAdmin && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                    Member (Admin override)
                  </label>
                  <select
                    value={formMemberId}
                    onChange={(e) => setFormMemberId(e.target.value)}
                    className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                  >
                    <option value="" disabled>Select member...</option>
                    {allMembers.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                    Start Date
                  </label>
                  <DatePicker 
                    value={formStartDate} 
                    onChange={setFormStartDate}
                    className="w-full"
                    min={todayStr}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                    End Date
                  </label>
                  <DatePicker 
                    value={formEndDate} 
                    onChange={setFormEndDate}
                    className="w-full"
                    min={formStartDate || todayStr}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  Reason (Optional)
                </label>
                <textarea
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="e.g. Vacation, Sick, Personal..."
                  className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-teal-500 outline-none min-h-[80px] resize-y"
                />
              </div>

              {/* Notice */}
              <div className="flex gap-3 items-start bg-teal-50 dark:bg-teal-900/20 text-teal-800 dark:text-teal-300 p-3 rounded-xl text-xs">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <p>
                  Leave requests are sent to the admins/leaders for approval. Once approved, you cannot be assigned to schedules on these dates.
                </p>
              </div>

            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex justify-end gap-2">
              <button
                onClick={() => setShowRequestForm(false)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-xl transition-colors"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitLeave}
                disabled={isSubmitting || !formStartDate || !formEndDate || !formMemberId}
                className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-md shadow-teal-500/20"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Details Modal */}
      {selectedLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedLeave(null)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-gray-900 dark:text-white">Leave Details</h3>
              <button 
                onClick={() => setSelectedLeave(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-400 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-1">Member</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{selectedLeave.memberName}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-1">From</p>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedLeave.startDate}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-1">To</p>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedLeave.endDate}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-1">Status</p>
                <span className={`inline-block px-2 py-0.5 text-xs font-bold rounded ${
                  selectedLeave.status === "approved" ? "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200"
                  : selectedLeave.status === "rejected" ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                }`}>
                  {selectedLeave.status.toUpperCase()}
                </span>
              </div>
              {selectedLeave.reason && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-1">Reason</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 p-3 rounded-xl">{selectedLeave.reason}</p>
                </div>
              )}
            </div>

            {/* Actions for Admin / Owner */}
            <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex flex-col gap-2">
              {canApprove && selectedLeave.status === "pending" && (
                <div className="flex gap-2 w-full">
                  <button 
                    onClick={() => { handleUpdateStatus(selectedLeave.id, "approved"); setSelectedLeave(null); }}
                    className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 rounded-xl transition-colors"
                  >Approve</button>
                  <button 
                    onClick={() => { handleUpdateStatus(selectedLeave.id, "rejected"); setSelectedLeave(null); }}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl transition-colors"
                  >Reject</button>
                </div>
              )}
              {(isAdmin || myMemberProfile?.id === selectedLeave.memberId) && (
                <button 
                  onClick={() => { handleDeleteLeave(selectedLeave.id); setSelectedLeave(null); }}
                  className="w-full bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-bold py-2.5 rounded-xl transition-colors"
                >Delete Request</button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
