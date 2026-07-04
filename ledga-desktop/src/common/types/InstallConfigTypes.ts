export type InstallMode = "per-machine" | "per-user" | "unknown"

export type ReleaseTrack = "alpha" | "beta" | "latest"

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
