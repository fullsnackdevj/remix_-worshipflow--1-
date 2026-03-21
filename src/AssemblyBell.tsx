import React, { useState, useEffect, useRef, useCallback } from "react";
import { Bell, X, Send, Loader2, AlertTriangle } from "lucide-react";

interface Props {
    userId: string;
    userName: string;
    userPhoto: string;
}

// ── Web Audio siren generator ──────────────────────────────────────────────────
function playSiren(durationMs = 8000) {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const endTime = ctx.currentTime + durationMs / 1000;
        let t = ctx.currentTime;

        while (t < endTime) {
            // Rising wail
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.type = "sawtooth";
            osc1.frequency.setValueAtTime(440, t);
            osc1.frequency.linearRampToValueAtTime(880, t + 0.6);
            gain1.gain.setValueAtTime(0.35, t);
            gain1.gain.linearRampToValueAtTime(0, t + 0.65);
            osc1.start(t);
            osc1.stop(t + 0.65);
            t += 0.7;

            // Short pause
            t += 0.05;
        }
        // Stop context after siren ends
        setTimeout(() => ctx.close(), durationMs + 500);
        return ctx;
    } catch { return null; }
}

// ── Vibration pulse pattern (like NDRRMC) ─────────────────────────────────────
function vibrateAlert() {
    if (!("vibrate" in navigator)) return;
    // Long-short-long-short-long — louder "feel"
    navigator.vibrate([500, 150, 500, 150, 500, 150, 200, 100, 200, 100, 200]);
}

