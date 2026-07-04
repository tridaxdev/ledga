import type { DatabaseDebugService } from "../DebugService/DatabaseDebugService"
import type { DebugService } from "../DebugService/DebugService"
import { registerIpcHandler } from "./registerIpcHandler"
import type { ReadLogFileRequest } from "@/common/types/DebugTypes"
import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc"

export function setupIpcHandlers(debugService: DebugService, databaseDebugService: DatabaseDebugService) {
    registerIpcHandler(AllowedChannelIpc.DebugLogsGetFiles, () => debugService.getLogFiles())
    registerIpcHandler(AllowedChannelIpc.DebugLogsReadFile, (_, ...args) => {
        const request = args[0] as ReadLogFileRequest
        return debugService.readLogFile(request.filePath, request.level)
    })

    registerIpcHandler(AllowedChannelIpc.DatabaseGetStats, () => databaseDebugService.getStats())
    registerIpcHandler(AllowedChannelIpc.DatabaseDelete, () => databaseDebugService.deleteDatabase())
    registerIpcHandler(AllowedChannelIpc.DatabaseDownloadBackup, () => databaseDebugService.downloadBackup())
}
