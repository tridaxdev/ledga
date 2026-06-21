import type { LedgaAPI } from "@/common/types/LedgaAPI"

export function getLedgaAPI(): LedgaAPI {
    if (typeof window !== "undefined") {
        const windowWithAPI = window as Window & { ledgaAPI?: LedgaAPI }
        if (windowWithAPI.ledgaAPI) {
            return windowWithAPI.ledgaAPI
        }
    }
    throw new Error("LedgaAPI is not available")
}
