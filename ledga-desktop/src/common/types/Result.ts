export type Result<T, E> = Success<T> | Error<E>

export interface Success<T> {
    kind: "success"
    value: T
}

export interface Error<E> {
    kind: "error"
    error: E
}

export class ResultFactory {
    static async from<T>(asyncOperation: Promise<T>): Promise<Result<T, globalThis.Error>> {
        try {
            const value = await asyncOperation
            const result = {
                kind: "success" as const,
                value
            }
            return result
        } catch (error) {
            return {
                kind: "error",
                error: error instanceof globalThis.Error ? error : new globalThis.Error(String(error))
            }
        }
    }

    static success<T>(value: T): Success<T> {
        return {
            kind: "success",
            value
        }
    }

    static error<E>(error: E): Error<E> {
        return {
            kind: "error",
            error
        }
    }
}
