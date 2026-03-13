import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, X, ChevronLeft, MoreHorizontal, Check,
  Trash2, Archive, AlignLeft, CheckSquare, Settings,
  ArrowRight, Tag, Users, Calendar, Search, AlertTriangle,
  ToggleLeft, MessageSquare, Paperclip, Eye, LayoutGrid
} from "lucide-react";

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
const apiFetch = (path: string, opts?: RequestInit) => fetch(`${API}${path}`, { headers: { "Content-Type": "application/json" }, ...opts });

const LABEL_COLORS = [
  { bg: "bg-green-500", hex: "#22c55e", name: "Green" },
  { bg: "bg-yellow-400", hex: "#facc15", name: "Yellow" },
  { bg: "bg-orange-500", hex: "#f97316", name: "Orange" },
  { bg: "bg-red-500", hex: "#ef4444", name: "Red" },
  { bg: "bg-purple-500", hex: "#a855f7", name: "Purple" },
  { bg: "bg-blue-500", hex: "#3b82f6", name: "Blue" },
  { bg: "bg-sky-400", hex: "#38bdf8", name: "Sky" },
  { bg: "bg-pink-500", hex: "#ec4899", name: "Pink" },
];

const BOARD_COLORS = ["#0052cc","#026aa7","#017d6d","#4bbf6b","#8b46ff","#cf513d","#e07b3c","#838c91"];

const AVATAR_COLORS = ["#0079bf","#d29034","#519839","#b04632","#89609e","#cd5a91","#4bbf6b","#00aecc"];

