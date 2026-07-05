import type { MonthlyTotal, NetWorthPoint } from "@/common/types/Analytics"

const TRAILING_MONTHS = 3
const MIN_MONTHS_OF_HISTORY = 2
const FORECAST_HORIZON_SECONDS = 30 * 24 * 60 * 60

export interface NetWorthForecast {
    timestamp: number
    balance: number
}

// Projects net worth one month forward from the last known balance, using the average net cash flow
// (income minus expense) of the last few months. Deliberately a flat trailing average rather than a
// trend line, so one anomalous month can't skew the projection and the estimate stays easy to explain.
export function computeNetWorthForecast(netWorthHistory: NetWorthPoint[], monthlyTotals: MonthlyTotal[]): NetWorthForecast | null {
    if (netWorthHistory.length === 0 || monthlyTotals.length < MIN_MONTHS_OF_HISTORY) return null
    const trailing = monthlyTotals.slice(-TRAILING_MONTHS)
    const netAverage = trailing.reduce((acc, month) => acc + (month.income - month.expense), 0) / trailing.length
    const last = netWorthHistory[netWorthHistory.length - 1]
    return { timestamp: last.timestamp + FORECAST_HORIZON_SECONDS, balance: last.balance + netAverage }
}
