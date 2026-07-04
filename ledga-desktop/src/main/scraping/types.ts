import type { NormalizedTransaction } from "@/common/types/Transaction"

export type { NormalizedTransaction }

export type EmailTransactionType = "credit" | "debit"

export interface ParsedEmail {
  from: string
  subject: string
  html: string
  text?: string
}
