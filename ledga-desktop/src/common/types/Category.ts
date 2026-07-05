export interface Category {
    id: string
    name: string
    color: string
    created_at: number
}

export interface CategoryInput {
    name: string
    color: string
}

// Hardcoded elsewhere (setupIpcHandlersForTransactions.ts uses it as the suggested fallback
// category for flagged transactions), so the manage-categories UI blocks renaming/deleting it.
export const PROTECTED_CATEGORY_NAME = "Other"
