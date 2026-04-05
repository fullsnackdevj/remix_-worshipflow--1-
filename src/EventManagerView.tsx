import { useState, useEffect, useCallback } from "react";
import {
  LayoutGrid, Plus, X, ChevronRight, Check, Trash2,
  Pencil, Calendar, Users, AlertCircle, Clock, CheckCircle2,
  ListTodo, Flag, User, Search
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Priority = "high" | "medium" | "low";
type Status = "planning" | "preparation" | "ready" | "done";

interface Task {
  id: string;
  text: string;
  done: boolean;
  priority: Priority;
  assignee?: string;
}

interface AssignedMember {
  memberId: string;
  name: string;
  photo?: string;
  role?: string;
}

interface ManagedEvent {
  id: string;
  title: string;
  eventType: string;
  date: string;
  status: Status;
  notes: string;
  assignedMembers: AssignedMember[];
  tasks: Task[];
  createdAt?: string;
}

interface Props {
  allMembers?: any[];
  onToast: (type: "success" | "error", msg: string) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string; dot: string }> = {
  planning:    { label: "Planning",    color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-900/20", dot: "bg-violet-500" },
  preparation: { label: "Preparation", color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-50 dark:bg-amber-900/20",   dot: "bg-amber-500" },
  ready:       { label: "Ready",       color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20", dot: "bg-emerald-500" },
  done:        { label: "Done",        color: "text-gray-400 dark:text-gray-500",     bg: "bg-gray-50 dark:bg-gray-700/30",     dot: "bg-gray-400" },
};

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string }> = {
  high:   { label: "High",   color: "text-red-600 dark:text-red-400",    bg: "bg-red-50 dark:bg-red-900/20" },
  medium: { label: "Medium", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20" },
  low:    { label: "Low",    color: "text-sky-600 dark:text-sky-400",    bg: "bg-sky-50 dark:bg-sky-900/20" },
};

const STATUSES: Status[] = ["planning", "preparation", "ready", "done"];
const API = import.meta.env.DEV ? "http://localhost:8888/api" : "/api";
const uid = () => Math.random().toString(36).slice(2, 10);

// ── Main Component ─────────────────────────────────────────────────────────────
export default function EventManagerView({ allMembers = [], onToast }: Props) {
  const [events, setEvents] = useState<ManagedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<ManagedEvent | null>(null);
  const [panelMode, setPanelMode] = useState<"view" | "edit" | "create">("view");
  const [saving, setSaving] = useState(false);
  const [deleteEventConfirm, setDeleteEventConfirm] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form state
  const [fTitle, setFTitle] = useState("");
  const [fType, setFType] = useState("");
  const [fDate, setFDate] = useState("");
  const [fStatus, setFStatus] = useState<Status>("planning");
  const [fNotes, setFNotes] = useState("");
  const [fTasks, setFTasks] = useState<Task[]>([]);
  const [fMembers, setFMembers] = useState<AssignedMember[]>([]);

  // Task input
  const [newTaskText, setNewTaskText] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>("medium");

  // Member picker
  const [memberSearch, setMemberSearch] = useState("");
  const [freeTextMember, setFreeTextMember] = useState("");

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`${API}/event-manager`);
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } catch { onToast("error", "Failed to load events"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const openCreate = () => {
    setFTitle(""); setFType(""); setFDate(""); setFStatus("planning");
    setFNotes(""); setFTasks([]); setFMembers([]);
    setNewTaskText(""); setNewTaskPriority("medium"); setMemberSearch(""); setFreeTextMember("");
    setSelectedEvent(null); setPanelMode("create");
  };

  const openEdit = (ev: ManagedEvent) => {
    setFTitle(ev.title); setFType(ev.eventType); setFDate(ev.date);
    setFStatus(ev.status); setFNotes(ev.notes); setFTasks([...ev.tasks]); setFMembers([...ev.assignedMembers]);
    setNewTaskText(""); setNewTaskPriority("medium"); setMemberSearch(""); setFreeTextMember("");
    setSelectedEvent(ev); setPanelMode("edit");
  };

  const closePanel = () => { setSelectedEvent(null); setPanelMode("view"); };

  const addTask = () => {
    if (!newTaskText.trim()) return;
    setFTasks(prev => [...prev, { id: uid(), text: newTaskText.trim(), done: false, priority: newTaskPriority }]);
    setNewTaskText(""); setNewTaskPriority("medium");
  };

  const toggleTask = (id: string) => setFTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const removeTask = (id: string) => setFTasks(prev => prev.filter(t => t.id !== id));

  const addMemberFromList = (m: any) => {
    if (fMembers.find(x => x.memberId === m.id)) return;
    setFMembers(prev => [...prev, { memberId: m.id, name: m.name, photo: m.photo || "", role: m.role || "" }]);
    setMemberSearch("");
  };

  const addFreeTextMember = () => {
    if (!freeTextMember.trim()) return;
    setFMembers(prev => [...prev, { memberId: uid(), name: freeTextMember.trim(), photo: "" }]);
    setFreeTextMember("");
  };

  const removeMember = (memberId: string) => setFMembers(prev => prev.filter(m => m.memberId !== memberId));

  // ── Save ─────────────────────────────────────────────────────────────────────
  const saveEvent = async () => {
    if (!fTitle.trim() || !fDate) { onToast("error", "Title and Date are required"); return; }
    setSaving(true);
    const payload = { title: fTitle, eventType: fType, date: fDate, status: fStatus, notes: fNotes, assignedMembers: fMembers, tasks: fTasks };
    try {
      if (panelMode === "create") {
        const res = await fetch(`${API}/event-manager`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error();
        onToast("success", "Event created!");
      } else {
        const res = await fetch(`${API}/event-manager/${selectedEvent!.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error();
        onToast("success", "Event updated!");
      }
      await fetchEvents(); closePanel();
    } catch { onToast("error", "Failed to save event"); }
    finally { setSaving(false); }
  };

  // Quick toggle task without full save (optimistic)
  const quickToggleTask = async (ev: ManagedEvent, taskId: string) => {
    const updated = ev.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t);
    const optimistic = events.map(e => e.id === ev.id ? { ...e, tasks: updated } : e);
    setEvents(optimistic);
    if (selectedEvent?.id === ev.id) setSelectedEvent(s => s ? { ...s, tasks: updated } : s);
    try {
      await fetch(`${API}/event-manager/${ev.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...ev, tasks: updated }),
      });
    } catch { fetchEvents(); }
  };

  const deleteEvent = async (id: string) => {
    if (isDeleting) return;
    setIsDeleting(true);
    setDeleteEventConfirm(null);
    try {
      await fetch(`${API}/event-manager/${id}`, { method: "DELETE" });
      onToast("success", "Event deleted");
      setEvents(prev => prev.filter(e => e.id !== id));
      if (selectedEvent?.id === id) closePanel();
    } catch { onToast("error", "Failed to delete"); }
    finally { setIsDeleting(false); }
  };

  // ── Sub-components ────────────────────────────────────────────────────────────
  const MemberAvatar = ({ m, size = 7 }: { m: AssignedMember; size?: number }) => (
    m.photo
      ? <img src={m.photo} className={`w-${size} h-${size} rounded-full object-cover ring-2 ring-white dark:ring-gray-800`} alt={m.name} title={m.name} />
      : <div className={`w-${size} h-${size} rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-[10px] font-bold ring-2 ring-white dark:ring-gray-800`} title={m.name}>{m.name[0]?.toUpperCase()}</div>
  );

  const EventCard = ({ ev }: { ev: ManagedEvent }) => {
    const done = ev.tasks.filter(t => t.done).length;
    const total = ev.tasks.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const s = STATUS_CONFIG[ev.status];
    const d = new Date(ev.date + "T00:00:00");
    return (
      <div
        onClick={() => { setSelectedEvent(ev); setFTasks([...ev.tasks]); setFMembers([...ev.assignedMembers]); setPanelMode("view"); }}
        className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-700 transition-all group"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 dark:text-white text-sm leading-snug truncate">{ev.title}</p>
            {ev.eventType && <p className="text-xs text-indigo-500 mt-0.5 truncate">{ev.eventType}</p>}
          </div>
          <ChevronRight size={14} className="text-gray-300 dark:text-gray-600 shrink-0 mt-0.5 group-hover:text-indigo-400 transition-colors" />
        </div>

        {/* Date */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 mb-3">
          <Calendar size={11} />
          {d.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
        </div>

        {/* Progress */}
        {total > 0 && (
          <div className="mb-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] text-gray-400">{done}/{total} tasks</span>
              <span className="text-[10px] font-medium text-indigo-500">{pct}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-indigo-400 to-violet-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex -space-x-1.5">
            {ev.assignedMembers.slice(0, 4).map(m => <span key={m.memberId}><MemberAvatar m={m} size={6} /></span>)}
            {ev.assignedMembers.length > 4 && (
              <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-[9px] font-bold text-gray-500 ring-2 ring-white dark:ring-gray-800">
                +{ev.assignedMembers.length - 4}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Member search filtered list
  const filteredMembers = memberSearch.trim()
    ? allMembers.filter(m => m.name?.toLowerCase().includes(memberSearch.toLowerCase()) && !fMembers.find(f => f.memberId === m.id))
    : [];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[60vh]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg">
            <LayoutGrid size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Event Manager</h1>
            <p className="text-xs text-gray-400 dark:text-gray-500">Admin-only · Plan and track church events</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white rounded-xl font-semibold text-sm shadow transition-all"
        >
          <Plus size={16} /> New Event
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUSES.map(status => {
            const col = STATUS_CONFIG[status];
            const colEvents = events.filter(e => e.status === status);
            return (
              <div key={status} className="flex-shrink-0 w-72">
                {/* Column Header */}
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl mb-3 ${col.bg}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${col.dot}`} />
                  <span className={`text-xs font-bold uppercase tracking-wider ${col.color}`}>{col.label}</span>
                  <span className={`ml-auto text-xs font-bold ${col.color} px-1.5 py-0.5 rounded-md bg-white/50 dark:bg-gray-900/30`}>{colEvents.length}</span>
                </div>

                {/* Cards */}
                <div className="space-y-3">
                  {colEvents.map(ev => <div key={ev.id}><EventCard ev={ev} /></div>)}
                  {colEvents.length === 0 && (
                    <div className="py-8 text-center border-2 border-dashed border-gray-100 dark:border-gray-700 rounded-2xl">
                      <p className="text-xs text-gray-300 dark:text-gray-600">No events</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Side Panel ── */}
      {(selectedEvent || panelMode === "create") && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={closePanel} />
          
          {/* Panel */}
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl z-50 flex flex-col overflow-hidden">
            {/* Panel Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
              <h2 className="font-bold text-gray-900 dark:text-white text-base">
                {panelMode === "create" ? "New Event" : panelMode === "edit" ? "Edit Event" : selectedEvent?.title}
              </h2>
              <div className="flex items-center gap-1">
                {panelMode === "view" && selectedEvent && (
                  <>
                    <button onClick={() => openEdit(selectedEvent)} className="p-1.5 text-gray-400 hover:text-indigo-500 rounded-lg transition-colors"><Pencil size={15} /></button>
                    <button onClick={() => setDeleteEventConfirm(selectedEvent.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition-colors"><Trash2 size={15} /></button>
                  </>
                )}
                <button onClick={closePanel} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"><X size={18} /></button>
              </div>
            </div>

            {/* Panel Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {panelMode === "view" && selectedEvent ? (
                <>
                  {/* Status badge */}
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${STATUS_CONFIG[selectedEvent.status].bg} ${STATUS_CONFIG[selectedEvent.status].color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[selectedEvent.status].dot}`} />
                    {STATUS_CONFIG[selectedEvent.status].label}
                  </div>

                  {/* Date + Type */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <Calendar size={14} className="text-indigo-400 shrink-0" />
                      {new Date(selectedEvent.date + "T00:00:00").toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                    </div>
                    {selectedEvent.eventType && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <ListTodo size={14} className="text-violet-400 shrink-0" />
                        {selectedEvent.eventType}
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  {selectedEvent.notes && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Notes</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{selectedEvent.notes}</p>
                    </div>
                  )}

                  {/* Tasks */}
                  {selectedEvent.tasks.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tasks</p>
                        <span className="text-xs text-indigo-500 font-medium">
                          {selectedEvent.tasks.filter(t => t.done).length}/{selectedEvent.tasks.length} done
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-3">
                        <div className="h-full bg-gradient-to-r from-indigo-400 to-violet-500 rounded-full" style={{ width: `${selectedEvent.tasks.length ? Math.round(selectedEvent.tasks.filter(t => t.done).length / selectedEvent.tasks.length * 100) : 0}%` }} />
                      </div>
                      <div className="space-y-2">
                        {selectedEvent.tasks.map(t => (
                          <div key={t.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${t.done ? "bg-gray-50 dark:bg-gray-800/40 border-gray-100 dark:border-gray-700/50 opacity-60" : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700"}`}>
                            <button onClick={() => quickToggleTask(selectedEvent, t.id)} className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${t.done ? "bg-indigo-500 border-indigo-500" : "border-gray-300 dark:border-gray-600 hover:border-indigo-400"}`}>
                              {t.done && <Check size={11} className="text-white" />}
                            </button>
                            <span className={`text-sm flex-1 ${t.done ? "line-through text-gray-400" : "text-gray-700 dark:text-gray-200"}`}>{t.text}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 ${PRIORITY_CONFIG[t.priority].bg} ${PRIORITY_CONFIG[t.priority].color}`}>
                              {t.priority.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Team */}
                  {selectedEvent.assignedMembers.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Team</p>
                      <div className="flex flex-col gap-2">
                        {selectedEvent.assignedMembers.map(m => (
                          <div key={m.memberId} className="flex items-center gap-2.5">
                            <MemberAvatar m={m} size={8} />
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{m.name}</p>
                              {m.role && <p className="text-xs text-gray-400">{m.role}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* ── Create / Edit Form ── */
                <div className="space-y-4">
                  {/* Title */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Event Title *</label>
                    <input
                      value={fTitle} onChange={e => setFTitle(e.target.value)}
                      placeholder="e.g. Sunday Service — March 16"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>

                  {/* Event Type */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Event Type</label>
                    <input
                      value={fType} onChange={e => setFType(e.target.value)}
                      placeholder="e.g. Youth Night, Worship Night…"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>

                  {/* Date + Status */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Date *</label>
                      <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Status</label>
                      <select value={fStatus} onChange={e => setFStatus(e.target.value as Status)}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        {STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Notes</label>
                    <textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={3} placeholder="Add notes or description…"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                    />
                  </div>

                  {/* Tasks */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Checklist / Tasks</label>
                    <div className="space-y-2 mb-2">
                      {fTasks.map(t => (
                        <div key={t.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                          <button onClick={() => toggleTask(t.id)} className={`w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center shrink-0 ${t.done ? "bg-indigo-500 border-indigo-500" : "border-gray-300 dark:border-gray-600"}`}>
                            {t.done && <Check size={9} className="text-white" />}
                          </button>
                          <span className={`text-xs flex-1 ${t.done ? "line-through text-gray-400" : "text-gray-700 dark:text-gray-200"}`}>{t.text}</span>
                          <span className={`text-[9px] font-bold px-1 py-0.5 rounded shrink-0 ${PRIORITY_CONFIG[t.priority].bg} ${PRIORITY_CONFIG[t.priority].color}`}>{t.priority[0].toUpperCase()}</span>
                          <button onClick={() => removeTask(t.id)} className="text-gray-300 hover:text-red-400 transition-colors shrink-0"><X size={13} /></button>
                        </div>
                      ))}
                    </div>
                    {/* Add task row */}
                    <div className="flex gap-2">
                      <input value={newTaskText} onChange={e => setNewTaskText(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && addTask()}
                        placeholder="New task…"
                        className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                      <select value={newTaskPriority} onChange={e => setNewTaskPriority(e.target.value as Priority)}
                        className="px-2 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        <option value="high">🔴 High</option>
                        <option value="medium">🟡 Med</option>
                        <option value="low">🔵 Low</option>
                      </select>
                      <button onClick={addTask} className="px-3 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-xs font-semibold transition-colors"><Plus size={14} /></button>
                    </div>
                  </div>

                  {/* Team Assignment */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Team / Assigned Members</label>
                    {/* Assigned list */}
                    {fMembers.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {fMembers.map(m => (
                          <div key={m.memberId} className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-700/40 text-indigo-700 dark:text-indigo-300 rounded-full pl-1 pr-2 py-0.5">
                            <MemberAvatar m={m} size={5} />
                            <span className="text-xs font-medium">{m.name}</span>
                            <button onClick={() => removeMember(m.memberId)} className="text-indigo-300 hover:text-red-400 ml-0.5"><X size={11} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Search from list */}
                    <div className="relative mb-2">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
                        placeholder="Search team members…"
                        className="w-full pl-8 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                    </div>
                    {filteredMembers.length > 0 && (
                      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden mb-2 max-h-36 overflow-y-auto">
                        {filteredMembers.slice(0, 8).map((m: any) => (
                          <button key={m.id} onClick={() => addMemberFromList(m)}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-left transition-colors">
                            {m.photo ? <img src={m.photo} className="w-6 h-6 rounded-full object-cover shrink-0" alt={m.name} />
                              : <div className="w-6 h-6 rounded-full bg-indigo-400 flex items-center justify-center text-white text-[9px] font-bold shrink-0">{m.name?.[0]}</div>}
                            <span className="text-xs text-gray-900 dark:text-white">{m.name}</span>
                            <span className="text-[10px] text-gray-400 ml-auto">{m.role}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Free text */}
                    <div className="flex gap-2">
                      <input value={freeTextMember} onChange={e => setFreeTextMember(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && addFreeTextMember()}
                        placeholder="Or type a name…"
                        className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                      <button onClick={addFreeTextMember} className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-gray-600 dark:text-gray-300 rounded-xl text-xs transition-colors"><Plus size={14} /></button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Panel Footer — save/cancel for create/edit */}
            {(panelMode === "create" || panelMode === "edit") && (
              <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex gap-3 shrink-0">
                <button onClick={closePanel} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium">Cancel</button>
                <button onClick={saveEvent} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white text-sm font-semibold shadow transition-all disabled:opacity-60">
                  {saving ? "Saving…" : panelMode === "create" ? "Create Event" : "Save Changes"}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Delete Event confirm modal ── */}
      {deleteEventConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setDeleteEventConfirm(null)}>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center shrink-0 border border-red-100 dark:border-red-800/40">
                <Trash2 size={16} className="text-red-500" />
              </div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white leading-snug">Delete this event?</h3>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 leading-relaxed">
              This event and all its tasks will be <strong className="text-gray-700 dark:text-gray-300">permanently deleted</strong>. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteEventConfirm(null)} className="flex-1 py-2.5 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
              <button
                onClick={() => deleteEvent(deleteEventConfirm)}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
                {isDeleting ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Deleting…</> : "Yes, delete event"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
