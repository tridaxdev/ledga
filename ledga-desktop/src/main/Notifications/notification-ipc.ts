import { registerIpcHandler } from "../ipc/registerIpcHandler"
import type { NotificationService } from "./NotificationService"
import type { Alert } from "@/renderer/AlertFeature/types/Alert"
import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc"

export function setupNotificationIpcHandlers(notificationService: NotificationService) {
    registerIpcHandler(AllowedChannelIpc.NotificationsSend, async (_, ...args) => {
        const alert = args[0] as Alert
        await notificationService.send(alert)
    })

    registerIpcHandler(AllowedChannelIpc.NotificationsIsSupported, () => {
        return notificationService.isSupported()
    })
}
