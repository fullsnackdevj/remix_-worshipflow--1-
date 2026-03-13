import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

export type AppTheme = "default" | "one-monokai";

interface ThemeContextValue {
  theme: AppTheme;
  toggleTheme: () => void;
  setTheme: (t: AppTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "default",
  toggleTheme: () => {},
  setTheme: () => {},
});

const STORAGE_KEY = "wf_ui_theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return (saved === "one-monokai" ? "one-monokai" : "default") as AppTheme;
  });

  // Sync data-theme on <html> + persist to localStorage
  const applyTheme = useCallback((t: AppTheme) => {
    const html = document.documentElement;
    if (t === "one-monokai") {
      html.setAttribute("data-theme", "one-monokai");
    } else {
      html.removeAttribute("data-theme");
    }
    localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
  }, []);

  // Apply on mount
  useEffect(() => {
    applyTheme(theme);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTheme = useCallback(() => {
    applyTheme(theme === "default" ? "one-monokai" : "default");
  }, [theme, applyTheme]);

  const setTheme = useCallback((t: AppTheme) => {
    applyTheme(t);
  }, [applyTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
