import { useState, useMemo } from "react";
import {
  ChevronDown, ChevronLeft, ChevronRight, Plus, Calendar,
  Filter, Pencil, Trash2, X, Lock, Users, Music, Mic2,
  Guitar, Copy, CheckCircle,
} from "lucide-react";
import type { Schedule, Member, Song } from "./types";

// ── Helpers ───────────────────────────────────────────────────────────────────
function eventEmoji(name: string): string {
  const n = (name || "").toLowerCase();
  if (n.includes("sunday"))  return "🙌";
  if (n.includes("midweek")) return "✝️";
  if (n.includes("prayer"))  return "🙏";
  if (n.includes("worship")) return "🎵";
  if (n.includes("youth"))   return "👆";
  if (n.includes("revival")) return "🔥";
  return "📅";
}

function eventColor(name: string): {
  bg: string; border: string; label: string; dot: string;
} {
  const n = (name || "").toLowerCase();
  if (n.includes("sunday"))  return { bg: "bg-indigo-50 dark:bg-indigo-900/20",  border: "border-l-indigo-500 dark:border-l-indigo-400",  label: "text-indigo-600 dark:text-indigo-400",  dot: "bg-indigo-500"  };
  if (n.includes("midweek")) return { bg: "bg-violet-50 dark:bg-violet-900/20",  border: "border-l-violet-500 dark:border-l-violet-400",  label: "text-violet-600 dark:text-violet-400",  dot: "bg-violet-500"  };
  if (n.includes("prayer"))  return { bg: "bg-sky-50 dark:bg-sky-900/20",        border: "border-l-sky-500 dark:border-l-sky-400",        label: "text-sky-600 dark:text-sky-400",        dot: "bg-sky-500"    };
  if (n.includes("worship")) return { bg: "bg-pink-50 dark:bg-pink-900/20",      border: "border-l-pink-500 dark:border-l-pink-400",      label: "text-pink-600 dark:text-pink-400",      dot: "bg-pink-500"   };
  if (n.includes("youth"))   return { bg: "bg-emerald-50 dark:bg-emerald-900/20",border: "border-l-emerald-500 dark:border-l-emerald-400",label: "text-emerald-600 dark:text-emerald-400",dot: "bg-emerald-500"};
  if (n.includes("revival")) return { bg: "bg-orange-50 dark:bg-orange-900/20",  border: "border-l-orange-400 dark:border-l-orange-400",  label: "text-orange-500 dark:text-orange-400",  dot: "bg-orange-500" };
  return                              { bg: "bg-gray-50 dark:bg-gray-700/40",     border: "border-l-gray-400 dark:border-l-gray-500",      label: "text-gray-500 dark:text-gray-400",      dot: "bg-gray-400"   };
}

/** Get week start (Sunday) from any date */
function weekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

