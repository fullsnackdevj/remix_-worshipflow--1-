import React, { useState, useRef, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, X } from "lucide-react";

interface DatePickerProps {
  value: string;          // "YYYY-MM-DD" or ""
  onChange: (val: string) => void;
  max?: string;           // "YYYY-MM-DD"
  min?: string;
  placeholder?: string;
  error?: boolean;
  label?: string;
  required?: boolean;
  icon?: React.ReactNode;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function parseYMD(s: string): { y: number; m: number; d: number } | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

function toYMD(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function formatDisplay(ymd: string): string {
  const p = parseYMD(ymd);
  if (!p) return "";
  return `${MONTHS[p.m - 1]} ${p.d}, ${p.y}`;
}

export default function DatePicker({
  value,
  onChange,
  max,
  min,
  placeholder = "Select date",
  error = false,
  icon,
}: DatePickerProps) {
  const today = new Date();
  const todayYMD = toYMD(today.getFullYear(), today.getMonth() + 1, today.getDate());

  // Dropdown open state
  const [open, setOpen] = useState(false);

  // Which month/year is being viewed
  const parsed = parseYMD(value);
  const [viewYear, setViewYear] = useState(() => parsed?.y ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => parsed?.m ?? today.getMonth() + 1); // 1-12

  // Year picker mode
  const [yearPickerOpen, setYearPickerOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const yearListRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setYearPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Sync view to selected value when opening
  const handleOpen = () => {
    const p = parseYMD(value);
    if (p) { setViewYear(p.y); setViewMonth(p.m); }
    setOpen(o => !o);
    setYearPickerOpen(false);
  };

  // Navigate months
  const prevMonth = useCallback(() => {
    setViewMonth(m => { if (m === 1) { setViewYear(y => y - 1); return 12; } return m - 1; });
  }, []);
  const nextMonth = useCallback(() => {
    setViewMonth(m => { if (m === 12) { setViewYear(y => y + 1); return 1; } return m + 1; });
  }, []);

  // Build calendar grid
  const firstDow = new Date(viewYear, viewMonth - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();

  const selectDay = (day: number) => {
    const ymd = toYMD(viewYear, viewMonth, day);
    onChange(ymd);
    setOpen(false);
    setYearPickerOpen(false);
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
  };

  const isDisabled = (day: number) => {
    const ymd = toYMD(viewYear, viewMonth, day);
    if (max && ymd > max) return true;
    if (min && ymd < min) return true;
    return false;
  };

  // Year range for picker
  const currentDecadeStart = Math.floor(viewYear / 10) * 10 - 10;
  const yearRange = Array.from({ length: 40 }, (_, i) => currentDecadeStart + i).filter(
    y => y >= 1900 && y <= today.getFullYear()
  );

  const displayText = formatDisplay(value);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={handleOpen}
        className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border transition-all text-left
          ${error
            ? "border-red-400 ring-2 ring-red-200 dark:ring-red-900/40"
            : open
              ? "border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900/40"
              : "border-gray-300 dark:border-gray-600 hover:border-indigo-400 dark:hover:border-indigo-500"
          }
          bg-white dark:bg-gray-800 text-sm font-medium group`}
      >
        {/* Icon */}
        <span className="shrink-0 text-gray-400 dark:text-gray-500">
          {icon ?? <span className="text-base">🎂</span>}
        </span>

        {/* Value or placeholder */}
        <span className={`flex-1 ${displayText ? "text-gray-900 dark:text-gray-100" : "text-gray-400 dark:text-gray-500"}`}>
          {displayText || placeholder}
        </span>

        {/* Actions */}
        <span className="flex items-center gap-1 shrink-0 ml-auto">
          {value && (
            <span
              onClick={clear}
              className="p-0.5 text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors rounded-md cursor-pointer"
              title="Clear"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown
            size={15}
            className={`text-gray-400 dark:text-gray-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {/* Dropdown calendar */}
      {open && (
        <div className="absolute z-[200] mt-2 left-0 right-0 bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl overflow-hidden"
             style={{ minWidth: "280px", background: "var(--dp-bg, #fff)" }}>

          {/* ── Month/Year header ── */}
          <div className="flex items-center gap-1 px-3 pt-3 pb-2">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>

            {/* Month + Year (clickable for year picker) */}
            <button
              type="button"
              onClick={() => setYearPickerOpen(y => !y)}
              className="flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
            >
              <span className="font-bold text-sm text-gray-900 dark:text-white tracking-wide">
                {MONTHS[viewMonth - 1]} {viewYear}
              </span>
              <ChevronDown
                size={13}
                className={`text-indigo-500 transition-transform duration-200 ${yearPickerOpen ? "rotate-180" : ""}`}
              />
            </button>

            <button
              type="button"
              onClick={nextMonth}
              disabled={max ? toYMD(viewYear, viewMonth + 1, 1) > max.slice(0, 7) + "-01" : false}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* ── Year picker ── */}
          {yearPickerOpen && (
            <div
              ref={yearListRef}
              className="px-3 pb-3 grid grid-cols-4 gap-1 max-h-48 overflow-y-auto pretty-scrollbar"
            >
              {yearRange.map(y => (
                <button
                  key={y}
                  type="button"
                  onClick={() => { setViewYear(y); setYearPickerOpen(false); }}
                  className={`py-1 text-xs rounded-lg font-medium transition-all
                    ${y === viewYear
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-gray-700 dark:text-gray-300"
                    }`}
                >
                  {y}
                </button>
              ))}
            </div>
          )}

          {/* ── Calendar grid ── */}
          {!yearPickerOpen && (
            <div className="px-3 pb-3">
              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 mb-1">
                {DAYS.map(d => (
                  <div key={d} className="text-center text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase py-1">
                    {d}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-y-0.5">
                {/* Empty leading cells */}
                {Array.from({ length: firstDow }).map((_, i) => (
                  <div key={`e${i}`} />
                ))}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const ymd = toYMD(viewYear, viewMonth, day);
                  const isSelected = ymd === value;
                  const isToday = ymd === todayYMD;
                  const disabled = isDisabled(day);

                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={disabled}
                      onClick={() => selectDay(day)}
                      className={`
                        relative flex items-center justify-center h-8 w-full rounded-lg text-sm font-medium transition-all
                        ${isSelected
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/30"
                          : isToday
                            ? "bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-bold"
                            : "text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400"
                        }
                        ${disabled ? "opacity-30 cursor-not-allowed pointer-events-none" : ""}
                      `}
                    >
                      {day}
                      {/* Today indicator dot */}
                      {isToday && !isSelected && (
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-500" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700/60">
                <button
                  type="button"
                  onClick={() => { onChange(""); setOpen(false); }}
                  className="text-xs font-semibold text-gray-400 dark:text-gray-500 hover:text-red-400 transition-colors px-1"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewYear(today.getFullYear());
                    setViewMonth(today.getMonth() + 1);
                    if (!max || todayYMD <= max) {
                      onChange(todayYMD);
                      setOpen(false);
                    }
                  }}
                  className="text-xs font-semibold text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors px-1"
                >
                  Today
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
