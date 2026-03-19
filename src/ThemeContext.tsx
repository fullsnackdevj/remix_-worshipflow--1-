import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

export type AppTheme = "default" | "nordvpn" | "glass";

const THEMES: AppTheme[] = ["default", "nordvpn", "glass"];

interface ThemeContextValue {
  theme: AppTheme;
  cycleTheme: () => void;
  setTheme: (t: AppTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "default",
  cycleTheme: () => {},
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
    const saved = localStorage.getItem(STORAGE_KEY) as AppTheme | null;
    const t = THEMES.includes(saved as AppTheme) ? (saved as AppTheme) : "default";
    // Apply synchronously during initialisation — before first paint — to prevent white flash
    applyToDOM(t);
    return t;
  });

  const setTheme = useCallback((t: AppTheme) => {
    applyToDOM(t);
    localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
  }, []);

  const cycleTheme = useCallback(() => {
    const idx = THEMES.indexOf(theme);
    setTheme(THEMES[(idx + 1) % THEMES.length]);
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, cycleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
