export interface AnalyticsQueryParams {
    from: number
    to: number
    currency: string
}

export interface MonthlyTotal {
    month: string
    income: number
    expense: number
}

export interface CategoryTotal {
    categoryId: string | null
    name: string
    color: string
    total: number
}

export interface CurrencyCount {
    currency: string
    count: number
}

export interface NetWorthPoint {
    timestamp: number
    balance: number
}
