import { createContext } from "react"
import type { AlertType } from "../types/AlertType"
import type { Alert, AlertAction } from "../types/Alert"

export interface ShowAlertParams {
    readonly type: AlertType
    readonly title: string
    readonly description?: string
    readonly duration?: number
    readonly action?: AlertAction
}

export type AlertParams = Omit<ShowAlertParams, "type">
export type ErrorAlertParams = Partial<Pick<ShowAlertParams, "title" | "description">> & Omit<ShowAlertParams, "type" | "title" | "description">

export interface AlertContextValue {
    readonly alerts: Alert[]
    readonly showAlert: (params: ShowAlertParams) => void
    readonly showSuccess: (params: AlertParams) => void
    readonly showError: (error: unknown, params?: ErrorAlertParams) => void
    readonly dismissAlert: (id: string) => void
}

export const AlertContext = createContext<AlertContextValue | undefined>(undefined)
