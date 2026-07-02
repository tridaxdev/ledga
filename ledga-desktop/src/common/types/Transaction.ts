export interface NormalizedTransaction {
    type: "credit" | "debit"
    account_number: string
    merchant: string
    merchant_account: string | null
    bank: string
    bank_reference: string
    timestamp: string
    available_balance: number
    amount: number
    currency: string
}

export interface Transaction {
    id: string
    email_id: string | null
    source: "gmail" | "csv"
    type: "credit" | "debit"
    account_number: string
    merchant: string
    merchant_account: string | null
    bank: string
    bank_reference: string
    timestamp: number
    available_balance: number
    amount: number
    currency: string
    category_id: string | null
    needs_review: boolean
    created_at: number
}

export interface TransactionSummary {
    balance: number
    moneyIn: number
    moneyOut: number
    incomeCount: number
    expenseCount: number
}

export interface TransactionQueryParams {
    from?: number
    to?: number
    categoryId?: string
    search?: string
    limit?: number
    offset?: number
}
