import type { Config } from '@/v2019C1/config'
import type {
	ConfRevBump,
	ConfRevNotRaised,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/** A control block of the template: its record id and its configuration revision. */
export type TemplateBlock = { id: string; confRev: string }

/** The template's control blocks with a configuration revision, by uuid: see `readTemplateBlocks`. */
export type TemplateBlocks = ReadonlyMap<string, TemplateBlock>

/** The raises a data set change makes, and the counters it cannot raise: see `readConfRevBumps`. */
export type ConfRevBumps = { bumps: ConfRevBump[]; notRaised: ConfRevNotRaised[] }

/** A reader of a document: a report's query or an apply's transaction. */
export type Reader = Core.Query<Config> | Core.Transaction<Config>
