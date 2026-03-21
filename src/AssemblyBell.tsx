import React, { useState, useEffect, useRef, useCallback } from "react";
import { Bell, X, Loader2, AlertTriangle, FlaskConical } from "lucide-react";

interface Member {
    id: string;
    name: string;
    phone?: string;
    photo?: string;
    status?: string;
}

interface Props {
    userId: string;
    userName: string;
    userPhoto: string;
    fullWidth?: boolean;
    members?: Member[];
}

const DEFAULT_MSG = "Guys, we're starting practice now. Where are you? Please go to the worship hall already!";

// ── Web Audio siren generator ──────────────────────────────────────────────────
function playSiren(durationMs = 8000) {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const endTime = ctx.currentTime + durationMs / 1000;
        let t = ctx.currentTime;
        while (t < endTime) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(440, t);
            osc.frequency.linearRampToValueAtTime(880, t + 0.6);
            gain.gain.setValueAtTime(0.35, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.65);
            osc.start(t);
            osc.stop(t + 0.65);
            t += 0.75;
        }
        setTimeout(() => ctx.close(), durationMs + 500);
        return ctx;
    } catch { return null; }
}

// ── Vibration pulse (NDRRMC-style) ────────────────────────────────────────────
function vibrateAlert() {
    if (!("vibrate" in navigator)) return;
    navigator.vibrate([500, 150, 500, 150, 500, 150, 200, 100, 200, 100, 200]);
}

