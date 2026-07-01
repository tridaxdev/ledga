import { parentPort } from "worker_threads"
import type { WorkerLogger } from "../logging/WorkerLogger"
import type { AIRequest, AIResponse, WorkerAIRequestMessage, MainToWorkerMessage } from "@/common/types/FileProcessingTypes"

export class BackgroundWorkerAIService {
    private pendingRequests = new Map<
        string,
        {
            resolve: (value: AIResponse) => void
            reject: (error: Error) => void
        }
    >()

    constructor(private logger: WorkerLogger) {}

    async requestAI(request: AIRequest): Promise<AIResponse> {
        const requestMessage: WorkerAIRequestMessage = {
            type: "AI_REQUEST",
            payload: request
        }

        return new Promise((resolve, reject) => {
            if (!parentPort) {
                reject(new Error("AI service requests can only be made from worker threads"))
                return
            }

            this.pendingRequests.set(request.requestId, { resolve, reject })
            // Transfer large binary buffers to the main thread via zero-copy transfer.
            // After postMessage, the transferred ArrayBuffers become detached (unreadable) in this thread.
            const transferList: ArrayBuffer[] = []
            const data = request.data as Record<string, unknown>
            if (data.imageBuffer instanceof Uint8Array) {
                const copy = new Uint8Array(data.imageBuffer).buffer
                data.imageBuffer = new Uint8Array(copy)
                transferList.push(copy)
            }
            if (data.contentBuffer instanceof Uint8Array) {
                const copy = new Uint8Array(data.contentBuffer).buffer
                data.contentBuffer = new Uint8Array(copy)
                transferList.push(copy)
            }
            parentPort.postMessage(requestMessage, transferList)
        })
    }

    handleResponse(message: MainToWorkerMessage): void {
        if (message.type !== "AI_RESPONSE") {
            return
        }

        const requestId = message.payload.requestId
        const pendingRequest = this.pendingRequests.get(requestId)

        if (pendingRequest) {
            this.pendingRequests.delete(requestId)

            if (message.payload.success) {
                pendingRequest.resolve(message.payload)
            } else {
                pendingRequest.reject(new Error(message.payload.error || "AI request failed"))
            }
        } else {
            this.logger.debug("Received AI response for unknown request", { requestId })
        }
    }
}
