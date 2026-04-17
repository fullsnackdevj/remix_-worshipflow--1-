#!/usr/bin/env python3
"""Apply all ScheduleView.tsx UI upgrades atomically."""
import re

with open("src/ScheduleView.tsx", "r") as f:
    content = f.read()

original_len = len(content)

# ── 1. Toolbar: mb-4 → mb-5 ────────────────────────────────────────────────
content = content.replace(
    'className="flex items-center justify-between gap-2 mb-4">',
    'className="flex items-center justify-between gap-2 mb-5">',
    1
)

# ── 2. View toggle buttons: font-medium/rounded-lg → font-semibold/rounded-[10px] ─
content = content.replace(
    "px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all ${scheduleView === \"month\"",
    "px-3 py-2 rounded-[10px] text-sm font-semibold transition-all ${scheduleView === \"month\"",
    1
)
content = content.replace(
    "text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white\"}`}>\n            <Calendar",
    "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200\"}`}>\n            <Calendar",
    1
)
content = content.replace(
    "px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all ${scheduleView === \"list\"",
    "px-3 py-2 rounded-[10px] text-sm font-semibold transition-all ${scheduleView === \"list\"",
    1
)
content = content.replace(
    "text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white\"}`}>\n            <List",
    "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200\"}`}>\n            <List",
    1
)

# ── 3. Nav buttons: p-2 → w-9 h-9, month heading font-bold → font-extrabold ─
content = content.replace(
    'className="flex items-center gap-1 sm:gap-2">',
    'className="flex items-center gap-0.5 sm:gap-1">',
    1
)
content = content.replace(
    'className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"><ChevronLeft',
    'className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"><ChevronLeft',
    1
)
content = content.replace(
    'className="font-bold text-gray-900 dark:text-white text-base sm:text-lg min-w-[120px] sm:min-w-[160px] text-center">',
    'className="font-extrabold text-gray-900 dark:text-white text-base sm:text-lg min-w-[120px] sm:min-w-[160px] text-center tracking-tight">',
    1
)
content = content.replace(
    'className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"><ChevronRight',
    'className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"><ChevronRight',
    1
)

# ── 4. Add Event button: py-2 font-medium → py-2.5 font-semibold + shadow ───
content = content.replace(
    'className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-medium transition-colors whitespace-nowrap">',
    'className="flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-semibold transition-all shadow-sm shadow-indigo-500/30 whitespace-nowrap">',
    1
)
content = content.replace(
    'className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed select-none whitespace-nowrap">',
    'className="flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed select-none whitespace-nowrap">',
    1
)

# ── 5. Calendar grid: day headers bolder, cells lighter borders + ring ───────
content = content.replace(
    'className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-700">',
    'className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-700/60">',
    1
)
content = content.replace(
    'className="py-2 text-center text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{d}</div>',
    'className="py-2.5 text-center text-[11px] font-bold text-gray-400 dark:text-gray-600 uppercase tracking-widest">{d}</div>',
    1
)
content = content.replace(
    'className="min-h-[80px] lg:min-h-[110px] border-b border-r border-gray-200 dark:border-gray-700/50" />',
    'className="min-h-[80px] lg:min-h-[110px] border-b border-r border-gray-100 dark:border-gray-700/40" />',
    1
)
content = content.replace(
    '`group relative min-h-[80px] lg:min-h-[110px] border-b border-r border-gray-200 dark:border-gray-700/50 p-1.5 lg:p-2 text-left transition-colors ${isCellPast && !cellHasEvents ? "opacity-40 cursor-not-allowed" : "hover:bg-indigo-50 dark:hover:bg-indigo-900/20"} ${isSelected ? "bg-indigo-50 dark:bg-indigo-900/30" : ""}`}',
    '`group relative min-h-[80px] lg:min-h-[110px] border-b border-r border-gray-100 dark:border-gray-700/40 p-1.5 lg:p-2 text-left transition-all duration-150 ${isCellPast && !cellHasEvents ? "opacity-35 cursor-not-allowed" : "hover:bg-indigo-50/70 dark:hover:bg-indigo-900/20"} ${isSelected ? "bg-indigo-50 dark:bg-indigo-900/30 ring-1 ring-inset ring-indigo-300 dark:ring-indigo-700" : ""}`}',
    1
)
# Today badge
content = content.replace(
    '`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium mb-1 ${isToday ? "bg-indigo-600 text-white" : "text-gray-700 dark:text-gray-300"}`}>{day}</span>',
    '`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold mb-1 transition-colors ${isToday ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/40" : isSelected ? "text-indigo-600 dark:text-indigo-400" : "text-gray-600 dark:text-gray-400"}`}>{day}</span>',
    1
)
# Event dots in calendar: font-medium → font-semibold, gap-0.5 → gap-1
content = content.replace(
    '<div key={ei} className="flex items-center gap-0.5">',
    '<div key={ei} className="flex items-center gap-1">',
    1
)
content = content.replace(
    '`text-[11px] lg:text-xs font-medium truncate leading-tight ${clr.text}`}>{nm}</p>',
    '`text-[11px] lg:text-xs font-semibold truncate leading-tight ${clr.text}`}>{nm}</p>',
    1
)

