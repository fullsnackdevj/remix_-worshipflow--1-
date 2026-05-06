/**
 * TeamTemplatesModal
 * Lets leaders create, edit, and delete "Team Templates" — saved musician
 * lineups that can be applied to any event in one click from the event form.
 *
 * Firestore path: team_templates/<id>
 */

import React, { useState, useEffect, useCallback } from "react";
import { db } from "./firebase";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, query,
} from "firebase/firestore";
import { ScheduleMember, Member } from "./types";
import {
  X, Plus, Pencil, Trash2, Check, Users, ChevronRight, Loader2, Music2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TeamTemplate {
  id: string;
  name: string;
  musicians: ScheduleMember[];
  createdAt: number;
  updatedAt: number;
}

interface Props {
  onClose: () => void;
  allMembers: Member[];
  onToast: (msg: string, type?: "success" | "error") => void;
}

const INSTRUMENTALIST_ROLES = [
  "Drummer", "Bassist", "Rhythm Guitar", "Lead Guitar", "Keys / Pianist",
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function TeamTemplatesModal({ onClose, allMembers, onToast }: Props) {
  const [templates, setTemplates] = useState<TeamTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formMusicians, setFormMusicians] = useState<ScheduleMember[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Role picker for multi-role members
  const [pendingRolePick, setPendingRolePick] = useState<{ m: Member; roles: string[] } | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "team_templates"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() } as TeamTemplate)));
    } catch (err: any) {
      console.error("[TeamTemplates] Fetch failed:", err?.code, err?.message);
      // Don't toast on load error — it's silently fine if collection doesn't exist yet
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  // Lock background scroll while modal is open — use overscrollBehavior instead
  // of overflow:hidden so inner scrollable containers still work on iOS.
  useEffect(() => {
    document.body.setAttribute("data-modal-open", "1");
    document.body.style.overscrollBehavior = "none";
    const mainEl = document.querySelector("main") as HTMLElement | null;
    if (mainEl) mainEl.style.overscrollBehavior = "none";
    return () => {
      document.body.removeAttribute("data-modal-open");
      document.body.style.overscrollBehavior = "";
      if (mainEl) mainEl.style.overscrollBehavior = "";
    };
  }, []);

  // ── Form helpers ───────────────────────────────────────────────────────────

  const openCreate = () => {
    setFormName("");
    setFormMusicians([]);
    setMemberSearch("");
    setPendingRolePick(null);
    setEditingId(null);
    setView("form");
  };

  const openEdit = (t: TeamTemplate) => {
    setFormName(t.name);
    setFormMusicians([...t.musicians]);
    setMemberSearch("");
    setPendingRolePick(null);
    setEditingId(t.id);
    setView("form");
  };

  const cancelForm = () => {
    setView("list");
    setEditingId(null);
    setPendingRolePick(null);
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!formName.trim()) { onToast("Template name is required.", "error"); return; }
    if (formMusicians.length === 0) { onToast("Add at least one musician.", "error"); return; }
    setSaving(true);

    // Sanitize: Firestore rejects undefined AND local blob/data-URL photos
    // Only keep real remote URLs (https://...) — local blob/data URLs cause invalid-argument
    const safePhoto = (raw: string | undefined | null) => {
      if (!raw) return "";
      if (raw.startsWith("blob:") || raw.startsWith("data:")) return "";
      return raw;
    };

    const sanitizedMusicians = formMusicians.map(mu => ({
      memberId: mu.memberId,
      name: mu.name,
      role: mu.role,
      photo: safePhoto(mu.photo),
    }));

    console.log("[TeamTemplates] Saving:", formName.trim(), sanitizedMusicians);

    try {
      if (editingId) {
        await updateDoc(doc(db, "team_templates", editingId), {
          name: formName.trim(),
          musicians: sanitizedMusicians,
          updatedAt: Date.now(),
        });
        onToast(`"${formName.trim()}" updated!`, "success");
      } else {
        await addDoc(collection(db, "team_templates"), {
          name: formName.trim(),
          musicians: sanitizedMusicians,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        onToast(`"${formName.trim()}" created!`, "success");
      }
      setView("list");
      setEditingId(null);
      fetchTemplates().catch(console.error);
    } catch (err: any) {
      console.error("[TeamTemplates] Save failed:", err?.code, err?.message, err);
      const detail = err?.code ? ` (${err.code})` : "";
      onToast(`Could not save template${detail}. Try again.`, "error");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async (t: TeamTemplate) => {
    setDeleting(t.id);
    setConfirmDeleteId(null);
    try {
      await deleteDoc(doc(db, "team_templates", t.id));
      setTemplates(prev => prev.filter(x => x.id !== t.id));
      onToast(`"${t.name}" deleted.`, "success");
    } catch (err: any) {
      console.error("[TeamTemplates] Delete failed:", err?.code, err?.message, err);
      onToast("Could not delete template.", "error");
    } finally {
      setDeleting(null);
    }
  };

  // ── Musician candidates ────────────────────────────────────────────────────

  const muCandidates = allMembers.filter(m => {
    const allRoles: string[] = ((m as any).roles || []);
    const hasMuRole = allRoles.some(r => INSTRUMENTALIST_ROLES.includes(r));
    const alreadyAdded = formMusicians.some(mu => mu.memberId === m.id);
    const matchSearch = !memberSearch.trim() ||
      m.name.toLowerCase().includes(memberSearch.toLowerCase());
    return hasMuRole && !alreadyAdded && matchSearch;
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: "92dvh" }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="shrink-0 bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Users size={18} className="text-white" />
            </div>
            <div>
              <h2 className="font-extrabold text-white text-base leading-tight tracking-tight">
                {view === "list" ? "Team Templates" : editingId ? "Edit Template" : "New Template"}
              </h2>
              <p className="text-white/60 text-xs mt-0.5">
                {view === "list"
                  ? "Reusable musician lineups for events"
                  : "Save a musician lineup to reuse in events"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 text-white transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>

          {/* ── LIST VIEW ────────────────────────────────────────────────── */}
          {view === "list" && (
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                  {templates.length} Template{templates.length !== 1 ? "s" : ""}
                </p>
                <button
                  onClick={openCreate}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-bold hover:from-violet-500 hover:to-indigo-500 transition-all shadow-lg shadow-violet-500/20"
                >
                  <Plus size={13} />
                  Create Template
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={24} className="animate-spin text-indigo-400" />
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                    <Music2 size={28} className="text-gray-300 dark:text-gray-600" />
                  </div>
                  <p className="font-semibold text-gray-500 dark:text-gray-400 text-sm">No templates yet</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Create a template to quickly assign musicians to events.
                  </p>
                  <button
                    onClick={openCreate}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-bold hover:from-violet-500 hover:to-indigo-500 transition-all"
                  >
                    <Plus size={13} /> Create First Template
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {templates.map(t => (
                    <div key={t.id} className="rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-white/[0.08] hover:border-indigo-200 dark:hover:border-indigo-700/50 transition-all overflow-hidden group">

                      {/* Card row */}
                      <div className="flex items-start gap-3 p-4">
                        {/* Icon */}
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
                          <Users size={16} className="text-white" />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-900 dark:text-white text-sm truncate">{t.name}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            {t.musicians.length} musician{t.musicians.length !== 1 ? "s" : ""}
                          </p>
                          {/* Member avatar chips */}
                          <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                            {t.musicians.map((mu, i) => {
                              const livePhoto = mu.photo || allMembers.find(m => m.id === mu.memberId)?.photo || "";
                              return (
                                <div
                                  key={i}
                                  title={`${mu.name} — ${mu.role}`}
                                  className="flex items-center gap-1.5 bg-white dark:bg-gray-800 border border-indigo-100 dark:border-indigo-700/40 rounded-full pl-0.5 pr-2.5 py-0.5 shadow-sm"
                                >
                                  {livePhoto
                                    ? <img src={livePhoto} alt={mu.name} className="w-5 h-5 rounded-full object-cover shrink-0" />
                                    : <div className="w-5 h-5 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-[8px] font-bold shrink-0">{mu.name[0]}</div>
                                  }
                                  <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 max-w-[72px] truncate">{mu.name.split(" ")[0]}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEdit(t)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-800/50 text-indigo-500 transition-all"
                            title="Edit"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(confirmDeleteId === t.id ? null : t.id)}
                            disabled={deleting === t.id}
                            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all disabled:opacity-50 ${
                              confirmDeleteId === t.id
                                ? "bg-red-500 text-white"
                                : "bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-400"
                            }`}
                            title="Delete"
                          >
                            {deleting === t.id
                              ? <Loader2 size={13} className="animate-spin" />
                              : <Trash2 size={13} />
                            }
                          </button>
                        </div>

                        {/* Chevron */}
                        <ChevronRight
                          size={14}
                          className="text-gray-300 dark:text-gray-600 shrink-0 self-center cursor-pointer"
                          onClick={() => openEdit(t)}
                        />
                      </div>

                      {/* ── Inline delete confirmation banner ── */}
                      {confirmDeleteId === t.id && (
                        <div className="border-t border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-950/40 px-4 py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-red-700 dark:text-red-400 flex items-center gap-1.5">
                              <Trash2 size={11} />
                              Delete this template?
                            </p>
                            <p className="text-[10px] text-red-500/80 dark:text-red-400/60 mt-0.5 truncate">
                              "{t.name}" will be permanently removed.
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleDelete(t)}
                              disabled={deleting === t.id}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-red-500 hover:bg-red-600 active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-60 shadow-sm shadow-red-500/30"
                            >
                              {deleting === t.id
                                ? <Loader2 size={11} className="animate-spin" />
                                : <Trash2 size={11} />
                              }
                              Confirm Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── FORM VIEW ──────────────────────────────────────────────────── */}
          {view === "form" && (
            <div className="p-5 space-y-5">

              {/* Template name */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                  Template Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder='e.g. "Sunday Service Musicians"'
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
                />
              </div>

              {/* Selected musicians */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">
                  Musicians in this Template
                </label>

                {formMusicians.length === 0 ? (
                  <div className="flex items-center gap-2 p-4 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/40">
                    <Music2 size={14} />
                    <span>No musicians added yet — pick from the list below</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {formMusicians.map((mu, i) => {
                      const livePhoto = mu.photo || allMembers.find(m => m.id === mu.memberId)?.photo || "";
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-3 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-700/40 rounded-xl px-3 py-2.5"
                        >
                          {livePhoto
                            ? <img src={livePhoto} className="w-9 h-9 rounded-full object-cover shrink-0 ring-2 ring-white dark:ring-gray-800" alt="" />
                            : <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0 ring-2 ring-white dark:ring-gray-800">{mu.name[0]}</div>
                          }
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm text-gray-900 dark:text-white truncate">{mu.name}</p>
                            <p className="text-[11px] text-indigo-500 dark:text-indigo-400 font-medium truncate">{mu.role}</p>
                          </div>
                          <button
                            onClick={() => setFormMusicians(prev => prev.filter((_, j) => j !== i))}
                            className="w-6 h-6 flex items-center justify-center rounded-full text-gray-300 dark:text-gray-600 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0 transition-all"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Member search + picker */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">
                  Add Musicians
                </label>
                <input
                  type="text"
                  value={memberSearch}
                  onChange={e => setMemberSearch(e.target.value)}
                  placeholder="Search musicians…"
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400 mb-2"
                />

                <div
                  className="space-y-0.5 overflow-y-auto pr-1"
                  style={{
                    maxHeight: window.innerWidth < 640 ? "40vh" : "13rem",
                    WebkitOverflowScrolling: "touch",
                    touchAction: "pan-y",
                    overscrollBehavior: "contain",
                  }}
                >
                  {muCandidates.map(m => {
                    const allRoles: string[] = ((m as any).roles || []).filter((r: string) => r.trim());
                    const instrumentRoles = allRoles.filter(r => INSTRUMENTALIST_ROLES.includes(r));
                    const memberRoles = instrumentRoles.length > 0 ? instrumentRoles : allRoles;
                    const isPending = pendingRolePick?.m.id === m.id;
                    return (
                      <div key={m.id}>
                        <button
                          type="button"
                          onClick={() => {
                            if (memberRoles.length <= 1) {
                              setFormMusicians(prev => [...prev, {
                                memberId: m.id, name: m.name, photo: m.photo || "", role: memberRoles[0] || "Musician",
                              }]);
                              setPendingRolePick(null);
                            } else {
                              setPendingRolePick(isPending ? null : { m, roles: memberRoles });
                            }
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${isPending ? "bg-indigo-50 dark:bg-indigo-900/30" : "hover:bg-gray-50 dark:hover:bg-gray-700/60"}`}
                        >
                          {m.photo
                            ? <img src={m.photo} className="w-9 h-9 rounded-full object-cover shrink-0 ring-2 ring-white dark:ring-gray-800" alt="" />
                            : <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-400 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0 ring-2 ring-white dark:ring-gray-800">{m.name[0]}</div>
                          }
                          <div className="flex-1 text-left min-w-0">
                            <p className="font-bold text-sm truncate text-gray-900 dark:text-white">{m.name}</p>
                            <p className="text-[11px] text-gray-400 truncate">{memberRoles.join(", ") || "Musician"}</p>
                          </div>
                          {memberRoles.length > 1
                            ? <span className="text-[10px] text-indigo-400 shrink-0 font-medium">{isPending ? "▲ pick role" : "▼ pick role"}</span>
                            : <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0"><Plus size={13} className="text-indigo-500" /></div>
                          }
                        </button>

                        {isPending && (
                          <div className="px-2.5 pb-2 pt-1 flex flex-wrap gap-1.5">
                            {pendingRolePick!.roles.map(role => (
                              <button
                                key={role}
                                type="button"
                                onClick={() => {
                                  setFormMusicians(prev => [...prev, {
                                    memberId: m.id, name: m.name, photo: m.photo || "", role,
                                  }]);
                                  setPendingRolePick(null);
                                }}
                                className="px-2.5 py-1 text-[11px] font-medium rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors border border-indigo-200 dark:border-indigo-700"
                              >
                                {role}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {muCandidates.length === 0 && (
                    <p className="text-xs text-gray-400 italic px-2 py-3">
                      {memberSearch.trim() ? "No matches found." : "All musicians with instrument roles are already added."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        {view === "form" && (
          <div className="shrink-0 border-t border-gray-100 dark:border-white/[0.08] px-5 py-4 flex gap-3">
            <button
              onClick={cancelForm}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-bold hover:from-violet-500 hover:to-indigo-500 transition-all shadow-lg shadow-violet-500/20 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {saving
                ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
                : <><Check size={15} /> {editingId ? "Update Template" : "Save Template"}</>
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
