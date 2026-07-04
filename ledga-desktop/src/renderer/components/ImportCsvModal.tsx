import { useState, type DragEvent, type MouseEvent } from "react"
import { useCsvImport } from "../hooks/useCsvImport"
import { getLedgaAPI } from "../hooks/apiClient"

interface Props {
    isOpen: boolean
    onClose: () => void
    onViewStatus: () => void
}

export function ImportCsvModal({ isOpen, onClose, onViewStatus }: Props) {
    const { step, fileName, rowsParsed, totalRows, rowsAdded, error, startImport, browseFile, reset } = useCsvImport()
    const [isDragOver, setIsDragOver] = useState(false)

    function handleClose() {
        reset()
        onClose()
    }

    function handleFinish() {
        reset()
        onClose()
    }

    async function handleDrop(e: DragEvent<HTMLDivElement>) {
        e.preventDefault()
        setIsDragOver(false)
        const file = e.dataTransfer.files[0]
        if (!file) return
        if (!file.name.toLowerCase().endsWith(".csv")) return
        // Electron 32+ with contextIsolation removed File.path from the renderer -- the real
        // filesystem path has to be resolved via webUtils in the preload script instead.
        const filePath = getLedgaAPI().getPathForFile(file)
        await startImport(filePath, file.name)
    }

    if (!isOpen) return null

    const percent = totalRows > 0 ? Math.round((rowsParsed / totalRows) * 100) : 0

    return (
        <div
            style={{ position: "fixed", inset: 0, backgroundColor: "rgba(31, 27, 22, 0.34)", backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
            onClick={step === "drop" ? handleClose : undefined}
        >
            <div
                style={{ width: 460, backgroundColor: "#fff", border: "1px solid var(--color-ledga-border)", borderRadius: 14, boxShadow: "0 24px 50px -12px rgba(63,56,47,.4)", overflow: "hidden" }}
                onClick={(e: MouseEvent) => e.stopPropagation()}
            >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--color-ledga-border-subtle)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500, color: "var(--color-ledga-text-secondary)" }}>
                        <ImportIcon />
                        Import a statement
                    </div>
                    <button onClick={handleClose} style={{ color: "var(--color-ledga-text-muted)", cursor: "pointer", border: "none", background: "transparent", display: "inline-flex" }}>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div style={{ padding: 22 }}>
                    {step === "drop" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            <div
                                onDragOver={e => {
                                    e.preventDefault()
                                    setIsDragOver(true)
                                }}
                                onDragLeave={() => setIsDragOver(false)}
                                onDrop={handleDrop}
                                style={{
                                    border: `2px dashed ${isDragOver ? "var(--color-ledga-brand)" : "#b9ad95"}`,
                                    borderRadius: 11,
                                    background: isDragOver ? "var(--color-ledga-brand-bg)" : "var(--color-ledga-sidebar)",
                                    padding: "30px 20px",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    gap: 11,
                                    textAlign: "center"
                                }}
                            >
                                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--color-ledga-text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 16V4" />
                                    <path d="m7 9 5-5 5 5" />
                                    <path d="M5 20h14" />
                                </svg>
                                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ledga-text)" }}>Drop a CSV here</div>
                                <div style={{ fontSize: 12, color: "var(--color-ledga-text-muted)" }}>Most banks supported · CSV</div>
                            </div>
                            <button
                                onClick={browseFile}
                                style={{
                                    alignSelf: "flex-start",
                                    background: "var(--color-ledga-brand)",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: 7,
                                    padding: "10px 18px",
                                    fontSize: 14,
                                    fontWeight: 500,
                                    cursor: "pointer"
                                }}
                            >
                                Browse files
                            </button>
                            {error && <div style={{ fontSize: 13, color: "var(--color-ledga-danger)" }}>{error}</div>}
                        </div>
                    )}

                    {step === "importing" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--color-ledga-border)", borderRadius: 7, padding: "9px 11px" }}>
                                <FileIcon />
                                <span style={{ fontSize: 13.5, color: "var(--color-ledga-text)" }}>{fileName}</span>
                                <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-ledga-brand)" }}>CSV</span>
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 600, fontFamily: "var(--font-serif)", color: "var(--color-ledga-text)" }}>Importing in the background</div>
                            <div style={{ height: 8, borderRadius: 5, background: "var(--color-ledga-border-subtle)", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${percent}%`, background: "var(--color-ledga-brand)", borderRadius: 5, transition: "width .2s" }} />
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--color-ledga-text-secondary)" }}>
                                <span>
                                    {rowsParsed} / {totalRows || "…"} rows parsed
                                </span>
                                <span>added so far: {rowsAdded}</span>
                            </div>
                            <div style={{ fontSize: 13, color: "var(--color-ledga-text-secondary)", lineHeight: 1.5 }}>
                                You can keep working — transactions appear in your ledger as they&apos;re parsed. Low-confidence rows get flagged for review.
                            </div>
                            {error && <div style={{ fontSize: 13, color: "var(--color-ledga-danger)" }}>{error}</div>}
                            <div style={{ display: "flex", gap: 9 }}>
                                <button
                                    onClick={handleFinish}
                                    style={{
                                        background: "var(--color-ledga-brand)",
                                        color: "#fff",
                                        border: "none",
                                        borderRadius: 7,
                                        padding: "10px 18px",
                                        fontSize: 14,
                                        fontWeight: 500,
                                        cursor: "pointer"
                                    }}
                                >
                                    Go to ledger
                                </button>
                                <button
                                    onClick={() => {
                                        onViewStatus()
                                        handleClose()
                                    }}
                                    style={{
                                        border: "1px solid var(--color-ledga-border)",
                                        background: "#fff",
                                        borderRadius: 7,
                                        padding: "9px 16px",
                                        fontSize: 14,
                                        fontWeight: 500,
                                        color: "var(--color-ledga-text)",
                                        cursor: "pointer"
                                    }}
                                >
                                    View status
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function ImportIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
        </svg>
    )
}

function FileIcon() {
    return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--color-ledga-text-secondary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
        </svg>
    )
}