/** Format date → "YYYY-MM-DD" */
function toDateStr(d: Date): string {
  return d.toLocaleDateString("en-CA");
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Props ─────────────────────────────────────────────────────────────────────
interface PlaygroundProps {
  allSchedules: Schedule[];
  allMembers: Member[];
  allSongs: Song[];
  isAdmin: boolean;
  isLeader: boolean;
  canWriteSchedule: boolean;
  myMemberProfile: Member | null;
  isLoadingSchedules: boolean;
  onAddEvent: (dateStr: string) => void;     // opens blank form in scheduling
  onEditEvent: (id: string, dateStr: string) => void; // opens existing event in scheduling
  onDeleteEvent: (id: string) => void;       // fires delete with confirm
  onCopyEvent: (schedule: Schedule, allSongs: Song[]) => void;
  onShowToast: (type: string, msg: string) => void;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Playground({
  allSchedules,
  allMembers,
  allSongs,
  isAdmin,
  isLeader,
  canWriteSchedule,
  isLoadingSchedules,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
  onShowToast,
}: PlaygroundProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [weekOf, setWeekOf] = useState(() => weekStart(new Date()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"week" | "month" | "agenda">("week");

  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

  // ── Week days ──────────────────────────────────────────────────────────────
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekOf);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekOf]);

  const weekDayStrs = weekDays.map(toDateStr);

  // ── Month helpers (for month view) ────────────────────────────────────────
  const [monthDate, setMonthDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // ── Schedules map ─────────────────────────────────────────────────────────
  const dateEventsMap = useMemo(() =>
    allSchedules.reduce<Record<string, Schedule[]>>((acc, s) => {
      if (!acc[s.date]) acc[s.date] = [];
      acc[s.date].push(s);
      return acc;
    }, {}),
  [allSchedules]);

  // ── Selected event ────────────────────────────────────────────────────────
  const selectedEvent = useMemo(
    () => selectedId ? allSchedules.find(s => s.id === selectedId) ?? null : null,
    [selectedId, allSchedules],
  );

  // ── Agenda groups ─────────────────────────────────────────────────────────
  const agendaGroups = useMemo(() => {
    const grouped: Record<string, Schedule[]> = {};
    allSchedules
      .filter(s => s.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach(s => {
        if (!grouped[s.date]) grouped[s.date] = [];
        grouped[s.date].push(s);
      });
    return Object.entries(grouped);
  }, [allSchedules, todayStr]);

  // ── Copy helper ───────────────────────────────────────────────────────────
  const copyEvent = (s: Schedule) => {
    const evName = (s as any).eventName || (s.serviceType === "sunday" ? "Sunday Service" : "Midweek");
    const d = new Date(s.date + "T00:00:00");
    const dateLabel = d.toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" });
    const lines = [evName, dateLabel];
    const isService = ["sunday service", "midweek service"].includes(evName.toLowerCase());
    if (isService) {
      if (s.worshipLeader) lines.push("", `Worship Leader: ${s.worshipLeader.name}`);
      if ((s.backupSingers || []).length) lines.push("", `Backup Singers: ${s.backupSingers!.map(b => b.name).join(", ")}`);
      if ((s.musicians || []).length) lines.push("", `Musicians: ${s.musicians!.map(m => `${m.name} (${m.role})`).join(", ")}`);
      const jSong = allSongs.find(sg => sg.id === s.songLineup?.joyful);
      const sSong = allSongs.find(sg => sg.id === s.songLineup?.solemn);
      if (jSong || sSong) {
        lines.push("", "Song Line-up:");
        if (jSong) lines.push(`  Joyful: ${jSong.title}${jSong.artist ? ` - ${jSong.artist}` : ""}${jSong.video_url ? `\n  Link: ${jSong.video_url}` : ""}`);
        if (sSong) lines.push(`  Solemn: ${sSong.title}${sSong.artist ? ` - ${sSong.artist}` : ""}${sSong.video_url ? `\n  Link: ${sSong.video_url}` : ""}`);
      }
    }
    if (s.notes) lines.push("", `Notes: ${s.notes}`);
    navigator.clipboard.writeText(lines.join("\n")).then(() => onShowToast("success", "Copied!"));
  };

  // ── Event card (shared across views) ─────────────────────────────────────
  const EventCard = ({ s, compact = false }: { s: Schedule; compact?: boolean }) => {
    const evName = (s as any).eventName || (s.serviceType === "sunday" ? "Sunday Service" : "Midweek Service");
    const c = eventColor(evName);
    const isPast = s.date < todayStr;
    const isSelected = selectedId === s.id;
    const canWrite = canWriteSchedule || isLeader;

    return (
      <div
        onClick={e => { e.stopPropagation(); setSelectedId(isSelected ? null : s.id); }}
        className={`
          cursor-pointer rounded-lg border-l-4 transition-all relative group
          ${c.bg} ${c.border}
          ${isSelected ? "shadow-lg ring-1 ring-gray-200 dark:ring-gray-600 scale-[1.01]" : "hover:shadow-md"}
          ${compact ? "p-1.5" : "p-2.5"}
        `}
      >
        {/* Emoji + name */}
        <p className={`${c.label} font-semibold leading-tight ${compact ? "text-[10px]" : "text-[11px]"}`}>
          {eventEmoji(evName)} {evName}
        </p>
        {!compact && s.worshipLeader && (
          <p className="text-[11px] mt-0.5 text-gray-600 dark:text-gray-400 truncate">
            {s.worshipLeader.name}
          </p>
        )}
        {!compact && s.notes && (
          <p className="text-[10px] mt-0.5 text-gray-400 dark:text-gray-500 truncate">{s.notes}</p>
        )}
        {isPast && !compact && (
          <span className="text-[9px] text-amber-500 dark:text-amber-400 flex items-center gap-0.5 mt-0.5">
            <Lock size={8} /> Past
          </span>
        )}

        {/* ── Popup panel ────────────────────────────────────────────────── */}
        {isSelected && (
          <div
            className="absolute z-50 left-0 top-full mt-2 w-72 rounded-2xl border shadow-2xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className={`font-bold text-base ${c.label}`}>
                    {eventEmoji(evName)} {evName}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {new Date(s.date + "T00:00:00").toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* Copy */}
                  <button
                    onClick={() => copyEvent(s)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-colors"
                    title="Copy event details"
                  >
                    <Copy size={13} />
                  </button>
                  {/* Edit — permitted + not past */}
                  {canWrite && !isPast && (
                    <button
                      onClick={() => onEditEvent(s.id, s.date)}
                      className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      title="Edit event"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  {/* Delete — admin only */}
                  {isAdmin && (
                    <button
                      onClick={() => { setSelectedId(null); onDeleteEvent(s.id); }}
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
                      title="Delete event"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedId(null)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            </div>

            {/* Past banner */}
            {isPast && (
              <div className="mx-4 mt-3 flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                <Lock size={12} className="shrink-0" /> This date has passed — view only
              </div>
            )}

            {/* Service event details */}
            <div className="px-4 py-3 space-y-3">
              {/* Worship Leader */}
              {s.worshipLeader && (
                <div className="flex items-center gap-3">
                  {s.worshipLeader.photo
                    ? <img src={s.worshipLeader.photo} className="w-8 h-8 rounded-full object-cover shrink-0" alt={s.worshipLeader.name} />
                    : <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">{s.worshipLeader.name[0]}</div>
                  }
                  <div>
                    <p className="text-xs text-gray-400 dark:text-gray-500">Worship Leader</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{s.worshipLeader.name}</p>
                  </div>
                </div>
              )}

              {/* Backup Singers */}
              {(s.backupSingers || []).length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 mb-1.5">
                    <Mic2 size={11} /> Backup Singers
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.backupSingers!.map(b => (
                      <div key={b.memberId} className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-700/60 rounded-lg text-xs text-gray-700 dark:text-gray-300">
                        {b.photo
                          ? <img src={b.photo} className="w-4 h-4 rounded-full object-cover" alt={b.name} />
                          : <div className="w-4 h-4 rounded-full bg-pink-400 flex items-center justify-center text-white text-[8px] font-bold">{b.name[0]}</div>
                        }
                        {b.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Musicians */}
              {(s.musicians || []).length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 mb-1.5">
                    <Guitar size={11} /> Musicians
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.musicians!.map(m => (
                      <div key={m.memberId} className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-700/60 rounded-lg text-xs text-gray-700 dark:text-gray-300">
                        {m.photo
                          ? <img src={m.photo} className="w-4 h-4 rounded-full object-cover" alt={m.name} />
                          : <div className="w-4 h-4 rounded-full bg-teal-500 flex items-center justify-center text-white text-[8px] font-bold">{m.name[0]}</div>
                        }
                        <span>{m.name}</span>
                        <span className="text-gray-400 dark:text-gray-500">· {m.role}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom assignments */}
              {(s.assignments || []).filter(a => (a.members || []).length > 0).map(a => (
                <div key={a.role}>
                  <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 mb-1.5">
                    <Users size={11} /> {a.role}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(a.members || []).map(m => (
                      <div key={m.memberId} className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-700/60 rounded-lg text-xs text-gray-700 dark:text-gray-300">
                        {m.photo
                          ? <img src={m.photo} className="w-4 h-4 rounded-full object-cover" alt={m.name} />
                          : <div className="w-4 h-4 rounded-full bg-gray-400 flex items-center justify-center text-white text-[8px] font-bold">{m.name[0]}</div>
                        }
                        {m.name}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Song lineup */}
              {(s.songLineup?.joyful || s.songLineup?.solemn) && (() => {
                const jSong = allSongs.find(sg => sg.id === s.songLineup?.joyful);
                const sSong = allSongs.find(sg => sg.id === s.songLineup?.solemn);
                return (
                  <div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 mb-1.5">
                      <Music size={11} /> Song Line-up
                    </p>
                    <div className="space-y-1.5">
                      {jSong && (
                        <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wide">Joyful</p>
                            <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{jSong.title}</p>
                            {jSong.artist && <p className="text-[10px] text-gray-400 dark:text-gray-500">{jSong.artist}</p>}
                          </div>
                          {jSong.video_url && (
                            <a href={jSong.video_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-[10px] text-indigo-500 hover:underline shrink-0">▶</a>
                          )}
                        </div>
                      )}
                      {sSong && (
                        <div className="flex items-center gap-2 p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold uppercase tracking-wide">Solemn</p>
                            <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{sSong.title}</p>
                            {sSong.artist && <p className="text-[10px] text-gray-400 dark:text-gray-500">{sSong.artist}</p>}
                          </div>
                          {sSong.video_url && (
                            <a href={sSong.video_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-[10px] text-indigo-500 hover:underline shrink-0">▶</a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Notes */}
              {s.notes && (
                <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide font-semibold mb-1">Notes</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{s.notes}</p>
                </div>
              )}

              {/* No data empty state */}
              {!s.worshipLeader && !(s.backupSingers?.length) && !(s.musicians?.length) && !(s.assignments?.length) && !s.notes && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">No details added yet.</p>
              )}
            </div>

            {/* Footer: edit CTA if permitted */}
            {!isPast && (canWriteSchedule || isLeader) && (
              <div className="px-4 pb-4">
                <button
                  onClick={() => { setSelectedId(null); onEditEvent(s.id, s.date); }}
                  className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <Pencil size={12} /> Edit Event
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── Week label ────────────────────────────────────────────────────────────
  const weekLabel = (() => {
    const start = weekDays[0];
    const end = weekDays[6];
    const sameMonth = start.getMonth() === end.getMonth();
    if (sameMonth) {
      return `${start.toLocaleDateString("en", { month: "long" })} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`;
    }
    return `${start.toLocaleDateString("en", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}`;
  })();

  const goToday = () => {
    setWeekOf(weekStart(new Date()));
    setMonthDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-full select-none bg-gray-50 dark:bg-gray-900 transition-colors"
      onClick={() => setSelectedId(null)}
    >
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
            Events
          </h1>
          <p className="text-sm mt-0.5 text-gray-500 dark:text-gray-400">
            Worship schedule — week &amp; month view
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Today button */}
          <button
            onClick={goToday}
            className="px-3 py-2 rounded-xl text-xs font-semibold border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
          >
            Today
          </button>
          {/* Add event — permitted users only */}
          {(canWriteSchedule || isLeader) && (
            <button
              onClick={() => {
                const d = view === "week"
                  ? (weekDays.find(d => toDateStr(d) >= todayStr) ? toDateStr(weekDays.find(d => toDateStr(d) >= todayStr)!) : todayStr)
                  : todayStr;
                onAddEvent(d);
              }}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Plus size={15} /> <span className="hidden sm:inline">Add Event</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Calendar card ───────────────────────────────────────────────── */}
      <div className="rounded-2xl border overflow-hidden shadow-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 transition-colors">

        {/* Sub-header */}
        <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-3 px-4 sm:px-5 py-3 border-b border-gray-100 dark:border-gray-700">
          {/* Navigation */}
          <div className="flex items-center gap-1">
            {view === "week" ? (
              <>
                <button onClick={() => setWeekOf(d => new Date(d.getTime() - 7 * 86400000))} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 min-w-[180px] text-center">{weekLabel}</span>
                <button onClick={() => setWeekOf(d => new Date(d.getTime() + 7 * 86400000))} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
                  <ChevronRight size={16} />
                </button>
              </>
            ) : view === "month" ? (
              <>
                <button onClick={() => setMonthDate(new Date(year, month - 1, 1))} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 min-w-[140px] text-center">
                  {monthDate.toLocaleDateString("en", { month: "long", year: "numeric" })}
                </span>
                <button onClick={() => setMonthDate(new Date(year, month + 1, 1))} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
                  <ChevronRight size={16} />
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Calendar size={15} className="text-gray-500 dark:text-gray-400" />
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Upcoming Events</span>
              </div>
            )}
          </div>

          {/* View toggle */}
          <div className="flex items-center rounded-xl overflow-hidden border border-gray-200 dark:border-gray-600">
            {(["week", "month", "agenda"] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium capitalize transition-colors ${
                  view === v
                    ? "bg-indigo-600 text-white font-semibold"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* ── Loading state ─────────────────────────────────────────────── */}
        {isLoadingSchedules && (
          <div className="flex items-center justify-center py-12 text-gray-400 dark:text-gray-500">
            <svg className="animate-spin mr-2" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25" /><path d="M12 2a10 10 0 0 1 10 10" /></svg>
            Loading events…
          </div>
        )}

        {!isLoadingSchedules && (
          <>
            {/* ── WEEK VIEW ─────────────────────────────────────────────── */}
            {view === "week" && (
              <div className="overflow-x-auto">
                <div style={{ minWidth: "600px" }}>
                  {/* Day headers */}
                  <div
                    className="border-b border-gray-100 dark:border-gray-700"
                    style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}
                  >
                    {weekDays.map((d, i) => {
                      const dStr = toDateStr(d);
                      const isToday = dStr === todayStr;
                      const isPast = dStr < todayStr;
                      return (
                        <div
                          key={i}
                          className={`px-2 py-3 text-center border-r border-gray-100 dark:border-gray-700 last:border-r-0 ${isPast ? "opacity-60" : ""}`}
                        >
                          <p className="text-[11px] uppercase font-semibold text-gray-400 dark:text-gray-500">
                            {DAY_LABELS[d.getDay()]}
                          </p>
                          <div className={`mx-auto mt-1 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                            isToday
                              ? "bg-indigo-600 text-white"
                              : "text-gray-700 dark:text-gray-200"
                          }`}>
                            {d.getDate()}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Event cells */}
                  <div
                    style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}
                  >
                    {weekDays.map((d, di) => {
                      const dStr = toDateStr(d);
                      const events = dateEventsMap[dStr] ?? [];
                      const isPast = dStr < todayStr;
                      const isToday = dStr === todayStr;
                      const canAdd = (canWriteSchedule || isLeader) && !isPast;
                      return (
                        <div
                          key={di}
                          className={`
                            relative p-2 border-r border-gray-100 dark:border-gray-700 last:border-r-0
                            ${isToday ? "bg-indigo-50/30 dark:bg-indigo-900/10" : ""}
                          `}
                          style={{ minHeight: "120px" }}
                        >
                          <div className="space-y-1.5">
                            {events.map(s => <EventCard key={s.id} s={s} compact={events.length > 2} />)}
                          </div>

                          {/* Inline "+ add" for permitted users on future days */}
                          {canAdd && (
                            <button
                              onClick={e => { e.stopPropagation(); onAddEvent(dStr); }}
                              className="mt-2 w-full flex items-center justify-center gap-1 py-1 rounded-lg border border-dashed border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-indigo-400 dark:hover:border-indigo-500 hover:text-indigo-500 text-[11px] transition-all"
                            >
                              <Plus size={11} /> Add
                            </button>
                          )}
                          {isPast && !events.length && (
                            <p className="text-[10px] text-gray-300 dark:text-gray-600 text-center pt-4">—</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── MONTH VIEW ────────────────────────────────────────────── */}
            {view === "month" && (
              <div>
                {/* Day-of-week header */}
                <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-700">
                  {DAY_LABELS.map(d => (
                    <div key={d} className="py-2 text-center text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Date cells */}
                <div className="grid grid-cols-7">
                  {/* Blank lead cells */}
                  {Array.from({ length: firstDow }).map((_, i) => (
                    <div key={`b${i}`} className="min-h-[80px] border-b border-r border-gray-100 dark:border-gray-700/50" />
                  ))}

                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const events = dateEventsMap[dStr] ?? [];
                    const isToday = dStr === todayStr;
                    const isPast = dStr < todayStr;
                    const isWeekend = (firstDow + i) % 7 === 0 || (firstDow + i) % 7 === 6;

                    return (
                      <div
                        key={dStr}
                        className={`
                          min-h-[80px] p-1.5 border-b border-r border-gray-100 dark:border-gray-700/50 relative
                          ${isToday ? "bg-indigo-50/40 dark:bg-indigo-900/10" : ""}
                          ${isPast ? "opacity-70" : ""}
                        `}
                      >
                        {/* Day number */}
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mb-1 ${
                          isToday ? "bg-indigo-600 text-white" : "text-gray-600 dark:text-gray-300"
                        }`}>
                          {day}
                        </div>

                        {/* Events */}
                        <div className="space-y-0.5">
                          {events.slice(0, 3).map(s => {
                            const evName = (s as any).eventName || (s.serviceType === "sunday" ? "Sunday Service" : "Midweek");
                            const c = eventColor(evName);
                            return (
                              <div
                                key={s.id}
                                onClick={e => { e.stopPropagation(); setSelectedId(selectedId === s.id ? null : s.id); }}
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer truncate ${c.bg} ${c.label} hover:opacity-90 transition-opacity border-l-2 ${c.border}`}
                              >
                                {eventEmoji(evName)} {evName}
                                {/* Floating popup re-uses same EventCard logic */}
                                {selectedId === s.id && (
                                  <EventCard s={s} compact />
                                )}
                              </div>
                            );
                          })}
                          {events.length > 3 && (
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 pl-1">+{events.length - 3} more</p>
                          )}
                        </div>

                        {/* Add button on hover */}
                        {!isPast && (canWriteSchedule || isLeader) && (
                          <button
                            onClick={e => { e.stopPropagation(); onAddEvent(dStr); }}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 items-center justify-center hidden group-hover:flex transition-all"
                          >
                            <Plus size={10} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── AGENDA VIEW ───────────────────────────────────────────── */}
            {view === "agenda" && (
              <div>
                {agendaGroups.length === 0 ? (
                  <div className="text-center py-16 text-gray-400 dark:text-gray-500">
                    <Calendar size={40} className="mx-auto mb-3 opacity-40" />
                    <p className="font-semibold">No upcoming events</p>
                    <p className="text-sm mt-1">Events you add will appear here.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {agendaGroups.map(([dateStr, events]) => {
                      const d = new Date(dateStr + "T00:00:00");
                      const isToday = dateStr === todayStr;
                      return (
                        <div key={dateStr} className="flex gap-0">
                          {/* Date column */}
                          <div className={`w-20 sm:w-24 shrink-0 px-3 py-4 text-center border-r border-gray-100 dark:border-gray-700 ${isToday ? "bg-indigo-50/40 dark:bg-indigo-900/10" : ""}`}>
                            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase">{d.toLocaleDateString("en", { weekday: "short" })}</p>
                            <div className={`text-xl font-bold mx-auto ${isToday ? "text-indigo-600 dark:text-indigo-400" : "text-gray-800 dark:text-gray-200"}`}>
                              {d.getDate()}
                            </div>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500">{d.toLocaleDateString("en", { month: "short" })}</p>
                          </div>
                          {/* Events column */}
                          <div className="flex-1 p-3 space-y-2">
                            {events.map(s => <EventCard key={s.id} s={s} />)}
                            {/* Add another */}
                            {(canWriteSchedule || isLeader) && (
                              <button
                                onClick={e => { e.stopPropagation(); onAddEvent(dateStr); }}
                                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-indigo-500 transition-colors py-1"
                              >
                                <Plus size={11} /> Add event on this day
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
