import type { WindowManager } from "./WindowManager"
import type { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc"

export class MainWindowNotificationService {
    constructor(private windowManager: WindowManager) {}

    notifyMainWindow(channel: AllowedChannelIpc, event: unknown) {
        const mainWindow = this.windowManager.getMainWindow()

        if (!mainWindow) {
            return
        }

        mainWindow.webContents.send(channel, event)
    }
}
