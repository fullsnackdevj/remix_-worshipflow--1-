// ── Planner Module ─────────────────────────────────────────────────────────
// Graduated from Playground — the WorshipFlow Kanban board for ministry planning.
import PlannerBoard from "./PlannerBoard";

interface Props {
  allMembers?: any[];
  currentUser?: { name: string; photo?: string };
  onToast: (type: "success" | "error", msg: string) => void;
  isFullAccess?: boolean;
  deepLinkBoardId?: string | null;
  deepLinkCardId?: string | null;
}

export default function Planner({ allMembers = [], currentUser, onToast, isFullAccess, deepLinkBoardId, deepLinkCardId }: Props) {
  return (
    <div className="max-w-full select-none h-full flex flex-col">
      <PlannerBoard
        allMembers={allMembers}
        currentUser={currentUser}
        onToast={onToast}
        isFullAccess={isFullAccess}
        deepLinkBoardId={deepLinkBoardId}
        deepLinkCardId={deepLinkCardId}
      />
    </div>
  );
}
