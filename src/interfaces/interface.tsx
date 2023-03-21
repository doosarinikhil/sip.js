export interface RegistrationData {
    proxyAddress: string
    exNumber: number
    userName: string
    password: string
    sipJslogLevel: LogLevel
    wsUrl: string
}

export declare type LogLevel = "debug" | "log" | "warn" | "error";

interface callMediaOption {
    audio?: boolean
    video?: boolean
    stream?: MediaStream
}
export interface CallOptions {
    number: number
    media?: callMediaOption
}