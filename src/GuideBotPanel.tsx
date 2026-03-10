import React, { useState, useRef, useEffect } from "react";
import { Bot, X, Send, Music, Users, Calendar, Shield, NotepadText, ChevronRight, Sparkles } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Message {
    id: number;
    from: "bot" | "user";
    text: string;
    chips?: string[];
    navTarget?: "songs" | "members" | "schedule" | "admin";
    navLabel?: string;
}

interface Props {
    onNavigate: (view: "songs" | "members" | "schedule" | "admin") => void;
}

// ── Knowledge Base ─────────────────────────────────────────────────────────────
interface KBEntry {
    keywords: string[];
    response: string;
    chips?: string[];
    navTarget?: "songs" | "members" | "schedule" | "admin";
    navLabel?: string;
}

const KNOWLEDGE_BASE: KBEntry[] = [
    // Songs
    {
        keywords: ["add song", "create song", "new song", "add a song", "how to add"],
        response: "To add a new song:\n1. Go to **Song Management** (guitar icon in the sidebar)\n2. Tap the ＋ button at the top right\n3. Fill in Title, Artist, Lyrics & Chords\n4. Tap **Save Song** ✅\n\nYou can also upload a photo of lyrics — the AI will extract the text for you!",
        chips: ["How do I edit a song?", "What are song tags?", "How does OCR work?"],
        navTarget: "songs",
        navLabel: "Go to Songs",
    },
    {
        keywords: ["edit song", "update song", "change song", "modify song"],
        response: "To edit a song:\n1. Open **Song Management**\n2. Click on any song card to view it\n3. Tap the **Edit** (pencil) button in the top-right corner\n4. Make your changes and hit **Save Song** ✅\n\nYou can edit title, artist, lyrics, chords, tags, and video link.",
        chips: ["How do I delete a song?", "What are song tags?", "Can I print a song?"],
        navTarget: "songs",
        navLabel: "Go to Songs",
    },
    {
        keywords: ["delete song", "remove song"],
        response: "To delete a song:\n1. Open the song you want to delete\n2. Tap the **🗑 Delete** button (admin only)\n\nYou can also bulk-delete songs by entering **Selection Mode** — tap the checkbox icon in the top bar, select songs, then tap Delete Selected.",
        chips: ["How do I add a song?", "How do I bulk delete?"],
        navTarget: "songs",
        navLabel: "Go to Songs",
    },
    {
        keywords: ["tag", "tags", "song tag", "category", "filter songs"],
        response: "**Song Tags** let you categorize songs (e.g. 'Solemn', 'Joyful', 'Christmas').\n\n• To **create a tag**: Admin Panel → Tags section\n• To **assign a tag**: When editing a song, select the tag\n• To **filter by tag**: Use the Filter button 🔽 in Song Management\n\nTags also drive the Setlist song-type rules in Scheduling.",
        chips: ["How do I add a song?", "How does scheduling work?"],
    },
    {
        keywords: ["ocr", "upload photo", "image", "extract lyrics", "scan"],
        response: "The **AI OCR** feature can extract lyrics or chords from a photo:\n1. Edit or create a song\n2. In the Lyrics or Chords section, tap **Upload Screenshot**\n3. Choose a photo of handwritten or printed lyrics\n4. The AI will auto-fill the text field!\n\nSupports PNG, JPG, WEBP.",
        chips: ["How do I add a song?", "How do I edit a song?"],
        navTarget: "songs",
        navLabel: "Go to Songs",
    },
    {
        keywords: ["transpose", "key", "semitone", "chords key"],
        response: "To **transpose chords** on a song:\n1. Open the song detail view\n2. Find the **+/−** transpose buttons next to the Chords section\n3. Tap to shift up or down by semitones\n\nThe transposition is live — it doesn't save permanently to the database.",
        chips: ["How do I edit a song?", "How do I print a song?"],
        navTarget: "songs",
        navLabel: "Go to Songs",
    },
    {
        keywords: ["print", "printing", "print song"],
        response: "To **print a song**:\n1. Open any song in detail view\n2. Tap the **🖨 Print** button in the top-right area\n3. A print dialog will open with lyrics + chords formatted side-by-side\n\nThe print layout is clean and optimized — no UI chrome.",
        chips: ["How do I view a song?", "How do I transpose chords?"],
        navTarget: "songs",
        navLabel: "Go to Songs",
    },
    {
        keywords: ["search", "find song", "search songs"],
        response: "To **search songs**:\n• Use the 🔍 search bar at the top of Song Management\n• It searches across title, artist, lyrics, chords, and tags in real-time\n• Use the **Filter** button to narrow by tag\n• Switch between **Grid** and **List** view with the view toggle",
        chips: ["What are song tags?", "How do I add a song?"],
        navTarget: "songs",
        navLabel: "Go to Songs",
    },

    // Schedule
    {
        keywords: ["schedule", "scheduling", "calendar", "event", "service", "setlist", "how does schedule"],
        response: "The **Scheduling** module lets you plan worship services:\n\n• Tap a date on the calendar to add or view events\n• Service types: **Sunday Service**, **Midweek Service**, **Practice**, **Special Event**\n• Assign members to roles (Worship Leader, Musicians, Audio/Tech)\n• Build a song lineup (Solemn + Joyful songs)\n\nOnly Admins and Planning Leads can write to the schedule.",
        chips: ["How do I add an event?", "What are member roles?", "How do I assign songs to a service?"],
        navTarget: "schedule",
        navLabel: "Go to Schedule",
    },
    {
        keywords: ["add event", "create event", "new event"],
        response: "To **add a schedule event**:\n1. Go to **Scheduling**\n2. Tap any date on the calendar\n3. Tap **Add Event**\n4. Fill in event name, type, time, location\n5. Assign Worship Leader, Musicians, Audio/Tech\n6. (For services) Pick songs for the setlist\n7. Tap **Save** ✅",
        chips: ["How do I assign member roles?", "How do I add songs to a setlist?"],
        navTarget: "schedule",
        navLabel: "Go to Schedule",
    },

    // Members
    {
        keywords: ["member", "members", "team", "team members", "people", "who"],
        response: "The **Team Members** section shows all worship team members:\n\n• View name, role, photo, phone number\n• Search and filter members\n• Tap a member to view/edit their profile\n• Add new members with the ＋ button\n\nEach member has a role (Member, Musician, Leader, Audio/Tech, Planning Lead, Admin).",
        chips: ["How do I add a member?", "What are member roles?", "How do I edit a member?"],
        navTarget: "members",
        navLabel: "Go to Members",
    },
    {
        keywords: ["add member", "new member", "create member"],
        response: "To **add a team member**:\n1. Go to **Team Members**\n2. Tap the **＋ Add Member** button\n3. Fill in: Name, Role, Phone, Email (optional), Profile Photo\n4. Tap **Save Member** ✅\n\nOnly Admins and Worship Leaders can add members.",
        chips: ["What are member roles?", "How do I edit a member?"],
        navTarget: "members",
        navLabel: "Go to Members",
    },
    {
        keywords: ["role", "roles", "permission", "permissions", "access"],
        response: "**Member Roles** and their permissions:\n\n🔵 **Member** — view only\n🟣 **Musician** — add/edit songs\n🟢 **Audio/Tech** — add/edit songs\n🔵 **Worship Leader** — songs + schedule\n🟠 **Planning Lead** — songs + schedule\n🔴 **Admin** — full access to everything\n\nRoles can be updated in the **Admin Panel** → Team Access tab.",
        chips: ["How do I change a user's role?", "What is the Admin Panel?"],
        navTarget: "admin",
        navLabel: "Go to Admin Panel",
    },

    // Notes
    {
        keywords: ["note", "notes", "team note", "notespad", "feedback", "bug report"],
        response: "The **Team Notes** panel (📝 icon in the top bar) lets team members:\n\n• Post **Bug reports**, **Feature requests**, or **General notes**\n• Attach images and screen recordings\n• React with status badges (Seen, Investigating, Coding, Fixing, On it, Nevermind)\n• Mark notes as Resolved\n• Delete notes (moves to Trash for 15 days)\n\nClick the 📝 notepad icon in the top navigation bar!",
        chips: ["How do I create a note?", "What is the trash bin?", "What are note reactions?"],
    },
    {
        keywords: ["create note", "add note", "post note", "new note"],
        response: "To **create a team note**:\n1. Tap the 📝 **notepad icon** in the top navigation bar\n2. Tap the **＋ New Note** button\n3. Choose type: Bug, Feature, or General\n4. Write your note — you can attach an image or video\n5. Tap **Post Note** ✅",
        chips: ["What are note reactions?", "How does the trash bin work?"],
    },
    {
        keywords: ["trash", "recently deleted", "delete note", "restore note"],
        response: "**Note Trash Bin:**\n• When you delete a note, it moves to **Recently Deleted**\n• Notes in trash are auto-deleted after **15 days**\n• To access trash: open the Notes panel → tap the 🗑 Archive icon\n• You can **restore** individual notes or **permanently delete** from trash\n\nOnly the note author and admins can delete notes.",
        chips: ["How do I create a note?", "What are note reactions?"],
    },

    // Admin Panel
    {
        keywords: ["admin", "admin panel", "access", "approve user", "approve"],
        response: "The **Admin Panel** (shield icon, admin only) gives you:\n\n• **Team Access** — approve new users, change roles, revoke access\n• **Broadcast** — send app-wide announcements to the team\n• Pending access requests appear automatically when someone tries to login\n\nGo to Admin Panel to manage your team's access.",
        chips: ["How do I approve a user?", "How do broadcasts work?", "How do I change a user's role?"],
        navTarget: "admin",
        navLabel: "Go to Admin Panel",
    },
    {
        keywords: ["approve", "approve user", "pending", "access request"],
        response: "To **approve a user's access request**:\n1. Open **Admin Panel**\n2. Under **Pending Requests**, you'll see users who tried to log in\n3. Select their role (Member, Musician, etc.)\n4. Tap **Approve** ✅\n\nThey'll immediately gain access to the app with that role.",
        chips: ["What are member roles?", "How do I revoke access?"],
        navTarget: "admin",
        navLabel: "Go to Admin Panel",
    },
    {
        keywords: ["broadcast", "announcement", "notify team", "notification"],
        response: "To **send a broadcast** to the team:\n1. Open **Admin Panel** → **Broadcasts** tab\n2. Tap **New Broadcast**\n3. Choose type: **What's New** or **Maintenance**\n4. Fill in title and message (or tap ✨ Auto-generate!)\n5. Choose who sees it: Everyone or specific members\n6. Tap **Send Broadcast** ✅\n\nActive broadcasts appear as a banner when team members open the app.",
        chips: ["How do I manage the team?", "What is the Admin Panel?"],
        navTarget: "admin",
        navLabel: "Go to Admin Panel",
    },

    // App settings
    {
        keywords: ["dark mode", "light mode", "theme", "dark", "appearance"],
        response: "To toggle **Dark / Light mode**:\n• Tap the **🌙 Moon** icon (or ☀️ Sun icon) in the top navigation bar\n\nThe setting is saved automatically and applies across the whole app.",
        chips: ["Where is my profile?", "How do I log out?"],
    },
    {
        keywords: ["profile", "my profile", "account", "avatar", "photo"],
        response: "To view or edit **your profile**:\n• Tap your **avatar photo** in the top-right corner of the navigation bar\n• You can see your name, role, and account info\n\nTo update your profile photo or info, edit your member record in **Team Members**.",
        chips: ["How do I edit a member?", "How do I log out?"],
        navTarget: "members",
        navLabel: "Go to Members",
    },
    {
        keywords: ["logout", "log out", "sign out"],
        response: "To **log out**:\n• Tap your **avatar photo** in the top-right corner\n• Select **Sign Out** from the menu\n\nYou'll be redirected to the login page.",
        chips: ["Where is my profile?"],
    },
    {
        keywords: ["help", "guide", "tutorial", "how to use", "documentation"],
        response: "There are two help resources in the app:\n\n❓ **Help & KB Panel** — tap the **?** icon in the top bar for full documentation and FAQs\n\n🤖 **Me (Guide Bot)** — I'm here to answer quick questions! Just type what you need help with.\n\nWhat area can I help you with?",
        chips: ["How do I add a song?", "How does scheduling work?", "What are member roles?", "How do team notes work?"],
    },
];

