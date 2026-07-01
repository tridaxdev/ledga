import { Info, CheckCircle, AlertTriangle, XCircle } from "lucide-react"
import type { AlertType } from "../types/AlertType"

interface AlertIconProps {
    readonly type: AlertType
    readonly className?: string
}

export default function AlertIcon({ type, className }: AlertIconProps) {
    const iconSize = 20
    const baseClasses = className || ""

    switch (type) {
        case "info":
            return (
                <Info
                    size={iconSize}
                    className={`
                      text-blue-600
                      ${baseClasses}
                    `}
                    aria-hidden="true"
                />
            )
        case "success":
            return (
                <CheckCircle
                    size={iconSize}
                    className={`
                      text-green-600
                      ${baseClasses}
                    `}
                    aria-hidden="true"
                />
            )
        case "warning":
            return (
                <AlertTriangle
                    size={iconSize}
                    className={`
                      text-amber-600
                      ${baseClasses}
                    `}
                    aria-hidden="true"
                />
            )
        case "error":
            return (
                <XCircle
                    size={iconSize}
                    className={`
                      text-red-600
                      ${baseClasses}
                    `}
                    aria-hidden="true"
                />
            )
        default:
            return (
                <Info
                    size={iconSize}
                    className={`
                      text-blue-600
                      ${baseClasses}
                    `}
                    aria-hidden="true"
                />
            )
    }
}
