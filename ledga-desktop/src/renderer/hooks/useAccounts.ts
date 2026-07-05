import { useState, useEffect, useCallback } from "react"
import { getLedgaAPI } from "./apiClient"
import type { TransactionAccount } from "@/common/types/Transaction"

export function useAccounts() {
    const [accounts, setAccounts] = useState<TransactionAccount[]>([])

    const refetch = useCallback(async () => {
        const result = await getLedgaAPI().transactions.listAccounts()
        if (result.kind === "success") setAccounts(result.value)
    }, [])

    useEffect(() => {
        refetch()
    }, [refetch])

    // New imports (Gmail sync or CSV) can introduce accounts never seen before, so the dropdown
    // needs to pick those up without requiring an app restart.
    useEffect(() => {
        return getLedgaAPI().transactions.onInvalidated(refetch)
    }, [refetch])

    return { accounts }
}
