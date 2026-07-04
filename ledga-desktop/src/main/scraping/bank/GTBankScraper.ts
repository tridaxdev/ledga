import { BANK_SENDER_GTBANK } from "../../email/bankSenders"
import type { NormalizedTransaction, ParsedEmail } from "../types"
import type { EmailTransactionType } from "../types"
import { BankScraper } from "./BankScraper"

function extractEmailFromFromHeader(from: string): string {
    const match = from.match(/<([^>]+)>/)
    if (match) return match[1].trim().toLowerCase()
    return from.trim().toLowerCase()
}

function parseGTBankAmount(value: string): number {
    const cleaned = value
        .replace(/,/g, "")
        .replace(/\s/g, "")
        .replace(/&nbsp;/gi, "")
        .trim()
    const n = Number.parseFloat(cleaned)
    return Number.isFinite(n) ? n : 0
}

function parseGTBankTimeTo24h(timeStr: string): string {
    const match = timeStr.match(/^(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i)
    if (!match) return "00:00:00"
    const [, h, min, s, ampm] = match
    let hour = Number.parseInt(h, 10)
    if (ampm.toUpperCase() === "PM" && hour !== 12) hour += 12
    if (ampm.toUpperCase() === "AM" && hour === 12) hour = 0
    return `${String(hour).padStart(2, "0")}:${min}:${s}`
}

function extractTableValue(html: string, label: string): string {
    const labelEsc = label.replace(/\s+/g, "\\s+")
    const re = new RegExp(`${labelEsc}\\s*<\\/td>[\\s\\S]*?<td[^>]*>\\s*:\\s*<\\/td>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`, "i")
    const m = html.match(re)
    if (!m) return ""
    return m[1].replace(/\s+/g, " ").replace(/=\s*/g, " ").trim()
}

export class GTBankScraper extends BankScraper {
    bankId(): string {
        return "gtbank"
    }

    detect(parsed: ParsedEmail): EmailTransactionType | null {
        const addr = extractEmailFromFromHeader(parsed.from)
        if (addr !== BANK_SENDER_GTBANK) return null
        const html = parsed.html ?? ""
        if (/\bDEBIT\b/.test(html)) return "debit"
        if (/\bCREDIT\b/.test(html)) return "credit"
        return null
    }

    parse(parsed: ParsedEmail, type: EmailTransactionType): NormalizedTransaction {
        const html = parsed.html ?? ""

        const account_number = extractTableValue(html, "Account Number")
        const merchant = extractTableValue(html, "Description")

        const amountCell = extractTableValue(html, "Amount")
        const rawAmount = amountCell ? parseGTBankAmount(amountCell.replace(/^NGN\s*/i, "")) : 0
        const amount = Math.abs(rawAmount)

        const valueDateMatch = html.match(/Value\s+Date[\s\S]*?(\d{4}-\d{2}-\d{2})/i)
        const valueDate = valueDateMatch ? valueDateMatch[1] : ""

        const timeMatch = html.match(/Time\s+of\s+Transaction[\s\S]*?(\d{1,2}:\d{2}:\d{2}\s*[AP]M)/i)
        const time24 = timeMatch ? parseGTBankTimeTo24h(timeMatch[1].trim()) : "00:00:00"
        const timestamp = valueDate && time24 ? `${valueDate}T${time24}` : ""

        const bank_reference = extractTableValue(html, "Document Number")

        const availableBalanceMatch = html.match(/Available\s+Balance[\s\S]*?NGN\s*(?:&nbsp;)?\s*(-?\s*[\d,]+\.?\d*)/i)
        const available_balance = availableBalanceMatch ? parseGTBankAmount(availableBalanceMatch[1]) : 0

        const currency = GTBankScraper.extractCurrency(html, parsed.subject ?? "")

        return {
            type,
            account_number,
            merchant,
            merchant_account: null,
            bank: "GTBank",
            bank_reference,
            timestamp,
            available_balance,
            amount,
            currency
        }
    }
}
