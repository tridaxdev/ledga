import { dialog } from "electron"
import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc"
import { ResultFactory } from "@/common/types/Result"
import { registerIpcHandler } from "../ipc/registerIpcHandler"
import type { CsvImportService } from "./CsvImportService"

export function setupIpcHandlersForCsvImport(csvImportService: CsvImportService): void {
    registerIpcHandler(AllowedChannelIpc.CsvImport, (_, ...args) => {
        const filePath = args[0] as string
        // Belt-and-braces on top of the drop zone's own .csv check and the browse dialog's file
        // filter: some OS file pickers let a user type/paste an arbitrary path or switch to "All
        // files", bypassing the extension filter.
        if (!filePath.toLowerCase().endsWith(".csv")) {
            return ResultFactory.error(new Error("Please choose a .csv file"))
        }
        return ResultFactory.success(csvImportService.importFile(filePath))
    })

    registerIpcHandler(AllowedChannelIpc.CsvBrowseFile, async () => {
        const result = await dialog.showOpenDialog({
            properties: ["openFile"],
            filters: [{ name: "CSV files", extensions: ["csv"] }]
        })
        if (result.canceled || result.filePaths.length === 0) {
            return ResultFactory.success(null)
        }
        return ResultFactory.success(result.filePaths[0])
    })
}
