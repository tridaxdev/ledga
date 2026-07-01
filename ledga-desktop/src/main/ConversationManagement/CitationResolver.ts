import { v4 as uuid } from "uuid"
import type { ProjectAssetRepository } from "../AssetManagement/ProjectAssetRepository"
import type { BackgroundWorkerManager } from "../BackgroundWorker/BackgroundWorkerManager"
import type { Logger } from "../logging/FileLogger"
import type { ConversationRepository } from "./ConversationRepository"
import { convertCitationTagsToMarkdownLinks } from "@/common/citations/citationTags"
import { ProcessingPriority } from "@/common/types/FileProcessingTypes"
import type {
    CitationValidationFile,
    CitationValidationStep,
    CitationValidationStepResult,
    CitationValidationTaskPayload,
    CitationValidationTaskResult,
    ResolvedCite,
    ResolvedFileRef
} from "@/common/types/CitationTypes"
import type { Message } from "@/common/types/types"
import { CITATION_CLOSE_HINT_REGEX, CITE_TAG_REGEX, FILE_REF_TAG_REGEX, hasUnenrichedCitationTags } from "@/common/utils/regexPatterns"

const CITATION_VALIDATION_TIMEOUT_MS = 120_000

interface OrderedReplacement {
    matchStart: number
    matchEnd: number
    replacement: string
}

export class CitationResolver {
    constructor(
        private backgroundWorkerManager: BackgroundWorkerManager,
        private assetRepository: ProjectAssetRepository,
        private conversationRepository: ConversationRepository,
        private logger: Logger
    ) {}

    async renderTagsInMessage(conversationId: string, message: Message): Promise<Message> {
        const validFileIds = await this.loadValidFileIds(conversationId)
        return this.applyValidFileIds(message, validFileIds)
    }

    private applyValidFileIds(message: Message, validFileIds: ReadonlySet<string>): Message {
        let changed = false
        const nextSteps = message.steps.map(step => {
            if (step.stepType !== "content") return step
            const converted = convertCitationTagsToMarkdownLinks(step.content, validFileIds)
            if (converted === step.content) return step
            changed = true
            return { ...step, content: converted }
        })
        return changed ? { ...message, steps: nextSteps } : message
    }

    private async loadValidFileIds(conversationId: string): Promise<ReadonlySet<string>> {
        const files = await this.assetRepository.getFilesByConversationIdWithStatus(conversationId)
        return new Set(files.map(f => f.id))
    }

    async enrichAndPersistMessageById(conversationId: string, messageId: string, deltaHint?: string): Promise<void> {
        if (deltaHint !== undefined && !CITATION_CLOSE_HINT_REGEX.test(deltaHint)) return
        try {
            const message = await this.conversationRepository.getMessageById(messageId)
            if (!message) return
            await this.enrichAndPersistMessages(conversationId, [message])
        } catch (error) {
            this.logger.error("Inline citation enrichment failed", {
                conversationId,
                messageId,
                error: error instanceof Error ? error.message : String(error)
            })
        }
    }

    async enrichAndRender(conversationId: string, messages: Message[]): Promise<Message[]> {
        let enriched: Message[]
        try {
            enriched = await this.enrichAndPersistMessages(conversationId, messages)
        } catch (error) {
            this.logger.error("Citation enrichment failed; rendering tags without enrichment", {
                conversationId,
                error: error instanceof Error ? error.message : String(error)
            })
            enriched = messages
        }
        const validFileIds = await this.loadValidFileIds(conversationId)
        return enriched.map(message => this.applyValidFileIds(message, validFileIds))
    }

    async enrichAndPersistMessages(conversationId: string, messages: Message[]): Promise<Message[]> {
        const stepsToValidate = this.collectStepsToValidate(messages)
        if (stepsToValidate.length === 0) return messages

        const fileNames = this.collectFileNames(stepsToValidate)
        const filesByLowerName = await this.assetRepository.getFilesByNamesInConversation(conversationId, fileNames)
        const files: CitationValidationFile[] = [...filesByLowerName.values()].map(f => ({
            id: f.id,
            name: f.name,
            extractedText: f.extractedText ?? ""
        }))

        const result = await this.executeValidation(conversationId, stepsToValidate, files)
        const stepIdToContent = this.renderSteps(stepsToValidate, result.steps)

        await this.persistEnrichedSteps(stepIdToContent)

        return messages.map(message => this.applyEnrichedSteps(message, stepIdToContent))
    }

    private applyEnrichedSteps(message: Message, stepIdToContent: Map<string, string>): Message {
        const nextSteps = message.steps.map(step => {
            if (step.stepType !== "content") return step
            const updated = stepIdToContent.get(step.id)
            return updated !== undefined && updated !== step.content ? { ...step, content: updated } : step
        })
        const hasChanges = nextSteps.some((step, i) => step !== message.steps[i])
        return hasChanges ? { ...message, steps: nextSteps } : message
    }

