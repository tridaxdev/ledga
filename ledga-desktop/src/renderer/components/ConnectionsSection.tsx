import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useConnections } from "../hooks/useConnections"
import { ConnectGmailModal } from "./ConnectGmailModal"
import { SyncPeriodModal } from "./SyncPeriodModal"
import type { Connection } from "@/common/types/Connection"

export function ConnectionsSection() {
    const { t } = useTranslation()
    const { connections, isLoading, disconnect, syncNow, setAutoSync } = useConnections()
    const [modalOpen, setModalOpen] = useState(false)
    const [syncPeriodConnectionId, setSyncPeriodConnectionId] = useState<string | null>(null)
    const [justSyncedIds, setJustSyncedIds] = useState<Set<string>>(new Set())
    const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set())

    function handleSuccess(_connection: Connection) {
        setModalOpen(false)
    }

    async function handleSyncNow(id: string, from: Date, to: Date) {
        setSyncingIds(prev => new Set(prev).add(id))
        await syncNow(id, from, to)
        setSyncingIds(prev => {
            const next = new Set(prev)
            next.delete(id)
            return next
        })
        setJustSyncedIds(prev => new Set(prev).add(id))
    }

    function handleSyncPeriodConfirm(range: { from: Date; to: Date }) {
        const id = syncPeriodConnectionId
        setSyncPeriodConnectionId(null)
        if (id) handleSyncNow(id, range.from, range.to)
    }

    return (
        <>
            <section>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                    <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-ledga-text)", margin: 0 }}>{t("settings.connected_sources_heading")}</h2>
                </div>

                {isLoading ? (
                    <p style={{ fontSize: "14px", color: "var(--color-ledga-text-muted)" }}>{t("settings.loading")}</p>
                ) : connections.length === 0 ? (
                    <div style={{ padding: "24px", borderRadius: "8px", border: "1px dashed var(--color-ledga-border)", textAlign: "center", marginBottom: 14 }}>
                        <p style={{ margin: 0, fontSize: "14px", color: "var(--color-ledga-text-muted)" }}>{t("settings.no_connections")}</p>
                    </div>
                ) : (
                    <ul style={{ listStyle: "none", margin: "0 0 14px", padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                        {connections.map(connection => (
                            <li
                                key={connection.id}
                                style={{
                                    borderRadius: "8px",
                                    border: "1px solid var(--color-ledga-border)",
                                    backgroundColor: "#fff",
                                    overflow: "hidden"
                                }}
                            >
                                <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "15px 16px", borderBottom: "1px solid var(--color-ledga-border-subtle)" }}>
                                    <span
                                        style={{
                                            width: 36,
                                            height: 36,
                                            borderRadius: 8,
                                            background: "var(--color-ledga-brand-bg)",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            flexShrink: 0
                                        }}
                                    >
                                        <MailIcon />
                                    </span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-ledga-text)" }}>{connection.email}</div>
                                        <div style={{ fontSize: 12, color: "var(--color-ledga-brand)" }}>
                                            {syncingIds.has(connection.id) ? "Syncing…" : justSyncedIds.has(connection.id) ? "Synced just now" : connection.auto_sync ? "auto-sync on" : "manual sync"}
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <span style={{ fontSize: 12, color: "var(--color-ledga-text-secondary)" }}>{t("settings.auto_sync_label")}</span>
                                        <Toggle checked={connection.auto_sync} onChange={checked => setAutoSync(connection.id, checked)} />
                                    </div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px" }}>
                                    <button
                                        onClick={() => setSyncPeriodConnectionId(connection.id)}
                                        disabled={syncingIds.has(connection.id)}
                                        style={{
                                            ...secondaryButtonStyle,
                                            borderColor: "var(--color-ledga-brand-border)",
                                            color: "var(--color-ledga-brand)",
                                            opacity: syncingIds.has(connection.id) ? 0.6 : 1
                                        }}
                                    >
                                        {syncingIds.has(connection.id) ? "Syncing…" : "Sync now"}
                                    </button>
                                    <button onClick={() => disconnect(connection.id)} style={{ ...secondaryButtonStyle, borderColor: "#e7c6b9", color: "var(--color-ledga-danger)" }}>
                                        {t("settings.disconnect_button")}
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                <button onClick={() => setModalOpen(true)} style={addSourceButtonStyle}>
                    <PlusIcon />
                    {t("settings.add_source_button")}
                </button>
            </section>

            <ConnectGmailModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSuccess={handleSuccess} />
            <SyncPeriodModal isOpen={syncPeriodConnectionId !== null} onClose={() => setSyncPeriodConnectionId(null)} onConfirm={handleSyncPeriodConfirm} />
        </>
    )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <button
            onClick={() => onChange(!checked)}
            style={{
                width: 42,
                height: 24,
                borderRadius: 999,
                position: "relative",
                cursor: "pointer",
                border: "none",
                flexShrink: 0,
                background: checked ? "var(--color-ledga-brand)" : "var(--color-ledga-border)",
                transition: "background .18s"
            }}
        >
            <span
                style={{
                    position: "absolute",
                    top: 2,
                    left: checked ? 20 : 2,
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "#fff",
                    boxShadow: "0 1px 2px rgba(0,0,0,.2)",
                    transition: "left .18s"
                }}
            />
        </button>
    )
}

const secondaryButtonStyle: React.CSSProperties = {
    border: "1px solid var(--color-ledga-border)",
    background: "#fff",
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--color-ledga-text)",
    cursor: "pointer"
}

const addSourceButtonStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    border: "1px dashed #b9ad95",
    background: "transparent",
    borderRadius: 6,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--color-ledga-text)",
    cursor: "pointer"
}

function MailIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-ledga-brand)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
        </svg>
    )
}

function PlusIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
        </svg>
    )
}
