import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc"
import { ResultFactory } from "@/common/types/Result"
import type { Transaction, TransactionQueryParams, TransactionSummary } from "@/common/types/Transaction"
import { registerIpcHandler } from "../ipc/registerIpcHandler"
import type { TransactionRepository, TransactionRow } from "./TransactionRepository"

function toTransaction(row: TransactionRow): Transaction {
    return { ...row, needs_review: row.needs_review === 1 }
}

export function setupIpcHandlersForTransactions(transactionRepository: TransactionRepository): void {
    registerIpcHandler(AllowedChannelIpc.TransactionsQuery, (_, ...args) => {
        const params = (args[0] ?? {}) as TransactionQueryParams
        const rows = transactionRepository.findAll(params)
        const summary: TransactionSummary = transactionRepository.getSummaryForPeriod({ from: params.from, to: params.to })
        return ResultFactory.success({
            transactions: rows.map(toTransaction),
            summary
        })
    })

    registerIpcHandler(AllowedChannelIpc.TransactionsUpdateCategory, (_, ...args) => {
        const id = args[0] as string
        const categoryId = args[1] as string | null
        transactionRepository.updateCategory(id, categoryId)
        return ResultFactory.success(undefined)
    })
}
