import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

export interface DateRangeValue {
    start: Date | null
    end: Date | null
}

interface Props {
    value: DateRangeValue
    onChange: (value: DateRangeValue) => void
    maxDate?: Date
}

const CELL_COUNT = 42 // 6 weeks x 7 days, kept fixed so the grid height never jumps between months

function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, delta: number): Date {
    return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

function isSameDay(a: Date | null, b: Date | null): boolean {
    if (!a || !b) return false
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function formatInputValue(date: Date | null): string {
    if (!date) return ""
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, "0")
    const d = String(date.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
}

export function parseInputValue(value: string): Date | null {
    if (!value) return null
    const parsed = new Date(`${value}T00:00:00`)
    return Number.isNaN(parsed.getTime()) ? null : parsed
}

// Intl weekInfo.firstDay is 1 (Monday) .. 7 (Sunday); JS Date.getDay() is 0 (Sunday) .. 6 (Saturday).
// %7 maps Intl's 7 (Sunday) to 0, leaving Monday..Saturday (1-6) unchanged, matching JS convention.
function getWeekStartsOn(locale: string): number {
    try {
        const asLocale = new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } }
        const info = asLocale.getWeekInfo ? asLocale.getWeekInfo() : asLocale.weekInfo
        if (info?.firstDay) return info.firstDay % 7
    } catch {
        // Intl.Locale weekInfo isn't available in every runtime; fall through to the manual map below.
    }
    return locale.startsWith("de") ? 1 : 0
}

function getWeekdayLabels(locale: string, weekStartsOn: number): string[] {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" })
    // 2021-01-04 was a Sunday; days 4-10 span one full Sun-Sat reference week to format from.
    const reference = [4, 5, 6, 7, 8, 9, 10].map(day => new Date(2021, 0, day))
    const sundayFirst = reference.map(date => formatter.format(date))
    return [...sundayFirst.slice(weekStartsOn), ...sundayFirst.slice(0, weekStartsOn)]
}

function buildMonthGrid(viewDate: Date, weekStartsOn: number): (Date | null)[] {
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    const firstOfMonth = new Date(year, month, 1)
    const firstWeekday = firstOfMonth.getDay()
    const leadingBlanks = (firstWeekday - weekStartsOn + 7) % 7
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const cells: (Date | null)[] = []
    for (let i = 0; i < leadingBlanks; i++) cells.push(null)
    for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day))
    while (cells.length < CELL_COUNT) cells.push(null)
    return cells
}

