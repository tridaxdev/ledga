import { useEffect, useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { useAnalytics, useCurrencies } from "../../hooks/useAnalytics"
import { AnalyticsRangeControl, resolveAnalyticsPreset } from "../../components/AnalyticsRangeControl"
import { formatCurrency } from "../../utils/formatCurrency"
import { computeNetWorthForecast } from "../../utils/forecast"

export const Route = createFileRoute("/analytics/")({ component: AnalyticsScreen })

function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0)
}

function endOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59)
}

function formatMonthLabel(monthKey: string): string {
    const [year, month] = monthKey.split("-").map(Number)
    return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
}

function formatDayLabel(unixSeconds: number): string {
    return new Date(unixSeconds * 1000).toLocaleDateString("en-US", { month: "short", day: "2-digit" })
}

function AnalyticsScreen() {
    const { t } = useTranslation()
    const [range, setRange] = useState(() => resolveAnalyticsPreset("last_12_months"))
    const currencies = useCurrencies()
    const [currency, setCurrency] = useState<string | null>(null)

    useEffect(() => {
        if (!currency && currencies.length > 0) setCurrency(currencies[0].currency)
    }, [currency, currencies])

    const from = Math.floor(startOfDay(range.start).getTime() / 1000)
    const to = Math.floor(endOfDay(range.end).getTime() / 1000)
    const { monthlyTotals, categoryTotals, netWorthHistory, isLoading } = useAnalytics({ from, to, currency: currency ?? "" })

    const netWorthForecast = useMemo(() => computeNetWorthForecast(netWorthHistory, monthlyTotals), [netWorthHistory, monthlyTotals])

    const netWorthData = useMemo(() => {
        const base = netWorthHistory.map(p => ({ timestamp: p.timestamp, balance: p.balance, forecastBalance: null as number | null }))
        if (netWorthForecast !== null && base.length > 0) {
            base[base.length - 1] = { ...base[base.length - 1], forecastBalance: base[base.length - 1].balance }
            base.push({ timestamp: netWorthForecast.timestamp, balance: null as unknown as number, forecastBalance: netWorthForecast.balance })
        }
        return base
    }, [netWorthHistory, netWorthForecast])

    const cashFlowData = useMemo(
        () =>
            monthlyTotals.map(m => ({
                label: formatMonthLabel(m.month),
                income: m.income,
                expenseNegative: -m.expense
            })),
        [monthlyTotals]
    )

    const totalSpend = categoryTotals.reduce((acc, c) => acc + c.total, 0)

    return (
        <div style={{ flex: 1, overflowY: "auto" }}>
            <div style={{ maxWidth: 920, margin: "0 auto", padding: "30px 40px 56px", display: "flex", flexDirection: "column", gap: 18 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                    <AnalyticsRangeControl value={range} onChange={setRange} />
                    <CurrencySelect currencies={currencies.map(c => c.currency)} selected={currency} onSelect={setCurrency} />
                </div>

                {!isLoading && monthlyTotals.length === 0 ? (
                    <EmptyState message={t("analytics.no_data")} />
                ) : (
                    <>
                        <Panel title={t("analytics.category_breakdown_heading")} sub={formatCurrency(totalSpend, currency ?? "USD")}>
                            {categoryTotals.length === 0 ? (
                                <EmptyState message={t("analytics.no_data")} />
                            ) : (
                                <ResponsiveContainer width="100%" height={260}>
                                    <PieChart>
                                        <Pie data={categoryTotals} dataKey="total" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2}>
                                            {categoryTotals.map(entry => (
                                                <Cell key={entry.categoryId ?? "uncategorized"} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={v => formatCurrency(Number(v), currency ?? "USD")} contentStyle={tooltipStyle} />
                                        <Legend wrapperStyle={{ fontSize: 12 }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </Panel>

                        <Panel title={t("analytics.cash_flow_heading")}>
                            <ResponsiveContainer width="100%" height={220}>
                                <ComposedChart data={cashFlowData} margin={{ top: 6, right: 12, left: -12, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-ledga-border-subtle)" vertical={false} />
                                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-ledga-text-muted)" }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 11, fill: "var(--color-ledga-text-muted)" }} axisLine={false} tickLine={false} width={0} />
                                    <Tooltip formatter={v => formatCurrency(Number(v), currency ?? "USD")} contentStyle={tooltipStyle} />
                                    <ReferenceLine y={0} stroke="var(--color-ledga-border)" />
                                    <Bar dataKey="income" name={t("analytics.income_label")} fill="var(--color-ledga-brand)" radius={[3, 3, 0, 0]} />
                                    <Bar dataKey="expenseNegative" name={t("analytics.expense_label")} fill="var(--color-ledga-text-muted)" radius={[0, 0, 3, 3]} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </Panel>

                        <Panel
                            title={t("analytics.net_worth_heading")}
                            sub={netWorthHistory.length > 0 ? formatCurrency(netWorthHistory[netWorthHistory.length - 1].balance, currency ?? "USD") : undefined}
                        >
                            {netWorthHistory.length === 0 ? (
                                <EmptyState message={t("analytics.no_data")} />
                            ) : (
                                <>
                                    <ResponsiveContainer width="100%" height={260}>
                                        <LineChart data={netWorthData} margin={{ top: 6, right: 12, left: -12, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-ledga-border-subtle)" vertical={false} />
                                            <XAxis
                                                dataKey="timestamp"
                                                type="number"
                                                domain={["dataMin", "dataMax"]}
                                                tickFormatter={ts => formatDayLabel(ts)}
                                                tick={{ fontSize: 11, fill: "var(--color-ledga-text-muted)" }}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <YAxis tick={{ fontSize: 11, fill: "var(--color-ledga-text-muted)" }} axisLine={false} tickLine={false} width={0} />
                                            <Tooltip
                                                labelFormatter={label => formatDayLabel(Number(label))}
                                                formatter={v => formatCurrency(Number(v), currency ?? "USD")}
                                                contentStyle={tooltipStyle}
                                            />
                                            <Line type="monotone" dataKey="balance" name={t("analytics.net_worth_label")} stroke="var(--color-ledga-text)" strokeWidth={2} dot={{ r: 2 }} />
                                            <Line
                                                type="monotone"
                                                dataKey="forecastBalance"
                                                name={t("analytics.forecast_label")}
                                                stroke="var(--color-ledga-brand)"
                                                strokeWidth={2}
                                                strokeDasharray="5 4"
                                                dot={{ r: 3 }}
                                                connectNulls
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                    <div style={{ fontSize: 12.5, color: "var(--color-ledga-text-secondary)", marginTop: 8 }}>
                                        {t(netWorthForecast === null ? "analytics.forecast_insufficient_history" : "analytics.net_worth_forecast_explainer")}
                                    </div>
                                </>
                            )}
                        </Panel>
                    </>
                )}
            </div>
        </div>
    )
}

const tooltipStyle: React.CSSProperties = {
    border: "1px solid var(--color-ledga-border)",
    borderRadius: 8,
    fontSize: 12.5,
    boxShadow: "0 4px 14px -4px rgba(63,56,47,.2)"
}

function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
    return (
        <div style={{ background: "#fff", border: "1px solid var(--color-ledga-border)", borderRadius: 8, boxShadow: "0 1px 2px rgba(63,56,47,.05)", padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: "var(--color-ledga-text)" }}>{title}</div>
                {sub && <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-ledga-text-secondary)" }}>{sub}</div>}
            </div>
            {children}
        </div>
    )
}

function EmptyState({ message }: { message: string }) {
    return <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 13.5, color: "var(--color-ledga-text-muted)" }}>{message}</div>
}

function CurrencySelect({ currencies, selected, onSelect }: { currencies: string[]; selected: string | null; onSelect: (currency: string) => void }) {
    if (currencies.length <= 1) return null
    return (
        <select
            value={selected ?? ""}
            onChange={e => onSelect(e.target.value)}
            style={{
                border: "1px solid var(--color-ledga-border)",
                background: "#fff",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--color-ledga-text)",
                fontFamily: "inherit",
                cursor: "pointer"
            }}
        >
            {currencies.map(c => (
                <option key={c} value={c}>
                    {c}
                </option>
            ))}
        </select>
    )
}
