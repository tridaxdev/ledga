import { registerIpcHandler } from "../ipc/registerIpcHandler"
import type { ConversationManagementService } from "./ConversationManagementService"
import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc"
import { ResultFactory } from "@/common/types/Result"
import type {
    ConversationStreamEvent,
    CreateConversationRequest,
    CreateMessageRequest,
    DeleteConversationRequest,
    EditUserMessageRequest,
    GetConversationRequest,
    GetConversationsByProjectRequest,
    RetryFromMessageRequest,
    StopConversationStreamRequest,
    UpdateConversationRequest,
    UpdateUserInputToolResultRequest,
    ToolApprovalDecision
} from "@/common/types/types"

export function setupIpcHandlersConversation(conversationService: ConversationManagementService) {
    registerIpcHandler(AllowedChannelIpc.ConversationGetAll, async () => {
        return ResultFactory.from(conversationService.getAllConversations())
    })

    registerIpcHandler(AllowedChannelIpc.ConversationStopStreaming, async (_, ...args) => {
        const request = args[0] as StopConversationStreamRequest
        return ResultFactory.from(conversationService.stopStreaming(request))
    })

    registerIpcHandler(AllowedChannelIpc.ConversationGetById, async (_, ...args) => {
        const request = args[0] as GetConversationRequest
        return ResultFactory.from(conversationService.getConversationById(request))
    })

    registerIpcHandler(AllowedChannelIpc.ConversationGetByProject, async (_, ...args) => {
        const request = args[0] as GetConversationsByProjectRequest
        return ResultFactory.from(conversationService.getConversationsByProjectId(request))
    })

    registerIpcHandler(AllowedChannelIpc.ConversationCreate, async (_, ...args) => {
        const request = args[0] as CreateConversationRequest
        return ResultFactory.from(conversationService.createConversation(request))
    })

    registerIpcHandler(AllowedChannelIpc.ConversationUpdate, async (_, ...args) => {
        const request = args[0] as UpdateConversationRequest
        return ResultFactory.from(conversationService.updateConversation(request))
    })

    registerIpcHandler(AllowedChannelIpc.ConversationDelete, async (_, ...args) => {
        const request = args[0] as DeleteConversationRequest
        return ResultFactory.from(conversationService.deleteConversation(request))
    })

    registerIpcHandler(AllowedChannelIpc.ConversationSendMessage, async (event, ...args) => {
        const request = args[0] as CreateMessageRequest
        return ResultFactory.from(
            conversationService.sendChatMessage(request, streamEvent => {
                event.sender.send(AllowedChannelIpc.ConversationChatStreamChunk, streamEvent)
            })
        )
    })

    registerIpcHandler(AllowedChannelIpc.ConversationRetryFromMessage, async (event, ...args) => {
        const request = args[0] as RetryFromMessageRequest
        return ResultFactory.from(
            conversationService.retryFromMessage(request.conversationId, request.assistantMessageId, streamEvent => {
                event.sender.send(AllowedChannelIpc.ConversationChatStreamChunk, streamEvent)
            })
        )
    })

    registerIpcHandler(AllowedChannelIpc.ConversationEditUserMessage, async (event, ...args) => {
        const request = args[0] as EditUserMessageRequest
        return ResultFactory.from(
            conversationService.editUserMessage(request, streamEvent => {
                event.sender.send(AllowedChannelIpc.ConversationChatStreamChunk, streamEvent)
            })
        )
    })

    registerIpcHandler(AllowedChannelIpc.ConversationUpdateUserInputToolResult, async (event, ...args) => {
        const request = args[0] as UpdateUserInputToolResultRequest
        return ResultFactory.from(
            conversationService.updateUserInputToolResult(request, (streamEvent: ConversationStreamEvent) => {
                event.sender.send(AllowedChannelIpc.ConversationChatStreamChunk, streamEvent)
            })
        )
    })

    registerIpcHandler(AllowedChannelIpc.ConversationMarkAsRead, async (_, ...args) => {
        const conversationId = args[0] as string
        return ResultFactory.from(conversationService.markConversationAsRead(conversationId))
    })

    registerIpcHandler(AllowedChannelIpc.ConversationToolApprovalResponse, async (event, ...args) => {
        const request = args[0] as ToolApprovalDecision
        return ResultFactory.from(
            conversationService.updateUserToolApproval(request, (streamEvent: ConversationStreamEvent) => {
                event.sender.send(AllowedChannelIpc.ConversationChatStreamChunk, streamEvent)
            })
        )
    })
}
