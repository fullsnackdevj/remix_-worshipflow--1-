import React, { useState, useRef, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, X, Clock } from "lucide-react";

interface DateTimePickerProps {
  /** "YYYY-MM-DDTHH:mm" (datetime-local format) or "" */
  value: string;
  onChange: (val: string) => void;
  min?: string;   // "YYYY-MM-DDTHH:mm"
  placeholder?: string;
  label?: string;
  icon?: React.ReactNode;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_LABELS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function parseVal(s: string) {
  if (!s) return null;
  // Accept both "YYYY-MM-DDTHH:mm" and "YYYY-MM-DD HH:mm"
  const [datePart, timePart] = s.split(/[T ]/);
  if (!datePart || !timePart) return null;
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm]  = timePart.split(":").map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d) || isNaN(hh) || isNaN(mm)) return null;
  return { y, m, d, hh, mm };
}

function toYMD(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}

function formatDisplay(s: string) {
  const p = parseVal(s);
  if (!p) return "";
  const h12  = p.hh % 12 || 12;
  const ampm = p.hh >= 12 ? "PM" : "AM";
  const mm   = String(p.mm).padStart(2, "0");
  return `${MONTHS[p.m - 1]} ${p.d}, ${p.y}  ·  ${h12}:${mm} ${ampm}`;
}

