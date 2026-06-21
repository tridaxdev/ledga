import * as os from "os"

// Memory reserved for non-background-pool use — OS, renderer process, browser the user
// has open, the database worker, etc.
const SYSTEM_RESERVE_MB = 1280

// V8's own per-process heap default on 64-bit. A higher cap won't be honored, so this
// acts as a natural ceiling on the per-worker share.
const V8_DEFAULT_HEAP_MB = 4096

// Floor: don't drop a background worker below this even on tiny machines — V8 needs
// working room just to host the runtime.
const MIN_WORKER_HEAP_MB = 256

export interface WorkerPoolSizing {
    logicalCpuCount: number
    totalMemoryMB: number
    backgroundPoolSize: number
    backgroundHeapMB: number
}

export function computeWorkerPoolSizing(): WorkerPoolSizing {
    const logicalCpuCount = os.availableParallelism()
    const totalMemoryMB = Math.round(os.totalmem() / 1024 / 1024)
    const backgroundPoolSize = Math.max(1, logicalCpuCount - 1)
    const backgroundHeapMB = computeBackgroundHeapMB(totalMemoryMB, backgroundPoolSize)
    return {
        logicalCpuCount,
        totalMemoryMB,
        backgroundPoolSize,
        backgroundHeapMB
    }
}

function computeBackgroundHeapMB(totalMemoryMB: number, backgroundPoolSize: number): number {
    const budgetMB = Math.max(0, totalMemoryMB - SYSTEM_RESERVE_MB)
    const perWorkerShareMB = Math.floor(budgetMB / backgroundPoolSize)
    return Math.max(MIN_WORKER_HEAP_MB, Math.min(V8_DEFAULT_HEAP_MB, perWorkerShareMB))
}
