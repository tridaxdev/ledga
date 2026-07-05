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
        const needsReview = input.needsReview !== undefined ? (input.needsReview ? 1 : 0) : input.merchant.trim() === "" || input.amount === 0 ? 1 : 0

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

        const rows = this.db.executeQuery("SELECT * FROM transactions WHERE id = ?", [id]) as TransactionRow[] | unknown
        const list = Array.isArray(rows) ? rows : []
        this.logger.debug("Transaction inserted", { id })
        return list[0] as TransactionRow
    }

    findByEmailId(emailId: string): TransactionRow | null {
        const rows = this.db.executeQuery("SELECT * FROM transactions WHERE email_id = ? LIMIT 1", [emailId]) as TransactionRow[] | unknown
        const list = Array.isArray(rows) ? rows : []
        return list[0] ?? null
    }

    findAll(opts?: { categoryId?: string; search?: string; accountNumber?: string; limit?: number; offset?: number; from?: number; to?: number }): TransactionRow[] {
        const { where, params } = this.buildFilter(opts)
        const limitClause = opts?.limit !== undefined ? `LIMIT ${opts.limit}` : ""
        const offsetClause = opts?.offset !== undefined ? `OFFSET ${opts.offset}` : ""

        const sql = `SELECT * FROM transactions ${where} ORDER BY timestamp DESC ${limitClause} ${offsetClause}`.trimEnd()
        const rows = this.db.executeQuery(sql, params) as TransactionRow[] | unknown
        return Array.isArray(rows) ? rows : []
    }

    listAccounts(): { bank: string; account_number: string }[] {
        const rows = this.db.executeQuery("SELECT DISTINCT bank, account_number FROM transactions ORDER BY bank, account_number") as { bank: string; account_number: string }[] | unknown
        return Array.isArray(rows) ? rows : []
    }

    countAll(opts?: { categoryId?: string; search?: string; accountNumber?: string; from?: number; to?: number }): number {
        const { where, params } = this.buildFilter(opts)
        const rows = this.db.executeQuery(`SELECT COUNT(*) AS count FROM transactions ${where}`.trimEnd(), params) as unknown
        const list = Array.isArray(rows) ? rows : []
        return (list[0] as { count: number } | undefined)?.count ?? 0
    }

    // Scoped to the same filters as the visible page (date range/search/account) so the "N need a
    // look" banner reflects the whole filtered range, not just whichever 25-row page happens to be
    // on screen. firstCategoryId picks the most recent flagged transaction that already has a
    // category assigned, matching the "jump to that category's review page" button's needs.
    getFlaggedSummary(opts?: { search?: string; accountNumber?: string; from?: number; to?: number }): { count: number; firstCategoryId: string | null } {
        const { where, params } = this.buildFilter(opts)
        const flaggedWhere = where ? `${where} AND needs_review = 1` : "WHERE needs_review = 1"

        const countRows = this.db.executeQuery(`SELECT COUNT(*) AS count FROM transactions ${flaggedWhere}`, params) as unknown
        const countList = Array.isArray(countRows) ? countRows : []
        const count = (countList[0] as { count: number } | undefined)?.count ?? 0

        const firstRows = this.db.executeQuery(`SELECT category_id FROM transactions ${flaggedWhere} AND category_id IS NOT NULL ORDER BY timestamp DESC LIMIT 1`, params) as unknown
        const firstList = Array.isArray(firstRows) ? firstRows : []
        const firstCategoryId = (firstList[0] as { category_id: string | null } | undefined)?.category_id ?? null

        return { count, firstCategoryId }
    }

    private buildFilter(opts?: { categoryId?: string; search?: string; accountNumber?: string; from?: number; to?: number }): { where: string; params: unknown[] } {
        const conditions: string[] = []
        const params: unknown[] = []

        if (opts?.categoryId !== undefined) {
            conditions.push("category_id = ?")
            params.push(opts.categoryId)
        }
        if (opts?.accountNumber !== undefined) {
            conditions.push("account_number = ?")
            params.push(opts.accountNumber)
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

    // Money in/out are scoped to the selected date range (and account, if one is picked) --
    // deliberately NOT to search/category, so the stat cards don't silently shift when the user
    // types into the search box. Balance is the running total across all transactions ever recorded
    // (not just the period), matching how a ledger balance behaves, but IS scoped to the selected
    // account since switching accounts is a real change of ledger, not a transient search state.
    getSummaryForPeriod(opts?: { from?: number; to?: number; accountNumber?: string }): {
        balance: number
        moneyIn: number
        moneyOut: number
        incomeCount: number
        expenseCount: number
    } {
        const { where, params } = this.buildFilter({ from: opts?.from, to: opts?.to, accountNumber: opts?.accountNumber })
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
            balance: this.getOverallBalance(opts?.accountNumber),
            moneyIn: row?.moneyIn ?? 0,
            moneyOut: row?.moneyOut ?? 0,
            incomeCount: row?.incomeCount ?? 0,
            expenseCount: row?.expenseCount ?? 0
        }
    }

    private getOverallBalance(accountNumber?: string): number {
        const { where, params } = this.buildFilter({ accountNumber })
        const rows = this.db.executeQuery(
            `SELECT COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END), 0) AS balance
             FROM transactions ${where}`.trimEnd(),
            params
        ) as unknown
        const list = Array.isArray(rows) ? rows : []
        const row = list[0] as { balance: number } | undefined
        return row?.balance ?? 0
    }

    findById(id: string): TransactionRow | null {
        const rows = this.db.executeQuery("SELECT * FROM transactions WHERE id = ?", [id]) as TransactionRow[] | unknown
        const list = Array.isArray(rows) ? rows : []
        return list[0] ?? null
    }

    existsByBankReference(bankReference: string): boolean {
        const rows = this.db.executeQuery("SELECT 1 FROM transactions WHERE bank_reference = ? LIMIT 1", [bankReference]) as unknown
        return Array.isArray(rows) && rows.length > 0
    }

    updateMerchant(id: string, merchant: string): void {
        this.db.executeQuery("UPDATE transactions SET merchant = ? WHERE id = ?", [merchant, id])
    }

    findNeedingReview(): TransactionRow[] {
        const rows = this.db.executeQuery("SELECT * FROM transactions WHERE needs_review = 1 ORDER BY timestamp DESC") as TransactionRow[] | unknown
        return Array.isArray(rows) ? rows : []
    }

    findFlaggedByCategory(categoryId: string): TransactionRow[] {
        const rows = this.db.executeQuery("SELECT * FROM transactions WHERE needs_review = 1 AND category_id = ? ORDER BY timestamp DESC", [categoryId]) as TransactionRow[] | unknown
        return Array.isArray(rows) ? rows : []
    }

    // total/count are scoped to the given period; priorMonthTotal is the same category's total for
    // the calendar month immediately before `from`, used to render the "vs last month" trend card.
    aggregateByCategory(
        categoryId: string,
        opts?: { from?: number; to?: number }
    ): {
        total: number
        count: number
        priorMonthTotal: number
    } {
        const { where, params } = this.buildFilter({ categoryId, from: opts?.from, to: opts?.to })
        const sql = `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM transactions ${where}`.trimEnd()
        const rows = this.db.executeQuery(sql, params) as unknown
        const list = Array.isArray(rows) ? rows : []
        const row = list[0] as { total: number; count: number } | undefined

        let priorMonthTotal = 0
        if (opts?.from !== undefined) {
            const fromDate = new Date(opts.from * 1000)
            const priorFrom = Math.floor(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth() - 1, 1) / 1000)
            const priorTo = Math.floor(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1) / 1000) - 1
            const priorFilter = this.buildFilter({ categoryId, from: priorFrom, to: priorTo })
            const priorRows = this.db.executeQuery(`SELECT COALESCE(SUM(amount), 0) AS total FROM transactions ${priorFilter.where}`.trimEnd(), priorFilter.params) as unknown
            const priorList = Array.isArray(priorRows) ? priorRows : []
            priorMonthTotal = (priorList[0] as { total: number } | undefined)?.total ?? 0
        }

        return { total: row?.total ?? 0, count: row?.count ?? 0, priorMonthTotal }
    }

    // clearNeedsReview is true when a human picked the category (the "Move to" dropdown / a Move
    // action on a flagged row) -- that counts as reviewing it. It stays false for rule-driven
    // updates (RulesService.applyRulesRetroactively calls this directly, in-process, not through
    // the IPC handler) so an automatic recategorisation never silently dismisses a real flag.
    updateCategory(id: string, categoryId: string | null, clearNeedsReview = false): void {
        if (clearNeedsReview) {
            this.db.executeQuery("UPDATE transactions SET category_id = ?, needs_review = 0 WHERE id = ?", [categoryId, id])
        } else {
            this.db.executeQuery("UPDATE transactions SET category_id = ? WHERE id = ?", [categoryId, id])
        }
    }

    markReviewed(id: string): void {
        this.db.executeQuery("UPDATE transactions SET needs_review = 0 WHERE id = ?", [id])
    }

    delete(id: string): void {
        this.db.executeQuery("DELETE FROM transactions WHERE id = ?", [id])
    }

    // Grouped by calendar month for the Analytics page's trend/cash-flow charts. Scoped to a single
    // currency since amounts aren't normalized across currencies anywhere in this app.
    getMonthlyTotals(opts: { from: number; to: number; currency: string }): { month: string; income: number; expense: number }[] {
        const sql = `SELECT
                strftime('%Y-%m', datetime(timestamp, 'unixepoch')) AS month,
                COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) AS income,
                COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0) AS expense
             FROM transactions
             WHERE currency = ? AND timestamp >= ? AND timestamp <= ?
             GROUP BY month
             ORDER BY month ASC`
        const rows = this.db.executeQuery(sql, [opts.currency, opts.from, opts.to]) as unknown
        return Array.isArray(rows) ? (rows as { month: string; income: number; expense: number }[]) : []
    }

    // Spend-only (debit) totals per category for the period, feeding the Analytics page's category
    // breakdown. Category name/color are joined in the IPC handler, which already has the small
    // categories table loaded, rather than joining here.
    getCategoryExpenseTotals(opts: { from: number; to: number; currency: string }): { categoryId: string | null; total: number }[] {
        const sql = `SELECT category_id AS categoryId, COALESCE(SUM(amount), 0) AS total
             FROM transactions
             WHERE currency = ? AND timestamp >= ? AND timestamp <= ? AND type = 'debit'
             GROUP BY category_id
             ORDER BY total DESC`
        const rows = this.db.executeQuery(sql, [opts.currency, opts.from, opts.to]) as unknown
        return Array.isArray(rows) ? (rows as { categoryId: string | null; total: number }[]) : []
    }

    // Running balance per transaction (chronological) for the Analytics page's net-worth chart.
    // startingBalance carries forward everything before `from` so the line reflects true net worth,
    // not a cumulative sum that resets to zero at the start of the selected range.
    getNetWorthHistory(opts: { from: number; to: number; currency: string }): { timestamp: number; balance: number }[] {
        const startingBalanceRows = this.db.executeQuery(
            `SELECT COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END), 0) AS balance
             FROM transactions WHERE currency = ? AND timestamp < ?`,
            [opts.currency, opts.from]
        ) as unknown
        const startingBalanceList = Array.isArray(startingBalanceRows) ? startingBalanceRows : []
        const startingBalance = (startingBalanceList[0] as { balance: number } | undefined)?.balance ?? 0

        const rows = this.db.executeQuery(
            `SELECT timestamp, type, amount FROM transactions
             WHERE currency = ? AND timestamp >= ? AND timestamp <= ?
             ORDER BY timestamp ASC`,
            [opts.currency, opts.from, opts.to]
        ) as unknown
        const list = Array.isArray(rows) ? (rows as { timestamp: number; type: "credit" | "debit"; amount: number }[]) : []

        let running = startingBalance
        return list.map(row => {
            running += row.type === "credit" ? row.amount : -row.amount
            return { timestamp: row.timestamp, balance: running }
        })
    }

    // Distinct currencies present in the ledger, ordered by frequency so the Analytics page can
    // default its currency selector to whichever currency the user actually transacts in most.
    listCurrencies(): { currency: string; count: number }[] {
        const rows = this.db.executeQuery("SELECT currency, COUNT(*) AS count FROM transactions GROUP BY currency ORDER BY count DESC") as unknown
        return Array.isArray(rows) ? (rows as { currency: string; count: number }[]) : []
    }
}
