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
            if (result.success) {
                setConnections(result.data)
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

    const connect = useCallback((): Promise<Result<Connection, Error>> => {
        return getLedgaAPI().connections.connect()
    }, [])

    const disconnect = useCallback(async (id: string): Promise<Result<void, Error>> => {
        const result = await getLedgaAPI().connections.disconnect(id)
        if (result.success) {
            setConnections(prev => prev.filter(c => c.id !== id))
        }
        return result
    }, [])

    return { connections, isLoading, error, refetch, connect, disconnect }
}
