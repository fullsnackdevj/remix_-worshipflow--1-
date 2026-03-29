import { useEffect, useState } from "react";

export default function SplashScreen() {
    const [showText, setShowText] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setShowText(true), 350); // text fades in after logo
        return () => clearTimeout(t);
    }, []);

    return (
        <div
            className="fixed inset-0 flex flex-col items-center justify-center z-[9999]"
            style={{
                background: "radial-gradient(ellipse at 50% 40%, #1e1b4b 0%, #0f0f1a 60%, #000000 100%)",
            }}
        >
            {/* Ambient glow behind logo */}
            <div
                className="absolute rounded-full blur-3xl opacity-20 animate-pulse"
                style={{
                    width: "280px",
                    height: "280px",
                    background: "radial-gradient(circle, #6366f1 0%, #8b5cf6 50%, transparent 100%)",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -58%)",
                }}
            />

            {/* Main content */}
            <div className="relative flex flex-col items-center gap-6">

                {/* Logo */}
                <div
                    style={{
                        animation: "splashLogoIn 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
                        opacity: 0,
                    }}
                >
                    <div
                        className="relative flex items-center justify-center rounded-3xl"
                        style={{
                            width: "96px",
                            height: "96px",
                            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)",
                            boxShadow: "0 0 0 1px rgba(99,102,241,0.3), 0 20px 60px rgba(99,102,241,0.4), 0 0 40px rgba(139,92,246,0.3)",
                        }}
                    >
                        <img
                            src="/icon-192x192.png"
                            alt="WorshipFlow"
                            style={{ width: "72px", height: "72px", borderRadius: "18px", objectFit: "cover" }}
                        />
                    </div>
                </div>

                {/* App name + tagline */}
                <div
                    className="text-center flex flex-col items-center gap-1.5"
                    style={{
                        animation: showText
                            ? "splashTextIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards"
                            : "none",
                        opacity: 0,
                    }}
                >
                    <h1
                        style={{
                            fontSize: "28px",
                            fontWeight: 700,
                            letterSpacing: "-0.5px",
                            background: "linear-gradient(135deg, #ffffff 0%, #c4b5fd 100%)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            backgroundClip: "text",
                            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                        }}
                    >
                        WorshipFlow
                    </h1>
                    <p
                        style={{
                            fontSize: "13px",
                            color: "#6b7280",
                            letterSpacing: "0.04em",
                            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                        }}
                    >
                        Glorifying God in Every Flow
                    </p>
                </div>
            </div>

            {/* Bottom: copyright only — no progress bar */}
            <div
                className="absolute bottom-8 left-1/2 -translate-x-1/2"
                style={{ opacity: showText ? 1 : 0, transition: "opacity 0.6s ease" }}
            >
                <p
                    style={{
                        fontSize: "10px",
                        color: "rgba(255,255,255,0.18)",
                        letterSpacing: "0.08em",
                        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                        textAlign: "center",
                        whiteSpace: "nowrap",
                    }}
                >
                    © 2026 WorshipFlow. All rights reserved.
                </p>
            </div>

            {/* Keyframe injection */}
            <style>{`
        @keyframes splashLogoIn {
          from { opacity: 0; transform: scale(0.6); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes splashTextIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
        </div>
    );
}
