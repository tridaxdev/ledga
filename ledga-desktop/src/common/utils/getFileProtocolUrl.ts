export const FILE_PROTOCOL_SCHEME = "ph-file"
export const FILE_PROTOCOL_HOST = "file"

export function getFileProtocolUrl(fileId: string): string {
    return `${FILE_PROTOCOL_SCHEME}://${FILE_PROTOCOL_HOST}/${fileId}`
}
