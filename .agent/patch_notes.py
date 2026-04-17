#!/usr/bin/env python3
"""Apply all Notes module UI/UX upgrades atomically across TeamNotesView, PersonalNotesTab."""
import re, pathlib

ROOT = pathlib.Path("src")

# ══════════════════════════════════════════════════════════════════════════════
# ── TeamNotesView.tsx ─────────────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════
p = ROOT / "TeamNotesView.tsx"
c = p.read_text()
orig = len(c)

# 1. Page header: bolder title, gradient icon, "New Note" button premium style
c = c.replace(
    '      <div className="flex items-start justify-between mb-5 gap-3 flex-wrap">\n        <div>\n          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">\n            <NotebookPen size={20} className="text-indigo-500" /> Notes\n          </h2>\n          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 max-w-[220px] leading-snug">',
    '      <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">\n        <div>\n          <h2 className="text-xl font-extrabold tracking-tight text-gray-900 dark:text-white flex items-center gap-2.5">\n            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm shadow-indigo-500/30"><NotebookPen size={16} className="text-white" /></span> Notes\n          </h2>\n          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-[260px] leading-snug">',
    1
)

# 2. New Note button: bigger, shadow, pill style
c = c.replace(
    '          className={`flex items-center gap-2 px-4 py-2 text-white text-sm font-semibold rounded-xl transition-all shadow-sm ${\n            activeTab === "personal"\n              ? "bg-amber-500 hover:bg-amber-400"\n              : "bg-indigo-600 hover:bg-indigo-500"\n          }`}',
    '          className={`flex items-center gap-2 px-5 py-2.5 text-white text-sm font-semibold rounded-xl transition-all shadow-md ${\n            activeTab === "personal"\n              ? "bg-amber-500 hover:bg-amber-400 shadow-amber-500/25"\n              : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/25"\n          }`}',
    1
)

# 3. Tab switcher: wider pills, better container
c = c.replace(
    '      <div className="flex items-center gap-1.5 mb-6 p-1 bg-gray-100 dark:bg-gray-800/80 rounded-2xl w-fit">',
    '      <div className="flex items-center gap-1 mb-6 p-1 bg-gray-100/80 dark:bg-gray-800/80 rounded-2xl w-fit border border-gray-200/50 dark:border-gray-700/50 backdrop-blur-sm">',
    1
)
c = c.replace(
    '          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${\n            activeTab === "personal"\n              ? "bg-gradient-to-r from-amber-500 to-amber-400 text-white shadow-md shadow-amber-500/20"\n              : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"\n          }`}',
    '          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${\n            activeTab === "personal"\n              ? "bg-gradient-to-r from-amber-500 to-orange-400 text-white shadow-md shadow-amber-500/25"\n              : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/5"\n          }`}',
    1
)
c = c.replace(
    '          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${\n            activeTab === "team"\n              ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20"\n              : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"\n          }`}',
    '          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${\n            activeTab === "team"\n              ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25"\n              : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/5"\n          }`}',
    1
)

# 4. Search bar: better focus ring, pill shape
c = c.replace(
    '                className="w-full pl-8 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"\n              />\n            </div>\n\n            {/* Category filter */}',
    '                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/80 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all"\n              />\n            </div>\n\n            {/* Category filter */}',
    1
)
# Category dropdown button
c = c.replace(
    '                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"\n              >\n                {currentCatLabel}{" "}',
    '                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/80 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"\n              >\n                {currentCatLabel}{" "}',
    1
)

# 5. NoteCard — container: hover lift, shadow
c = c.replace(
    '      className={`group relative rounded-2xl border transition-all hover:shadow-md cursor-pointer ${\n        note.pinned\n          ? "border-indigo-300 dark:border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/10"\n          : "border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/50"\n      }`}',
    '      className={`group relative rounded-2xl border transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer ${\n        note.pinned\n          ? "border-indigo-300 dark:border-indigo-600/70 bg-indigo-50/60 dark:bg-indigo-900/15 shadow-sm"\n          : "border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-800/60 hover:border-indigo-200 dark:hover:border-indigo-800/50"\n      }`}',
    1
)

