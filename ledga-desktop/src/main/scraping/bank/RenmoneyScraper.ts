import { BANK_SENDER_RENMONEY } from "../../email/bankSenders";
import type { NormalizedTransaction, ParsedEmail } from "../types";
import type { EmailTransactionType } from "../types";
import { BankScraper } from "./BankScraper";

function extractEmailFromFromHeader(from: string): string {
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1].trim().toLowerCase();
  return from.trim().toLowerCase();
}

function isRenmoneyEmail(parsed: ParsedEmail): boolean {
  const addr = extractEmailFromFromHeader(parsed.from);
  if (addr === BANK_SENDER_RENMONEY.toLowerCase()) return true;

  const html = parsed.html ?? "";
  return /noreply@renmoney\.com/i.test(html) && /Renmoney/i.test(html);
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#?\w+;/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\u202f/g, " ");
}

function getBodyText(parsed: ParsedEmail): string {
  if (parsed.text) return parsed.text;
  return stripHtmlToText(parsed.html ?? "");
}

function parseRenmoneyAmount(value: string): number {
  const cleaned = value
    .replace(/[\u20a6]/g, "")
    .replace(/NGN/gi, "")
    .replace(/,/g, "")
    .trim();
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export class RenmoneyScraper extends BankScraper {
  bankId(): string {
    return "renmoney";
  }

  detect(parsed: ParsedEmail): EmailTransactionType | null {
    if (!isRenmoneyEmail(parsed)) return null;
    const content = (parsed.html ?? "") + (parsed.text ?? "");
    if (/Debit\s+(?:Amount|Transaction)/i.test(content)) return "debit";
    if (/Credit\s+(?:Amount|Transaction)/i.test(content)) return "credit";
    return null;
  }

  parse(
    parsed: ParsedEmail,
    type: EmailTransactionType,
  ): NormalizedTransaction {
    const text = getBodyText(parsed);

    const acctMatch = text.match(/Account\s+number:\s*\n\s*(\S+)/i);
    const account_number = acctMatch ? acctMatch[1].trim() : "";

    const merchantMatch = text.match(
      /Hi\s+\w+,\s*\n\n([\s\S]+?)\.\s*Please\s+see\s+details\s+below/i,
    );
    const merchant = merchantMatch
      ? `${merchantMatch[1].replace(/\s+/g, " ").trim()}.`
      : "";

    const dateMatch = text.match(/\nDate:\s*\n\s*(\d{2}\/\d{2}\/\d{4})/);
    const timeMatch = text.match(/\nTime:\s*\n\s*(\d{2}:\d{2})/);
    let timestamp = "";
    if (dateMatch) {
      const [day, month, year] = dateMatch[1].split("/");
      const time = timeMatch ? timeMatch[1] : "00:00";
      timestamp = `${year}-${month}-${day}T${time}:00`;
    }

    const amountMatch = text.match(
      /(?:Debit|Credit)\s+Amount:?\s*\n?\s*[\u20a6]?([\d,]+\.?\d*)/i,
    );
    const absAmount = amountMatch ? parseRenmoneyAmount(amountMatch[1]) : 0;
    const amount = Math.abs(absAmount);

    const balanceMatch = text.match(
      /current\s+balance[\s\S]*?[\u20a6]\s*([\d,]+\.?\d*)/i,
    );
    const available_balance = balanceMatch
      ? parseRenmoneyAmount(balanceMatch[1])
      : 0;

    const currency = RenmoneyScraper.extractCurrency(
      parsed.html ?? "",
      parsed.subject ?? "",
    );

    return {
      type,
      account_number,
      merchant,
      merchant_account: null,
      bank: "RenMoney",
      bank_reference: "",
      timestamp,
      available_balance,
      amount,
      currency,
    };
  }
}
