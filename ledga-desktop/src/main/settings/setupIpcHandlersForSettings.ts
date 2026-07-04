import * as fs from "node:fs"
import { dialog, shell } from "electron"
import { registerIpcHandler } from "../ipc/registerIpcHandler"
import type { DatabaseManager } from "../Database/DatabaseManager"
import type { Logger } from "../logging/FileLogger"
import type { TransactionRepository } from "../transactions/TransactionRepository"
import type { CategoryRepository } from "../categories/CategoryRepository"
import { ResultFactory } from "@/common/types/Result"
import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc"

function csvEscape(value: string): string {
    if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
    return value
}

export function setupIpcHandlersForSettings(
    databaseManager: DatabaseManager,
    transactionRepository: TransactionRepository,
    categoryRepository: CategoryRepository,
    dbPath: string,
    logger: Logger
): void {
    registerIpcHandler(AllowedChannelIpc.SettingsRevealDb, () => {
        shell.showItemInFolder(dbPath)
        return ResultFactory.success(undefined)
    })

    registerIpcHandler(AllowedChannelIpc.SettingsGetDbPath, () => {
        return ResultFactory.success(dbPath)
    })

    registerIpcHandler(AllowedChannelIpc.SettingsExportCsv, async () => {
        const result = await dialog.showSaveDialog({
            defaultPath: "ledga-transactions.csv",
            filters: [{ name: "CSV", extensions: ["csv"] }]
        })
        if (result.canceled || !result.filePath) {
            return ResultFactory.success(null)
        }

        const categoryNameById = new Map(categoryRepository.findAll().map(c => [c.id, c.name]))
        const rows = transactionRepository.findAll({})
        const header = ["Date", "Merchant", "Bank", "Type", "Amount", "Currency", "Category", "Source", "Reference"]
        const lines = [header.join(",")]
        for (const row of rows) {
            const date = new Date(row.timestamp * 1000).toISOString().slice(0, 10)
            lines.push(
                [
                    date,
                    csvEscape(row.merchant),
                    csvEscape(row.bank),
                    row.type,
                    String(row.amount),
                    row.currency,
                    csvEscape(row.category_id ? (categoryNameById.get(row.category_id) ?? "") : ""),
                    row.source,
                    csvEscape(row.bank_reference)
                ].join(",")
            )
        }

        fs.writeFileSync(result.filePath, lines.join("\n"), "utf-8")
        logger.info("Exported transactions to CSV", { filePath: result.filePath, count: rows.length })
        return ResultFactory.success(result.filePath)
    })

    registerIpcHandler(AllowedChannelIpc.SettingsClearData, () => {
        databaseManager.executeQuery("DELETE FROM chat_messages")
        databaseManager.executeQuery("DELETE FROM chats")
        databaseManager.executeQuery("DELETE FROM transactions")
        databaseManager.executeQuery("DELETE FROM emails")
        logger.info("Cleared all local data")
        return ResultFactory.success(undefined)
    })
}
