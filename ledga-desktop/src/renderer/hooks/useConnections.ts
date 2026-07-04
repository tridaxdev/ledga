import { useState, useEffect, useCallback } from 'react'
import { getLedgaAPI } from './apiClient'
import type { Connection } from '@/common/types/Connection'
import type { Result } from '@/common/types/Result'

export function useConnections() {
    const [connections, setConnections] = useState<Connection[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<Error | null>(null)

    const refetch = useCallback(async () => {
        setIsLoading(true)
        try {
            const result = await getLedgaAPI().connections.getAll()
            if (result.kind === 'success') {
                setConnections(result.value)
                setError(null)
            } else {
                setError(result.error)
            }
        } catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)))
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        refetch()
    }, [refetch])

    useEffect(() => {
        return getLedgaAPI().connections.onOAuthCompleted(() => {
            refetch()
        })
    }, [refetch])

    const startOAuth = useCallback((): Promise<Result<{ flowId: string; email: string }, Error>> => {
        return getLedgaAPI().connections.startOAuth()
    }, [])

    const cancelOAuth = useCallback((flowId?: string): Promise<Result<void, Error>> => {
        return getLedgaAPI().connections.cancelOAuth(flowId)
    }, [])

    const finalize = useCallback((flowId: string, autoSync: boolean): Promise<Result<Connection, Error>> => {
        return getLedgaAPI().connections.finalize(flowId, autoSync)
    }, [])

    const disconnect = useCallback(async (id: string): Promise<Result<void, Error>> => {
        const result = await getLedgaAPI().connections.disconnect(id)
        if (result.kind === 'success') {
            setConnections(prev => prev.filter(c => c.id !== id))
        }
        return result
    }, [])

    const syncNow = useCallback(async (id: string): Promise<Result<{ newCount: number }, Error>> => {
        return getLedgaAPI().connections.syncNow(id)
    }, [])

    const setAutoSync = useCallback(async (id: string, autoSync: boolean): Promise<Result<Connection | null, Error>> => {
        const result = await getLedgaAPI().connections.update(id, { auto_sync: autoSync })
        if (result.kind === 'success') {
            setConnections(prev => prev.map(c => (c.id === id ? { ...c, auto_sync: autoSync } : c)))
        }
        return result
    }, [])

    return { connections, isLoading, error, refetch, startOAuth, cancelOAuth, finalize, disconnect, syncNow, setAutoSync }
}
