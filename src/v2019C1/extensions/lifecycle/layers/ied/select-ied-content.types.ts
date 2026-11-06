import type { ExtractWarning } from '@/v2019C1/extensions/lifecycle/extract/transaction/extract.types'

export type IedContentSelection = {
	leaveOut: ReadonlySet<string>
	warnings: ExtractWarning[]
}
