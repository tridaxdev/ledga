import * as http from 'node:http'
import { shell } from 'electron'
import { getAvailablePort } from '@/common/utils/getAvailablePort'
import type { Logger } from '../logging/FileLogger'

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? ''
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? ''
const SCOPES = ['https://mail.google.com/', 'https://www.googleapis.com/auth/userinfo.email']

export interface OAuthResult {
    email: string
    accessToken: string
    refreshToken: string
    expiryDate: Date
}

interface TokenResponse {
    access_token: string
    refresh_token: string
    expires_in: number
    token_type: string
}

interface UserInfoResponse {
    email: string
}

export class GoogleOAuthService {
    constructor(private readonly logger: Logger) {}

    async startOAuthFlow(): Promise<OAuthResult> {
        const port = await getAvailablePort()
        const redirectUri = `http://localhost:${port}/callback`

        const code = await this.waitForAuthCode(port, redirectUri)
        const tokens = await this.exchangeCodeForTokens(code, redirectUri)
        const email = await this.getUserEmail(tokens.access_token)
        const expiryDate = new Date(Date.now() + tokens.expires_in * 1000)

        return { email, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiryDate }
    }

    async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string; expiryDate: Date }> {
        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
        })

        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        })

        if (!response.ok) {
            throw new Error(`Token refresh failed: ${response.status}`)
        }

        const data = await response.json() as TokenResponse
        const expiryDate = new Date(Date.now() + data.expires_in * 1000)

        return { accessToken: data.access_token, refreshToken: data.refresh_token, expiryDate }
    }

    private waitForAuthCode(port: number, redirectUri: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
                const url = new URL(req.url ?? '/', `http://localhost:${port}`)
                if (url.pathname !== '/callback') {
                    res.end()
                    return
                }

                const code = url.searchParams.get('code')
                const error = url.searchParams.get('error')

                res.writeHead(200, { 'Content-Type': 'text/html' })
                res.end('<html><body><h1>Authorization complete. You can close this tab.</h1></body></html>')
                server.close()

                if (error) {
                    reject(new Error(`OAuth error: ${error}`))
                } else if (code) {
                    resolve(code)
                } else {
                    reject(new Error('No authorization code received'))
                }
            })

            server.on('error', (err: Error) => reject(err))

            server.listen(port, '127.0.0.1', () => {
                const authUrl = this.buildAuthUrl(redirectUri)
                this.logger.info('Opening browser for OAuth flow')
                shell.openExternal(authUrl).catch((err: unknown) => {
                    server.close()
                    reject(err)
                })
            })
        })
    }

    private buildAuthUrl(redirectUri: string): string {
        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: SCOPES.join(' '),
            access_type: 'offline',
            prompt: 'consent'
        })
        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    }

    private async exchangeCodeForTokens(code: string, redirectUri: string): Promise<TokenResponse> {
        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code'
        })

        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        })

        if (!response.ok) {
            const text = await response.text()
            throw new Error(`Token exchange failed: ${response.status} ${text}`)
        }

        return response.json() as Promise<TokenResponse>
    }

    private async getUserEmail(accessToken: string): Promise<string> {
        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` }
        })

        if (!response.ok) {
            throw new Error(`Failed to get user info: ${response.status}`)
        }

        const data = await response.json() as UserInfoResponse
        return data.email
    }
}
