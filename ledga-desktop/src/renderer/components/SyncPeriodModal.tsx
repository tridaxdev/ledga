import { useState, type MouseEvent } from "react"
import { useTranslation } from "react-i18next"
import { Calendar, type DateRangeValue } from "./Calendar"

type Preset = "this_month" | "one_month" | "three_months" | "one_year" | "custom"

interface Props {
    isOpen: boolean
    onClose: () => void
    onConfirm: (range: { from: Date; to: Date }) => void
}

function startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1)
}

function monthsAgo(date: Date, months: number): Date {
    const result = new Date(date)
    result.setMonth(result.getMonth() - months)
    return result
}

function yearsAgo(date: Date, years: number): Date {
    const result = new Date(date)
    result.setFullYear(result.getFullYear() - years)
    return result
}

function resolveRange(preset: Preset, custom: DateRangeValue): { from: Date; to: Date } | null {
    const now = new Date()
    switch (preset) {
        case "this_month":
            return { from: startOfMonth(now), to: now }
        case "one_month":
            return { from: monthsAgo(now, 1), to: now }
        case "three_months":
            return { from: monthsAgo(now, 3), to: now }
        case "one_year":
            return { from: yearsAgo(now, 1), to: now }
        case "custom": {
            if (!custom.start || !custom.end) return null
            const from = new Date(custom.start.getFullYear(), custom.start.getMonth(), custom.start.getDate(), 0, 0, 0)
            const to = new Date(custom.end.getFullYear(), custom.end.getMonth(), custom.end.getDate(), 23, 59, 59)
            if (from > to) return null
            return { from, to }
        }
        default:
            return null
    }
}

function formatPreviewDate(date: Date): string {
    return date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })
}

export function SyncPeriodModal({ isOpen, onClose, onConfirm }: Props) {
    const { t } = useTranslation()
    const [preset, setPreset] = useState<Preset>("one_month")
    const [customRange, setCustomRange] = useState<DateRangeValue>({ start: null, end: null })

    if (!isOpen) return null

    const range = resolveRange(preset, customRange)

    function handleConfirm() {
        if (!range) return
        onConfirm(range)
    }

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(31, 27, 22, 0.34)",
                backdropFilter: "blur(5px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 50
            }}
            onClick={onClose}
        >
            <div
                style={{
                    width: "420px",
                    backgroundColor: "#fff",
                    border: "1px solid var(--color-ledga-border)",
                    borderRadius: "14px",
                    boxShadow: "0 24px 50px -12px rgba(63,56,47,.4)",
                    overflow: "hidden"
                }}
                onClick={(e: MouseEvent) => e.stopPropagation()}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "14px 18px",
                        borderBottom: "1px solid var(--color-ledga-border-subtle)"
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 500, color: "var(--color-ledga-text-secondary)" }}>
                        <CalendarIcon />
                        {t("sync_period_modal.header")}
                    </div>
                    <button onClick={onClose} style={{ color: "var(--color-ledga-text-muted)", cursor: "pointer", border: "none", background: "transparent", display: "inline-flex" }}>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={{ fontSize: "13px", color: "var(--color-ledga-text-secondary)", lineHeight: 1.5 }}>{t("sync_period_modal.description")}</div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                        <PresetPill selected={preset === "this_month"} onClick={() => setPreset("this_month")}>
                            {t("sync_period_modal.this_month")}
                        </PresetPill>
                        <PresetPill selected={preset === "one_month"} onClick={() => setPreset("one_month")}>
                            {t("sync_period_modal.one_month")}
                        </PresetPill>
                        <PresetPill selected={preset === "three_months"} onClick={() => setPreset("three_months")}>
                            {t("sync_period_modal.three_months")}
                        </PresetPill>
                        <PresetPill selected={preset === "one_year"} onClick={() => setPreset("one_year")}>
                            {t("sync_period_modal.one_year")}
                        </PresetPill>
                        <PresetPill selected={preset === "custom"} onClick={() => setPreset("custom")}>
                            {t("sync_period_modal.custom")}
                        </PresetPill>
                    </div>

                    {preset === "custom" && <Calendar value={customRange} onChange={setCustomRange} />}

                    <div style={{ fontSize: "12.5px", color: "var(--color-ledga-text-muted)", minHeight: "1.4em" }}>
                        {range ? t("sync_period_modal.range_preview", { from: formatPreviewDate(range.from), to: formatPreviewDate(range.to) }) : t("sync_period_modal.range_incomplete")}
                    </div>

                    <button
                        onClick={handleConfirm}
                        disabled={!range}
                        style={{
                            alignSelf: "flex-start",
                            backgroundColor: "var(--color-ledga-brand)",
                            color: "#fff",
                            border: "none",
                            borderRadius: "7px",
                            padding: "10px 18px",
                            fontSize: "14px",
                            fontWeight: 500,
                            cursor: range ? "pointer" : "default",
                            opacity: range ? 1 : 0.6
                        }}
                    >
                        {t("sync_period_modal.confirm_button")}
                    </button>
                </div>
            </div>
        </div>
    )
}

function PresetPill({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            style={{
                border: selected ? "1px solid var(--color-ledga-brand-border)" : "1px solid var(--color-ledga-border)",
                background: selected ? "var(--color-ledga-brand-bg)" : "#fff",
                color: selected ? "var(--color-ledga-brand)" : "var(--color-ledga-text-secondary)",
                borderRadius: 999,
                padding: "6px 13px",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer"
            }}
        >
            {children}
        </button>
    )
}

function CalendarIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-ledga-brand)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M3 9h18M8 2v4M16 2v4" />
        </svg>
    )
}
