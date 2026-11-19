import type { Scl } from '@/v2019C1/config'
import type { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'

/** A uuid reference pair, as `UUID_REFERENCE_PAIRS` lists it for a reference tag. */
export type UuidPair = (typeof UUID_REFERENCE_PAIRS)[keyof typeof UUID_REFERENCE_PAIRS][number]

/** What one lookup answered for a uuid of a target tag: its records (none: absent), at the write count it was asked. */
export type KnownTarget = {
	refs: readonly Scl.Ref<Scl.ElementsOf>[]
	at: number
}

/**
 * The target lookups of one reference tag. An answer taken before the clean-up's last write is checked again before
 * it is used.
 */
export type TargetLookups = {
	/** Whether a target tag of the pair holds the uuid; `left`: the references not judged yet, as the tag read them. */
	isTargetFound(params: {
		pair: UuidPair
		uuid: string
		left: readonly Scl.TrackedRecord<Scl.ElementsOf>[]
	}): Promise<boolean>
	/** The clean-up wrote: every answer taken so far is to be checked again. */
	written(): void
	/** Whether the clean-up wrote since the tag was read. */
	hasWritten(): boolean
}

/** What a reference becomes: the attributes of its pairs naming nothing cleared, and whether it goes. */
export type ReferenceJudgement = {
	cleared: Record<string, undefined>
	deleted: boolean
}
