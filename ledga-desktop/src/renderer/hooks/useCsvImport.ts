import { useState, useEffect, useCallback, useRef } from "react"
import { getLedgaAPI } from "./apiClient"

export type CsvImportStep = "drop" | "importing"

export function useCsvImport() {
    const [step, setStep] = useState<CsvImportStep>("drop")
    const [fileName, setFileName] = useState("")
    const [rowsParsed, setRowsParsed] = useState(0)
    const [totalRows, setTotalRows] = useState(0)
    const [rowsAdded, setRowsAdded] = useState(0)
    const [error, setError] = useState<string | null>(null)
    const activeTaskId = useRef<string | null>(null)

    useEffect(() => {
        return getLedgaAPI().csv.onProgress(event => {
            if (event.taskId !== activeTaskId.current) return
            setRowsParsed(event.rowsParsed)
            setTotalRows(event.totalRows)
            setRowsAdded(event.rowsAdded)
            if (event.error) setError(event.error)
        })
    }, [])

    const reset = useCallback(() => {
        setStep("drop")
        setFileName("")
        setRowsParsed(0)
        setTotalRows(0)
        setRowsAdded(0)
        setError(null)
        activeTaskId.current = null
    }, [])

    const startImport = useCallback(async (filePath: string, displayName: string) => {
        setFileName(displayName)
        setStep("importing")
        setError(null)
        const result = await getLedgaAPI().csv.import(filePath)
        if (result.kind === "success") {
            activeTaskId.current = result.value.taskId
        } else {
            setError(result.error.message)
        }
    }, [])

    const browseFile = useCallback(async () => {
        const result = await getLedgaAPI().csv.browseFile()
        if (result.kind === "success" && result.value) {
            const displayName = result.value.split(/[\\/]/).pop() ?? result.value
            await startImport(result.value, displayName)
        }
    }, [startImport])

    return { step, fileName, rowsParsed, totalRows, rowsAdded, error, startImport, browseFile, reset }
}