# ── 6. List view event rows: hover lift, bolder date/title, indigo WL name ──
content = content.replace(
    '`relative flex items-center gap-4 p-4 cursor-pointer group transition-colors ${selectedEventId === s.id ? "bg-indigo-50 dark:bg-indigo-900/30 border-l-4 border-indigo-500" : "bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 border-l-4 border-transparent"}`}',
    '`relative flex items-center gap-4 p-4 cursor-pointer group transition-all duration-150 ${selectedEventId === s.id ? "bg-indigo-50 dark:bg-indigo-900/30 border-l-4 border-indigo-500" : "bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/40 border-l-4 border-transparent hover:shadow-sm"}`}',
    1
)
content = content.replace(
    '`shrink-0 rounded-xl px-3 py-2 text-center min-w-[52px] ${isPast ? "bg-gray-100 dark:bg-gray-700" : "bg-indigo-50 dark:bg-indigo-900/30"}`}',
    '`shrink-0 rounded-xl px-3 py-2.5 text-center min-w-[54px] ${isPast ? "bg-gray-100 dark:bg-gray-700/60" : "bg-indigo-50 dark:bg-indigo-900/30"}`}',
    1
)
content = content.replace(
    '`text-xs font-semibold uppercase ${isPast ? "text-gray-400" : "text-indigo-500"}`}>{d.toLocaleDateString("en", { month: "short" })}</div>',
    '`text-[10px] font-bold uppercase tracking-wider ${isPast ? "text-gray-400" : "text-indigo-500"}`}>{d.toLocaleDateString("en", { month: "short" })}</div>',
    1
)
content = content.replace(
    '`text-xl font-bold leading-none ${isPast ? "text-gray-400 dark:text-gray-500" : "text-indigo-700 dark:text-indigo-300"}`}>{d.getDate()}</div>',
    '`text-xl font-extrabold leading-none my-0.5 ${isPast ? "text-gray-400 dark:text-gray-500" : "text-indigo-700 dark:text-indigo-300"}`}>{d.getDate()}</div>',
    1
)
content = content.replace(
    '`text-[10px] ${isPast ? "text-gray-400" : "text-indigo-400"}`}>{d.toLocaleDateString("en", { weekday: "short" })}</div>',
    '`text-[10px] font-medium ${isPast ? "text-gray-400" : "text-indigo-400"}`}>{d.toLocaleDateString("en", { weekday: "short" })}</div>',
    1
)
content = content.replace(
    '<p className="font-semibold text-gray-900 dark:text-white text-sm">{eventEmoji(evName)} {evName}</p>\n                            {s.worshipLeader && <p className="text-xs text-gray-500 mt-0.5">{s.worshipLeader.name}</p>}',
    '<p className="font-bold text-gray-900 dark:text-white text-sm leading-snug">{eventEmoji(evName)} {evName}</p>\n                            {s.worshipLeader && <p className="text-xs text-indigo-500 dark:text-indigo-400 font-semibold mt-0.5">{s.worshipLeader.name}</p>}',
    1
)

# ── 7. Day panel: remove old wrapper, add gradient header + flex-col ─────────
OLD_DAY_PANEL = '''            return (
              <div className="fixed top-1/2 -translate-y-1/2 left-4 right-4 z-50 md:static md:translate-y-0 md:z-auto md:w-80 md:shrink-0 bg-white dark:bg-gray-800 rounded-2xl md:rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl p-5 max-h-[85dvh] md:max-h-[calc(100vh-200px)] overflow-y-auto md:self-start md:sticky md:top-0">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-base">{dateLabel.split(",")[0]}</h3>
                    <p className="text-xs text-indigo-500 font-medium mt-0.5">{dateLabel}</p>
                  </div>
                  <button onClick={closeScheduleEditor} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"><X size={18} /></button>
                </div>
                <div className="space-y-2 mb-4">'''

