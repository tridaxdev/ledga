import { randomUUID } from "node:crypto"
import type { DatabaseManager } from "../Database/DatabaseManager"
import type { Logger } from "../logging/FileLogger"
import type { CategoryRepository } from "../categories/CategoryRepository"
import type { TransactionRepository } from "../transactions/TransactionRepository"

export interface RuleRow {
    id: string
    match_keyword: string
    rename_merchant: string | null
    category_name: string | null
    position: number
    created_at: number
}

export interface RuleInsertInput {
    matchKeyword: string
    renameMerchant?: string | null
    categoryName?: string | null
    position?: number
}

export interface ApplyRulesResult {
    merchant: string
    category: string | undefined
}

export class RulesService {
    constructor(
        private readonly db: DatabaseManager,
        private readonly categoryRepository: CategoryRepository,
        private readonly transactionRepository: TransactionRepository,
        private readonly logger: Logger
    ) {}

    // Re-runs every rule against every existing transaction's current merchant text and applies a
    // match's category/rename where it differs. Deliberately non-destructive: a transaction that no
    // rule claims is left untouched rather than reset to uncategorised. There's no record of whether
    // a transaction's current category came from a rule or a manual pick, so unconditionally clearing
    // categories on every no-match row would wipe out manual categorisation on completely unrelated
    // transactions the instant *any* new rule is created (this was caught live: creating one rule
    // reset every other manually-categorised transaction to uncategorised). See deleteAndRevert for
    // the narrower, keyword-scoped reversion used specifically when a rule is deleted.
    applyRulesRetroactively(): { updatedCount: number } {
        const transactions = this.transactionRepository.findAll({})
        let updatedCount = 0

        for (const transaction of transactions) {
            const applied = this.applyRules(transaction.merchant)
            if (applied.category === undefined && applied.merchant === transaction.merchant) continue

            const merchantChanged = applied.merchant !== transaction.merchant
            let categoryChanged = false
            if (applied.category !== undefined) {
                const newCategoryId = this.categoryRepository.findIdByDisplayName(applied.category) ?? null
                categoryChanged = newCategoryId !== transaction.category_id
                if (categoryChanged) this.transactionRepository.updateCategory(transaction.id, newCategoryId)
            }
            if (merchantChanged) this.transactionRepository.updateMerchant(transaction.id, applied.merchant)

            if (merchantChanged || categoryChanged) updatedCount++
        }

        this.logger.info("Retroactively applied rules", { updatedCount, total: transactions.length })
        return { updatedCount }
    }

    // Deletion is the one case that's allowed to remove a category: only for transactions whose
    // merchant still contains the just-deleted rule's keyword (a narrow, targeted set, not every
    // transaction in the ledger), re-run the remaining rules and let the result -- including
    // reverting to uncategorised -- apply. Call this instead of delete() so the revert sees the
    // rule already gone from the rule set.
    deleteAndRevert(id: string): { updatedCount: number } {
        const rule = this.findById(id)
        this.delete(id)
        if (!rule) return { updatedCount: 0 }

        const keywordLower = rule.match_keyword.toLowerCase()
        const candidates = this.transactionRepository.findAll({}).filter(
            t =>
                // Merchant still contains the keyword (the common case), OR the merchant now
                // exactly equals what this rule renamed it to -- a rename can erase the keyword
                // from the merchant text entirely (e.g. "AMZN MKTP" -> "Amazon"), which would
                // otherwise make a rename-only rule's effect permanently un-revertable on delete.
                t.merchant.toLowerCase().includes(keywordLower) || (rule.rename_merchant !== null && t.merchant === rule.rename_merchant)
        )

        let updatedCount = 0
        for (const transaction of candidates) {
            const applied = this.applyRules(transaction.merchant)
            const newCategoryId = applied.category ? (this.categoryRepository.findIdByDisplayName(applied.category) ?? null) : null
            const merchantChanged = applied.merchant !== transaction.merchant
            const categoryChanged = newCategoryId !== transaction.category_id

            if (!merchantChanged && !categoryChanged) continue

            if (merchantChanged) this.transactionRepository.updateMerchant(transaction.id, applied.merchant)
            if (categoryChanged) this.transactionRepository.updateCategory(transaction.id, newCategoryId)
            updatedCount++
        }

        this.logger.info("Reverted transactions after rule deletion", { ruleId: id, updatedCount, candidateCount: candidates.length })
        return { updatedCount }
    }

    findById(id: string): RuleRow | null {
        const rows = this.db.executeQuery("SELECT * FROM rules WHERE id = ? LIMIT 1", [id]) as RuleRow[] | unknown
        const list = Array.isArray(rows) ? rows : []
        return list[0] ?? null
    }

    applyRules(merchantText: string): ApplyRulesResult {
        const rules = this.findAll()
        let merchant = merchantText
        let category: string | undefined
        const lower = merchantText.toLowerCase()

        for (const rule of rules) {
            if (!lower.includes(rule.match_keyword.toLowerCase())) continue

            if (rule.rename_merchant !== null && merchant === merchantText) {
                merchant = rule.rename_merchant
            }
            if (rule.category_name !== null && category === undefined) {
                category = rule.category_name
            }
        }

        return { merchant, category }
    }

    findAll(): RuleRow[] {
        const rows = this.db.executeQuery("SELECT * FROM rules ORDER BY position ASC") as RuleRow[] | unknown
        return Array.isArray(rows) ? rows : []
    }

    insert(input: RuleInsertInput): RuleRow {
        const id = randomUUID()
        this.db.executeQuery(
            `INSERT INTO rules (id, match_keyword, rename_merchant, category_name, position)
             VALUES (?, ?, ?, ?, ?)`,
            [id, input.matchKeyword, input.renameMerchant ?? null, input.categoryName ?? null, input.position ?? 0]
        )
        const rows = this.db.executeQuery("SELECT * FROM rules WHERE id = ? LIMIT 1", [id]) as RuleRow[] | unknown
        const list = Array.isArray(rows) ? rows : []
        this.logger.debug("Rule inserted", { id, matchKeyword: input.matchKeyword })
        return list[0] as RuleRow
    }

    update(id: string, patch: Partial<RuleInsertInput>): void {
        const sets: string[] = []
        const params: unknown[] = []

        if (patch.matchKeyword !== undefined) {
            sets.push("match_keyword = ?")
            params.push(patch.matchKeyword)
        }
        if (patch.renameMerchant !== undefined) {
            sets.push("rename_merchant = ?")
            params.push(patch.renameMerchant)
        }
        if (patch.categoryName !== undefined) {
            sets.push("category_name = ?")
            params.push(patch.categoryName)
        }
        if (patch.position !== undefined) {
            sets.push("position = ?")
            params.push(patch.position)
        }

        if (sets.length === 0) return
        params.push(id)

        this.db.executeQuery(`UPDATE rules SET ${sets.join(", ")} WHERE id = ?`, params)
    }

    delete(id: string): void {
        this.db.executeQuery("DELETE FROM rules WHERE id = ?", [id])
    }
}
