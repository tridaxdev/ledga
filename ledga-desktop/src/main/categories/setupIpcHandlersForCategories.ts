import { registerIpcHandler } from "../ipc/registerIpcHandler"
import type { TransactionRepository } from "../transactions/TransactionRepository"
import type { RulesService } from "../rules/RulesService"
import type { CategoryRepository } from "./CategoryRepository"
import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc"
import { ResultFactory } from "@/common/types/Result"
import { PROTECTED_CATEGORY_NAME, type CategoryInput } from "@/common/types/Category"

export function setupIpcHandlersForCategories(categoryRepository: CategoryRepository, transactionRepository: TransactionRepository, rulesService: RulesService): void {
    registerIpcHandler(AllowedChannelIpc.CategoriesGetAll, () => {
        return ResultFactory.success(categoryRepository.findAll())
    })

    registerIpcHandler(AllowedChannelIpc.CategoriesCreate, (_, ...args) => {
        const input = args[0] as CategoryInput
        const name = input.name.trim()
        if (!name) return ResultFactory.error(new Error("Category name is required"))
        if (categoryRepository.findIdByDisplayName(name)) return ResultFactory.error(new Error(`A category named "${name}" already exists`))

        return ResultFactory.success(categoryRepository.insert(name, input.color))
    })

    registerIpcHandler(AllowedChannelIpc.CategoriesUpdate, (_, ...args) => {
        const id = args[0] as string
        const patch = args[1] as Partial<CategoryInput>
        const existing = categoryRepository.findById(id)
        if (!existing) return ResultFactory.error(new Error("Category not found"))

        const nextName = patch.name?.trim()
        if (nextName !== undefined) {
            if (existing.name === PROTECTED_CATEGORY_NAME) return ResultFactory.error(new Error(`"${PROTECTED_CATEGORY_NAME}" can't be renamed`))
            if (!nextName) return ResultFactory.error(new Error("Category name is required"))
            const conflictId = categoryRepository.findIdByDisplayName(nextName)
            if (conflictId && conflictId !== id) return ResultFactory.error(new Error(`A category named "${nextName}" already exists`))
        }

        categoryRepository.update(id, { name: nextName, color: patch.color })
        if (nextName !== undefined && nextName !== existing.name) rulesService.renameCategoryReferences(existing.name, nextName)

        return ResultFactory.success(undefined)
    })

    registerIpcHandler(AllowedChannelIpc.CategoriesDelete, (_, ...args) => {
        const id = args[0] as string
        const existing = categoryRepository.findById(id)
        if (!existing) return ResultFactory.error(new Error("Category not found"))
        if (existing.name === PROTECTED_CATEGORY_NAME) return ResultFactory.error(new Error(`"${PROTECTED_CATEGORY_NAME}" can't be deleted`))

        const transactionCount = transactionRepository.countAll({ categoryId: id })
        const ruleCount = rulesService.countByCategoryName(existing.name)
        if (transactionCount > 0 || ruleCount > 0) {
            const parts: string[] = []
            if (transactionCount > 0) parts.push(`${transactionCount} transaction${transactionCount === 1 ? "" : "s"}`)
            if (ruleCount > 0) parts.push(`${ruleCount} rule${ruleCount === 1 ? "" : "s"}`)
            return ResultFactory.error(new Error(`${parts.join(" and ")} use this category — reassign them first`))
        }

        categoryRepository.delete(id)
        return ResultFactory.success(undefined)
    })
}
