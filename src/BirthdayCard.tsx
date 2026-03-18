import React, { useState, useEffect, useCallback } from "react";
import { db } from "./firebase";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { Member } from "./types";

// ── Role theme config — mirrors ROLE_STYLE in Dashboard/AdminDashboard ────────
interface RoleTheme {
  label: string;
  emoji: string;
  headerClass: string;       // Tailwind gradient classes for the header bg
  headerStyle?: React.CSSProperties; // inline for exact hex gradients
  ringColor: string;          // avatar border glow color (inline style)
  verseColor: string;         // left border of verse block (Tailwind color class)
  pillBg: string;             // role pill background
  pillText: string;           // role pill text
  btnStyle: React.CSSProperties; // CTA button gradient
  reactionTint: string;       // reaction pill background tint
  message: string;
  verse: string;
  verseRef: string;
  headerEffect: string;       // CSS class name for header decoration
  uniqueEmoji: string;        // role-specific reaction emoji (replaces 🎊)
}

const ROLE_THEMES: Record<string, RoleTheme> = {
  admin: {
    label: "Admin",
    emoji: "👑",
    headerStyle: { background: "linear-gradient(135deg, #d97706 0%, #fbbf24 100%)" },
    headerClass: "",
    ringColor: "#f59e0b",
    verseColor: "border-amber-400",
    pillBg: "bg-amber-500/20",
    pillText: "text-amber-300",
    btnStyle: { background: "linear-gradient(135deg, #d97706, #f59e0b)" },
    reactionTint: "bg-amber-500/15 hover:bg-amber-500/25 text-amber-300",
    message: "Your leadership and heart for ministry keep this team running strong. We are so grateful for everything you do!",
    verse: "\"And whatever you do, whether in word or deed, do it all in the name of the Lord Jesus.\"",
    verseRef: "— Colossians 3:17 (NIV)",
    headerEffect: "birthday-sunburst",
    uniqueEmoji: "👑",
  },
  leader: {
    label: "Worship Leader",
    emoji: "🎤",
    headerStyle: { background: "linear-gradient(135deg, #4338ca 0%, #7c3aed 100%)" },
    headerClass: "",
    ringColor: "#818cf8",
    verseColor: "border-indigo-400",
    pillBg: "bg-indigo-500/20",
    pillText: "text-indigo-300",
    btnStyle: { background: "linear-gradient(135deg, #4338ca, #7c3aed)" },
    reactionTint: "bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300",
    message: "Your voice carries the presence of God into our worship every single week. Leading us is your calling!",
    verse: "\"Shout for joy to the LORD, all the earth. Worship the LORD with gladness; come before him with joyful songs.\"",
    verseRef: "— Psalm 100:1–2 (NIV)",
    headerEffect: "birthday-radiant",
    uniqueEmoji: "🎤",
  },
  planning_lead: {
    label: "Planning Lead",
    emoji: "📋",
    headerStyle: { background: "linear-gradient(135deg, #be185d 0%, #f43f5e 100%)" },
    headerClass: "",
    ringColor: "#fb7185",
    verseColor: "border-rose-400",
    pillBg: "bg-rose-500/20",
    pillText: "text-rose-300",
    btnStyle: { background: "linear-gradient(135deg, #be185d, #f43f5e)" },
    reactionTint: "bg-rose-500/15 hover:bg-rose-500/25 text-rose-300",
    message: "Behind every great service is a great plan — and that's you! The team is blessed to have your gifts.",
    verse: "\"Commit to the LORD whatever you do, and he will establish your plans.\"",
    verseRef: "— Proverbs 16:3 (NIV)",
    headerEffect: "birthday-confetti",
    uniqueEmoji: "📋",
  },
  musician: {
    label: "Musician",
    emoji: "🎵",
    headerStyle: { background: "linear-gradient(135deg, #6d28d9 0%, #a855f7 100%)" },
    headerClass: "",
    ringColor: "#c084fc",
    verseColor: "border-purple-400",
    pillBg: "bg-purple-500/20",
    pillText: "text-purple-300",
    btnStyle: { background: "linear-gradient(135deg, #6d28d9, #a855f7)" },
    reactionTint: "bg-purple-500/15 hover:bg-purple-500/25 text-purple-300",
    message: "Your musical gift is a blessing to our whole team and congregation. Keep playing for the glory of God!",
    verse: "\"Praise him with the sounding of the trumpet, praise him with the harp and lyre.\"",
    verseRef: "— Psalm 150:3 (NIV)",
    headerEffect: "birthday-notes",
    uniqueEmoji: "🎵",
  },
  audio_tech: {
    label: "Audio / Tech",
    emoji: "🎛️",
    headerStyle: { background: "linear-gradient(135deg, #0f766e 0%, #06b6d4 100%)" },
    headerClass: "",
    ringColor: "#2dd4bf",
    verseColor: "border-teal-400",
    pillBg: "bg-teal-500/20",
    pillText: "text-teal-300",
    btnStyle: { background: "linear-gradient(135deg, #0f766e, #06b6d4)" },
    reactionTint: "bg-teal-500/15 hover:bg-teal-500/25 text-teal-300",
    message: "The ministry wouldn't sound right without you. Your faithful work behind the scenes makes everything possible!",
    verse: "\"Whatever you do, work at it with all your heart, as working for the Lord, not for human masters.\"",
    verseRef: "— Colossians 3:23 (NIV)",
    headerEffect: "birthday-circuit",
    uniqueEmoji: "🎛️",
  },
  qa_specialist: {
    label: "QA Specialist",
    emoji: "🔍",
    headerStyle: { background: "linear-gradient(135deg, #86198f 0%, #d946ef 100%)" },
    headerClass: "",
    ringColor: "#e879f9",
    verseColor: "border-fuchsia-400",
    pillBg: "bg-fuchsia-500/20",
    pillText: "text-fuchsia-300",
    btnStyle: { background: "linear-gradient(135deg, #86198f, #d946ef)" },
    reactionTint: "bg-fuchsia-500/15 hover:bg-fuchsia-500/25 text-fuchsia-300",
    message: "Your attention to detail ensures everything runs smoothly. The whole team benefits from your dedication!",
    verse: "\"The wisdom of the prudent is to give thought to their ways.\"",
    verseRef: "— Proverbs 14:8 (NIV)",
    headerEffect: "birthday-hex",
    uniqueEmoji: "🔍",
  },
  member: {
    label: "Member",
    emoji: "🙏",
    headerStyle: { background: "linear-gradient(135deg, #4338ca 0%, #6d28d9 100%)" },
    headerClass: "",
    ringColor: "#818cf8",
    verseColor: "border-indigo-400",
    pillBg: "bg-indigo-500/20",
    pillText: "text-indigo-300",
    btnStyle: { background: "linear-gradient(135deg, #4338ca, #6d28d9)" },
    reactionTint: "bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300",
    message: "We are so blessed to do ministry alongside you. Your presence and heart make our team complete!",
    verse: "\"For I know the plans I have for you, declares the LORD, plans to prosper you and not to harm you, plans to give you hope and a future.\"",
    verseRef: "— Jeremiah 29:11 (NIV)",
    headerEffect: "birthday-sparkle",
    uniqueEmoji: "🙏",
  },
};

