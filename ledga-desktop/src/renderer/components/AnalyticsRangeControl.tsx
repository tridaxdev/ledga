import { useState, useRef, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Calendar, type DateRangeValue } from "./Calendar"

export type AnalyticsPreset = "last_3_months" | "last_6_months" | "last_12_months" | "this_year" | "custom"

interface Props {
    value: { start: Date; end: Date }
    onChange: (value: { start: Date; end: Date }) => void
}

function monthsAgo(date: Date, months: number): Date {
    const result = new Date(date)
    result.setMonth(result.getMonth() - months)
    return result
}

function startOfYear(date: Date): Date {
    return new Date(date.getFullYear(), 0, 1)
}

export function resolveAnalyticsPreset(preset: AnalyticsPreset): { start: Date; end: Date } {
    const now = new Date()
    switch (preset) {
        case "last_3_months":
            return { start: monthsAgo(now, 3), end: now }
        case "last_6_months":
            return { start: monthsAgo(now, 6), end: now }
        case "this_year":
            return { start: startOfYear(now), end: now }
        case "last_12_months":
        default:
            return { start: monthsAgo(now, 12), end: now }
    }
}

function formatRangeLabel(range: { start: Date; end: Date }): string {
    const fmt = (date: Date) => date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })
    return `${fmt(range.start)} – ${fmt(range.end)}`
}

export function AnalyticsRangeControl({ value, onChange }: Props) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [preset, setPreset] = useState<AnalyticsPreset>("last_12_months")
    const [customRange, setCustomRange] = useState<DateRangeValue>({ start: value.start, end: value.end })
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        function handleClickOutside(event: MouseEvent) {
            if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [open])

    function selectPreset(next: AnalyticsPreset) {
        setPreset(next)
        if (next === "custom") return
        onChange(resolveAnalyticsPreset(next))
        setOpen(false)
    }

    function handleApplyCustom() {
        if (!customRange.start || !customRange.end) return
        onChange({ start: customRange.start, end: customRange.end })
        setOpen(false)
    }

    return (
        <div ref={ref} style={{ position: "relative" }}>
            <button
                onClick={() => setOpen(prev => !prev)}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    border: "1px solid var(--color-ledga-border)",
                    background: "#fff",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--color-ledga-text)",
                    cursor: "pointer"
                }}
            >
                <CalendarGlyph />
                {formatRangeLabel(value)}
            </button>

            {open && (
                <div
                    style={{
                        position: "absolute",
                        top: "calc(100% + 8px)",
                        left: 0,
                        width: 300,
                        backgroundColor: "#fff",
                        border: "1px solid var(--color-ledga-border)",
                        borderRadius: 10,
                        boxShadow: "0 14px 30px -10px rgba(63,56,47,.24), 0 4px 10px -2px rgba(63,56,47,.1)",
                        zIndex: 40,
                        padding: 14
                    }}
                >
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: preset === "custom" ? 12 : 0 }}>
                        <PresetPill selected={preset === "last_3_months"} onClick={() => selectPreset("last_3_months")}>
                            {t("analytics.last_3_months")}
                        </PresetPill>
                        <PresetPill selected={preset === "last_6_months"} onClick={() => selectPreset("last_6_months")}>
                            {t("analytics.last_6_months")}
                        </PresetPill>
                        <PresetPill selected={preset === "last_12_months"} onClick={() => selectPreset("last_12_months")}>
                            {t("analytics.last_12_months")}
                        </PresetPill>
                        <PresetPill selected={preset === "this_year"} onClick={() => selectPreset("this_year")}>
                            {t("analytics.this_year")}
                        </PresetPill>
                        <PresetPill selected={preset === "custom"} onClick={() => selectPreset("custom")}>
                            {t("analytics.custom")}
                        </PresetPill>
                    </div>

                    {preset === "custom" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <Calendar value={customRange} onChange={setCustomRange} />
                            <button
                                onClick={handleApplyCustom}
                                disabled={!customRange.start || !customRange.end}
                                style={{
                                    background: "var(--color-ledga-brand)",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: 7,
                                    padding: 9,
                                    fontSize: 13,
                                    fontWeight: 500,
                                    cursor: customRange.start && customRange.end ? "pointer" : "default",
                                    opacity: customRange.start && customRange.end ? 1 : 0.6
                                }}
                            >
                                {t("analytics.apply_range_button")}
                            </button>
                        </div>
                    )}
                </div>
            )}
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
                padding: "6px 12px",
                fontSize: 12.5,
                fontWeight: 500,
                cursor: "pointer"
            }}
        >
            {children}
        </button>
    )
}

function CalendarGlyph() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-ledga-brand)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M3 9h18M8 2v4M16 2v4" />
        </svg>
    )
}
