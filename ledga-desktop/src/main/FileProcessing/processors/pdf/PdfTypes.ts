import z from "zod"

export const PdfPageElementTypeSchema = z.enum(["text", "heading", "table", "list", "image", "chart", "diagram", "signature", "form_field", "footer", "header", "watermark", "unknown"])

export const PdfPageElementSchema = z.object({
    type: PdfPageElementTypeSchema,
    content: z.string()
})

export const PdfPageSchema = z.object({
    pageNumber: z.number(),
    pageElements: z.array(PdfPageElementSchema).nullable(),
    error: z.string().optional()
})

export const PageResultSchema = z.object({
    pageNumber: z.number(),
    blocks: z.array(PdfPageElementSchema),
    rawText: z.string(),
    error: z.string().optional()
})

export const LlmBlockAnalysisResponseSchema = z.object({
    blocks: z.array(PdfPageElementSchema)
})

export type PdfPageElementType = z.infer<typeof PdfPageElementTypeSchema>
export type PdfPageElement = z.infer<typeof PdfPageElementSchema>
export type PdfPage = z.infer<typeof PdfPageSchema>
export type PageResult = z.infer<typeof PageResultSchema>

export interface PageProcessingResult {
    elements: PdfPageElement[]
    error?: string
}
