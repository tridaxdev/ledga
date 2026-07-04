import type { AlertType } from "./AlertType"

export interface AlertAction {
    readonly label: string
    readonly href?: string
    readonly onClick?: () => void
}

export interface Alert {
    readonly id: string
    readonly type: AlertType
    readonly title: string
    readonly description?: string
    readonly duration?: number
    readonly action?: AlertAction
}
