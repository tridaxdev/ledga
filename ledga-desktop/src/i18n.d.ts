import "i18next"
import type rendererEn from "./renderer/translations/en.json"
import type mainEn from "./main/i18n/translations/en.json"

type MergedTranslations = typeof rendererEn | typeof mainEn

declare module "i18next" {
    interface CustomTypeOptions {
        defaultNS: "translation"
        resources: {
            translation: MergedTranslations
        }
        returnNull: false
        returnEmptyString: false
        allowObjectInHTMLChildren: false
        keySeparator: "."
        nsSeparator: ":"
    }

    interface TFunction {
        <TKeys extends string = string, TInterpolationMap extends object = Record<string, unknown>>(key: TKeys, options?: TInterpolationMap): string

        <TKeys extends string = string, TInterpolationMap extends object = Record<string, unknown>>(key: TKeys, defaultValue: string, options?: TInterpolationMap): string
    }
}
