import type { TransactionRow } from "../transactions/TransactionRepository"

export class BillPaymentService {
    tryLinkAfterInsert(_transaction: TransactionRow): void {
        // stub — bill payment linking is out of scope for v1
    }
}
