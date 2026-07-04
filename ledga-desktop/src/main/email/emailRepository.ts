import { randomUUID } from "node:crypto"
import type { DatabaseManager } from "../Database/DatabaseManager"
import type { Logger } from "../logging/FileLogger"

export type EmailStatus = "pending" | "processing" | "processed" | "failed"

export interface EmailRow {
    id: string
    connection_id: string
    from_addr: string
    email_id: string
    timestamp: number
    content_hash: string
    retrieved_at: number
    file_url: string | null
    status: EmailStatus
}

export interface EmailInsertInput {
    connectionId: string
    fromAddr: string
    emailId: string
    timestamp: number
    contentHash: string
    retrievedAt: number
    fileUrl?: string | null
    status: EmailStatus
}

export class EmailRepository {
    constructor(
        private readonly db: DatabaseManager,
        private readonly logger: Logger
    ) {}

    insert(input: EmailInsertInput, id?: string): EmailRow {
        const rowId = id ?? randomUUID()
        const sql = `
      INSERT INTO emails (
        id, connection_id, from_addr, email_id, timestamp,
        content_hash, retrieved_at, file_url, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
        this.db.executeQuery(sql, [rowId, input.connectionId, input.fromAddr, input.emailId, input.timestamp, input.contentHash, input.retrievedAt, input.fileUrl ?? null, input.status])
        this.logger.debug("EmailRepository.insert", {
            id: rowId,
            connectionId: input.connectionId,
            emailId: input.emailId
        })
        return this.findById(rowId) as EmailRow
    }

    findByConnectionAndEmailId(connectionId: string, emailId: string): EmailRow | null {
        const sql = "SELECT * FROM emails WHERE connection_id = ? AND email_id = ? LIMIT 1"
        const rows = this.db.executeQuery(sql, [connectionId, emailId]) as EmailRow[] | unknown
        const list = Array.isArray(rows) ? rows : []
        return list.length > 0 ? (list[0] as EmailRow) : null
    }

    findById(id: string): EmailRow | null {
        const sql = "SELECT * FROM emails WHERE id = ? LIMIT 1"
        const rows = this.db.executeQuery(sql, [id]) as EmailRow[] | unknown
        const list = Array.isArray(rows) ? rows : []
        return list.length > 0 ? (list[0] as EmailRow) : null
    }

    updateStatus(id: string, status: EmailStatus): void {
        const sql = "UPDATE emails SET status = ? WHERE id = ?"
        this.db.executeQuery(sql, [status, id])
        this.logger.debug("EmailRepository.updateStatus", { id, status })
    }

    updateFileUrl(id: string, fileUrl: string | null): void {
        const sql = "UPDATE emails SET file_url = ? WHERE id = ?"
        this.db.executeQuery(sql, [fileUrl, id])
        this.logger.debug("EmailRepository.updateFileUrl", { id, fileUrl })
    }

    updateMetadata(id: string, fromAddr: string, timestamp: number, contentHash: string): void {
        const sql = "UPDATE emails SET from_addr = ?, timestamp = ?, content_hash = ? WHERE id = ?"
        this.db.executeQuery(sql, [fromAddr, timestamp, contentHash, id])
        this.logger.debug("EmailRepository.updateMetadata", {
            id,
            fromAddr,
            timestamp
        })
    }

    findIdsByConnectionAndStatus(connectionId: string, statuses: EmailStatus[]): string[] {
        if (statuses.length === 0) return []
        const placeholders = statuses.map(() => "?").join(", ")
        const sql = `SELECT id FROM emails WHERE connection_id = ? AND status IN (${placeholders})`
        const rows = this.db.executeQuery(sql, [connectionId, ...statuses]) as { id: string }[] | unknown
        const list = Array.isArray(rows) ? rows : []
        return list.map(r => r.id)
    }

    findIdsByStatus(statuses: EmailStatus[]): string[] {
        if (statuses.length === 0) return []
        const placeholders = statuses.map(() => "?").join(", ")
        const sql = `SELECT id FROM emails WHERE status IN (${placeholders})`
        const rows = this.db.executeQuery(sql, statuses) as { id: string }[] | unknown
        const list = Array.isArray(rows) ? rows : []
        return list.map(r => r.id)
    }

    getMaxTimestampForConnection(connectionId: string): number | null {
        const sql = "SELECT MAX(timestamp) as max_ts FROM emails WHERE connection_id = ?"
        const rows = this.db.executeQuery(sql, [connectionId]) as { max_ts: number | null }[] | unknown
        const list = Array.isArray(rows) ? rows : []
        const maxTs = list[0]?.max_ts
        return maxTs != null && Number.isFinite(maxTs) ? Number(maxTs) : null
    }

    getProcessedCountToday(): number {
        const now = new Date()
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const startOfTodayUnixSec = Math.floor(startOfToday.getTime() / 1000)
        const rows = this.db.executeQuery("SELECT COUNT(*) as count FROM emails WHERE status = ? AND timestamp >= ?", ["processed", startOfTodayUnixSec]) as { count: number }[] | unknown
        return Array.isArray(rows) ? Number(rows[0]?.count ?? 0) : 0
    }

    getProcessingCounts(): { processing: number; failed: number } {
        const processingRows = this.db.executeQuery("SELECT COUNT(*) as count FROM emails WHERE status IN (?, ?)", ["pending", "processing"]) as { count: number }[] | unknown
        const failedRows = this.db.executeQuery("SELECT COUNT(*) as count FROM emails WHERE status = ?", ["failed"]) as { count: number }[] | unknown
        const processing = Array.isArray(processingRows) ? Number(processingRows[0]?.count ?? 0) : 0
        const failed = Array.isArray(failedRows) ? Number(failedRows[0]?.count ?? 0) : 0
        return { processing, failed }
    }
}
