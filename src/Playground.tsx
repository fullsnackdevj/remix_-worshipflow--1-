import { useState } from "react";
import { ChevronDown, Plus, Calendar, Filter, Pencil, Trash2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Session {
  id: number;
  coach: string;
  trainee: string;
  type: string;
  time: string;
  timeVal: string;
  day: number;
  color: keyof typeof COLOR_MAP;
}

// ── Color palette (light + dark) ──────────────────────────────────────────────
const COLOR_MAP = {
  green:  {
    bg:     "bg-emerald-50 dark:bg-emerald-900/20",
    border: "border-l-emerald-500 dark:border-l-emerald-400",
    label:  "text-emerald-600 dark:text-emerald-400",
  },
  purple: {
    bg:     "bg-purple-50 dark:bg-purple-900/20",
    border: "border-l-purple-400 dark:border-l-purple-400",
    label:  "text-purple-600 dark:text-purple-400",
  },
  orange: {
    bg:     "bg-orange-50 dark:bg-orange-900/20",
    border: "border-l-orange-400 dark:border-l-orange-400",
    label:  "text-orange-500 dark:text-orange-400",
  },
  pink:   {
    bg:     "bg-pink-50 dark:bg-pink-900/20",
    border: "border-l-pink-500 dark:border-l-pink-400",
    label:  "text-pink-500 dark:text-pink-400",
  },
  teal:   {
    bg:     "bg-cyan-50 dark:bg-cyan-900/20",
    border: "border-l-cyan-500 dark:border-l-cyan-400",
    label:  "text-cyan-600 dark:text-cyan-400",
  },
  indigo: {
    bg:     "bg-violet-50 dark:bg-violet-900/20",
    border: "border-l-violet-500 dark:border-l-violet-400",
    label:  "text-violet-700 dark:text-violet-400",
  },
};

// ── Static data ───────────────────────────────────────────────────────────────
const DAYS = ["11 Feb", "12 Feb", "13 Feb", "14 Feb", "15 Feb", "16 Feb", "17 Feb"];
const TIME_SLOTS = ["2 PM", "1 PM", "12 PM", "11 AM", "10 AM"];

const SESSIONS: Session[] = [
  { id: 1,  coach: "Coach: Rafid Hasan", trainee: "Tahmid Hasan",     type: "Body Strength Training", time: "2 PM",  timeVal: "02:00 PM", day: 0, color: "green"  },
  { id: 2,  coach: "Coach: Rafid Hasan", trainee: "Rafiq Ahmed",      type: "Flexibility & Mobility", time: "1 PM",  timeVal: "01:00 PM", day: 1, color: "purple" },
  { id: 3,  coach: "Coach: Rafid Hasan", trainee: "Ayesha Sultana",   type: "",                       time: "1 PM",  timeVal: "01:00 PM", day: 3, color: "indigo" },
  { id: 4,  coach: "Coach: Rafid Hasan", trainee: "Imran Hossain",    type: "Fat Loss Training",      time: "11 AM", timeVal: "11:00 AM", day: 0, color: "orange" },
  { id: 5,  coach: "Coach: Rafid Hasan", trainee: "Jahidul Islam",    type: "Powerlifting",           time: "11 AM", timeVal: "11:00 AM", day: 3, color: "indigo" },
  { id: 6,  coach: "Coach: Rafid Hasan", trainee: "Nayeem Rahman",    type: "Hypertrophy",            time: "10 AM", timeVal: "10:00 AM", day: 1, color: "pink"   },
  { id: 7,  coach: "Coach: Rafid Hasan", trainee: "Ariful Hoque",     type: "Cardio & HIIT",          time: "2 PM",  timeVal: "02:00 PM", day: 5, color: "green"  },
  { id: 8,  coach: "Coach: Rafid Hasan", trainee: "Faruk Khan",       type: "Intensity Cardio",       time: "10 AM", timeVal: "10:00 AM", day: 5, color: "teal"   },
  { id: 9,  coach: "Coach: Rafid Hasan", trainee: "Rashed Chowdhury", type: "Athletic Performance",   time: "10 AM", timeVal: "10:00 AM", day: 4, color: "pink"   },
  { id: 10, coach: "Coach: Rafid Hasan", trainee: "Rahima Khatun",    type: "Weight Management",      time: "1 PM",  timeVal: "01:00 PM", day: 6, color: "purple" },
  { id: 11, coach: "Coach: Rafid Hasan", trainee: "Adnan Kabir",      type: "Functional Training",    time: "10 AM", timeVal: "10:00 AM", day: 6, color: "pink"   },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function Playground() {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const getSession = (time: string, dayIdx: number) =>
    SESSIONS.find(s => s.time === time && s.day === dayIdx) ?? null;

  return (
    <div
      className="min-h-full p-1 select-none bg-gray-50 dark:bg-gray-900 transition-colors"
      onClick={() => setSelectedId(null)}
    >
      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sessions</h1>
          <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">
            Here are the latest updates from the past 7 days.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Week dropdown */}
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium shadow-sm border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 transition-colors">
            Week <ChevronDown size={15} className="text-gray-400 dark:text-gray-500" />
          </button>
          {/* Add Sessions */}
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold shadow-sm text-white bg-violet-600 hover:bg-violet-700 transition-colors">
            <Plus size={15} /> Add Sessions
          </button>
        </div>
      </div>

      {/* ── Calendar Card ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl border overflow-hidden shadow-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 transition-colors">

        {/* Sub-header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-gray-500 dark:text-gray-400" />
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Calendar View
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Filter */}
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <Filter size={13} /> Filter
            </button>
            {/* Day / Week / Month toggle */}
            <div className="flex items-center rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 text-sm">
              <button className="px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Day
              </button>
              <button className="px-3 py-1.5 font-semibold text-white bg-violet-600">
                Week
              </button>
              <button className="px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Month
              </button>
            </div>
          </div>
        </div>

        {/* ── Grid ────────────────────────────────────────────────────────── */}
        <div className="overflow-x-auto">
          <div style={{ minWidth: "740px" }}>

            {/* Column headers */}
            <div
              className="border-b border-gray-100 dark:border-gray-700"
              style={{ display: "grid", gridTemplateColumns: "76px repeat(7, 1fr)" }}
            >
              <div className="px-3 py-3 text-xs font-semibold uppercase tracking-wide border-r border-gray-100 dark:border-gray-700 text-gray-400 dark:text-gray-500">
                Time
              </div>
              {DAYS.map((day, i) => (
                <div
                  key={day}
                  className="px-3 py-3 text-sm font-semibold text-center text-gray-600 dark:text-gray-300"
                  style={{ borderRight: i < DAYS.length - 1 ? undefined : "none" }}
                >
                  <span
                    className="block"
                    style={{ borderRight: i < DAYS.length - 1 ? "" : undefined }}
                  >
                    {day}
                  </span>
                </div>
              ))}
            </div>

            {/* Day header borders via wrapper trick */}
            <div
              className="border-b border-gray-100 dark:border-gray-700 -mt-px hidden"
              style={{ display: "grid", gridTemplateColumns: "76px repeat(7, 1fr)" }}
            />

            {/* Time rows */}
            {TIME_SLOTS.map((slot, ti) => (
              <div
                key={slot}
                className={ti < TIME_SLOTS.length - 1 ? "border-b border-gray-100 dark:border-gray-700" : ""}
                style={{ display: "grid", gridTemplateColumns: "76px repeat(7, 1fr)" }}
              >
                {/* Time label */}
                <div className="px-3 pt-3 text-xs font-medium border-r border-gray-100 dark:border-gray-700 flex items-start text-gray-400 dark:text-gray-500" style={{ minHeight: "88px" }}>
                  {slot}
                </div>

                {/* Day cells */}
                {DAYS.map((_, di) => {
                  const session = getSession(slot, di);
                  const isLast = di === DAYS.length - 1;
                  const c = session ? COLOR_MAP[session.color] : null;
                  const isSelected = session ? selectedId === session.id : false;

                  return (
                    <div
                      key={di}
                      className={`p-2 relative ${!isLast ? "border-r border-gray-100 dark:border-gray-700" : ""}`}
                      style={{ minHeight: "88px" }}
                    >
                      {session && c && (
                        <div
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedId(isSelected ? null : session.id);
                          }}
                          className={`cursor-pointer rounded-lg p-2.5 border-l-4 transition-shadow ${c.bg} ${c.border} ${isSelected ? "shadow-lg ring-1 ring-gray-200 dark:ring-gray-600" : "hover:shadow-md"}`}
                        >
                          {/* Coach label */}
                          <p className={`text-[10px] font-semibold leading-tight ${c.label}`}>
                            {session.coach}
                          </p>
                          {/* Trainee name */}
                          <p className="text-sm font-bold leading-snug mt-0.5 text-gray-900 dark:text-white">
                            {session.trainee}
                          </p>
                          {/* Session type */}
                          {session.type && (
                            <p className="text-[11px] mt-0.5 text-gray-500 dark:text-gray-400">
                              {session.type}
                            </p>
                          )}
                          {/* Time */}
                          <p className="text-[11px] mt-0.5 text-gray-400 dark:text-gray-500">
                            {session.time}
                          </p>

                          {/* ── Detail popup ─────────────────────────────── */}
                          {isSelected && (
                            <div
                              className="absolute z-50 rounded-xl border shadow-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 transition-colors"
                              style={{ top: "calc(100% + 6px)", left: 0, width: "252px" }}
                              onClick={e => e.stopPropagation()}
                            >
                              <div className="p-4">
                                {/* Popup header */}
                                <div className="flex items-center justify-between mb-3">
                                  <p className={`font-bold text-base ${c.label}`}>
                                    {session.coach}
                                  </p>
                                  <div className="flex items-center gap-1">
                                    <button className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
                                      <Pencil size={13} />
                                    </button>
                                    <button className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>

                                {/* Detail rows */}
                                <div className="space-y-2.5">
                                  {[
                                    { label: "Trainee Name:", value: session.trainee },
                                    { label: "Type:",         value: session.type || "—" },
                                    { label: "Time:",         value: session.timeVal },
                                  ].map(row => (
                                    <div key={row.label} className="flex items-start gap-3">
                                      <span className="text-xs shrink-0 text-gray-400 dark:text-gray-500" style={{ width: "100px" }}>
                                        {row.label}
                                      </span>
                                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                                        {row.value}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

          </div>
        </div>
      </div>
    </div>
  );
}
