import { useState, useEffect, useCallback } from "react"
import type { HookReturn } from "./HookReturn"
import { getPyleAPI } from "./apiClient"
import type { LogFile, LogEntry, LogLevel, ReadLogFileRequest } from "@/common/types/DebugTypes"

interface DebugLogsData {
    logFiles: LogFile[]
    selectedFile: LogFile | null
    logEntries: LogEntry[]
    selectedLevel: LogLevel
    actions: DebugLogsActions
}

interface DebugLogsActions {
    setSelectedFile: (file: LogFile | null) => void
    setSelectedLevel: (level: LogLevel) => void
    refresh: () => Promise<void>
    loadLogEntries: () => Promise<void>
    openRawFile: () => Promise<void>
}

export function useDebugLogs(): HookReturn<DebugLogsData> {
    const [logFiles, setLogFiles] = useState<LogFile[]>([])
    const [selectedFile, setSelectedFile] = useState<LogFile | null>(null)
    const [logEntries, setLogEntries] = useState<LogEntry[]>([])
    const [selectedLevel, setSelectedLevel] = useState<LogLevel>("info")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const loadLogFiles = useCallback(async () => {
        try {
            setError(null)
            const pyleAPI = getPyleAPI()
            const files = await pyleAPI.debug.getLogFiles()
            setLogFiles(files)
            if (files.length > 0 && !selectedFile) {
                setSelectedFile(files[0])
            }
        } catch (err) {
            setError("Failed to load log files")
            console.error("Error loading log files:", err)
        }
    }, [selectedFile])

    const loadLogEntries = useCallback(async () => {
        if (!selectedFile) {
            return
        }

        try {
            setIsLoading(true)
            setError(null)
            const request: ReadLogFileRequest = {
                filePath: selectedFile.path,
                level: selectedLevel
            }
            const pyleAPI = getPyleAPI()
            const entries = await pyleAPI.debug.readLogFile(request)
            setLogEntries(entries)
        } catch (err) {
            setError("Failed to load log entries")
            console.error("Error loading log entries:", err)
        } finally {
            setIsLoading(false)
        }
    }, [selectedFile, selectedLevel])

    const refresh = useCallback(async () => {
        await loadLogFiles()
        if (selectedFile) {
            await loadLogEntries()
        }
    }, [loadLogFiles, loadLogEntries, selectedFile])

    const handleSetSelectedFile = useCallback((file: LogFile | null) => {
        setSelectedFile(file)
    }, [])

    const handleSetSelectedLevel = useCallback((level: LogLevel) => {
        setSelectedLevel(level)
    }, [])

    const openRawFile = useCallback(async () => {
        if (!selectedFile) {
            return
        }

        try {
            const pyleAPI = getPyleAPI()
            await pyleAPI.assets.openBackupFile({ fileUrl: selectedFile.path })
        } catch (error) {
            setError("Failed to open raw log file")
            console.error("Failed to open raw log file:", error)
        }
    }, [selectedFile])

    useEffect(() => {
        loadLogFiles()
    }, [loadLogFiles])

    useEffect(() => {
        if (selectedFile) {
            loadLogEntries()
        }
    }, [loadLogEntries, selectedFile])

    return {
        data: {
            logFiles,
            selectedFile,
            logEntries,
            selectedLevel,
            actions: {
                setSelectedFile: handleSetSelectedFile,
                setSelectedLevel: handleSetSelectedLevel,
                refresh,
                loadLogEntries,
                openRawFile
            }
        },
        isLoading,
        error
    }
}