export default function DateTimePicker({
  value, onChange, min,
  placeholder = "Select date & time",
  label,
  icon,
}: DateTimePickerProps) {
  const now    = new Date();
  const today  = toYMD(now.getFullYear(), now.getMonth() + 1, now.getDate());

  const [open, setOpen]         = useState(false);
  const [yearMode, setYearMode] = useState(false);
  const [openUp, setOpenUp]     = useState(false); // flip above trigger when space below is tight

  const parsed = parseVal(value);
  const [viewYear,  setViewYear]  = useState(parsed?.y  ?? now.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.m  ?? now.getMonth() + 1);
  const [selDate,   setSelDate]   = useState(parsed ? toYMD(parsed.y, parsed.m, parsed.d) : "");
  // time state in 24h
  const [selHour,   setSelHour]   = useState(parsed?.hh ?? now.getHours());
  const [selMin,    setSelMin]    = useState(parsed?.mm ?? 0);

  const containerRef = useRef<HTMLDivElement>(null);

  // Sync inbound value → local state
  useEffect(() => {
    const p = parseVal(value);
    if (p) {
      setSelDate(toYMD(p.y, p.m, p.d));
      setSelHour(p.hh);
      setSelMin(p.mm);
      setViewYear(p.y);
      setViewMonth(p.m);
    } else {
      setSelDate("");
    }
  }, [value]);

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

  const emit = useCallback((date: string, hh: number, mm: number) => {
    if (!date) return;
    onChange(`${date}T${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`);
  }, [onChange]);

  const handleOpen = () => {
    const p = parseVal(value);
    if (p) { setViewYear(p.y); setViewMonth(p.m); }
    else   { setViewYear(now.getFullYear()); setViewMonth(now.getMonth() + 1); }
    setYearMode(false);

    // ── Smart flip: open upward if not enough space below ──
    if (containerRef.current) {
      const rect       = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const DROPDOWN_H = 430; // approximate dropdown pixel height
      setOpenUp(spaceBelow < DROPDOWN_H && spaceAbove > spaceBelow);
    }

    setOpen(o => !o);
  };

  const prevMonth = () => setViewMonth(m => { if (m === 1) { setViewYear(y => y - 1); return 12; } return m - 1; });
  const nextMonth = () => setViewMonth(m => { if (m === 12) { setViewYear(y => y + 1); return 1; } return m + 1; });

  const firstDow    = new Date(viewYear, viewMonth - 1, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();

  const selectDay = (day: number) => {
    const d = toYMD(viewYear, viewMonth, day);
    setSelDate(d);
    emit(d, selHour, selMin);
    // keep open so user can adjust time
  };

  // Detect date disabled by min
  const isDayDisabled = (day: number) => {
    if (!min) return false;
    const ymd = toYMD(viewYear, viewMonth, day);
    return ymd < min.slice(0, 10);
  };

  // hour picker (0–23), shown as 12h
  const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
  const MINS     = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,10,...55

  const setHour24 = (h: number) => { setSelHour(h); emit(selDate, h, selMin); };
  const setMin5   = (m: number) => { setSelMin(m);  emit(selDate, selHour, m); };

  const fmt12 = (h: number) => { const h12 = h % 12 || 12; return String(h12).padStart(2,"0"); };

  // Year range: current year ± 10
  const maxYear  = now.getFullYear() + 5;
  const minYear  = now.getFullYear() - 1;
  const yearRange: number[] = [];
  for (let y = maxYear; y >= minYear; y--) yearRange.push(y);

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">
          {label}
        </label>
      )}

      {/* ── Trigger ── */}
      <button
        type="button"
        onClick={handleOpen}
        className={[
          "w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left text-sm font-medium transition-all",
          "bg-white dark:bg-gray-800/80",
          open
            ? "border-amber-500 ring-2 ring-amber-500/20"
            : "border-gray-300 dark:border-gray-600 hover:border-amber-400 dark:hover:border-amber-500",
        ].join(" ")}
      >
        <span className="shrink-0 text-amber-500 text-base leading-none">
          {icon ?? <Clock size={15} />}
        </span>
        <span className={`flex-1 ${value ? "text-gray-900 dark:text-gray-100" : "text-gray-400 dark:text-gray-500"} text-xs`}>
          {formatDisplay(value) || placeholder}
        </span>
        <span className="flex items-center gap-1">
          {value && (
            <span
              role="button"
              onClick={e => { e.stopPropagation(); onChange(""); setSelDate(""); }}
              className="p-0.5 text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors rounded cursor-pointer"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <div className={[
          "absolute z-[400]",
          openUp ? "bottom-full mb-2" : "top-full mt-2",
          "w-full min-w-[300px] max-w-[360px]",
          "bg-gray-900 border border-gray-700",
          "rounded-2xl shadow-2xl overflow-hidden",
        ].join(" ")}>

          {/* ── Calendar Header ── */}
          <div className="flex items-center px-4 pt-4 pb-2 gap-1">
            {!yearMode && (
              <button type="button" onClick={prevMonth}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors">
                <ChevronLeft size={15} />
              </button>
            )}
            <button type="button" onClick={() => setYearMode(y => !y)}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl hover:bg-gray-800 transition-colors">
              <span className="font-bold text-sm text-white">{MONTHS[viewMonth - 1]} {viewYear}</span>
              <ChevronDown size={12} className={`text-amber-400 transition-transform duration-200 ${yearMode ? "rotate-180" : ""}`} />
            </button>
            {!yearMode && (
              <button type="button" onClick={nextMonth}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors">
                <ChevronRight size={15} />
              </button>
            )}
          </div>

          {/* ── Year grid ── */}
          {yearMode && (
            <div className="px-4 pb-3 grid grid-cols-4 gap-1 max-h-40 overflow-y-auto">
              {yearRange.map(y => (
                <button key={y} type="button"
                  onClick={() => { setViewYear(y); setYearMode(false); }}
                  className={[
                    "py-1.5 text-xs rounded-lg font-semibold transition-all",
                    y === viewYear
                      ? "bg-amber-500 text-white shadow-sm"
                      : "text-gray-400 hover:bg-gray-800 hover:text-amber-400",
                  ].join(" ")}
                >{y}</button>
              ))}
            </div>
          )}

          {/* ── Calendar grid ── */}
          {!yearMode && (
            <div className="px-4">
              {/* Day-of-week row */}
              <div className="grid grid-cols-7 mb-1">
                {DAY_LABELS.map(d => (
                  <div key={d} className="text-center py-1 text-[11px] font-bold text-gray-600 uppercase tracking-wide">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-y-1">
                {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day  = i + 1;
                  const ymd  = toYMD(viewYear, viewMonth, day);
                  const isSel    = ymd === selDate;
                  const isToday  = ymd === today;
                  const disabled = isDayDisabled(day);
                  return (
                    <button key={day} type="button" disabled={disabled}
                      onClick={() => selectDay(day)}
                      className={[
                        "relative flex items-center justify-center h-9 w-full rounded-xl text-[13px] font-medium transition-all",
                        isSel
                          ? "bg-amber-500 text-white shadow-md shadow-amber-500/30 scale-105"
                          : isToday
                            ? "text-amber-400 font-bold bg-amber-500/10"
                            : disabled
                              ? "text-gray-700 cursor-not-allowed"
                              : "text-gray-300 hover:bg-gray-800 hover:text-amber-400",
                      ].join(" ")}
                    >
                      {day}
                      {isToday && !isSel && (
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Time Picker ── */}
          <div className="mx-4 mt-3 mb-1 pt-3 border-t border-gray-800">
            <div className="flex items-center gap-1.5 mb-2">
              <Clock size={11} className="text-amber-400" />
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Time</p>
            </div>
            <div className="flex gap-2">
              {/* Hour scroll */}
              <div className="flex-1">
                <p className="text-[9px] text-gray-600 uppercase font-bold tracking-wider mb-1 text-center">Hour</p>
                <div className="h-28 overflow-y-auto rounded-xl bg-gray-800/60 border border-gray-700/60 no-scrollbar">
                  {HOURS_24.map(h => (
                    <button key={h} type="button" onClick={() => setHour24(h)}
                      className={[
                        "w-full py-1.5 text-xs font-semibold text-center transition-all",
                        h === selHour
                          ? "bg-amber-500 text-white"
                          : "text-gray-400 hover:bg-gray-700 hover:text-amber-400",
                      ].join(" ")}
                    >
                      {fmt12(h)} {h >= 12 ? "PM" : "AM"}
                    </button>
                  ))}
                </div>
              </div>
              {/* Minute scroll */}
              <div className="flex-1">
                <p className="text-[9px] text-gray-600 uppercase font-bold tracking-wider mb-1 text-center">Minute</p>
                <div className="h-28 overflow-y-auto rounded-xl bg-gray-800/60 border border-gray-700/60 no-scrollbar">
                  {MINS.map(m => (
                    <button key={m} type="button" onClick={() => setMin5(m)}
                      className={[
                        "w-full py-1.5 text-xs font-semibold text-center transition-all",
                        m === selMin
                          ? "bg-amber-500 text-white"
                          : "text-gray-400 hover:bg-gray-700 hover:text-amber-400",
                      ].join(" ")}
                    >
                      :{String(m).padStart(2,"0")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="flex items-center justify-between px-4 py-3 mt-1 border-t border-gray-800">
            <button type="button"
              onClick={() => { onChange(""); setSelDate(""); setOpen(false); }}
              className="text-xs font-semibold text-gray-600 hover:text-red-400 transition-colors">
              Clear
            </button>
            <button type="button"
              disabled={!selDate}
              onClick={() => { if (selDate) { emit(selDate, selHour, selMin); setOpen(false); } }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed">
              Confirm
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
