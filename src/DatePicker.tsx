import React, { useState, useRef, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, X } from "lucide-react";

interface DatePickerProps {
  value: string;          // "YYYY-MM-DD" or ""
  onChange: (val: string) => void;
  max?: string;
  min?: string;
  placeholder?: string;
  error?: boolean;
  icon?: React.ReactNode;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_LABELS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function parseYMD(s: string) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

function toYMD(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function formatDisplay(ymd: string) {
  const p = parseYMD(ymd);
  if (!p) return "";
  return `${MONTHS[p.m - 1]} ${p.d}, ${p.y}`;
}

export default function DatePicker({
  value, onChange, max, min,
  placeholder = "Select date",
  error = false,
  icon,
}: DatePickerProps) {
  const today = new Date();
  const todayYMD = toYMD(today.getFullYear(), today.getMonth() + 1, today.getDate());

  const [open, setOpen] = useState(false);
  const [yearMode, setYearMode] = useState(false);

  const parsed = parseYMD(value);
  const [viewYear, setViewYear]   = useState(parsed?.y ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.m ?? today.getMonth() + 1);

  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false); setYearMode(false);
      }
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open]);

  const handleOpen = () => {
    const p = parseYMD(value);
    if (p) { setViewYear(p.y); setViewMonth(p.m); }
    else { setViewYear(today.getFullYear()); setViewMonth(today.getMonth() + 1); }
    setYearMode(false);
    setOpen(o => !o);
  };

  const prevMonth = useCallback(() =>
    setViewMonth(m => { if (m === 1) { setViewYear(y => y - 1); return 12; } return m - 1; }), []);
  const nextMonth = useCallback(() =>
    setViewMonth(m => { if (m === 12) { setViewYear(y => y + 1); return 1; } return m + 1; }), []);

  const firstDow   = new Date(viewYear, viewMonth - 1, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();

  const selectDay = (day: number) => {
    onChange(toYMD(viewYear, viewMonth, day));
    setOpen(false); setYearMode(false);
  };

  const isDayDisabled = (day: number) => {
    const ymd = toYMD(viewYear, viewMonth, day);
    if (max && ymd > max) return true;
    if (min && ymd < min) return true;
    return false;
  };

  // Year grid: past 80 years up to current year
  const maxYear = max ? parseInt(max.slice(0, 4)) : today.getFullYear();
  const minYear = min ? parseInt(min.slice(0, 4)) : maxYear - 100;
  const yearRange: number[] = [];
  for (let y = maxYear; y >= minYear; y--) yearRange.push(y);

  return (
    <div ref={containerRef} className="relative">
      {/* ── Trigger ── */}
      <button
        type="button"
        onClick={handleOpen}
        className={[
          "w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left text-sm font-medium transition-all",
          "bg-white dark:bg-gray-800",
          error
            ? "border-red-400 ring-2 ring-red-200 dark:ring-red-900/40"
            : open
              ? "border-indigo-500 ring-2 ring-indigo-500/20 dark:ring-indigo-500/20"
              : "border-gray-300 dark:border-gray-600 hover:border-indigo-400 dark:hover:border-indigo-500",
        ].join(" ")}
      >
        <span className="shrink-0 text-gray-400 dark:text-gray-500 text-base leading-none">
          {icon ?? "🎂"}
        </span>
        <span className={`flex-1 ${value ? "text-gray-900 dark:text-gray-100" : "text-gray-400 dark:text-gray-500"}`}>
          {formatDisplay(value) || placeholder}
        </span>
        <span className="flex items-center gap-1">
          {value && (
            <span
              role="button"
              onClick={e => { e.stopPropagation(); onChange(""); }}
              className="p-0.5 text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors rounded cursor-pointer"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown size={15} className={`text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <div className={[
          "absolute z-[300] top-full mt-2",
          "w-[320px]",          // fixed compact width — does NOT stretch
          "bg-white dark:bg-gray-900",
          "border border-gray-200 dark:border-gray-700",
          "rounded-2xl shadow-2xl overflow-hidden",
          // position: prefer left-align; flip right if needed
          "left-0",
        ].join(" ")}>

          {/* ── Header ── */}
          <div className="flex items-center px-4 pt-4 pb-2 gap-1">
            {!yearMode && (
              <button
                type="button"
                onClick={prevMonth}
                className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
            )}

            <button
              type="button"
              onClick={() => setYearMode(y => !y)}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
            >
              <span className="font-bold text-sm text-gray-900 dark:text-white">
                {MONTHS[viewMonth - 1]} {viewYear}
              </span>
              <ChevronDown
                size={13}
                className={`text-indigo-500 dark:text-indigo-400 transition-transform duration-200 ${yearMode ? "rotate-180" : ""}`}
              />
            </button>

            {!yearMode && (
              <button
                type="button"
                onClick={nextMonth}
                className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            )}
          </div>

          {/* ── Year grid ── */}
          {yearMode && (
            <div className="px-4 pb-3 grid grid-cols-4 gap-1 max-h-52 overflow-y-auto pretty-scrollbar">
              {yearRange.map(y => (
                <button
                  key={y}
                  type="button"
                  onClick={() => { setViewYear(y); setYearMode(false); }}
                  className={[
                    "py-1.5 text-xs rounded-lg font-semibold transition-all",
                    y === viewYear
                      ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/30"
                      : "text-gray-600 dark:text-gray-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 hover:text-indigo-600 dark:hover:text-indigo-400",
                  ].join(" ")}
                >
                  {y}
                </button>
              ))}
            </div>
          )}

          {/* ── Calendar grid ── */}
          {!yearMode && (
            <div className="px-4 pb-4">
              {/* Day-of-week row */}
              <div className="grid grid-cols-7 mb-1">
                {DAY_LABELS.map(d => (
                  <div key={d} className="text-center py-1 text-[11px] font-bold text-gray-400 dark:text-gray-600 uppercase tracking-wide">
                    {d}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-y-1">
                {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day  = i + 1;
                  const ymd  = toYMD(viewYear, viewMonth, day);
                  const isSel     = ymd === value;
                  const isToday   = ymd === todayYMD;
                  const disabled  = isDayDisabled(day);

                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={disabled}
                      onClick={() => selectDay(day)}
                      className={[
                        "relative flex items-center justify-center h-9 w-full rounded-xl text-[13px] font-medium transition-all",
                        isSel
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/25 scale-105"
                          : isToday
                            ? "text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-900/30"
                            : disabled
                              ? "text-gray-300 dark:text-gray-700 cursor-not-allowed"
                              : "text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400",
                      ].join(" ")}
                    >
                      {day}
                      {isToday && !isSel && (
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-500" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => { onChange(""); setOpen(false); }}
                  className="text-xs font-semibold text-gray-400 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-400 transition-colors"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewYear(today.getFullYear());
                    setViewMonth(today.getMonth() + 1);
                    if (!max || todayYMD <= max) { onChange(todayYMD); setOpen(false); }
                  }}
                  className="text-xs font-semibold text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
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
