import { BANK_SENDER_WEMA } from "../../email/bankSenders"
import type { NormalizedTransaction, ParsedEmail } from "../types"
import type { EmailTransactionType } from "../types"
import { BankScraper } from "./BankScraper"

function extractEmailFromFromHeader(from: string): string {
    const match = from.match(/<([^>]+)>/)
    if (match) return match[1].trim().toLowerCase()
    return from.trim().toLowerCase()
}

function parseWemaAmount(value: string): number {
    const cleaned = value
        .replace(/,/g, "")
        .replace(/\s*NGN\s*$/i, "")
        .trim()
    const n = Number.parseFloat(cleaned)
    return Number.isFinite(n) ? n : 0
}

function parseWemaTimestamp(value: string): string {
    // Wema format: DD-MM-YYYY HH:mm:ss
    const match = value.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/)
    if (!match) return value
    const [, d, m, y, h, min, s] = match
    return `${y}-${m}-${d}T${h}:${min}:${s}`
}

export class WemaBankScraper extends BankScraper {
    bankId(): string {
        return "wema"
    }

    detect(parsed: ParsedEmail): EmailTransactionType | null {
        const addr = extractEmailFromFromHeader(parsed.from)
        if (addr !== BANK_SENDER_WEMA) return null
        const subj = (parsed.subject ?? "").toLowerCase()
        if (subj.includes("credited")) return "credit"
        if (subj.includes("debited")) return "debit"
        return null
    }

    parse(parsed: ParsedEmail, type: EmailTransactionType): NormalizedTransaction {
        const html = parsed.html ?? ""

        const accountNumberMatch = html.match(/Account\s+Number[\s\S]*?color:\s*#7F7F7F[^>]*>([^<]+)<[\s\S]*?color:\s*#7F7F7F[^>]*>([^<]+)/i)
        const account_number = accountNumberMatch ? accountNumberMatch[2].replace(/\s+/g, " ").trim() : ""

        // Table has label cell, colon cell (#7F7F7F), value cell (#7F7F7F); capture second occurrence
        const descriptionMatch = html.match(/Description[\s\S]*?color:\s*#7F7F7F[^>]*>([^<]+)<[\s\S]*?color:\s*#7F7F7F[^>]*>([^<]+)/i)
        const merchant = descriptionMatch ? descriptionMatch[2].replace(/\s+/g, " ").replace("VAT ALAT NIP TRANSFER TO ", "").replace("COMM ALAT NIP TRANSFER TO ", "").trim() : ""

        const referenceMatch = html.match(/Reference\s+Number[\s\S]*?color:\s*#7F7F7F[^>]*>([^<]+)<[\s\S]*?color:\s*#7F7F7F[^>]*>([^<]+)/i)
        const bank_reference = referenceMatch ? referenceMatch[2].replace(/\s+/g, " ").trim() : ""

        const amountMatch = html.match(/Transaction\s+Amount[\s\S]*?([\d,]+\.?\d*)\s*NGN/i)
        const rawAmount = amountMatch ? parseWemaAmount(`${amountMatch[1]} NGN`) : 0
        const amount = Math.abs(rawAmount)

        const dateTimeMatch = html.match(/Transaction\s+Date\s*&(?:amp;)?\s*Time[\s\S]*?color:\s*#7F7F7F[^>]*>([^<]+)<[\s\S]*?color:\s*#7F7F7F[^>]*>(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})/i)
        const timestamp = dateTimeMatch ? parseWemaTimestamp(dateTimeMatch[2]) : ""

        const balanceMatch = html.match(/Current\s+Balance\s+as\s+at[\s\S]*?([\d,]+\.\.?\d+)\s*NGN/i)
        const available_balance = balanceMatch ? parseWemaAmount(`${balanceMatch[1].replace(/\.\./g, ".")} NGN`) : 0

        const currency = WemaBankScraper.extractCurrency(html, parsed.subject ?? "")

        return {
            type,
            account_number,
            merchant,
            merchant_account: null,
            bank: "Wema",
            bank_reference,
            timestamp,
            available_balance,
            amount,
            currency
        }
    }
}