# 6. NoteCard avatar border
c = c.replace(
    '            <img src={note.authorPhoto} className="w-8 h-8 rounded-full object-cover shrink-0 border-2 border-indigo-400/30" alt="" />\n          ) : (\n            <div className="w-8 h-8 rounded-full shrink-0 bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">',
    '            <img src={note.authorPhoto} className="w-9 h-9 rounded-full object-cover shrink-0 ring-2 ring-indigo-400/20 ring-offset-1 ring-offset-white dark:ring-offset-gray-800" alt="" />\n          ) : (\n            <div className="w-9 h-9 rounded-full shrink-0 bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">',
    1
)

# 7. NoteCard author name + date
c = c.replace(
    '            <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{note.authorName}</p>\n            <p className="text-[10px] text-gray-400">\n              {relTime(note.createdAt)}{note.updatedAt && (new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 2000) ? " · edited" : ""}\n            </p>',
    '            <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{note.authorName}</p>\n            <p className="text-[10px] text-gray-400 mt-0.5">\n              {relTime(note.createdAt)}{note.updatedAt && (new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 2000) ? " · edited" : ""}\n            </p>',
    1
)

# 8. NoteCard title: indigo hover
c = c.replace(
    '          className="text-sm font-bold text-gray-900 dark:text-white mb-1.5 leading-snug cursor-pointer hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"',
    '          className="text-sm font-bold text-gray-900 dark:text-white mb-2 leading-snug cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"',
    1
)

# 9. NoteCard footer: divider + bolder like button
c = c.replace(
    '          <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50">',
    '          <div className="flex items-center gap-0.5 mt-4 pt-3 border-t border-gray-100 dark:border-gray-700/40">',
    1
)
c = c.replace(
    '              (note.likes ?? []).includes(userId)\n                ? "text-rose-500"\n                : "text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"\n            }`}',
    '              (note.likes ?? []).includes(userId)\n                ? "text-rose-500 bg-rose-50 dark:bg-rose-900/20"\n                : "text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"\n            }`}',
    1
)

# 10. NoteCard View Full button: eye icon highlight
c = c.replace(
    '          <button onClick={() => onView(note)} title="View full note"\n            className="p-1.5 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all">',
    '          <button onClick={() => onView(note)} title="View full note"\n            className="p-1.5 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all group-hover:text-indigo-400">',
    1
)

# 11. Empty state: gradient icon bg + more breathing room
c = c.replace(
    '              <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mb-4">\n                <NotebookPen size={28} className="text-indigo-400" />\n              </div>\n              <p className="text-base font-semibold text-gray-700 dark:text-gray-300">',
    '              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-900/30 dark:to-violet-900/20 flex items-center justify-center mb-5 shadow-inner">\n                <NotebookPen size={32} className="text-indigo-500 dark:text-indigo-400" />\n              </div>\n              <p className="text-base font-bold text-gray-800 dark:text-gray-200">',
    1
)
c = c.replace(
    '                  className="mt-4 flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-all"',
    '                  className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-all shadow-md shadow-indigo-500/25"',
    1
)

