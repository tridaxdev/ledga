import * as path from "path"
import { app, dialog } from "electron"
import { WindowManager } from "./windowManagement/WindowManager"
import { FileLogger } from "./logging/FileLogger"
import type { DatabaseManager } from "./Database/DatabaseManager"
import { initializeI18next } from "./i18n/i18nextBackend"
import { DatabaseLoader } from "./Database/DatabaseLoader"
import { DatabaseManagerFactory } from "./Database/DatabaseManagerFactory"
import { DebugService } from "./DebugService/DebugService"
import { DatabaseDebugService } from "./DebugService/DatabaseDebugService"
import { setupIpcHandlers } from "./ipc/setupIpcHandlers"

const loggerPath = path.join(app.getPath("userData"), "logs")
const logger = new FileLogger(loggerPath, "debug")
const windowManager = new WindowManager(app.getName(), logger)
const isSingleInstance = app.requestSingleInstanceLock()
let databaseManager: DatabaseManager | null = null

if(!isSingleInstance) {
    logger.error("Instance of pylehound is already running, Quitting...")
    app.quit()
} else {
    app.on("second-instance", () => {
        windowManager.focusMainWindow()
    })

    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") {
            app.quit()
        }
    })

    app.on("activate", () => {
        windowManager.showMainWindow(app.getName());
    })

    process.on("SIGTERM", () => {
        logger.info("Received SIGTERM, initiating app quit...")
        app.quit()
    })

    process.on("SIGINT", () => {
        logger.info("Received SIGINT (Ctrl+C), initiating app quit...")
        app.quit()
    })

    app.whenReady()
        .then(async () => {
            await initializeI18next(logger)
            const userDataPath = app.getPath("userData")
            const dbPath = DatabaseLoader.databasePath(userDataPath)
            databaseManager = await DatabaseManagerFactory.create(logger, userDataPath)

            const debugService = new DebugService(path.join(app.getPath("userData"), "logs"), logger)
            const databaseDebugService = new DatabaseDebugService(databaseManager, dbPath, logger)

            setupIpcHandlers(
                debugService,
                databaseDebugService
            )
        })
        .catch(async error => {
            logger.error("Fatal error during application startup:", error)
            await dialog.showMessageBox({
                type: "error",
                title: "PyleHound failed to start",
                message: "A fatal error occurred during startup.",
                detail: error instanceof Error ? error.message : String(error)
            })
            app.quit()
        })
}