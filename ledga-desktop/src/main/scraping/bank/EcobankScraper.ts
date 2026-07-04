import { BANK_SENDER_ECOBANK } from "../../email/bankSenders"
import type { NormalizedTransaction, ParsedEmail } from "../types"
import type { EmailTransactionType } from "../types"
import { BankScraper } from "./BankScraper"

function extractEmailFromFromHeader(from: string): string {
    const match = from.match(/<([^>]+)>/)
    if (match) return match[1].trim().toLowerCase()
    return from.trim().toLowerCase()
}

function isEcobankEmail(parsed: ParsedEmail): boolean {
    const addr = extractEmailFromFromHeader(parsed.from)
    if (addr === BANK_SENDER_ECOBANK) return true

    const html = parsed.html ?? ""
    return /noreply@ecobank\.com/i.test(html) && /Account\s*N[ºo°]/i.test(html) && /Available\s+Balance/i.test(html)
}

function parseEcobankAmount(value: string): number {
    const cleaned = value
        .replace(/NGN/gi, "")
        .replace(/&nbsp;/gi, "")
        .replace(/\u00a0/g, "")
        .replace(/,/g, "")
        .trim()
    const n = Number.parseFloat(cleaned)
    return Number.isFinite(n) ? n : 0
}

function extractCellValue(html: string, label: string): string {
    const labelPattern = label.replace(/\s+/g, "\\s*")
    const re = new RegExp(`(?:<[^>]+>\\s*)*<strong>\\s*${labelPattern}\\s*<\\/strong>[\\s\\S]*?<\\/td>[\\s\\S]*?<td[^>]*>([\\s\\S]*?)<\\/td>`, "i")
    const m = html.match(re)
    if (!m) return ""
    return m[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/gi, "")
        .replace(/\u00a0/g, "")
        .replace(/\s+/g, " ")
        .trim()
}

export class EcobankScraper extends BankScraper {
    bankId(): string {
        return "ecobank"
    }

    detect(parsed: ParsedEmail): EmailTransactionType | null {
        if (!isEcobankEmail(parsed)) return null
        const html = parsed.html ?? ""
        if (/Credited/i.test(html)) return "credit"
        if (/Debited/i.test(html)) return "debit"
        return null
    }

    parse(parsed: ParsedEmail, type: EmailTransactionType): NormalizedTransaction {
        const html = parsed.html ?? ""

        const account_number = extractCellValue(html, "Account\\s*N[ºo°]:")
        const merchant = extractCellValue(html, "Description:")
        const bank_reference = extractCellValue(html, "Reference:")

        const rawDate = extractCellValue(html, "Transaction\\s+Date:")
        const timestamp = rawDate ? `${rawDate}T00:00:00` : ""

        const rawAmount = extractCellValue(html, "Amount:")
        const absAmount = parseEcobankAmount(rawAmount)
        const amount = Math.abs(absAmount)

        const rawBalance = extractCellValue(html, "Available\\s+Balance:")
        const available_balance = parseEcobankAmount(rawBalance)

        const currency = EcobankScraper.extractCurrency(html, parsed.subject ?? "")

        return {
            type,
            account_number,
            merchant,
            merchant_account: null,
            bank: "EcoBank",
            bank_reference,
            timestamp,
            available_balance,
            amount,
            currency
        }
    }
}
