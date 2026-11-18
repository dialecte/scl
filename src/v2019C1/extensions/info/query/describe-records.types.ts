import type { InfoContext } from './info-context.types'
import type { InfoOptions } from './of.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * A record to describe: as stored (raw, tracked or a tree node alike), `undefined` for an element the store does not
 * hold.
 */
export type DescribedRecord = Core.AnyRawRecord | undefined

export type DescribeRecordsParams = {
	query: Core.Query<Config>
	records: readonly DescribedRecord[]
	options: InfoOptions
	context: InfoContext
}

/** What the batch reads for one record, before its title, state and labels are put together. */
export type RecordReads = {
	/** The attributes its title template reads (its own, its child's for an `attributesFrom` tag, plus `signalName`). */
	specAttributes: Record<string, string>
	/** Its labels, with `withLabels`. */
	labels?: Record<string, Record<string, string>>
}

export type LabelEntry = { lang: string; id: string; text: string }
