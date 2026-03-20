import React from "react";
import { Member } from "./types";

interface Props {
  celebrants: Member[];
}

export default function BirthdayBanner({ celebrants }: Props) {
  if (celebrants.length === 0) return null;

  const names = celebrants.map(m => m.firstName ?? m.name.split(" ")[0]);
  const nameStr =
    names.length === 1
      ? names[0]
      : names.length === 2
      ? `${names[0]} & ${names[1]}`
      : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;

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

      {/* Static banner — no click, no dismiss */}
      <div
        role="status"
        aria-live="polite"
        className="bd-banner-pop bd-banner-shimmer relative flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg select-none mb-4"
      >
        {/* Bell icon */}
        <span className="bd-bell text-xl shrink-0">🎂</span>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight truncate" style={{ color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
            🎉 Today's Birthday{celebrants.length > 1 ? "s" : ""}:{" "}
            <span>{nameStr}</span>
          </p>
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.85)", textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}>
            Wishing {celebrants.length > 1 ? "them" : "them"} a wonderful birthday! 🎊
          </p>
        </div>
      </div>
    </>
  );
}
