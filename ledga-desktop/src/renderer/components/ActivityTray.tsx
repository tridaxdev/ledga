import { useConnections } from "../hooks/useConnections"

interface Props {
    processing: number
    failed: number
}

export function ActivityTray({ processing, failed }: Props) {
    const { connections, isLoading } = useConnections()

    return (
        <div
            style={{
                position: "absolute",
                top: 46,
                right: 14,
                width: 320,
                backgroundColor: "#fff",
                border: "1px solid var(--color-ledga-border)",
                borderRadius: 10,
                boxShadow: "0 14px 30px -10px rgba(63,56,47,.28), 0 4px 10px -2px rgba(63,56,47,.12)",
                overflow: "hidden",
                zIndex: 40
            }}
        >
            <div
                style={{
                    padding: "11px 14px",
                    borderBottom: "1px solid var(--color-ledga-border-subtle)",
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--color-ledga-text-muted)"
                }}
            >
                Activity
            </div>

            {processing > 0 && (
                <div style={{ padding: "13px 14px", borderBottom: "1px solid var(--color-ledga-border-subtle)", display: "flex", flexDirection: "column", gap: 7 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-ledga-text)" }}>
                            Parsing {processing} email{processing === 1 ? "" : "s"}
                        </span>
                        <SyncIcon spinning />
                    </div>
                    <span style={{ fontSize: 11.5, color: "var(--color-ledga-text-muted)" }}>runs in the background{failed > 0 ? ` · ${failed} failed` : ""}</span>
                </div>
            )}

            {isLoading ? null : connections.length === 0 ? (
                <div style={{ padding: "13px 14px" }}>
                    <span style={{ fontSize: 12.5, color: "var(--color-ledga-text-secondary)" }}>No sources connected</span>
                </div>
            ) : (
                connections.map(connection => (
                    <div key={connection.id} style={{ padding: "13px 14px", borderBottom: "1px solid var(--color-ledga-border-subtle)", display: "flex", flexDirection: "column", gap: 5 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-ledga-text)" }}>Gmail sync</span>
                            <SyncIcon />
                        </div>
                        <span style={{ fontSize: 11.5, color: "var(--color-ledga-text-muted)" }}>
                            {connection.auto_sync ? "auto-sync on" : "manual sync"} · {connection.email}
                        </span>
                    </div>
                ))
            )}
        </div>
    )
}

function SyncIcon({ spinning }: { spinning?: boolean }) {
    return (
        <span style={{ display: "inline-flex", color: "var(--color-ledga-brand)", animation: spinning ? "spin 1.6s linear infinite" : undefined }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
                <path d="M21 3v5h-5" />
            </svg>
        </span>
    )
}
