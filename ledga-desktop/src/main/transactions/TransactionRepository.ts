import { randomUUID } from "node:crypto"
import type { DatabaseManager } from "../Database/DatabaseManager"
import type { Logger } from "../logging/FileLogger"

export interface TransactionRow {
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
    needs_review: number
    created_at: number
}

export interface TransactionInsertInput {
    emailId?: string | null
    source?: "gmail" | "csv"
    type: "credit" | "debit"
    account_number: string
    merchant: string
    merchant_account?: string | null
    bank: string
    bank_reference: string
    timestamp: number
    available_balance: number
    amount: number
    currency: string
    categoryId?: string | null
    needsReview?: boolean
}

export class TransactionRepository {
    constructor(
        private readonly db: DatabaseManager,
        private readonly logger: Logger
    ) {}

    insert(input: TransactionInsertInput): TransactionRow {
        const id = randomUUID()
        const needsReview =
            input.needsReview !== undefined
                ? input.needsReview ? 1 : 0
                : input.merchant.trim() === "" || input.amount === 0 ? 1 : 0

        this.db.executeQuery(
            `INSERT INTO transactions
                (id, email_id, source, type, account_number, merchant, merchant_account,
                 bank, bank_reference, timestamp, available_balance, amount, currency,
                 category_id, needs_review)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                input.emailId ?? null,
                input.source ?? "gmail",
                input.type,
                input.account_number,
                input.merchant,
                input.merchant_account ?? null,
                input.bank,
                input.bank_reference,
                input.timestamp,
                input.available_balance,
                input.amount,
                input.currency,
                input.categoryId ?? null,
                needsReview
            ]
        )

        const rows = this.db.executeQuery(
            "SELECT * FROM transactions WHERE id = ?",
            [id]
        ) as TransactionRow[] | unknown
        const list = Array.isArray(rows) ? rows : []
        this.logger.debug("Transaction inserted", { id })
        return list[0] as TransactionRow
    }

    findByEmailId(emailId: string): TransactionRow | null {
        const rows = this.db.executeQuery(
            "SELECT * FROM transactions WHERE email_id = ? LIMIT 1",
            [emailId]
        ) as TransactionRow[] | unknown
        const list = Array.isArray(rows) ? rows : []
        return list[0] ?? null
    }

    findAll(opts?: {
        categoryId?: string
        search?: string
        limit?: number
        offset?: number
        from?: number
        to?: number
    }): TransactionRow[] {
        const { where, params } = this.buildFilter(opts)
        const limitClause = opts?.limit !== undefined ? `LIMIT ${opts.limit}` : ""
        const offsetClause = opts?.offset !== undefined ? `OFFSET ${opts.offset}` : ""

        const sql = `SELECT * FROM transactions ${where} ORDER BY timestamp DESC ${limitClause} ${offsetClause}`.trimEnd()
        const rows = this.db.executeQuery(sql, params) as TransactionRow[] | unknown
        return Array.isArray(rows) ? rows : []
    }

    private buildFilter(opts?: {
        categoryId?: string
        search?: string
        from?: number
        to?: number
    }): { where: string; params: unknown[] } {
        const conditions: string[] = []
        const params: unknown[] = []

        if (opts?.categoryId !== undefined) {
            conditions.push("category_id = ?")
            params.push(opts.categoryId)
        }
        if (opts?.from !== undefined) {
            conditions.push("timestamp >= ?")
            params.push(opts.from)
        }
        if (opts?.to !== undefined) {
            conditions.push("timestamp <= ?")
            params.push(opts.to)
        }
        if (opts?.search?.trim()) {
            conditions.push("merchant LIKE ? ESCAPE '\\'")
            const escaped = opts.search.trim().replace(/[\\%_]/g, ch => `\\${ch}`)
            params.push(`%${escaped}%`)
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
        return { where, params }
    }

    // Money in/out are scoped to the selected date range only -- deliberately NOT to search/category,
    // so the stat cards don't silently shift when the user types into the search box. Balance is the
    // running total across all transactions ever recorded (not just the period), matching how a ledger
    // balance behaves. Takes its own {from, to}-only options (rather than the shared buildFilter) so a
    // caller can't accidentally widen this to search/category by passing the full query params through.
    getSummaryForPeriod(opts?: { from?: number; to?: number }): {
        balance: number
        moneyIn: number
        moneyOut: number
        incomeCount: number
        expenseCount: number
    } {
        const { where, params } = this.buildFilter({ from: opts?.from, to: opts?.to })
        const sql = `SELECT
                COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) AS moneyIn,
                COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0) AS moneyOut,
                COALESCE(SUM(CASE WHEN type = 'credit' THEN 1 ELSE 0 END), 0) AS incomeCount,
                COALESCE(SUM(CASE WHEN type = 'debit' THEN 1 ELSE 0 END), 0) AS expenseCount
             FROM transactions ${where}`.trimEnd()
        const rows = this.db.executeQuery(sql, params) as unknown
        const list = Array.isArray(rows) ? rows : []
        const row = list[0] as { moneyIn: number; moneyOut: number; incomeCount: number; expenseCount: number } | undefined
        return {
            balance: this.getOverallBalance(),
            moneyIn: row?.moneyIn ?? 0,
            moneyOut: row?.moneyOut ?? 0,
            incomeCount: row?.incomeCount ?? 0,
            expenseCount: row?.expenseCount ?? 0
        }
    }

    private getOverallBalance(): number {
        const rows = this.db.executeQuery(
            `SELECT COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END), 0) AS balance
             FROM transactions`
        ) as unknown
        const list = Array.isArray(rows) ? rows : []
        const row = list[0] as { balance: number } | undefined
        return row?.balance ?? 0
    }

    findById(id: string): TransactionRow | null {
        const rows = this.db.executeQuery(
            "SELECT * FROM transactions WHERE id = ?",
            [id]
        ) as TransactionRow[] | unknown
        const list = Array.isArray(rows) ? rows : []
        return list[0] ?? null
    }

    updateMerchant(id: string, merchant: string): void {
        this.db.executeQuery(
            "UPDATE transactions SET merchant = ? WHERE id = ?",
            [merchant, id]
        )
    }

    findNeedingReview(): TransactionRow[] {
        const rows = this.db.executeQuery(
            "SELECT * FROM transactions WHERE needs_review = 1 ORDER BY timestamp DESC"
        ) as TransactionRow[] | unknown
        return Array.isArray(rows) ? rows : []
    }

    updateCategory(id: string, categoryId: string | null): void {
        this.db.executeQuery(
            "UPDATE transactions SET category_id = ? WHERE id = ?",
            [categoryId, id]
        )
    }

    delete(id: string): void {
        this.db.executeQuery("DELETE FROM transactions WHERE id = ?", [id])
    }
}
