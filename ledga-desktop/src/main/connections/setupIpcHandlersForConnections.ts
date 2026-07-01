import { randomUUID } from 'node:crypto'
import { AllowedChannelIpc } from '@/common/types/AllowedChannelIpc'
import { ResultFactory } from '@/common/types/Result'
import type { ConnectionRepository } from './ConnectionRepository'
import type { OAuthResult, GoogleOAuthService } from './GoogleOAuthService'
import type { TokenStorageService } from '../encryption/TokenStorageService'
import type { MainWindowNotificationService } from '../windowManagement/MainWindowNotification'
import type { Logger } from '../logging/FileLogger'
import { registerIpcHandler } from '../ipc/registerIpcHandler'

export function setupIpcHandlersForConnections(
    connectionRepository: ConnectionRepository,
    tokenStorage: TokenStorageService,
    oauthService: GoogleOAuthService,
    notificationService: MainWindowNotificationService,
    logger: Logger
): void {
    // Holds completed OAuth results that haven't been persisted yet — the connection
    // row is only written once the user confirms a sync preference via `finalize`,
    // so cancelling mid-flow (or closing the modal before that point) never leaves
    // a partial connection row in the database.
    const pendingFlows = new Map<string, OAuthResult>()

    registerIpcHandler(AllowedChannelIpc.ConnectionsGetAll, () => {
        return ResultFactory.success(connectionRepository.findAll())
    })

    registerIpcHandler(AllowedChannelIpc.ConnectionsDelete, async (_, ...args) => {
        const id = args[0] as string
        connectionRepository.delete(id)
        await tokenStorage.deleteTokens(id)
        return ResultFactory.success(undefined)
    })

    registerIpcHandler(AllowedChannelIpc.ConnectionsStartOAuth, async () => {
        try {
            const oauthResult = await oauthService.startOAuthFlow()
            const flowId = randomUUID()
            pendingFlows.set(flowId, oauthResult)
            return ResultFactory.success({ flowId, email: oauthResult.email })
        } catch (error) {
            logger.error('OAuth flow failed', error)
            return ResultFactory.error(error instanceof Error ? error : new Error(String(error)))
        }
    })

    registerIpcHandler(AllowedChannelIpc.ConnectionsCancelOAuth, async (_, ...args) => {
        oauthService.cancel()
        const flowId = args[0] as string | undefined
        if (flowId) {
            // Covers cancelling after OAuth already completed (e.g. the modal was closed on the
            // sync-preference step without finalizing) — the flow has no server to close at that
            // point, but its tokens are still sitting in memory and must not be kept forever.
            pendingFlows.delete(flowId)
        }
        return ResultFactory.success(undefined)
    })

    registerIpcHandler(AllowedChannelIpc.ConnectionsFinalize, async (_, ...args) => {
        const flowId = args[0] as string
        const autoSync = args[1] as boolean
        const pending = pendingFlows.get(flowId)
        if (!pending) {
            return ResultFactory.error(new Error('OAuth flow expired or was already finalized'))
        }
        pendingFlows.delete(flowId)

        const connection = connectionRepository.insert(pending.email)
        connectionRepository.update(connection.id, {
            auto_sync: autoSync,
            expiry_date: Math.floor(pending.expiryDate.getTime() / 1000)
        })

        await tokenStorage.setTokens(connection.id, pending.accessToken, pending.refreshToken)

        const updated = connectionRepository.findById(connection.id) ?? connection
        notificationService.notifyMainWindow(AllowedChannelIpc.ConnectionsOAuthCompleted, updated)

        return ResultFactory.success(updated)
    })
}
