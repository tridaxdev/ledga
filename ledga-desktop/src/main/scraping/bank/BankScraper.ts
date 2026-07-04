import type { NormalizedTransaction, ParsedEmail } from "../types";
import type { EmailTransactionType } from "../types";

export abstract class BankScraper {
  abstract bankId(): string;

  abstract detect(parsed: ParsedEmail): EmailTransactionType | null;

  abstract parse(
    parsed: ParsedEmail,
    type: EmailTransactionType,
  ): NormalizedTransaction;

  protected static extractCurrency(html: string, subject: string): string {
    const text = `${html} ${subject}`;
    const codeMatch = text.match(/\b(USD|GBP|EUR|GHS|KES|ZAR|XOF|NGN)\b/i);
    if (codeMatch) return codeMatch[1].toUpperCase();
    if (/₦/.test(text)) return "NGN";
    if (/\$/.test(text)) return "USD";
    if (/£/.test(text)) return "GBP";
    if (/€/.test(text)) return "EUR";
    return "NGN";
  }
}
