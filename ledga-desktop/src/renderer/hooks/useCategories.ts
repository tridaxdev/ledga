import { useState, useEffect, useCallback } from "react"
import { getLedgaAPI } from "./apiClient"
import type { Category, CategoryInput } from "@/common/types/Category"

export function useCategories() {
    const [categories, setCategories] = useState<Category[]>([])
    const [isLoading, setIsLoading] = useState(true)

    const refetch = useCallback(async () => {
        setIsLoading(true)
        const result = await getLedgaAPI().categories.getAll()
        if (result.kind === "success") setCategories(result.value)
        setIsLoading(false)
    }, [])

    useEffect(() => {
        refetch()
    }, [refetch])

    const createCategory = useCallback(
        async (input: CategoryInput) => {
            const result = await getLedgaAPI().categories.create(input)
            if (result.kind === "success") await refetch()
            return result
        },
        [refetch]
    )

    const updateCategory = useCallback(
        async (id: string, patch: Partial<CategoryInput>) => {
            const result = await getLedgaAPI().categories.update(id, patch)
            if (result.kind === "success") await refetch()
            return result
        },
        [refetch]
    )

    const deleteCategory = useCallback(
        async (id: string) => {
            const result = await getLedgaAPI().categories.delete(id)
            if (result.kind === "success") await refetch()
            return result
        },
        [refetch]
    )

    return { categories, isLoading, refetch, createCategory, updateCategory, deleteCategory }
}
