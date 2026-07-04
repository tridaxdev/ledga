import { randomUUID } from "node:crypto"
import type { TransactionRepository } from "../transactions/TransactionRepository"
import type { CategoryRepository } from "../categories/CategoryRepository"
import type { RulesService } from "../rules/RulesService"
import type { BillPaymentService } from "../billPayments/BillPaymentService"
import type { BackgroundWorkerManager } from "../BackgroundWorker/BackgroundWorkerManager"
import type { BackgroundTask } from "../BackgroundWorker/WorkerPool"
import type { MainWindowNotificationService } from "../windowManagement/MainWindowNotification"
import type { Logger } from "../logging/FileLogger"
import { ProcessingPriority } from "@/common/types/WorkerTypes"
import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc"
import type { CsvImportProgressEvent, CsvImportRowProgress, CsvImportTaskPayload, CsvImportWorkerResult } from "@/common/types/CsvImportTypes"

const CSV_IMPORT_TASK_TIMEOUT_MS = 10 * 60_000

export class CsvImportService {
    constructor(
        private readonly transactionRepository: TransactionRepository,
        private readonly categoryRepository: CategoryRepository,
        private readonly rulesService: RulesService,
        private readonly billPaymentService: BillPaymentService,
        private readonly backgroundWorkerManager: BackgroundWorkerManager,
        private readonly notificationService: MainWindowNotificationService,
        private readonly logger: Logger
    ) {}

    importFile(filePath: string): { taskId: string } {
        const taskId = randomUUID()
        let rowsAdded = 0
        let rowsFlagged = 0
        let lastInvalidatedAt = 0
        let lastRowsParsed = 0
        let lastTotalRows = 0

        const notify = (rowsParsed: number, totalRows: number, done: boolean, error?: string) => {
            const event: CsvImportProgressEvent = { taskId, rowsParsed, totalRows, rowsAdded, rowsFlagged, done, error }
            this.notificationService.notifyMainWindow(AllowedChannelIpc.CsvImportProgress, event)
        }

        // Tells any open Ledger/Category-Review view to re-query so newly-added rows appear as
        // they land, not just after the whole file finishes. Throttled so a large statement
        // (hundreds/thousands of rows) doesn't fire a re-query on every single insert.
        const INVALIDATE_THROTTLE_MS = 400
        const maybeInvalidate = (force: boolean) => {
            const now = Date.now()
            if (!force && now - lastInvalidatedAt < INVALIDATE_THROTTLE_MS) return
            lastInvalidatedAt = now
            this.notificationService.notifyMainWindow(AllowedChannelIpc.TransactionsInvalidated, undefined)
        }

        const task: BackgroundTask<CsvImportTaskPayload, CsvImportWorkerResult, CsvImportRowProgress> = {
            id: taskId,
            type: "csv_import",
            priority: ProcessingPriority.NORMAL,
            payload: { filePath },
            timeout: CSV_IMPORT_TASK_TIMEOUT_MS,
            resolve: () => {},
            reject: () => {},
            enqueuedAt: 0,
            onProgress: progress => {
                const wasInserted = this.insertRow(progress)
                if (wasInserted) {
                    rowsAdded++
                    if (progress.row.needsReview) rowsFlagged++
                    maybeInvalidate(false)
                }
                lastRowsParsed = progress.rowIndex + 1
                lastTotalRows = progress.totalRows
                notify(lastRowsParsed, lastTotalRows, false)
            }
        }

        this.backgroundWorkerManager
            .executeTask(task)
            .then(result => {
                maybeInvalidate(true)
                if (result.totalRows === 0) {
                    notify(0, 0, true, "No rows found in this file -- check it's a CSV with a header row.")
                    return
                }
                notify(result.totalRows, result.totalRows, true)
            })
            .catch(error => {
                this.logger.error("CSV import failed", { taskId, error: error instanceof Error ? error.message : String(error) })
                maybeInvalidate(true)
                // Report progress as it actually stood when the failure happened, not a
                // recomputed (and misleadingly complete-looking) count.
                notify(lastRowsParsed, lastTotalRows, true, error instanceof Error ? error.message : String(error))
            })

        return { taskId }
    }

    // Returns true if a new row was inserted, false if it was skipped as a duplicate of an
    // already-imported transaction (same bank_reference -- see CsvStatementParser for how that's
    // derived when the statement has no reference column of its own).
    private insertRow(progress: CsvImportRowProgress): boolean {
        const { transaction, needsReview } = progress.row

        if (this.transactionRepository.existsByBankReference(transaction.bank_reference)) {
            return false
        }

        const applied = this.rulesService.applyRules(transaction.merchant)
        const categoryId = applied.category ? (this.categoryRepository.findIdByDisplayName(applied.category) ?? null) : null
        const parsedTimestamp = transaction.timestamp ? Math.floor(new Date(transaction.timestamp).getTime() / 1000) : 0
        const timestamp = Number.isFinite(parsedTimestamp) ? parsedTimestamp : 0

        const inserted = this.transactionRepository.insert({
            ...transaction,
            merchant: applied.merchant,
            source: "csv",
            timestamp,
            categoryId,
            needsReview
        })
        this.billPaymentService.tryLinkAfterInsert(inserted)
        return true
    }
}
