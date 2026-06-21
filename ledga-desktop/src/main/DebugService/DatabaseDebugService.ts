import * as fs from "fs"
import type { Logger } from "../logging/FileLogger"
import type { DatabaseManager } from "../Database/DatabaseManager"
import type { DatabaseStats } from "../../common/types/PyleApi"

export class DatabaseDebugService {
    constructor(
        private databaseManager: DatabaseManager,
        private databasePath: string,
        private logger: Logger
    ) {}

    async getStats(): Promise<DatabaseStats> {
        try {
            // Get database file size
            let size = "0 MB"
            let status: "healthy" | "error" = "healthy"

            try {
                if (fs.existsSync(this.databasePath)) {
                    const stats = await fs.promises.stat(this.databasePath)
                    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(1)
                    size = `${sizeInMB} MB`
                }
            } catch (error) {
                this.logger.warn("Failed to get database file size:", error)
                status = "error"
            }

            // Get record count by querying main tables
            let records = 0
            try {
                const tableQueries = [
                    "SELECT COUNT(*) as count FROM projects",
                    "SELECT COUNT(*) as count FROM conversations",
                    "SELECT COUNT(*) as count FROM messages",
                    "SELECT COUNT(*) as count FROM project_assets"
                ]

                for (const query of tableQueries) {
                    try {
                        const result = (await this.databaseManager.executeQuery(query)) as Array<{
                            count: number
                        }>
                        if (result && result.length > 0) {
                            records += result[0].count
                        }
                    } catch (error) {
                        this.logger.debug(`Failed to query table: ${query}`, error)
                    }
                }
            } catch (error) {
                this.logger.warn("Failed to get database record count:", error)
                status = "error"
            }

            return {
                size,
                records,
                lastBackup: "Not available", // TODO: Implement backup tracking
                status
            }
        } catch (error) {
            this.logger.error("Failed to get database stats:", error)
            return {
                size: "Unknown",
                records: 0,
                lastBackup: "Unknown",
                status: "error"
            }
        }
    }

    async deleteDatabase(): Promise<boolean> {
        try {
            this.logger.warn("Starting database deletion process")

            // Close the database connection first
            await this.databaseManager.close()

            // Delete the main database file
            if (fs.existsSync(this.databasePath)) {
                await fs.promises.unlink(this.databasePath)
                this.logger.info("Database file deleted successfully")
            }

            // Delete related files (WAL, SHM)
            const walFile = `${this.databasePath}-wal`
            const shmFile = `${this.databasePath}-shm`

            if (fs.existsSync(walFile)) {
                await fs.promises.unlink(walFile)
                this.logger.info("Database WAL file deleted")
            }

            if (fs.existsSync(shmFile)) {
                await fs.promises.unlink(shmFile)
                this.logger.info("Database SHM file deleted")
            }

            this.logger.info("Database deletion completed successfully")
            return true
        } catch (error) {
            this.logger.error("Failed to delete database:", error)
            return false
        }
    }

    async downloadBackup(): Promise<string> {
        try {
            if (!fs.existsSync(this.databasePath)) {
                throw new Error("Database file does not exist")
            }

            // For now, just return the path to the database file
            // In a full implementation, you might want to create a copy in a specific backup location
            this.logger.info("Database backup requested")
            return this.databasePath
        } catch (error) {
            this.logger.error("Failed to create database backup:", error)
            throw error
        }
    }
}
