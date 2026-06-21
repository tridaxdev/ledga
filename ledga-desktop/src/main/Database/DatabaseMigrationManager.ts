import type Database from "better-sqlite3"
import type { Logger } from "../logging/FileLogger"
import type { DatabaseBackupService } from "./DatabaseBackupService"

export interface MigrationInfo {
    name: string
    sql: string
}

const PRAGMA_FK_REGEX = /PRAGMA\s+foreign_keys\s*=\s*(ON|OFF)\s*;?/gi

export class DatabaseMigrationManager {
    constructor(
        private readonly logger: Logger,
        private readonly backupService: DatabaseBackupService,
        private readonly migrations: MigrationInfo[]
    ) {}

    async runMigrations(database: Database.Database): Promise<void> {
        database.exec(`
            CREATE TABLE IF NOT EXISTS migrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `)

        for (const migration of this.migrations) {
            if (this.isMigrationApplied(database, migration.name)) continue
            await this.applyMigration(database, migration)
        }

        database.pragma("optimize")
    }

    private isMigrationApplied(database: Database.Database, name: string): boolean {
        return !!database.prepare("SELECT 1 FROM migrations WHERE name = ?").get(name)
    }

    private async applyMigration(database: Database.Database, migration: MigrationInfo): Promise<void> {
        await this.backupService.create(database, `before-${migration.name}`)

        try {
            database.pragma("foreign_keys = OFF")
            database.transaction(() => {
                database.exec(migration.sql.replace(PRAGMA_FK_REGEX, ""))
                database.prepare("INSERT INTO migrations (name) VALUES (?)").run(migration.name)
            })()
        } finally {
            database.pragma("foreign_keys = ON")
        }

        this.verifyIntegrity(database)
        this.logger.info(`Applied migration: ${migration.name}`)
    }

    private verifyIntegrity(database: Database.Database): void {
        if (database.pragma("integrity_check", { simple: true }) !== "ok") {
            throw new Error("Database integrity check failed")
        }

        if (database.pragma("foreign_key_check", { simple: true })) {
            throw new Error("Foreign key violations detected")
        }
    }
}
