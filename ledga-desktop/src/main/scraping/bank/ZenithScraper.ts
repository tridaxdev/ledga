import { BANK_SENDER_ZENITHBANK } from "../../email/bankSenders"
import type { NormalizedTransaction, ParsedEmail } from "../types"
import type { EmailTransactionType } from "../types"
import { BankScraper } from "./BankScraper"

function extractEmailFromFromHeader(from: string): string {
    const match = from.match(/<([^>]+)>/)
    if (match) return match[1].trim().toLowerCase()
    return from.trim().toLowerCase()
}

function isZenithEmail(parsed: ParsedEmail): boolean {
    const addr = extractEmailFromFromHeader(parsed.from)
    if (addr === BANK_SENDER_ZENITHBANK.toLowerCase()) return true

    const html = parsed.html ?? ""
    return /ebusinessgroup@zenithbank\.com/i.test(html) && /ZENITH\s+BANK/i.test(html)
}

function extractTableValue(html: string, label: string): string {
    const labelPattern = label.replace(/\s+/g, "\\s+")
    const re = new RegExp(`<td[^>]*>\\s*${labelPattern}\\s*</td>\\s*<td[^>]*>([^<]*)</td>`, "i")
    const m = html.match(re)
    if (!m) return ""
    return m[1]
        .replace(/&nbsp;/gi, " ")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

function parseZenithAmount(value: string): number {
    const cleaned = value.replace(/NGN/gi, "").replace(/,/g, "").trim()
    const n = Number.parseFloat(cleaned)
    return Number.isFinite(n) ? n : 0
}

function parseZenithDate(value: string): string {
    const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (!m) return value
    const [, day, month, year] = m
    return `${year}-${month}-${day}T00:00:00`
}

export class ZenithScraper extends BankScraper {
    bankId(): string {
        return "zenithbank"
    }

    detect(parsed: ParsedEmail): EmailTransactionType | null {
        if (!isZenithEmail(parsed)) return null
        const html = parsed.html ?? ""
        const txType = extractTableValue(html, "Transaction Type")
        if (/DEBIT/i.test(txType)) return "debit"
        if (/CREDIT/i.test(txType)) return "credit"
        return null
    }

    parse(parsed: ParsedEmail, type: EmailTransactionType): NormalizedTransaction {
        const html = parsed.html ?? ""

        const account_number = extractTableValue(html, "Account Number")
        const merchant = extractTableValue(html, "Description")
        const bank_reference = extractTableValue(html, "Reference Code")

        const rawDate = extractTableValue(html, "Date of Transaction")
        const timestamp = parseZenithDate(rawDate)

        const rawAmount = extractTableValue(html, "Amount")
        const amount = Math.abs(parseZenithAmount(rawAmount))

        const rawBalance = extractTableValue(html, "Current Balance")
        const available_balance = parseZenithAmount(rawBalance)

        const currency = ZenithScraper.extractCurrency(html, parsed.subject ?? "")

        return {
            type,
            account_number,
            merchant,
            merchant_account: null,
            bank: "Zenith Bank",
            bank_reference,
            timestamp,
            available_balance,
            amount,
            currency
        }
    }
}
