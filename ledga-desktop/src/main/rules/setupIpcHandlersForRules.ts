import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc"
import { ResultFactory } from "@/common/types/Result"
import type { RuleInput } from "@/common/types/Rule"
import { registerIpcHandler } from "../ipc/registerIpcHandler"
import type { RulesService } from "./RulesService"
import type { MainWindowNotificationService } from "../windowManagement/MainWindowNotification"

function toInsertInput(input: RuleInput) {
    return {
        matchKeyword: input.matchKeyword,
        renameMerchant: input.renameMerchant ?? null,
        categoryName: input.categoryName ?? null,
        position: input.position
    }
}

export function setupIpcHandlersForRules(
    rulesService: RulesService,
    notificationService: MainWindowNotificationService
): void {
    function applyRetroactivelyAndNotify(): void {
        rulesService.applyRulesRetroactively()
        notificationService.notifyMainWindow(AllowedChannelIpc.TransactionsInvalidated, undefined)
    }

    registerIpcHandler(AllowedChannelIpc.RulesGetAll, () => {
        return ResultFactory.success(rulesService.findAll())
    })

    registerIpcHandler(AllowedChannelIpc.RulesCreate, (_, ...args) => {
        const input = args[0] as RuleInput
        const rule = rulesService.insert(toInsertInput(input))
        applyRetroactivelyAndNotify()
        return ResultFactory.success(rule)
    })

    registerIpcHandler(AllowedChannelIpc.RulesUpdate, (_, ...args) => {
        const id = args[0] as string
        const input = args[1] as Partial<RuleInput>
        rulesService.update(id, input)
        applyRetroactivelyAndNotify()
        return ResultFactory.success(undefined)
    })

    registerIpcHandler(AllowedChannelIpc.RulesDelete, (_, ...args) => {
        const id = args[0] as string
        rulesService.deleteAndRevert(id)
        notificationService.notifyMainWindow(AllowedChannelIpc.TransactionsInvalidated, undefined)
        return ResultFactory.success(undefined)
    })
}
