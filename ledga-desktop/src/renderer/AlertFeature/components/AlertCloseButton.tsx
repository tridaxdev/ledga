import { X } from "lucide-react"
import { useTranslation } from "react-i18next"

interface AlertCloseButtonProps {
    readonly onClick: () => void
}

export default function AlertCloseButton({ onClick }: AlertCloseButtonProps) {
    const { t } = useTranslation()

    return (
        <button
            type="button"
            onClick={onClick}
            className={`
              cursor-pointer rounded-md p-1 transition-colors
              hover:bg-gray-100
              focus:ring-2 focus:ring-gray-300 focus:outline-none
            `}
            aria-label={t("alert.close.label")}
        >
            <X size={16} className="text-gray-500" aria-hidden="true" />
        </button>
    )
}