# 12. NoteFormModal header: gradient top strip + glass icon
c = c.replace(
    '        {/* Header */}\n        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/10">\n          <div className="flex items-center gap-2">\n            <NotebookPen size={16} className="text-indigo-500" />\n            <span className="text-sm font-bold text-gray-900 dark:text-white">\n              {initial ? "Edit Note" : "New Team Note"}\n            </span>\n            {/* Dirty indicator dot */}\n            {isDirty && (\n              <span\n                className="w-2 h-2 rounded-full bg-amber-400 shrink-0"\n                title="Unsaved changes"\n              />\n            )}\n          </div>\n          <button\n            onClick={handleCloseAttempt}\n            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-all"\n            title="Close"\n          >\n            <X size={15} />\n          </button>\n        </div>',
    '        {/* Header — indigo gradient top strip */}\n        <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 px-5 py-4 flex items-center justify-between">\n          <div className="flex items-center gap-2.5">\n            <span className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center"><NotebookPen size={14} className="text-white" /></span>\n            <span className="text-sm font-bold text-white tracking-tight">\n              {initial ? "Edit Note" : "New Team Note"}\n            </span>\n            {isDirty && (\n              <span className="w-2 h-2 rounded-full bg-amber-300 shrink-0 shadow-sm shadow-amber-300/50" title="Unsaved changes" />\n            )}\n          </div>\n          <button\n            onClick={handleCloseAttempt}\n            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/20 hover:bg-white/30 text-white transition-all"\n            title="Close"\n          >\n            <X size={14} />\n          </button>\n        </div>',
    1
)

# 13. NoteFormModal footer: Save button shadow
c = c.replace(
    '            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"',
    '            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-indigo-500/30"',
    1
)

# 14. TeamNoteViewModal — header gradient + larger avatar
c = c.replace(
    '    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>\n      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 overflow-hidden" onClick={e => e.stopPropagation()}>\n        {/* Header — single row: [avatar][name+date][spacer][tags][X] */}\n        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100 dark:border-white/10">',
    '    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>\n      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 overflow-hidden" onClick={e => e.stopPropagation()}>\n        {/* Header — gradient strip + avatar + meta */}\n        <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 px-5 py-4 flex items-center gap-3">',
    1
)
# Update avatar within view modal to white ring
c = c.replace(
    '          <img src={note.authorPhoto} className="w-9 h-9 rounded-full object-cover shrink-0 border-2 border-indigo-400/30" alt="" />\n          ) : (\n            <div className="w-9 h-9 rounded-full shrink-0 bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">',
    '          <img src={note.authorPhoto} className="w-10 h-10 rounded-full object-cover shrink-0 ring-2 ring-white/40 ring-offset-1 ring-offset-indigo-600" alt="" />\n          ) : (\n            <div className="w-10 h-10 rounded-full shrink-0 bg-white/20 flex items-center justify-center text-white text-xs font-bold">',
    1
)
# Name + date text → white
c = c.replace(
    '            <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight truncate">{note.authorName}</p>\n            <p className="text-[11px] text-gray-400 mt-0.5 truncate">',
    '            <p className="text-sm font-bold text-white leading-tight truncate">{note.authorName}</p>\n            <p className="text-[11px] text-white/70 mt-0.5 truncate">',
    1
)
# Tag pills → frosted glass
c = c.replace(
    '            <span title={cfg.label} className={`shrink-0 aspect-square flex items-center justify-center w-7 h-7 rounded-full border ${cfg.cls}`}>',
    '            <span title={cfg.label} className="shrink-0 aspect-square flex items-center justify-center w-7 h-7 rounded-full bg-white/20 text-white border border-white/20">',
    1
)
c = c.replace(
    '              <span title="Pinned" className="shrink-0 aspect-square flex items-center justify-center w-7 h-7 rounded-full text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-700">',
    '              <span title="Pinned" className="shrink-0 aspect-square flex items-center justify-center w-7 h-7 rounded-full bg-white/20 text-white border border-white/20">',
    1
)
# Close button → glass
c = c.replace(
    '          <button onClick={onClose} className="ml-2 p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-all shrink-0" title="Close">',
    '          <button onClick={onClose} className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg bg-white/20 hover:bg-white/30 text-white transition-all shrink-0" title="Close">',
    1
)
# Body title bigger
c = c.replace(
    '          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-3 leading-snug">{note.title}</h2>\n          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words leading-relaxed">{note.body}</p>',
    '          <h2 className="text-lg font-extrabold text-gray-900 dark:text-white mb-3 leading-snug tracking-tight">{note.title}</h2>\n          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words leading-relaxed">{note.body}</p>',
    1
)
# Footer like button larger
c = c.replace(
    '            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border transition-all shrink-0 ${\n              (note.likes ?? []).includes(userId)\n                ? "text-rose-600 bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800"\n                : "text-gray-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 border-gray-200 dark:border-gray-700"\n            }`}',
    '            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border transition-all shrink-0 ${\n              (note.likes ?? []).includes(userId)\n                ? "text-rose-600 bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-700"\n                : "text-gray-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 border-gray-200 dark:border-gray-700"\n            }`}',
    1
)