const DEFAULT_THEME = ROLE_THEMES.member;

const REACTION_EMOJIS = ["🎂", "🙏", "ROLE", "✨"] as const;

// ── Props ─────────────────────────────────────────────────────────────────────
interface BirthdayCardProps {
  member: Member;
  currentUserId: string;
  currentUserName: string;
  currentUserPhoto?: string;
  /** Optional: pre-resolved access role for this celebrant */
  celebrantRole?: string;
}

// ── Avatar fallback ───────────────────────────────────────────────────────────
function Avatar({ photo, name, size = 64, ring }: { photo?: string; name: string; size?: number; ring: string }) {
  const [err, setErr] = useState(false);
  const initials = (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const ok = photo?.startsWith("http") && !err;
  return (
    <div
      className="rounded-full overflow-hidden shrink-0 relative"
      style={{
        width: size, height: size,
        boxShadow: `0 0 0 3px ${ring}, 0 0 16px 4px ${ring}55`,
      }}
    >
      {ok
        ? <img src={photo} alt={name} className="w-full h-full object-cover" onError={() => setErr(true)} />
        : (
          <div
            className="w-full h-full flex items-center justify-center text-white font-bold"
            style={{ background: `linear-gradient(135deg, ${ring}88, ${ring})`, fontSize: size / 3 }}
          >
            {initials}
          </div>
        )}
    </div>
  );
}

// ── Main BirthdayCard ─────────────────────────────────────────────────────────
export default function BirthdayCard({ member, currentUserId, currentUserName, currentUserPhoto, celebrantRole }: BirthdayCardProps) {
  const theme = ROLE_THEMES[celebrantRole ?? ""] ?? DEFAULT_THEME;
  const firstName = (member.firstName ?? member.name.split(" ")[0]);

  // Reaction emojis — swap ROLE placeholder for actual role emoji
  const emojis = REACTION_EMOJIS.map(e => e === "ROLE" ? theme.uniqueEmoji : e);

  // ── Firestore reaction state ──────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const docId = `${member.id}_${today}`;
  const reactDocRef = doc(db, "birthday_reactions", docId);

  const [reactions, setReactions] = useState<Record<string, string[]>>({});
  const [wishers, setWishers] = useState<string[]>([]);
  const [loadingReact, setLoadingReact] = useState(false);
  const [wished, setWished] = useState(false);

  // Load existing reactions
  useEffect(() => {
    let cancelled = false;
    getDoc(reactDocRef).then(snap => {
      if (cancelled || !snap.exists()) return;
      const data = snap.data();
      setReactions(data.reactions ?? {});
      const wishersList: string[] = data.wishers ?? [];
      setWishers(wishersList);
      setWished(wishersList.includes(currentUserId));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [docId]);

  const handleReact = useCallback(async (emoji: string) => {
    if (loadingReact) return;
    setLoadingReact(true);
    const current = reactions[emoji] ?? [];
    const hasReacted = current.includes(currentUserId);

    // Optimistic update
    setReactions(prev => ({
      ...prev,
      [emoji]: hasReacted
        ? prev[emoji].filter(id => id !== currentUserId)
        : [...(prev[emoji] ?? []), currentUserId],
    }));

    try {
      const snap = await getDoc(reactDocRef);
      if (!snap.exists()) {
        await setDoc(reactDocRef, {
          memberId: member.id,
          date: today,
          reactions: { [emoji]: [currentUserId] },
          wishers: [],
        });
      } else {
        await updateDoc(reactDocRef, {
          [`reactions.${emoji}`]: hasReacted
            ? arrayRemove(currentUserId)
            : arrayUnion(currentUserId),
        });
      }
    } catch {
      // Revert on error
      setReactions(prev => ({
        ...prev,
        [emoji]: current,
      }));
    } finally {
      setLoadingReact(false);
    }
  }, [reactions, currentUserId, loadingReact]);

  const handleWish = useCallback(async () => {
    if (wished) return;
    setWished(true);
    setWishers(prev => [...prev, currentUserId]);
    try {
      const snap = await getDoc(reactDocRef);
      if (!snap.exists()) {
        await setDoc(reactDocRef, {
          memberId: member.id,
          date: today,
          reactions: {},
          wishers: [currentUserId],
          wisherNames: [currentUserName],
        });
      } else {
        await updateDoc(reactDocRef, {
          wishers: arrayUnion(currentUserId),
          wisherNames: arrayUnion(currentUserName),
        });
      }
    } catch {
      setWished(false);
      setWishers(prev => prev.filter(id => id !== currentUserId));
    }
  }, [wished, currentUserId, currentUserName]);

  return (
    <>
      {/* Inject header effect keyframes once */}
      <style>{`
        @keyframes bdShimmer {
          0% { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(250%) skewX(-15deg); }
        }
        @keyframes bdFloat {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-6px) rotate(4deg); }
        }
        @keyframes bdPop {
          0% { transform: scale(0.85); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .bd-shimmer::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent 20%, rgba(255,255,255,0.18) 50%, transparent 80%);
          animation: bdShimmer 2.8s ease-in-out infinite;
        }
        .bd-cake { animation: bdFloat 3s ease-in-out infinite; display:inline-block; }
        .bd-card { animation: bdPop 0.4s cubic-bezier(0.175,0.885,0.32,1.275) both; }
        /* confetti dots for confetti/sparkle effects */
        .bd-confetti-dot {
          position: absolute;
          border-radius: 50%;
          opacity: 0.55;
          animation: bdFloat 2.5s ease-in-out infinite;
        }
      `}</style>

      <div className="bd-card w-full max-w-sm mx-auto rounded-2xl overflow-hidden shadow-2xl bg-gray-800/90 border border-white/5 flex flex-col">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div
          className="relative overflow-hidden flex flex-col items-center justify-center pt-7 pb-10 bd-shimmer"
          style={{ ...theme.headerStyle, minHeight: 120 }}
        >
          {/* Decorative dots for confetti/sparkle themes */}
          {["#fff", "#fff9", "#fffd"].map((c, i) => (
            <div
              key={i}
              className="bd-confetti-dot"
              style={{
                width: [6, 8, 5][i], height: [6, 8, 5][i],
                background: c,
                top: `${[20, 55, 35][i]}%`,
                left: `${[15, 75, 88][i]}%`,
                animationDelay: `${i * 0.7}s`,
              }}
            />
          ))}
          {/* More sparkle dots */}
          {["#fff8", "#fffb", "#fff6"].map((c, i) => (
            <div
              key={`s${i}`}
              className="bd-confetti-dot"
              style={{
                width: [4, 5, 3][i], height: [4, 5, 3][i],
                background: c,
                top: `${[70, 25, 80][i]}%`,
                left: `${[30, 50, 60][i]}%`,
                animationDelay: `${i * 0.5 + 1}s`,
              }}
            />
          ))}
          <span className="bd-cake text-4xl z-10">🎂</span>
        </div>

        {/* ── Avatar overlapping header ─────────────────────────────────── */}
        <div className="flex flex-col items-center -mt-8 px-5 z-10">
          <Avatar
            photo={member.photo}
            name={member.name}
            size={64}
            ring={theme.ringColor}
          />

          {/* ── Name + role pill ─────────────────────────────────────────── */}
          <h2 className="mt-3 text-xl font-bold text-white text-center leading-tight">
            Happy Birthday, {firstName}! 🎉
          </h2>
          <div className={`mt-1.5 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${theme.pillBg} ${theme.pillText}`}>
            <span>{theme.emoji}</span>
            <span>{theme.label}</span>
          </div>

          {/* ── Personal message ─────────────────────────────────────────── */}
          <p className="mt-3 text-sm text-gray-400 text-center leading-relaxed px-1">
            {theme.message}
          </p>

          {/* ── Bible verse ──────────────────────────────────────────────── */}
          <div className={`mt-4 w-full border-l-4 ${theme.verseColor} pl-3 py-1`}>
            <p className="text-xs text-gray-300 italic leading-relaxed">{theme.verse}</p>
            <p className="text-[11px] text-gray-500 mt-0.5 non-italic">{theme.verseRef}</p>
          </div>

          {/* ── Reactions ────────────────────────────────────────────────── */}
          <div className="mt-4 w-full flex flex-wrap gap-2 justify-center">
            {emojis.map(emoji => {
              const count = (reactions[emoji] ?? []).length;
              const isMine = (reactions[emoji] ?? []).includes(currentUserId);
              return (
                <button
                  key={emoji}
                  onClick={() => handleReact(emoji)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all active:scale-90 border border-white/10
                    ${isMine ? theme.reactionTint + " ring-1 ring-white/20" : "bg-white/5 hover:bg-white/10 text-gray-300"}`}
                >
                  <span>{emoji}</span>
                  {count > 0 && <span className="text-xs">{count}</span>}
                </button>
              );
            })}
          </div>

          {/* ── Wish button ──────────────────────────────────────────────── */}
          <button
            onClick={handleWish}
            disabled={wished}
            className={`mt-4 mb-5 w-full py-3 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98] shadow-lg
              ${wished
                ? "opacity-60 cursor-default"
                : "hover:opacity-90 hover:shadow-xl"
              }`}
            style={wished ? { background: "#374151" } : theme.btnStyle}
          >
            {wished ? "Wishes Sent ✓" : "Send Birthday Wishes 🎉"}
          </button>

          {/* Wisher count hint */}
          {wishers.length > 0 && (
            <p className="text-[11px] text-gray-500 -mt-3 mb-4 text-center">
              {wishers.length} teammate{wishers.length !== 1 ? "s" : ""} sent wishes 🎊
            </p>
          )}
        </div>
      </div>
    </>
  );
}
