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