export default function AssemblyBell({ userId, userName, userPhoto, fullWidth, members = [] }: Props) {
    const [showConfirm, setShowConfirm] = useState(false);
    const [showAlarm, setShowAlarm] = useState(false);
    const [showCallSheet, setShowCallSheet] = useState(false); // persistent call roster after alarm
    const [customMsg, setCustomMsg] = useState("");
    const [testMode, setTestMode] = useState(true); // ← default ON for safety
    const [sending, setSending] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [pushed, setPushed] = useState<number | null>(null);
    const [isTestRun, setIsTestRun] = useState(false);
    const [myTokenCount, setMyTokenCount] = useState<number | null>(null);
    const activeMembers = members.filter(m => m.status !== "inactive");

    const CARD_W = 288; // w-72
    const CARD_H = 300; // approx card height for clamping

    // null = default CSS position (right:16, bottom:16)
    // {x,y} = user has dragged, use left/top px
    const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
    const cardDragRef = useRef<HTMLDivElement | null>(null);
    const cardDragState = useRef<{ dragging: boolean; startPX: number; startPY: number; startX: number; startY: number }>({
        dragging: false, startPX: 0, startPY: 0, startX: 0, startY: 0,
    });

    // Reset to CSS default every time the sheet opens
    useEffect(() => {
        if (showCallSheet) setDragPos(null);
    }, [showCallSheet]);

    const vw = () => window.visualViewport?.width  ?? window.innerWidth;
    const vh = () => window.visualViewport?.height ?? window.innerHeight;

    const onPointerDown = (e: React.PointerEvent) => {
        if ((e.target as HTMLElement).closest("a, button")) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        // Snapshot current rendered position so drag begins from real coords
        const rect = cardDragRef.current?.getBoundingClientRect();
        const startX = rect?.left ?? (vw() - CARD_W - 16);
        const startY = rect?.top  ?? (vh() - CARD_H - 16);
        cardDragState.current = { dragging: true, startPX: e.clientX, startPY: e.clientY, startX, startY };
        // Switch from CSS to JS-driven positioning immediately
        setDragPos({ x: startX, y: startY });
    };
    const onPointerMove = (e: React.PointerEvent) => {
        if (!cardDragState.current.dragging) return;
        e.preventDefault();
        const dx = e.clientX - cardDragState.current.startPX;
        const dy = e.clientY - cardDragState.current.startPY;
        const newX = Math.max(0, Math.min(vw() - CARD_W, cardDragState.current.startX + dx));
        const newY = Math.max(0, Math.min(vh() - CARD_H, cardDragState.current.startY + dy));
        setDragPos({ x: newX, y: newY });
    };
    const onPointerUp = (e: React.PointerEvent) => {
        if (!cardDragState.current.dragging) return;
        cardDragState.current.dragging = false;
        // Snap to nearest corner
        const cx = vw() / 2;
        const cy = vh() / 2;
        const snapRight  = e.clientX >= cx;
        const snapBottom = e.clientY >= cy;
        if (snapRight && snapBottom) {
            // Bottom-right = CSS default, go back to null so no JS width dependency
            setDragPos(null);
        } else {
            setDragPos({
                x: snapRight  ? vw() - CARD_W - 16 : 16,
                y: snapBottom ? vh() - CARD_H - 16 : 16,
            });
        }
    };
    const onPointerCancel = () => { cardDragState.current.dragging = false; };

    const audioCtxRef = useRef<any>(null);
    const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const alarmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        fetch("/api/assembly-cooldown")
            .then(r => r.json())
            .then(d => { if (d.remaining > 0) startCooldownTick(d.remaining); })
            .catch(() => {});
        return () => {
            if (cooldownRef.current) clearInterval(cooldownRef.current);
            if (alarmTimeoutRef.current) clearTimeout(alarmTimeoutRef.current);
        };
    }, []);

    // Check how many FCM tokens exist for this user when modal opens
    useEffect(() => {
        if (!showConfirm || !userId) return;
        fetch(`/api/assembly-token-check?userId=${encodeURIComponent(userId)}`)
            .then(r => r.json())
            .then(d => setMyTokenCount(d.count ?? 0))
            .catch(() => setMyTokenCount(0));
    }, [showConfirm, userId]);

    const startCooldownTick = (seconds: number) => {
        setCooldown(seconds);
        if (cooldownRef.current) clearInterval(cooldownRef.current);
        let rem = seconds;
        cooldownRef.current = setInterval(() => {
            rem -= 1;
            setCooldown(rem);
            if (rem <= 0) { clearInterval(cooldownRef.current!); cooldownRef.current = null; }
        }, 1000);
    };

    // Lock body scroll while alarm is visible (prevents page scrolling on mobile / iOS)
    useEffect(() => {
        const html = document.documentElement;
        if (showAlarm) {
            html.style.overflow = "hidden";
            document.body.style.overflow = "hidden";
            document.body.style.position = "fixed";
            document.body.style.width = "100%";
            document.body.style.top = "0";
        } else {
            html.style.overflow = "";
            document.body.style.overflow = "";
            document.body.style.position = "";
            document.body.style.width = "";
            document.body.style.top = "";
        }
        return () => {
            html.style.overflow = "";
            document.body.style.overflow = "";
            document.body.style.position = "";
            document.body.style.width = "";
            document.body.style.top = "";
        };
    }, [showAlarm]);

    const handleSend = useCallback(async () => {
        setSending(true);
        const wasTest = testMode;
        try {
            const res = await fetch("/api/assembly-call", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    callerId: userId,
                    callerName: userName,
                    callerPhoto: userPhoto,
                    message: customMsg.trim() || DEFAULT_MSG,
                    testMode: wasTest,   // ← server only sends to this user's token
                }),
            });
            const data = await res.json();
            if (res.status === 429) {
                startCooldownTick(data.remaining ?? 60);
                setShowConfirm(false);
                return;
            }
            if (!res.ok) throw new Error(data.error || "Failed");

            setIsTestRun(wasTest);
            setPushed(data.pushed ?? 0);
            setShowConfirm(false);
            setShowAlarm(true);
            vibrateAlert();
            audioCtxRef.current = playSiren(8000);

            // Test mode: no cooldown (so you can test repeatedly)
            if (!wasTest) startCooldownTick(60);

            // Only auto-dismiss if there are NO members to call
            // If the call roster is visible the admin needs time to make calls → manual dismiss only
            if (activeMembers.length === 0) {
                alarmTimeoutRef.current = setTimeout(() => {
                    setShowAlarm(false);
                    audioCtxRef.current?.close?.();
                }, 12000);
            }
        } catch (e: any) {
            alert(e.message || "Failed to send assembly call.");
        } finally {
            setSending(false);
        }
    }, [userId, userName, userPhoto, customMsg, testMode]);

    const dismissAlarm = () => {
        setShowAlarm(false);
        audioCtxRef.current?.close?.();
        if (alarmTimeoutRef.current) { clearTimeout(alarmTimeoutRef.current); alarmTimeoutRef.current = null; }
        // Show the persistent floating call sheet so admin can still call members
        if (activeMembers.length > 0) setShowCallSheet(true);
    };

    const fmtCooldown = (s: number) => {
        const m = Math.floor(s / 60);
        return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
    };

    const effectiveCooldown = testMode ? 0 : cooldown; // test mode ignores cooldown

    return (
        <>
            {/* ── Trigger button ────────────────────────────────────────────── */}
            <button
                onClick={() => { if (effectiveCooldown === 0) setShowConfirm(true); }}
                disabled={effectiveCooldown > 0}
                title={effectiveCooldown > 0
                    ? `Assembly call on cooldown — ${fmtCooldown(effectiveCooldown)} left`
                    : "Send Assembly Call to all members"}
                className={[
                    "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
                    fullWidth ? "w-full justify-center" : "",
                    effectiveCooldown > 0
                        ? "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                        : "bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 text-white shadow-lg shadow-red-500/30 hover:shadow-red-500/50 active:scale-95"
                ].join(" ")}
            >
                <Bell size={15} className={effectiveCooldown === 0 ? "animate-bounce" : ""} />
                {effectiveCooldown > 0 ? `Cooldown ${fmtCooldown(effectiveCooldown)}` : "Assembly Call"}
            </button>

            {/* ── Confirm Modal ─────────────────────────────────────────────── */}
            {showConfirm && (
                <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !sending && setShowConfirm(false)} />
                    <div className="relative z-10 w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-red-200 dark:border-red-900/50 overflow-hidden">
                        <div className="h-1.5 bg-gradient-to-r from-red-500 via-rose-500 to-red-500" />
                        <div className="p-6">

                            {/* Header */}
                            <div className="flex items-start gap-4 mb-5">
                                <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                                    <Bell size={22} className="text-red-500 animate-bounce" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Send Assembly Call?</h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                        {testMode
                                            ? <><span className="text-emerald-600 dark:text-emerald-400 font-semibold">Test mode ON</span> — only <strong>you</strong> will receive this.</>
                                            : <>This will blast a push to <strong>every team member's device</strong> right now.</>
                                        }
                                    </p>
                                </div>
                                <button onClick={() => setShowConfirm(false)} className="ml-auto p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg">
                                    <X size={18} />
                                </button>
                            </div>

                            {/* 🧪 Test Mode toggle */}
                            <button
                                onClick={() => setTestMode(p => !p)}
                                className={[
                                    "w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 mb-3 transition-all",
                                    testMode
                                        ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20"
                                        : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:border-gray-300"
                                ].join(" ")}
                            >
                                <div className={[
                                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                                    testMode ? "bg-emerald-100 dark:bg-emerald-800/40" : "bg-gray-200 dark:bg-gray-700"
                                ].join(" ")}>
                                    <FlaskConical size={18} className={testMode ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400"} />
                                </div>
                                <div className="flex-1 text-left">
                                    <p className={`text-sm font-bold ${testMode ? "text-emerald-700 dark:text-emerald-300" : "text-gray-600 dark:text-gray-300"}`}>
                                        {testMode ? "🧪 Test Mode — Only Me" : "🚨 Live — All Members"}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {testMode
                                            ? "Send only to your own device. No cooldown applied."
                                            : "Sends to every registered device. 1-min cooldown."}
                                    </p>
                                </div>
                                {/* Toggle pill */}
                                <div className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${testMode ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`}>
                                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${testMode ? "translate-x-5" : "translate-x-0.5"}`} />
                                </div>
                            </button>

                            {/* ── Device token status (test mode) ──────────────── */}
                            {testMode && (
                                <div className={`mb-5 px-3 py-2.5 rounded-xl border text-xs flex items-start gap-2 ${
                                    myTokenCount === null
                                        ? "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-400"
                                        : myTokenCount === 0
                                            ? "border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800/50 text-red-700 dark:text-red-300"
                                            : "border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300"
                                }`}>
                                    <span className="text-base leading-none mt-0.5">
                                        {myTokenCount === null ? "⏳" : myTokenCount === 0 ? "⚠️" : "📱"}
                                    </span>
                                    <div>
                                        {myTokenCount === null && "Checking your registered devices…"}
                                        {myTokenCount === 0 && (
                                            <>
                                                <strong>No registered device found for your account.</strong>
                                                <br />
                                                Open WorshipFlow on your phone → tap <strong>"Enable"</strong> on the notification banner → then come back and try again.
                                            </>
                                        )}
                                        {myTokenCount !== null && myTokenCount > 0 && (
                                            <><strong>{myTokenCount} device{myTokenCount > 1 ? "s" : ""} registered</strong> — push will go to {myTokenCount > 1 ? "all of them" : "it"}.</>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Message */}
                            <div className="mb-5">
                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                                    Message
                                </label>
                                <textarea
                                    value={customMsg}
                                    onChange={e => setCustomMsg(e.target.value)}
                                    maxLength={160}
                                    rows={3}
                                    placeholder={DEFAULT_MSG}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white resize-none outline-none focus:border-red-400 focus:ring-2 focus:ring-red-200 dark:focus:ring-red-900/50 transition-all"
                                />
                                <p className="text-right text-[10px] text-gray-400 mt-0.5">{customMsg.length}/160</p>
                            </div>

                            {!testMode && (
                                <div className="flex items-center gap-2 mb-5 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
                                    <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                                    <p className="text-xs text-amber-700 dark:text-amber-300">
                                        5-minute cooldown applies. This will notify <strong>everyone</strong>.
                                    </p>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-3">
                                <button onClick={() => setShowConfirm(false)} disabled={sending}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                                    Cancel
                                </button>
                                <button onClick={handleSend} disabled={sending}
                                    className={[
                                        "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white shadow-lg transition-all active:scale-95 disabled:opacity-60",
                                        testMode
                                            ? "bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 shadow-emerald-500/30"
                                            : "bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 shadow-red-500/30"
                                    ].join(" ")}>
                                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
                                    {sending ? "Sending..." : testMode ? "🧪 Send Test" : "🚨 Send to Everyone"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Full-screen Alarm Overlay ──────────────────────────────────── */}
            {showAlarm && (
                <div className="fixed inset-0 z-[9999] flex flex-col items-center overflow-hidden"
                    style={{
                        background: isTestRun
                            ? "radial-gradient(ellipse at center, #064e3b 0%, #022c22 60%, #000 100%)"
                            : "radial-gradient(ellipse at center, #7f1d1d 0%, #450a0a 60%, #1a0000 100%)",
                        animation: `alarmFlash${isTestRun ? "Green" : "Red"} 0.5s ease-in-out infinite alternate`,
                        touchAction: "none",      // ← stops iOS rubber-band scroll on the overlay
                        overscrollBehavior: "none",
                    }}>
                    <style>{`
                        @keyframes alarmFlashRed {
                            from { background: radial-gradient(ellipse at center, #7f1d1d 0%, #450a0a 60%, #1a0000 100%); }
                            to   { background: radial-gradient(ellipse at center, #991b1b 0%, #7f1d1d 60%, #450a0a 100%); }
                        }
                        @keyframes alarmFlashGreen {
                            from { background: radial-gradient(ellipse at center, #064e3b 0%, #022c22 60%, #000 100%); }
                            to   { background: radial-gradient(ellipse at center, #065f46 0%, #064e3b 60%, #022c22 100%); }
                        }
                        @keyframes bellShake {
                            0%, 100% { transform: rotate(0deg); }
                            15%  { transform: rotate(-18deg); }
                            30%  { transform: rotate(18deg); }
                            45%  { transform: rotate(-12deg); }
                            60%  { transform: rotate(12deg); }
                            75%  { transform: rotate(-6deg); }
                            90%  { transform: rotate(6deg); }
                        }
                        @keyframes pulseRing { 0% { transform:scale(1); opacity:0.7; } 100% { transform:scale(2.2); opacity:0; } }
                    `}</style>

                    {[0, 0.4, 0.8].map((delay, i) => (
                        <div key={i} className={`absolute w-48 h-48 rounded-full border-4 ${isTestRun ? "border-emerald-400/40" : "border-red-400/40"}`}
                            style={{ animation: `pulseRing 1.6s ease-out ${delay}s infinite` }} />
                    ))}

                    {/* Top section — fixed, never scrolls */}
                    <div className="flex flex-col items-center shrink-0 pt-8 px-4">
                        <div className="relative mb-4">
                            <div className={`w-20 h-20 rounded-full border-4 flex items-center justify-center ${isTestRun ? "bg-emerald-500/20 border-emerald-400/60" : "bg-red-500/20 border-red-400/60"}`}
                                style={{ animation: "bellShake 0.5s ease-in-out infinite" }}>
                                {isTestRun ? <FlaskConical size={36} className="text-white drop-shadow-2xl" /> : <Bell size={42} className="text-white drop-shadow-2xl" />}
                            </div>
                        </div>
                        <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight mb-2 drop-shadow-2xl text-center">
                            {isTestRun ? "🧪 TEST SENT!" : "🚨 ASSEMBLY CALL"}
                        </h1>
                        <p className="text-white/80 text-sm font-semibold text-center px-6 max-w-xs mb-1">
                            {customMsg.trim() || DEFAULT_MSG}
                        </p>
                        {pushed !== null && (
                            <p className="text-white/50 text-xs font-medium mb-2">
                                {isTestRun ? "Sent to your device only — check your phone! 📱" : `Sent to ${pushed} device${pushed !== 1 ? "s" : ""}`}
                            </p>
                        )}
                    </div>

                    {/* ── Call Roster — flex-1 so it fills remaining space and scrolls internally */}
                    {activeMembers.length > 0 && (
                        <div className="flex flex-col flex-1 min-h-0 w-full max-w-xs mx-auto px-4 pb-2">
                            <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-2 text-center shrink-0">
                                📞 Quick Call Roster
                            </p>
                            <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-black/30 backdrop-blur-sm border border-white/10 divide-y divide-white/10"
                                style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.2) transparent" }}>
                                {activeMembers.map(m => {
                                    const initials = (m.name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                                    const phone = m.phone?.trim();
                                    return (
                                        <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                                            {m.photo ? (
                                                <img src={m.photo} alt={m.name}
                                                    className="w-8 h-8 rounded-full object-cover shrink-0 ring-1 ring-white/20" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold text-white shrink-0">
                                                    {initials}
                                                </div>
                                            )}
                                            <span className="flex-1 text-white text-sm font-medium truncate">{m.name}</span>
                                            {phone ? (
                                                <a href={`tel:${phone.replace(/\s+/g, "")}`}
                                                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/80 hover:bg-emerald-400/90 text-white text-xs font-bold transition-all active:scale-95 shrink-0">
                                                    📞 Call
                                                </a>
                                            ) : (
                                                <span className="text-white/25 text-xs shrink-0">no #</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Bottom — dismiss button, always visible */}
                    <div className="shrink-0 flex flex-col items-center gap-1 py-4">
                        <button onClick={dismissAlarm}
                            className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-sm backdrop-blur-sm transition-all active:scale-95">
                            <X size={16} /> Dismiss
                        </button>
                        <p className="text-white/30 text-xs">
                            {activeMembers.length > 0 ? "Call roster stays open after dismiss" : "Auto-dismisses in 12 seconds"}
                        </p>
                    </div>
                </div>
            )}

            {/* ── Persistent Floating Call Sheet — draggable, corner-snapping ── */}
            {showCallSheet && activeMembers.length > 0 && (
                <div
                    ref={cardDragRef}
                    className="fixed z-[9998] w-72 bg-gray-900/95 backdrop-blur-md border border-red-500/30 rounded-2xl shadow-2xl shadow-red-900/40 overflow-hidden select-none"
                    style={dragPos
                        ? {
                            // User has dragged — use exact JS coords
                            left: dragPos.x,
                            top: dragPos.y,
                            right: "auto",
                            bottom: "auto",
                            transition: cardDragState.current.dragging ? "none" : "left 0.2s, top 0.2s",
                        }
                        : {
                            // Default: CSS bottom-right, no JS width calc needed
                            right: 16,
                            bottom: 16,
                            left: "auto",
                            top: "auto",
                        }
                    }
                >
                    {/* Drag handle — touch-action:none here only so memberlist links still fire */}
                    <div
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerCancel}
                        className="flex items-center justify-between px-4 py-3 bg-red-700/40 border-b border-red-500/20"
                        style={{ touchAction: "none", cursor: cardDragState.current.dragging ? "grabbing" : "grab" }}
                    >
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                            <span className="text-white text-sm font-bold">📞 Call Roster</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-white/30 text-[10px] font-medium">drag me</span>
                            <button onClick={() => setShowCallSheet(false)}
                                className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors">
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                    {/* Member list — vertical scroll */}
                    <div className="max-h-64 overflow-y-auto divide-y divide-white/5"
                        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.15) transparent" }}>
                        {activeMembers.map(m => {
                            const initials = (m.name || "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
                            const phone = m.phone?.trim();
                            return (
                                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors">
                                    {m.photo ? (
                                        <img src={m.photo} alt={m.name}
                                            className="w-8 h-8 rounded-full object-cover shrink-0 ring-1 ring-white/20" />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-xs font-bold text-white shrink-0">
                                            {initials}
                                        </div>
                                    )}
                                    <span className="flex-1 text-white text-sm font-medium truncate">{m.name}</span>
                                    {phone ? (
                                        <a href={`tel:${phone.replace(/\s+/g, "")}`}
                                            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all active:scale-95 shrink-0">
                                            📞 Call
                                        </a>
                                    ) : (
                                        <span className="text-white/25 text-xs shrink-0">no #</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div className="px-4 py-2 border-t border-white/5 text-center">
                        <p className="text-white/25 text-[10px]">Drag to reposition</p>
                    </div>
                </div>
            )}
        </>
    );
}
