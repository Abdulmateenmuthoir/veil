"use client";

import { useEffect, useState } from "react";

export function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Sync state with whatever the inline script already applied
  useEffect(() => {
    const stored = localStorage.getItem("veil-theme") as "dark" | "light" | null;
    if (stored) setTheme(stored);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("veil-theme", next);
    document.documentElement.classList.remove("dark", "light");
    if (next === "light") document.documentElement.classList.add("light");
  };

  return { theme, toggle };
}
