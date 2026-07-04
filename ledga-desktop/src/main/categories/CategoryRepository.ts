import { randomUUID } from "node:crypto"
import type { DatabaseManager } from "../Database/DatabaseManager"
import type { Logger } from "../logging/FileLogger"

export interface CategoryRow {
    id: string
    name: string
    color: string
    created_at: number
}

export class CategoryRepository {
    constructor(
        private readonly db: DatabaseManager,
        private readonly logger: Logger
    ) {}

    findAll(): CategoryRow[] {
        const rows = this.db.executeQuery("SELECT * FROM categories ORDER BY name ASC") as CategoryRow[] | unknown
        return Array.isArray(rows) ? rows : []
    }

    findById(id: string): CategoryRow | null {
        const rows = this.db.executeQuery("SELECT * FROM categories WHERE id = ? LIMIT 1", [id]) as CategoryRow[] | unknown
        const list = Array.isArray(rows) ? rows : []
        return list[0] ?? null
    }

    findIdByDisplayName(name: string): string | null {
        const rows = this.db.executeQuery("SELECT id FROM categories WHERE LOWER(name) = LOWER(?) LIMIT 1", [name]) as unknown
        const list = Array.isArray(rows) ? rows : []
        const row = list[0] as { id: string } | undefined
        return row?.id ?? null
    }

    insert(name: string, color: string): CategoryRow {
        const id = randomUUID()
        this.db.executeQuery("INSERT INTO categories (id, name, color) VALUES (?, ?, ?)", [id, name, color])
        const rows = this.db.executeQuery("SELECT * FROM categories WHERE id = ? LIMIT 1", [id]) as CategoryRow[] | unknown
        const list = Array.isArray(rows) ? rows : []
        this.logger.debug("Category inserted", { id, name })
        return list[0] as CategoryRow
    }

    update(id: string, patch: { name?: string; color?: string }): void {
        const sets: string[] = []
        const params: unknown[] = []

        if (patch.name !== undefined) {
            sets.push("name = ?")
            params.push(patch.name)
        }
        if (patch.color !== undefined) {
            sets.push("color = ?")
            params.push(patch.color)
        }

        if (sets.length === 0) return
        params.push(id)

        this.db.executeQuery(`UPDATE categories SET ${sets.join(", ")} WHERE id = ?`, params)
    }

    delete(id: string): void {
        this.db.executeQuery("DELETE FROM categories WHERE id = ?", [id])
    }
}
