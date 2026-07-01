import { randomUUID } from "node:crypto"
import type { DatabaseManager } from "../Database/DatabaseManager"
import type { Logger } from "../logging/FileLogger"

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
        private readonly logger: Logger
    ) {}

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
        const rows = this.db.executeQuery(
            "SELECT * FROM rules ORDER BY position ASC"
        ) as RuleRow[] | unknown
        return Array.isArray(rows) ? rows : []
    }

    insert(input: RuleInsertInput): RuleRow {
        const id = randomUUID()
        this.db.executeQuery(
            `INSERT INTO rules (id, match_keyword, rename_merchant, category_name, position)
             VALUES (?, ?, ?, ?, ?)`,
            [
                id,
                input.matchKeyword,
                input.renameMerchant ?? null,
                input.categoryName ?? null,
                input.position ?? 0
            ]
        )
        const rows = this.db.executeQuery(
            "SELECT * FROM rules WHERE id = ? LIMIT 1",
            [id]
        ) as RuleRow[] | unknown
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

        this.db.executeQuery(
            `UPDATE rules SET ${sets.join(", ")} WHERE id = ?`,
            params
        )
    }

    delete(id: string): void {
        this.db.executeQuery("DELETE FROM rules WHERE id = ?", [id])
    }
}
