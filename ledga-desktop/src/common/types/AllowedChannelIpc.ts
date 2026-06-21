export enum AllowedChannelIpc {
    AppCheckForUpdates = "app:check-for-updates",
    AppUpdateProgress = "app:update-progress",
    AppGetLanguage = "app:get-language",
    AppSetLanguage = "app:set-language",
    DebugLogsGetFiles = "debug-logs:get-files",
    DebugLogsReadFile = "debug-logs:read-file",
    DatabaseGetStats = "database:get-stats",
    DatabaseDelete = "database:delete",
    DatabaseDownloadBackup = "database:download-backup",
}

export function isAllowedChannel(channel: string): channel is AllowedChannelIpc {
    return Object.values(AllowedChannelIpc).includes(channel as AllowedChannelIpc)
}