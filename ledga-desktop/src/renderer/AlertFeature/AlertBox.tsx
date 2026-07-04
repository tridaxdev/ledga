import { useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import AlertIcon from "./components/AlertIcon"
import AlertCloseButton from "./components/AlertCloseButton"
import type { Alert } from "./types/Alert"
import type { AlertType } from "./types/AlertType"

interface AlertBoxProps {
    readonly alert: Alert
    readonly onDismiss: (id: string) => void
}

function getAlertStyles(type: AlertType): string {
    switch (type) {
        case "info":
            return "bg-blue-50 border-blue-200"
        case "success":
            return "bg-green-50 border-green-200"
        case "warning":
            return "bg-amber-50 border-amber-200"
        case "error":
            return "bg-red-50 border-red-200"
        default:
            return "bg-blue-50 border-blue-200"
    }
}

function getButtonStyles(type: AlertType): string {
    switch (type) {
        case "info":
            return "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"
        case "success":
            return "bg-green-600 hover:bg-green-700 focus:ring-green-500"
        case "warning":
            return "bg-amber-600 hover:bg-amber-700 focus:ring-amber-500"
        case "error":
            return "bg-red-600 hover:bg-red-700 focus:ring-red-500"
        default:
            return "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"
    }
}

function getProgressBarColor(type: AlertType): string {
    switch (type) {
        case "info":
            return "bg-blue-500"
        case "success":
            return "bg-green-500"
        case "warning":
            return "bg-amber-500"
        case "error":
            return "bg-red-500"
        default:
            return "bg-blue-500"
    }
}

export const DEFAULT_ALERT_DURATION = 7000

export default function AlertBox({ alert, onDismiss }: AlertBoxProps) {
    const navigate = useNavigate()
    const [progress, setProgress] = useState(100)

    const handleDismiss = () => {
        onDismiss(alert.id)
    }

    useEffect(() => {
        const duration = alert.duration
        if (!duration || duration <= 0) {
            return
        }

        const interval = 50 // Update every 50ms
        const step = (interval / duration) * 100

        const timer = setInterval(() => {
            setProgress(prev => {
                const newProgress = prev - step
                if (newProgress <= 0) {
                    clearInterval(timer)
                    onDismiss(alert.id)
                    return 0
                }
                return newProgress
            })
        }, interval)

        return () => clearInterval(timer)
    }, [alert.duration, alert.id, onDismiss])

    const handleAction = () => {
        if (alert.action?.onClick) {
            alert.action.onClick()
        } else if (alert.action?.href) {
            navigate({ to: alert.action.href })
        }
        handleDismiss()
    }

    return (
        <div
            className={`
              relative flex items-start gap-2 overflow-hidden rounded-lg border
              p-3 shadow-sm
              ${getAlertStyles(alert.type)}
            `}
            role="alert"
            aria-live="polite"
        >
            <AlertIcon type={alert.type} />

            <div className="min-w-0 flex-1">
                <h4 className={`text-sm font-semibold text-gray-900`}>{alert.title}</h4>
                {alert.description && (
                    <p
                        className={`
                  mt-0.5 text-xs text-gray-700
                `}
                    >
                        {alert.description}
                    </p>
                )}
                {alert.action && (
                    <button
                        onClick={handleAction}
                        className={`
                          mt-1 cursor-pointer rounded-md border
                          border-transparent px-2 py-1 text-xs font-medium
                          text-white transition-colors
                          focus:ring-2 focus:outline-none
                          ${getButtonStyles(alert.type)}
                        `}
                    >
                        {alert.action.label}
                    </button>
                )}
            </div>

            <AlertCloseButton onClick={handleDismiss} />

            <div className="absolute bottom-0 left-0 h-1 w-full bg-gray-300">
                <div
                    className={`
                      h-full
                      ${getProgressBarColor(alert.type)}
                      transition-all duration-75 ease-linear
                    `}
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
    )
}
