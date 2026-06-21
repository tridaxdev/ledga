import z from "zod"

export enum ProcessingPriority {
    LOW = 0,
    NORMAL = 1,
    HIGH = 2,
    URGENT = 3
}

export interface DbQueryTaskPayload {
    sql: string
    params: unknown[]
}

export interface WorkerLogMessage {
    type: "LOG"
    level: "debug" | "info" | "warn" | "error"
    message: string
    meta?: unknown
    timestamp: string
    contextId?: string
}

export const CANCELLED_EXIT_CODE = 143

export interface WorkerResultMessage<TResult = unknown> {
    type: "RESULT"
    taskId: string
    success: boolean
    result?: TResult
    error?: string
}

export interface WorkerLogMessage {
    type: "LOG"
    level: "debug" | "info" | "warn" | "error"
    message: string
    meta?: unknown
    timestamp: string
    contextId?: string
}

export interface AIResponse<T = unknown> {
    requestId: string
    success: boolean
    result?: T
    usage?: {
        inputTokens: number
        outputTokens: number
        totalTokens: number
    }
    error?: string
}

export const WorkerTaskTypeSchema = z.enum(["db_query"])
export type WorkerTaskType = z.infer<typeof WorkerTaskTypeSchema>

export interface WorkerTaskMessage<TPayload = unknown> {
    type: "TASK"
    taskId: string
    taskType: WorkerTaskType
    payload: TPayload
}

export interface WorkerCancelMessage {
    type: "CANCEL"
}

export type MainToWorkerMessage = WorkerTaskMessage<unknown>  | WorkerCancelMessage
export type WorkerToMainMessage = WorkerResultMessage<unknown> | WorkerLogMessage 