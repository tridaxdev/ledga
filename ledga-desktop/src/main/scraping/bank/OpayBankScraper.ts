import { BANK_SENDER_OPAY } from "../../email/bankSenders";
import type { NormalizedTransaction, ParsedEmail } from "../types";
import type { EmailTransactionType } from "../types";
import { BankScraper } from "./BankScraper";

const MONTH_NAMES: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

function extractEmailFromFromHeader(from: string): string {
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1].trim().toLowerCase();
  return from.trim().toLowerCase();
}

function parseOpayDate(value: string): string {
  // "Feb 10th, 2026 08:00:57" or "Jan 12th, 2026 12:07:58"
  const match = value.match(
    /^(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?,\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/i,
  );
  if (!match) return "";
  const [, mon, d, y, h, min, s] = match;
  const month = MONTH_NAMES[mon.toLowerCase()];
  if (!month) return "";
  const day = d.padStart(2, "0");
  const hour = h.padStart(2, "0");
  return `${y}-${month}-${day}T${hour}:${min}:${s}`;
}

function extractOpayDetail(html: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `>\\s*${escaped}\\s*</span>[\\s\\S]*?left_em[\\s\\S]*?<span>([^<]*)</span`,
    "i",
  );
  const m = html.match(re);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function parseOpayAmount(raw: string): number {
  const cleaned = raw
    .replace(/[\s\u00A0]/g, "")
    .replace(/^[₦NGN]+/i, "")
    .replace(/,/g, "")
    .trim();
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export class OpayBankScraper extends BankScraper {
  bankId(): string {
    return "opay";
  }

  detect(parsed: ParsedEmail): EmailTransactionType | null {
    const addr = extractEmailFromFromHeader(parsed.from);
    if (addr !== BANK_SENDER_OPAY) return null;
    const subj = (parsed.subject ?? "").toLowerCase();
    if (
      subj.includes("transfer successful") ||
      subj.includes("payment successful")
    )
      return "debit";
    return null;
  }

  parse(
    parsed: ParsedEmail,
    type: EmailTransactionType,
  ): NormalizedTransaction {
    const html = parsed.html ?? "";
    const subject = parsed.subject ?? "";
    const isTransfer = /Transfer\s+Details/i.test(html);
    const currency = OpayBankScraper.extractCurrency(html, subject);

    if (isTransfer) {
      const merchant = extractOpayDetail(html, "Name:");
      const recipientAccountNumber = extractOpayDetail(html, "Account Number:");
      const amountRaw = extractOpayDetail(html, "Amount:");
      const rawAmount = parseOpayAmount(amountRaw);
      const amount =
        type === "debit" ? -Math.abs(rawAmount) : Math.abs(rawAmount);
      const bank_reference = extractOpayDetail(html, "Transaction No.:");
      const dateRaw = extractOpayDetail(html, "Transaction Date:");
      const timestamp = parseOpayDate(dateRaw);
      const balanceMatch = html.match(
        /available\s+balance\s+is[\s\S]*?(?:₦|NGN)\s*([\d,]+\.?\d*)/i,
      );
      const available_balance = balanceMatch
        ? parseOpayAmount(balanceMatch[1].trim())
        : 0;

      return {
        type: "debit",
        account_number: "",
        merchant,
        merchant_account: recipientAccountNumber || null,
        bank: "Opay",
        bank_reference,
        timestamp,
        available_balance,
        amount,
        currency,
      };
    }

    // Payment: require currency symbol so we don't match stray numbers
    const amountMatch = html.match(
      /payment\s+of[\s\S]*?(?:₦|NGN)\s*([\d,]+\.?\d*)/i,
    );
    const rawAmount = amountMatch ? parseOpayAmount(amountMatch[1]) : 0;
    const amount = Math.abs(rawAmount);

    const balanceMatch = html.match(
      /available\s+balance\s+is[\s\S]*?(?:₦|NGN)\s*([\d,]+\.?\d*)/i,
    );
    const available_balance = balanceMatch
      ? parseOpayAmount(balanceMatch[1].trim())
      : 0;

    const merchant = extractOpayDetail(html, "Merchant Name:");
    const bank_reference = extractOpayDetail(html, "Transaction No.:");
    const dateRaw = extractOpayDetail(html, "Transaction Date:");
    const timestamp = parseOpayDate(dateRaw);

    return {
      type: "debit",
      account_number: "",
      merchant,
      merchant_account: null,
      bank: "Opay",
      bank_reference,
      timestamp,
      available_balance,
      amount,
      currency,
    };
  }
}
