import type { WindowManager } from "../windowManagement/WindowManager"
import { MainWindowNotificationService } from "../windowManagement/MainWindowNotificationService"
import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc"
import type { PyleHoundAsset, AssetUpsertedEvent, AssetDeletedEvent } from "@/common/types/ProjectTypes"

export class AssetRendererNotificationService extends MainWindowNotificationService {
    constructor(windowManager: WindowManager) {
        super(windowManager)
    }

    assetCreated(asset: PyleHoundAsset) {
        const event: AssetUpsertedEvent = {
            asset
        }
        this.notifyMainWindow(AllowedChannelIpc.AssetCreateStream, event)
    }

    assetUpdated(asset: PyleHoundAsset) {
        const event: AssetUpsertedEvent = {
            asset
        }
        this.notifyMainWindow(AllowedChannelIpc.AssetUpdateStream, event)
    }

    assetDeleted(assetId: string, projectId: string) {
        const event: AssetDeletedEvent = {
            assetId,
            projectId
        }
        this.notifyMainWindow(AllowedChannelIpc.AssetDeleteStream, event)
    }
}
