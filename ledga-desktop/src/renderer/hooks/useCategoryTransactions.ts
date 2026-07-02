import { useState, useEffect, useCallback } from 'react'
import { getLedgaAPI } from './apiClient'
import type { CategoryAggregate, CategoryQueryParams, FlaggedTransaction, Transaction } from '@/common/types/Transaction'

const EMPTY_AGGREGATE: CategoryAggregate = { total: 0, count: 0, priorMonthTotal: 0 }

export function useCategoryTransactions(params: CategoryQueryParams) {
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [aggregate, setAggregate] = useState<CategoryAggregate>(EMPTY_AGGREGATE)
    const [flagged, setFlagged] = useState<FlaggedTransaction[]>([])
    const [isLoading, setIsLoading] = useState(true)

    const { categoryId, from, to } = params

    const refetch = useCallback(async () => {
        setIsLoading(true)
        const result = await getLedgaAPI().transactions.queryByCategory({ categoryId, from, to })
        if (result.kind === 'success') {
            setTransactions(result.value.transactions)
            setAggregate(result.value.aggregate)
            setFlagged(result.value.flagged)
        }
        setIsLoading(false)
    }, [categoryId, from, to])

    useEffect(() => {
        refetch()
    }, [refetch])

    useEffect(() => {
        return getLedgaAPI().transactions.onInvalidated(refetch)
    }, [refetch])

    const updateCategory = useCallback(async (id: string, newCategoryId: string | null) => {
        const result = await getLedgaAPI().transactions.updateCategory(id, newCategoryId)
        if (result.kind === 'success') await refetch()
        return result
    }, [refetch])

    const keepSuggestion = useCallback(async (id: string) => {
        const result = await getLedgaAPI().transactions.markReviewed(id)
        if (result.kind === 'success') await refetch()
        return result
    }, [refetch])

    return { transactions, aggregate, flagged, isLoading, refetch, updateCategory, keepSuggestion }
}
