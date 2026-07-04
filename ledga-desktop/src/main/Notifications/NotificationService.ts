import { Notification } from "electron"
import type { Logger } from "../logging/FileLogger"
import type { WindowManager } from "../windowManagement/WindowManager"
import type { Alert } from "@/renderer/AlertFeature/types/Alert"

interface NotificationOptions {
    readonly title: string
    readonly body: string
}

export class NotificationService {
    constructor(
        private readonly logger: Logger,
        private readonly windowManager: WindowManager
    ) {}

    async send(alert: Alert): Promise<void> {
        const mainWindow = this.windowManager.getMainWindow()
        mainWindow?.webContents.send("show-alert", alert)

        if (!this.isSupported()) {
            this.logger.warn("Notifications are not supported on this platform")
            return
        }

        if (mainWindow?.isFocused) {
            return
        }

        try {
            const options: NotificationOptions = {
                title: alert.title,
                body: alert.description || ""
            }
            const notification = new Notification(options)
            notification.show()
        } catch (error) {
            this.logger.error("Failed to send notification:", error)
            throw error
        }
    }

    isSupported(): boolean {
        return Notification.isSupported()
    }
}
