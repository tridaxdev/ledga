import { useMemo, useCallback } from "react"
import { getPyleAPI } from "../hooks/apiClient"
import { useAlert } from "../AlertFeature/hooks/useAlert"
import { useFileRetry } from "./useFileRetry"
import type { PyleHoundAsset } from "@/common/types/ProjectTypes"

export interface AssetsActions {
    importFiles: (files: File[], folderId?: string) => Promise<PyleHoundAsset[]>
    deleteAssets: (assetIds: string[]) => Promise<void>
    retryProcessing: (fileId: string) => Promise<void>
}

export function useAssetActions(projectId: string): AssetsActions {
    const { showError } = useAlert()
    const api = getPyleAPI()
    const { retryProcessing } = useFileRetry()

    const importFiles = useCallback(
        async (files: File[], folderId?: string): Promise<PyleHoundAsset[]> => {
            try {
                const importRequests = files.map(file => ({
                    fileName: file.webkitRelativePath || file.name,
                    source: { provider: "local" as const, path: api.assets.getFilePath(file) },
                    folderId
                }))
                const result = await api.assets.importFiles({ projectId, files: importRequests })

                if (result.kind !== "success") {
                    throw result.error
                }

                return result.value
            } catch (error) {
                showError(error)
                throw error
            }
        },
        [api.assets, projectId, showError]
    )

    const deleteAssets = useCallback(
        async (assetIds: string[]) => {
            try {
                const result = await api.assets.deleteAssets({ assetIds, projectId })

                if (result.kind !== "success") {
                    throw result.error
                }
            } catch (error) {
                showError(error)
                throw error
            }
        },
        [api.assets, projectId, showError]
    )

    return useMemo(
        () => ({
            importFiles,
            deleteAssets,
            retryProcessing
        }),
        [deleteAssets, importFiles, retryProcessing]
    )
}
