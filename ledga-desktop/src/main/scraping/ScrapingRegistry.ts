import {
    BANK_SENDER_ACCESSBANK,
    BANK_SENDER_ECOBANK,
    BANK_SENDER_FIRSTBANK,
    BANK_SENDER_GTBANK,
    // BANK_SENDER_OPAY,
    BANK_SENDER_RENMONEY,
    BANK_SENDER_WEMA,
    BANK_SENDER_ZENITHBANK
} from "../email/bankSenders"
import type { BankScraper } from "./bank/BankScraper"
import type { ParsedEmail } from "./types"

const SENDER_TO_BANK_ID: Readonly<Record<string, string>> = {
    [BANK_SENDER_WEMA]: "wema",
    // [BANK_SENDER_OPAY]: "opay",
    [BANK_SENDER_GTBANK]: "gtbank",
    [BANK_SENDER_ECOBANK]: "ecobank",
    [BANK_SENDER_FIRSTBANK]: "firstbank",
    [BANK_SENDER_ZENITHBANK]: "zenithbank",
    [BANK_SENDER_RENMONEY]: "renmoney",
    [BANK_SENDER_ACCESSBANK]: "accessbank"
} as const

function extractEmailFromHeader(from: string): string | null {
    const match = from.match(/<([^>]+)>/)
    if (match) return match[1].trim().toLowerCase()
    return from.trim().toLowerCase()
}

export class ScrapingRegistry {
    private readonly scrapers = new Map<string, BankScraper>()

    register(scraper: BankScraper): void {
        this.scrapers.set(scraper.bankId(), scraper)
    }

    getScraper(bankId: string): BankScraper | undefined {
        return this.scrapers.get(bankId)
    }

    detectBank(parsed: ParsedEmail): string | null {
        const addr = extractEmailFromHeader(parsed.from)
        if (addr && SENDER_TO_BANK_ID[addr]) return SENDER_TO_BANK_ID[addr]

        for (const [, scraper] of this.scrapers) {
            if (scraper.detect(parsed) !== null) return scraper.bankId()
        }

        return null
    }
}
