import fs from "fs"
import path from "path"
import { dialog } from "electron"
import Database from "better-sqlite3"
import type { Logger } from "../logging/FileLogger"
import type { DatabaseBackupService } from "./DatabaseBackupService"

export class DatabaseLoader {
    static DATABASE_FILENAME = "pylehound-v2.db"

    static databasePath(userDataPath: string): string {
        return path.join(userDataPath, DatabaseLoader.DATABASE_FILENAME)
    }

    constructor(
        private readonly logger: Logger,
        private readonly backupService: DatabaseBackupService
    ) {}

    async load(userDataPath: string): Promise<Database.Database> {
        const dbPath = DatabaseLoader.databasePath(userDataPath)

        try {
            const database = new Database(dbPath)
            await this.backupService.create(database, "pylehound-v2")
            return database
        } catch (error) {
            this.logger.error("Database load failed, attempting recovery", error)
            return this.recover(dbPath)
        }
    }

    private async recover(dbPath: string): Promise<Database.Database> {
        if (this.tryWalCheckpoint(dbPath)) {
            this.logger.info("Recovery: WAL checkpoint successful")
            return new Database(dbPath)
        }

        if (await this.tryBackupRestore(dbPath)) {
            this.logger.info("Recovery: Restored from backup")
            return new Database(dbPath)
        }

        if (await this.tryFreshDatabase(dbPath)) {
            this.logger.info("Recovery: Created fresh database")
            return new Database(dbPath)
        }

        throw new Error("Database recovery failed: all recovery options exhausted")
    }

    private tryWalCheckpoint(dbPath: string): boolean {
        const walPath = `${dbPath}-wal`
        if (!fs.existsSync(walPath)) return false

        try {
            const tempDb = new Database(dbPath)
            tempDb.pragma("wal_checkpoint(TRUNCATE)")
            tempDb.close()
            return true
        } catch {
            return false
        }
    }

    private async tryBackupRestore(dbPath: string): Promise<boolean> {
        const backup = this.backupService.getLatest()
        if (!backup) return false

        const proceed = await this.promptUserForBackupRestore(backup.createdAt)
        if (!proceed) return false

        try {
            this.archiveCorruptedFiles(dbPath)
            await this.backupService.restore(backup, dbPath)

            const testDb = new Database(dbPath, { readonly: true })
            const ok = testDb.pragma("integrity_check", { simple: true }) === "ok"
            testDb.close()

            if (!ok) {
                this.archiveCorruptedFiles(dbPath)
            }
            return ok
        } catch {
            return false
        }
    }

    private async tryFreshDatabase(dbPath: string): Promise<boolean> {
        const proceed = await this.promptUserForFreshDatabase()
        if (!proceed) return false

        this.archiveCorruptedFiles(dbPath)
        return true
    }

    private archiveCorruptedFiles(dbPath: string): void {
        const archivePath = `${dbPath}.corrupted.${Date.now()}`

        if (fs.existsSync(dbPath)) {
            fs.renameSync(dbPath, archivePath)
        }
        for (const ext of ["-wal", "-shm"]) {
            const p = `${dbPath}${ext}`
            if (fs.existsSync(p)) fs.renameSync(p, `${archivePath}${ext}`)
        }
    }

    private async promptUserForBackupRestore(backupDate: Date): Promise<boolean> {
        const result = await dialog.showMessageBox({
            type: "warning",
            title: "Database Corrupted",
            message: "Your database is corrupted and cannot be opened.",
            detail: `A backup from ${backupDate.toLocaleString()} is available. Any changes made after this backup will be lost. The corrupted db file will be preserved.`,
            buttons: ["Restore from Backup", "Cancel"],
            defaultId: 0,
            cancelId: 1
        })
        return result.response === 0
    }

    private async promptUserForFreshDatabase(): Promise<boolean> {
        const result = await dialog.showMessageBox({
            type: "warning",
            title: "Database Unrecoverable",
            message: "Create fresh database?",
            detail: "All data will be lost. Corrupted file preserved.",
            buttons: ["Proceed", "Cancel"],
            defaultId: 0,
            cancelId: 1
        })
        return result.response === 0
    }
}
