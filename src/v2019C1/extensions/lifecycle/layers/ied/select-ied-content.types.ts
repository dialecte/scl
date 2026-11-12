import type { IED_CONTENT_TAGS } from './select-ied-content.constants'
import type { Scl } from '@/v2019C1/config'
import type { ExtractWarning } from '@/v2019C1/extensions/lifecycle/extract/transaction/extract.types'
import type { RecordEdit } from '@/v2019C1/extensions/lifecycle/layers/ied/ied-process.types'

export type IedContentSelection = {
	leaveOut: ReadonlySet<string>
	warnings: ExtractWarning[]
	/** The attribute changes on the elements of the IED written: its inputs in later-binding form. */
	edits: readonly RecordEdit[]
}

/** The elements of the IED the selection reads, the document's own only, by tag. */
export type IedContentRecords = {
	readonly [Tag in (typeof IED_CONTENT_TAGS)[number]]: readonly Scl.RawRecord<Tag>[]
}

/** What one step of the selection leaves out (record ids), with what it says. */
export type IedContentStep = { leaveOut: readonly string[]; warnings: ExtractWarning[] }
