import React, { useState, useEffect, useCallback } from "react";
import { Send } from "lucide-react";

import { db } from "./firebase";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, onSnapshot } from "firebase/firestore";
import { Member } from "./types";

// ── Role theme config ─────────────────────────────────────────────────────────
interface RoleTheme {
  label: string;
  emoji: string;
  headerStyle: React.CSSProperties;
  ringColor: string;
  verseColor: string;
  pillBg: string;
  pillText: string;
  btnStyle: React.CSSProperties;
  reactionTint: string;
  message: string;
  verse: string;
  verseRef: string;
  uniqueEmoji: string;
}

const ROLE_THEMES: Record<string, RoleTheme> = {
  admin: {
    label: "Admin", emoji: "👑",
    headerStyle: { background: "linear-gradient(135deg, #d97706 0%, #fbbf24 100%)" },
    ringColor: "#f59e0b", verseColor: "border-amber-400",
    pillBg: "bg-amber-500/20", pillText: "text-amber-300",
    btnStyle: { background: "linear-gradient(135deg, #d97706, #f59e0b)" },
    reactionTint: "bg-amber-500/15 hover:bg-amber-500/25 text-amber-300",
    message: "Your leadership and heart for ministry keep this team running strong. We are so grateful for everything you do!",
    verse: "\"And whatever you do, whether in word or deed, do it all in the name of the Lord Jesus.\"",
    verseRef: "— Colossians 3:17 (NIV)", uniqueEmoji: "👑",
  },
  leader: {
    label: "Worship Leader", emoji: "🎤",
    headerStyle: { background: "linear-gradient(135deg, #4338ca 0%, #7c3aed 100%)" },
    ringColor: "#818cf8", verseColor: "border-indigo-400",
    pillBg: "bg-indigo-500/20", pillText: "text-indigo-300",
    btnStyle: { background: "linear-gradient(135deg, #4338ca, #7c3aed)" },
    reactionTint: "bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300",
    message: "Your voice carries the presence of God into our worship every single week. Leading us is your calling!",
    verse: "\"Shout for joy to the LORD, all the earth. Worship the LORD with gladness; come before him with joyful songs.\"",
    verseRef: "— Psalm 100:1–2 (NIV)", uniqueEmoji: "🎤",
  },
  planning_lead: {
    label: "Planning Lead", emoji: "📋",
    headerStyle: { background: "linear-gradient(135deg, #be185d 0%, #f43f5e 100%)" },
    ringColor: "#fb7185", verseColor: "border-rose-400",
    pillBg: "bg-rose-500/20", pillText: "text-rose-300",
    btnStyle: { background: "linear-gradient(135deg, #be185d, #f43f5e)" },
    reactionTint: "bg-rose-500/15 hover:bg-rose-500/25 text-rose-300",
    message: "Behind every great service is a great plan — and that's you! The team is blessed to have your gifts.",
    verse: "\"Commit to the LORD whatever you do, and he will establish your plans.\"",
    verseRef: "— Proverbs 16:3 (NIV)", uniqueEmoji: "📋",
  },
  musician: {
    label: "Musician", emoji: "🎵",
    headerStyle: { background: "linear-gradient(135deg, #6d28d9 0%, #a855f7 100%)" },
    ringColor: "#c084fc", verseColor: "border-purple-400",
    pillBg: "bg-purple-500/20", pillText: "text-purple-300",
    btnStyle: { background: "linear-gradient(135deg, #6d28d9, #a855f7)" },
    reactionTint: "bg-purple-500/15 hover:bg-purple-500/25 text-purple-300",
    message: "Your musical gift is a blessing to our whole team and congregation. Keep playing for the glory of God!",
    verse: "\"Praise him with the sounding of the trumpet, praise him with the harp and lyre.\"",
    verseRef: "— Psalm 150:3 (NIV)", uniqueEmoji: "🎵",
  },
  audio_tech: {
    label: "Audio / Tech", emoji: "🎛️",
    headerStyle: { background: "linear-gradient(135deg, #0f766e 0%, #06b6d4 100%)" },
    ringColor: "#2dd4bf", verseColor: "border-teal-400",
    pillBg: "bg-teal-500/20", pillText: "text-teal-300",
    btnStyle: { background: "linear-gradient(135deg, #0f766e, #06b6d4)" },
    reactionTint: "bg-teal-500/15 hover:bg-teal-500/25 text-teal-300",
    message: "The ministry wouldn't sound right without you. Your faithful work behind the scenes makes everything possible!",
    verse: "\"Whatever you do, work at it with all your heart, as working for the Lord, not for human masters.\"",
    verseRef: "— Colossians 3:23 (NIV)", uniqueEmoji: "🎛️",
  },
  qa_specialist: {
    label: "QA Specialist", emoji: "🔍",
    headerStyle: { background: "linear-gradient(135deg, #86198f 0%, #d946ef 100%)" },
    ringColor: "#e879f9", verseColor: "border-fuchsia-400",
    pillBg: "bg-fuchsia-500/20", pillText: "text-fuchsia-300",
    btnStyle: { background: "linear-gradient(135deg, #86198f, #d946ef)" },
    reactionTint: "bg-fuchsia-500/15 hover:bg-fuchsia-500/25 text-fuchsia-300",
    message: "Your attention to detail ensures everything runs smoothly. The whole team benefits from your dedication!",
    verse: "\"The wisdom of the prudent is to give thought to their ways.\"",
    verseRef: "— Proverbs 14:8 (NIV)", uniqueEmoji: "🔍",
  },
  member: {
    label: "Member", emoji: "🙏",
    headerStyle: { background: "linear-gradient(135deg, #4338ca 0%, #6d28d9 100%)" },
    ringColor: "#818cf8", verseColor: "border-indigo-400",
    pillBg: "bg-indigo-500/20", pillText: "text-indigo-300",
    btnStyle: { background: "linear-gradient(135deg, #4338ca, #6d28d9)" },
    reactionTint: "bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300",
    message: "We are so blessed to do ministry alongside you. Your presence and heart make our team complete!",
    verse: "\"For I know the plans I have for you, declares the LORD, plans to prosper you and not to harm you, plans to give you hope and a future.\"",
    verseRef: "— Jeremiah 29:11 (NIV)", uniqueEmoji: "🙏",
  },
};

