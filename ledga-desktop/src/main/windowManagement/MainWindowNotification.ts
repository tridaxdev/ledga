import type { AllowedChannelIpc } from '@/common/types/AllowedChannelIpc'
import type { WindowManager } from './WindowManager'

export class MainWindowNotificationService {
    constructor(private readonly windowManager: WindowManager) {}

    notifyMainWindow<T>(channel: AllowedChannelIpc, data: T): void {
        const window = this.windowManager.getMainWindow()
        if (!window) return
        window.webContents.send(channel, data)
    }
}
