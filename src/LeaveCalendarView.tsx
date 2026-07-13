import React, { useState, useEffect, useMemo } from "react";
import { db } from "./firebase";
import { collection, getDocs, addDoc, query, orderBy, Timestamp, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { ChevronLeft, ChevronRight, ChevronDown, Plus, CalendarOff, Trash2, X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
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
  
  // Filter state
  const [selectedMemberFilter, setSelectedMemberFilter] = useState<string>("all");

  // Form state
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formReason, setFormReason] = useState("");
  const [formMemberId, setFormMemberId] = useState(""); // For admins to submit on behalf of others

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

      await addDoc(collection(db, "leaves"), newLeave);

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
      fetchLeaves();
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
      showToast("success", `Leave ${newStatus}.`);
      fetchLeaves();
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
          showToast("success", "Leave request deleted.");
          fetchLeaves();
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
        <div className="flex items-center gap-3 w-full sm:w-auto">
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
                      onClick={(e) => e.stopPropagation()} // Prevent opening add form when clicking a leave
                      className={`w-full text-left truncate text-[10px] sm:text-xs font-semibold px-1.5 py-0.5 rounded border ${
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
                      
                      {canApprove && (
                        <div className="mt-1 flex gap-1 pt-1 border-t border-black/5 dark:border-white/10 overflow-hidden opacity-0 hover:opacity-100 group-hover:opacity-100 transition-opacity">
                          {leave.status === "pending" && (
                            <>
                              <button 
                                onClick={() => handleUpdateStatus(leave.id, "approved")}
                                className="flex-1 bg-teal-500 text-white text-[9px] py-0.5 rounded text-center"
                              >Approve</button>
                              <button 
                                onClick={() => handleUpdateStatus(leave.id, "rejected")}
                                className="flex-1 bg-red-500 text-white text-[9px] py-0.5 rounded text-center"
                              >Reject</button>
                            </>
                          )}
                          {(isAdmin || myMemberProfile?.id === leave.memberId) && (
                            <button 
                              onClick={() => handleDeleteLeave(leave.id)}
                              className="flex-1 bg-gray-500 text-white text-[9px] py-0.5 rounded text-center"
                            >Del</button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
                    min={formStartDate}
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

    </div>
  );
}
