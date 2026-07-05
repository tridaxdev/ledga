import { useState, useEffect, useCallback } from "react"
import { getLedgaAPI } from "./apiClient"
import type { AnalyticsQueryParams, CategoryTotal, CurrencyCount, MonthlyTotal, NetWorthPoint } from "@/common/types/Analytics"

export function useAnalytics(params: AnalyticsQueryParams) {
    const [monthlyTotals, setMonthlyTotals] = useState<MonthlyTotal[]>([])
    const [categoryTotals, setCategoryTotals] = useState<CategoryTotal[]>([])
    const [netWorthHistory, setNetWorthHistory] = useState<NetWorthPoint[]>([])
    const [isLoading, setIsLoading] = useState(true)

    const { from, to, currency } = params

    const refetch = useCallback(async () => {
        setIsLoading(true)
        const [monthlyResult, categoryResult, netWorthResult] = await Promise.all([
            getLedgaAPI().analytics.getMonthlyTotals({ from, to, currency }),
            getLedgaAPI().analytics.getCategoryTotals({ from, to, currency }),
            getLedgaAPI().analytics.getNetWorthHistory({ from, to, currency })
        ])
        if (monthlyResult.kind === "success") setMonthlyTotals(monthlyResult.value)
        if (categoryResult.kind === "success") setCategoryTotals(categoryResult.value)
        if (netWorthResult.kind === "success") setNetWorthHistory(netWorthResult.value)
        setIsLoading(false)
    }, [from, to, currency])

    useEffect(() => {
        refetch()
    }, [refetch])

    // A rule/category change can retroactively re-bucket historical transactions, so any open
    // Analytics view needs to re-query rather than rely on stale aggregates.
    useEffect(() => {
        return getLedgaAPI().transactions.onInvalidated(refetch)
    }, [refetch])

    return { monthlyTotals, categoryTotals, netWorthHistory, isLoading }
}

export function useCurrencies(): CurrencyCount[] {
    const [currencies, setCurrencies] = useState<CurrencyCount[]>([])

    useEffect(() => {
        getLedgaAPI()
            .analytics.listCurrencies()
            .then(result => {
                if (result.kind === "success") setCurrencies(result.value)
            })
    }, [])

    return currencies
}
