import { registerIpcHandler } from "../ipc/registerIpcHandler"
import type { CategoryRepository } from "../categories/CategoryRepository"
import type { TransactionRepository, TransactionRow } from "./TransactionRepository"
import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc"
import { ResultFactory } from "@/common/types/Result"
import type { CategoryQueryParams, FlaggedTransaction, Transaction, TransactionQueryParams, TransactionSummary } from "@/common/types/Transaction"

const SUGGESTED_CATEGORY_NAME = "Other"

function toTransaction(row: TransactionRow): Transaction {
    return { ...row, needs_review: row.needs_review === 1 }
}

export function setupIpcHandlersForTransactions(transactionRepository: TransactionRepository, categoryRepository: CategoryRepository): void {
    registerIpcHandler(AllowedChannelIpc.TransactionsQuery, (_, ...args) => {
        const params = (args[0] ?? {}) as TransactionQueryParams
        const rows = transactionRepository.findAll(params)
        const summary: TransactionSummary = transactionRepository.getSummaryForPeriod({ from: params.from, to: params.to, accountNumber: params.accountNumber })
        const totalCount = transactionRepository.countAll(params)
        const { count: flaggedCount, firstCategoryId: firstFlaggedCategoryId } = transactionRepository.getFlaggedSummary({
            from: params.from,
            to: params.to,
            search: params.search,
            accountNumber: params.accountNumber
        })
        return ResultFactory.success({
            transactions: rows.map(toTransaction),
            summary,
            totalCount,
            flaggedCount,
            firstFlaggedCategoryId
        })
    })

    registerIpcHandler(AllowedChannelIpc.TransactionsListAccounts, () => {
        return ResultFactory.success(transactionRepository.listAccounts())
    })

    registerIpcHandler(AllowedChannelIpc.TransactionsQueryByCategory, (_, ...args) => {
        const params = args[0] as CategoryQueryParams
        const transactions = transactionRepository.findAll({ categoryId: params.categoryId, from: params.from, to: params.to }).map(toTransaction)
        const aggregate = transactionRepository.aggregateByCategory(params.categoryId, { from: params.from, to: params.to })

        // Don't suggest the category the user is already looking at -- viewing "Other" itself
        // shouldn't render an "Other -> Other" no-op suggestion.
        const suggested = categoryRepository.findAll().find(c => c.name === SUGGESTED_CATEGORY_NAME && c.id !== params.categoryId)
        const flagged: FlaggedTransaction[] = transactionRepository.findFlaggedByCategory(params.categoryId).map(row => ({
            ...toTransaction(row),
            suggestedCategoryId: suggested?.id ?? null,
            suggestedCategoryName: suggested?.name ?? null
        }))

        return ResultFactory.success({ transactions, aggregate, flagged })
    })

    registerIpcHandler(AllowedChannelIpc.TransactionsUpdateCategory, (_, ...args) => {
        const id = args[0] as string
        const categoryId = args[1] as string | null
        transactionRepository.updateCategory(id, categoryId, true)
        return ResultFactory.success(undefined)
    })

    registerIpcHandler(AllowedChannelIpc.TransactionsUpdateMerchant, (_, ...args) => {
        const id = args[0] as string
        const merchant = args[1] as string
        transactionRepository.updateMerchant(id, merchant)
        return ResultFactory.success(undefined)
    })

    registerIpcHandler(AllowedChannelIpc.TransactionsMarkReviewed, (_, ...args) => {
        const id = args[0] as string
        transactionRepository.markReviewed(id)
        return ResultFactory.success(undefined)
    })
}
