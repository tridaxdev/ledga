import { randomUUID } from "node:crypto"
import type { DatabaseManager } from "../Database/DatabaseManager"
import type { Connection } from "@/common/types/Connection"

interface ConnectionRow {
    id: string
    email: string
    provider: string
    auto_sync: number
    gmail_watch_expiry: number | null
    created_at: number
    expiry_date: number | null
}

function rowToConnection(row: ConnectionRow): Connection {
    return {
        id: row.id,
        email: row.email,
        provider: "gmail",
        auto_sync: row.auto_sync === 1,
        gmail_watch_expiry: row.gmail_watch_expiry,
        created_at: row.created_at,
        expiry_date: row.expiry_date
    }
}

export class ConnectionRepository {
    constructor(private readonly db: DatabaseManager) {}

    findAll(): Connection[] {
        const rows = this.db.executeQuery("SELECT * FROM connections ORDER BY created_at DESC") as ConnectionRow[]
        return rows.map(rowToConnection)
    }

    findById(id: string): Connection | null {
        const rows = this.db.executeQuery("SELECT * FROM connections WHERE id = ?", [id]) as ConnectionRow[]
        return rows.length > 0 ? rowToConnection(rows[0]) : null
    }

    insert(email: string): Connection {
        const id = randomUUID()
        const now = Math.floor(Date.now() / 1000)
        this.db.executeQuery("INSERT INTO connections (id, email, created_at) VALUES (?, ?, ?)", [id, email, now])
        return {
            id,
            email,
            provider: "gmail",
            auto_sync: true,
            gmail_watch_expiry: null,
            created_at: now,
            expiry_date: null
        }
    }

    update(id: string, patch: Partial<Pick<Connection, "auto_sync" | "gmail_watch_expiry" | "expiry_date">>): void {
        const setClauses: string[] = []
        const values: unknown[] = []

        if (patch.auto_sync !== undefined) {
            setClauses.push("auto_sync = ?")
            values.push(patch.auto_sync ? 1 : 0)
        }
        if ("gmail_watch_expiry" in patch) {
            setClauses.push("gmail_watch_expiry = ?")
            values.push(patch.gmail_watch_expiry ?? null)
        }
        if ("expiry_date" in patch) {
            setClauses.push("expiry_date = ?")
            values.push(patch.expiry_date ?? null)
        }

        if (setClauses.length === 0) return

        values.push(id)
        this.db.executeQuery(`UPDATE connections SET ${setClauses.join(", ")} WHERE id = ?`, values)
    }

    delete(id: string): void {
        this.db.executeQuery("DELETE FROM connections WHERE id = ?", [id])
    }
}
