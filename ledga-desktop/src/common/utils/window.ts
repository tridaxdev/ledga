import type { App } from "electron"
import path from "path"

export function cleanUserAgent(appName: string, userAgent: string): string {
    return userAgent
        .replace(new RegExp(`${appName}-Helper\\/[\\d.]+ `), "")
        .replace(new RegExp(`${appName}\\/[\\d.]+ `), "")
        .replace(/Electron\/[\d.]+ /, "")
}

export function setupDeeplinkProtocol(process: NodeJS.Process, app: App) {
    if (process.defaultApp) {
        if (process.argv.length >= 2) {
            app.setAsDefaultProtocolClient(app.getName(), process.execPath, [path.resolve(process.argv[1])])
        }
    } else {
        app.setAsDefaultProtocolClient(app.getName())
    }
}