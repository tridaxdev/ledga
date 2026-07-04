import type { DatabaseManager } from "../Database/DatabaseManager"
import type { Logger } from "../logging/FileLogger"
import { LoadFileResultIdSchema } from "../ToolService/Tools/LoadFileContentsAndMetadataTool"

export class ConversationReferencesRepository {
    constructor(
        private db: DatabaseManager,
        private logger: Logger
    ) {}

    async getContentStepStrings(conversationId: string): Promise<string[]> {
        try {
            const rows = (await this.db.executeQuery(
                `
                SELECT ms.content
                FROM message_step ms
                JOIN message m ON m.id = ms.message_id
                WHERE m.conversation_id = ? AND ms.step_type = 'content'
                ORDER BY m.created_at ASC, ms.rowid ASC
                `,
                [conversationId]
            )) as unknown[]

            return (rows ?? []).map(row => (row as { content?: string }).content ?? "")
        } catch (error) {
            this.logger.error(`Failed to fetch content steps for conversation ${conversationId}:`, error)
            throw new Error(`Failed to fetch content steps for conversation ${conversationId}`)
        }
    }

    async getLoadedFileIds(conversationId: string): Promise<Set<string>> {
        try {
            const rows = (await this.db.executeQuery(
                `
                SELECT te.result
                FROM tool_execution te
                JOIN message_step ms ON ms.id = te.step_id
                JOIN message m ON m.id = ms.message_id
                WHERE m.conversation_id = ?
                  AND te.tool_name = 'load_file'
                  AND te.status = 'completed'
                `,
                [conversationId]
            )) as unknown[]

            const ids = new Set<string>()
            for (const row of rows ?? []) {
                const raw = (row as { result?: string }).result
                if (!raw) continue
                try {
                    const parsed = LoadFileResultIdSchema.safeParse(JSON.parse(raw))
                    if (!parsed.success) continue
                    for (const file of parsed.data) ids.add(file.id)
                } catch {
                    // Ignore malformed historical rows.
                }
            }
            return ids
        } catch (error) {
            this.logger.error(`Failed to fetch loaded file ids for conversation ${conversationId}:`, error)
            throw new Error(`Failed to fetch loaded file ids for conversation ${conversationId}`)
        }
    }

    async getSelectedQuoteFileIds(conversationId: string): Promise<Set<string>> {
        try {
            const rows = (await this.db.executeQuery(
                `
                SELECT DISTINCT qsf.file_id AS file_id
                FROM tool_execution te
                JOIN message_step ms ON ms.id = te.step_id
                JOIN message m ON m.id = ms.message_id
                JOIN quote_scan qs ON qs.id = json_extract(te.result, '$.quoteScanId')
                JOIN quote_scan_result qsr ON qsr.quote_scan_id = qs.id
                JOIN quote_scan_file qsf ON qsf.id = qsr.quote_scan_file_id
                WHERE m.conversation_id = ?
                  AND te.tool_name = 'quote_scan'
                  AND te.status = 'completed'
                  AND qs.selected_quote_ids IS NOT NULL
                  AND EXISTS (
                    SELECT 1 FROM json_each(qs.selected_quote_ids) je WHERE je.value = qsr.id
                  )
                `,
                [conversationId]
            )) as Array<{ file_id: string }>
            return new Set(rows.map(row => row.file_id))
        } catch (error) {
            this.logger.error(`Failed to fetch selected quote file ids for conversation ${conversationId}:`, error)
            throw new Error(`Failed to fetch selected quote file ids for conversation ${conversationId}`)
        }
    }
}