export default function AssemblyBell({ userId, userName, userPhoto }: Props) {
    const [showConfirm, setShowConfirm] = useState(false);
    const [showAlarm, setShowAlarm] = useState(false);
    const [customMsg, setCustomMsg] = useState("");
    const [sending, setSending] = useState(false);
    const [cooldown, setCooldown] = useState(0); // seconds remaining
    const [pushed, setPushed] = useState<number | null>(null);

    const audioCtxRef = useRef<any>(null);
    const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const alarmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Check cooldown on mount ────────────────────────────────────────────────
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

    const startCooldownTick = (seconds: number) => {
        setCooldown(seconds);
        if (cooldownRef.current) clearInterval(cooldownRef.current);
        let remaining = seconds;
        cooldownRef.current = setInterval(() => {
            remaining -= 1;
            setCooldown(remaining);
            if (remaining <= 0) {
                clearInterval(cooldownRef.current!);
                cooldownRef.current = null;
            }
        }, 1000);
    };

    const handleSend = useCallback(async () => {
        setSending(true);
        try {
            const res = await fetch("/api/assembly-call", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    callerId: userId,
                    callerName: userName,
                    callerPhoto: userPhoto,
                    message: customMsg.trim() || undefined,
                }),
            });
            const data = await res.json();
            if (res.status === 429) {
                startCooldownTick(data.remaining ?? 300);
                setShowConfirm(false);
                return;
            }
            if (!res.ok) throw new Error(data.error || "Failed");

            // ── Success — trigger local alarm too ─────────────────────────
            setPushed(data.pushed ?? 0);
            setShowConfirm(false);
            setShowAlarm(true);
            vibrateAlert();
            audioCtxRef.current = playSiren(8000);
            startCooldownTick(300); // 5 min

            // Auto-dismiss alarm overlay after 12 sec
            alarmTimeoutRef.current = setTimeout(() => {
                setShowAlarm(false);
                audioCtxRef.current?.close?.();
            }, 12000);
        } catch (e: any) {
            alert(e.message || "Failed to send assembly call.");
        } finally {
            setSending(false);
        }
    }, [userId, userName, userPhoto, customMsg]);

    const dismissAlarm = () => {
        setShowAlarm(false);
        audioCtxRef.current?.close?.();
        if (alarmTimeoutRef.current) clearTimeout(alarmTimeoutRef.current);
    };

    const fmtCooldown = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
    };

    return (
        <>
            {/* ── Assembly Bell trigger button ─────────────────────────────── */}
            <button
                onClick={() => { if (cooldown === 0) setShowConfirm(true); }}
                disabled={cooldown > 0}
                title={cooldown > 0 ? `Assembly call on cooldown — ${fmtCooldown(cooldown)} left` : "Send Assembly Call to all members"}
                className={[
                    "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
                    cooldown > 0
                        ? "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                        : "bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 text-white shadow-lg shadow-red-500/30 hover:shadow-red-500/50 active:scale-95"
                ].join(" ")}
            >
                <Bell size={15} className={cooldown === 0 ? "animate-bounce" : ""} />
                {cooldown > 0 ? `Cooldown ${fmtCooldown(cooldown)}` : "Assembly Call"}
            </button>

            {/* ── Confirm Modal ────────────────────────────────────────────────── */}
            {showConfirm && (
                <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !sending && setShowConfirm(false)} />
                    <div className="relative z-10 w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-red-200 dark:border-red-900/50 overflow-hidden">
                        {/* Red top bar */}
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
                                        This will blast a push notification to <strong>every team member's device</strong> right now.
                                    </p>
                                </div>
                                <button onClick={() => setShowConfirm(false)} className="ml-auto p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg transition-colors">
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Custom message */}
                            <div className="mb-5">
                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                                    Message (optional)
                                </label>
                                <textarea
                                    value={customMsg}
                                    onChange={e => setCustomMsg(e.target.value)}
                                    maxLength={120}
                                    rows={2}
                                    placeholder="Rehearsal is starting NOW! Please report immediately. 🚨"
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white resize-none outline-none focus:border-red-400 focus:ring-2 focus:ring-red-200 dark:focus:ring-red-900/50 transition-all"
                                />
                                <p className="text-right text-[10px] text-gray-400 mt-0.5">{customMsg.length}/120</p>
                            </div>

                            <div className="flex items-center gap-2 mb-5 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
                                <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                                <p className="text-xs text-amber-700 dark:text-amber-300">
                                    5-minute cooldown applies after sending. Use only when needed.
                                </p>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowConfirm(false)}
                                    disabled={sending}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSend}
                                    disabled={sending}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 text-white font-bold text-sm shadow-lg shadow-red-500/30 transition-all active:scale-95 disabled:opacity-60"
                                >
                                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
                                    {sending ? "Sending..." : "🚨 Send Now"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Full-screen Alarm Overlay ─────────────────────────────────────── */}
            {showAlarm && (
                <div
                    className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
                    style={{
                        background: "radial-gradient(ellipse at center, #7f1d1d 0%, #450a0a 60%, #1a0000 100%)",
                        animation: "alarmFlash 0.5s ease-in-out infinite alternate",
                    }}
                >
                    <style>{`
                        @keyframes alarmFlash {
                            from { background: radial-gradient(ellipse at center, #7f1d1d 0%, #450a0a 60%, #1a0000 100%); }
                            to   { background: radial-gradient(ellipse at center, #991b1b 0%, #7f1d1d 60%, #450a0a 100%); }
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
                        @keyframes pulseRing {
                            0%   { transform: scale(1);   opacity: 0.7; }
                            100% { transform: scale(2.2); opacity: 0;   }
                        }
                    `}</style>

                    {/* Pulsing rings */}
                    {[0, 0.4, 0.8].map((delay, i) => (
                        <div key={i} className="absolute w-48 h-48 rounded-full border-4 border-red-400/40"
                            style={{ animation: `pulseRing 1.6s ease-out ${delay}s infinite` }} />
                    ))}

                    {/* Bell icon */}
                    <div className="relative mb-6">
                        <div className="w-28 h-28 rounded-full bg-red-500/20 border-4 border-red-400/60 flex items-center justify-center"
                            style={{ animation: "bellShake 0.5s ease-in-out infinite" }}>
                            <Bell size={52} className="text-white drop-shadow-2xl" />
                        </div>
                    </div>

                    {/* Text */}
                    <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-3 drop-shadow-2xl text-center px-4">
                        🚨 ASSEMBLY CALL
                    </h1>
                    <p className="text-red-200 text-base sm:text-lg font-semibold text-center px-8 max-w-md mb-2 drop-shadow">
                        {customMsg.trim() || "Rehearsal is starting NOW! Please report immediately."}
                    </p>
                    {pushed !== null && (
                        <p className="text-red-300/70 text-sm font-medium mb-8">
                            Sent to {pushed} device{pushed !== 1 ? "s" : ""}
                        </p>
                    )}

                    {/* Dismiss */}
                    <button
                        onClick={dismissAlarm}
                        className="mt-2 flex items-center gap-2 px-8 py-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-sm backdrop-blur-sm transition-all active:scale-95"
                    >
                        <X size={16} /> Dismiss
                    </button>

                    <p className="absolute bottom-6 text-red-400/50 text-xs">Auto-dismisses in 12 seconds</p>
                </div>
            )}
        </>
    );
}
