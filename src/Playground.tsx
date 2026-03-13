import { FlaskConical } from "lucide-react";
import PlaygroundTrello from "./PlaygroundTrello";

interface Props {
  allMembers?: any[];
  onToast: (type: "success" | "error", msg: string) => void;
}

export default function Playground({ allMembers = [], onToast }: Props) {
  return (
    <div className="max-w-full select-none h-full flex flex-col">
      <PlaygroundTrello allMembers={allMembers} onToast={onToast} />
    </div>
  );
}