export function Calendar({ value, onChange, maxDate }: Props) {
    const { t, i18n } = useTranslation()
    const [viewDate, setViewDate] = useState(() => startOfMonth(value.start ?? value.end ?? new Date()))
    const [hoverDate, setHoverDate] = useState<Date | null>(null)
    const [jumpOpen, setJumpOpen] = useState(false)
    const [jumpYear, setJumpYear] = useState(viewDate.getFullYear())

    useEffect(() => {
        if (value.start) setViewDate(startOfMonth(value.start))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value.start?.getTime()])

    const today = startOfDay(new Date())
    const upperBound = maxDate ? startOfDay(maxDate) : today
    const weekStartsOn = getWeekStartsOn(i18n.language)
    const weekdayLabels = getWeekdayLabels(i18n.language, weekStartsOn)
    const monthLabel = new Intl.DateTimeFormat(i18n.language, { month: "long", year: "numeric" }).format(viewDate)
    const cells = buildMonthGrid(viewDate, weekStartsOn)

    const rangeStart = value.start && value.end && value.start > value.end ? value.end : value.start
    const rangeEnd = value.start && value.end && value.start > value.end ? value.start : value.end
    const previewEnd = value.start && !value.end ? hoverDate : null

    function isDisabled(date: Date): boolean {
        return date > upperBound
    }

    function handleDayClick(date: Date) {
        if (isDisabled(date)) return
        if (!value.start || (value.start && value.end)) {
            onChange({ start: date, end: null })
        } else if (date < value.start) {
            onChange({ start: date, end: value.start })
        } else {
            onChange({ start: value.start, end: date })
        }
    }

    function openJump() {
        setJumpYear(viewDate.getFullYear())
        setJumpOpen(true)
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 10 }}>
                <DateLabel label={t("calendar.from_label")} date={value.start} locale={i18n.language} />
                <DateLabel label={t("calendar.to_label")} date={value.end} locale={i18n.language} />
            </div>

            <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <NavButton onClick={() => setViewDate(prev => addMonths(prev, -1))} path="m15 18-6-6 6-6" disabled={jumpOpen} />
                    <button
                        onClick={() => (jumpOpen ? setJumpOpen(false) : openJump())}
                        style={{
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            fontSize: 14,
                            fontWeight: 600,
                            color: "var(--color-ledga-text)",
                            textTransform: "capitalize"
                        }}
                    >
                        {monthLabel}
                    </button>
                    <NavButton onClick={() => setViewDate(prev => addMonths(prev, 1))} path="m9 18 6-6-6-6" disabled={jumpOpen} />
                </div>

                {jumpOpen && (
                    <>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                            <NavButton onClick={() => setJumpYear(y => y - 1)} path="m15 18-6-6 6-6" />
                            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ledga-text)" }}>{jumpYear}</span>
                            <NavButton onClick={() => setJumpYear(y => y + 1)} path="m9 18 6-6-6-6" />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
                            {Array.from({ length: 12 }, (_, month) => new Date(jumpYear, month, 1)).map(monthDate => (
                                <button
                                    key={monthDate.getMonth()}
                                    onClick={() => {
                                        setViewDate(startOfMonth(monthDate))
                                        setJumpOpen(false)
                                    }}
                                    style={jumpButtonStyle(monthDate.getFullYear() === viewDate.getFullYear() && monthDate.getMonth() === viewDate.getMonth())}
                                >
                                    {new Intl.DateTimeFormat(i18n.language, { month: "short" }).format(monthDate)}
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {!jumpOpen && (
                    <>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
                            {weekdayLabels.map(label => (
                                <div key={label} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 600, color: "var(--color-ledga-text-muted)", padding: "2px 0" }}>
                                    {label}
                                </div>
                            ))}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                            {cells.map((date, index) => {
                                if (!date) return <div key={index} />

                                const disabled = isDisabled(date)
                                const isStart = isSameDay(date, rangeStart)
                                const isEnd = isSameDay(date, rangeEnd)
                                const inConfirmedRange = !!rangeStart && !!rangeEnd && date > rangeStart && date < rangeEnd
                                const inPreviewRange =
                                    !!value.start && !!previewEnd && date > (value.start < previewEnd ? value.start : previewEnd) && date < (value.start < previewEnd ? previewEnd : value.start)
                                const isToday = isSameDay(date, today)

                                return (
                                    <button
                                        key={index}
                                        onClick={() => handleDayClick(date)}
                                        onMouseEnter={() => setHoverDate(date)}
                                        onMouseLeave={() => setHoverDate(prev => (isSameDay(prev, date) ? null : prev))}
                                        disabled={disabled}
                                        style={{
                                            border: isToday && !isStart && !isEnd ? "1px solid var(--color-ledga-brand-border)" : "none",
                                            borderRadius: 6,
                                            padding: "7px 0",
                                            fontSize: 13,
                                            fontWeight: isStart || isEnd ? 600 : 500,
                                            cursor: disabled ? "default" : "pointer",
                                            background: isStart || isEnd ? "var(--color-ledga-brand)" : inConfirmedRange || inPreviewRange ? "var(--color-ledga-brand-bg)" : "transparent",
                                            color: isStart || isEnd ? "#fff" : disabled ? "var(--color-ledga-text-muted)" : "var(--color-ledga-text)",
                                            opacity: disabled ? 0.4 : 1
                                        }}
                                    >
                                        {date.getDate()}
                                    </button>
                                )
                            })}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

function jumpButtonStyle(selected: boolean): React.CSSProperties {
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

function NavButton({ onClick, path, disabled }: { onClick: () => void; path: string; disabled?: boolean }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                width: 26,
                height: 26,
                border: "1px solid var(--color-ledga-border)",
                borderRadius: 6,
                background: "#fff",
                cursor: disabled ? "default" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-ledga-text-secondary)",
                opacity: disabled ? 0.4 : 1
            }}
        >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                <path d={path} />
            </svg>
        </button>
    )
}

function DateLabel({ label, date, locale }: { label: string; date: Date | null; locale: string }) {
    const formatted = date ? new Intl.DateTimeFormat(locale, { month: "short", day: "2-digit", year: "numeric" }).format(date) : "—"
    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-ledga-text-muted)" }}>{label}</span>
            <div
                style={{
                    border: "1px solid var(--color-ledga-border)",
                    borderRadius: 6,
                    padding: "7px 9px",
                    fontSize: 13,
                    color: date ? "var(--color-ledga-text)" : "var(--color-ledga-text-muted)",
                    background: "#fff",
                    boxSizing: "border-box"
                }}
            >
                {formatted}
            </div>
        </div>
    )
}
