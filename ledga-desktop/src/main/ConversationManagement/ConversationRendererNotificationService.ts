import type { WindowManager } from "../windowManagement/WindowManager"
import { MainWindowNotificationService } from "../windowManagement/MainWindowNotificationService"
import type { Conversation, ConversationDeletedEvent, ConversationCreatedEvent, ConversationUpdate, ConversationUpdatedEvent, ConversationReferencesUpdatedEvent } from "@/common/types/types"
import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc"

export class ConversationRendererNotificationService extends MainWindowNotificationService {
    constructor(windowManager: WindowManager) {
        super(windowManager)
    }

    conversationCreated(conversation: Conversation) {
        const event: ConversationCreatedEvent = {
            conversation
        }
        this.notifyMainWindow(AllowedChannelIpc.ConversationCreateStream, event)
    }

    conversationUpdated(conversation: ConversationUpdate) {
        const event: ConversationUpdatedEvent = {
            conversation
        }
        this.notifyMainWindow(AllowedChannelIpc.ConversationUpdateStream, event)
    }

    conversationDeleted(conversationId: string, projectId?: string) {
        const event: ConversationDeletedEvent = {
            conversationId,
            projectId
        }
        this.notifyMainWindow(AllowedChannelIpc.ConversationDeleteStream, event)
    }

    referencesUpdated(conversationId: string) {
        const event: ConversationReferencesUpdatedEvent = { conversationId }
        this.notifyMainWindow(AllowedChannelIpc.ConversationReferencesUpdatedStream, event)
    }
}
