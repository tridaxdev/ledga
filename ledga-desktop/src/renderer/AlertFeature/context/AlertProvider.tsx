import { useState, useCallback, useEffect, useMemo } from "react"
import { useRouter } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { v4 as uuid } from "uuid"
import type { Alert } from "../types/Alert"
import { DEFAULT_ALERT_DURATION } from "../AlertBox"
import type { AlertContextValue, AlertParams, ErrorAlertParams, ShowAlertParams } from "./AlertContext"
import { AlertContext } from "./AlertContext"
import { getPyleAPI } from "@/renderer/hooks/apiClient"
import { parseError } from "@/renderer/utils/errorParser"

interface AlertProviderProps {
    readonly children: React.ReactNode
}

export default function AlertProvider({ children }: AlertProviderProps) {
    const [alerts, setAlerts] = useState<Alert[]>([])
    const router = useRouter()
    const { t } = useTranslation()

    const dismissAlert = useCallback((id: string) => {
        setAlerts(prev => prev.filter(alert => alert.id !== id))
    }, [])

    const showAlert = useCallback(
        (params: ShowAlertParams) => {
            if (router.state.location.pathname === params.action?.href) {
                return
            }

            const alert: Alert = {
                id: uuid(),
                type: params.type,
                title: params.title,
                description: params.description,
                duration: params.duration ?? DEFAULT_ALERT_DURATION,
                action: params.action
            }

            setAlerts(prev => [...prev, alert])
        },
        [router]
    )

    const showSuccess = useCallback(
        (params: AlertParams) => {
            showAlert({
                type: "success",
                ...params
            })
        },
        [showAlert]
    )

    const showError = useCallback(
        (error: unknown, params: ErrorAlertParams = {}) => {
            const parsedError = parseError(error)
            const errorMessage = parsedError.message

            showAlert({
                type: "error",
                title: params.title ?? t("fallback_ui.error_boundary.generic_error_title"),
                description: params.description ?? errorMessage,
                duration: params.duration,
                action: params.action
            })
        },
        [showAlert, t]
    )

    useEffect(() => {
        const api = getPyleAPI()
        const unsubscribe = api.app.onShowAlert(alert => {
            showAlert(alert)
        })

        return unsubscribe
    }, [showAlert])

    const contextValue: AlertContextValue = useMemo(
        () => ({
            alerts,
            showAlert,
            showSuccess,
            showError,
            dismissAlert
        }),
        [alerts, showAlert, showSuccess, showError, dismissAlert]
    )

    return <AlertContext.Provider value={contextValue}>{children}</AlertContext.Provider>
}
