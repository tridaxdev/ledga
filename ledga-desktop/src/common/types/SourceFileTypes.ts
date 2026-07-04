import { z } from "zod"

const LocalFileSourceSchema = z.object({
    provider: z.literal("local"),
    path: z.string()
})

export type LocalFileSource = z.infer<typeof LocalFileSourceSchema>
