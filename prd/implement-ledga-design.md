# PRD: Implement Ledga.dc.html Design

## Problem Statement

Ledga already has a capable backend pipeline — Gmail OAuth, email fetching, per-bank HTML scrapers for Nigerian banks, a background worker pool, and a SQLite database layer. However, the app has no usable UI. Users currently open a blank "Home" screen with no way to view their transactions, connect an email account, configure categorisation rules, or query their financial data via the AI assistant. The full product experience designed in `Ledga.dc.html` is completely unimplemented.

## Solution

Implement the main application shell, all four primary screens (Ledger, Assistant, Settings, Category Review), both modal flows (Connect Gmail, Import CSV), and all the missing backend repositories, services, and IPC channels that the existing email pipeline already expects but that do not yet exist. The result is a fully functional local-first finance tracker: users connect their Gmail, bank transaction emails are scraped into a local SQLite ledger, a rules engine auto-categorises and renames merchants, and a Gemini Flash-powered assistant lets users query their financial data in plain language.

## User Stories

### Ledger & Transactions

1. As a user, I want to see a ledger of all my parsed bank transactions, so that I have one place to review my financial activity.
2. As a user, I want to see a Balance, Money In, and Money Out summary for the selected period, so that I can understand my financial position at a glance.
3. As a user, I want to filter the ledger by month, year, or a custom date range, so that I can focus on a specific period.
4. As a user, I want to search my transactions by merchant name, so that I can quickly find a specific payment.
5. As a user, I want to see each transaction's date, merchant, category, source, and amount in the ledger table, so that I have full context per row.
6. As a user, I want to see which source (Gmail sync or imported statement) each transaction came from, so that I know where the data originated.
7. As a user, I want transactions with missing critical fields (blank merchant, zero amount, or no timestamp) flagged for review, so that I can fix bad data before relying on it.
8. As a user, I want an amber banner in the ledger when flagged transactions exist, with a "Review" button, so that I am prompted to fix them without being blocked.
9. As a user, I want to click a category badge on any transaction row and reassign it to a different category from a dropdown, so that I can correct miscategorised transactions inline.
10. As a user, I want all transactions to persist to a local SQLite file, so that my data is available offline and never leaves my device.

### Category Review Screen

11. As a user, I want to click a category in the ledger and open a Category Review screen, so that I can analyse all spending in that category.
12. As a user, I want to see total spent, transaction count, and month-over-month trend for the selected category, so that I can understand my spending pattern.
13. As a user, I want to see a list of all transactions in the category, each with an inline category-reassignment dropdown, so that I can bulk-correct mismatches.
14. As a user, I want to see AI-suggested re-categorisations for flagged transactions, so that I have a starting point for corrections.
15. As a user, I want to accept or dismiss each suggestion individually, so that I stay in control of my data.

### Gmail Connection

16. As a user, I want to connect my Gmail account through a guided modal, so that Ledga can read my bank transaction emails.
17. As a user, I want the connection modal to explain exactly what Ledga reads (bank emails only, amounts/dates/merchants only, stored locally), so that I trust the app before granting access.
18. As a user, I want to authorise Gmail through a standard Google OAuth flow, so that my credentials are never handled by the app.
19. As a user, I want to choose between automatic sync (Gmail push watch) and manual sync, so that I control how often Ledga checks for new emails.
20. As a user, I want to see a confirmation screen after connecting that shows the first transactions found, so that I know the integration is working.
21. As a user, I want the Gmail OAuth token to be stored in the OS keychain, not a plain file, so that my credentials are protected.
22. As a user, I want to trigger a manual sync from the Settings screen with a "Sync now" button, so that I can fetch new emails on demand.
23. As a user, I want to toggle auto-sync on or off after the initial connection, so that I can change my preference later.
24. As a user, I want to disconnect my Gmail account from Settings, so that I can revoke access if I change my mind.

### CSV Statement Import

25. As a user, I want to import a CSV bank statement by dropping a file onto a modal or clicking to browse, so that I can add transactions from banks without email notifications.
26. As a user, I want the import to run in the background so that I can keep working while rows are parsed.
27. As a user, I want to see live progress (rows parsed / total rows, transactions added) while the import runs, so that I know it is working.
28. As a user, I want a "Go to ledger" button in the import modal once parsing begins, so that I am not forced to wait for completion.
29. As a user, I want imported transactions to appear in the ledger as they are parsed, not only after the import completes, so that I see results immediately.
30. As a user, I want CSV rows with missing critical fields to be saved but flagged for review, so that no data is silently dropped.

