import type { Logger } from "../logging/FileLogger"
import type { AssetManagementService } from "../AssetManagement/AssetManagementService"
import type { ConversationReferencesRepository } from "./ConversationReferencesRepository"
import type { Citation, ConversationReferences, FileContextLoadState, FileReference } from "@/common/types/CitationTypes"
import { extractCitationParamsFromContent } from "@/common/citations/citationTags"
import { citationFromParams } from "@/common/citations/citationFromParams"
import { citationKey } from "@/common/citations/citationKey"

export class ConversationReferencesService {
    constructor(
        private repository: ConversationReferencesRepository,
        private assetManagementService: AssetManagementService,
        private logger: Logger
    ) {}

    async getReferencesForConversation(conversationId: string): Promise<ConversationReferences> {
        const contentSteps = await this.repository.getContentStepStrings(conversationId)
        const concatenated = contentSteps.join("\n")

        const citationsByKey = this.extractCitations(concatenated)
        const contentReferencesByFileId = await this.extractContentReferences(conversationId)

        return { citations: [...citationsByKey.values()], contentReferences: [...contentReferencesByFileId.values()] }
    }

    private extractCitations(concatenated: string): Map<string, Citation> {
        const citationsByKey = new Map<string, Citation>()
        for (const params of extractCitationParamsFromContent(concatenated)) {
            const citation = citationFromParams(params, citationsByKey.size + 1)
            const key = citationKey(citation)
            if (citationsByKey.has(key)) continue
            citationsByKey.set(key, citation)
        }
        return citationsByKey
    }

    private async extractContentReferences(conversationId: string): Promise<Map<string, FileReference>> {
        const loadedFileIds = await this.repository.getLoadedFileIds(conversationId)
        const quotedFileIds = await this.repository.getSelectedQuoteFileIds(conversationId)

        const contentReferencesByFileId = new Map<string, FileReference>()
        for (const fileId of new Set([...loadedFileIds, ...quotedFileIds])) {
            const fileName = await this.resolveFileName(fileId, conversationId)
            if (!fileName) continue
            const loadState: FileContextLoadState = loadedFileIds.has(fileId) ? "full" : "partial"
            contentReferencesByFileId.set(fileId, { fileId, fileName, loadState })
        }

        return contentReferencesByFileId
    }

    private async resolveFileName(fileId: string, conversationId: string): Promise<string | null> {
        try {
            const file = await this.assetManagementService.getFileById(fileId)
            return file.name
        } catch (error) {
            this.logger.warn(`Could not resolve file name for loaded/quoted fileId ${fileId} in conversation ${conversationId}`, error)
            return null
        }
    }
}
