export type InstallMode = "per-machine" | "per-user" | "unknown"

export interface InstallPolicies {
    readonly autoUpdate: boolean
}

export interface InstallInfo {
    readonly installDir: string
    readonly installMode: InstallMode
    readonly policies: InstallPolicies
}

export const DEFAULT_INSTALL_POLICIES: InstallPolicies = {
    autoUpdate: true
}

export interface AppInstallation {
    currentVersion: string
    buildNumber: string
    environment: string
    releaseTrack: "alpha" | "beta" | "latest"
    installMode: InstallMode
    autoUpdateEnabled: boolean
}

export enum DownloadStatus {
    Idle = "idle",
    Downloading = "downloading",
    Downloaded = "downloaded",
    Installing = "installing"
}

export interface UpdateDownloadInfo {
    status: DownloadStatus
    progress?: {
        percent: number
        transferred: number
        total: number
    }
}

export interface UpdateCheckResult {
    latestVersion: string
    updateAvailable: boolean
    download: UpdateDownloadInfo
}

export type UpdateProgressCallback = (download: UpdateDownloadInfo) => void