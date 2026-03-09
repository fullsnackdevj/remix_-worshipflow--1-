import React, { useState, useRef, useEffect } from "react";
import { X, HelpCircle, ChevronRight, ChevronLeft, Bell, BookOpen, Calendar, Users, Shield, Smartphone, Search } from "lucide-react";

// ── Article definitions ──────────────────────────────────────────────────────
interface Article {
    id: string;
    icon: React.ReactNode;
    title: string;
    summary: string;
    adminOnly?: boolean;
    content: React.ReactNode;
}

const ARTICLES: Article[] = [
    {
        id: "push-notifications",
        icon: <Bell size={16} />,
        title: "How to enable Push Notifications",
        summary: "Stay updated on songs, schedules & team changes.",
        content: (
            <div className="space-y-5 text-sm text-gray-300 leading-relaxed">
                <section>
                    <h3 className="text-white font-semibold mb-2 flex items-center gap-2"><Smartphone size={14} className="text-indigo-400" /> iPhone / iPad (iOS)</h3>
                    <p className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2 mb-3">iOS requires the app to be installed first before notifications work.</p>
                    <p className="font-medium text-gray-200 mb-1">Step 1 — Install the app</p>
                    <ol className="list-decimal list-inside space-y-1 text-gray-400 pl-1">
                        <li>Open <strong className="text-white">Safari</strong> on your iPhone (must be Safari, not Chrome)</li>
                        <li>Go to your WorshipFlow URL</li>
                        <li>Tap the <strong className="text-white">Share button</strong> at the bottom</li>
                        <li>Scroll down, tap <strong className="text-white">"Add to Home Screen"</strong></li>
                        <li>Tap <strong className="text-white">"Add"</strong> — app icon appears on home screen</li>
                    </ol>
                    <p className="font-medium text-gray-200 mb-1 mt-3">Step 2 — Enable notifications</p>
                    <ol className="list-decimal list-inside space-y-1 text-gray-400 pl-1">
                        <li>Open the app <strong className="text-white">from your Home Screen</strong> (not from Safari directly)</li>
                        <li>A banner will appear at the top — tap <strong className="text-white">"Enable"</strong></li>
                        <li>Tap <strong className="text-white">"Allow"</strong> on the system prompt</li>
                    </ol>
                </section>

                <section>
                    <h3 className="text-white font-semibold mb-2">Android (Chrome)</h3>
                    <ol className="list-decimal list-inside space-y-1 text-gray-400 pl-1">
                        <li>Open <strong className="text-white">Chrome</strong> and go to your WorshipFlow URL</li>
                        <li>Tap <strong className="text-white">"Enable"</strong> on the banner at the top</li>
                        <li>Tap <strong className="text-white">"Allow"</strong> on the browser prompt</li>
                    </ol>
                    <p className="text-xs text-gray-500 mt-2">Optional: tap the 3-dot menu and select "Add to Home Screen" for the best experience.</p>
                </section>

                <section>
                    <h3 className="text-white font-semibold mb-2">Desktop (Chrome / Edge)</h3>
                    <ol className="list-decimal list-inside space-y-1 text-gray-400 pl-1">
                        <li>Open the app in Chrome or Edge</li>
                        <li>Click <strong className="text-white">"Enable"</strong> on the notification banner</li>
                        <li>Click <strong className="text-white">"Allow"</strong> on the browser prompt</li>
                    </ol>
                </section>

                <section className="border-t border-gray-700 pt-4">
                    <p className="font-medium text-gray-200 mb-1">Did not see the banner?</p>
                    <p className="text-gray-400 text-xs"><strong className="text-white">iPhone:</strong> Settings &rarr; Safari &rarr; Advanced &rarr; Website Data &rarr; clear WorshipFlow, then reinstall via Add to Home Screen.</p>
                    <p className="text-gray-400 text-xs mt-1"><strong className="text-white">Android / Desktop:</strong> Click the lock icon in the address bar &rarr; Notifications &rarr; set to "Allow" &rarr; refresh.</p>
                </section>
            </div>
        ),
    },
    {
        id: "songs",
        icon: <BookOpen size={16} />,
        title: "How to add & manage songs",
        summary: "Add songs, attach lyrics, video links and tags.",
        content: (
            <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
                <section>
                    <h3 className="text-white font-semibold mb-2">Adding a new song</h3>
                    <ol className="list-decimal list-inside space-y-1 text-gray-400 pl-1">
                        <li>Go to <strong className="text-white">Song Management</strong> in the sidebar</li>
                        <li>Click the <strong className="text-white">+ button</strong> at the top right</li>
                        <li>Fill in the title, artist, language, key, and tempo</li>
                        <li>Paste lyrics or upload an image of the chord sheet</li>
                        <li>Add a YouTube / SoundCloud link if available</li>
                        <li>Assign tags (e.g. Joyful, Solemn, Tagalog) and click <strong className="text-white">Save</strong></li>
                    </ol>
                </section>
                <section>
                    <h3 className="text-white font-semibold mb-2">Searching songs</h3>
                    <p className="text-gray-400">Use the search bar to find any song by <strong className="text-white">title, artist, language, or tag</strong>. You can also filter by tag using the tag chips below the search bar.</p>
                </section>
                <section>
                    <h3 className="text-white font-semibold mb-2">Editing or deleting</h3>
                    <p className="text-gray-400">Open any song card and use the <strong className="text-white">Edit (pencil)</strong> icon to modify details. Only Admins can permanently delete songs.</p>
                </section>
            </div>
        ),
    },
    {
        id: "schedule",
        icon: <Calendar size={16} />,
        title: "How to build a Service Schedule",
        summary: "Plan services, assign roles, and set song lineups.",
        content: (
            <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
                <section>
                    <h3 className="text-white font-semibold mb-2">Creating an event</h3>
                    <ol className="list-decimal list-inside space-y-1 text-gray-400 pl-1">
                        <li>Go to <strong className="text-white">Scheduling</strong> in the sidebar</li>
                        <li>Click any date on the calendar</li>
                        <li>Click <strong className="text-white">"+ Add Event"</strong> and fill in the event name</li>
                        <li>Set the time and any notes</li>
                        <li>Click <strong className="text-white">Save</strong></li>
                    </ol>
                </section>
                <section>
                    <h3 className="text-white font-semibold mb-2">Assigning team members</h3>
                    <p className="text-gray-400">After creating an event, open it and scroll to <strong className="text-white">Lead Facilitators</strong>. Add a role group (e.g. Worship Leader) and assign members from your team list.</p>
                </section>
                <section>
                    <h3 className="text-white font-semibold mb-2">Setting the song lineup</h3>
                    <p className="text-gray-400">For Sunday services, scroll to <strong className="text-white">Song Line-Up</strong> and pick one Joyful and one Solemn song from the library. Songs must be added to Song Management first before they appear here.</p>
                </section>
            </div>
        ),
    },
    {
        id: "roles",
        icon: <Users size={16} />,
        title: "Understanding Roles & Permissions",
        summary: "What each role can see and do in the app.",
        content: (
            <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
                <p className="text-gray-400">Each team member is assigned a role that controls what they can access in WorshipFlow.</p>
                <div className="space-y-3">
                    {[
                        { role: "Admin", color: "text-amber-400", desc: "Full access — manage members, schedules, songs, broadcasts, and team settings." },
                        { role: "Planning Lead", color: "text-rose-400", desc: "Can create and manage schedules and assign team members. Cannot delete songs." },
                        { role: "Worship Leader", color: "text-indigo-400", desc: "Can view and edit songs and schedules. Cannot manage team access." },
                        { role: "Musician", color: "text-purple-400", desc: "Can view songs and schedules. Cannot make edits or manage members." },
                        { role: "Audio / Tech", color: "text-teal-400", desc: "Same as Musician — view-only access for songs and schedules." },
                        { role: "Member", color: "text-gray-400", desc: "Basic access — can view songs only." },
                    ].map(r => (
                        <div key={r.role} className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/50">
                            <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${r.color}`}>{r.role}</p>
                            <p className="text-xs text-gray-400">{r.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        ),
    },
    {
        id: "broadcasts",
        icon: <Shield size={16} />,
        title: "How to send a Broadcast (Admin)",
        summary: "Notify the team with What's New or Maintenance alerts.",
        adminOnly: true,
        content: (
            <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
                <section>
                    <h3 className="text-white font-semibold mb-2">Creating a broadcast</h3>
                    <ol className="list-decimal list-inside space-y-1 text-gray-400 pl-1">
                        <li>Go to <strong className="text-white">Team Access</strong> in the sidebar</li>
                        <li>Click the <strong className="text-white">Broadcasts tab</strong></li>
                        <li>Click <strong className="text-white">"+ Create Broadcast"</strong></li>
                        <li>Choose the type: <strong className="text-white">What's New</strong> (dismissible) or <strong className="text-white">Maintenance</strong> (blocks the app)</li>
                        <li>Fill in the title and message — or click <strong className="text-white">Auto-generate</strong> for instant content</li>
                        <li>Choose who sees it — all members or specific emails</li>
                        <li>Click <strong className="text-white">Send Broadcast</strong></li>
                    </ol>
                </section>
                <section>
                    <h3 className="text-white font-semibold mb-2">Turning a broadcast off</h3>
                    <p className="text-gray-400">In the Broadcasts list, toggle the switch next to any active broadcast to deactivate it instantly. Members will no longer see the screen.</p>
                </section>
            </div>
        ),
    },
];

// ── Component ────────────────────────────────────────────────────────────────
interface HelpPanelProps {
    isAdmin: boolean;
}

export default function HelpPanel({ isAdmin }: HelpPanelProps) {
    const [open, setOpen] = useState(false);
    const [activeArticle, setActiveArticle] = useState<Article | null>(null);
    const [query, setQuery] = useState("");
    const panelRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const visibleArticles = ARTICLES.filter(a => !a.adminOnly || isAdmin);
    const filteredArticles = query.trim()
        ? visibleArticles.filter(a =>
            a.title.toLowerCase().includes(query.toLowerCase()) ||
            a.summary.toLowerCase().includes(query.toLowerCase())
        )
        : visibleArticles;

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setOpen(false);
                setActiveArticle(null);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    return (
        <div ref={panelRef} className="relative">
            {/* Trigger button */}
            <button
                onClick={() => { setOpen(o => !o); setActiveArticle(null); setQuery(""); }}
                className="relative p-2 rounded-xl text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                title="Help & Knowledge Base"
            >
                <HelpCircle size={20} />
            </button>

            {/* Panel */}
            {open && (
                <div
                    className="fixed sm:absolute right-2 sm:right-0 bg-gray-900 border border-gray-700/60 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col"
                    style={{ width: "min(340px, calc(100vw - 1rem))", maxHeight: "min(520px, calc(100dvh - 120px))", top: "calc(var(--header-h, 64px) + 8px)" }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/60 shrink-0">
                        {activeArticle ? (
                            <button
                                onClick={() => setActiveArticle(null)}
                                className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                            >
                                <ChevronLeft size={14} /> Back to Help
                            </button>
                        ) : (
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <HelpCircle size={14} className="text-indigo-400" /> Help & Knowledge Base
                            </h3>
                        )}
                        <button
                            onClick={() => { setOpen(false); setActiveArticle(null); }}
                            className="p-1 text-gray-500 hover:text-gray-300 rounded-lg transition-colors"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {/* Search — only shown on article list, not inside an article */}
                    {!activeArticle && (
                        <div className="px-3 py-2.5 border-b border-gray-700/60 shrink-0">
                            <div className="relative">
                                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                                <input
                                    ref={searchRef}
                                    type="text"
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder="Search guides..."
                                    className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-gray-800 border border-gray-700/60 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-colors"
                                />
                                {query && (
                                    <button
                                        onClick={() => setQuery("")}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="overflow-y-auto flex-1">
                        {activeArticle ? (
                            /* ── Article view ── */
                            <div className="px-5 py-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-indigo-400">{activeArticle.icon}</span>
                                    <h2 className="text-base font-bold text-white leading-tight">{activeArticle.title}</h2>
                                </div>
                                <p className="text-xs text-gray-500 mb-4">{activeArticle.summary}</p>
                                {activeArticle.content}
                            </div>
                        ) : (
                            /* ── Article list ── */
                            <div className="py-2">
                                {filteredArticles.length === 0 ? (
                                    <div className="px-4 py-10 text-center">
                                        <Search size={24} className="text-gray-700 mx-auto mb-2" />
                                        <p className="text-sm text-gray-500">No guides found for</p>
                                        <p className="text-xs text-gray-600 mt-0.5">"{query}"</p>
                                    </div>
                                ) : (
                                    filteredArticles.map(article => (
                                        <button
                                            key={article.id}
                                            onClick={() => { setActiveArticle(article); setQuery(""); }}
                                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/60 transition-colors text-left group"
                                        >
                                            <span className="shrink-0 w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-500/20 transition-colors">
                                                {article.icon}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-200 leading-tight">{article.title}</p>
                                                <p className="text-xs text-gray-500 mt-0.5 truncate">{article.summary}</p>
                                            </div>
                                            <ChevronRight size={14} className="shrink-0 text-gray-600 group-hover:text-indigo-400 transition-colors" />
                                        </button>
                                    ))
                                )}

                                {/* Footer — only when not searching */}
                                {!query && (
                                    <div className="px-4 pt-3 pb-2 border-t border-gray-800 mt-1">
                                        <p className="text-[11px] text-gray-600 text-center">More guides coming soon</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
