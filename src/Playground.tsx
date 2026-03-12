import { useState, useRef, useCallback, useEffect } from "react";
import { FlaskConical, GripVertical, Plus, X, Sliders } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface KanbanCard {
  id: string;
  title: string;
  tag: string;
  tagColor: string;
  priority: "high" | "medium" | "low";
}

interface KanbanColumn {
  id: string;
  title: string;
  emoji: string;
  accent: string;        // Tailwind border color
  dot: string;           // Tailwind bg color for dot
  cards: KanbanCard[];
}

// ── Initial data ──────────────────────────────────────────────────────────────
const INIT: Record<string, KanbanColumn> = {
  todo: {
    id: "todo", title: "To Do", emoji: "📋",
    accent: "border-slate-400 dark:border-slate-500",
    dot: "bg-slate-400",
    cards: [
      { id: "c1", title: "Sunday Service Planning", tag: "Service", tagColor: "indigo", priority: "high" },
      { id: "c2", title: "Worship Night Song List", tag: "Songs", tagColor: "violet", priority: "medium" },
      { id: "c3", title: "Equipment Checklist", tag: "Logistics", tagColor: "slate", priority: "low" },
    ],
  },
  doing: {
    id: "doing", title: "In Progress", emoji: "⏳",
    accent: "border-amber-400 dark:border-amber-500",
    dot: "bg-amber-400",
    cards: [
      { id: "c4", title: "Team Member Assignments", tag: "Team", tagColor: "amber", priority: "high" },
      { id: "c5", title: "Song Key Transpositions", tag: "Songs", tagColor: "violet", priority: "medium" },
    ],
  },
  done: {
    id: "done", title: "Done", emoji: "✅",
    accent: "border-emerald-400 dark:border-emerald-500",
    dot: "bg-emerald-400",
    cards: [
      { id: "c6", title: "Venue Booking", tag: "Logistics", tagColor: "emerald", priority: "low" },
      { id: "c7", title: "Budget Approval", tag: "Admin", tagColor: "indigo", priority: "medium" },
    ],
  },
};

const COL_ORDER = ["todo", "doing", "done"];

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  medium: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
};