### Rules Engine

31. As a user, I want to create a rule that matches on keywords in a transaction's merchant or description, so that I can automate categorisation.
32. As a user, I want a rule to be able to set the category for matched transactions, so that I do not have to manually assign categories.
33. As a user, I want a rule to be able to rename the merchant display name for matched transactions, so that abbreviated bank descriptions become readable labels.
34. As a user, I want rules to be applied retroactively to all existing transactions when a rule is saved, so that my entire ledger benefits immediately.
35. As a user, I want to see a list of all my rules in Settings, so that I can review, edit, and delete them.
36. As a user, I want to add a new rule from the Settings Rules section, specifying a keyword, an optional new merchant name, and an optional category, so that the rule creation flow is self-contained.
37. As a user, I want rules to be evaluated in order, stopping at the first match, so that rule behaviour is predictable.

### AI Assistant

38. As a user, I want to ask questions about my finances in plain language and receive answers grounded in my actual ledger data, so that I do not need to run queries myself.
39. As a user, I want the assistant to query my local SQLite ledger as a tool call, so that answers are based on my real transactions.
40. As a user, I want to see which transactions and accounts the assistant queried (a collapsible tool-call disclosure), so that I can verify the answer.
41. As a user, I want the assistant to stream its reply token by token, so that I see output immediately rather than waiting for the full response.
42. As a user, I want suggested question prompts ("Biggest expense this month?", "Compare to April", "List my subscriptions") when the chat is idle, so that I have a starting point.
43. As a user, I want my past chat conversations to persist across app restarts in a list in the left nav, so that I can revisit previous queries.
44. As a user, I want to start a new chat with a "+" button in the nav, so that I can begin a fresh context without losing old conversations.
45. As a user, I want the assistant to display tabular results inline when a query produces a list of amounts by category, so that I can scan the data without reading prose.

### Settings — Sources & Data

46. As a user, I want to see all my connected sources (Gmail accounts and imported statements) in one place in Settings, so that I have an overview of my data inputs.
47. As a user, I want to see the current sync status of my Gmail connection, so that I know when it last synced and whether it is healthy.
48. As a user, I want to see the local path of my SQLite database file in Settings, so that I know where my data is stored.
49. As a user, I want to export all my transactions as a CSV from Settings, so that I can use my data in other tools.
50. As a user, I want a "Clear all data" option in Settings that deletes the local ledger, so that I can fully reset the app.
51. As a user, I want to configure the sync frequency (real-time watch vs. manual) from Settings, so that I can change it without reconnecting.
52. As a user, I want a "Reveal" button next to the database path that opens the file in Finder, so that I can easily locate and back up my data.

### Activity Tray

53. As a user, I want a live activity indicator in the title bar that shows when a background job (email sync or import) is running, so that I know the app is working.
54. As a user, I want to click the activity pill to open a tray that shows progress for all running and recently completed jobs, so that I can check the status of any job.
55. As a user, I want the tray to show per-job progress bars for imports and a spinning icon for email sync, so that I can distinguish job types at a glance.

### General Shell

56. As a user, I want a persistent left navigation with Ledger and Settings entries plus a chat history list, so that I can switch between sections instantly.
57. As a user, I want the app's title bar to show the current section name, so that I always know where I am.
58. As a user, I want my profile (name and email) shown at the bottom of the nav, so that I can confirm which account is connected.

## Implementation Decisions

### New Backend Modules (main process)

**TransactionRepository**
Wraps the `transactions` SQLite table. Exposes insert, find-by-id, find-by-email-id, paginated query with date-range and search filters, update-category, update-merchant, mark-needs-review, and aggregate queries (sum by type, count). The table stores: id, email_id (nullable), source (`gmail` | `csv`), type (`credit` | `debit`), account_number, merchant, bank, bank_reference, timestamp (unix seconds), available_balance, amount, currency, category_id (FK, nullable), needs_review (boolean), created_at.

**CategoryRepository**
Wraps a `categories` table. Seeded at migration time with a fixed default set (Groceries, Food, Transport, Housing, Utilities, Health, Entertainment, Subscriptions, Income, Transfer, Other). Exposes find-all, find-by-id, find-id-by-display-name. Categories have: id, name, color (hex).

**RulesRepository + RulesService**
`RulesRepository` wraps a `rules` table: id, match_keyword (case-insensitive substring), rename_merchant (nullable), category_name (nullable), position (integer for ordering), created_at.

