import { simpleParser } from "mailparser"
import type { ParsedMail } from "mailparser"
import type { NormalizedTransaction, ParsedEmail } from "./types"
import type { ScrapingRegistry } from "./ScrapingRegistry"

function mapParsedMailToParsedEmail(mail: ParsedMail): ParsedEmail {
    const from = mail.from && typeof mail.from === "object" && "text" in mail.from ? (mail.from as { text: string }).text : ""
    return {
        from,
        subject: mail.subject ?? "",
        html: typeof mail.html === "string" ? mail.html : "",
        text: mail.text
    }
}

export class ScrapingManager {
    constructor(private readonly registry: ScrapingRegistry) {}

    async parseRawEmail(rawEml: string): Promise<ParsedEmail> {
        const mail = await simpleParser(rawEml)
        return mapParsedMailToParsedEmail(mail)
    }

    async scrape(rawEml: string): Promise<NormalizedTransaction | null> {
        const parsed = await this.parseRawEmail(rawEml)
        const bankId = this.registry.detectBank(parsed)
        if (!bankId) return null
        const scraper = this.registry.getScraper(bankId)
        if (!scraper) return null
        const type = scraper.detect(parsed)
        if (!type) return null
        return scraper.parse(parsed, type)
    }
}
