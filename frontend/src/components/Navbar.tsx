import { useAppState } from "../context/AppContext";
import { useTheme } from "../context/ThemeContext";

interface Props {
  onOpenSettings: () => void;
}

export default function Navbar({ onOpenSettings }: Props) {
  const { activePage, setActivePage } = useAppState();
  const { theme, toggleTheme } = useTheme();

  const linkStyle = (page: typeof activePage) => ({
    padding: "10px 20px",
    borderRadius: "var(--radius-lg)",
    border: "none",
    background: activePage === page ? "var(--accent-bg)" : "transparent",
    color: activePage === page ? "var(--accent-light)" : "var(--text-secondary)",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600 as const,
    transition: "all var(--transition-fast)",
    display: "flex",
    alignItems: "center",
    gap: 8,
  });

  return (
    <header style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 24px",
      background: "var(--glass-bg)",
      backdropFilter: "var(--glass-blur)",
      WebkitBackdropFilter: "var(--glass-blur)",
      borderBottom: "1px solid var(--glass-border)",
      position: "sticky", top: 0, zIndex: 100,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 36, height: 36, borderRadius: "var(--radius-md)",
            background: "var(--accent-gradient)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, boxShadow: "var(--shadow-glow)",
          }}>🚴</span>
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>
            <span style={{ color: "var(--accent-light)" }}>Velo</span>
            <span style={{ color: "var(--text-primary)" }}>Sync</span>
          </span>
        </div>

        <nav style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setActivePage("training")}
            style={linkStyle("training")}
          >
            🚴 Training
          </button>
          <button
            onClick={() => setActivePage("route-creator")}
            style={linkStyle("route-creator")}
          >
            🗺 Route Creator
          </button>
        </nav>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={toggleTheme}
          title="Toggle theme"
          style={{
            width: 38, height: 38, borderRadius: "var(--radius-md)",
            border: "1px solid var(--glass-border)",
            background: "var(--glass-bg)",
            color: "var(--text-secondary)",
            cursor: "pointer", fontSize: 18,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all var(--transition-fast)",
          }}
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
        <button
          onClick={onOpenSettings}
          title="Settings"
          style={{
            width: 38, height: 38, borderRadius: "var(--radius-md)",
            border: "1px solid var(--glass-border)",
            background: "var(--glass-bg)",
            color: "var(--text-secondary)",
            cursor: "pointer", fontSize: 18,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all var(--transition-fast)",
          }}
        >
          ⚙️
        </button>
      </div>
    </header>
  );
}