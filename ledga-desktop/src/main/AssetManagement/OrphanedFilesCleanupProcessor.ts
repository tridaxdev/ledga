import * as fs from "fs/promises"
import * as path from "path"
import type { WorkerLogger } from "../logging/WorkerLogger"
import type { WorkerDatabaseManager } from "../Database/WorkerDatabaseManager"
import type { CleanupOrphanedFilesResult } from "../../common/types/FileProcessingTypes"

export class OrphanedFilesCleanupProcessor {
    constructor(
        private readonly logger: WorkerLogger,
        private readonly workerDb: WorkerDatabaseManager,
        private readonly appStorageDir: string
    ) {}

    async process(): Promise<CleanupOrphanedFilesResult> {
        const rows = this.workerDb.executeQuery("SELECT backup_filename FROM file WHERE backup_filename IS NOT NULL", []) as Array<{ backup_filename: string }>
        const knownFilenames = new Set(rows.map(row => row.backup_filename))
        const storageFiles = await fs.readdir(this.appStorageDir)

        let removedCount = 0
        let failedCount = 0

        for (const fileName of storageFiles) {
            if (knownFilenames.has(fileName)) {
                continue
            }
            const filePath = path.join(this.appStorageDir, fileName)
            try {
                const stat = await fs.stat(filePath)
                if (stat.isDirectory()) {
                    continue
                }
                // Re-check just before unlink: an import that started after our snapshot
                // may have written the file to disk and updated its row in the meantime.
                const recheck = this.workerDb.executeQuery("SELECT 1 FROM file WHERE backup_filename = ? LIMIT 1", [fileName])
                if (recheck.length > 0) {
                    continue
                }
                await fs.unlink(filePath)
                removedCount++
                this.logger.debug(`Successfully removed orphaned file: ${filePath}`)
            } catch (error) {
                failedCount++
                this.logger.error(`Failed to remove orphaned file: ${filePath}`, error)
            }
        }

        return {
            scannedCount: storageFiles.length,
            removedCount,
            failedCount
        }
    }
}
