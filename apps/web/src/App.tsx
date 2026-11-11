import React, { useState, useEffect } from "react";
import { UserPreferences, DEFAULT_PREFERENCES } from "@waitplay/shared";
import { loadPreferences, savePreferences } from "./store/preferences";
import { DashboardPage } from "./pages/DashboardPage";

export const App: React.FC = () => {
  const [preferences, setPreferences] = useState<UserPreferences>(() => loadPreferences());

  useEffect(() => {
    // Apply initial theme
    if (preferences.theme === "light") {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
    }
  }, [preferences.theme]);

  const handleUpdatePreferences = (updated: UserPreferences) => {
    setPreferences(updated);
    savePreferences(updated);
  };

  return (
    <DashboardPage
      preferences={preferences}
      onUpdatePreferences={handleUpdatePreferences}
    />
  );
};

export default App;
