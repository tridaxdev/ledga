import { useState, useEffect } from 'react'
import { getLedgaAPI } from './apiClient'
import type { Category } from '@/common/types/Category'

export function useCategories() {
    const [categories, setCategories] = useState<Category[]>([])

    useEffect(() => {
        getLedgaAPI().categories.getAll().then(result => {
            if (result.kind === 'success') setCategories(result.value)
        })
    }, [])

    return { categories }
}