NEW_DAY_PANEL = '''            return (
              <div className="fixed top-1/2 -translate-y-1/2 left-4 right-4 z-50 md:static md:translate-y-0 md:z-auto md:w-80 md:shrink-0 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden max-h-[85dvh] md:max-h-[calc(100vh-200px)] md:self-start md:sticky md:top-0 flex flex-col">
                {/* Day panel gradient header */}
                <div className="shrink-0 bg-gradient-to-br from-indigo-600 via-purple-500 to-rose-400 px-5 py-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <h3 className="font-extrabold tracking-tight text-white text-base drop-shadow-sm">{dateLabel.split(",")[0]}</h3>
                      <p className="text-xs text-white/70 font-medium mt-0.5">{dateLabel}</p>
                    </div>
                    <button onClick={closeScheduleEditor} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 text-white transition-all"><X size={16} /></button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-5">
                <div className="space-y-2 mb-4">'''
content = content.replace(OLD_DAY_PANEL, NEW_DAY_PANEL, 1)

# Day panel event list buttons: upgrade hover + label styles
content = content.replace(
    'className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-100 dark:border-gray-700 hover:border-indigo-300 transition-all text-left">',
    'className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-100 dark:border-gray-700/60 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all text-left group">',
    1
)
content = content.replace(
    '<p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{evName}</p>\n                          {ev.worshipLeader && <p className="text-xs text-gray-400 truncate">{ev.worshipLeader.name}</p>}',
    '<p className="text-sm font-bold text-gray-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{evName}</p>\n                          {ev.worshipLeader && <p className="text-xs text-indigo-500 dark:text-indigo-400 font-semibold truncate mt-0.5">{ev.worshipLeader.name}</p>}',
    1
)

# Day panel: close scrollable div + outer div before return end
content = content.replace(
    '''                  <button onClick={() => openBlankEventForm(selectedScheduleDate!)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-sm font-medium transition-colors">
                    <Plus size={16} /> Add Another Event
                  </button>
                )}
              </div>
            );
          }''',
    '''                  <button onClick={() => openBlankEventForm(selectedScheduleDate!)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-indigo-300 dark:border-indigo-600/60 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-sm font-semibold transition-all">
                    <Plus size={16} /> Add Another Event
                  </button>
                )}
                </div>
              </div>
            );
          }''',
    1
)
# The view-only banner in day panel
content = content.replace(
    '''                  <div className="w-full flex items-center gap-2 py-2.5 px-3 border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-xl text-xs font-medium">
                    <Lock size={13} className="shrink-0" />
                    This date has passed — view only
                  </div>
                ) : (
                  <button onClick={() => openBlankEventForm(selectedScheduleDate!)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-sm font-medium transition-colors">
                    <Plus size={16} /> Add Another Event
                  </button>
                )}
                </div>
              </div>
            );
          }''',
    '''                  <div className="w-full flex items-center gap-2 py-2.5 px-3 border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-xl text-xs font-semibold">
                    <Lock size={13} className="shrink-0" />
                    This date has passed — view only
                  </div>
                ) : (
                  <button onClick={() => openBlankEventForm(selectedScheduleDate!)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-indigo-300 dark:border-indigo-600/60 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-sm font-semibold transition-all">
                    <Plus size={16} /> Add Another Event
                  </button>
                )}
                </div>
              </div>
            );
          }''',
    1
)

# ── 8. Event panel: old wrapper → gradient header + flex-col ─────────────────
OLD_EVENT_PANEL = '''          return (
            <div className="fixed top-1/2 -translate-y-1/2 left-4 right-4 z-50 md:static md:translate-y-0 md:z-auto md:w-80 md:shrink-0 bg-white dark:bg-gray-800 rounded-2xl md:rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl p-5 max-h-[85dvh] md:max-h-[calc(100vh-200px)] overflow-y-auto md:self-start md:sticky md:top-0">
              {isDatePast && (
                <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl px-3 py-2 mb-3 text-xs text-amber-700 dark:text-amber-400">
                  <Lock size={13} className="shrink-0" />
                  <span>This date has passed — view only</span>
                </div>
              )}'''
