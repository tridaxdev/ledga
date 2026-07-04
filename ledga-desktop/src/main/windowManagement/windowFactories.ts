import { join } from "path"
import { BrowserWindow, app, session, shell } from "electron"
import { cleanUserAgent } from "@/common/utils/window"

export function createMainWindow(appName: string): BrowserWindow {
    const rendererUrl = process.env["ELECTRON_RENDERER_URL"]

    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 1020,
        minWidth: 640,
        show: true,
        ...(process.platform === "darwin"
            ? {
                  titleBarStyle: "hidden",
                  trafficLightPosition: { x: 16, y: 10 }
              }
            : process.platform === "win32"
              ? {
                    titleBarStyle: "default",
                    autoHideMenuBar: true
                }
              : {}),
        backgroundColor: "#ffffff",
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: join(app.getAppPath(), "dist/preload/index.js")
        }
    })

    if (!app.isPackaged && rendererUrl) {
        mainWindow.webContents.openDevTools({ mode: "detach" })
        mainWindow.loadURL(rendererUrl)
    } else {
        mainWindow.loadFile(join(app.getAppPath(), "dist/renderer/index.html"))
    }
    const userAgent = session.defaultSession.getUserAgent()
    mainWindow.webContents.setUserAgent(cleanUserAgent(appName, userAgent))
    mainWindow.webContents.on("will-navigate", (event, url) => {
        if (!event.isMainFrame) {
            event.preventDefault()
            if (url.startsWith("http://") || url.startsWith("https://")) {
                shell.openExternal(url)
            }

            return
        }

        if (rendererUrl && url.startsWith(rendererUrl)) {
            return
        }
        if (url.startsWith("http://") || url.startsWith("https://")) {
            event.preventDefault()
            shell.openExternal(url)
        }
    })

    mainWindow.webContents.setWindowOpenHandler(({ url: urlString }) => {
        const url = new URL(urlString)
        if (rendererUrl && url.origin === new URL(rendererUrl).origin) {
            return { action: "allow" }
        }
        if (url.protocol === "http:" || url.protocol === "https:") {
            shell.openExternal(url.toString())
        }
        return { action: "deny" }
    })

    return mainWindow
}

export function createAuthWindow(appName: string): BrowserWindow {
    const authWindow = new BrowserWindow({
        width: 400,
        height: 600,
        modal: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        show: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true
        }
    })

    if (!process.env.APP_WEBSITE_BASE) {
        throw new Error("APP_WEBSITE_BASE environment variable is required")
    }
    const userAgent = session.defaultSession.getUserAgent()
    authWindow.webContents.setUserAgent(cleanUserAgent(appName, userAgent))
    authWindow.loadURL(`${process.env.APP_WEBSITE_BASE}/login.html`)

    authWindow.webContents.on("will-navigate", (event, url) => {
        if (url.startsWith("pylehound://")) {
            event.preventDefault()
            // Emit the open-url event to trigger the existing deeplink handler
            app.emit("open-url", event, url)
        }
    })

    return authWindow
}
