import { useState, useEffect, useCallback } from "react"
import { getLedgaAPI } from "./apiClient"
import type { Rule, RuleInput } from "@/common/types/Rule"

export function useRules() {
    const [rules, setRules] = useState<Rule[]>([])
    const [isLoading, setIsLoading] = useState(true)

    const refetch = useCallback(async () => {
        setIsLoading(true)
        const result = await getLedgaAPI().rules.getAll()
        if (result.kind === "success") setRules(result.value)
        setIsLoading(false)
    }, [])

    useEffect(() => {
        refetch()
    }, [refetch])

    const createRule = useCallback(
        async (input: RuleInput) => {
            const result = await getLedgaAPI().rules.create(input)
            if (result.kind === "success") await refetch()
            return result
        },
        [refetch]
    )

    const deleteRule = useCallback(
        async (id: string) => {
            const result = await getLedgaAPI().rules.delete(id)
            if (result.kind === "success") await refetch()
            return result
        },
        [refetch]
    )

    return { rules, isLoading, createRule, deleteRule }
}
