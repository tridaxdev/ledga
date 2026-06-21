import { QuoteLocator } from "../QuoteLocator/QuoteLocator"
import type { CitationValidationFile, CitationValidationStepResult, CitationValidationTaskPayload, CitationValidationTaskResult, ResolvedCite, ResolvedFileRef } from "@/common/types/CitationTypes"
import type { QuoteMatch } from "@/common/types/QuoteTypes"
import { CITE_TAG_REGEX, FILE_REF_TAG_REGEX, QUOTE_CHARS_REGEX } from "@/common/utils/regexPatterns"

const QUOTE_CONTEXT_CHARS = 100

type ParsedCite = Pick<ResolvedCite, "matchStart" | "matchEnd" | "fileName" | "originalQuote" | "innerText">
type ParsedFileRef = Omit<ResolvedFileRef, "fileId">

export class CitationValidationProcessor {
    private quoteLocator = new QuoteLocator()

    async process(payload: CitationValidationTaskPayload): Promise<CitationValidationTaskResult> {
        const filesByLowerName = new Map<string, CitationValidationFile>()
        for (const file of payload.files) {
            filesByLowerName.set(file.name.toLowerCase(), file)
        }

        const parsedSteps = payload.steps.map(step => ({
            stepId: step.stepId,
            cites: this.parseCites(step.content),
            fileRefs: this.parseFileRefs(step.content)
        }))

        const locationCache = await this.locateQuotesPerFile(parsedSteps, filesByLowerName)

        const stepResults: CitationValidationStepResult[] = parsedSteps.map(step => ({
            stepId: step.stepId,
            cites: step.cites.map(cite => this.resolveCite(cite, filesByLowerName, locationCache)),
            fileRefs: step.fileRefs.map(ref => this.resolveFileRef(ref, filesByLowerName))
        }))

        return { conversationId: payload.conversationId, steps: stepResults }
    }

    private async locateQuotesPerFile(parsedSteps: Array<{ cites: ParsedCite[] }>, filesByLowerName: Map<string, CitationValidationFile>): Promise<Map<string, Map<string, QuoteMatch>>> {
        const quotesByFile = new Map<string, Set<string>>()
        for (const step of parsedSteps) {
            for (const cite of step.cites) {
                const lowerName = cite.fileName.toLowerCase()
                const file = filesByLowerName.get(lowerName)
                if (!file?.extractedText) continue

                let quotes = quotesByFile.get(lowerName)
                if (!quotes) {
                    quotes = new Set<string>()
                    quotesByFile.set(lowerName, quotes)
                }

                const displayedText = cite.innerText.replace(QUOTE_CHARS_REGEX, "")
                if (displayedText) quotes.add(displayedText)
                if (cite.originalQuote) quotes.add(cite.originalQuote)
            }
        }

        const locationCache = new Map<string, Map<string, QuoteMatch>>()
        for (const [lowerName, quotes] of quotesByFile) {
            const file = filesByLowerName.get(lowerName)
            if (!file) continue
            const matches = await this.quoteLocator.locateQuotesInFile([...quotes], file.extractedText, {
                fallback: "string-match",
                fileId: file.id,
                enrich: { contextChars: QUOTE_CONTEXT_CHARS }
            })
            locationCache.set(lowerName, matches)
        }

        return locationCache
    }

    private resolveCite(cite: ParsedCite, filesByLowerName: Map<string, CitationValidationFile>, locationCache: Map<string, Map<string, QuoteMatch>>): ResolvedCite {
        const lowerName = cite.fileName.toLowerCase()
        const file = filesByLowerName.get(lowerName)
        const matches = locationCache.get(lowerName)
        const quoteMatch = this.selectBestMatch(cite.innerText, cite.originalQuote, matches)

        return {
            matchStart: cite.matchStart,
            matchEnd: cite.matchEnd,
            fileName: cite.fileName,
            fileId: file?.id,
            originalQuote: cite.originalQuote,
            innerText: cite.innerText,
            ...quoteMatch
        }
    }

    private resolveFileRef(ref: ParsedFileRef, filesByLowerName: Map<string, CitationValidationFile>): ResolvedFileRef {
        const file = filesByLowerName.get(ref.fileName.toLowerCase())
        return {
            matchStart: ref.matchStart,
            matchEnd: ref.matchEnd,
            fileName: ref.fileName,
            fileId: file?.id,
            innerText: ref.innerText
        }
    }

    private selectBestMatch(innerText: string, originalQuote: string | undefined, matches: Map<string, QuoteMatch> | undefined): QuoteMatch {
        if (!matches) return { status: "unverified" }

        const displayedText = innerText.replace(QUOTE_CHARS_REGEX, "")
        if (displayedText) {
            const innerMatch = matches.get(displayedText)
            if (innerMatch?.status === "direct") return innerMatch
        }

        if (originalQuote) {
            const originalMatch = matches.get(originalQuote)
            if (originalMatch && originalMatch.status !== "unverified") {
                return { ...originalMatch, status: "paraphrased" }
            }
        }

        if (displayedText) {
            const innerMatch = matches.get(displayedText)
            if (innerMatch && innerMatch.status !== "unverified") {
                return { ...innerMatch, status: "paraphrased" }
            }
        }

        return { status: "unverified" }
    }

    private parseCites(content: string): ParsedCite[] {
        const result: ParsedCite[] = []
        for (const match of content.matchAll(CITE_TAG_REGEX)) {
            const start = match.index ?? 0
            result.push({
                matchStart: start,
                matchEnd: start + match[0].length,
                fileName: match[1],
                originalQuote: match[2] || undefined,
                innerText: match[3]
            })
        }
        return result
    }

    private parseFileRefs(content: string): ParsedFileRef[] {
        const result: ParsedFileRef[] = []
        for (const match of content.matchAll(FILE_REF_TAG_REGEX)) {
            const start = match.index ?? 0
            result.push({
                matchStart: start,
                matchEnd: start + match[0].length,
                fileName: match[1],
                innerText: match[2] || match[1]
            })
        }
        return result
    }
}
