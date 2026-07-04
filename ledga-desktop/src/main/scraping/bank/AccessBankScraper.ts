import { BANK_SENDER_ACCESSBANK } from "../../email/bankSenders"
import type { NormalizedTransaction, ParsedEmail } from "../types"
import type { EmailTransactionType } from "../types"
import { BankScraper } from "./BankScraper"

const MONTH_MAP: Record<string, string> = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12"
}

function extractEmailFromFromHeader(from: string): string {
    const match = from.match(/<([^>]+)>/)
    if (match) return match[1].trim().toLowerCase()
    return from.trim().toLowerCase()
}

function isAccessBankEmail(parsed: ParsedEmail): boolean {
    const addr = extractEmailFromFromHeader(parsed.from)
    if (addr === BANK_SENDER_ACCESSBANK.toLowerCase()) return true

    const html = parsed.html ?? ""
    return /accessbankplc\.com/i.test(html) && /AccessAlert/i.test(html)
}

function extractTableValue(html: string, label: string): string {
    const labelPattern = label.replace(/\s+/g, "\\s+").replace(/\//g, "\\/")
    const re = new RegExp(`<td[^>]*>[\\s\\n]*${labelPattern}[\\s\\n]*</td>[\\s\\S]*?<td[^>]*>([\\s\\S]*?)</td>`, "i")
    const m = html.match(re)
    if (!m) return ""
    return m[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

function parseAccessBankDate(value: string): string {
    const m = value.match(/(\d{1,2})-(\w{3})-(\d{4})/)
    if (!m) return value
    const [, day, monthName, year] = m
    const mon = MONTH_MAP[monthName.toLowerCase()]
    if (!mon) return value
    return `${year}-${mon}-${day.padStart(2, "0")}T00:00:00`
}

function parseAccessBankAmount(value: string): number {
    const cleaned = value
        .replace(/[A-Z]{3}/g, "")
        .replace(/,/g, "")
        .trim()
    const n = Number.parseFloat(cleaned)
    return Number.isFinite(n) ? n : 0
}

export class AccessBankScraper extends BankScraper {
    bankId(): string {
        return "accessbank"
    }

    detect(parsed: ParsedEmail): EmailTransactionType | null {
        if (!isAccessBankEmail(parsed)) return null
        const html = parsed.html ?? ""
        const subject = parsed.subject ?? ""
        if (/Credited/i.test(html) || /\[Credit:/i.test(subject)) return "credit"
        if (/Debited/i.test(html) || /\[Debit:/i.test(subject)) return "debit"
        return null
    }

    parse(parsed: ParsedEmail, type: EmailTransactionType): NormalizedTransaction {
        const html = parsed.html ?? ""
        const subject = parsed.subject ?? ""

        const account_number = extractTableValue(html, "A/C Number")
        const merchant = extractTableValue(html, "Description")
        const bank_reference = extractTableValue(html, "Reference Number")

        const rawDate = extractTableValue(html, "Transaction Date")
        const timestamp = parseAccessBankDate(rawDate)

        const rawBalance = extractTableValue(html, "Available Balance")
        const available_balance = parseAccessBankAmount(rawBalance)

        let amount = 0
        const subjectMatch = subject.match(/\[(?:Credit|Debit):\s*([\d,]+\.?\d*)/i)
        if (subjectMatch) {
            amount = parseAccessBankAmount(subjectMatch[1])
        } else {
            const bodyMatch = html.match(/(?:USD|NGN)\s*([\d,]+\.?\d*)/i)
            if (bodyMatch) amount = parseAccessBankAmount(bodyMatch[1])
        }

        const currency = AccessBankScraper.extractCurrency(html, subject)

        return {
            type,
            account_number,
            merchant,
            merchant_account: null,
            bank: "Access Bank",
            bank_reference,
            timestamp,
            available_balance,
            amount,
            currency
        }
    }
}
