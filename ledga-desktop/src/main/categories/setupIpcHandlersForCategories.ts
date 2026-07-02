import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc"
import { ResultFactory } from "@/common/types/Result"
import { registerIpcHandler } from "../ipc/registerIpcHandler"
import type { CategoryRepository } from "./CategoryRepository"

export function setupIpcHandlersForCategories(categoryRepository: CategoryRepository): void {
    registerIpcHandler(AllowedChannelIpc.CategoriesGetAll, () => {
        return ResultFactory.success(categoryRepository.findAll())
    })
}