// ── Quick-start chips ─────────────────────────────────────────────────────────
const QUICK_CHIPS = [
    "How do I add a song?",
    "How does scheduling work?",
    "What are member roles?",
    "How do team notes work?",
    "How do I approve a user?",
    "How do broadcasts work?",
    "How do I transpose chords?",
];

// ── Bot response logic ────────────────────────────────────────────────────────
function findAnswer(query: string): KBEntry | null {
    const q = query.toLowerCase();
    let best: KBEntry | null = null;
    let bestScore = 0;
    for (const entry of KNOWLEDGE_BASE) {
        for (const kw of entry.keywords) {
            if (q.includes(kw)) {
                const score = kw.length;
                if (score > bestScore) { bestScore = score; best = entry; }
            }
        }
    }
    return best;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function GuideBotPanel({ onNavigate }: Props) {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [typing, setTyping] = useState(false);
    const [pulse, setPulse] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    let msgId = useRef(0);

    const nextId = () => ++msgId.current;

    // Welcome message on first open
    useEffect(() => {
        if (open && messages.length === 0) {
            setMessages([{
                id: nextId(),
                from: "bot",
                text: "👋 Hi! I'm your **WorshipFlow Guide Bot**.\n\nI can help you navigate the app — just ask me anything, or pick a topic below!",
                chips: QUICK_CHIPS.slice(0, 4),
            }]);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
        if (open) setPulse(false);
    }, [open]);

    // Auto-scroll to latest message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, typing]);

    const sendMessage = (text: string) => {
        if (!text.trim() || typing) return;
        const userMsg: Message = { id: nextId(), from: "user", text: text.trim() };
        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setTyping(true);

        setTimeout(() => {
            const match = findAnswer(text);
            const botMsg: Message = match
                ? {
                    id: nextId(),
                    from: "bot",
                    text: match.response,
                    chips: match.chips,
                    navTarget: match.navTarget,
                    navLabel: match.navLabel,
                }
                : {
                    id: nextId(),
                    from: "bot",
                    text: "🤔 I'm not sure about that one! Try rephrasing, or pick a topic below:",
                    chips: QUICK_CHIPS.slice(0, 4),
                };
            setMessages(prev => [...prev, botMsg]);
            setTyping(false);
        }, 700);
    };

    // Format bold **text** in bot messages
    const formatText = (text: string) => {
        const parts = text.split(/(\*\*[^*]+\*\*)/g);
        return parts.map((p, i) =>
            p.startsWith("**") && p.endsWith("**")
                ? <strong key={i} className="font-semibold text-white">{p.slice(2, -2)}</strong>
                : <span key={i}>{p}</span>
        );
    };

    return (
        <>
            {/* ── Floating trigger button ── */}
            <button
                onClick={() => setOpen(v => !v)}
                title="WorshipFlow Guide Bot (Admin only)"
                className={`fixed bottom-6 right-6 z-[400] w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl transition-all duration-300 active:scale-95 ${open
                    ? "bg-gray-800 dark:bg-gray-700 rotate-0"
                    : "bg-gradient-to-br from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 hover:scale-105"
                    }`}
            >
                {open
                    ? <X size={22} className="text-white" />
                    : <>
                        <Bot size={24} className="text-white" />
                        {pulse && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-400 border-2 border-white dark:border-gray-900 animate-pulse" />
                        )}
                    </>
                }
            </button>

            {/* ── Chat panel ── */}
            {open && (
                <div
                    className="fixed bottom-24 right-6 z-[399] w-[min(390px,calc(100vw-24px))] h-[min(560px,calc(100vh-120px))] flex flex-col rounded-3xl overflow-hidden shadow-2xl border border-gray-700/60"
                    style={{ animation: "slideUpFade 0.2s ease-out" }}
                >
                    {/* Header */}
                    <div className="flex items-center gap-3 px-4 py-3.5 bg-gradient-to-r from-indigo-700 to-violet-700 shrink-0">
                        <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                            <Bot size={20} className="text-white" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-white leading-tight">WorshipFlow Guide</p>
                            <p className="text-[10px] text-indigo-200 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" /> Admin only · Always online
                            </p>
                        </div>
                        <div className="ml-auto flex items-center gap-1.5">
                            <Sparkles size={14} className="text-indigo-300" />
                            <span className="text-[10px] text-indigo-200 font-medium">Scripted AI</span>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-3 py-3 bg-gray-900 space-y-3">
                        {messages.map(msg => (
                            <div key={msg.id} className={`flex flex-col ${msg.from === "user" ? "items-end" : "items-start"}`}>
                                {/* Bubble */}
                                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${msg.from === "user"
                                    ? "bg-indigo-600 text-white rounded-br-sm"
                                    : "bg-gray-800 text-gray-200 rounded-bl-sm"
                                    }`}>
                                    {msg.from === "bot" ? formatText(msg.text) : msg.text}
                                </div>

                                {/* Nav button */}
                                {msg.navTarget && msg.navLabel && (
                                    <button
                                        onClick={() => { onNavigate(msg.navTarget!); setOpen(false); }}
                                        className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors px-1"
                                    >
                                        {msg.navTarget === "songs" && <Music size={12} />}
                                        {msg.navTarget === "members" && <Users size={12} />}
                                        {msg.navTarget === "schedule" && <Calendar size={12} />}
                                        {msg.navTarget === "admin" && <Shield size={12} />}
                                        {msg.navLabel} <ChevronRight size={12} />
                                    </button>
                                )}

                                {/* Quick-reply chips */}
                                {msg.chips && (
                                    <div className="flex flex-wrap gap-1.5 mt-2 max-w-[90%]">
                                        {msg.chips.map(chip => (
                                            <button
                                                key={chip}
                                                onClick={() => sendMessage(chip)}
                                                className="text-[11px] px-2.5 py-1 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600 hover:border-gray-500 transition-all active:scale-95"
                                            >
                                                {chip}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Typing indicator */}
                        {typing && (
                            <div className="flex items-start">
                                <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                                    {[0, 150, 300].map(d => (
                                        <span
                                            key={d}
                                            className="w-1.5 h-1.5 rounded-full bg-indigo-400"
                                            style={{ animation: `bounce 1s ${d}ms infinite` }}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="flex items-center gap-2 px-3 py-3 bg-gray-800 border-t border-gray-700/60 shrink-0">
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                            placeholder="Ask me anything about the app..."
                            className="flex-1 bg-gray-700 text-gray-100 text-sm rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
                        />
                        <button
                            onClick={() => sendMessage(input)}
                            disabled={!input.trim() || typing}
                            className="w-9 h-9 flex items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-90"
                        >
                            <Send size={15} className="text-white" />
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
