import { mkdir, stat } from "fs/promises"
import { join } from "path"
import { createHash } from "crypto"
import { execFile } from "child_process"
import { FileProcessorBase } from "../FileProcessorBase"
import { ProcessorError } from "../ProcessorError"
import { ProcessorErrorType } from "../../../common/types/ProcessorTypes"
import type { AIRequest, FileWorkerResult } from "../../../common/types/FileProcessingTypes"
import type { ProcessingResult } from "../../../common/types/ProcessorTypes"
import type { AudioTranscript } from "../../../common/types/AudioTranscriptTypes"
import { FileWorkerResultBuilder } from "../FileWorkerResultBuilder"
import { ffmpegPath, ffprobePath } from "./ffmpegBinary"

const MAX_RETRIES = 2
const RETRY_DELAY_BASE_MS = 1000
const OPUS_BITRATE_KBPS = 256

export class AudioProcessor extends FileProcessorBase {
    static readonly supportedExtensions = [".wav", ".mp3", ".aac", ".ogg", ".flac", ".webm"]
    private static readonly MAX_DURATION_SECONDS = 2 * 60 * 60 // 2 hours

    async processFileComplete(id: string, originalPath: string, appStorageDir: string, fileName: string): Promise<FileWorkerResult> {
        this.logger.setContextId(id)
        const builder = new FileWorkerResultBuilder(id)
        try {
            this.logger.debug(`Starting AudioProcessor processing for: ${originalPath}`)

            const { durationSeconds: duration, bitrateKbps: originalBitrate } = await this.probeAudio(originalPath)
            const hours = Math.floor(duration / 3600)
            const minutes = Math.floor((duration % 3600) / 60)

            if (duration > AudioProcessor.MAX_DURATION_SECONDS) {
                const allowedHours = Math.floor(AudioProcessor.MAX_DURATION_SECONDS / 3600)
                const allowedMinutes = Math.floor((AudioProcessor.MAX_DURATION_SECONDS % 3600) / 60)
                throw new ProcessorError(`Audio file too long (${hours}h ${minutes}m). Maximum supported duration is ${allowedHours}h ${allowedMinutes}m`, ProcessorErrorType.DURATION_LIMIT)
            }

            this.logger.info(`Processing audio file: ${originalPath}, duration: ${hours}h ${minutes}m, original bitrate: ${originalBitrate}kbps`)

            const fileHash = createHash("md5")
                .update(originalPath + Date.now())
                .digest("hex")
            const webmPath = join(appStorageDir, `${fileHash}.webm`)
            await mkdir(appStorageDir, { recursive: true })

            this.logger.info(`Compressing to WebM Opus at ${OPUS_BITRATE_KBPS}kbps`)
            await this.compressToWebmOpus(originalPath, webmPath)

            const { durationSeconds: compressedDuration } = await this.probeAudio(webmPath)
            const compressedSize = (await stat(webmPath)).size
            this.logger.debug(`Compressed file: ${(compressedSize / 1024 / 1024).toFixed(1)}MB, duration: ${Math.floor(compressedDuration / 60)}m ${Math.floor(compressedDuration % 60)}s`)

            builder.setBackupFilePath(webmPath)

            const baseMetadata = await this.createBaseMetadata(originalPath)
            builder.setMetadata({
                ...baseMetadata,
                processingTime: Date.now() - this.startTime
            })

            const { content, transcript, warning } = await this.transcribeAudio(webmPath, id)

            builder.setExtractedText(content.trim())
            builder.setWarning(warning)
            if (transcript) {
                builder.setStructuredData(transcript)
            }

            try {
                const summaryText = transcript?.text ?? content.trim()
                const aiSummary = await this.generateAISummary(summaryText, fileName)
                builder.setAiSummary(aiSummary)
            } catch (error) {
                this.logger.warn(`Failed to generate AI summary for file: ${fileName}`, error)
            }

            builder.setSuccess(true)
            return builder.build()
        } catch (error) {
            const classifiedError = this.classifyError(error as Error)
            builder.setError(classifiedError)
            builder.setSuccess(false)
            return builder.build()
        } finally {
            this.logger.clearContextId()
        }
    }

    protected async processFileContent(filePath: string, fileId: string): Promise<ProcessingResult> {
        const { content, warning } = await this.transcribeAudio(filePath, fileId)
        return { content, warning }
    }

    private async transcribeAudio(filePath: string, fileId: string): Promise<{ content: string; transcript?: AudioTranscript; warning?: string }> {
        let lastError: Error | undefined

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const request: AIRequest = {
                    requestId: `audio_transcribe_${fileId}_${Date.now()}`,
                    modelTier: "simple",
                    operation: "transcribeAudio",
                    data: {
                        compressedAudioFilePath: filePath,
                        timeout: this.config.common.timeout * attempt
                    }
                }

                const result = await this.aiService.requestAI(request)

                if (!result.success) {
                    throw new ProcessorError(result.error || "Audio transcription failed", ProcessorErrorType.UNKNOWN_ERROR)
                }

                const transcript = result.result as AudioTranscript
                if (transcript?.type === "audio_transcript") {
                    return { content: transcript.phrases.map(p => p.text).join(" "), transcript }
                }

                return { content: (result.result as string) ?? "" }
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error))
                this.logger.warn(`Audio transcription attempt ${attempt} failed: ${lastError.message}`)

                if (attempt < MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_BASE_MS * attempt))
                }
            }
        }

        throw new ProcessorError("Audio transcription failed after all retry attempts", ProcessorErrorType.UNKNOWN_ERROR, lastError)
    }

    private compressToWebmOpus(inputPath: string, outputPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            execFile(
                ffmpegPath,
                ["-i", inputPath, "-c:a", "libopus", "-b:a", `${OPUS_BITRATE_KBPS}k`, "-map_metadata", "0", "-cues_to_front", "1", "-y", outputPath],
                { maxBuffer: 10 * 1024 * 1024 },
                (error, _stdout, stderr) => {
                    if (error) {
                        this.logger.error("ffmpeg compression failed", { stderr, error: error.message })
                        reject(new Error("Audio compression failed"))
                    } else resolve()
                }
            )
        })
    }

    private probeAudio(filePath: string): Promise<{ durationSeconds: number; bitrateKbps: number }> {
        return new Promise((resolve, reject) => {
            execFile(ffprobePath, ["-v", "quiet", "-print_format", "json", "-show_format", filePath], (error, stdout) => {
                if (error) return reject(error)
                try {
                    const metadata = JSON.parse(stdout)
                    resolve({
                        durationSeconds: metadata.format?.duration ? Number(metadata.format.duration) : 0,
                        bitrateKbps: metadata.format?.bit_rate ? Math.floor(Number(metadata.format.bit_rate) / 1000) : 0
                    })
                } catch (parseError) {
                    reject(parseError)
                }
            })
        })
    }
}
