import React, { useState, useEffect, useCallback } from "react"
import type { PyleHoundAsset } from "../../common/types/ProjectTypes"
import { getLedgaAPI } from "../hooks/apiClient"
import type { AssetsContextType } from "./AssetsContext"
import { AssetsContext } from "./AssetsContext"

interface AssetsProviderProps {
    projectId: string
    children: React.ReactNode
}

export function AssetsProvider({ projectId, children }: AssetsProviderProps) {
    const [assets, setAssets] = useState<PyleHoundAsset[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const api = getLedgaAPI()

    const fetchAssets = useCallback(async () => {
        if (!projectId) {
            setAssets([])
            return
        }

        try {
            setIsLoading(true)
            const result = await api.assets.getByProject({ projectId })

            if (result.kind === "success") {
                setAssets(result.value)
                setError(null)
            } else {
                setError(result.error.message)
                setAssets([])
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load assets")
            setAssets([])
        } finally {
            setIsLoading(false)
        }
    }, [api.assets, projectId])

    useEffect(() => {
        fetchAssets()
    }, [fetchAssets])

    const sortAssets = useCallback((assetsList: PyleHoundAsset[]) => {
        return [...assetsList].sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === "folder" ? -1 : 1
            }
            return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
        })
    }, [])

    useEffect(() => {
        return api.assets.onAssetCreated(event => {
            const { asset } = event
            // Only add if it belongs to this project
            if (asset.projectId === projectId) {
                setAssets(prevAssets => sortAssets([...prevAssets, asset]))
            }
        })
    }, [api.assets, projectId, sortAssets])

    useEffect(() => {
        return api.assets.onAssetUpdated(event => {
            const { asset } = event
            if (asset.projectId === projectId) {
                setAssets(prevAssets => sortAssets(prevAssets.map(a => (a.id === asset.id ? asset : a))))
            }
        })
    }, [api.assets, projectId, sortAssets])

    useEffect(() => {
        return api.assets.onAssetDeleted(event => {
            const { assetId, projectId: eventProjectId } = event
            if (eventProjectId !== projectId) {
                return
            }

            setAssets(prevAssets => {
                const idsToRemove = new Set<string>([assetId])
                const childrenByParent = prevAssets.reduce<Map<string, string[]>>((map, asset) => {
                    if (!asset.parentId) {
                        return map
                    }
                    const siblings = map.get(asset.parentId) || []
                    siblings.push(asset.id)
                    map.set(asset.parentId, siblings)
                    return map
                }, new Map())

                const queue: string[] = [assetId]
                while (queue.length > 0) {
                    const current = queue.shift()
                    if (!current) {
                        continue
                    }
                    const children = childrenByParent.get(current) || []
                    for (const childId of children) {
                        if (!idsToRemove.has(childId)) {
                            idsToRemove.add(childId)
                            queue.push(childId)
                        }
                    }
                }

                return prevAssets.filter(a => !idsToRemove.has(a.id))
            })
        })
    }, [api.assets, projectId])

    const contextValue: AssetsContextType = {
        data: assets,
        isLoading,
        error
    }

    return <AssetsContext.Provider value={contextValue}>{children}</AssetsContext.Provider>
}
