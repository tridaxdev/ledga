import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ConnectionRepository } from "../connections/ConnectionRepository";
import type { Logger } from "../logging/FileLogger";
import type { BackgroundWorkerManager } from "../BackgroundWorker/BackgroundWorkerManager";
import type { GoogleOAuthService } from "../connections/GoogleOAuthService";
import type { BackgroundTask } from "../BackgroundWorker/WorkerPool";
import type { MainWindowNotificationService } from "../windowManagement/MainWindowNotification";
import type { CategoryRepository } from "../categories/CategoryRepository";
import type { TransactionRepository } from "../transactions/TransactionRepository";
import type { BillPaymentService } from "../billPayments/BillPaymentService";
import type { TokenStorageService } from "../encryption/TokenStorageService";
import type { RulesService } from "../rules/RulesService";
import type { EmailApi } from "./EmailApi";
import type { ConnectionWithTokens } from "./GmailApi";
import { GmailApi as GmailApiClass } from "./GmailApi";
import type { EmailRepository } from "./emailRepository";
import type {
  EmailInsertInput,
  EmailRow,
  EmailStatus,
} from "./emailRepository";
import type { EmailMessageHeader } from "./EmailApi";
import type { Connection } from "@/common/types/Connection";
import {
  ProcessingPriority,
  type EmailProcessingTaskPayload,
  type EmailProcessingWorkerResult,
  type EmailMetadataTaskPayload,
  type EmailMetadataWorkerResult,
} from "@/common/types/FileProcessingTypes";
import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc";

const EMAIL_TASK_TYPE = "email_processing";
const EMAIL_METADATA_TASK_TYPE = "email_metadata";
const EMAIL_TASK_TIMEOUT_MS = 120_000;
const EMAIL_METADATA_TASK_TIMEOUT_MS = 30_000;
const EMAILS_DIR = "emails";

export interface FetchAndStoreResult {
  newCount: number;
}

export class EmailService {
  private readonly emailsDir: string;
  private readonly emailProcessingPromises = new Map<
    string,
    Promise<EmailProcessingWorkerResult>
  >();
  onTokenRefreshFailed: ((connectionId: string) => void) | null = null;

  constructor(
    private readonly connectionRepository: ConnectionRepository,
    private readonly emailRepository: EmailRepository,
    private readonly transactionRepository: TransactionRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly rulesService: RulesService,
    private readonly backgroundWorkerManager: BackgroundWorkerManager,
    private readonly googleOAuthService: GoogleOAuthService,
    private readonly tokenStorage: TokenStorageService,
    private readonly notificationService: MainWindowNotificationService,
    userDataPath: string,
    private readonly logger: Logger,
    private readonly billPaymentService: BillPaymentService,
  ) {
    this.emailsDir = path.join(userDataPath, EMAILS_DIR);
  }

  private resolveCategoryIdFromRuleName(
    categoryName: string | undefined,
  ): string | undefined {
    if (!categoryName?.trim()) return undefined;
    return (
      this.categoryRepository.findIdByDisplayName(categoryName) ?? undefined
    );
  }

  private notifyProcessingUpdate(): void {
    const counts = this.emailRepository.getProcessingCounts();
    this.notificationService.notifyMainWindow(
      AllowedChannelIpc.EmailsProcessingUpdate,
      counts,
    );
  }

  getProcessingCounts(): { processing: number; failed: number } {
    return this.emailRepository.getProcessingCounts();
  }

