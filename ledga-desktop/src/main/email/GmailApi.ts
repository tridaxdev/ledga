import type { Logger } from "../logging/FileLogger";
import type {
  EmailApi,
  EmailMessageHeader,
  EmailMessageListItem,
} from "./EmailApi";
import { ALLOWED_BANK_SENDERS } from "./bankSenders";
import {
  GMAIL_MESSAGES_LIST_MAX_TOTAL,
  GMAIL_MESSAGES_LIST_PAGE_SIZE,
} from "./constants";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

interface GmailMessageListResponse {
  messages?: { id: string }[];
  nextPageToken?: string;
}

interface GmailMessageMetadataResponse {
  payload?: {
    headers?: { name: string; value: string }[];
    snippet?: string;
  };
  internalDate?: string;
}

interface GmailMessageRawResponse {
  raw?: string;
}

export interface ConnectionWithTokens {
  id: string;
  expiryDate?: Date;
  accessToken: string;
  refreshToken: string;
}

export type RefreshTokensFn = (
  connection: ConnectionWithTokens,
) => Promise<ConnectionWithTokens>;

export class GmailApi implements EmailApi {
  constructor(
    private connection: ConnectionWithTokens,
    private readonly logger: Logger,
    private readonly refreshTokens: RefreshTokensFn,
  ) {}

  private async ensureValidToken(): Promise<void> {
    const marginMs = 60 * 1000;
    const expired =
      !this.connection.expiryDate ||
      this.connection.expiryDate.getTime() - marginMs < Date.now();
    if (expired) {
      this.logger.warn(
        "Gmail API: access token expired or expiring, refreshing",
      );
      this.connection = await this.refreshTokens(this.connection);
    }
  }

  /** Returns a valid access token (refreshing if needed). */
  async getValidAccessToken(): Promise<string> {
    await this.ensureValidToken();
    return this.connection.accessToken;
  }

  private async request<T>(
    path: string,
    options: {
      method?: string;
      query?: Record<string, string>;
      body?: unknown;
    } = {},
  ): Promise<T> {
    await this.ensureValidToken();
    const url = new URL(`${GMAIL_API_BASE}${path}`);
    if (options.query) {
      Object.entries(options.query).forEach(([k, v]) =>
        url.searchParams.set(k, v),
      );
    }
    const init: RequestInit = {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${this.connection.accessToken}`,
      },
    };
    if (options.body !== undefined) {
      (init.headers as Record<string, string>)["Content-Type"] =
        "application/json";
      init.body = JSON.stringify(options.body);
    }
    const res = await fetch(url.toString(), init);
    if (res.status === 401) {
      this.logger.warn("Gmail API: 401, refreshing token and retrying");
      this.connection = await this.refreshTokens(this.connection);
      const retryInit: RequestInit = {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Bearer ${this.connection.accessToken}`,
        },
      };
      if (options.body !== undefined) {
        (retryInit.headers as Record<string, string>)["Content-Type"] =
          "application/json";
        retryInit.body = JSON.stringify(options.body);
      }
      const retry = await fetch(url.toString(), retryInit);
      if (!retry.ok) {
        this.logger.error("Gmail API retry failed", {
          status: retry.status,
          statusText: retry.statusText,
        });
        throw new Error(`Gmail API error: ${retry.status} ${retry.statusText}`);
      }
      return retry.json() as Promise<T>;
    }
    if (!res.ok) {
      this.logger.error("Gmail API error", {
        status: res.status,
        statusText: res.statusText,
      });
      throw new Error(`Gmail API error: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  async listMessages(
    startDate: Date,
    endDate: Date,
  ): Promise<EmailMessageListItem[]> {
    const after = Math.floor(startDate.getTime() / 1000);
    const before = Math.floor(endDate.getTime() / 1000);
    const fromQuery = ALLOWED_BANK_SENDERS.map((addr) => `from:${addr}`).join(
      " OR ",
    );
    const q = `after:${after} before:${before} (${fromQuery})`;
    this.logger.debug("Gmail API list messages", {
      after,
      before,
      q: q.slice(0, 80),
    });
    const collected: { id: string }[] = [];
    let pageToken: string | undefined;
    do {
      const query: Record<string, string> = {
        q,
        maxResults: String(GMAIL_MESSAGES_LIST_PAGE_SIZE),
      };
      if (pageToken) {
        query.pageToken = pageToken;
      }
      const page = await this.request<GmailMessageListResponse>("/messages", {
        query,
      });
      const batch = page.messages ?? [];
      for (const m of batch) {
        collected.push(m);
        if (collected.length >= GMAIL_MESSAGES_LIST_MAX_TOTAL) {
          return collected
            .slice(0, GMAIL_MESSAGES_LIST_MAX_TOTAL)
            .map((m) => ({ id: m.id }));
        }
      }
      pageToken = page.nextPageToken;
    } while (pageToken);

    return collected.map((m) => ({ id: m.id }));
  }

  async getMessageMetadata(
    providerMessageId: string,
  ): Promise<EmailMessageHeader | null> {
    try {
      const msg = await this.request<GmailMessageMetadataResponse>(
        `/messages/${providerMessageId}`,
        {
          query: { format: "full" },
        },
      );
      const fromHeader = msg.payload?.headers?.find(
        (h: { name: string; value: string }) => h.name.toLowerCase() === "from",
      );
      const fromAddr = fromHeader?.value?.trim() ?? "";
      const match = fromAddr.match(/<([^>]+)>/);
      const fromEmail = match
        ? match[1].trim().toLowerCase()
        : fromAddr.trim().toLowerCase();
      if (
        !ALLOWED_BANK_SENDERS.some((a) => fromEmail.includes(a.toLowerCase()))
      ) {
        this.logger.debug(
          "Gmail API: getMessageMetadata skipped, From not in allowed list",
          { providerMessageId, fromEmail, fromAddr: fromAddr.slice(0, 80) },
        );
        return null;
      }

      const dateHeader = msg.payload?.headers?.find(
        (h: { name: string; value: string }) => h.name.toLowerCase() === "date",
      );
      let timestamp: number;
      if (msg.internalDate) {
        timestamp = Math.floor(Number(msg.internalDate) / 1000);
      } else if (dateHeader?.value) {
        timestamp = Math.floor(new Date(dateHeader.value).getTime() / 1000);
      } else {
        timestamp = Math.floor(Date.now() / 1000);
      }
      const snippet = msg.payload?.snippet ?? "";
      return {
        emailId: providerMessageId,
        fromAddr: fromEmail,
        timestamp,
        contentForHash: `${fromAddr}\n${dateHeader?.value ?? ""}\n${snippet}`,
      };
    } catch (err) {
      this.logger.warn("Gmail API: getMessageMetadata error", {
        providerMessageId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async getMessageContent(providerMessageId: string): Promise<string> {
    this.logger.debug("Gmail API get message content", {
      messageId: providerMessageId,
    });
    const msg = await this.request<GmailMessageRawResponse>(
      `/messages/${providerMessageId}`,
      { query: { format: "raw" } },
    );
    if (!msg.raw) {
      throw new Error("Gmail API: no raw content in response");
    }
    const base64 = msg.raw.replace(/-/g, "+").replace(/_/g, "/");
    const padding = base64.length % 4;
    const padded = padding === 0 ? base64 : base64 + "=".repeat(4 - padding);
    const raw = Buffer.from(padded, "base64").toString("utf-8");
    return raw;
  }
}
