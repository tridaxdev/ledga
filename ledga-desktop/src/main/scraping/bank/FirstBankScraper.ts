import { BANK_SENDER_FIRSTBANK } from "../../email/bankSenders";
import type { NormalizedTransaction, ParsedEmail } from "../types";
import type { EmailTransactionType } from "../types";
import { BankScraper } from "./BankScraper";

function extractEmailFromFromHeader(from: string): string {
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1].trim().toLowerCase();
  return from.trim().toLowerCase();
}

function isFirstBankEmail(parsed: ParsedEmail): boolean {
  const addr = extractEmailFromFromHeader(parsed.from);
  if (addr === BANK_SENDER_FIRSTBANK.toLowerCase()) return true;

  const html = parsed.html ?? "";
  return (
    /FirstAlert@firstbanknigeria\.com/i.test(html) &&
    /FirstBank\s+Alert/i.test(html)
  );
}

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
  dec: "12",
};

function extractBoldLabelValue(html: string, label: string): string {
  const labelPattern = label.replace(/\s+/g, "\\s*").replace(/\//g, "\\/");
  const re = new RegExp(
    `<p[^>]*font-weight:\\s*bold[^>]*>\\s*${labelPattern}\\s*</p>[\\s\\S]*?<p[^>]*>([^<]*)</p>`,
    "i",
  );
  const m = html.match(re);
  if (!m) return "";
  return m[1]
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseForwardedHeaderDate(html: string): string {
  const re =
    /Date:\s*\w+,\s*(\w+)\s+(\d{1,2}),\s*(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i;
  const m = html.match(re);
  if (!m) return "";
  const [, monthName, day, year, hourStr, min, ampm] = m;
  const mon = MONTH_MAP[monthName.toLowerCase().slice(0, 3)];
  if (!mon) return "";
  let hour = Number.parseInt(hourStr, 10);
  if (ampm.toUpperCase() === "PM" && hour !== 12) hour += 12;
  if (ampm.toUpperCase() === "AM" && hour === 12) hour = 0;
  return `${year}-${mon}-${day.padStart(2, "0")}T${String(hour).padStart(2, "0")}:${min}:00`;
}

function parseBodyDateTime(raw: string): string {
  const m = raw.match(
    /(\d{1,2})-(\w{3})-(\d{2,4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i,
  );
  if (!m) return raw;
  const [, day, monthName, yearShort, hourStr, min, ampm] = m;
  const mon = MONTH_MAP[monthName.toLowerCase()];
  if (!mon) return raw;
  const year = yearShort.length === 2 ? `20${yearShort}` : yearShort;
  let hour = Number.parseInt(hourStr, 10);
  if (ampm.toUpperCase() === "PM" && hour !== 12) hour += 12;
  if (ampm.toUpperCase() === "AM" && hour === 12) hour = 0;
  return `${year}-${mon}-${day.padStart(2, "0")}T${String(hour).padStart(2, "0")}:${min}:00`;
}

function parseFirstBankAmount(value: string): number {
  const cleaned = value
    .replace(/NGN/gi, "")
    .replace(/&nbsp;/gi, "")
    .replace(/\u00a0/g, "")
    .replace(/,/g, "")
    .replace(/\s*(DR|CR)\s*$/i, "")
    .trim();
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export class FirstBankScraper extends BankScraper {
  bankId(): string {
    return "firstbank";
  }

  detect(parsed: ParsedEmail): EmailTransactionType | null {
    if (!isFirstBankEmail(parsed)) return null;
    const html = parsed.html ?? "";
    const amountRaw = extractBoldLabelValue(html, "Amount");
    if (/DR\s*$/i.test(amountRaw)) return "debit";
    if (/CR\s*$/i.test(amountRaw)) return "credit";
    return null;
  }

  parse(
    parsed: ParsedEmail,
    type: EmailTransactionType,
  ): NormalizedTransaction {
    const html = parsed.html ?? "";

    const account_number = extractBoldLabelValue(html, "Account Number");
    const merchant = extractBoldLabelValue(html, "Narration");

    const amountRaw = extractBoldLabelValue(html, "Amount");
    const absAmount = parseFirstBankAmount(amountRaw);
    const amount = Math.abs(absAmount);

    const clearedRaw = extractBoldLabelValue(html, "Cleared Balance");
    const available_balance = parseFirstBankAmount(clearedRaw);

    const timestamp =
      parseForwardedHeaderDate(html) ||
      parseBodyDateTime(extractBoldLabelValue(html, "Date/Time"));

    const currency = FirstBankScraper.extractCurrency(
      html,
      parsed.subject ?? "",
    );

    return {
      type,
      account_number,
      merchant,
      merchant_account: null,
      bank: "First Bank",
      bank_reference: "",
      timestamp,
      available_balance,
      amount,
      currency,
    };
  }
}
