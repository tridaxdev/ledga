import { parse } from "csv-parse/sync"
import type { NormalizedTransaction } from "@/common/types/Transaction"
import type { ParsedCsvRow } from "@/common/types/CsvImportTypes"

const DATE_HEADERS = ["date", "transaction date", "value date", "posting date", "trans date"]
const DESCRIPTION_HEADERS = ["description", "narration", "merchant", "details", "particulars", "remarks"]
const AMOUNT_HEADERS = ["amount", "value"]
const DEBIT_HEADERS = ["debit", "withdrawal", "money out", "dr", "debit amount"]
const CREDIT_HEADERS = ["credit", "deposit", "money in", "cr", "credit amount"]
const BALANCE_HEADERS = ["balance", "running balance", "closing balance", "available balance"]
const REFERENCE_HEADERS = ["reference", "ref", "reference number", "transaction id", "narration id"]

function findColumn(headers: string[], candidates: string[]): string | undefined {
    const lower = headers.map(h => h.toLowerCase().trim())
    for (const candidate of candidates) {
        const index = lower.indexOf(candidate)
        if (index !== -1) return headers[index]
    }
    return undefined
}

function parseAmount(raw: string | undefined): number {
    if (!raw) return 0
    const isParenNegative = /^\(.*\)$/.test(raw.trim())
    const cleaned = raw.replace(/[,₦$€£\s()]/g, "")
    const value = parseFloat(cleaned)
    if (Number.isNaN(value)) return 0
    return isParenNegative ? -Math.abs(value) : value
}

// Best-effort generic bank CSV mapper: matches common column-header aliases rather than assuming
// a fixed schema, since exported statement formats vary a lot bank to bank ("Most banks supported"
// per the import UI copy -- this is what makes that true rather than aspirational).
export function parseCsvStatement(content: string): ParsedCsvRow[] {
    const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true
    }) as Record<string, string>[]

    if (records.length === 0) return []

    const headers = Object.keys(records[0])
    const dateCol = findColumn(headers, DATE_HEADERS)
    const descCol = findColumn(headers, DESCRIPTION_HEADERS)
    const amountCol = findColumn(headers, AMOUNT_HEADERS)
    const debitCol = findColumn(headers, DEBIT_HEADERS)
    const creditCol = findColumn(headers, CREDIT_HEADERS)
    const balanceCol = findColumn(headers, BALANCE_HEADERS)
    const referenceCol = findColumn(headers, REFERENCE_HEADERS)

    return records.map((row, index) => {
        const merchant = (descCol ? row[descCol] : "")?.trim() ?? ""
        const dateStr = (dateCol ? row[dateCol] : "")?.trim() ?? ""
        const parsedDate = dateStr ? new Date(dateStr) : null
        const hasValidDate = parsedDate !== null && !Number.isNaN(parsedDate.getTime())
        const timestamp = hasValidDate ? parsedDate.toISOString() : ""

        let amount = 0
        let type: "credit" | "debit" = "debit"
        if (amountCol && row[amountCol]) {
            const raw = parseAmount(row[amountCol])
            amount = Math.abs(raw)
            type = raw < 0 ? "debit" : "credit"
        } else if (debitCol || creditCol) {
            const creditVal = creditCol ? parseAmount(row[creditCol]) : 0
            const debitVal = debitCol ? parseAmount(row[debitCol]) : 0
            if (creditVal > 0) {
                amount = creditVal
                type = "credit"
            } else {
                amount = Math.abs(debitVal)
                type = "debit"
            }
        }

        const balance = balanceCol ? parseAmount(row[balanceCol]) : 0
        const reference = (referenceCol ? row[referenceCol] : "")?.trim() ?? ""

        const transaction: NormalizedTransaction = {
            type,
            account_number: "",
            merchant,
            merchant_account: null,
            bank: "CSV import",
            // Falls back to a content-derived key when the statement has no reference column, so
            // re-importing the same file still dedupes (see TransactionRepository.existsByBankReference).
            bank_reference: reference || `csv:${dateStr}|${merchant}|${amount}|${index}`,
            timestamp,
            available_balance: balance,
            amount,
            currency: "NGN"
        }

        const needsReview = merchant === "" || amount === 0 || !hasValidDate

        return { transaction, needsReview }
    })
}
