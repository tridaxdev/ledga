import type { Logger } from "../logging/FileLogger"
import createBackgroundWorker from "./BackgroundWorker?nodeWorker"
import { WorkerPool, type BackgroundTask } from "./WorkerPool"
import { computeWorkerPoolSizing } from "./WorkerPoolSizing"

export class BackgroundWorkerManager {
    private readonly pool: WorkerPool
    private readonly logger: Logger

    constructor(databasePath: string, appStorageDirectory: string, logger: Logger) {
        this.logger = logger

        const sizing = computeWorkerPoolSizing()
        logger.info(`Background worker pool sizing: cpus=${sizing.logicalCpuCount}, totalMem=${sizing.totalMemoryMB}MB, poolSize=${sizing.backgroundPoolSize} (${sizing.backgroundHeapMB}MB heap)`)

        const factory = () =>
            createBackgroundWorker({
                workerData: { dbPath: databasePath, appStorageDir: appStorageDirectory },
                resourceLimits: { maxOldGenerationSizeMb: sizing.backgroundHeapMB }
            })

        this.pool = new WorkerPool("background", sizing.backgroundPoolSize, logger, factory)
    }

    async executeTask<TPayload, TResult>(task: BackgroundTask<TPayload, TResult>): Promise<TResult> {
        return this.pool.execute(task)
    }

    async shutdown(): Promise<void> {
        this.logger.info("Shutting down BackgroundWorkerManager")
        await this.pool.shutdown()
        this.logger.info("BackgroundWorkerManager shutdown complete")
    }

    cancelTasks(taskIds: string[]): void {
        this.logger.info(`Cancelling ${taskIds.length} tasks`)
        for (const taskId of taskIds) {
            const cancelled = this.pool.cancelTask(taskId)
            if (!cancelled) {
                this.logger.debug(`Task ${taskId} not found in pool (already completed?)`)
            }
        }
    }
}
