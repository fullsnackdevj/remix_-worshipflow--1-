import React, { useState, useEffect } from "react";
import { Member } from "./types";

interface Props {
  celebrants: Member[];
  onScrollToCards?: () => void;
}

export default function BirthdayBanner({ celebrants, onScrollToCards }: Props) {
  const [dismissed, setDismissed] = useState(false);

  // Persist dismiss state per calendar day in sessionStorage
  useEffect(() => {
    const key = `wf_bd_banner_${new Date().toISOString().slice(0, 10)}`;
    if (sessionStorage.getItem(key) === "1") setDismissed(true);
  }, []);

  if (dismissed || celebrants.length === 0) return null;

  const names = celebrants.map(m => m.firstName ?? m.name.split(" ")[0]);
  const nameStr =
    names.length === 1
      ? names[0]
      : names.length === 2
      ? `${names[0]} & ${names[1]}`
      : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed(true);
    sessionStorage.setItem(`wf_bd_banner_${new Date().toISOString().slice(0, 10)}`, "1");
  };

  return (
    <>
      <style>{`
        @keyframes bdBannerShimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .bd-banner-shimmer {
          background: linear-gradient(
            90deg,
            #b45309 0%, #f59e0b 30%, #fde68a 50%, #f59e0b 70%, #b45309 100%
          );
          background-size: 200% auto;
          animation: bdBannerShimmer 3s linear infinite;
        }
        @keyframes bdBannerPop {
          0% { transform: translateY(-12px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .bd-banner-pop { animation: bdBannerPop 0.35s cubic-bezier(0.175,0.885,0.32,1.275) both; }
        @keyframes bdBell {
          0%, 100% { transform: rotate(0deg); }
          20% { transform: rotate(-12deg); }
          40% { transform: rotate(12deg); }
          60% { transform: rotate(-6deg); }
          80% { transform: rotate(6deg); }
        }
        .bd-bell { animation: bdBell 1.8s ease-in-out infinite; display:inline-block; }
      `}</style>

      <div
        role="banner"
        onClick={onScrollToCards}
        className="bd-banner-pop bd-banner-shimmer relative flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg cursor-pointer select-none mb-4"
      >
        {/* Bell icon */}
        <span className="bd-bell text-xl shrink-0">🎂</span>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-amber-900 leading-tight truncate">
            🎉 Today's Birthday{celebrants.length > 1 ? "s" : ""}:{" "}
            <span className="underline decoration-dotted">{nameStr}</span>
          </p>
          <p className="text-xs text-amber-800/80 mt-0.5">
            {celebrants.length > 1 ? "Send them" : "Send"} your birthday wishes! 👇
          </p>
        </div>

        {/* Dismiss X */}
        <button
          aria-label="Dismiss birthday banner"
          onClick={handleDismiss}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-amber-900/20 hover:bg-amber-900/30 transition-colors text-amber-900 font-bold text-xs"
        >
          ✕
        </button>
      </div>
    </>
  );
}
