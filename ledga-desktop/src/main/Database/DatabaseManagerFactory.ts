import type { Logger } from "../logging/FileLogger"
import { DatabaseManager } from "./DatabaseManager"
import { DatabaseMigrationManager } from "./DatabaseMigrationManager"
import { DatabaseBackupService } from "./DatabaseBackupService"
import { DatabaseLoader } from "./DatabaseLoader"
import { migrations } from "./migrations"

export class DatabaseManagerFactory {
    static async create(logger: Logger, userDataPath: string): Promise<DatabaseManager> {
        const backupService = new DatabaseBackupService(userDataPath)
        const databaseLoader = new DatabaseLoader(logger, backupService)
        const database = await databaseLoader.load(userDataPath)
        const migrationManager = new DatabaseMigrationManager(logger, backupService, migrations)
        await migrationManager.runMigrations(database)
        return new DatabaseManager(database, DatabaseLoader.databasePath(userDataPath), logger)
    }
}
