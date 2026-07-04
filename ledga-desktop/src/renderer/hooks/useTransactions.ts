import { useState, useEffect, useCallback } from "react"
import { getLedgaAPI } from "./apiClient"
import type { Transaction, TransactionQueryParams, TransactionSummary } from "@/common/types/Transaction"

const EMPTY_SUMMARY: TransactionSummary = { balance: 0, moneyIn: 0, moneyOut: 0, incomeCount: 0, expenseCount: 0 }

export function useTransactions(params: TransactionQueryParams) {
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [summary, setSummary] = useState<TransactionSummary>(EMPTY_SUMMARY)
    const [isLoading, setIsLoading] = useState(true)

    const { from, to, categoryId, search } = params

    const refetch = useCallback(async () => {
        setIsLoading(true)
        const result = await getLedgaAPI().transactions.query({ from, to, categoryId, search })
        if (result.kind === "success") {
            setTransactions(result.value.transactions)
            setSummary(result.value.summary)
        }
        setIsLoading(false)
    }, [from, to, categoryId, search])

    useEffect(() => {
        refetch()
    }, [refetch])

    // A rule being created/updated/deleted can retroactively change category/merchant on any
    // transaction, so any open Ledger/Category-Review view needs to re-query rather than rely on
    // its own optimistic patches.
    useEffect(() => {
        return getLedgaAPI().transactions.onInvalidated(refetch)
    }, [refetch])

    const updateCategory = useCallback(async (id: string, categoryId: string | null) => {
        const result = await getLedgaAPI().transactions.updateCategory(id, categoryId)
        if (result.kind === "success") {
            setTransactions(prev => prev.map(t => (t.id === id ? { ...t, category_id: categoryId } : t)))
        }
        return result
    }, [])

    return { transactions, summary, isLoading, refetch, updateCategory }
}