  private createEmailApi(connection: ConnectionWithTokens): EmailApi {
    const refreshTokensFn = async (
      conn: ConnectionWithTokens,
    ): Promise<ConnectionWithTokens> => {
      const storedRefreshToken = await this.tokenStorage.getRefreshToken(
        conn.id,
      );
      if (!storedRefreshToken) {
        this.onTokenRefreshFailed?.(conn.id);
        throw new Error("No refresh token available in keychain");
      }
      try {
        const tokens =
          await this.googleOAuthService.refreshAccessToken(storedRefreshToken);
        await this.tokenStorage.setTokens(
          conn.id,
          tokens.accessToken,
          tokens.refreshToken ?? storedRefreshToken,
        );
        await this.connectionRepository.update(conn.id, {
          expiry_date: Math.floor(tokens.expiryDate.getTime() / 1000),
        });
        return {
          id: conn.id,
          expiryDate: tokens.expiryDate,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? storedRefreshToken,
        };
      } catch (err) {
        this.onTokenRefreshFailed?.(conn.id);
        throw err;
      }
    };
    return new GmailApiClass(connection, this.logger, refreshTokensFn);
  }

  private isGmailConnection(connection: Connection): boolean {
    return (
      connection.email.toLowerCase().includes("gmail.com") ||
      connection.email.toLowerCase().includes("googlemail.com")
    );
  }

  private async getConnectionAndApi(
    connectionId: string,
  ): Promise<{ connection: Connection; api: EmailApi }> {
    const connection = await this.connectionRepository.findById(connectionId);
    if (!connection) {
      this.logger.error("fetchAndStoreEmails: connection not found", {
        connectionId,
      });
      throw new Error(`Connection not found: ${connectionId}`);
    }
    const accessToken = await this.tokenStorage.getAccessToken(connectionId);
    const refreshToken = await this.tokenStorage.getRefreshToken(connectionId);
    if (!accessToken || !refreshToken) {
      this.logger.error("fetchAndStoreEmails: connection missing tokens", {
        connectionId,
      });
      throw new Error("Connection has no access or refresh token");
    }
    if (!this.isGmailConnection(connection)) {
      this.logger.error("fetchAndStoreEmails: unsupported provider", {
        connectionId,
        email: connection.email,
      });
      throw new Error(
        `Unsupported email provider for ${connection.email}; only Gmail is supported`,
      );
    }
    this.logger.debug("fetchAndStoreEmails: using Gmail API", {
      connectionId,
    });
    const expiryDate = connection.expiry_date
      ? new Date(connection.expiry_date * 1000)
      : undefined;
    const api = this.createEmailApi({
      id: connectionId,
      expiryDate,
      accessToken,
      refreshToken,
    });
    return { connection, api };
  }

  private handleMetadataResult(
    connectionId: string,
    row: EmailRow,
    result: EmailMetadataWorkerResult,
  ): void {
    if ("skipped" in result && result.skipped) {
      this.emailRepository.updateStatus(row.id, "failed");
      this.notifyProcessingUpdate();
      return;
    }
    const meta = result as Extract<
      EmailMetadataWorkerResult,
      { emailId: string }
    >;
    this.handleMetadataSuccess(connectionId, row, meta);
  }

  private handleMetadataSuccess(
    connectionId: string,
    row: EmailRow,
    meta: {
      emailId: string;
      fromAddr: string;
      timestamp: number;
      contentForHash: string;
    },
  ): void {
    const contentHash = crypto
      .createHash("sha256")
      .update(meta.contentForHash)
      .digest("hex");
    this.emailRepository.updateMetadata(
      row.id,
      meta.fromAddr,
      meta.timestamp,
      contentHash,
    );
    this.logger.debug("Updated email row with metadata", {
      id: row.id,
      emailId: meta.emailId,
      fromAddr: meta.fromAddr,
    });
    if (this.emailProcessingPromises.has(row.id)) {
      return;
    }
    this.enqueueEmailProcessingTask(connectionId, row);
  }

