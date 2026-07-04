import { createContext } from "react"
import type { PyleHoundAsset } from "../../common/types/ProjectTypes"
import type { HookReturn } from "../hooks/HookReturn"

export type AssetsContextType = HookReturn<PyleHoundAsset[]>

export const AssetsContext = createContext<AssetsContextType | null>(null)
