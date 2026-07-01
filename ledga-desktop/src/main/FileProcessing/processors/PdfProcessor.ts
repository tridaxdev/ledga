import { readFile } from "fs/promises"
import { createCanvas } from "@napi-rs/canvas"
import { PDF } from "@libpdf/core"
import z from "zod"
import { v4 as uuid } from "uuid"
import { getDocument, OPS, VerbosityLevel, type PDFPageProxy, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs"
import type { TextItem, TextMarkedContent } from "pdfjs-dist/types/src/display/api"
import { FileProcessorBase } from "../FileProcessorBase"
import type { FileProcessingConfig } from "../FileProcessingConfig"
import type { WorkerLogger } from "../../logging/WorkerLogger"
import type { ProcessingResult } from "../../../common/types/ProcessorTypes"
import type { BackgroundWorkerAIService } from "../../BackgroundWorker/BackgroundWorkerAIService"
import type { ModelTier, PdfAIRequest } from "../../../common/types/FileProcessingTypes"
import { LlmBlockAnalysisResponseSchema, type PdfPageElement, type PageProcessingResult, type PdfPageElementType } from "./pdf/PdfTypes"

const MAX_TRIES = 3
const RETRY_DELAY_BASE_MS = 1000

// Operators that are safe for text-only pages
// If ALL operators on a page are in this set, we can skip LLM and use native text extraction
const TEXT_ONLY_SAFE_OPS = new Set([
    OPS.dependency,
    OPS.save,
    OPS.restore,
    OPS.transform,
    OPS.setGState,
    OPS.setStrokeRGBColor,
    OPS.setFillRGBColor,
    OPS.constructPath,

    OPS.clip,
    OPS.eoClip,

    OPS.beginText,
    OPS.endText,
    OPS.setCharSpacing,
    OPS.setWordSpacing,
    OPS.setHScale,
    OPS.setLeading,
    OPS.setFont,
    OPS.setTextRenderingMode,
    OPS.setTextRise,
    OPS.moveText,
    OPS.setLeadingMoveText,
    OPS.setTextMatrix,
    OPS.nextLine,
    OPS.showText,
    OPS.showSpacedText,
    OPS.nextLineShowText,
    OPS.nextLineSetSpacingShowText,
    OPS.setCharWidth,
    OPS.setCharWidthAndBounds,

    OPS.markPoint,
    OPS.markPointProps,
    OPS.beginMarkedContent,
    OPS.beginMarkedContentProps,
    OPS.endMarkedContent,

    OPS.beginCompat,
    OPS.endCompat
])

export class PdfProcessor extends FileProcessorBase {
    static readonly supportedExtensions = [".pdf"] as const

    constructor(logger: WorkerLogger, config: FileProcessingConfig, aiService: BackgroundWorkerAIService) {
        super(logger, config, aiService)
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected async processFileContent(filePath: string, _fileId: string): Promise<ProcessingResult> {
        const pdfBytes = new Uint8Array(await readFile(filePath))
        const preferred = await this.loadLibPdf(pdfBytes)
        const sourcePdf = preferred?.sourcePdf ?? null
        const pdfJsDoc = preferred?.pdfJsDoc ?? (await this.loadPdfJs(pdfBytes))

        const pageCount = sourcePdf === null ? pdfJsDoc.numPages : sourcePdf.getPageCount()

        const limit = this.createConcurrencyLimit(32)

        this.logger.info(`Starting PDF processing: ${pageCount} pages`)

        const pageResults = new Map<number, PageProcessingResult>()

        const pagePromises = Array.from({ length: pageCount }, (_, i) => {
            const pageNum = i + 1
            return limit(async () => {
                try {
                    const result = await this.processPage(pageNum, sourcePdf, pdfJsDoc)
                    pageResults.set(pageNum, result)
                } catch (error) {
                    this.logger.warn(`Page ${pageNum} failed: ${error instanceof Error ? error.message : String(error)}`)
                    pageResults.set(pageNum, {
                        elements: [],
                        error: `Processing failed: ${error instanceof Error ? error.message : String(error)}`
                    })
                }
            })
        })

        try {
            await Promise.all(pagePromises)
        } finally {
            await pdfJsDoc.destroy()
        }

        const { content, failedPages, partialPages } = this.assembleDocument(pageResults)
        this.logger.info(`PDF processing completed: ${content.length} chars from ${pageCount} pages`)
        if (pageCount > 0 && failedPages.length === pageCount) {
            throw new Error(`All pages failed to process`)
        }

        const warnings: string[] = []
        if (pageCount === 0) {
            warnings.push("This PDF contains no pages and no content could be extracted.")
        }
        if (sourcePdf === null) {
            warnings.push("This PDF uses non-standard syntax and was processed in compatibility mode. Content extraction may be slightly less precise for pages with complex layouts.")
        }
        if (failedPages.length > 0) {
            warnings.push(`${failedPages.length} page(s) failed to process: pages ${failedPages.join(", ")}.`)
        }
        if (partialPages.length > 0) {
            warnings.push(`${partialPages.length} page(s) partially extracted (visual content may be missing): pages ${partialPages.join(", ")}.`)
        }
        const warning = warnings.length > 0 ? warnings.join("\n\n") : undefined

        return { content, warning }
    }

    private async loadLibPdf(pdfBytes: Uint8Array): Promise<{ sourcePdf: PDF; pdfJsDoc: PDFDocumentProxy } | null> {
        let sourcePdf: PDF
        try {
            sourcePdf = await PDF.load(pdfBytes)
        } catch (error) {
            this.logger.warn(`Primary PDF parser failed, failing back to pdfjs-dist: ${error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error)}`)
            return null
        }
        if (sourcePdf.isEncrypted && !sourcePdf.isAuthenticated) {
            throw new Error("PDF is password protected")
        }
        // libpdf's lazy parser keeps pdfBytes; copy so pdfjs can mutate freely
        const pdfJsDoc = await this.loadPdfJs(new Uint8Array(pdfBytes))
        return { sourcePdf, pdfJsDoc }
    }

    private async loadPdfJs(data: Uint8Array): Promise<PDFDocumentProxy> {
        try {
            return await getDocument({ data, password: "", isEvalSupported: false, verbosity: VerbosityLevel.ERRORS }).promise
        } catch (error) {
            if ((error as { name?: unknown }).name === "PasswordException") {
                throw new Error("PDF is password protected")
            }
            throw error
        }
    }

    private async processPage(pageNumber: number, sourcePdf: PDF | null, pdfJsDoc: PDFDocumentProxy): Promise<PageProcessingResult> {
        const pdfJsPage = await pdfJsDoc.getPage(pageNumber)
        const { textElements, isReadableTextOnly, hasGarbledText } = await this.extractNativeReadableText(pdfJsPage)

        if (isReadableTextOnly) {
            this.logger.debug(`Page ${pageNumber}: text-only, ${textElements.length} elements`)
            if (textElements.length === 0) {
                return { elements: [], error: "Failed to extract content" }
            }
            return { elements: textElements }
        }

        let contentBuffer: Uint8Array
        let mediaType: "application/pdf" | "image/png"

        if (hasGarbledText) {
            // Font glyphs render correctly but the PDF text layer is garbled,
            // so the LLM must do visual OCR on the rendered page
            this.logger.debug(`Page ${pageNumber}: garbled text detected, rendering to image`)
            contentBuffer = await this.renderPageToImage(pdfJsPage)
            mediaType = "image/png"
        } else if (sourcePdf !== null) {
            // Exclude annotations to reduce buffer size for transfer between threads
            const singlePagePdf = await sourcePdf.extractPages([pageNumber - 1], { includeAnnotations: false })
            const pdfBuffer = await singlePagePdf.save()
            contentBuffer = new Uint8Array(pdfBuffer)
            mediaType = "application/pdf"
        } else {
            // Primary parser unavailable — render to image as the next best option
            contentBuffer = await this.renderPageToImage(pdfJsPage)
            mediaType = "image/png"
        }

        const llmContext = textElements.length > 0 ? textElements : undefined
        const elements = await this.analyzeWithLLM(pageNumber, contentBuffer, mediaType, llmContext)
        if (elements) {
            return { elements }
        }

        if (textElements.length > 0) {
            return { elements: textElements, error: "Partially extracted (visual content may be missing)" }
        }

        return { elements: [], error: "Failed to extract content" }
    }

    // Extracts native text from a PDF page and determines if the page can be handled without LLM.
    //
    // Some PDFs have broken font encodings that produce garbled text extraction:
    //  - PUA-mapped fonts (e.g. CIDFont+F1 from Google Docs): pdfjs can't map glyph IDs back to
    //    Unicode, so extracted text is Private Use Area characters (U+E000–U+F8FF).
    //  - Anti-copy-protection fonts: ToUnicode CMap deliberately maps glyphs to wrong characters.
    //    The PDF renders correctly (glyph shapes are fine) but copy/extraction gives garbage like
    //    `7'.2'(*'*.>&<'1` instead of actual words.
    //
    // Both cases produce text where very few characters are actual letters (\p{L}). Normal text
    // has 80%+ letters; garbled text typically has <15%. We check the page's overall letter ratio
    // against a 20% threshold — below that, all text is discarded so the page falls through to
    // LLM visual extraction which reads the rendered glyphs directly.
    private async extractNativeReadableText(page: PDFPageProxy): Promise<{ textElements: PdfPageElement[]; isReadableTextOnly: boolean; hasGarbledText: boolean }> {
        const textContent = await page.getTextContent()
        const sections = this.groupByMarkedContent(textContent.items)

        let elements: PdfPageElement[]
        if (sections.length === 0) {
            const plainText = textContent.items
                .filter(item => "str" in item && item.str)
                .map(item => (item as { str: string }).str)
                .join(" ")

            elements = plainText ? [{ type: "text", content: plainText }] : []
        } else {
            elements = sections
                .filter(section => section.text)
                .map(section => ({
                    type: this.mapTagToBlockType(section.tag),
                    content: section.text
                }))
        }

        // Discard all text if the page's letter ratio is too low (broken font encoding)
        let hasGarbledText = false
        if (elements.length > 0 && !this.isTextReadable(elements)) {
            hasGarbledText = true
            elements = []
        }

        const ops = await page.getOperatorList()
        const readableTextOnly = elements.length > 0 && ops.fnArray.every(op => TEXT_ONLY_SAFE_OPS.has(op))

        return { textElements: elements, isReadableTextOnly: readableTextOnly, hasGarbledText }
    }

    // Returns false if ANY element has garbled text (broken font encoding). Pages can mix normal
    // and anti-copy-protection fonts, so we check per-element rather than aggregating the whole
    // page. An element is garbled if it has 5+ non-whitespace characters but fewer than 50%
    // are Unicode letters (\p{L}). Normal text has 80%+ letters; garbled text has ~5-15%.
    private isTextReadable(elements: PdfPageElement[]): boolean {
        const MIN_CHARS_FOR_CHECK = 5
        for (const element of elements) {
            const nonSpaceChars = [...element.content].filter(c => c.trim())
            if (nonSpaceChars.length < MIN_CHARS_FOR_CHECK) continue
            const letterCount = nonSpaceChars.filter(c => /\p{L}/u.test(c)).length
            if (letterCount / nonSpaceChars.length < 0.5) return false
        }
        return elements.length > 0
    }

    private async renderPageToImage(page: PDFPageProxy): Promise<Uint8Array> {
        const scale = 2
        const viewport = page.getViewport({ scale })
        const canvas = createCanvas(viewport.width, viewport.height)
        const context = canvas.getContext("2d")
        // pdfjs: Node canvas integration via @napi-rs/canvas
        await page.render({ canvas: null, canvasContext: context as unknown as CanvasRenderingContext2D, viewport }).promise
        return new Uint8Array(canvas.toBuffer("image/png"))
    }

    private groupByMarkedContent(items: Array<TextItem | TextMarkedContent>): Array<{ tag: string | null; text: string }> {
        const sections: Array<{ tag: string | null; text: string }> = []
        let currentTag: string | null = null
        let currentText = ""

        for (const item of items) {
            if ("type" in item) {
                switch (item.type) {
                    case "beginMarkedContent":
                    case "beginMarkedContentProps":
                        if (currentText) {
                            sections.push({ tag: currentTag, text: currentText })
                        }
                        currentTag = item.id ?? null
                        currentText = ""
                        break
                    case "endMarkedContent":
                        if (currentText) {
                            sections.push({ tag: currentTag, text: currentText })
                        }
                        currentTag = null
                        currentText = ""
                        break
                    default:
                        break
                }
            } else if ("str" in item && item.str) {
                currentText += `${item.str} `
            }
        }

        if (currentText) {
            sections.push({ tag: currentTag, text: currentText })
        }

        return sections
    }

    private mapTagToBlockType(tag: string | null): PdfPageElementType {
        if (!tag) return "text"

        switch (tag.toUpperCase()) {
            case "H":
            case "H1":
            case "H2":
            case "H3":
            case "H4":
            case "H5":
            case "H6":
                return "heading"
            case "L":
            case "LI":
            case "LBL":
            case "LBODY":
                return "list"
            case "TABLE":
            case "TR":
            case "TH":
            case "TD":
            case "THEAD":
            case "TBODY":
                return "table"
            case "HEADER":
            case "ARTIFACT":
                return "header"
            case "FOOTER":
                return "footer"
            default:
                return "text"
        }
    }

    private async analyzeWithLLM(pageNumber: number, contentBuffer: Uint8Array, mediaType: "application/pdf" | "image/png", nativeElements?: PdfPageElement[]): Promise<PdfPageElement[] | null> {
        const nativeTextContext = nativeElements?.map(el => el.content).join("\n\n") ?? ""
        const modelTiers: ModelTier[] = ["simple", "medium", "advanced"]

        for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
            try {
                const request: PdfAIRequest = {
                    requestId: `pdf_page_${pageNumber}_${uuid()}`,
                    modelTier: modelTiers[attempt - 1],
                    operation: "extractTextFromPdf",
                    data: {
                        nativeTextContext,
                        pageNumber,
                        contentBuffer,
                        mediaType,
                        schema: z.toJSONSchema(LlmBlockAnalysisResponseSchema),
                        timeout: this.config.common.aiRequestTimeout * Math.pow(2, attempt - 1)
                    }
                }
                const response = await this.aiService.requestAI(request)
                if (!response.success) {
                    throw new Error(response.error || "AI request failed")
                }

                const parseResult = LlmBlockAnalysisResponseSchema.safeParse(response.result)
                if (!parseResult.success) {
                    throw new Error("Failed to parse LLM response")
                }

                this.logger.info(`Page ${pageNumber}: ${parseResult.data.blocks.length} blocks via LLM`)
                return parseResult.data.blocks
            } catch (error) {
                this.logger.warn(`Page ${pageNumber} LLM attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`)

                if (attempt < MAX_TRIES) {
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_BASE_MS * Math.pow(2, attempt - 1)))
                }
            }
        }

        return null
    }

    private assembleDocument(pageResults: Map<number, PageProcessingResult>): { content: string; failedPages: number[]; partialPages: number[] } {
        const sortedPageNumbers = [...pageResults.keys()].sort((a, b) => a - b)
        const failedPages: number[] = []
        const partialPages: number[] = []

        const pageTexts = sortedPageNumbers.map(pageNumber => {
            const result = pageResults.get(pageNumber)
            if (!result || (result.error && result.elements.length === 0)) {
                failedPages.push(pageNumber)
                return `\n--- Page ${pageNumber} ---\n[Page processing failed: ${result?.error ?? "Unknown error"}]`
            }
            if (result.error && result.elements.length > 0) {
                partialPages.push(pageNumber)
            }
            const rawText = this.assemblePageText(result.elements)
            return `\n--- Page ${pageNumber} ---\n${rawText}`
        })

        return { content: pageTexts.join("\n\n").trim(), failedPages, partialPages }
    }

    private assemblePageText(blocks: PdfPageElement[]): string {
        const textParts: string[] = []

        for (const block of blocks) {
            const formattedContent = this.formatBlockContent(block)
            if (formattedContent) {
                textParts.push(formattedContent)
            }
        }

        return textParts.join("\n\n")
    }

    private formatBlockContent(block: PdfPageElement): string {
        const content = block.content.trim()

        switch (block.type) {
            case "heading":
                return `<heading>${content}</heading>`
            case "table":
                return `<table>${content}</table>`
            case "list":
                return `<list>${content}</list>`
            case "image":
                return `<image>${content}</image>`
            case "chart":
                return `<chart>${content}</chart>`
            case "diagram":
                return `<diagram>${content}</diagram>`
            case "signature":
                return `<signature>${content}</signature>`
            case "form_field":
                return `<form_field>${content}</form_field>`
            case "footer":
                return `<footer>${content}</footer>`
            case "header":
                return `<header>${content}</header>`
            case "watermark":
                return `<watermark>${content}</watermark>`
            case "text":
            case "unknown":
            default:
                return content
        }
    }
}
