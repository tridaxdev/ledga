import type { NormalizedTransaction } from "./Transaction"

export interface CsvImportTaskPayload {
    filePath: string
}

export interface ParsedCsvRow {
    transaction: NormalizedTransaction
    needsReview: boolean
}

export interface CsvImportRowProgress {
    rowIndex: number
    totalRows: number
    row: ParsedCsvRow
}

export interface CsvImportWorkerResult {
    totalRows: number
}

export interface CsvImportProgressEvent {
    taskId: string
    rowsParsed: number
    totalRows: number
    rowsAdded: number
    rowsFlagged: number
    done: boolean
    error?: string
}
