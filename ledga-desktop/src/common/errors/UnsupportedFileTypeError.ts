export class UnsupportedFileTypeError extends Error {
    readonly extension: string

    constructor(extension: string) {
        const normalized = extension || "(no extension)"
        super(`Unsupported file type: ${normalized}`)
        this.name = "UnsupportedFileTypeError"
        this.extension = normalized
    }
}
