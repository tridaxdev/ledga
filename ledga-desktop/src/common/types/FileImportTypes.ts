import type { LocalFileSource } from "./SourceFileTypes";

export type ImportFile = { fileName: string; source: LocalFileSource; folderId?: string }
export type DownloadedFile = { filePath: string; fileName: string }
export type GetFileRequest = { id: string }
export type GetFilesByFolderRequest = { folderId: string }
export type GetFilesByProjectRequest = { projectId: string; folderId?: string }
export type ImportFilesRequest = { projectId?: string; stepId?: string; files: ImportFile[] }
export type FileImportErrorCode = "UNSUPPORTED_FILE_TYPE" | "IO_ERROR" | "UNKNOWN_ERROR"
export type FileImportFailure = { filePath: string; fileName?: string; reason: string; extension?: string; code: FileImportErrorCode }
export type RetryImportRequest = { projectId: string }
export type OpenFileRequest = { fileUrl: string }
export type RetryFileProcessingRequest = { fileId: string }
export type DeleteAssetsRequest = { assetIds: string[]; projectId: string }
export type GetFilesByConversationRequest = { conversationId: string }