`RulesService` exposes `applyRules(merchant): { merchant, category }` (already called by `EmailService`) and `applyRulesRetroactively()` which re-runs all rules against every transaction in the ledger and updates category_id and merchant where a rule now matches. Called whenever a rule is created, updated, or deleted.

**ConnectionRepository**
Wraps a `connections` table: id, email, provider (`gmail`), auto_sync (boolean), gmail_watch_expiry (unix seconds, nullable), created_at. Exposes find-all, find-by-id, insert, update, delete.

**TokenStorageService**
Thin wrapper around the OS keychain (using `electron-store` with encryption or the system keychain via `safeStorage`). Stores and retrieves access_token and refresh_token keyed by connection_id. Exposes `getAccessToken`, `getRefreshToken`, `setTokens`, `deleteTokens`.

**GoogleOAuthService**
Handles the OAuth2 PKCE flow in the main process. Opens a system browser via `shell.openExternal`, listens on a local loopback server for the redirect, exchanges the code for tokens, and returns them. Exposes `startOAuthFlow(email): Promise<Tokens>` and `refreshAccessToken(refreshToken): Promise<Tokens>`.

**AssistantService**
Fresh, minimal service. Uses the Vercel AI SDK with the Google Gemini Flash provider. Exposes a `streamChat(chatId, messages, onChunk, onDone)` method that runs in the main process. Has one tool: `search_transactions` — accepts a SQLite-compatible filter (date range, category, account, keyword) and returns matching rows directly from `TransactionRepository`. Streams tokens to the renderer via an IPC push channel. Does not reuse `ConversationManagement`.

**ChatRepository**
Wraps `chats` and `chat_messages` tables. `chats`: id, title, created_at, updated_at. `chat_messages`: id, chat_id, role (`user` | `assistant`), content (text), tool_calls (JSON, nullable), created_at. Exposes create-chat, find-all-chats, find-messages-by-chat, append-message.

**CSV Import Pipeline**
A new background worker task type `csv_import`. Accepts a file path, reads the file, maps columns to `NormalizedTransaction` fields, flags rows with missing merchant/amount/timestamp as `needs_review`, and inserts via `TransactionRepository` row-by-row. Reports progress via IPC push. Source field is set to `csv`.

**NormalizedTransaction (common type)**
Define `NormalizedTransaction` in `@/common/types/` (currently imported but missing). Fields: type, account_number, merchant, merchant_account (nullable), bank, bank_reference, timestamp, available_balance, amount, currency.

### New IPC Channels
Add to `AllowedChannelIpc`:
- `transactions:query` — paginated + filtered fetch
- `transactions:update-category` — reassign category
- `transactions:update-merchant` — rename merchant
- `categories:get-all`
- `rules:get-all`, `rules:create`, `rules:update`, `rules:delete`
- `connections:get-all`, `connections:create`, `connections:delete`, `connections:update`
- `connections:sync-now` — trigger manual Gmail fetch
- `emails:processing-update` (push) — background job progress
- `emails:pulled` (push) — new transactions available
- `assistant:stream-chunk` (push) — token streaming
- `assistant:send` — start a chat turn
- `assistant:stop` — cancel in-flight stream
- `chats:get-all`, `chats:create`, `chats:get-messages`
- `csv:import` — kick off CSV import
- `csv:import-progress` (push) — per-row progress
- `settings:export-csv` — export all transactions
- `settings:clear-data` — wipe the ledger
- `settings:reveal-db` — open database location in Finder

### SQLite Migrations
New migration files (sorted after existing ones):
1. `transactions` table
2. `categories` table with default seed rows
3. `rules` table
4. `connections` table
5. `chats` + `chat_messages` tables

### Frontend (Renderer)

**Router structure** (TanStack Router file-based routes):
- `/` → redirects to `/ledger`
- `/ledger` — Ledger screen
- `/ledger/$categoryId` — Category Review screen
- `/assistant/$chatId` — Assistant screen (chat)
- `/settings` — Settings screen (Sources & data + Rules subsection)

**Design tokens**: Geist (sans) + Crimson Text (serif headings/numbers) loaded from local font files. Tailwind v4 CSS variables for the warm cream palette (`#fcf9f1` bg, `#037b68` brand green, `#1f1b16` primary text, `#8e8270` muted text, `#e5dfcc` borders).