p.write_text(c)
print(f"TeamNotesView.tsx: {orig} → {len(c)} bytes ({len(c)-orig:+d})")


# ══════════════════════════════════════════════════════════════════════════════
# ── PersonalNotesTab.tsx ──────────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════
p = ROOT / "PersonalNotesTab.tsx"
c = p.read_text()
orig = len(c)

# 1. PersonalNoteCard: hover lift + better border
c = c.replace(
    '      className={`group relative rounded-2xl border transition-all hover:shadow-md cursor-pointer ${\n        note.pinned\n          ? "border-amber-300 dark:border-amber-600 bg-amber-50/60 dark:bg-amber-900/10"\n          : "border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/50"\n      }`}',
    '      className={`group relative rounded-2xl border transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer ${\n        note.pinned\n          ? "border-amber-300 dark:border-amber-600/70 bg-amber-50/70 dark:bg-amber-900/15 shadow-sm"\n          : "border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-800/60 hover:border-amber-200 dark:hover:border-amber-800/40"\n      }`}',
    1
)

# 2. Category badge: slightly more prominent
c = c.replace(
    '          <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.cls}`}>\n            {cfg.icon} {cfg.label}\n          </span>\n          <span className="text-[10px] text-gray-400">\n            {relTime(note.createdAt)}{note.updatedAt && (new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 2000) ? " · edited" : ""}\n          </span>',
    '          <span className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${cfg.cls}`}>\n            {cfg.icon} {cfg.label}\n          </span>\n          <span className="text-[10px] text-gray-400 ml-auto">\n            {relTime(note.createdAt)}{note.updatedAt && (new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 2000) ? " · edited" : ""}\n          </span>',
    1
)

# 3. Title: amber-600 hover, slightly bigger mb
c = c.replace(
    '          className="text-sm font-bold text-gray-900 dark:text-white mb-1.5 leading-snug cursor-pointer hover:text-amber-600 dark:hover:text-amber-400 transition-colors"',
    '          className="text-sm font-bold text-gray-900 dark:text-white mb-2 leading-snug cursor-pointer hover:text-amber-600 dark:hover:text-amber-400 transition-colors"',
    1
)

# 4. Action row: mt-4, nicer separator
c = c.replace(
    '        <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50">',
    '        <div className="flex items-center justify-end gap-0.5 mt-4 pt-3 border-t border-gray-100 dark:border-gray-700/40">',
    1
)

# 5. Empty state: gradient bg + bolder
c = c.replace(
    '          <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-4">\n            <Lock size={28} className="text-amber-400" />\n          </div>\n          <p className="text-base font-semibold text-gray-700 dark:text-gray-300">',
    '          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/20 flex items-center justify-center mb-5 shadow-inner">\n            <Lock size={32} className="text-amber-500 dark:text-amber-400" />\n          </div>\n          <p className="text-base font-bold text-gray-800 dark:text-gray-200">',
    1
)
c = c.replace(
    '            className="mt-4 flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold rounded-xl transition-all"',
    '            className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold rounded-xl transition-all shadow-md shadow-amber-500/25"',
    1
)

# 6. Search bar: consistent with team tab
c = c.replace(
    '            className="w-full pl-8 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 transition"',
    '            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/80 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-400 transition-all"',
    1
)
# Category dropdown button
c = c.replace(
    '            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"',
    '            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/80 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"',
    1
)