// ── Map member.roles[] → theme key (priority order) ──────────────────────────
function resolveThemeKey(memberRoles: string[], accessRole?: string): string {
  const all = [...(memberRoles ?? [])].map(r => r.toLowerCase());

  // Access-level admin always wins
  if (all.includes("admin") || accessRole === "admin") return "admin";

  // Vocal leadership
  if (all.some(r => r.includes("worship leader") || r === "leader") || accessRole === "leader") return "leader";

  // Planning
  if (all.some(r => r.includes("planning")) || accessRole === "planning_lead") return "planning_lead";

  // Tech / Production roles from constants.ts
  const techRoles = ["audio", "tech", "obs", "live stream", "presentation", "lighting", "camera", "stream"];
  if (all.some(r => techRoles.some(t => r.includes(t))) || accessRole === "audio_tech") return "audio_tech";

  // QA
  if (all.some(r => r.includes("qa")) || accessRole === "qa_specialist") return "qa_specialist";

  // All instrumental/vocal musician roles from constants.ts
  const musicRoles = ["drummer", "bassist", "guitar", "keys", "pianist", "vocalist", "singer", "backup", "choir", "musician", "violin", "saxophone", "trumpet", "keyboard"];
  if (all.some(r => musicRoles.some(m => r.includes(m))) || accessRole === "musician") return "musician";

  return "member";
}

