import React, { createContext, useContext, useState, useCallback } from "react";

// ── Available themes ──────────────────────────────────────────────────────────
export type AppTheme = "default" | "luxury" | "blush";

const THEMES: AppTheme[] = ["default", "luxury", "blush"];

interface ThemeContextValue {
    theme: AppTheme;
    setTheme: (t: AppTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
    theme: "default",
    setTheme: () => {},
});

const STORAGE_KEY = "wf_ui_theme";

function applyToDOM(t: AppTheme) {
    const html = document.documentElement;
    if (t === "default") {
        html.removeAttribute("data-theme");
    } else {
        html.setAttribute("data-theme", t);
    }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<AppTheme>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY) as AppTheme | null;
            const t = THEMES.includes(saved as AppTheme) ? (saved as AppTheme) : "default";
            // Apply synchronously during initialisation to prevent flash
            applyToDOM(t);
            return t;
        } catch {
            return "default";
        }
    });

    const setTheme = useCallback((t: AppTheme) => {
        applyToDOM(t);
        try { localStorage.setItem(STORAGE_KEY, t); } catch { /* noop */ }
        setThemeState(t);
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
