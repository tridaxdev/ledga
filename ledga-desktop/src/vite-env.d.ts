/// <reference types="vite/client" />

declare module "*?nodeWorker" {
    const createWorker: (options?: import("worker_threads").WorkerOptions) => import("worker_threads").Worker
    export default createWorker
}

declare module "*?modulePath" {
    const filePath: string
    export default filePath
}
