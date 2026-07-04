import { registerIpcHandler } from "../ipc/registerIpcHandler"
import type { Logger } from "../logging/FileLogger"
import type { EmailService } from "./emailService"
import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc"
import { ResultFactory } from "@/common/types/Result"

export interface EmailsFetchRequest {
    connectionId: string
    startDate: string
    endDate: string
}

export interface EmailsWaitForRequest {
    connectionId?: string
    emailIds?: string[]
}

export function setupIpcHandlersForEmail(emailService: EmailService, logger: Logger): void {
    registerIpcHandler(AllowedChannelIpc.EmailsFetch, async (_, ...args) => {
        const request = args[0] as EmailsFetchRequest
        logger.info("emails:fetch request received", {
            connectionId: request.connectionId,
            startDate: request.startDate,
            endDate: request.endDate
        })
        return ResultFactory.from(emailService.fetchAndStoreEmails(request.connectionId, new Date(request.startDate), new Date(request.endDate))).then(result => {
            if (result.kind === "success") {
                logger.info("emails:fetch success", {
                    connectionId: request.connectionId,
                    newCount: result.value.newCount
                })
            } else {
                logger.error("emails:fetch error", {
                    connectionId: request.connectionId,
                    error: result.error.message
                })
            }
            return result
        })
    })

    registerIpcHandler(AllowedChannelIpc.EmailsWaitFor, async (_, ...args) => {
        const request = args[0] as EmailsWaitForRequest
        if (request.connectionId) {
            logger.debug("emails:wait-for by connectionId", {
                connectionId: request.connectionId
            })
            return ResultFactory.from(emailService.waitForConnectionEmails(request.connectionId))
        }
        if (request.emailIds?.length) {
            logger.debug("emails:wait-for by emailIds", {
                count: request.emailIds.length
            })
            return ResultFactory.from(emailService.waitForEmails(request.emailIds))
        }
        return ResultFactory.error(new Error("emails:wait-for requires connectionId or emailIds"))
    })

    registerIpcHandler(AllowedChannelIpc.EmailsGetProcessingCounts, async () => {
        return emailService.getProcessingCounts()
    })
}
