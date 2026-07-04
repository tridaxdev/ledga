import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createScrapingManager } from "@/main/scraping/createScrapingManager";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "..", "..", "..", "emails");

describe("ScrapingManager with fixture emails", () => {
  it("scrapes Wema credit email and returns expected transaction", async () => {
    const rawEml = fs.readFileSync(
      path.join(FIXTURES_DIR, "wema_credit.eml"),
      "utf-8",
    );
    const manager = createScrapingManager();
    const result = await manager.scrape(rawEml);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      type: "credit",
      account_number: "0424****06",
      merchant: "ALAT SELF TO SELF TRANSFER - Self to self transfer",
      merchant_account: null,
      bank: "Wema",
      bank_reference: "S17521099",
      timestamp: "2026-02-21T12:26:24",
      available_balance: 10818.02,
      amount: 10000,
    });
  });

  it("scrapes Wema debit email and returns expected transaction", async () => {
    const rawEml = fs.readFileSync(
      path.join(FIXTURES_DIR, "wema_debit.eml"),
      "utf-8",
    );
    const manager = createScrapingManager();
    const result = await manager.scrape(rawEml);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      type: "debit",
      account_number: "0424****06",
      merchant: "POS Buy on 21-02-2026@APPLE..COM/BILL",
      merchant_account: null,
      bank: "Wema",
      bank_reference: "S18594105",
      timestamp: "2026-02-22T03:01:15",
      available_balance: 7840.05,
      amount: 1878.5,
    });
  });

  it("scrapes Wema debit email and returns expected transaction", async () => {
    const rawEml = fs.readFileSync(
      path.join(FIXTURES_DIR, "vat_wema.eml"),
      "utf-8",
    );
    const manager = createScrapingManager();
    const result = await manager.scrape(rawEml);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      type: "debit",
      account_number: "0229****64",
      merchant: "BJORN DONALD EFFIOM BASS",
      merchant_account: null,
      bank: "Wema",
      bank_reference: "S19360920",
      timestamp: "2026-02-22T16:52:15",
      available_balance: 48229.22,
      amount: 0.75,
    });
  });

  it("scrapes Wema debit email and returns expected transaction", async () => {
    const rawEml = fs.readFileSync(
      path.join(FIXTURES_DIR, "comm_wema.eml"),
      "utf-8",
    );
    const manager = createScrapingManager();
    const result = await manager.scrape(rawEml);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      type: "debit",
      account_number: "0229****64",
      merchant: "BJORN DONALD EFFIOM BAS",
      merchant_account: null,
      bank: "Wema",
      bank_reference: "S19360920",
      timestamp: "2026-02-22T16:52:15",
      available_balance: 48229.97,
      amount: 10,
    });
  });

  it("scrapes GTBank credit email and returns expected transaction", async () => {
    const rawEml = fs.readFileSync(
      path.join(FIXTURES_DIR, "gtbank_credit.eml"),
      "utf-8",
    );
    const manager = createScrapingManager();
    const result = await manager.scrape(rawEml);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      type: "credit",
      account_number: "******2362",
      merchant:
        "000017260222155905030369722585-ALAT NIP TRANSFER TO BASSEY BJORN DONALD EFFIOM F",
      merchant_account: null,
      bank: "GTBank",
      bank_reference: "00001726022215590503",
      timestamp: "2026-02-22T16:59:33",
      available_balance: 4882.88,
      amount: 5000,
    });
  });

  it("scrapes GTBank debit email and returns expected transaction", async () => {
    const rawEml = fs.readFileSync(
      path.join(FIXTURES_DIR, "gtbank_debit.eml"),
      "utf-8",
    );
    const manager = createScrapingManager();
    const result = await manager.scrape(rawEml);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      type: "debit",
      account_number: "******2362",
      merchant: "SMS ALERT CHARGE FOR 29-DEC-2025 to 28-JAN-2026",
      merchant_account: null,
      bank: "GTBank",
      bank_reference: "",
      timestamp: "2026-01-30T01:08:28",
      available_balance: -117.12,
      amount: 83.05,
    });
  });

  it("scrapes EcoBank credit email and returns expected transaction", async () => {
    const rawEml = fs.readFileSync(
      path.join(FIXTURES_DIR, "ecobank_credit.eml"),
      "utf-8",
    );
    const manager = createScrapingManager();
    const result = await manager.scrape(rawEml);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      type: "credit",
      account_number: "158******165",
      merchant: "SAVINGS ACCOUNT CREDIT INTEREST",
      merchant_account: null,
      bank: "EcoBank",
      bank_reference: "B05SAINNGN000002",
      timestamp: "29-Aug-2025T00:00:00",
      available_balance: 1451.03,
      amount: 10.17,
    });
  });

  it("scrapes First Bank debit email and returns expected transaction", async () => {
    const rawEml = fs.readFileSync(
      path.join(FIXTURES_DIR, "firstbank_debit.eml"),
      "utf-8",
    );
    const manager = createScrapingManager();
    const result = await manager.scrape(rawEml);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      type: "debit",
      account_number: "310XXXX405",
      merchant: "MasterCard *****8246 Issuance VAT Charge",
      merchant_account: null,
      bank: "First Bank",
      bank_reference: "",
      timestamp: "2021-12-16T11:20:00",
      available_balance: 554859.04,
      amount: 75.0,
    });
  });

  it("scrapes Zenith Bank debit email and returns expected transaction", async () => {
    const rawEml = fs.readFileSync(
      path.join(FIXTURES_DIR, "zenith_debit.eml"),
      "utf-8",
    );
    const manager = createScrapingManager();
    const result = await manager.scrape(rawEml);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      type: "debit",
      account_number: "217****264",
      merchant: "***RSVL VC POS Loc-508615276548--UBER TRIPS Lekki, NG",
      merchant_account: null,
      bank: "Zenith Bank",
      bank_reference: "",
      timestamp: "2025-03-27T00:00:00",
      available_balance: 6806.29,
      amount: 4670.0,
    });
  });

  it("scrapes RenMoney debit email and returns expected transaction", async () => {
    const rawEml = fs.readFileSync(
      path.join(FIXTURES_DIR, "renmoney_debit.eml"),
      "utf-8",
    );
    const manager = createScrapingManager();
    const result = await manager.scrape(rawEml);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      type: "debit",
      account_number: "1147027311",
      merchant:
        "You just sent some money from your Renmoney account to Cecil Akpan.",
      merchant_account: null,
      bank: "RenMoney",
      bank_reference: "",
      timestamp: "2025-03-28T15:24:00",
      available_balance: 478325.08,
      amount: 79000.0,
    });
  });

  it("scrapes Access Bank credit email and returns expected transaction", async () => {
    const rawEml = fs.readFileSync(
      path.join(FIXTURES_DIR, "access_credit.eml"),
      "utf-8",
    );
    const manager = createScrapingManager();
    const result = await manager.scrape(rawEml);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      type: "credit",
      account_number: "150******879",
      merchant: "CSH DEP 6335723 ISAH IDRIS @CALABAR 1",
      merchant_account: null,
      bank: "Access Bank",
      bank_reference: "147CHDP250495029",
      timestamp: "2025-02-18T00:00:00",
      available_balance: 13.26,
      amount: 20.0,
    });
  });

  // it("scrapes Opay transfer email and returns expected transaction", async () => {
  //   const rawEml = fs.readFileSync(
  //     path.join(FIXTURES_DIR, "opay_transfer.eml"),
  //     "utf-8",
  //   );
  //   const manager = createScrapingManager();
  //   const result = await manager.scrape(rawEml);

  //   expect(result).not.toBeNull();
  //   expect(result).toMatchObject({
  //     type: "debit",
  //     bank: "Opay",
  //     merchant: "iFitness SANGOTEDO",
  //     account_number: "",
  //     merchant_account: "6114034199",
  //     bank_reference: "260210010100046382642401",
  //     timestamp: "2026-02-10T08:00:57",
  //     amount: -1800,
  //     available_balance: 14795.33,
  //   });
  // });

  // it("scrapes Opay payment email and returns expected transaction", async () => {
  //   const rawEml = fs.readFileSync(
  //     path.join(FIXTURES_DIR, "opay_payment.eml"),
  //     "utf-8",
  //   );
  //   const manager = createScrapingManager();
  //   const result = await manager.scrape(rawEml);

  //   expect(result).not.toBeNull();
  //   expect(result).toMatchObject({
  //     type: "debit",
  //     bank: "Opay",
  //     merchant: "Chowdeck",
  //     account_number: "",
  //     merchant_account: null,
  //     bank_reference: "260112140300164464884554",
  //     timestamp: "2026-01-12T12:07:58",
  //     amount: -1172,
  //     available_balance: 21307.91,
  //   });
  // });
});
