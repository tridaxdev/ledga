import { useContext } from "react"
import { AssetsContext } from "./AssetsContext"

export const useAssets = () => {
    const context = useContext(AssetsContext)
    if (!context) {
        throw new Error("useAssets must be used within an AssetsProvider")
    }
    return context
}
