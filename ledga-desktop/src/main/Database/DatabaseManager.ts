import { v4 as uuid } from "uuid"
import type Database from "better-sqlite3"
import { ProcessingPriority, type DbQueryTaskPayload } from "../../common/types/WorkerTypes"
import type { Logger } from "../logging/FileLogger"
import { WorkerPool } from "../BackgroundWorker/WorkerPool"
import createBackgroundWorker from "../BackgroundWorker/BackgroundWorker?nodeWorker"
import type { QueryResult } from "./types/query"

const ASYNC_QUERY_TIMEOUT_MS = 10_000
const DATABASE_POOL_SIZE = 1
const DATABASE_WORKER_HEAP_MB = 256

export class DatabaseManager {
    private readonly pool: WorkerPool

    constructor(
        private readonly db: Database.Database,
        databasePath: string,
        private readonly logger: Logger
    ) {
        this.applyPragmas()
        const factory = () =>
            createBackgroundWorker({
                workerData: { dbPath: databasePath },
                resourceLimits: { maxOldGenerationSizeMb: DATABASE_WORKER_HEAP_MB }
            })
        this.pool = new WorkerPool("database", DATABASE_POOL_SIZE, logger, factory)
        this.logger.info("DatabaseManager initialized")
    }

    executeQuery(sql: string, params: unknown[] = []): unknown[] | QueryResult {
        const stmt = this.db.prepare(sql)
        if (stmt.reader) return stmt.all(params)

        const result = stmt.run(params)
        return { changes: result.changes, lastInsertRowid: result.lastInsertRowid }
    }

    async executeReadQueryAsync(sql: string, params: unknown[] = []): Promise<unknown[]> {
        return this.pool.execute<DbQueryTaskPayload, unknown[]>({
            id: uuid(),
            type: "db_query",
            priority: ProcessingPriority.HIGH,
            payload: { sql, params },
            timeout: ASYNC_QUERY_TIMEOUT_MS,
            resolve: () => {},
            reject: () => {},
            enqueuedAt: 0
        })
    }

    transaction<T>(fn: (exec: (sql: string, params?: unknown[]) => unknown[] | QueryResult) => T): T {
        return this.db.transaction(() => fn(this.executeQuery.bind(this)))()
    }

    async close(): Promise<void> {
        this.logger.info("Closing database")
        await this.pool.shutdown()
        this.db.pragma("optimize")
        this.db.close()
    }

    private applyPragmas(): void {
        this.logger.debug("Applying database pragmas")
        this.db.pragma("journal_mode = WAL")
        this.db.pragma("synchronous = NORMAL")
        this.db.pragma("cache_size = 10000")
        this.db.pragma("temp_store = MEMORY")
        this.db.pragma("busy_timeout = 5000")
    }
}
