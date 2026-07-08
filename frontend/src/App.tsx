import { ThemeProvider } from "./context/ThemeContext";
import { AppProvider } from "./context/AppContext";
import Dashboard from "./components/Dashboard";

export default function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <Dashboard />
      </AppProvider>
    </ThemeProvider>
  );
}
