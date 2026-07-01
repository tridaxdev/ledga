import { registerIpcHandler } from "../ipc/registerIpcHandler"
import type { ConversationReferencesService } from "./ConversationReferencesService"
import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc"
import { ResultFactory } from "@/common/types/Result"

export function setupIpcHandlersConversationReferences(referencesService: ConversationReferencesService) {
    registerIpcHandler(AllowedChannelIpc.ConversationGetReferences, async (_, ...args) => {
        const conversationId = args[0] as string
        return ResultFactory.from(referencesService.getReferencesForConversation(conversationId))
    })
}
