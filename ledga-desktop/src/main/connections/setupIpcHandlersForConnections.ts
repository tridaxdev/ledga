import { AllowedChannelIpc } from '@/common/types/AllowedChannelIpc'
import { ResultFactory } from '@/common/types/Result'
import type { ConnectionRepository } from './ConnectionRepository'
import type { GoogleOAuthService } from './GoogleOAuthService'
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
            const connection = connectionRepository.insert(oauthResult.email)

            connectionRepository.update(connection.id, {
                expiry_date: Math.floor(oauthResult.expiryDate.getTime() / 1000)
            })

            await tokenStorage.setTokens(connection.id, oauthResult.accessToken, oauthResult.refreshToken)

            const updated = connectionRepository.findById(connection.id) ?? connection
            notificationService.notifyMainWindow(AllowedChannelIpc.ConnectionsOAuthCompleted, updated)

            return ResultFactory.success(updated)
        } catch (error) {
            logger.error('OAuth flow failed', error)
            return ResultFactory.failure(error instanceof Error ? error : new Error(String(error)))
        }
    })
}
