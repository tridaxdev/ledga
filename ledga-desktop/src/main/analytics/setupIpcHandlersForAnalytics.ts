import { registerIpcHandler } from "../ipc/registerIpcHandler"
import type { CategoryRepository } from "../categories/CategoryRepository"
import type { TransactionRepository } from "../transactions/TransactionRepository"
import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc"
import { ResultFactory } from "@/common/types/Result"
import type { AnalyticsQueryParams, CategoryTotal } from "@/common/types/Analytics"

const TRANSFER_CATEGORY_NAME = "Transfer"
const UNCATEGORIZED_COLOR = "#a8a196"

export function setupIpcHandlersForAnalytics(transactionRepository: TransactionRepository, categoryRepository: CategoryRepository): void {
    registerIpcHandler(AllowedChannelIpc.AnalyticsGetMonthlyTotals, (_, ...args) => {
        const params = args[0] as AnalyticsQueryParams
        return ResultFactory.success(transactionRepository.getMonthlyTotals(params))
    })

    registerIpcHandler(AllowedChannelIpc.AnalyticsGetCategoryTotals, (_, ...args) => {
        const params = args[0] as AnalyticsQueryParams
        const categories = categoryRepository.findAll()
        const transferCategoryId = categories.find(c => c.name === TRANSFER_CATEGORY_NAME)?.id ?? null

        const totals: CategoryTotal[] = transactionRepository
            .getCategoryExpenseTotals(params)
            .filter(row => row.categoryId !== transferCategoryId)
            .map(row => {
                const category = categories.find(c => c.id === row.categoryId)
                return {
                    categoryId: row.categoryId,
                    name: category?.name ?? "Uncategorized",
                    color: category?.color ?? UNCATEGORIZED_COLOR,
                    total: row.total
                }
            })

        return ResultFactory.success(totals)
    })

    registerIpcHandler(AllowedChannelIpc.AnalyticsGetNetWorthHistory, (_, ...args) => {
        const params = args[0] as AnalyticsQueryParams
        return ResultFactory.success(transactionRepository.getNetWorthHistory(params))
    })

    registerIpcHandler(AllowedChannelIpc.AnalyticsListCurrencies, () => {
        return ResultFactory.success(transactionRepository.listCurrencies())
    })
}