    private async persistEnrichedSteps(stepIdToContent: Map<string, string>): Promise<void> {
        for (const [stepId, content] of stepIdToContent) {
            try {
                await this.conversationRepository.updateContentStepContent(stepId, content)
            } catch (error) {
                this.logger.error("Failed to persist enriched citation step", { stepId, error: error instanceof Error ? error.message : String(error) })
            }
        }
    }

    private collectStepsToValidate(messages: Message[]): CitationValidationStep[] {
        const steps: CitationValidationStep[] = []
        for (const message of messages) {
            for (const step of message.steps) {
                if (step.stepType !== "content") continue
                if (!hasUnenrichedCitationTags(step.content)) continue
                steps.push({ stepId: step.id, content: step.content })
            }
        }
        return steps
    }

    private collectFileNames(steps: CitationValidationStep[]): string[] {
        const seen = new Set<string>()
        const names: string[] = []
        for (const step of steps) {
            for (const match of step.content.matchAll(CITE_TAG_REGEX)) {
                const lower = match[1].toLowerCase()
                if (!seen.has(lower)) {
                    seen.add(lower)
                    names.push(match[1])
                }
            }
            for (const match of step.content.matchAll(FILE_REF_TAG_REGEX)) {
                const lower = match[1].toLowerCase()
                if (!seen.has(lower)) {
                    seen.add(lower)
                    names.push(match[1])
                }
            }
        }
        return names
    }

    private async executeValidation(conversationId: string, steps: CitationValidationStep[], files: CitationValidationFile[]): Promise<CitationValidationTaskResult> {
        const taskId = `citation-validate-${conversationId}-${uuid()}`
        this.logger.debug("Citation validation enqueued", { conversationId, stepCount: steps.length, fileCount: files.length })

        return this.backgroundWorkerManager.executeTask<CitationValidationTaskPayload, CitationValidationTaskResult>({
            id: taskId,
            type: "citation_validate",
            priority: ProcessingPriority.NORMAL,
            payload: { conversationId, steps, files },
            timeout: CITATION_VALIDATION_TIMEOUT_MS,
            resolve: () => {},
            reject: () => {},
            enqueuedAt: Date.now()
        })
    }

    private renderSteps(sentSteps: CitationValidationStep[], stepResults: CitationValidationStepResult[]): Map<string, string> {
        const sentById = new Map(sentSteps.map(s => [s.stepId, s.content]))
        const out = new Map<string, string>()
        for (const result of stepResults) {
            const content = sentById.get(result.stepId)
            if (content === undefined) continue
            out.set(result.stepId, this.renderContent(content, result.cites, result.fileRefs))
        }
        return out
    }

    private renderContent(content: string, cites: ResolvedCite[], fileRefs: ResolvedFileRef[]): string {
        if (cites.length === 0 && fileRefs.length === 0) return content

        const replacements: OrderedReplacement[] = [
            ...cites.map(cite => ({
                matchStart: cite.matchStart,
                matchEnd: cite.matchEnd,
                replacement: this.renderEnrichedCiteTag(cite)
            })),
            ...fileRefs.map(ref => ({
                matchStart: ref.matchStart,
                matchEnd: ref.matchEnd,
                replacement: this.renderEnrichedFileRefTag(ref)
            }))
        ].sort((a, b) => a.matchStart - b.matchStart)

        const out: string[] = []
        let cursor = 0
        for (const { matchStart, matchEnd, replacement } of replacements) {
            if (matchStart < cursor) continue
            if (matchStart > cursor) out.push(content.slice(cursor, matchStart))
            out.push(replacement)
            cursor = matchEnd
        }
        if (cursor < content.length) out.push(content.slice(cursor))
        return out.join("")
    }

    private renderEnrichedCiteTag(cite: ResolvedCite): string {
        const attrs: string[] = [`file="${this.escapeAttr(cite.fileName)}"`, `status="${cite.status}"`]
        if (cite.fileId) attrs.push(`file_id="${this.escapeAttr(cite.fileId)}"`)
        if (cite.status !== "unverified") {
            attrs.push(`char_start="${cite.location.start}"`)
            attrs.push(`char_end="${cite.location.end}"`)
            if (cite.pageNumber !== undefined) attrs.push(`page="${cite.pageNumber}"`)
            if (cite.textBefore) attrs.push(`text_before="${this.escapeAttr(cite.textBefore)}"`)
            if (cite.textAfter) attrs.push(`text_after="${this.escapeAttr(cite.textAfter)}"`)
        }
        if (cite.originalQuote) attrs.push(`original_quote="${this.escapeAttr(cite.originalQuote)}"`)

        return `<cite ${attrs.join(" ")}>${this.escapeContent(cite.innerText)}</cite>`
    }

    private renderEnrichedFileRefTag(ref: ResolvedFileRef): string {
        const attrs: string[] = [`name="${this.escapeAttr(ref.fileName)}"`]
        if (ref.fileId) attrs.push(`file_id="${this.escapeAttr(ref.fileId)}"`)

        return `<file-ref ${attrs.join(" ")}>${this.escapeContent(ref.innerText)}</file-ref>`
    }

    private escapeAttr(value: string): string {
        return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, " ").replace(/\r/g, " ")
    }

    private escapeContent(value: string): string {
        return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    }
}
