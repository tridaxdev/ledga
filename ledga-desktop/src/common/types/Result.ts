export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E }

export const ResultFactory = {
    success<T>(data: T): Result<T, never> {
        return { success: true, data }
    },
    failure<E>(error: E): Result<never, E> {
        return { success: false, error }
    }
}
