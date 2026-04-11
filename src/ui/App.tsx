import { useState } from "react";
import { SidebarNav, BottomNav, type NavItem } from "./components/NavBar";
import { Button } from "./components/Button";
import { Overview } from "./pages/Overview";
import { Tasks } from "./pages/Tasks";
import { Memories } from "./pages/Memories";
import { Events } from "./pages/Events";
import { Conversations } from "./pages/Conversations";
import { APITester } from "./APITester";

type Page = "overview" | "tasks" | "memories" | "events" | "conversations";

// ── inline SVG icons (24×24, stroke-based) ──────────────────────────────────

function IconOverview() {
    return (
        <svg
            className="w-4 h-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
    );
}

function IconTasks() {
    return (
        <svg
            className="w-4 h-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15 15" />
        </svg>
    );
}

function IconMemories() {
    return (
        <svg
            className="w-4 h-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
            <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
        </svg>
    );
}

function IconEvents() {
    return (
        <svg
            className="w-4 h-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <circle cx="3.5" cy="6" r="0.5" fill="currentColor" />
            <circle cx="3.5" cy="12" r="0.5" fill="currentColor" />
            <circle cx="3.5" cy="18" r="0.5" fill="currentColor" />
        </svg>
    );
}

function IconConversations() {
    return (
        <svg
            className="w-4 h-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
    );
}

function IconCode() {
    return (
        <svg
            className="w-4 h-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
        </svg>
    );
}

// ── nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
    { id: "overview", label: "Overview", icon: <IconOverview /> },
    { id: "tasks", label: "Tasks", icon: <IconTasks /> },
    { id: "memories", label: "Memories", icon: <IconMemories /> },
    { id: "events", label: "Events", icon: <IconEvents /> },
    { id: "conversations", label: "Convers.", icon: <IconConversations /> },
];

const PAGES: Record<Page, React.ComponentType> = {
    overview: Overview,
    tasks: Tasks,
    memories: Memories,
    events: Events,
    conversations: Conversations,
};

// ── App ──────────────────────────────────────────────────────────────────────

export function App() {
    const [page, setPage] = useState<Page>("overview");
    const [showApiTester, setShowApiTester] = useState(false);

    const navigate = (id: string) => {
        setPage(id as Page);
        setShowApiTester(false);
    };

    const CurrentPage = PAGES[page];

    const apiTesterToggle = (
        <button
            onClick={() => setShowApiTester((v) => !v)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                showApiTester ? "bg-white/10 text-white" : "text-white/40 hover:bg-white/5 hover:text-white/60"
            }`}
        >
            <IconCode />
            API Tester
        </button>
    );

    return (
        <div className="flex h-screen">
            {/* Desktop sidebar */}
            <SidebarNav
                items={NAV_ITEMS}
                current={showApiTester ? "__api__" : page}
                onNavigate={navigate}
                extra={apiTesterToggle}
            />

            {/* Content area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Mobile header */}
                <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
                    <h1 className="font-bold tracking-tight">Companio</h1>
                    <button
                        onClick={() => setShowApiTester((v) => !v)}
                        className={`text-xs px-2.5 py-1 rounded transition-colors ${
                            showApiTester ? "bg-white/15 text-white" : "text-white/40 hover:text-white/60"
                        }`}
                    >
                        API
                    </button>
                </header>

                {/* Page content */}
                <main className="flex-1 min-h-0 overflow-y-auto">
                    <div className="px-4 pt-4 pb-24 md:px-6 md:pt-6 md:pb-6">
                        {showApiTester ? (
                            <div className="space-y-4">
                                <div className="flex items-center gap-4">
                                    <h2 className="text-xl font-bold">API Tester</h2>
                                    <Button variant="ghost" size="md" onClick={() => setShowApiTester(false)}>
                                        ✕ Close
                                    </Button>
                                </div>
                                <APITester />
                            </div>
                        ) : (
                            <CurrentPage />
                        )}
                    </div>
                </main>
            </div>

            {/* Mobile bottom tabs */}
            <BottomNav items={NAV_ITEMS} current={page} onNavigate={navigate} />
        </div>
    );
}

export default App;
