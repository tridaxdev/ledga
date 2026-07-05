import { useState, useEffect } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { useConnections } from "../../hooks/useConnections"
import { ConnectionsSection } from "../../components/ConnectionsSection"
import { RulesSection } from "../../components/RulesSection"
import { CategoriesSection } from "../../components/CategoriesSection"
import { getLedgaAPI } from "../../hooks/apiClient"

type SettingsTab = "connections" | "rules" | "categories" | "data"

function isSettingsTab(value: unknown): value is SettingsTab {
    return value === "connections" || value === "rules" || value === "categories" || value === "data"
}

const SETTINGS_TABS: { id: SettingsTab; labelKey: string }[] = [
    { id: "connections", labelKey: "settings.connected_sources_heading" },
    { id: "rules", labelKey: "rules_section.title" },
    { id: "categories", labelKey: "categories_section.title" },
    { id: "data", labelKey: "settings.data_privacy_heading" }
]

export const Route = createFileRoute("/settings/")({
    component: SettingsScreen,
    validateSearch: (search: Record<string, unknown>): { tab: SettingsTab } => ({
        tab: isSettingsTab(search.tab) ? search.tab : "connections"
    })
})

function SettingsScreen() {
    const { t } = useTranslation()
    const { tab } = Route.useSearch()
    const navigate = useNavigate()

    function setTab(nextTab: SettingsTab) {
        navigate({ to: "/settings", search: { tab: nextTab } })
    }

    return (
        <div style={{ padding: "40px", maxWidth: "640px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-ledga-text-muted)", marginBottom: 4 }}>{t("settings.eyebrow")}</div>
            <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 32, fontWeight: 600, letterSpacing: "-0.01em", margin: "0 0 24px", color: "var(--color-ledga-text)" }}>{t("settings.title")}</h1>

            <div style={{ display: "flex", gap: 22, marginBottom: 28 }}>
                {SETTINGS_TABS.map(tabDef => (
                    <button key={tabDef.id} onClick={() => setTab(tabDef.id)} style={tabButtonStyle(tab === tabDef.id)}>
                        {t(tabDef.labelKey)}
                    </button>
                ))}
            </div>

            {tab === "connections" && <ConnectionsSection />}
            {tab === "rules" && <RulesSection />}
            {tab === "categories" && <CategoriesSection />}
            {tab === "data" && <DataSection />}
        </div>
    )
}

function tabButtonStyle(active: boolean): React.CSSProperties {
    return {
        border: "none",
        background: "transparent",
        padding: "9px 2px 11px",
        fontSize: 14,
        fontWeight: active ? 600 : 500,
        color: active ? "var(--color-ledga-text)" : "var(--color-ledga-text-muted)",
        boxShadow: active ? "inset 0 -2px 0 var(--color-ledga-brand)" : "inset 0 -1px 0 var(--color-ledga-border)",
        cursor: "pointer",
        fontFamily: "inherit"
    }
}

function DataSection() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { connections } = useConnections()
    const [dbPath, setDbPath] = useState("")
    const [exportStatus, setExportStatus] = useState<string | null>(null)
    const [confirmingClear, setConfirmingClear] = useState(false)
    const [isClearing, setIsClearing] = useState(false)

    const anyAutoSync = connections.some(c => c.auto_sync)

    useEffect(() => {
        getLedgaAPI()
            .settings.getDbPath()
            .then(result => {
                if (result.kind === "success") setDbPath(result.value)
            })
    }, [])

    async function handleReveal() {
        await getLedgaAPI().settings.revealDb()
    }

    async function handleExport() {
        setExportStatus(null)
        const result = await getLedgaAPI().settings.exportCsv()
        if (result.kind === "success") {
            setExportStatus(result.value ? `Saved to ${result.value}` : null)
        } else {
            setExportStatus(`Export failed: ${result.error.message}`)
        }
    }

    async function handleClearData() {
        setIsClearing(true)
        const result = await getLedgaAPI().settings.clearData()
        setIsClearing(false)
        setConfirmingClear(false)
        if (result.kind === "success") {
            navigate({ to: "/ledger" })
        }
    }

    return (
        <section>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ledga-text)", margin: "0 0 16px" }}>{t("settings.data_privacy_heading")}</h2>

            <div style={{ background: "#fff", border: "1px solid var(--color-ledga-border)", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-ledga-border-subtle)" }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-ledga-text-muted)" }}>{t("settings.database_label")}</div>
                        <div style={{ fontSize: 13.5, color: "var(--color-ledga-text)", fontFamily: "monospace", marginTop: 3 }}>{dbPath}</div>
                    </div>
                    <button onClick={handleReveal} style={secondaryButtonStyle}>
                        {t("settings.reveal_button")}
                    </button>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-ledga-border-subtle)" }}>
                    <div style={{ fontSize: 14, color: "var(--color-ledga-text)" }}>{t("settings.sync_frequency_label")}</div>
                    <div
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 7,
                            border: "1px solid var(--color-ledga-border)",
                            borderRadius: 999,
                            padding: "5px 12px",
                            fontSize: 13,
                            color: "var(--color-ledga-text-secondary)"
                        }}
                    >
                        {anyAutoSync ? "Real-time (watch)" : "Manual only"}
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-ledga-border-subtle)" }}>
                    <div>
                        <div style={{ fontSize: 14, color: "var(--color-ledga-text)" }}>{t("settings.export_everything_label")}</div>
                        <div style={{ fontSize: 12, color: "var(--color-ledga-text-muted)" }}>{exportStatus ?? t("settings.export_default_status")}</div>
                    </div>
                    <button
                        onClick={handleExport}
                        style={{ ...secondaryButtonStyle, borderColor: "var(--color-ledga-brand-border)", color: "var(--color-ledga-brand)", display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                        <ExportIcon />
                        {t("settings.export_csv_button")}
                    </button>
                </div>

                <div style={{ padding: "14px 16px" }}>
                    {!confirmingClear ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div>
                                <div style={{ fontSize: 14, color: "var(--color-ledga-danger)", fontWeight: 500 }}>{t("settings.clear_all_data_label")}</div>
                                <div style={{ fontSize: 12, color: "var(--color-ledga-text-muted)" }}>{t("settings.clear_all_data_description")}</div>
                            </div>
                            <button onClick={() => setConfirmingClear(true)} style={{ ...secondaryButtonStyle, borderColor: "#e7c6b9", color: "var(--color-ledga-danger)" }}>
                                {t("settings.clear_button")}
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ fontSize: 13.5, color: "var(--color-ledga-text)", fontWeight: 500 }}>{t("settings.clear_confirm_prompt")}</div>
                            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                                <button onClick={() => setConfirmingClear(false)} style={secondaryButtonStyle}>
                                    {t("settings.cancel_button")}
                                </button>
                                <button
                                    onClick={handleClearData}
                                    disabled={isClearing}
                                    style={{
                                        border: "none",
                                        background: "var(--color-ledga-danger)",
                                        color: "#fff",
                                        borderRadius: 6,
                                        padding: "6px 12px",
                                        fontSize: 13,
                                        fontWeight: 500,
                                        cursor: "pointer",
                                        opacity: isClearing ? 0.6 : 1
                                    }}
                                >
                                    {isClearing ? "Clearing…" : "Confirm clear"}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, color: "var(--color-ledga-text-muted)", fontSize: 12.5 }}>
                <ShieldIcon />
                {t("settings.no_cloud_notice")}
            </div>
        </section>
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

function ExportIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
        </svg>
    )
}

function ShieldIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
        </svg>
    )
}
