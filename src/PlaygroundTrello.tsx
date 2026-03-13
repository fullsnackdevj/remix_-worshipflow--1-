import { useState, useEffect, useCallback, useRef } from "react";
import {
  LayoutGrid, Plus, X, ChevronLeft, MoreHorizontal, Check,
  Trash2, Archive, Edit2, Calendar, Users, Tag, AlignLeft,
  CheckSquare, Settings, ArrowRight, Flag, Hash, ToggleLeft,
  ChevronDown, Search, AlertTriangle
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type FieldType = "text" | "number" | "dropdown" | "checkbox";
interface CustomFieldDef { id: string; name: string; type: FieldType; options?: string[]; }
interface Label { id: string; name: string; color: string; }
interface ChecklistItem { id: string; text: string; done: boolean; }
interface Checklist { id: string; title: string; items: ChecklistItem[]; }
interface Board { id: string; title: string; color: string; description: string; archived: boolean; customFieldDefs: CustomFieldDef[]; }
interface PgList { id: string; boardId: string; title: string; pos: number; archived: boolean; }
interface Card { id: string; boardId: string; listId: string; title: string; description: string; pos: number; members: string[]; labels: Label[]; dueDate: string | null; checklists: Checklist[]; customFields: Record<string, any>; archived: boolean; createdAt?: string; }

interface Props { allMembers?: any[]; onToast: (t: "success" | "error", m: string) => void; }

const API = import.meta.env.DEV ? "http://localhost:8888/api" : "/api";
const uid = () => Math.random().toString(36).slice(2, 10);

const LABEL_COLORS = [
  { bg: "bg-red-500", name: "Red" }, { bg: "bg-orange-500", name: "Orange" },
  { bg: "bg-yellow-400", name: "Yellow" }, { bg: "bg-green-500", name: "Green" },
  { bg: "bg-blue-500", name: "Blue" }, { bg: "bg-purple-500", name: "Purple" },
  { bg: "bg-pink-500", name: "Pink" }, { bg: "bg-gray-500", name: "Gray" },
];

const BOARD_COLORS = ["#6366f1","#8b5cf6","#ec4899","#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#0284c7","#64748b"];

// ── API helpers ───────────────────────────────────────────────────────────────
const apiFetch = (path: string, opts?: RequestInit) =>
  fetch(`${API}${path}`, { headers: { "Content-Type": "application/json" }, ...opts });

// ════════════════════════════════════════════════════════════════════════════
// CARD DETAIL MODAL
// ════════════════════════════════════════════════════════════════════════════
function CardModal({ card, lists, boards, allMembers, customFieldDefs, onClose, onSave, onDelete, onArchive, onMove, onToast }:
  { card: Card; lists: PgList[]; boards: Board[]; allMembers: any[]; customFieldDefs: CustomFieldDef[]; onClose: () => void; onSave: (c: Card) => void; onDelete: (id: string) => void; onArchive: (id: string) => void; onMove: () => void; onToast: Props["onToast"]; }) {
  const [c, setC] = useState<Card>({ ...card });
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"details" | "checklists" | "custom">("details");
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [newItems, setNewItems] = useState<Record<string, string>>({});
  const [labelSearch, setLabelSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0].bg);

  const save = async (partial: Partial<Card>) => {
    const updated = { ...c, ...partial };
    setC(updated);
    setSaving(true);
    try {
      await apiFetch(`/playground/cards/${card.id}`, { method: "PUT", body: JSON.stringify(partial) });
      onSave(updated);
    } catch { onToast("error", "Failed to save"); }
    finally { setSaving(false); }
  };

  const totalItems = c.checklists.reduce((s, cl) => s + cl.items.length, 0);
  const doneItems = c.checklists.reduce((s, cl) => s + cl.items.filter(i => i.done).length, 0);

  const addChecklist = () => {
    if (!newChecklistTitle.trim()) return;
    const cl: Checklist = { id: uid(), title: newChecklistTitle.trim(), items: [] };
    const updated = [...c.checklists, cl];
    setNewChecklistTitle("");
    save({ checklists: updated });
  };

  const toggleItem = (clId: string, itemId: string) => {
    const updated = c.checklists.map(cl => cl.id === clId ? { ...cl, items: cl.items.map(i => i.id === itemId ? { ...i, done: !i.done } : i) } : cl);
    save({ checklists: updated });
  };

  const addItem = (clId: string) => {
    const text = newItems[clId]?.trim();
    if (!text) return;
    const updated = c.checklists.map(cl => cl.id === clId ? { ...cl, items: [...cl.items, { id: uid(), text, done: false }] } : cl);
    setNewItems(p => ({ ...p, [clId]: "" }));
    save({ checklists: updated });
  };

  const deleteChecklist = (clId: string) => save({ checklists: c.checklists.filter(cl => cl.id !== clId) });
  const deleteItem = (clId: string, itemId: string) => save({ checklists: c.checklists.map(cl => cl.id === clId ? { ...cl, items: cl.items.filter(i => i.id !== itemId) } : cl) });

  const addLabel = () => {
    if (!newLabelName.trim()) return;
    const lbl: Label = { id: uid(), name: newLabelName.trim(), color: newLabelColor };
    save({ labels: [...c.labels, lbl] });
    setNewLabelName("");
  };

  const removeLabel = (id: string) => save({ labels: c.labels.filter(l => l.id !== id) });

  const addMember = (name: string) => {
    if (c.members.includes(name)) return;
    save({ members: [...c.members, name] });
    setMemberSearch("");
  };

  const removeMember = (name: string) => save({ members: c.members.filter(m => m !== name) });

  const setCustomField = (defId: string, val: any) => {
    const updated = { ...c.customFields, [defId]: val };
    save({ customFields: updated });
  };

  const filteredMembers = memberSearch ? allMembers.filter(m => m.name?.toLowerCase().includes(memberSearch.toLowerCase()) && !c.members.includes(m.name)) : allMembers.filter(m => !c.members.includes(m.name)).slice(0, 5);

  const isOverdue = c.dueDate && new Date(c.dueDate) < new Date();

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-12 overflow-y-auto" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#1a1d2e] rounded-2xl w-full max-w-2xl shadow-2xl border border-white/10 flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-white/10">
          <AlignLeft size={18} className="text-gray-400 mt-1 shrink-0" />
          <div className="flex-1">
            <input
              className="w-full bg-transparent text-white font-bold text-lg focus:outline-none focus:bg-white/5 rounded px-1 -ml-1"
              value={c.title}
              onChange={e => setC(p => ({ ...p, title: e.target.value }))}
              onBlur={() => save({ title: c.title })}
            />
            <p className="text-xs text-gray-500 mt-0.5">in list <span className="text-gray-400">{lists.find(l => l.id === c.listId)?.title}</span></p>
          </div>
          <div className="flex items-center gap-1">
            {saving && <span className="text-xs text-gray-500">Saving…</span>}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white rounded-lg"><X size={18} /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3">
          {(["details","checklists","custom"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${tab === t ? "bg-indigo-500/20 text-indigo-300" : "text-gray-400 hover:text-white"}`}>
              {t === "custom" ? "Custom Fields" : t}
            </button>
          ))}
        </div>

        <div className="flex gap-4 p-5 overflow-y-auto max-h-[65vh]">
          {/* Main content */}
          <div className="flex-1 space-y-5">
            {tab === "details" && <>
              {/* Description */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Description</p>
                <textarea value={c.description} onChange={e => setC(p => ({ ...p, description: e.target.value }))}
                  onBlur={() => save({ description: c.description })}
                  rows={4} placeholder="Add a description…"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none" />
              </div>

              {/* Due Date */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"><Calendar size={12} /> Due Date</p>
                <input type="date" value={c.dueDate ?? ""} onChange={e => save({ dueDate: e.target.value || null })}
                  className={`bg-white/5 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 ${isOverdue ? "border-red-500/60 text-red-400" : "border-white/10 text-gray-200"}`} />
                {isOverdue && <p className="text-xs text-red-400 mt-1 flex items-center gap-1"><AlertTriangle size={11} /> Overdue</p>}
              </div>

              {/* Labels */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"><Tag size={12} /> Labels</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {c.labels.map(l => (
                    <span key={l.id} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold text-white ${l.color}`}>
                      {l.name} <button onClick={() => removeLabel(l.id)}><X size={10} /></button>
                    </span>
                  ))}
                </div>
                <button onClick={() => setShowLabelPicker(p => !p)} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><Plus size={12} /> Add Label</button>
                {showLabelPicker && (
                  <div className="mt-2 bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
                    <input value={newLabelName} onChange={e => setNewLabelName(e.target.value)} placeholder="Label name…" className="w-full bg-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none" />
                    <div className="flex flex-wrap gap-1.5">
                      {LABEL_COLORS.map(lc => (
                        <button key={lc.bg} onClick={() => setNewLabelColor(lc.bg)}
                          className={`w-6 h-6 rounded-full ${lc.bg} ${newLabelColor === lc.bg ? "ring-2 ring-white" : ""}`} title={lc.name} />
                      ))}
                    </div>
                    <button onClick={addLabel} className="w-full py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs rounded-lg font-semibold">Add</button>
                  </div>
                )}
              </div>

              {/* Members */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"><Users size={12} /> Members</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {c.members.map(m => (
                    <span key={m} className="flex items-center gap-1 bg-white/10 text-gray-200 text-xs px-2 py-0.5 rounded-full">
                      {m} <button onClick={() => removeMember(m)}><X size={10} /></button>
                    </span>
                  ))}
                </div>
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Search members…"
                    className="w-full pl-7 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
                </div>
                {(memberSearch || filteredMembers.length > 0) && (
                  <div className="mt-1 bg-[#12141f] border border-white/10 rounded-xl overflow-hidden max-h-32 overflow-y-auto">
                    {filteredMembers.map(m => (
                      <button key={m.id} onClick={() => addMember(m.name)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left">
                        {m.photo ? <img src={m.photo} className="w-5 h-5 rounded-full object-cover" alt="" /> : <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-[9px] text-white font-bold">{m.name?.[0]}</div>}
                        <span className="text-xs text-gray-300">{m.name}</span>
                      </button>
                    ))}
                    {memberSearch && !allMembers.find(m => m.name?.toLowerCase() === memberSearch.toLowerCase()) && (
                      <button onClick={() => { addMember(memberSearch); setMemberSearch(""); }} className="w-full px-3 py-2 text-xs text-indigo-400 hover:bg-white/5 text-left">
                        + Add "{memberSearch}" as free text
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>}

            {tab === "checklists" && (
              <div className="space-y-4">
                {totalItems > 0 && (
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span className="flex items-center gap-1"><CheckSquare size={11} /> Progress</span>
                      <span>{doneItems}/{totalItems}</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${totalItems ? (doneItems / totalItems) * 100 : 0}%` }} />
                    </div>
                  </div>
                )}
                {c.checklists.map(cl => (
                  <div key={cl.id} className="bg-white/5 border border-white/10 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-white">{cl.title}</p>
                      <button onClick={() => deleteChecklist(cl.id)} className="text-gray-500 hover:text-red-400"><Trash2 size={13} /></button>
                    </div>
                    <div className="space-y-1.5 mb-2">
                      {cl.items.map(item => (
                        <div key={item.id} className="flex items-center gap-2">
                          <button onClick={() => toggleItem(cl.id, item.id)}
                            className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${item.done ? "bg-indigo-500 border-indigo-500" : "border-gray-500 hover:border-indigo-400"}`}>
                            {item.done && <Check size={9} className="text-white" />}
                          </button>
                          <span className={`text-xs flex-1 ${item.done ? "line-through text-gray-500" : "text-gray-300"}`}>{item.text}</span>
                          <button onClick={() => deleteItem(cl.id, item.id)} className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100"><X size={11} /></button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input value={newItems[cl.id] ?? ""} onChange={e => setNewItems(p => ({ ...p, [cl.id]: e.target.value }))}
                        onKeyDown={e => e.key === "Enter" && addItem(cl.id)}
                        placeholder="Add item…" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
                      <button onClick={() => addItem(cl.id)} className="px-2.5 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs"><Plus size={12} /></button>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input value={newChecklistTitle} onChange={e => setNewChecklistTitle(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addChecklist()}
                    placeholder="New checklist title…" className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
                  <button onClick={addChecklist} className="px-3 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-xs font-semibold"><Plus size={14} /></button>
                </div>
              </div>
            )}

            {tab === "custom" && (
              <div className="space-y-3">
                {customFieldDefs.length === 0 && <p className="text-xs text-gray-500 text-center py-4">No custom fields defined for this board. Add them in Board Settings.</p>}
                {customFieldDefs.map(def => (
                  <div key={def.id}>
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 block">{def.name}</label>
                    {def.type === "text" && <input value={c.customFields[def.id] ?? ""} onChange={e => setCustomField(def.id, e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />}
                    {def.type === "number" && <input type="number" value={c.customFields[def.id] ?? ""} onChange={e => setCustomField(def.id, e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />}
                    {def.type === "checkbox" && <button onClick={() => setCustomField(def.id, !c.customFields[def.id])} className={`flex items-center gap-2 text-sm ${c.customFields[def.id] ? "text-indigo-400" : "text-gray-400"}`}><ToggleLeft size={20} /> {c.customFields[def.id] ? "Yes" : "No"}</button>}
                    {def.type === "dropdown" && (
                      <select value={c.customFields[def.id] ?? ""} onChange={e => setCustomField(def.id, e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                        <option value="">— Select —</option>
                        {def.options?.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar actions */}
          <div className="w-36 space-y-2 shrink-0">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Actions</p>
            <button onClick={onMove} className="w-full flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 text-gray-300 text-xs rounded-xl transition-colors"><ArrowRight size={13} /> Move Card</button>
            <button onClick={() => onArchive(card.id)} className="w-full flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-amber-500/20 text-gray-300 hover:text-amber-400 text-xs rounded-xl transition-colors"><Archive size={13} /> Archive</button>
            {card.archived && <button onClick={() => onDelete(card.id)} className="w-full flex items-center gap-2 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs rounded-xl transition-colors"><Trash2 size={13} /> Delete</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MOVE CARD MODAL
// ════════════════════════════════════════════════════════════════════════════
function MoveModal({ card, boards, lists, onClose, onMoved, onToast }:
  { card: Card; boards: Board[]; lists: PgList[]; onClose: () => void; onMoved: () => void; onToast: Props["onToast"]; }) {
  const [destBoard, setDestBoard] = useState(card.boardId);
  const [destList, setDestList] = useState(card.listId);
  const [position, setPosition] = useState<"top" | "bottom">("bottom");
  const [moving, setMoving] = useState(false);
  const availLists = lists.filter(l => l.boardId === destBoard);

  const doMove = async () => {
    setMoving(true);
    try {
      const res = await apiFetch(`/playground/cards/${card.id}/move`, { method: "PATCH", body: JSON.stringify({ boardId: destBoard, listId: destList, position }) });
      if (!res.ok) throw new Error();
      onToast("success", "Card moved!");
      onMoved();
    } catch { onToast("error", "Failed to move"); }
    finally { setMoving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#1a1d2e] rounded-2xl w-full max-w-sm shadow-2xl border border-white/10 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-white">Move Card</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Board</label>
            <select value={destBoard} onChange={e => { setDestBoard(e.target.value); setDestList(""); }} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
              {boards.filter(b => !b.archived).map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">List</label>
            <select value={destList} onChange={e => setDestList(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
              {availLists.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Position</label>
            <select value={position} onChange={e => setPosition(e.target.value as any)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
            </select>
          </div>
        </div>
        <button onClick={doMove} disabled={!destList || moving} className="w-full mt-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
          {moving ? "Moving…" : "Move Card"}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// BOARD SETTINGS MODAL
// ════════════════════════════════════════════════════════════════════════════
function BoardSettings({ board, onClose, onSaved, onArchive, onToast }:
  { board: Board; onClose: () => void; onSaved: (b: Board) => void; onArchive: (id: string) => void; onToast: Props["onToast"]; }) {
  const [title, setTitle] = useState(board.title);
  const [color, setColor] = useState(board.color);
  const [desc, setDesc] = useState(board.description);
  const [defs, setDefs] = useState<CustomFieldDef[]>(board.customFieldDefs ?? []);
  const [saving, setSaving] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<FieldType>("text");
  const [newFieldOptions, setNewFieldOptions] = useState("");

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/playground/boards/${board.id}`, { method: "PUT", body: JSON.stringify({ title, color, description: desc, customFieldDefs: defs }) });
      onSaved({ ...board, title, color, description: desc, customFieldDefs: defs });
      onToast("success", "Board updated!");
    } catch { onToast("error", "Failed to save"); }
    finally { setSaving(false); }
  };

  const addField = () => {
    if (!newFieldName.trim()) return;
    const f: CustomFieldDef = { id: uid(), name: newFieldName.trim(), type: newFieldType, options: newFieldType === "dropdown" ? newFieldOptions.split(",").map(s => s.trim()).filter(Boolean) : undefined };
    setDefs(p => [...p, f]);
    setNewFieldName(""); setNewFieldOptions("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#1a1d2e] rounded-2xl w-full max-w-md shadow-2xl border border-white/10 p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-white flex items-center gap-2"><Settings size={16} /> Board Settings</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Board Name</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Description</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-2 block">Color</label>
            <div className="flex flex-wrap gap-2">
              {BOARD_COLORS.map(bc => <button key={bc} onClick={() => setColor(bc)} className={`w-7 h-7 rounded-full transition-all ${color === bc ? "ring-2 ring-white scale-110" : ""}`} style={{ backgroundColor: bc }} />)}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Custom Fields ({defs.length}/50)</p>
            <div className="space-y-2 mb-3">
              {defs.map(d => (
                <div key={d.id} className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-300 flex-1">{d.name}</span>
                  <span className="text-[10px] text-gray-500 bg-white/10 px-1.5 py-0.5 rounded">{d.type}</span>
                  <button onClick={() => setDefs(p => p.filter(x => x.id !== d.id))} className="text-gray-500 hover:text-red-400"><X size={12} /></button>
                </div>
              ))}
            </div>
            {defs.length < 50 && (
              <div className="space-y-2 bg-white/5 rounded-xl p-3">
                <div className="flex gap-2">
                  <input value={newFieldName} onChange={e => setNewFieldName(e.target.value)} placeholder="Field name…" className="flex-1 bg-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none" />
                  <select value={newFieldType} onChange={e => setNewFieldType(e.target.value as FieldType)} className="bg-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none">
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="dropdown">Dropdown</option>
                    <option value="checkbox">Checkbox</option>
                  </select>
                </div>
                {newFieldType === "dropdown" && <input value={newFieldOptions} onChange={e => setNewFieldOptions(e.target.value)} placeholder="Options (comma separated)…" className="w-full bg-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none" />}
                <button onClick={addField} className="w-full py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-xs rounded-lg font-semibold transition-colors"><Plus size={12} className="inline mr-1" />Add Field</button>
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-2 border-t border-white/10">
            <button onClick={() => onArchive(board.id)} className="flex-1 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-sm rounded-xl transition-colors flex items-center justify-center gap-1.5"><Archive size={14} /> Archive</button>
            <button onClick={save} disabled={saving} className="flex-1 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function PlaygroundTrello({ allMembers = [], onToast }: Props) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [lists, setLists] = useState<PgList[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [activeBoard, setActiveBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [moveCard, setMoveCard] = useState<Card | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [addingCard, setAddingCard] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [addingList, setAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState("");
  const [showNewBoard, setShowNewBoard] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [newBoardColor, setNewBoardColor] = useState(BOARD_COLORS[0]);
  const [listMenuId, setListMenuId] = useState<string | null>(null);
  const cardInputRef = useRef<HTMLInputElement>(null);

  // Fetch boards
  const fetchBoards = useCallback(async () => {
    try { const r = await apiFetch("/playground/boards"); const data = await r.json(); setBoards(data.filter((b: Board) => !b.archived)); }
    catch { onToast("error", "Failed to load boards"); }
  }, []);

  useEffect(() => { fetchBoards(); }, [fetchBoards]);

  // Fetch board data
  const fetchBoardData = useCallback(async (boardId: string) => {
    setLoading(true);
    try {
      const [lr, cr] = await Promise.all([apiFetch(`/playground/boards/${boardId}/lists`), apiFetch(`/playground/boards/${boardId}/cards`)]);
      const [ls, cs] = await Promise.all([lr.json(), cr.json()]);
      setLists(Array.isArray(ls) ? ls : []);
      setCards(Array.isArray(cs) ? cs : []);
    } catch { onToast("error", "Failed to load board"); }
    finally { setLoading(false); }
  }, []);

  const openBoard = (b: Board) => { setActiveBoard(b); fetchBoardData(b.id); };

  const createBoard = async () => {
    if (!newBoardTitle.trim()) return;
    try {
      const r = await apiFetch("/playground/boards", { method: "POST", body: JSON.stringify({ title: newBoardTitle.trim(), color: newBoardColor }) });
      const { id } = await r.json();
      setNewBoardTitle(""); setShowNewBoard(false);
      await fetchBoards();
      const nb: Board = { id, title: newBoardTitle.trim(), color: newBoardColor, description: "", archived: false, customFieldDefs: [] };
      openBoard(nb);
    } catch { onToast("error", "Failed to create board"); }
  };

  const createList = async () => {
    if (!newListTitle.trim() || !activeBoard) return;
    try {
      await apiFetch(`/playground/boards/${activeBoard.id}/lists`, { method: "POST", body: JSON.stringify({ title: newListTitle.trim() }) });
      setNewListTitle(""); setAddingList(false);
      await fetchBoardData(activeBoard.id);
    } catch { onToast("error", "Failed to create list"); }
  };

  const createCard = async (listId: string) => {
    if (!newCardTitle.trim() || !activeBoard) return;
    try {
      await apiFetch("/playground/cards", { method: "POST", body: JSON.stringify({ boardId: activeBoard.id, listId, title: newCardTitle.trim() }) });
      setNewCardTitle(""); setAddingCard(null);
      await fetchBoardData(activeBoard.id);
    } catch { onToast("error", "Failed to create card"); }
  };

  const archiveList = async (listId: string) => {
    try {
      await apiFetch(`/playground/lists/${listId}`, { method: "PUT", body: JSON.stringify({ archived: true }) });
      setListMenuId(null);
      if (activeBoard) await fetchBoardData(activeBoard.id);
    } catch { onToast("error", "Failed to archive list"); }
  };

  const deleteList = async (listId: string) => {
    if (!confirm("Delete this list and all its cards?")) return;
    try {
      await apiFetch(`/playground/lists/${listId}`, { method: "DELETE" });
      setListMenuId(null);
      if (activeBoard) await fetchBoardData(activeBoard.id);
    } catch { onToast("error", "Failed to delete list"); }
  };

  const archiveBoard = async (id: string) => {
    try {
      await apiFetch(`/playground/boards/${id}`, { method: "PUT", body: JSON.stringify({ archived: true }) });
      setShowSettings(false); setActiveBoard(null);
      await fetchBoards();
      onToast("success", "Board archived");
    } catch { onToast("error", "Failed"); }
  };

  const archiveCard = async (id: string) => {
    try {
      await apiFetch(`/playground/cards/${id}`, { method: "PUT", body: JSON.stringify({ archived: true }) });
      setSelectedCard(null);
      if (activeBoard) await fetchBoardData(activeBoard.id);
      onToast("success", "Card archived");
    } catch { onToast("error", "Failed"); }
  };

  const deleteCard = async (id: string) => {
    if (!confirm("Permanently delete this card?")) return;
    try {
      await apiFetch(`/playground/cards/${id}`, { method: "DELETE" });
      setSelectedCard(null);
      if (activeBoard) await fetchBoardData(activeBoard.id);
      onToast("success", "Card deleted");
    } catch { onToast("error", "Failed"); }
  };

  const onCardSaved = (updated: Card) => setCards(prev => prev.map(c => c.id === updated.id ? updated : c));

  // ── Board Home ──────────────────────────────────────────────────────────
  if (!activeBoard) return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg">
            <LayoutGrid size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Boards</h1>
            <p className="text-xs text-gray-400">Playground workspace · Trello-style</p>
          </div>
        </div>
        <button onClick={() => setShowNewBoard(true)} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white rounded-xl font-semibold text-sm shadow transition-all">
          <Plus size={16} /> New Board
        </button>
      </div>

      {showNewBoard && (
        <div className="mb-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <input value={newBoardTitle} onChange={e => setNewBoardTitle(e.target.value)} onKeyDown={e => e.key === "Enter" && createBoard()} autoFocus placeholder="Board name…"
            className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          <div className="flex flex-wrap gap-2">
            {BOARD_COLORS.map(bc => <button key={bc} onClick={() => setNewBoardColor(bc)} className={`w-7 h-7 rounded-full transition-all ${newBoardColor === bc ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : ""}`} style={{ backgroundColor: bc }} />)}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowNewBoard(false)} className="flex-1 py-2 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
            <button onClick={createBoard} className="flex-1 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-semibold">Create</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {boards.map(b => (
          <button key={b.id} onClick={() => openBoard(b)}
            className="aspect-video rounded-2xl flex flex-col justify-between p-4 hover:opacity-90 transition-all shadow-lg hover:shadow-xl hover:scale-[1.02] text-left"
            style={{ background: `linear-gradient(135deg, ${b.color}dd, ${b.color}88)` }}>
            <span className="font-bold text-white text-sm drop-shadow">{b.title}</span>
            {b.description && <span className="text-white/70 text-xs line-clamp-1">{b.description}</span>}
          </button>
        ))}
      </div>
      {boards.length === 0 && !showNewBoard && (
        <div className="text-center py-16">
          <LayoutGrid size={40} className="mx-auto text-gray-200 dark:text-gray-700 mb-3" />
          <p className="text-gray-400">No boards yet. Create one to get started!</p>
        </div>
      )}
    </div>
  );

  // ── Board View ──────────────────────────────────────────────────────────
  const boardCards = cards.filter(c => c.boardId === activeBoard.id && !c.archived);

  return (
    <div className="flex flex-col h-full -mx-4 -mb-4">
      {/* Board header */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ background: `linear-gradient(135deg, ${activeBoard.color}30, transparent)` }}>
        <button onClick={() => { setActiveBoard(null); setLists([]); setCards([]); }} className="p-1.5 text-gray-400 hover:text-white rounded-lg transition-colors"><ChevronLeft size={18} /></button>
        <div className="w-5 h-5 rounded-lg shrink-0" style={{ backgroundColor: activeBoard.color }} />
        <h2 className="font-bold text-gray-900 dark:text-white text-base flex-1">{activeBoard.title}</h2>
        <span className="text-xs text-gray-400">{boardCards.length}/500 cards</span>
        <button onClick={() => setShowSettings(true)} className="p-1.5 text-gray-400 hover:text-white rounded-lg transition-colors"><Settings size={16} /></button>
      </div>

      {/* Kanban columns */}
      {loading ? (
        <div className="flex items-center justify-center flex-1 py-20"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="flex gap-3 overflow-x-auto px-4 pb-4 pt-2 flex-1" onClick={() => setListMenuId(null)}>
          {lists.map(list => {
            const listCards = boardCards.filter(c => c.listId === list.id);
            return (
              <div key={list.id} className="flex-shrink-0 w-64 bg-gray-900/60 dark:bg-gray-950/60 rounded-2xl flex flex-col max-h-full overflow-hidden">
                {/* List header */}
                <div className="flex items-center justify-between px-3 py-2.5 shrink-0">
                  <span className="font-bold text-white text-sm truncate flex-1">{list.title}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500 font-semibold">{listCards.length}</span>
                    <div className="relative" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setListMenuId(listMenuId === list.id ? null : list.id)} className="p-1 text-gray-500 hover:text-white rounded transition-colors"><MoreHorizontal size={14} /></button>
                      {listMenuId === list.id && (
                        <div className="absolute right-0 top-full mt-1 bg-[#1a1d2e] border border-white/10 rounded-xl shadow-xl z-30 min-w-[140px] py-1">
                          <button onClick={() => archiveList(list.id)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-white/5"><Archive size={12} /> Archive List</button>
                          <button onClick={() => deleteList(list.id)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10"><Trash2 size={12} /> Delete List</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto px-2 space-y-2 pb-2">
                  {listCards.map(card => {
                    const totalItems = card.checklists.reduce((s, cl) => s + cl.items.length, 0);
                    const doneItems = card.checklists.reduce((s, cl) => s + cl.items.filter(i => i.done).length, 0);
                    const isOverdue = card.dueDate && new Date(card.dueDate) < new Date();
                    return (
                      <div key={card.id} onClick={() => setSelectedCard(card)}
                        className="bg-[#1a1d2e] border border-white/10 rounded-xl p-3 cursor-pointer hover:border-indigo-500/40 hover:shadow-lg transition-all group">
                        {/* Labels */}
                        {card.labels.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {card.labels.map(l => <span key={l.id} className={`h-2 w-8 rounded-full ${l.color}`} title={l.name} />)}
                          </div>
                        )}
                        <p className="text-sm text-white font-medium leading-snug">{card.title}</p>
                        {/* Card meta */}
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {card.dueDate && <span className={`flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${isOverdue ? "bg-red-500/20 text-red-400" : "bg-white/10 text-gray-400"}`}><Calendar size={9} />{new Date(card.dueDate + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })}</span>}
                          {totalItems > 0 && <span className={`flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${doneItems === totalItems ? "bg-green-500/20 text-green-400" : "bg-white/10 text-gray-400"}`}><CheckSquare size={9} />{doneItems}/{totalItems}</span>}
                          {card.members.length > 0 && <span className="flex items-center gap-0.5 text-[10px] text-gray-500"><Users size={9} />{card.members.length}</span>}
                          {card.description && <AlignLeft size={9} className="text-gray-600" />}
                        </div>
                      </div>
                    );
                  })}

                  {/* Add card */}
                  {addingCard === list.id ? (
                    <div className="space-y-2">
                      <input ref={cardInputRef} value={newCardTitle} onChange={e => setNewCardTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") createCard(list.id); if (e.key === "Escape") { setAddingCard(null); setNewCardTitle(""); } }}
                        autoFocus placeholder="Card title…"
                        className="w-full bg-white/10 border border-indigo-500/50 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none" />
                      <div className="flex gap-1.5">
                        <button onClick={() => createCard(list.id)} className="flex-1 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs rounded-lg font-semibold">Add</button>
                        <button onClick={() => { setAddingCard(null); setNewCardTitle(""); }} className="px-2.5 py-1.5 text-gray-400 hover:text-white bg-white/5 rounded-lg text-xs"><X size={13} /></button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => { setAddingCard(list.id); setNewCardTitle(""); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-xl text-xs transition-colors">
                      <Plus size={13} /> Add a card
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add list */}
          <div className="flex-shrink-0 w-64">
            {addingList ? (
              <div className="bg-gray-900/60 rounded-2xl p-3 space-y-2">
                <input value={newListTitle} onChange={e => setNewListTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") createList(); if (e.key === "Escape") { setAddingList(false); setNewListTitle(""); } }}
                  autoFocus placeholder="List name…"
                  className="w-full bg-white/10 border border-indigo-500/50 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none" />
                <div className="flex gap-1.5">
                  <button onClick={createList} className="flex-1 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs rounded-lg font-semibold">Add List</button>
                  <button onClick={() => { setAddingList(false); setNewListTitle(""); }} className="px-2.5 py-1.5 text-gray-400 hover:text-white bg-white/5 rounded-lg text-xs"><X size={13} /></button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingList(true)} className="w-full flex items-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-2xl text-sm font-medium transition-colors border border-dashed border-white/10 hover:border-white/20">
                <Plus size={16} /> Add a list
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {selectedCard && (
        <CardModal
          card={selectedCard}
          lists={lists}
          boards={boards}
          allMembers={allMembers}
          customFieldDefs={activeBoard.customFieldDefs ?? []}
          onClose={() => setSelectedCard(null)}
          onSave={onCardSaved}
          onDelete={deleteCard}
          onArchive={archiveCard}
          onMove={() => { setMoveCard(selectedCard); setSelectedCard(null); }}
          onToast={onToast}
        />
      )}
      {moveCard && (
        <MoveModal
          card={moveCard}
          boards={boards}
          lists={lists}
          onClose={() => setMoveCard(null)}
          onMoved={async () => { setMoveCard(null); if (activeBoard) await fetchBoardData(activeBoard.id); }}
          onToast={onToast}
        />
      )}
      {showSettings && (
        <BoardSettings
          board={activeBoard}
          onClose={() => setShowSettings(false)}
          onSaved={b => { setActiveBoard(b); setBoards(prev => prev.map(x => x.id === b.id ? b : x)); setShowSettings(false); }}
          onArchive={archiveBoard}
          onToast={onToast}
        />
      )}
    </div>
  );
}
