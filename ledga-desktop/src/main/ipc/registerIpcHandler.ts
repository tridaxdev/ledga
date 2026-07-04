import { ipcMain } from "electron"
import { isAllowedChannel, type AllowedChannelIpc } from "../../common/types/AllowedChannelIpc"

export function registerIpcHandler<T extends AllowedChannelIpc>(channel: T, handler: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> | unknown): void {
    if (!isAllowedChannel(channel)) {
        throw new Error(`Attempted to register disallowed channel: ${channel}`)
    }

    ipcMain.handle(channel, handler)
}

export function registerIpcListener<T extends AllowedChannelIpc>(channel: T, handler: (event: Electron.IpcMainEvent, ...args: unknown[]) => void): void {
    if (!isAllowedChannel(channel)) {
        throw new Error(`Attempted to register disallowed channel: ${channel}`)
    }

    ipcMain.on(channel, handler)
}
