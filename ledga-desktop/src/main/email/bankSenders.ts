export const BANK_SENDER_WEMA = "wemaalert@wemabank.com" as const;
export const BANK_SENDER_OPAY = "no-reply@opay-nigeria.com" as const;
export const BANK_SENDER_GTBANK = "gens@gtbank.com" as const;
export const BANK_SENDER_ECOBANK = "noreply@ecobank.com" as const;
export const BANK_SENDER_FIRSTBANK = "FirstAlert@firstbanknigeria.com" as const;
export const BANK_SENDER_ZENITHBANK = "ebusinessgroup@zenithbank.com" as const;
export const BANK_SENDER_RENMONEY = "noreply@renmoney.com" as const;
export const BANK_SENDER_ACCESSBANK = "no_reply@accessbankplc.com" as const;

export type BankSenderAddress =
  | typeof BANK_SENDER_WEMA
  // | typeof BANK_SENDER_OPAY
  | typeof BANK_SENDER_GTBANK
  | typeof BANK_SENDER_ECOBANK
  | typeof BANK_SENDER_FIRSTBANK
  | typeof BANK_SENDER_ZENITHBANK
  | typeof BANK_SENDER_RENMONEY
  | typeof BANK_SENDER_ACCESSBANK;

export const ALLOWED_BANK_SENDERS: readonly BankSenderAddress[] = [
  BANK_SENDER_WEMA,
  // BANK_SENDER_OPAY,
  BANK_SENDER_GTBANK,
  BANK_SENDER_ECOBANK,
  BANK_SENDER_FIRSTBANK,
  BANK_SENDER_ZENITHBANK,
  BANK_SENDER_RENMONEY,
  BANK_SENDER_ACCESSBANK,
] as const;

export function isAllowedBankSender(addr: string): addr is BankSenderAddress {
  return (ALLOWED_BANK_SENDERS as readonly string[]).includes(addr);
}
