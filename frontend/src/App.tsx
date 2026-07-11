import { useState } from "react";
import { ThemeProvider } from "./context/ThemeContext";
import { AppProvider, useAppState } from "./context/AppContext";
import Dashboard from "./components/Dashboard";
import RouteCreatorPage from "./components/RouteCreatorPage";
import Navbar from "./components/Navbar";
import SettingsDialog from "./components/SettingsDialog";

function AppContent() {
  const { activePage } = useAppState();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <Navbar onOpenSettings={() => setSettingsOpen(true)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {activePage === "training" ? <Dashboard /> : <RouteCreatorPage />}
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ThemeProvider>
  );
}