  private enqueueEmailProcessingTask(
    connectionId: string,
    row: EmailRow,
  ): void {
    const payload: EmailProcessingTaskPayload = {
      emailId: row.id,
      connectionId,
      appStorageDir: this.emailsDir,
    };
    const processingTask: BackgroundTask<
      EmailProcessingTaskPayload,
      EmailProcessingWorkerResult
    > = {
      id: row.id,
      type: EMAIL_TASK_TYPE,
      priority: ProcessingPriority.HIGH,
      payload,
      timeout: EMAIL_TASK_TIMEOUT_MS,
      resolve: () => {},
      reject: () => {},
      enqueuedAt: 0,
    };
    const promise = this.backgroundWorkerManager
      .executeTask(processingTask)
      .catch((err) => {
        this.logger.error("Background email task failed", {
          emailId: row.id,
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        } as EmailProcessingWorkerResult;
      });
    this.emailProcessingPromises.set(row.id, promise);
    promise
      .then((processingResult) => {
        if (
          processingResult.success &&
          processingResult.transaction &&
          !this.transactionRepository.findByEmailId(row.id)
        ) {
          const applied = this.rulesService.applyRules(
            processingResult.transaction.merchant,
          );
          const inserted = this.transactionRepository.insert({
            emailId: row.id,
            ...processingResult.transaction,
            merchant: applied.merchant,
            categoryId: this.resolveCategoryIdFromRuleName(applied.category),
          });
          this.billPaymentService.tryLinkAfterInsert(inserted);
          this.logger.debug("Persisted transaction from email", {
            emailId: row.id,
            bank: processingResult.transaction.bank,
          });
        }
        this.emailRepository.updateStatus(
          row.id,
          processingResult.success ? "processed" : "failed",
        );
        this.notifyProcessingUpdate();
        if (processingResult.success) {
          this.notificationService.notifyMainWindow(
            AllowedChannelIpc.EmailsPulled,
            { connectionId, newCount: 1 },
          );
        }
      })
      .finally(() => {
        this.emailProcessingPromises.delete(row.id);
      });
    this.notifyProcessingUpdate();
  }

  private enqueueMetadataTaskForMessage(
    connectionId: string,
    providerMessageId: string,
    now: number,
  ): boolean {
    const existing = this.emailRepository.findByConnectionAndEmailId(
      connectionId,
      providerMessageId,
    );
    if (existing) {
      this.logger.debug("Skipping duplicate email_id", {
        connectionId,
        emailId: providerMessageId,
      });
      return false;
    }
    const placeholderInput: EmailInsertInput = {
      connectionId,
      fromAddr: "",
      emailId: providerMessageId,
      timestamp: 0,
      contentHash: "",
      retrievedAt: now,
      fileUrl: null,
      status: "processing",
    };
    const row = this.emailRepository.insert(placeholderInput);
    this.logger.debug("Inserted placeholder email row", {
      id: row.id,
      emailId: providerMessageId,
    });
    this.notifyProcessingUpdate();

    const taskId = `metadata-${connectionId}-${providerMessageId}`;
    const metadataPayload: EmailMetadataTaskPayload = {
      connectionId,
      providerMessageId,
    };
    const metadataTask: BackgroundTask<
      EmailMetadataTaskPayload,
      EmailMetadataWorkerResult
    > = {
      id: taskId,
      type: EMAIL_METADATA_TASK_TYPE,
      priority: ProcessingPriority.NORMAL,
      payload: metadataPayload,
      timeout: EMAIL_METADATA_TASK_TIMEOUT_MS,
      resolve: () => {},
      reject: () => {},
      enqueuedAt: 0,
    };
    this.backgroundWorkerManager
      .executeTask(metadataTask)
      .then((result) => {
        this.handleMetadataResult(connectionId, row, result);
      })
      .catch((err) => {
        this.logger.error("Background email metadata task failed", {
          taskId,
          providerMessageId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return true;
  }

  async fetchAndStoreEmails(
    connectionId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<FetchAndStoreResult> {
    this.logger.info("fetchAndStoreEmails start", {
      connectionId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
    const { api } = await this.getConnectionAndApi(connectionId);
    const messageList = await api.listMessages(startDate, endDate);
    this.logger.info("Fetched message list from API", {
      connectionId,
      count: messageList.length,
    });
    const now = Math.floor(Date.now() / 1000);
    let candidatesEnqueued = 0;
    for (const { id: providerMessageId } of messageList) {
      if (
        this.enqueueMetadataTaskForMessage(connectionId, providerMessageId, now)
      ) {
        candidatesEnqueued++;
      }
    }
    this.logger.info("Enqueued metadata tasks", {
      connectionId,
      candidatesEnqueued,
    });
    this.notificationService.notifyMainWindow(AllowedChannelIpc.EmailsPulled, {
      connectionId,
      newCount: candidatesEnqueued,
    });
    return { newCount: candidatesEnqueued };
  }

  async getMessageMetadataForWorker(
    connectionId: string,
    providerMessageId: string,
  ): Promise<EmailMessageHeader | null> {
    const connection = await this.connectionRepository.findById(connectionId);
    if (!connection) {
      this.logger.debug("getMessageMetadataForWorker: no connection", {
        connectionId,
      });
      return null;
    }
    const accessToken = await this.tokenStorage.getAccessToken(connectionId);
    const refreshToken = await this.tokenStorage.getRefreshToken(connectionId);
    if (!accessToken || !refreshToken) {
      this.logger.debug("getMessageMetadataForWorker: no tokens in keychain", {
        connectionId,
      });
      return null;
    }
    if (!this.isGmailConnection(connection)) {
      this.logger.debug(
        "getMessageMetadataForWorker: not a Gmail connection, skipping",
        { connectionId, email: connection.email },
      );
      return null;
    }
    const expiryDate = connection.expiry_date
      ? new Date(connection.expiry_date * 1000)
      : undefined;
    const api = this.createEmailApi({
      id: connectionId,
      expiryDate,
      accessToken,
      refreshToken,
    });
    if (
      !("getMessageMetadata" in api) ||
      typeof api.getMessageMetadata !== "function"
    ) {
      this.logger.debug(
        "getMessageMetadataForWorker: API has no getMessageMetadata",
        { connectionId },
      );
      return null;
    }
    const result = await (api as GmailApiClass).getMessageMetadata(
      providerMessageId,
    );
    if (result === null) {
      this.logger.debug("getMessageMetadataForWorker: API returned null", {
        connectionId,
        providerMessageId,
      });
    }
    return result;
  }

  async waitForEmails(
    emailIds: string[],
  ): Promise<EmailProcessingWorkerResult[]> {
    const promises = emailIds
      .map((id) => this.emailProcessingPromises.get(id))
      .filter(
        (p): p is Promise<EmailProcessingWorkerResult> => p !== undefined,
      );
    if (promises.length === 0) {
      this.logger.debug("waitForEmails: no in-flight promises for given ids", {
        requestedCount: emailIds.length,
      });
      return [];
    }
    this.logger.debug("waitForEmails: waiting for emails", {
      count: promises.length,
    });
    return Promise.all(promises);
  }

  async waitForConnectionEmails(
    connectionId: string,
  ): Promise<EmailProcessingWorkerResult[]> {
    const ids = this.emailRepository.findIdsByConnectionAndStatus(
      connectionId,
      ["pending", "processing"] as EmailStatus[],
    );
    return this.waitForEmails(ids);
  }

  enqueuePendingEmails(): void {
    const processingIds = this.emailRepository.findIdsByStatus(["processing"]);
    for (const id of processingIds) {
      this.emailRepository.updateStatus(id, "pending");
    }
    const pendingIds = this.emailRepository.findIdsByStatus(["pending"]);
    this.logger.info("Resuming pending email processing", {
      count: pendingIds.length,
    });
    for (const id of pendingIds) {
      if (this.emailProcessingPromises.has(id)) continue;
      const row = this.emailRepository.findById(id);
      if (!row) continue;
      const payload: EmailProcessingTaskPayload = {
        emailId: row.id,
        connectionId: row.connection_id,
        appStorageDir: this.emailsDir,
      };
      const task: BackgroundTask<
        EmailProcessingTaskPayload,
        EmailProcessingWorkerResult
      > = {
        id: row.id,
        type: EMAIL_TASK_TYPE,
        priority: ProcessingPriority.HIGH,
        payload,
        timeout: EMAIL_TASK_TIMEOUT_MS,
        resolve: () => {},
        reject: () => {},
        enqueuedAt: 0,
      };
      const promise = this.backgroundWorkerManager
        .executeTask(task)
        .catch((err) => {
          this.logger.error("Background email task failed (resume)", {
            emailId: row.id,
            error: err instanceof Error ? err.message : String(err),
          });
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          } as EmailProcessingWorkerResult;
        });
      this.emailProcessingPromises.set(row.id, promise);
      promise
        .then((result) => {
          this.emailRepository.updateStatus(
            row.id,
            result.success ? "processed" : "failed",
          );
          this.notifyProcessingUpdate();
          if (
            result.success &&
            result.transaction &&
            !this.transactionRepository.findByEmailId(row.id)
          ) {
            const applied = this.rulesService.applyRules(
              result.transaction.merchant,
            );
            const inserted = this.transactionRepository.insert({
              emailId: row.id,
              ...result.transaction,
              merchant: applied.merchant,
              categoryId: this.resolveCategoryIdFromRuleName(applied.category),
            });
            this.billPaymentService.tryLinkAfterInsert(inserted);
            this.logger.debug("Persisted transaction from email", {
              emailId: row.id,
              bank: result.transaction.bank,
            });
          }
        })
        .finally(() => {
          this.emailProcessingPromises.delete(row.id);
        });
    }
  }

  async getEmailContentAndSaveToFile(
    connectionId: string,
    emailRowId: string,
  ): Promise<string> {
    this.logger.info("getEmailContentAndSaveToFile start", {
      connectionId,
      emailId: emailRowId,
    });
    const row = this.emailRepository.findById(emailRowId);
    if (!row) {
      this.logger.error("getEmailContentAndSaveToFile: email row not found", {
        connectionId,
        emailId: emailRowId,
      });
      throw new Error(`Email not found: ${emailRowId}`);
    }
    if (row.file_url && fs.existsSync(row.file_url)) {
      this.logger.debug("getEmailContentAndSaveToFile: file already exists", {
        filePath: row.file_url,
      });
      return row.file_url;
    }
    const connection = await this.connectionRepository.findById(connectionId);
    if (!connection) {
      throw new Error("Connection not found");
    }
    const accessToken = await this.tokenStorage.getAccessToken(connectionId);
    const refreshToken = await this.tokenStorage.getRefreshToken(connectionId);
    if (!accessToken || !refreshToken) {
      this.logger.error(
        "getEmailContentAndSaveToFile: connection tokens missing",
        { connectionId },
      );
      throw new Error("Connection not found or missing tokens");
    }
    const expiryDate = connection.expiry_date
      ? new Date(connection.expiry_date * 1000)
      : undefined;
    const api = this.createEmailApi({
      id: connectionId,
      expiryDate,
      accessToken,
      refreshToken,
    });
    const rawContent = await api.getMessageContent(row.email_id);
    this.logger.debug("Fetched email content", {
      emailId: emailRowId,
      contentLength: rawContent.length,
    });
    if (!fs.existsSync(this.emailsDir)) {
      fs.mkdirSync(this.emailsDir, { recursive: true });
    }
    const fileName = `${emailRowId}.eml`;
    const filePath = path.join(this.emailsDir, fileName);
    fs.writeFileSync(filePath, rawContent, "utf-8");
    this.logger.debug("Wrote email file", { filePath });
    if (!fs.existsSync(filePath)) {
      throw new Error(`File was not created: ${filePath}`);
    }
    this.emailRepository.updateFileUrl(emailRowId, filePath);
    this.emailRepository.updateStatus(emailRowId, "processing");
    this.notifyProcessingUpdate();
    this.logger.info("getEmailContentAndSaveToFile done", {
      connectionId,
      emailId: emailRowId,
      filePath,
    });
    return filePath;
  }
}
