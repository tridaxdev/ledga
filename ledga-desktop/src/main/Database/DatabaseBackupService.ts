import fs from "fs"
import path from "path"
import type Database from "better-sqlite3"
import type { BackupInfo } from "./types/backup"

const BACKUP_DIRNAME = "db-backups"
const BACKUP_PREFIX = "backup."
const BACKUP_EXT = ".db"

export class DatabaseBackupService {
    private readonly backupDir: string

    constructor(userDataPath: string) {
        this.backupDir = path.join(userDataPath, BACKUP_DIRNAME)
    }

    async create(db: Database.Database, reason: string): Promise<void> {
        fs.mkdirSync(this.backupDir, { recursive: true })

        const targetPath = path.join(this.backupDir, `${BACKUP_PREFIX}${reason}${BACKUP_EXT}`)

        // If no existing backup, write directly to the target path.
        // If one exists, write to an indexed file to avoid overwriting a potentially
        // locked file. Old backups are cleaned up after a successful write.
        if (!fs.existsSync(targetPath)) {
            await db.backup(targetPath)
            return
        }

        const nextIndex = this.getNextBackupIndex(reason)
        const backupPath = path.join(this.backupDir, `${BACKUP_PREFIX}${reason}.${nextIndex}${BACKUP_EXT}`)
        await db.backup(backupPath)

        if (!fs.existsSync(backupPath) || fs.statSync(backupPath).size === 0) {
            throw new Error(`Backup failed: file not created at ${backupPath}`)
        }
    }

    private getNextBackupIndex(reason: string): number {
        if (!fs.existsSync(this.backupDir)) return 1

        const prefix = `${BACKUP_PREFIX}${reason}.`
        const indices = fs
            .readdirSync(this.backupDir)
            .filter(f => f.startsWith(prefix) && f.endsWith(BACKUP_EXT))
            .map(f => parseInt(f.slice(prefix.length, -BACKUP_EXT.length)))
            .filter(n => !isNaN(n))

        return indices.length === 0 ? 1 : Math.max(...indices) + 1
    }

    getLatest(): BackupInfo | null {
        if (!fs.existsSync(this.backupDir)) return null

        const files = fs.readdirSync(this.backupDir).filter(f => f.endsWith(BACKUP_EXT))
        if (files.length === 0) return null

        const backups = files.map(name => {
            const filePath = path.join(this.backupDir, name)
            const stats = fs.statSync(filePath)
            return { path: filePath, name, createdAt: stats.mtime, sizeBytes: stats.size }
        })

        return backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
    }

    async restore(backup: BackupInfo, targetPath: string): Promise<void> {
        await fs.promises.copyFile(backup.path, targetPath)
    }
}
