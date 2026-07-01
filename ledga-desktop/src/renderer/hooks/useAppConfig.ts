import { useContext } from "react"
import { AppConfigContext } from "./AppConfigContext"
import { AppConfigKey } from "@/common/types/AppConfigTypes"

export default function useAppConfig() {
    const context = useContext(AppConfigContext)
    if (!context) {
        throw new Error("useAppConfig must be used within an AppConfigProvider")
    }

    const { config, handleConfigChange } = context

    return {
        config,
        handleConfigChange,
        isLegalGroundingEnabled: config?.[AppConfigKey.IS_LEGAL_GROUNDING_ENABLED].effective ?? false,
        isDataRoomsEnabled: config?.[AppConfigKey.IS_DATA_ROOMS_ENABLED].effective ?? false
    }
}