NEW_EVENT_PANEL = '''          return (
            <div className="fixed top-1/2 -translate-y-1/2 left-4 right-4 z-50 md:static md:translate-y-0 md:z-auto md:w-80 md:shrink-0 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden max-h-[85dvh] md:max-h-[calc(100vh-200px)] md:self-start md:sticky md:top-0 flex flex-col">
              {/* Event panel gradient header */}
              <div className="shrink-0 bg-gradient-to-br from-indigo-600 via-purple-500 to-rose-400 px-5 py-4">
                {isDatePast && (
                  <div className="flex items-center gap-1.5 bg-black/20 rounded-xl px-3 py-1.5 mb-3 text-xs text-white/90 font-semibold">
                    <Lock size={12} className="shrink-0" />
                    <span>View only — date has passed</span>
                  </div>
                )}'''
content = content.replace(OLD_EVENT_PANEL, NEW_EVENT_PANEL, 1)

# Back/ack row: old colors → white-on-gradient
content = content.replace(
    '      onClick={() => { setSelectedEventId(null); setSchedPanelMode("view"); }}\n                      className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium transition-colors"',
    '      onClick={() => { setSelectedEventId(null); setSchedPanelMode("view"); }}\n                      className="flex items-center gap-1 text-xs text-white/80 hover:text-white font-semibold transition-colors"',
    1
)
content = content.replace(
    '`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold transition-all ${\n                          iHaveAcked\n                            ? "bg-pink-100 dark:bg-pink-900/40 text-pink-600 dark:text-pink-400"\n                            : "text-gray-400 hover:text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/20"\n                        }`}',
    '`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-all ${\n                          iHaveAcked\n                            ? "bg-white/30 text-white"\n                            : "text-white/60 hover:text-white hover:bg-white/20"\n                        }`}',
    1
)
content = content.replace(
    '<Heart size={16} className={iHaveAcked ? "fill-pink-500 text-pink-500" : ""} />\n                        {ackCount > 0 && <span className="text-sm">{ackCount}</span>}',
    '<Heart size={14} className={iHaveAcked ? "fill-white text-white" : ""} />\n                        {ackCount > 0 && <span>{ackCount}</span>}',
    1
)

# Title row: old gray text → white text
content = content.replace(
    '              <div className="flex items-center justify-between mb-4">\n                <div>\n                  <h3 className="font-bold text-gray-900 dark:text-white text-base">',
    '              <div className="flex items-end justify-between">\n                <div className="min-w-0 flex-1 pr-2">\n                  <h3 className="font-extrabold tracking-tight text-white text-base drop-shadow-sm leading-tight">',
    1
)
content = content.replace(
    '                  <p className="text-xs text-indigo-500 font-medium mt-0.5">\n                    {new Date(selectedScheduleDate + "T00:00:00").toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}\n                  </p>\n                </div>\n                <div className="flex items-center gap-1">',
    '                  <p className="text-xs text-white/70 font-medium mt-0.5">\n                    {new Date(selectedScheduleDate + "T00:00:00").toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}\n                  </p>\n                </div>\n                <div className="flex items-center gap-1 shrink-0">',
    1
)

# Edit/Copy/X buttons: p-1.5 → w-8 h-8 glass buttons
content = content.replace(
    '      className="p-1.5 text-gray-400 hover:text-indigo-500 rounded-lg transition-colors"\n                    >\n                      <Pencil size={16} />\n                    </button>',
    '      className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 text-white transition-all"\n                    >\n                      <Pencil size={15} />\n                    </button>',
    1
)
content = content.replace(
    '}} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"><Copy size={16} /></button>',
    '}} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 text-white transition-all"><Copy size={15} /></button>',
    1
)
content = content.replace(
    '                  <button onClick={closeScheduleEditor} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"><X size={18} /></button>\n                </div>\n              </div>',
    '                  <button onClick={closeScheduleEditor} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 text-white transition-all"><X size={15} /></button>\n                </div>\n              </div>\n              </div>\n              {/* Scrollable panel body */}\n              <div className="flex-1 overflow-y-auto p-5">',
    1
)
# Fix copy navigator typo in original (nnavigator)
content = content.replace("nnavigator.clipboard", "navigator.clipboard", 1)

