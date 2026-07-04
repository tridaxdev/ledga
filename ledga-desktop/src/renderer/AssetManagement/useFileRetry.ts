import { useCallback } from "react"
import { getPyleAPI } from "../hooks/apiClient"
import { useAlert } from "../AlertFeature/hooks/useAlert"

export function useFileRetry() {
    const { showError } = useAlert()
    const api = getPyleAPI()

    const retryProcessing = useCallback(
        async (fileId: string) => {
            try {
                const result = await api.assets.retryProcessing({ fileId })
                if (result.kind !== "success") {
                    throw result.error
                }
            } catch (error) {
                showError(error)
                throw error
            }
        },
        [api.assets, showError]
    )

    return { retryProcessing }
}
