export interface Rule {
    id: string
    match_keyword: string
    rename_merchant: string | null
    category_name: string | null
    position: number
    created_at: number
}

export interface RuleInput {
    matchKeyword: string
    renameMerchant?: string | null
    categoryName?: string | null
    position?: number
}
