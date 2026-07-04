import { safeStorage } from 'electron'
import Store from 'electron-store'
import type { Logger } from '../logging/FileLogger'

export class TokenStorageService {
    private readonly store: Store<Record<string, string>>

    constructor(private readonly logger: Logger) {
        this.store = new Store<Record<string, string>>({ name: 'tokens' })
    }

    async getAccessToken(connectionId: string): Promise<string | null> {
        return this.getToken(`tokens_${connectionId}_access`)
    }

    async getRefreshToken(connectionId: string): Promise<string | null> {
        return this.getToken(`tokens_${connectionId}_refresh`)
    }

    async setTokens(connectionId: string, accessToken: string, refreshToken: string): Promise<void> {
        await this.setToken(`tokens_${connectionId}_access`, accessToken)
        await this.setToken(`tokens_${connectionId}_refresh`, refreshToken)
    }

    async deleteTokens(connectionId: string): Promise<void> {
        this.store.delete(`tokens_${connectionId}_access` as keyof Record<string, string>)
        this.store.delete(`tokens_${connectionId}_refresh` as keyof Record<string, string>)
    }

    private async getToken(key: string): Promise<string | null> {
        const stored = this.store.get(key as keyof Record<string, string>) as string | undefined
        if (!stored) return null

        if (safeStorage.isEncryptionAvailable()) {
            try {
                const buffer = Buffer.from(stored, 'base64')
                return safeStorage.decryptString(buffer)
            } catch (error) {
                this.logger.error('Failed to decrypt token', error)
                return null
            }
        }

        return stored
    }

    private async setToken(key: string, value: string): Promise<void> {
        if (safeStorage.isEncryptionAvailable()) {
            const encrypted = safeStorage.encryptString(value)
            this.store.set(key as keyof Record<string, string>, encrypted.toString('base64'))
        } else {
            this.logger.warn('safeStorage encryption not available, storing token as plaintext')
            this.store.set(key as keyof Record<string, string>, value)
        }
    }
}
