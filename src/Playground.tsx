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
  day: number; // 0–6 (Sun–Sat index within the week)
  color: keyof typeof COLOR_MAP;
}

// ── Color palette ─────────────────────────────────────────────────────────────
const COLOR_MAP = {
  green:  { bg: "bg-emerald-50",  border: "border-l-emerald-500", label: "text-emerald-600" },
  purple: { bg: "bg-purple-50",   border: "border-l-purple-400",  label: "text-purple-600"  },
  orange: { bg: "bg-orange-50",   border: "border-l-orange-400",  label: "text-orange-500"  },
  pink:   { bg: "bg-pink-50",     border: "border-l-pink-500",    label: "text-pink-500"    },
  teal:   { bg: "bg-cyan-50",     border: "border-l-cyan-500",    label: "text-cyan-600"    },
  indigo: { bg: "bg-violet-50",   border: "border-l-violet-500",  label: "text-violet-700"  },
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
    // Force light-mode styles regardless of app dark mode
    <div
      className="min-h-full p-1 select-none"
      style={{ background: "#f7f7fb", fontFamily: "Inter, sans-serif" }}
      onClick={() => setSelectedId(null)}
    >
      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#111827" }}>Sessions</h1>
          <p className="text-sm mt-1" style={{ color: "#6b7280" }}>
            Here are the latest updates from the past 7 days.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Week dropdown */}
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium shadow-sm border"
            style={{ background: "#fff", borderColor: "#e5e7eb", color: "#374151" }}
          >
            Week <ChevronDown size={15} style={{ color: "#9ca3af" }} />
          </button>
          {/* Add Sessions */}
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold shadow-sm text-white"
            style={{ background: "#7c3aed" }}
          >
            <Plus size={15} /> Add Sessions
          </button>
        </div>
      </div>

      {/* ── Calendar Card ──────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl border overflow-hidden shadow-sm"
        style={{ background: "#ffffff", borderColor: "#e5e7eb" }}
      >
        {/* Sub-header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b"
          style={{ borderColor: "#f3f4f6" }}
        >
          <div className="flex items-center gap-2">
            <Calendar size={16} style={{ color: "#6b7280" }} />
            <span className="text-sm font-semibold" style={{ color: "#1f2937" }}>
              Calendar View
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Filter */}
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
              style={{ borderColor: "#e5e7eb", color: "#6b7280" }}
            >
              <Filter size={13} /> Filter
            </button>
            {/* Day / Week / Month */}
            <div
              className="flex items-center rounded-lg overflow-hidden border text-sm"
              style={{ borderColor: "#e5e7eb" }}
            >
              <button
                className="px-3 py-1.5 transition-colors"
                style={{ color: "#6b7280" }}
              >
                Day
              </button>
              <button
                className="px-3 py-1.5 font-semibold text-white"
                style={{ background: "#7c3aed" }}
              >
                Week
              </button>
              <button
                className="px-3 py-1.5 transition-colors"
                style={{ color: "#6b7280" }}
              >
                Month
              </button>
            </div>
          </div>
        </div>

        {/* ── Calendar Grid ─────────────────────────────────────────────────── */}
        <div className="overflow-x-auto">
          <div style={{ minWidth: "740px" }}>

            {/* Column headers */}
            <div
              className="border-b"
              style={{
                display: "grid",
                gridTemplateColumns: "76px repeat(7, 1fr)",
                borderColor: "#f3f4f6",
              }}
            >
              <div
                className="px-3 py-3 text-xs font-semibold uppercase tracking-wide border-r"
                style={{ color: "#9ca3af", borderColor: "#f3f4f6" }}
              >
                Time
              </div>
              {DAYS.map((day, i) => (
                <div
                  key={day}
                  className="px-3 py-3 text-sm font-semibold text-center"
                  style={{
                    color: "#374151",
                    borderRight: i < DAYS.length - 1 ? "1px solid #f3f4f6" : "none",
                  }}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Time rows */}
            {TIME_SLOTS.map((slot, ti) => (
              <div
                key={slot}
                style={{
                  display: "grid",
                  gridTemplateColumns: "76px repeat(7, 1fr)",
                  borderBottom: ti < TIME_SLOTS.length - 1 ? "1px solid #f3f4f6" : "none",
                }}
              >
                {/* Time label */}
                <div
                  className="px-3 pt-3 text-xs font-medium border-r flex items-start"
                  style={{ color: "#9ca3af", borderColor: "#f3f4f6", minHeight: "88px" }}
                >
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
                      className="p-2 relative"
                      style={{
                        minHeight: "88px",
                        borderRight: !isLast ? "1px solid #f3f4f6" : "none",
                      }}
                    >
                      {session && c && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(isSelected ? null : session.id);
                          }}
                          className={`cursor-pointer rounded-lg p-2.5 border-l-4 transition-shadow ${c.bg} ${c.border} ${isSelected ? "shadow-md ring-1 ring-gray-200" : "hover:shadow-md"}`}
                        >
                          {/* Coach label */}
                          <p className={`text-[10px] font-semibold leading-tight ${c.label}`}>
                            {session.coach}
                          </p>
                          {/* Trainee name */}
                          <p className="text-sm font-bold leading-snug mt-0.5" style={{ color: "#111827" }}>
                            {session.trainee}
                          </p>
                          {/* Type */}
                          {session.type && (
                            <p className="text-[11px] mt-0.5" style={{ color: "#6b7280" }}>
                              {session.type}
                            </p>
                          )}
                          {/* Time */}
                          <p className="text-[11px] mt-0.5" style={{ color: "#9ca3af" }}>
                            {session.time}
                          </p>

                          {/* ── Detail popup ──────────────────────────────── */}
                          {isSelected && (
                            <div
                              className="absolute z-50 rounded-xl border shadow-xl"
                              style={{
                                top: "calc(100% + 6px)",
                                left: 0,
                                width: "252px",
                                background: "#ffffff",
                                borderColor: "#e5e7eb",
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="p-4">
                                {/* Popup header */}
                                <div className="flex items-center justify-between mb-3">
                                  <p className={`font-bold text-base ${c.label}`}>
                                    {session.coach}
                                  </p>
                                  <div className="flex items-center gap-1">
                                    <button
                                      className="p-1.5 rounded-lg transition-colors"
                                      style={{ color: "#6b7280" }}
                                      onMouseEnter={e => (e.currentTarget.style.background = "#f3f4f6")}
                                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                    >
                                      <Pencil size={13} />
                                    </button>
                                    <button
                                      className="p-1.5 rounded-lg transition-colors"
                                      style={{ color: "#6b7280" }}
                                      onMouseEnter={e => (e.currentTarget.style.background = "#f3f4f6")}
                                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                    >
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
                                    <div key={row.label} className="flex items-center gap-3">
                                      <span
                                        className="text-xs shrink-0"
                                        style={{ color: "#9ca3af", width: "100px" }}
                                      >
                                        {row.label}
                                      </span>
                                      <span className="text-sm font-medium" style={{ color: "#111827" }}>
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
