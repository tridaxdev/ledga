export enum AppConfigKey {
    IS_LEGAL_GROUNDING_ENABLED = "isLegalGroundingEnabled",
    IS_DATA_ROOMS_ENABLED = "isDataRoomsEnabled",
    IS_AUTOMATION_DEBUGGING_ENABLED = "isAutomationDebuggingEnabled"
}

export type AppConfigValue = boolean | string | number

export type RemoteConfig = {
    [key in AppConfigKey]: AppConfigValue | null
}

export type LocalOverrides = {
    [key in AppConfigKey]: AppConfigValue | null
}

export type AppConfig = {
    [key in AppConfigKey]: AppConfigValue
}

export interface DetailedAppConfigEntry {
    remote: AppConfigValue | null
    local: AppConfigValue | null
    effective: AppConfigValue
}

export type DetailedAppConfig = {
    [key in AppConfigKey]: DetailedAppConfigEntry
}

export interface AppConfigResponse {
    config: AppConfig
    detailed: DetailedAppConfig
}

export interface SetAppConfigRequest {
    key: AppConfigKey
    value: AppConfigValue
}

export const DEFAULT_APP_CONFIG: AppConfig = {
    [AppConfigKey.IS_LEGAL_GROUNDING_ENABLED]: false,
    [AppConfigKey.IS_DATA_ROOMS_ENABLED]: false,
    [AppConfigKey.IS_AUTOMATION_DEBUGGING_ENABLED]: false
}

export const DEFAULT_LOCAL_OVERRIDES: LocalOverrides = {
    [AppConfigKey.IS_LEGAL_GROUNDING_ENABLED]: null,
    [AppConfigKey.IS_DATA_ROOMS_ENABLED]: null,
    [AppConfigKey.IS_AUTOMATION_DEBUGGING_ENABLED]: null
}

export const DEFAULT_REMOTE_CONFIG: RemoteConfig = {
    [AppConfigKey.IS_LEGAL_GROUNDING_ENABLED]: null,
    [AppConfigKey.IS_DATA_ROOMS_ENABLED]: null,
    [AppConfigKey.IS_AUTOMATION_DEBUGGING_ENABLED]: null
}
