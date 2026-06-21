import type { BrowserWindow } from "electron";
import type {Logger} from "../logging/FileLogger"
import { createMainWindow, createAuthWindow} from "./windowFactories"

export class WindowManager {
    private appName: string 
    private mainWindow: BrowserWindow | null = null
    private authWindow: BrowserWindow | null = null

    constructor(appName: string, private logger: Logger) {
        this.appName = appName
    }

    showAuthWindow(): BrowserWindow {
        if (this.authWindow && !this.authWindow.isDestroyed()) {
            this.authWindow.focus()
            return this.authWindow
        }

        this.logger.info("WindowManager: Creating auth window")
        this.authWindow = createAuthWindow(this.appName)

        this.authWindow.on("closed", () => {
            this.authWindow = null
            this.logger.info("WindowManager: Auth window closed")
        })

        return this.authWindow
    }

    showMainWindow(appName: string): BrowserWindow {
        this.closeAuthWindow()

        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.focus()
            return this.mainWindow
        }

        this.logger.info("WindowManager: Creating main window")
        this.mainWindow = createMainWindow(appName)
        this.allowCORS(this.mainWindow, ["https://www.pylehound.com/_content/*"])

        this.mainWindow.on("closed", () => {
            this.mainWindow = null
            this.logger.info("WindowManager: Main window closed")
        })

        return this.mainWindow
    }

    /**
     * Sets up CORS headers for the specified window to allow requests from the given URLs (in renderer)
     *
     * @param window - The BrowserWindow instance to configure CORS for
     * @param allowedUrls - Array of URL patterns to allow CORS requests from.
     *                      Supports wildcard patterns using "*" at the end of URLs.
     *                      Example: "https://example.com/a/*" will match all URLs
     *                      starting with "https://example.com/a/" including
     *                      "https://example.com/a/page1", "https://example.com/a/deep/path", etc.
     */
    private allowCORS(window: BrowserWindow, allowedUrls: string[]): void {
        window.webContents.session.webRequest.onHeadersReceived({ urls: allowedUrls }, (details, callback) => {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    "Access-Control-Allow-Origin": ["*"]
                }
            })
        })
    }

    closeAuthWindow(): void {
        if (this.authWindow && !this.authWindow.isDestroyed()) {
            this.logger.info("WindowManager: Closing auth window")
            this.authWindow.close()
            this.authWindow = null
        }
    }

    closeMainWindow(): void {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.logger.info("WindowManager: Closing main window")
            this.mainWindow.close()
            this.mainWindow = null
        }
    }

    focusMainWindow(): void {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            if (this.mainWindow.isMinimized()) {
                this.mainWindow.restore()
            }
            this.mainWindow.focus()
        }
    }

    hasMainWindow(): boolean {
        return this.mainWindow !== null && !this.mainWindow.isDestroyed()
    }

    hasAuthWindow(): boolean {
        return this.authWindow !== null && !this.authWindow.isDestroyed()
    }

    getMainWindow(): BrowserWindow | null {
        return this.hasMainWindow() ? this.mainWindow : null
    }

    getAuthWindow(): BrowserWindow | null {
        return this.hasAuthWindow() ? this.authWindow : null
    }
}