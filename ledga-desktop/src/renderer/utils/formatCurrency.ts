export function formatCurrency(amount: number, currency: string): string {
    const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Math.abs(amount))
    return formatted
}

export function formatSignedAmount(amount: number, type: 'credit' | 'debit', currency: string): string {
    const prefix = type === 'credit' ? '+' : '−'
    return `${prefix}${formatCurrency(amount, currency)}`
}

// Renders in UTC to match how date-range bounds are computed (see dateRangeToBounds) --
// otherwise a transaction near a month boundary can display a date outside the selected range.
export function formatDate(unixSeconds: number): string {
    return new Date(unixSeconds * 1000).toLocaleDateString('en-US', { month: 'short', day: '2-digit', timeZone: 'UTC' })
}