**Key frontend components**:
- `AppShell` — title bar, left nav, main content area
- `ActivityPill` + `ActivityTray` — background job status
- `DateRangePicker` — Month / Year / Custom segmented dropdown
- `TransactionTable` — virtualised list, category badge with inline dropdown
- `StatCards` — Balance / Money in / Money out
- `ConnectGmailModal` — 4-step wizard
- `ImportCsvModal` — 2-step (drop → progress)
- `AssistantChat` — message list, tool-call disclosure, streaming input
- `RulesList` + `RuleForm` — Settings Rules section

**State / data fetching**: All API calls via hooks that invoke IPC (per the existing `apiClient.ts` pattern in the renderer). No direct DB access from the renderer.

### Rules Retroactive Application
When any rule is created, updated, or deleted, `RulesService.applyRulesRetroactively()` runs synchronously in the main process (it's a SQLite update-many — fast enough for typical ledger sizes) and then pushes a `transactions:query` invalidation event to the renderer so it re-fetches.

### Low-Confidence Flag
A transaction gets `needs_review = true` at insert time when: merchant is blank or whitespace-only, amount is 0, or timestamp is 0 / missing. This applies to both the email scraping pipeline and CSV import. The flag can be cleared by the user manually reassigning the category or merchant.

## Testing Decisions

A good test for this codebase exercises the module's public interface only — it does not assert on internal state, private methods, or implementation details. Tests should be runnable without an Electron process (pure Node/Vitest). Integration tests that hit a real in-memory SQLite database are strongly preferred over mocked database tests, since mocks have historically masked schema mismatches.

**Modules to test:**

- `RulesService` — `applyRules()` and `applyRulesRetroactively()` with an in-memory SQLite database seeded with known transactions. Verify keyword matching is case-insensitive, that the first matching rule wins, and that retroactive application updates the correct rows.
- `ScrapingManager` — parse known fixture `.eml` files for each supported bank and assert the returned `NormalizedTransaction` has the correct amount, merchant, timestamp, and type. These tests already exist as `scrapers.test.ts`; extend them as new scrapers are added.
- `CSV import worker` — feed known CSV fixtures (valid rows, rows with missing fields, rows with partial data) and assert the correct `NormalizedTransaction` list with appropriate `needs_review` flags.
- `TransactionRepository` — insert, query with date-range filters, update-category, aggregate (sum by type). Use an in-memory database.
- `AssistantService` — mock the Gemini Flash API response and assert that the `search_transactions` tool is called with the correct parameters when a user asks a question that requires a date-filtered query.

## Out of Scope

- **Onboarding flow** (Welcome, How it works, Choose first source screens) — deferred to a later iteration.
- **PDF and OFX statement import** — only CSV is supported in v1.
- **AI-based transaction extraction** — extraction uses the existing rule-based bank scrapers only; Gemini Flash is only used for the assistant chat.
- **Bill payment service** (`BillPaymentService`) — referenced in the email pipeline but not part of this PRD.
- **Opay scraper** — commented out in `ScrapingRegistry`; not in scope.
- **Multi-account filtering** — the "All accounts" dropdown in the ledger is rendered but not wired in v1.
- **App auto-update UI** — the update flow exists in `AppTypes` but the design does not include it.
- **i18n translations** — all strings ship in English only; the i18n infrastructure remains but no additional language is added.
- **Sync frequency setting** — the dropdown is rendered in Settings but only real-time (Gmail watch) and manual options exist; no configurable polling interval.

## Further Notes

- The codebase was adapted from a prior project ("WritingPal"). The `ConversationManagement`, `AssetManagement`, `FileProcessing`, and `QuoteScan` modules are not used by Ledga and should be left untouched rather than deleted — they may be cleaned up in a separate housekeeping PR.
- The existing `AllowedChannelIpc` enum contains channels from the prior project (`ConversationGetAll`, `AssetsGetById`, etc.) — these can be ignored; do not delete them yet.
- `emailService.ts` is written and imports from repositories that do not yet exist (`TransactionRepository`, `CategoryRepository`, `RulesService`, `ConnectionRepository`, `BillPaymentService`, `TokenStorageService`). Building those missing modules is part of this PRD and will make `EmailService` compilable.
- The Nigerian bank scrapers (GTBank, Zenith, Access, Ecobank, FirstBank, Renmoney, Wema) are already production-quality. Do not refactor them as part of this PRD.
- `NormalizedTransaction` is currently imported from `@/common/types/FileProcessingTypes` but that type does not exist there. Define it in a new `@/common/types/Transaction.ts` and update the import in `scraping/types.ts`.
