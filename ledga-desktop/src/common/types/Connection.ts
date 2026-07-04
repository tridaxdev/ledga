export interface Connection {
    id: string
    email: string
    provider: "gmail"
    auto_sync: boolean
    gmail_watch_expiry: number | null
    created_at: number
    expiry_date: number | null
}