# 7. PersonalNoteFormModal header: warm amber gradient top strip
c = c.replace(
    '        {/* Header */}\n        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/10">\n          <div className="flex items-center gap-2">\n            <Lock size={15} className="text-amber-500" />\n            <span className="text-sm font-bold text-gray-900 dark:text-white">\n              {initial ? "Edit Personal Note" : "New Personal Note"}\n            </span>\n            {isDirty && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Unsaved changes" />}\n          </div>\n          <button onClick={handleCloseAttempt}\n            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-all" title="Close">\n            <X size={15} />\n          </button>\n        </div>',
    '        {/* Header — amber gradient top strip */}\n        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-400 px-5 py-4 flex items-center justify-between">\n          <div className="flex items-center gap-2.5">\n            <span className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center"><Lock size={13} className="text-white" /></span>\n            <span className="text-sm font-bold text-white tracking-tight">\n              {initial ? "Edit Personal Note" : "New Personal Note"}\n            </span>\n            {isDirty && <span className="w-2 h-2 rounded-full bg-white/80 shrink-0 shadow-sm" title="Unsaved changes" />}\n          </div>\n          <button onClick={handleCloseAttempt}\n            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/20 hover:bg-white/30 text-white transition-all" title="Close">\n            <X size={14} />\n          </button>\n        </div>',
    1
)

# 8. Private notice banner: softer
c = c.replace(
    '        <div className="flex items-center gap-2 mx-5 mt-4 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 text-xs text-amber-700 dark:text-amber-400">',
    '        <div className="flex items-center gap-2 mx-5 mt-4 px-3.5 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40 text-xs font-medium text-amber-700 dark:text-amber-300">',
    1
)

# 9. Form footer: Save button bigger + shadow
c = c.replace(
    '            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-400 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"',
    '            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-400 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-amber-500/30"',
    1
)

# 10. PersonalNoteViewModal header → amber gradient
c = c.replace(
    '        {/* Header */}\n        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/10">\n          <div className="flex items-center gap-2 min-w-0">',
    '        {/* Header — amber gradient */}\n        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-400 px-5 py-4 flex items-center gap-2 min-w-0">',
    1
)
# Category badge → glass
c = c.replace(
    '            <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${cfg.cls}`}>\n              {cfg.icon} {cfg.label}\n            </span>',
    '            <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/20 text-white border border-white/20 shrink-0">\n              {cfg.icon} {cfg.label}\n            </span>',
    1
)
# Pinned badge → glass
c = c.replace(
    '              <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-700 px-2 py-0.5 rounded-full shrink-0">\n                <Pin size={9} /> Pinned\n              </span>',
    '              <span className="flex items-center gap-1 text-[10px] font-bold text-white bg-white/20 border border-white/20 px-2.5 py-1 rounded-full shrink-0">\n                <Pin size={9} /> Pinned\n              </span>',
    1
)
# Timestamp → white
c = c.replace(
    '            <span className="text-[10px] text-gray-400 ml-1 shrink-0">\n              {relTime(note.createdAt)}{note.updatedAt && (new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 2000) ? " · edited" : ""}\n            </span>\n          </div>\n          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-all shrink-0 ml-2" title="Close">',
    '            <span className="text-[10px] text-white/70 ml-1 shrink-0">\n              {relTime(note.createdAt)}{note.updatedAt && (new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 2000) ? " · edited" : ""}\n            </span>\n          <button onClick={onClose} className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg bg-white/20 hover:bg-white/30 text-white transition-all shrink-0" title="Close">',
    1
)
# View modal body title bolder
c = c.replace(
    '          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-3 leading-snug">{note.title}</h2>\n          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words leading-relaxed">{note.body}</p>',
    '          <h2 className="text-lg font-extrabold text-gray-900 dark:text-white mb-3 leading-snug tracking-tight">{note.title}</h2>\n          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words leading-relaxed">{note.body}</p>',
    1
)

p.write_text(c)
print(f"PersonalNotesTab.tsx: {orig} → {len(c)} bytes ({len(c)-orig:+d})")
print("Done! Notes module patched.")
