import Database from "better-sqlite3"

export class WorkerDatabaseManager {
    private db: Database.Database | null = null

    constructor(private readonly dbPath: string) {}

    private ensureDb(): Database.Database {
        if (!this.db) {
            this.db = new Database(this.dbPath, { readonly: true })
            this.db.pragma("journal_mode = WAL")
            this.db.pragma("cache_size = 10000")
            this.db.pragma("temp_store = MEMORY")
        }
        return this.db
    }

    executeQuery(sql: string, params: unknown[] = []): unknown[] {
        const db = this.ensureDb()
        return db.prepare(sql).all(...params)
    }

    getDatabase(): Database.Database {
        return this.ensureDb()
    }

    close(): void {
        this.db?.close()
        this.db = null
    }
}