function getAvatarColor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function Avatar({ name, photo, size = 28 }: { name: string; photo?: string; size?: number }) {
  if (photo) return <img src={photo} style={{ width: size, height: size }} className="rounded-full object-cover border-2 border-[#22272b]" alt={name} />;
  return (
    <div style={{ width: size, height: size, backgroundColor: getAvatarColor(name), fontSize: size * 0.38 }}
      className="rounded-full flex items-center justify-center text-white font-bold border-2 border-[#22272b] shrink-0">
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

// ── Card Detail Modal ──────────────────────────────────────────────────────
function CardModal({ card, lists, boards, allMembers, customFieldDefs, onClose, onSave, onDelete, onArchive, onMove, onToast }:
  { card: Card; lists: PgList[]; boards: Board[]; allMembers: any[]; customFieldDefs: CustomFieldDef[]; onClose: () => void; onSave: (c: Card) => void; onDelete: (id: string) => void; onArchive: (id: string) => void; onMove: () => void; onToast: Props["onToast"]; }) {
  const [c, setC] = useState<Card>({ ...card });
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"details" | "checklists" | "custom">("details");
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [newItems, setNewItems] = useState<Record<string, string>>({});
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0].hex);

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
  const pct = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;
  const isOverdue = c.dueDate && new Date(c.dueDate) < new Date();

  const addChecklist = () => {
    if (!newChecklistTitle.trim()) return;
    const updated = [...c.checklists, { id: uid(), title: newChecklistTitle.trim(), items: [] }];
    setNewChecklistTitle(""); save({ checklists: updated });
  };
  const toggleItem = (clId: string, itemId: string) => save({ checklists: c.checklists.map(cl => cl.id === clId ? { ...cl, items: cl.items.map(i => i.id === itemId ? { ...i, done: !i.done } : i) } : cl) });
  const addItem = (clId: string) => {
    const text = newItems[clId]?.trim(); if (!text) return;
    save({ checklists: c.checklists.map(cl => cl.id === clId ? { ...cl, items: [...cl.items, { id: uid(), text, done: false }] } : cl) });
    setNewItems(p => ({ ...p, [clId]: "" }));
  };
  const deleteChecklist = (clId: string) => save({ checklists: c.checklists.filter(cl => cl.id !== clId) });
  const deleteItem = (clId: string, itemId: string) => save({ checklists: c.checklists.map(cl => cl.id === clId ? { ...cl, items: cl.items.filter(i => i.id !== itemId) } : cl) });
  const addLabel = () => {
    if (!newLabelName.trim()) return;
    save({ labels: [...c.labels, { id: uid(), name: newLabelName.trim(), color: newLabelColor }] });
    setNewLabelName("");
  };
  const addMember = (name: string) => { if (!c.members.includes(name)) { save({ members: [...c.members, name] }); } setMemberSearch(""); };
  const setCustomField = (defId: string, val: any) => save({ customFields: { ...c.customFields, [defId]: val } });
  const filteredMembers = allMembers.filter(m => !c.members.includes(m.name) && (!memberSearch || m.name?.toLowerCase().includes(memberSearch.toLowerCase()))).slice(0, 6);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-10 overflow-y-auto" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#22272b] rounded-2xl w-full max-w-2xl shadow-2xl border border-white/5 flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Label strips at top */}
        {c.labels.length > 0 && <div className="flex flex-wrap gap-1.5 px-5 pt-4">{c.labels.map(l => <span key={l.id} style={{ backgroundColor: l.color }} className="h-2 w-12 rounded-full" />)}</div>}
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-4 pb-2">
          <AlignLeft size={17} className="text-gray-400 mt-1 shrink-0" />
          <div className="flex-1">
            <input className="w-full bg-transparent text-white font-bold text-lg focus:outline-none focus:bg-black/20 rounded px-1 -ml-1"
              value={c.title} onChange={e => setC(p => ({ ...p, title: e.target.value }))} onBlur={() => save({ title: c.title })} />
            <p className="text-xs text-gray-500 mt-0.5">in list <span className="text-gray-400 font-medium">{lists.find(l => l.id === c.listId)?.title}</span></p>
          </div>
          <div className="flex items-center gap-1">{saving && <span className="text-xs text-gray-500">Saving…</span>}<button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white rounded-lg"><X size={16} /></button></div>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 px-5 pb-1 border-b border-white/5">
          {(["details", "checklists", "custom"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg capitalize transition-colors ${tab === t ? "text-white border-b-2 border-blue-500" : "text-gray-400 hover:text-white"}`}>
              {t === "custom" ? "Custom Fields" : t}{t === "checklists" && totalItems > 0 ? ` ${pct}%` : ""}
            </button>
          ))}
        </div>
        <div className="flex gap-4 p-5 overflow-y-auto max-h-[65vh]">
          <div className="flex-1 space-y-5">
            {tab === "details" && <>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Description</p>
                <textarea value={c.description} onChange={e => setC(p => ({ ...p, description: e.target.value }))} onBlur={() => save({ description: c.description })}
                  rows={4} placeholder="Add a description…"
                  className="w-full bg-[#1d2125] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Due Date</p>
                <input type="date" value={c.dueDate ?? ""} onChange={e => save({ dueDate: e.target.value || null })}
                  className={`bg-[#1d2125] border rounded-xl px-3 py-2 text-sm focus:outline-none ${isOverdue ? "border-red-500/60 text-red-400" : "border-white/10 text-gray-200"}`} />
                {isOverdue && <p className="text-xs text-red-400 mt-1 flex items-center gap-1"><AlertTriangle size={10} /> Overdue</p>}
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Labels</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {c.labels.map(l => <span key={l.id} style={{ backgroundColor: l.color }} className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold text-white">{l.name}<button onClick={() => save({ labels: c.labels.filter(x => x.id !== l.id) })}><X size={9} /></button></span>)}
                </div>
                <button onClick={() => setShowLabelPicker(p => !p)} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"><Plus size={12} /> Add label</button>
                {showLabelPicker && (
                  <div className="mt-2 bg-[#1d2125] border border-white/10 rounded-xl p-3 space-y-2">
                    <input value={newLabelName} onChange={e => setNewLabelName(e.target.value)} placeholder="Label name…" className="w-full bg-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none" />
                    <div className="flex flex-wrap gap-1.5">{LABEL_COLORS.map(lc => <button key={lc.hex} onClick={() => setNewLabelColor(lc.hex)} style={{ backgroundColor: lc.hex }} className={`w-8 h-6 rounded ${newLabelColor === lc.hex ? "ring-2 ring-white" : ""}`} />)}</div>
                    <button onClick={addLabel} className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg font-semibold">Add</button>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Members</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {c.members.map(m => {
                    const mem = allMembers.find(x => x.name === m);
                    return <span key={m} className="flex items-center gap-1.5 bg-white/10 text-gray-200 text-xs px-2 py-1 rounded-full">
                      <Avatar name={m} photo={mem?.photo} size={18} />{m}<button onClick={() => save({ members: c.members.filter(x => x !== m) })}><X size={9} /></button>
                    </span>;
                  })}
                </div>
                <button onClick={() => setShowMemberPicker(p => !p)} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"><Plus size={12} /> Add member</button>
                {showMemberPicker && (
                  <div className="mt-2 bg-[#1d2125] border border-white/10 rounded-xl overflow-hidden">
                    <div className="relative p-2"><Search size={12} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" /><input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Search…" className="w-full pl-7 pr-3 py-1.5 bg-white/10 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none" /></div>
                    <div className="max-h-36 overflow-y-auto">
                      {filteredMembers.map(m => <button key={m.id} onClick={() => addMember(m.name)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left"><Avatar name={m.name} photo={m.photo} size={22} /><span className="text-xs text-gray-300">{m.name}</span></button>)}
                      {memberSearch && !allMembers.find(m => m.name?.toLowerCase() === memberSearch.toLowerCase()) && <button onClick={() => addMember(memberSearch)} className="w-full px-3 py-2 text-xs text-blue-400 hover:bg-white/5 text-left">+ Add "{memberSearch}" as free text</button>}
                    </div>
                  </div>
                )}
              </div>
            </>}
            {tab === "checklists" && (
              <div className="space-y-4">
                {totalItems > 0 && <div><div className="flex justify-between text-xs text-gray-400 mb-1"><span>{pct}%</span><span>{doneItems}/{totalItems}</span></div><div className="h-2 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} /></div></div>}
                {c.checklists.map(cl => (
                  <div key={cl.id} className="bg-[#1d2125] border border-white/10 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2"><p className="text-sm font-bold text-white">{cl.title}</p><button onClick={() => deleteChecklist(cl.id)} className="text-gray-500 hover:text-red-400"><Trash2 size={12} /></button></div>
                    <div className="space-y-1.5 mb-2">
                      {cl.items.map(item => (
                        <div key={item.id} className="flex items-center gap-2 group">
                          <button onClick={() => toggleItem(cl.id, item.id)} className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${item.done ? "bg-blue-500 border-blue-500" : "border-gray-500 hover:border-blue-400"}`}>{item.done && <Check size={9} className="text-white" />}</button>
                          <span className={`text-xs flex-1 ${item.done ? "line-through text-gray-500" : "text-gray-300"}`}>{item.text}</span>
                          <button onClick={() => deleteItem(cl.id, item.id)} className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100"><X size={10} /></button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2"><input value={newItems[cl.id] ?? ""} onChange={e => setNewItems(p => ({ ...p, [cl.id]: e.target.value }))} onKeyDown={e => e.key === "Enter" && addItem(cl.id)} placeholder="Add item…" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" /><button onClick={() => addItem(cl.id)} className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs">Add</button></div>
                  </div>
                ))}
                <div className="flex gap-2"><input value={newChecklistTitle} onChange={e => setNewChecklistTitle(e.target.value)} onKeyDown={e => e.key === "Enter" && addChecklist()} placeholder="New checklist name…" className="flex-1 bg-[#1d2125] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" /><button onClick={addChecklist} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold">Add</button></div>
              </div>
            )}
            {tab === "custom" && (
              <div className="space-y-4">
                {customFieldDefs.length === 0 && <p className="text-xs text-gray-500 text-center py-4">No custom fields. Add in Board Settings (⚙).</p>}
                {customFieldDefs.map(def => (
                  <div key={def.id}>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">{def.name}</label>
                    {def.type === "text" && <input value={c.customFields[def.id] ?? ""} onChange={e => setCustomField(def.id, e.target.value)} className="w-full bg-[#1d2125] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />}
                    {def.type === "number" && <input type="number" value={c.customFields[def.id] ?? ""} onChange={e => setCustomField(def.id, e.target.value)} className="w-full bg-[#1d2125] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />}
                    {def.type === "checkbox" && <button onClick={() => setCustomField(def.id, !c.customFields[def.id])} className={`flex items-center gap-2 text-sm ${c.customFields[def.id] ? "text-blue-400" : "text-gray-400"}`}><ToggleLeft size={20} />{c.customFields[def.id] ? "Yes" : "No"}</button>}
                    {def.type === "dropdown" && <select value={c.customFields[def.id] ?? ""} onChange={e => setCustomField(def.id, e.target.value)} className="w-full bg-[#1d2125] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"><option value="">— Select —</option>{def.options?.map(o => <option key={o} value={o}>{o}</option>)}</select>}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Sidebar */}
          <div className="w-36 space-y-1.5 shrink-0">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Actions</p>
            <button onClick={onMove} className="w-full flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 text-gray-300 text-xs rounded-lg transition-colors"><ArrowRight size={12} /> Move</button>
            <button onClick={() => onArchive(card.id)} className="w-full flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-amber-500/20 text-gray-300 hover:text-amber-400 text-xs rounded-lg transition-colors"><Archive size={12} /> Archive</button>
            {card.archived && <button onClick={() => onDelete(card.id)} className="w-full flex items-center gap-2 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs rounded-lg transition-colors"><Trash2 size={12} /> Delete</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Move Modal ─────────────────────────────────────────────────────────────
function MoveModal({ card, boards, lists, onClose, onMoved, onToast }:
  { card: Card; boards: Board[]; lists: PgList[]; onClose: () => void; onMoved: () => void; onToast: Props["onToast"]; }) {
  const [destBoard, setDestBoard] = useState(card.boardId);
  const [destList, setDestList] = useState(card.listId);
  const [position, setPosition] = useState<"top" | "bottom">("bottom");
  const [moving, setMoving] = useState(false);
  const availLists = lists.filter(l => l.boardId === destBoard);
  const doMove = async () => {
    setMoving(true);
    try { const r = await apiFetch(`/playground/cards/${card.id}/move`, { method: "PATCH", body: JSON.stringify({ boardId: destBoard, listId: destList, position }) }); if (!r.ok) throw new Error(); onToast("success", "Card moved!"); onMoved(); }
    catch { onToast("error", "Failed to move"); } finally { setMoving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#22272b] rounded-2xl w-full max-w-sm shadow-2xl border border-white/5 p-5">
        <div className="flex items-center justify-between mb-4"><h3 className="font-bold text-white">Move Card</h3><button onClick={onClose} className="text-gray-400 hover:text-white"><X size={16} /></button></div>
        <div className="space-y-3">
          <div><label className="text-xs text-gray-400 mb-1 block font-semibold uppercase tracking-wide">Board</label><select value={destBoard} onChange={e => { setDestBoard(e.target.value); setDestList(""); }} className="w-full bg-[#1d2125] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">{boards.filter(b => !b.archived).map(b => <option key={b.id} value={b.id}>{b.title}</option>)}</select></div>
          <div><label className="text-xs text-gray-400 mb-1 block font-semibold uppercase tracking-wide">List</label><select value={destList} onChange={e => setDestList(e.target.value)} className="w-full bg-[#1d2125] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">{availLists.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}</select></div>
          <div><label className="text-xs text-gray-400 mb-1 block font-semibold uppercase tracking-wide">Position</label><select value={position} onChange={e => setPosition(e.target.value as any)} className="w-full bg-[#1d2125] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"><option value="top">Top</option><option value="bottom">Bottom</option></select></div>
        </div>
        <button onClick={doMove} disabled={!destList || moving} className="w-full mt-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">{moving ? "Moving…" : "Move Card"}</button>
      </div>
    </div>
  );
}

// ── Board Settings Modal ───────────────────────────────────────────────────
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
    try { await apiFetch(`/playground/boards/${board.id}`, { method: "PUT", body: JSON.stringify({ title, color, description: desc, customFieldDefs: defs }) }); onSaved({ ...board, title, color, description: desc, customFieldDefs: defs }); onToast("success", "Saved!"); }
    catch { onToast("error", "Failed"); } finally { setSaving(false); }
  };
  const addField = () => {
    if (!newFieldName.trim()) return;
    setDefs(p => [...p, { id: uid(), name: newFieldName.trim(), type: newFieldType, options: newFieldType === "dropdown" ? newFieldOptions.split(",").map(s => s.trim()).filter(Boolean) : undefined }]);
    setNewFieldName(""); setNewFieldOptions("");
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#22272b] rounded-2xl w-full max-w-md shadow-2xl border border-white/5 p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4"><h3 className="font-bold text-white flex items-center gap-2"><Settings size={15} /> Board Settings</h3><button onClick={onClose} className="text-gray-400 hover:text-white"><X size={16} /></button></div>
        <div className="space-y-4">
          <div><label className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1 block">Name</label><input value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-[#1d2125] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" /></div>
          <div><label className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1 block">Description</label><textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} className="w-full bg-[#1d2125] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none resize-none" /></div>
          <div><label className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 block">Color</label><div className="flex flex-wrap gap-2">{BOARD_COLORS.map(bc => <button key={bc} onClick={() => setColor(bc)} style={{ backgroundColor: bc }} className={`w-8 h-8 rounded-lg transition-all ${color === bc ? "ring-2 ring-white scale-110" : ""}`} />)}</div></div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Custom Fields ({defs.length}/50)</p>
            <div className="space-y-1.5 mb-3">{defs.map(d => <div key={d.id} className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2"><span className="text-xs text-gray-300 flex-1">{d.name}</span><span className="text-[10px] text-gray-500 bg-white/10 px-1.5 py-0.5 rounded">{d.type}</span><button onClick={() => setDefs(p => p.filter(x => x.id !== d.id))} className="text-gray-500 hover:text-red-400"><X size={11} /></button></div>)}</div>
            {defs.length < 50 && <div className="space-y-2 bg-white/5 rounded-xl p-3"><div className="flex gap-2"><input value={newFieldName} onChange={e => setNewFieldName(e.target.value)} placeholder="Field name…" className="flex-1 bg-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none" /><select value={newFieldType} onChange={e => setNewFieldType(e.target.value as FieldType)} className="bg-white/10 rounded-lg px-2 text-xs text-white focus:outline-none"><option value="text">Text</option><option value="number">Number</option><option value="dropdown">Dropdown</option><option value="checkbox">Checkbox</option></select></div>{newFieldType === "dropdown" && <input value={newFieldOptions} onChange={e => setNewFieldOptions(e.target.value)} placeholder="Options (comma separated)…" className="w-full bg-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none" />}<button onClick={addField} className="w-full py-1.5 bg-white/10 hover:bg-white/20 text-gray-200 text-xs rounded-lg font-semibold">+ Add Field</button></div>}
          </div>
          <div className="flex gap-2 pt-2 border-t border-white/10">
            <button onClick={() => onArchive(board.id)} className="flex-1 py-2 bg-white/5 hover:bg-amber-500/20 text-gray-300 hover:text-amber-400 text-sm rounded-xl flex items-center justify-center gap-1.5"><Archive size={13} /> Archive Board</button>
            <button onClick={save} disabled={saving} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
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

  const fetchBoards = useCallback(async () => {
    try { const r = await apiFetch("/playground/boards"); const data = await r.json(); setBoards(Array.isArray(data) ? data.filter((b: Board) => !b.archived) : []); }
    catch { onToast("error", "Failed to load boards"); }
  }, []);

  useEffect(() => { fetchBoards(); }, [fetchBoards]);

  const fetchBoardData = useCallback(async (boardId: string) => {
    setLoading(true);
    try {
      const [lr, cr] = await Promise.all([apiFetch(`/playground/boards/${boardId}/lists`), apiFetch(`/playground/boards/${boardId}/cards`)]);
      const [ls, cs] = await Promise.all([lr.json(), cr.json()]);
      setLists(Array.isArray(ls) ? ls : []); setCards(Array.isArray(cs) ? cs : []);
    } catch { onToast("error", "Failed to load board"); } finally { setLoading(false); }
  }, []);

  const openBoard = (b: Board) => { setActiveBoard(b); fetchBoardData(b.id); };

  const createBoard = async () => {
    if (!newBoardTitle.trim()) return;
    try {
      const r = await apiFetch("/playground/boards", { method: "POST", body: JSON.stringify({ title: newBoardTitle.trim(), color: newBoardColor }) });
      const { id } = await r.json();
      const nb: Board = { id, title: newBoardTitle.trim(), color: newBoardColor, description: "", archived: false, customFieldDefs: [] };
      setNewBoardTitle(""); setShowNewBoard(false); await fetchBoards(); openBoard(nb);
    } catch { onToast("error", "Failed to create board"); }
  };

  const createList = async () => {
    if (!newListTitle.trim() || !activeBoard) return;
    try { await apiFetch(`/playground/boards/${activeBoard.id}/lists`, { method: "POST", body: JSON.stringify({ title: newListTitle.trim() }) }); setNewListTitle(""); setAddingList(false); await fetchBoardData(activeBoard.id); }
    catch { onToast("error", "Failed to create list"); }
  };

  const createCard = async (listId: string) => {
    if (!newCardTitle.trim() || !activeBoard) return;
    try { await apiFetch("/playground/cards", { method: "POST", body: JSON.stringify({ boardId: activeBoard.id, listId, title: newCardTitle.trim() }) }); setNewCardTitle(""); setAddingCard(null); await fetchBoardData(activeBoard.id); }
    catch { onToast("error", "Failed to create card"); }
  };

  const archiveList = async (listId: string) => {
    try { await apiFetch(`/playground/lists/${listId}`, { method: "PUT", body: JSON.stringify({ archived: true }) }); setListMenuId(null); if (activeBoard) await fetchBoardData(activeBoard.id); }
    catch { onToast("error", "Failed"); }
  };

  const deleteList = async (listId: string) => {
    if (!confirm("Delete this list and all its cards?")) return;
    try { await apiFetch(`/playground/lists/${listId}`, { method: "DELETE" }); setListMenuId(null); if (activeBoard) await fetchBoardData(activeBoard.id); }
    catch { onToast("error", "Failed"); }
  };

  const archiveBoard = async (id: string) => {
    try { await apiFetch(`/playground/boards/${id}`, { method: "PUT", body: JSON.stringify({ archived: true }) }); setShowSettings(false); setActiveBoard(null); await fetchBoards(); onToast("success", "Board archived"); }
    catch { onToast("error", "Failed"); }
  };

  const archiveCard = async (id: string) => {
    try { await apiFetch(`/playground/cards/${id}`, { method: "PUT", body: JSON.stringify({ archived: true }) }); setSelectedCard(null); if (activeBoard) await fetchBoardData(activeBoard.id); onToast("success", "Card archived"); }
    catch { onToast("error", "Failed"); }
  };

  const deleteCard = async (id: string) => {
    if (!confirm("Permanently delete this card?")) return;
    try { await apiFetch(`/playground/cards/${id}`, { method: "DELETE" }); setSelectedCard(null); if (activeBoard) await fetchBoardData(activeBoard.id); onToast("success", "Deleted"); }
    catch { onToast("error", "Failed"); }
  };

  const onCardSaved = (updated: Card) => setCards(prev => prev.map(c => c.id === updated.id ? updated : c));

  // ── Board Home ─────────────────────────────────────────────────────────
  if (!activeBoard) return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#0079bf] flex items-center justify-center"><LayoutGrid size={18} className="text-white" /></div>
          <div><h1 className="text-lg font-bold text-gray-900 dark:text-white">Boards</h1><p className="text-xs text-gray-400">Playground workspace</p></div>
        </div>
        <button onClick={() => setShowNewBoard(true)} className="flex items-center gap-2 px-4 py-2 bg-[#0079bf] hover:bg-[#026aa7] text-white rounded-lg font-medium text-sm transition-colors"><Plus size={15} /> Create board</button>
      </div>
      {showNewBoard && (
        <div className="mb-6 bg-[#22272b] rounded-2xl border border-white/10 p-4 space-y-3 max-w-sm">
          <input value={newBoardTitle} onChange={e => setNewBoardTitle(e.target.value)} onKeyDown={e => e.key === "Enter" && createBoard()} autoFocus placeholder="Board title…"
            className="w-full bg-[#1d2125] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
          <div className="flex flex-wrap gap-2">{BOARD_COLORS.map(bc => <button key={bc} onClick={() => setNewBoardColor(bc)} style={{ backgroundColor: bc }} className={`w-8 h-8 rounded-lg transition-all ${newBoardColor === bc ? "ring-2 ring-white scale-110" : ""}`} />)}</div>
          <div className="flex gap-2">
            <button onClick={() => setShowNewBoard(false)} className="flex-1 py-2 border border-white/10 text-gray-300 rounded-lg text-sm hover:bg-white/5">Cancel</button>
            <button onClick={createBoard} className="flex-1 py-2 bg-[#0079bf] hover:bg-[#026aa7] text-white rounded-lg text-sm font-semibold">Create</button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {boards.map(b => (
          <button key={b.id} onClick={() => openBoard(b)} style={{ backgroundColor: b.color }}
            className="aspect-[4/3] rounded-xl flex flex-col justify-between p-3 hover:brightness-110 transition-all shadow-md text-left">
            <span className="font-bold text-white text-sm drop-shadow leading-tight">{b.title}</span>
          </button>
        ))}
      </div>
      {boards.length === 0 && !showNewBoard && <div className="text-center py-16"><p className="text-gray-400 text-sm">No boards yet. Create one to get started!</p></div>}
    </div>
  );

  // ── Board View ─────────────────────────────────────────────────────────
  const boardCards = cards.filter(c => c.boardId === activeBoard.id && !c.archived);

  return (
    <div className="flex flex-col -mx-4 -mb-4" style={{ minHeight: "calc(100vh - 120px)" }}>
      {/* Board header - uses board color */}
      <div className="flex items-center gap-2 px-4 py-2.5 shrink-0" style={{ backgroundColor: activeBoard.color }}>
        <button onClick={() => { setActiveBoard(null); setLists([]); setCards([]); }} className="p-1.5 text-white/70 hover:text-white hover:bg-white/20 rounded transition-colors"><ChevronLeft size={16} /></button>
        <h2 className="font-bold text-white text-base flex-1">{activeBoard.title}</h2>
        <span className="text-white/50 text-xs">{boardCards.length}/500</span>
        <button onClick={() => setShowSettings(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold rounded-lg transition-colors"><Settings size={12} /> Board settings</button>
      </div>

      {/* Kanban board - full height with board color tinted background */}
      <div className="flex-1 overflow-hidden" style={{ backgroundColor: `${activeBoard.color}cc` }}>
        {loading ? (
          <div className="flex items-center justify-center h-full"><div className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="flex gap-3 overflow-x-auto h-full px-3 py-3" onClick={() => setListMenuId(null)}>
            {lists.map(list => {
              const listCards = boardCards.filter(c => c.listId === list.id);
              return (
                <div key={list.id} className="flex-shrink-0 w-[272px] flex flex-col rounded-xl" style={{ backgroundColor: "#1d2125" }}>
                  {/* List header */}
                  <div className="flex items-center justify-between px-3 py-2.5 shrink-0">
                    <span className="font-bold text-white text-sm flex-1 leading-tight">{list.title}</span>
                    <div className="relative" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setListMenuId(listMenuId === list.id ? null : list.id)} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"><MoreHorizontal size={15} /></button>
                      {listMenuId === list.id && (
                        <div className="absolute right-0 top-full mt-1 bg-[#2c333a] border border-white/10 rounded-xl shadow-xl z-30 min-w-[160px] py-1.5">
                          <p className="text-center text-xs text-gray-400 font-semibold py-1.5 border-b border-white/5 mb-1">{list.title}</p>
                          <button onClick={() => archiveList(list.id)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-white/5"><Archive size={12} /> Archive this list</button>
                          <button onClick={() => deleteList(list.id)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10"><Trash2 size={12} /> Delete list</button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Cards - scrollable area */}
                  <div className="flex-1 overflow-y-auto px-2 space-y-2 pb-1 max-h-[calc(100vh-240px)]">
                    {listCards.map(card => {
                      const totalItems = card.checklists.reduce((s, cl) => s + cl.items.length, 0);
                      const doneItems = card.checklists.reduce((s, cl) => s + cl.items.filter(i => i.done).length, 0);
                      const isOverdue = card.dueDate && new Date(card.dueDate) < new Date();
                      const memObjs = card.members.map(m => allMembers.find(x => x.name === m)).filter(Boolean);
                      return (
                        <div key={card.id} onClick={() => setSelectedCard(card)}
                          className="rounded-xl cursor-pointer hover:brightness-125 transition-all group shadow-sm"
                          style={{ backgroundColor: "#22272b" }}>
                          {/* Label strips */}
                          {card.labels.length > 0 && (
                            <div className="flex flex-wrap gap-1 px-3 pt-2.5">
                              {card.labels.map(l => <span key={l.id} style={{ backgroundColor: l.color, width: 40, height: 8, borderRadius: 4, display: "inline-block" }} />)}
                            </div>
                          )}
                          <div className="px-3 pt-2 pb-2.5">
                            <p className="text-sm text-white leading-snug font-medium">{card.title}</p>
                            {/* Meta icons row */}
                            <div className="flex items-center justify-between mt-2">
                              <div className="flex items-center gap-2">
                                {isOverdue && <span className="flex items-center gap-0.5 text-[11px] font-semibold text-white bg-red-500 px-1.5 py-0.5 rounded"><Calendar size={9} />{new Date(card.dueDate! + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })}</span>}
                                {!isOverdue && card.dueDate && <span className="flex items-center gap-0.5 text-[11px] text-gray-400"><Calendar size={11} />{new Date(card.dueDate + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })}</span>}
                                {card.description && <AlignLeft size={13} className="text-gray-400" />}
                                {totalItems > 0 && <span className={`flex items-center gap-0.5 text-[11px] font-semibold px-1 rounded ${doneItems === totalItems ? "bg-green-600/30 text-green-400" : "text-gray-400"}`}><CheckSquare size={11} />{doneItems}/{totalItems}</span>}
                              </div>
                              {/* Member avatars */}
                              {card.members.length > 0 && (
                                <div className="flex -space-x-1.5">
                                  {card.members.slice(0, 4).map((m, i) => {
                                    const mem = allMembers.find(x => x.name === m);
                                    return <div key={i}><Avatar name={m} photo={mem?.photo} size={24} /></div>;
                                  })}
                                  {card.members.length > 4 && <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-[9px] text-white font-bold border-2 border-[#22272b]">+{card.members.length - 4}</div>}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Add card inline */}
                    {addingCard === list.id && (
                      <div className="rounded-xl p-2 space-y-2" style={{ backgroundColor: "#22272b" }}>
                        <input ref={cardInputRef} value={newCardTitle} onChange={e => setNewCardTitle(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") createCard(list.id); if (e.key === "Escape") { setAddingCard(null); setNewCardTitle(""); } }}
                          autoFocus placeholder="Enter a title for this card…"
                          className="w-full bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none resize-none" />
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => createCard(list.id)} className="px-3 py-1.5 bg-[#579dff] hover:bg-[#4c8ee6] text-[#1d2125] text-xs font-bold rounded transition-colors">Add card</button>
                          <button onClick={() => { setAddingCard(null); setNewCardTitle(""); }} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"><X size={15} /></button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Add a card button - bottom of list */}
                  {addingCard !== list.id && (
                    <button onClick={() => { setAddingCard(list.id); setNewCardTitle(""); }}
                      className="flex items-center gap-2 px-3 py-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-b-xl transition-colors text-sm shrink-0">
                      <Plus size={15} /> Add a card
                    </button>
                  )}
                </div>
              );
            })}

            {/* Add a list */}
            <div className="flex-shrink-0 w-[272px]">
              {addingList ? (
                <div className="rounded-xl p-2 space-y-2" style={{ backgroundColor: "#1d2125" }}>
                  <input value={newListTitle} onChange={e => setNewListTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") createList(); if (e.key === "Escape") { setAddingList(false); setNewListTitle(""); } }}
                    autoFocus placeholder="Enter list name…"
                    className="w-full bg-white/10 border border-blue-500/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none" />
                  <div className="flex items-center gap-1.5">
                    <button onClick={createList} className="px-3 py-1.5 bg-[#579dff] hover:bg-[#4c8ee6] text-[#1d2125] text-xs font-bold rounded transition-colors">Add list</button>
                    <button onClick={() => { setAddingList(false); setNewListTitle(""); }} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"><X size={15} /></button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingList(true)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 bg-white/20 hover:bg-white/30 text-white text-sm font-medium rounded-xl transition-colors">
                  <Plus size={15} /> Add another list
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {selectedCard && <CardModal card={selectedCard} lists={lists} boards={boards} allMembers={allMembers} customFieldDefs={activeBoard.customFieldDefs ?? []} onClose={() => setSelectedCard(null)} onSave={c => { onCardSaved(c); setSelectedCard(c); }} onDelete={deleteCard} onArchive={archiveCard} onMove={() => { setMoveCard(selectedCard); setSelectedCard(null); }} onToast={onToast} />}
      {moveCard && <MoveModal card={moveCard} boards={boards} lists={lists} onClose={() => setMoveCard(null)} onMoved={async () => { setMoveCard(null); if (activeBoard) await fetchBoardData(activeBoard.id); }} onToast={onToast} />}
      {showSettings && <BoardSettings board={activeBoard} onClose={() => setShowSettings(false)} onSaved={b => { setActiveBoard(b); setBoards(prev => prev.map(x => x.id === b.id ? b : x)); setShowSettings(false); }} onArchive={archiveBoard} onToast={onToast} />}
    </div>
  );
}
