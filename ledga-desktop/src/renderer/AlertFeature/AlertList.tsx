import { useTranslation } from "react-i18next"
import AlertBox from "./AlertBox"
import { useAlert } from "./hooks/useAlert"

export default function AlertList() {
    const { t } = useTranslation()
    const { alerts, dismissAlert } = useAlert()

    if (alerts.length === 0) {
        return null
    }

    return (
        <div
            className="
              pointer-events-none fixed top-4 right-4 z-60 flex w-full max-w-sm
              flex-col gap-3
            "
            aria-live="polite"
            aria-label={t("aria_labels.notifications")}
        >
            {alerts.map(alert => (
                <div
                    key={alert.id}
                    className="
                      pointer-events-auto animate-in duration-300
                      ease-out fade-in slide-in-from-right-full
                    "
                >
                    <AlertBox alert={alert} onDismiss={dismissAlert} />
                </div>
            ))}
        </div>
    )
}