# ── 9. View mode: role cards with subtle bg, song lineup pill badges ──────────
content = content.replace(
    '                   return (\n                       <>\n                         {editSchedWorshipLeader && (\n                           <div>\n                             <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Worship Leader</p>',
    '                   return (\n                       <>\n                         {editSchedWorshipLeader && (\n                           <div className="rounded-2xl border border-gray-100 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-900/40 p-3.5">\n                             <p className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest mb-2.5">Worship Leader</p>',
    1
)
content = content.replace(
    '                         {editSchedBackupSingers.length > 0 && (\n                           <div>\n                             <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Backup Singers</p>',
    '                         {editSchedBackupSingers.length > 0 && (\n                           <div className="rounded-2xl border border-gray-100 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-900/40 p-3.5">\n                             <p className="text-[10px] font-bold text-pink-500 dark:text-pink-400 uppercase tracking-widest mb-2.5">Backup Singers</p>',
    1
)
content = content.replace(
    '                         {editSchedMusicians.length > 0 && (\n                           <div>\n                             <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Musicians</p>',
    '                         {editSchedMusicians.length > 0 && (\n                           <div className="rounded-2xl border border-gray-100 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-900/40 p-3.5">\n                             <p className="text-[10px] font-bold text-teal-500 dark:text-teal-400 uppercase tracking-widest mb-2.5">Musicians</p>',
    1
)
# Song lineup section
content = content.replace(
    '                         {(editSchedSongLineup.joyful || editSchedSongLineup.solemn) && (\n                           <div>\n                             <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Song Line-Up</p>',
    '                         {(editSchedSongLineup.joyful || editSchedSongLineup.solemn) && (\n                           <div className="rounded-2xl border border-gray-100 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-900/40 p-3.5">\n                             <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2.5">Song Line-Up</p>\n                             <div className="space-y-2">',
    1
)
# Notes section
content = content.replace(
    '                  {editSchedNotes && (\n                    <div>\n                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Notes</p>\n                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{editSchedNotes}</p>\n                    </div>\n                  )}',
    '                  {editSchedNotes && (\n                    <div className="rounded-2xl border border-gray-100 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-900/40 p-3.5">\n                      <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Notes</p>\n                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{editSchedNotes}</p>\n                    </div>\n                  )}',
    1
)

# ── 10. Close the scrollable panel body div before panel end ─────────────────
content = content.replace(
    '                  )}\n                </div>\n              ) : null}\n            </div>\n          );\n        })()}',
    '                  )}\n                </div>\n              ) : null}\n              </div>\n            </div>\n          );\n        })()}',
    1
)

# ── 11. Notify Team button: matching system style ────────────────────────────
content = content.replace(
    '                       <div className="mt-4 space-y-1.5">',
    '                       <div className="mt-5 space-y-2">',
    1
)
content = content.replace(
    '                         onClick={() => setShowEmailPreview(true)}\n                           title="Preview email before sending"\n                           className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-all bg-white dark:bg-gray-700/50"',
    '                         onClick={() => setShowEmailPreview(true)}\n                           title="Preview email before sending"\n                           className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-all bg-white dark:bg-gray-800"',
    1
)
content = content.replace(
    '             : "bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white shadow-sm"',
    '             : "bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white shadow-sm shadow-indigo-500/30"',
    1
)
content = content.replace(
    '                       {onCooldown && (\n                         <p className="text-center text-[11px] text-gray-400">Next notification available in {Math.ceil(24 - hoursSince)}h</p>\n                       )}',
    '                       {onCooldown && (\n                         <p className="text-center text-[11px] font-medium text-gray-400">Next notification available in {Math.ceil(24 - hoursSince)}h</p>\n                       )}',
    1
)

# ── 12. Add Another Event in view panel: font-medium → font-semibold ─────────
content = content.replace(
    '                    className="w-full flex items-center justify-center gap-2 mt-4 py-2.5 border-2 border-dashed border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-sm font-medium transition-colors"',
    '                    className="w-full flex items-center justify-center gap-2 mt-5 py-2.5 border-2 border-dashed border-indigo-300 dark:border-indigo-600/60 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-sm font-semibold transition-all"',
    1
)

# ── 13. Save / Delete buttons: stronger styles ───────────────────────────────
content = content.replace(
    '                      <button onClick={handleSaveSchedule} disabled={isSavingSchedule}\n                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60">',
    '                      <button onClick={handleSaveSchedule} disabled={isSavingSchedule}\n                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-60 shadow-sm shadow-indigo-500/30">',
    1
)
content = content.replace(
    '                        <button onClick={handleDeleteSchedule} className="w-full py-2 text-red-500 hover:text-red-600 text-sm font-medium rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">',
    '                        <button onClick={handleDeleteSchedule} className="w-full py-2 text-red-500 hover:text-red-600 text-sm font-semibold rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">',
    1
)

new_len = len(content)
print(f"Original: {original_len} bytes, New: {new_len} bytes, Delta: {new_len - original_len:+d}")

with open("src/ScheduleView.tsx", "w") as f:
    f.write(content)

print("Done! ScheduleView.tsx patched successfully.")
