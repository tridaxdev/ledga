import { useEffect, useRef, useState } from "react"
import { createRootRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router"
import { ActivityTray } from "../components/ActivityTray"
import { useEmailActivity } from "../hooks/useEmailActivity"

export const Route = createRootRoute({
    component: RootLayout
})

function getPageTitle(pathname: string): string {
    if (pathname === "/ledger" || pathname.startsWith("/ledger/")) return "Ledger"
    if (pathname.startsWith("/assistant/")) return "Assistant"
    if (pathname === "/settings") return "Settings"
    return "Ledga"
}

function RootLayout() {
    const routerState = useRouterState()
    const pathname = routerState.location.pathname
    const navigate = useNavigate()
    const title = getPageTitle(pathname)

    const isLedgerActive = pathname === "/ledger" || pathname.startsWith("/ledger/")
    const isSettingsActive = pathname === "/settings"

    const { processing, failed } = useEmailActivity()
    const isActive = processing > 0
    const [showActivity, setShowActivity] = useState(false)
    const activityRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!showActivity) return
        function handleClickOutside(event: MouseEvent) {
            if (activityRef.current && !activityRef.current.contains(event.target as Node)) {
                setShowActivity(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [showActivity])

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
            {/* Title bar */}
            <div
                style={{
                    height: 40,
                    background: "#f7f3ea",
                    borderBottom: "1px solid #e5dfcc",
                    display: "flex",
                    alignItems: "center",
                    flexShrink: 0,
                    position: "relative",
                    WebkitAppRegion: "drag",
                } as React.CSSProperties}
            >
                {/* Traffic lights */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        paddingLeft: 16,
                        WebkitAppRegion: "no-drag",
                    } as React.CSSProperties}
                >
                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#e0826f" }} />
                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#e0bb6f" }} />
                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#8fc69b" }} />
                </div>

                {/* Center title */}
                <span
                    style={{
                        position: "absolute",
                        left: "50%",
                        transform: "translateX(-50%)",
                        fontSize: 13,
                        fontWeight: 500,
                        color: "#6e6354",
                    }}
                >
                    {title}
                </span>

                {/* Activity pill */}
                <div
                    ref={activityRef}
                    style={{
                        marginLeft: "auto",
                        paddingRight: 12,
                        WebkitAppRegion: "no-drag",
                        position: "relative",
                    } as React.CSSProperties}
                >
                    <button
                        onClick={() => setShowActivity(prev => !prev)}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                            border: `1px solid ${isActive ? "#b8dcc6" : "#e5dfcc"}`,
                            background: isActive ? "#f4f8f1" : "#fff",
                            color: isActive ? "#037b68" : "#8e8270",
                            borderRadius: 999,
                            padding: "4px 11px",
                            fontSize: 12,
                            fontWeight: 500,
                            cursor: "pointer",
                        }}
                    >
                        <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={isActive ? { animation: "spin 1.6s linear infinite" } : undefined}
                        >
                            <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
                            <path d="M21 3v5h-5" />
                        </svg>
                        {isActive ? `Parsing ${processing}` : "Idle"}
                    </button>
                    {showActivity && <ActivityTray processing={processing} failed={failed} />}
                </div>
            </div>

            {/* Body */}
            <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
                {/* Left nav */}
                <nav
                    style={{
                        width: 236,
                        background: "#f7f3ea",
                        borderRight: "1px solid #e5dfcc",
                        display: "flex",
                        flexDirection: "column",
                        padding: "16px 12px 12px",
                        flexShrink: 0,
                    }}
                >
                    {/* Logo row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                        <div
                            style={{
                                width: 30,
                                height: 30,
                                background: "#037b68",
                                borderRadius: 8,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                            }}
                        >
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 5h16M4 12h16M4 19h10" />
                            </svg>
                        </div>
                        <span style={{ fontSize: 19, fontWeight: 600, color: "#1f1b16" }}>Ledga</span>
                    </div>

                    {/* Nav buttons */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <button
                            onClick={() => navigate({ to: "/ledger" })}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "9px 10px",
                                borderRadius: 10,
                                fontSize: 14,
                                fontWeight: 500,
                                width: "100%",
                                textAlign: "left",
                                cursor: "pointer",
                                border: "none",
                                background: isLedgerActive ? "#ebe3d0" : "transparent",
                                color: "#1f1b16",
                            }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 5h16M4 12h16M4 19h10" />
                            </svg>
                            Ledger
                        </button>
                        <button
                            onClick={() => navigate({ to: "/settings" })}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "9px 10px",
                                borderRadius: 10,
                                fontSize: 14,
                                fontWeight: 500,
                                width: "100%",
                                textAlign: "left",
                                cursor: "pointer",
                                border: "none",
                                background: isSettingsActive ? "#ebe3d0" : "transparent",
                                color: "#1f1b16",
                            }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="3" />
                                <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2.2 2.2M16.8 16.8 19 19M19 5l-2.2 2.2M7.2 16.8 5 19" />
                            </svg>
                            Settings
                        </button>
                    </div>

                    {/* Divider */}
                    <hr style={{ border: "none", borderTop: "1px solid #ece5d3", margin: "16px 8px" }} />

                    {/* Chats header */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <span
                            style={{
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: "0.12em",
                                textTransform: "uppercase",
                                color: "#8e8270",
                            }}
                        >
                            Chats
                        </span>
                        <button
                            style={{
                                width: 22,
                                height: 22,
                                borderRadius: 8,
                                border: "1px solid #ece5d3",
                                background: "#fff",
                                color: "#5c5246",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                padding: 0,
                            }}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 5v14M5 12h14" />
                            </svg>
                        </button>
                    </div>

                    {/* Chat list — placeholder until chats data is wired up */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minHeight: 0, overflowY: "auto" }}>
                        <div />
                    </div>

                    {/* User profile */}
                    <div
                        style={{
                            marginTop: "auto",
                            paddingTop: 8,
                            paddingBottom: 8,
                            paddingLeft: 8,
                            paddingRight: 8,
                            borderTop: "1px solid #ece5d3",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                        }}
                    >
                        <div
                            style={{
                                width: 30,
                                height: 30,
                                borderRadius: "50%",
                                background: "#d7ead9",
                                color: "#06554a",
                                fontSize: 12,
                                fontWeight: 600,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                            }}
                        >
                            AB
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div
                                style={{
                                    fontSize: 13,
                                    fontWeight: 500,
                                    color: "#1f1b16",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                Avery Brooks
                            </div>
                            <div
                                style={{
                                    fontSize: 11,
                                    color: "#8e8270",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                you@gmail.com
                            </div>
                        </div>
                    </div>
                </nav>

                {/* Main content */}
                <main style={{ flex: 1, minWidth: 0, background: "#fcf9f1", overflow: "auto" }}>
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
