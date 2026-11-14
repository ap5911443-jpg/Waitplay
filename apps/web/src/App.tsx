import React, { useState, useEffect } from "react";
import { UserPreferences, DEFAULT_PREFERENCES } from "@waitplay/shared";
import { loadPreferences, savePreferences } from "./store/preferences";
import { DashboardPage } from "./pages/DashboardPage";
import { ShowcasePage } from "./pages/ShowcasePage";

export const App: React.FC = () => {
  const [preferences, setPreferences] = useState<UserPreferences>(() => loadPreferences());

  const isPopup =
    typeof window !== "undefined" &&
    (new URLSearchParams(window.location.search).get("popup") === "1" ||
      new URLSearchParams(window.location.search).get("popup") === "true" ||
      new URLSearchParams(window.location.search).get("mode") === "fullscreen" ||
      new URLSearchParams(window.location.search).get("view") === "dashboard" ||
      new URLSearchParams(window.location.search).get("dashboard") === "1");

  const [currentView, setCurrentView] = useState<"showcase" | "dashboard">(
    isPopup ? "dashboard" : "showcase"
  );

  useEffect(() => {
    if (currentView === "showcase") {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    } else {
      if (preferences.theme === "light") {
        document.documentElement.classList.remove("dark");
        document.documentElement.classList.add("light");
      } else {
        document.documentElement.classList.remove("light");
        document.documentElement.classList.add("dark");
      }
    }
  }, [currentView, preferences.theme]);

  const handleUpdatePreferences = (updated: UserPreferences) => {
    setPreferences(updated);
    savePreferences(updated);
  };

  if (currentView === "dashboard") {
    return (
      <DashboardPage
        preferences={preferences}
        onUpdatePreferences={handleUpdatePreferences}
        onOpenShowcase={() => setCurrentView("showcase")}
      />
    );
  }

  return (
    <ShowcasePage
      onOpenDashboard={() => setCurrentView("dashboard")}
      preferences={preferences}
      onUpdatePreferences={handleUpdatePreferences}
    />
  );
};

export default App;
