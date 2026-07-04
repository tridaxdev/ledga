import { z } from "zod"
import type { Tool } from "ai"
import type { PyleHoundFile } from "./ProjectTypes"

export const ToolNameSchema = z.enum(["get_project_files", "load_file"])

export type ToolName = z.infer<typeof ToolNameSchema>

export type ToolScope = "global" | "project"

export interface ToolContext {
    conversationId: string
    projectId?: string
    legalDatabaseEnabled?: boolean
    webSearchEnabled?: boolean
    persistFilesToKnowledge?: boolean
}

export const QuoteScanToolResultSchema = z.object({
    quoteScanId: z.string(),
    query: z.string()
})

export type QuoteScanToolResult = z.infer<typeof QuoteScanToolResultSchema>

export type ProjectFileMetadata = Omit<PyleHoundFile, "extractedText">

export interface GetProjectFilesToolResult {
    projectId: string
    files: ProjectFileMetadata[]
    message: string
}

export type GetSingleFileDetailsToolResult = PyleHoundFile[]

export type ToolExecutionResult = GetProjectFilesToolResult | GetSingleFileDetailsToolResult

export type ToolFactory = () => Tool | Promise<Tool>

export class ToolNotAvailableError extends Error {
    constructor(message: string = "Tool not available") {
        super(message)
        this.name = "ToolNotAvailableError"
    }
}
