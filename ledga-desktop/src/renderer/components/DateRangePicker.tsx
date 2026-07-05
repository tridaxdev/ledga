import { useState, useRef, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useDateRange, dateRangeToBounds, type RangeMode } from "../hooks/useDateRange"
import { Calendar, formatInputValue, parseInputValue } from "./Calendar"

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export function DateRangePicker() {
    const { t } = useTranslation()
    const { state, update } = useDateRange()
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    const { title } = dateRangeToBounds(state)

    useEffect(() => {
        if (!open) return
        function handleClickOutside(event: MouseEvent) {
            if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [open])

    function selectMode(mode: RangeMode) {
        update({ mode })
    }

    return (
        <div ref={ref} style={{ position: "relative" }}>
            <button onClick={() => setOpen(prev => !prev)} style={{ textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0, display: "block" }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-ledga-text-muted)", marginBottom: 4 }}>
                    {t("date_range_picker.ledger_label")}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 34, fontWeight: 600, letterSpacing: "-0.01em", margin: 0, color: "var(--color-ledga-text)" }}>{title}</h1>
                    <span
                        style={{
                            width: 26,
                            height: 26,
                            borderRadius: 6,
                            border: "1px solid var(--color-ledga-border)",
                            background: "#fff",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--color-ledga-text-muted)"
                        }}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m6 9 6 6 6-6" />
                        </svg>
                    </span>
                </div>
            </button>

            {open && (
                <div
                    style={{
                        position: "absolute",
                        top: "calc(100% + 8px)",
                        left: 0,
                        width: 304,
                        backgroundColor: "#fff",
                        border: "1px solid var(--color-ledga-border)",
                        borderRadius: 10,
                        boxShadow: "0 14px 30px -10px rgba(63,56,47,.24), 0 4px 10px -2px rgba(63,56,47,.1)",
                        zIndex: 40,
                        padding: 14
                    }}
                >
                    <div style={{ display: "flex", gap: 4, background: "var(--color-ledga-sidebar)", border: "1px solid var(--color-ledga-border)", borderRadius: 8, padding: 3, marginBottom: 13 }}>
                        {(["month", "year", "custom"] as RangeMode[]).map(mode => (
                            <button
                                key={mode}
                                onClick={() => selectMode(mode)}
                                style={{
                                    flex: 1,
                                    textTransform: "capitalize",
                                    padding: "6px 0",
                                    borderRadius: 6,
                                    border: "none",
                                    fontSize: 13,
                                    fontWeight: 500,
                                    cursor: "pointer",
                                    background: state.mode === mode ? "#fff" : "transparent",
                                    color: state.mode === mode ? "var(--color-ledga-text)" : "var(--color-ledga-text-secondary)",
                                    boxShadow: state.mode === mode ? "0 1px 2px rgba(63,56,47,.12)" : "none"
                                }}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>

                    {state.mode === "month" && (
                        <>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                                <IconButton onClick={() => update({ year: state.year - 1 })} path="m15 18-6-6 6-6" />
                                <span style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ledga-text)" }}>{state.year}</span>
                                <IconButton onClick={() => update({ year: state.year + 1 })} path="m9 18 6-6-6-6" />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
                                {MONTH_SHORT.map((label, index) => (
                                    <button
                                        key={label}
                                        onClick={() => {
                                            update({ mode: "month", month: index })
                                            setOpen(false)
                                        }}
                                        style={monthYearButtonStyle(state.mode === "month" && state.month === index)}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}

                    {state.mode === "year" && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
                            {Array.from({ length: 4 }, (_, i) => state.year - 2 + i).map(year => (
                                <button
                                    key={year}
                                    onClick={() => {
                                        update({ mode: "year", year })
                                        setOpen(false)
                                    }}
                                    style={monthYearButtonStyle(state.year === year)}
                                >
                                    {year}
                                </button>
                            ))}
                        </div>
                    )}

                    {state.mode === "custom" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                            <Calendar
                                value={{ start: parseInputValue(state.customFrom), end: parseInputValue(state.customTo) }}
                                onChange={range => update({ customFrom: formatInputValue(range.start), customTo: formatInputValue(range.end) })}
                            />
                            <button
                                onClick={() => setOpen(false)}
                                style={{ background: "var(--color-ledga-brand)", color: "#fff", border: "none", borderRadius: 7, padding: 9, fontSize: 13, fontWeight: 500, cursor: "pointer" }}
                            >
                                {t("date_range_picker.apply_range_button")}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function monthYearButtonStyle(selected: boolean): React.CSSProperties {
    return {
        padding: "8px 0",
        borderRadius: 6,
        border: "none",
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        background: selected ? "var(--color-ledga-brand)" : "transparent",
        color: selected ? "#fff" : "var(--color-ledga-text)"
    }
}

function IconButton({ onClick, path }: { onClick: () => void; path: string }) {
    return (
        <button
            onClick={onClick}
            style={{
                width: 28,
                height: 28,
                border: "1px solid var(--color-ledga-border)",
                borderRadius: 6,
                background: "#fff",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-ledga-text-secondary)"
            }}
        >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                <path d={path} />
            </svg>
        </button>
    )
}