const TAG_COLORS: Record<string, string> = {
  indigo: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400",
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400",
  amber:  "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  emerald:"bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  slate:  "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
let _id = 100;
const uid = () => `c${++_id}`;

// ── Component ─────────────────────────────────────────────────────────────────
export default function Playground() {
  const [columns, setColumns] = useState<Record<string, KanbanColumn>>(INIT);
  const [draggingId, setDraggingId]  = useState<string | null>(null); // card id being dragged
  const [overCol, setOverCol]        = useState<string | null>(null);  // column id being hovered
  const [newTitle, setNewTitle]      = useState<Record<string, string>>({});

  // Drag bookkeeping stored in a ref (no re-renders during move)
  const drag = useRef<{
    cardId: string;
    fromCol: string;
    ghost: HTMLElement;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  // Move ghost and detect which column is under cursor
  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!drag.current) return;
    const { ghost, offsetX, offsetY } = drag.current;

    // Position ghost
    ghost.style.left = `${e.clientX - offsetX}px`;
    ghost.style.top  = `${e.clientY - offsetY}px`;

    // Temporarily hide ghost so elementFromPoint works
    ghost.style.visibility = "hidden";
    const el = document.elementFromPoint(e.clientX, e.clientY);
    ghost.style.visibility = "visible";

    const colEl = el?.closest("[data-col-id]") as HTMLElement | null;
    setOverCol(colEl?.dataset.colId ?? null);
  }, []);

  // Drop: move card to overCol if different
  const onPointerUp = useCallback(() => {
    if (!drag.current) return;
    const { cardId, fromCol, ghost } = drag.current;
    const toCol = overCol;

    ghost.remove();
    drag.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup",   onPointerUp);

    setDraggingId(null);
    setOverCol(null);

    if (toCol && toCol !== fromCol) {
      setColumns(prev => {
        const card = prev[fromCol].cards.find(c => c.id === cardId)!;
        return {
          ...prev,
          [fromCol]: { ...prev[fromCol], cards: prev[fromCol].cards.filter(c => c.id !== cardId) },
          [toCol]:   { ...prev[toCol],   cards: [...prev[toCol].cards, card] },
        };
      });
    }
  }, [overCol, onPointerMove]);

  // Start drag on pointer down on a card
  const startDrag = useCallback((
    e: PointerEvent,
    cardId: string,
    colId: string,
  ) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLDivElement;
    const rect = target.getBoundingClientRect();

    // Build ghost element
    const ghost = target.cloneNode(true) as HTMLElement;
    ghost.style.cssText = `
      position: fixed;
      left: ${rect.left}px;
      top: ${rect.top}px;
      width: ${rect.width}px;
      pointer-events: none;
      opacity: 0.85;
      z-index: 9999;
      border-radius: 12px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.3);
      rotate: 2deg;
      transition: rotate 0.1s;
    `;
    document.body.appendChild(ghost);

    drag.current = {
      cardId,
      fromCol: colId,
      ghost,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };

    setDraggingId(cardId);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup",   onPointerUp);
  }, [onPointerMove, onPointerUp]);

  // Cleanup on unmount
  useEffect(() => () => {
    drag.current?.ghost.remove();
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup",   onPointerUp);
  }, [onPointerMove, onPointerUp]);

  // Add new card
  const addCard = (colId: string) => {
    const title = (newTitle[colId] ?? "").trim();
    if (!title) return;
    setColumns(prev => ({
      ...prev,
      [colId]: {
        ...prev[colId],
        cards: [...prev[colId].cards, { id: uid(), title, tag: "Custom", tagColor: "slate", priority: "medium" }],
      },
    }));
    setNewTitle(p => ({ ...p, [colId]: "" }));
  };

  // Delete card
  const deleteCard = (colId: string, cardId: string) => {
    setColumns(prev => ({
      ...prev,
      [colId]: { ...prev[colId], cards: prev[colId].cards.filter(c => c.id !== cardId) },
    }));
  };

  return (
    <div className="max-w-5xl mx-auto select-none">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg">
          <FlaskConical size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Playground</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            🖱️ Drag cards between columns &nbsp;·&nbsp; Works on desktop, tablet &amp; mobile
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="mb-5 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700/40 rounded-2xl px-4 py-3 flex items-center gap-2">
        <Sliders size={14} className="text-violet-500 shrink-0" />
        <p className="text-xs text-violet-700 dark:text-violet-300">
          <strong>Drag &amp; Drop Test</strong> — Uses the Pointer Events API for unified mouse, touch and stylus support.
          Drag any card to a different column to move it. Add or delete cards to test.
        </p>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {COL_ORDER.map(colId => {
          const col = columns[colId];
          const isOver = overCol === colId;
          return (
            <div
              key={colId}
              data-col-id={colId}
              className={`
                rounded-2xl border-2 transition-all duration-150
                ${isOver
                  ? "border-indigo-400 dark:border-indigo-500 bg-indigo-50/60 dark:bg-indigo-900/20 scale-[1.01] shadow-lg"
                  : `${col.accent} bg-gray-50 dark:bg-gray-800/60`
                }
              `}
            >
              {/* Column header */}
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                  <span className="font-semibold text-sm text-gray-900 dark:text-white">
                    {col.emoji} {col.title}
                  </span>
                </div>
                <span className="text-xs font-bold bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300 rounded-full w-6 h-6 flex items-center justify-center shadow-sm">
                  {col.cards.length}
                </span>
              </div>

              {/* Cards */}
              <div className="px-3 pb-2 space-y-2 min-h-[60px]">
                {col.cards.length === 0 && (
                  <div className={`rounded-xl border-2 border-dashed py-6 flex items-center justify-center text-xs transition-all ${
                    isOver
                      ? "border-indigo-400 text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20"
                      : "border-gray-200 dark:border-gray-600 text-gray-300 dark:text-gray-600"
                  }`}>
                    {isOver ? "Drop here" : "Empty"}
                  </div>
                )}
                {col.cards.map(card => {
                  const isDragging = draggingId === card.id;
                  return (
                    <div
                      key={card.id}
                      onPointerDown={e => startDrag(e.nativeEvent as PointerEvent, card.id, colId)}
                      className={`
                        group bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm
                        border border-gray-100 dark:border-gray-700
                        cursor-grab active:cursor-grabbing
                        transition-all duration-150
                        ${isDragging ? "opacity-30 scale-95 ring-2 ring-indigo-300" : "hover:shadow-md hover:-translate-y-0.5"}
                      `}
                      style={{ touchAction: "none" }} // required for pointer events on touch
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical size={14} className="text-gray-300 dark:text-gray-600 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white leading-snug">{card.title}</p>
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${TAG_COLORS[card.tagColor] ?? TAG_COLORS.slate}`}>
                              {card.tag}
                            </span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${PRIORITY_COLORS[card.priority]}`}>
                              {card.priority}
                            </span>
                          </div>
                        </div>
                        <button
                          onPointerDown={e => e.stopPropagation()}
                          onClick={() => deleteCard(colId, card.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-gray-300 hover:text-red-400 transition-all shrink-0"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Drop zone hint when dragging over non-empty column */}
                {isOver && col.cards.length > 0 && (
                  <div className="rounded-xl border-2 border-dashed border-indigo-400 dark:border-indigo-500 py-3 text-center text-xs text-indigo-400 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 transition-all">
                    Drop here
                  </div>
                )}
              </div>

              {/* Add card input */}
              <div className="px-3 pb-3 pt-1">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newTitle[colId] ?? ""}
                    onChange={e => setNewTitle(p => ({ ...p, [colId]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addCard(colId)}
                    placeholder="Add a card…"
                    className="flex-1 min-w-0 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <button
                    onClick={() => addCard(colId)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "🖱️ Desktop", desc: "Mouse drag between columns" },
          { label: "👆 Mobile", desc: "Touch drag — no scroll conflict" },
          { label: "✏️ Stylus", desc: "Pointer events unified" },
          { label: "⌨️ Add cards", desc: "Type + Enter or press +" },
        ].map(tip => (
          <div key={tip.label} className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700 text-center">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{tip.label}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{tip.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
