import { useState, useEffect, useCallback } from "react"
import { getLedgaAPI } from "./apiClient"

export function useEmailActivity() {
    const [counts, setCounts] = useState({ processing: 0, failed: 0 })

    const refetch = useCallback(async () => {
        setCounts(await getLedgaAPI().emails.getProcessingCounts())
    }, [])

    useEffect(() => {
        refetch()
    }, [refetch])

    useEffect(() => {
        return getLedgaAPI().emails.onProcessingUpdate(setCounts)
    }, [])

    return counts
}