// ── Avatar — supports both http URLs and base64 data:image ───────────────────
function Avatar({ photo, name, size = 64, ring }: { photo?: string | null; name: string; size?: number; ring: string }) {
  const [err, setErr] = useState(false);
  const initials = (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  // Accept both http(s) URLs and base64 data URLs
  const isValidPhoto = !!photo && !err && (photo.startsWith("http") || photo.startsWith("data:image"));
  return (
    <div
      className="rounded-full overflow-hidden shrink-0"
      style={{ width: size, height: size, boxShadow: `0 0 0 3px ${ring}, 0 0 14px 3px ${ring}55` }}
    >
      {isValidPhoto
        ? <img src={photo!} alt={name} className="w-full h-full object-cover" onError={() => setErr(true)} />
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

// ── Props ─────────────────────────────────────────────────────────────────────
interface Wish { userId: string; name: string; photo: string; message: string; sentAt: string; }

interface BirthdayCardProps {
  key?: React.Key;
  member: Member;
  currentUserId: string;
  currentUserName: string;
  currentUserEmail?: string;
  currentUserPhoto?: string;
  celebrantRole?: string;
  /** Called after a greeting is successfully sent, with the celebrant's member ID */
  onGreetingSent?: (memberId: string) => void;
}

const REACTION_EMOJIS = [] as const;


// ── Main component ────────────────────────────────────────────────────────────
export default function BirthdayCard({
  member, currentUserId, currentUserName, currentUserEmail, currentUserPhoto, celebrantRole, onGreetingSent,
}: BirthdayCardProps) {

  const theme = ROLE_THEMES[resolveThemeKey(member.roles ?? [], celebrantRole)] ?? ROLE_THEMES.member;
  const firstName = member.firstName ?? member.name.split(" ")[0];


  // Is the currently logged-in user the birthday person?
  const isSelf = !!currentUserEmail && !!member.email &&
    currentUserEmail.trim().toLowerCase() === member.email.trim().toLowerCase();

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }); // YYYY-MM-DD
  const docId = `${member.id}_${today}`;
  const reactDocRef = doc(db, "birthday_reactions", docId);

  const MAX_WISHES = 1; // max wishes one user can send per celebrant per day

  const [reactions, setReactions] = useState<Record<string, string[]>>({});
  const [wishes, setWishes]       = useState<Wish[]>([]);
  const [wishers, setWishers]     = useState<string[]>([]);
  const [loadingReact, setLoadingReact] = useState(false);
  const [showWishBox, setShowWishBox] = useState(false);
  const [wishText, setWishText]   = useState("");
  const [sending, setSending]     = useState(false);
  const [sent, setSent]           = useState(false);
  // Guards the button until Firestore confirms whether this user already sent
  const [reactionsLoaded, setReactionsLoaded] = useState(false);

  // Live-sync reactions + wishes via real-time listener
  useEffect(() => {
    setReactionsLoaded(false); // reset when celebrant changes
    const unsub = onSnapshot(reactDocRef, (snap) => {
      setReactionsLoaded(true); // Firestore responded — we know the real state
      if (!snap.exists()) return;
      const data = snap.data();
      setReactions(data.reactions ?? {});
      const w: string[] = data.wishers ?? [];
      setWishers(w);
      setWishes(data.wishes ?? []);
    }, () => {
      setReactionsLoaded(true); // also unblock on error so user isn't stuck
    });
    return () => unsub();
  }, [docId]);

  // Derived — how many times this user has already sent a wish today
  const myWishCount = wishes.filter(w => w.userId === currentUserId).length;
  const hasReachedLimit = myWishCount >= MAX_WISHES;
  const wishesLeft = MAX_WISHES - myWishCount;

  // ── Self-healing sync: Firestore is the source of truth ──────────────────
  // The localStorage "already greeted" key might be missing if:
  //   • The user sent before this fix was deployed
  //   • localStorage was cleared
  //   • The API call failed but the wish was partially saved
  // Solution: the moment Firestore confirms this user already sent today,
  // call onGreetingSent immediately — this writes the key AND closes the modal.
  const healedRef = React.useRef(false);
  useEffect(() => {
    if (!isSelf && reactionsLoaded && hasReachedLimit && !healedRef.current) {
      healedRef.current = true;
      onGreetingSent?.(member.id);
    }
  }, [reactionsLoaded, hasReachedLimit, isSelf]);



  // Toggle emoji reaction (Firestore)
  const handleReact = useCallback(async (emoji: string) => {
    if (loadingReact) return;
    setLoadingReact(true);
    const current = reactions[emoji] ?? [];
    const hasReacted = current.includes(currentUserId);
    setReactions(prev => ({
      ...prev,
      [emoji]: hasReacted
        ? prev[emoji].filter(id => id !== currentUserId)
        : [...(prev[emoji] ?? []), currentUserId],
    }));
    try {
      const snap = await getDoc(reactDocRef);
      if (!snap.exists()) {
        await setDoc(reactDocRef, { memberId: member.id, date: today, reactions: { [emoji]: [currentUserId] }, wishers: [], wishes: [] });
      } else {
        await updateDoc(reactDocRef, {
          [`reactions.${emoji}`]: hasReacted ? arrayRemove(currentUserId) : arrayUnion(currentUserId),
        });
      }
    } catch {
      setReactions(prev => ({ ...prev, [emoji]: current }));
    } finally {
      setLoadingReact(false);
    }
  }, [reactions, currentUserId, loadingReact]);

  // Open the wish text box
  const handleWishClick = () => {
    if (hasReachedLimit) return;
    setShowWishBox(true);
  };

  // Submit wish message → /api/birthday-wish (writes Firestore + fires notification)
  const handleSendWish = async () => {
    if (sending || hasReachedLimit) return;
    setSending(true);
    const message = wishText.trim() || "Happy Birthday! 🎉";
    // ── Optimistic UI update ───────────────────────────────────────────────
    setSent(true);
    setShowWishBox(false);
    setWishText("");
    const newWish: Wish = {
      userId: currentUserId,
      name: currentUserName,
      photo: currentUserPhoto?.startsWith("http") ? currentUserPhoto : "",
      message,
      sentAt: new Date().toISOString(),
    };
    setWishes(prev => [...prev, newWish]);
    setWishers(prev => prev.includes(currentUserId) ? prev : [...prev, currentUserId]);

    // ── Notify parent IMMEDIATELY (before the API call) ────────────────────
    // This ensures the localStorage "already greeted" key is written RIGHT NOW,
    // so no matter how fast the user navigates away, the modal will never pop again.
    onGreetingSent?.(member.id);

    try {
      await fetch("/api/birthday-wish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: member.id,
          memberName: member.name,
          date: today,
          senderUserId: currentUserId,
          senderName: currentUserName,
          senderPhoto: currentUserPhoto?.startsWith("http") ? currentUserPhoto : "",
          message,
        }),
      });
    } catch {
      // Revert optimistic UI on failure
      setSent(false);
      setWishes(prev => prev.filter((w, i) => !(w.userId === currentUserId && i === prev.length - 1)));
    } finally {
      setSending(false);
      setTimeout(() => setSent(false), 2000);
    }
  };

  return (
    <>
      <style>{`
        @keyframes bdShimmer { 0% { transform:translateX(-100%) skewX(-15deg); } 100% { transform:translateX(250%) skewX(-15deg); } }
        @keyframes bdFloat  { 0%,100% { transform:translateY(0) rotate(0deg); } 50% { transform:translateY(-6px) rotate(4deg); } }
        .bd-shimmer::after { content:''; position:absolute; inset:0; background:linear-gradient(90deg,transparent 20%,rgba(255,255,255,.18) 50%,transparent 80%); animation:bdShimmer 2.8s ease-in-out infinite; pointer-events:none; }
        .bd-cake { animation:bdFloat 3s ease-in-out infinite; display:inline-block; }
        .bd-dot  { position:absolute; border-radius:50%; opacity:.55; animation:bdFloat 2.5s ease-in-out infinite; }
      `}</style>

      <div className="w-full rounded-2xl overflow-hidden shadow-2xl bg-gray-900 border border-white/5 flex flex-col">

        {/* ── Themed header ─────────────────────────────────────────────── */}
        <div
          className="relative overflow-hidden flex flex-col items-center justify-center pt-6 pb-10 bd-shimmer"
          style={{ ...theme.headerStyle, minHeight: 100 }}
        >
          {/* Floating dots */}
          {[["#fff",6,"20%","15%","0s"],["#fff9",8,"55%","75%","0.7s"],["#fffd",5,"35%","88%","1.4s"],
            ["#fff8",4,"70%","30%","0.5s"],["#fffb",5,"25%","50%","1s"],["#fff6",3,"80%","60%","1.5s"]
          ].map(([c,s,t,l,d],i) => (
            <span key={i} className="bd-dot" style={{ width:s, height:s, background:c as string, top:t as string, left:l as string, animationDelay:d as string }} />
          ))}
          <span className="bd-cake text-4xl z-10">🎂</span>
        </div>

        {/* ── Avatar overlapping header ──────────────────────────────────── */}
        <div className="flex flex-col items-center -mt-8 px-5 z-10 pb-5">
          <Avatar photo={member.photo} name={member.name} size={72} ring={theme.ringColor} />

          {/* Name */}
          <h2 className="mt-3 text-xl font-bold text-white text-center leading-tight">
            {isSelf ? `🎉 It's Your Birthday, ${firstName}!` : `Happy Birthday, ${firstName}! 🎉`}
          </h2>

          {/* Role pill */}
          <div className={`mt-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${theme.pillBg} ${theme.pillText}`}>
            <span>{theme.emoji}</span><span>{theme.label}</span>
          </div>

          {/* Message (only for non-self) */}
          {!isSelf && (
            <p className="mt-3 text-sm text-gray-400 text-center leading-relaxed px-1">{theme.message}</p>
          )}

          {/* Bible verse */}
          <div className={`mt-3 w-full border-l-4 ${theme.verseColor} pl-3 py-1`}>
            <p className="text-xs text-gray-300 italic leading-relaxed">{theme.verse}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{theme.verseRef}</p>
          </div>



          {/* ── If self: show wish feed ──────────────────────────────────── */}
          {isSelf && wishes.length > 0 && (
            <div className="mt-4 w-full">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 text-center">
                💌 Birthday Greetings from your team
              </p>
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {wishes.map((w, i) => (
                  <div key={i} className="flex items-start gap-2.5 bg-white/5 rounded-xl p-2.5">
                    <Avatar photo={w.photo} name={w.name} size={30} ring={theme.ringColor} />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-200 leading-tight">{w.name}</p>
                      <p className="text-xs text-gray-400 leading-relaxed mt-0.5 break-words">{w.message || "Happy Birthday! 🎉"}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-gray-500 mt-2 text-center">
                {wishes.length} teammate{wishes.length !== 1 ? "s" : ""} sent you greetings 🎊
              </p>
            </div>
          )}

          {isSelf && wishes.length === 0 && (
            <p className="mt-4 text-xs text-gray-500 text-center italic">No greetings yet — your teammates will show up here 🎊</p>
          )}

          {/* ── If not self: guard entire button area until Firestore confirms ── */}
          {!isSelf && (
            !reactionsLoaded ? (
              /* Shimmer placeholder while Firestore loads — prevents flash of Send button */
              <div className="mt-4 mb-5 w-full py-3 rounded-xl bg-white/5 animate-pulse" style={{ height: 48 }} />
            ) : hasReachedLimit ? (
              /* Already sent a greeting today */
              <div className="mt-4 mb-5 w-full py-3 rounded-xl text-sm font-bold text-center text-gray-400 bg-white/5">
                Greeting Sent ✓
                {wishers.length > 0 && (
                  <p className="text-[11px] font-normal text-gray-500 mt-0.5">
                    {wishers.length} teammate{wishers.length !== 1 ? "s" : ""} sent greetings 🎊
                  </p>
                )}
              </div>
            ) : showWishBox ? (
              /* Write + send message box */
              <div className="mt-4 mb-5 w-full space-y-2">
                <textarea
                  autoFocus
                  rows={3}
                  value={wishText}
                  onChange={e => setWishText(e.target.value)}
                  maxLength={200}
                  placeholder={`Write a message for ${firstName}... (optional)`}
                  className="w-full px-3 py-2 rounded-xl bg-white/10 text-white text-sm placeholder-gray-500 border border-white/10 focus:outline-none focus:border-white/30 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowWishBox(false)}
                    className="flex-1 py-2 rounded-xl text-sm font-semibold text-gray-400 bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendWish}
                    disabled={sending}
                    className="flex-1 py-2 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-60"
                    style={theme.btnStyle}
                  >
                    {sending ? "Sending..." : <><Send size={14} className="inline mr-1.5" />Send</>}
                  </button>
                </div>
              </div>
            ) : (
              /* Send button — only shown when not yet greeted */
              <button
                onClick={handleWishClick}
                className="mt-4 mb-5 w-full py-3 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98] shadow-lg hover:opacity-90"
                style={theme.btnStyle}
              >
                Send Birthday Greetings 🎉
              </button>
            )
          )}


        </div>
      </div>
    </>
  );
}
