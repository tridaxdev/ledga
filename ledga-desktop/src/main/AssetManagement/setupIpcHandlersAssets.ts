import { registerIpcHandler } from "../ipc/registerIpcHandler"
import { FileProcessorRegistry } from "../FileProcessing/FileProcessorRegistry"
import type { AssetManagementService } from "./AssetManagementService"
import type {
    GetFileRequest,
    GetFilesByFolderRequest,
    GetFilesByProjectRequest,
    GetFilesByConversationRequest,
    ImportFilesRequest,
    OpenFileRequest,
    RetryFileProcessingRequest,
    DeleteAssetsRequest,
    RetryImportRequest
} from "@/common/types/FileImportTypes"
import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc"
import { ResultFactory } from "@/common/types/Result"

export function setupIpcHandlersAssets(assetService: AssetManagementService) {
    registerIpcHandler(AllowedChannelIpc.AssetsGetById, async (_, ...args) => {
        const request = args[0] as GetFileRequest
        return ResultFactory.from(assetService.getAssetById(request.id))
    })
    registerIpcHandler(AllowedChannelIpc.AssetsGetByFolder, async (_, ...args) => {
        const request = args[0] as GetFilesByFolderRequest
        return ResultFactory.from(assetService.getAssetsByFolder(request.folderId))
    })
    registerIpcHandler(AllowedChannelIpc.AssetsGetByProject, async (_, ...args) => {
        const request = args[0] as GetFilesByProjectRequest
        return ResultFactory.from(assetService.getAssetsByProject(request.projectId))
    })
    registerIpcHandler(AllowedChannelIpc.AssetsImportFiles, async (_, ...args) => {
        const request = args[0] as ImportFilesRequest
        return ResultFactory.from(assetService.importFiles(request))
    })
    registerIpcHandler(AllowedChannelIpc.AssetsImportFilesRetryFailed, async (_, ...args) => {
        const request = args[0] as RetryImportRequest
        return ResultFactory.from(assetService.retryAllFailedFilesImport(request))
    })
    registerIpcHandler(AllowedChannelIpc.AssetsGetSupportedTypes, async () => {
        return ResultFactory.from(Promise.resolve(FileProcessorRegistry.getSupportedExtensions()))
    })
    registerIpcHandler(AllowedChannelIpc.AssetsOpenBackup, async (_, ...args) => {
        const request = args[0] as OpenFileRequest
        return ResultFactory.from(assetService.openFile(request))
    })
    registerIpcHandler(AllowedChannelIpc.AssetsRetryProcessing, async (_, ...args) => {
        const request = args[0] as RetryFileProcessingRequest
        return ResultFactory.from(assetService.retryFileProcessing(request.fileId))
    })
    registerIpcHandler(AllowedChannelIpc.AssetsDelete, async (_, ...args) => {
        const request = args[0] as DeleteAssetsRequest
        return ResultFactory.from(assetService.deleteAssets(request.assetIds))
    })
    registerIpcHandler(AllowedChannelIpc.AssetsGetFilesByConversation, async (_, ...args) => {
        const request = args[0] as GetFilesByConversationRequest
        return ResultFactory.from(assetService.getAccessibleFilesForConversation(request.conversationId))
    })
}
