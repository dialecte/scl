import type { PlacementLevel } from './resolve-placement-mappings.types'
import type { Config, Scl } from '@/v2019C1/config'
import type {
	DecisionMappings,
	StoredRef,
} from '@/v2019C1/extensions/lifecycle/mapping/mapping.types'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

export type ResolvePrimaryPlacementParams = {
	sourceQuery: Core.Query<Config>
	/** The primaries of the template being placed: a function, or an application and its functions. */
	primaryRefs: readonly Scl.Ref<Scl.ElementsOf>[]
	/** The project element the consumer started from. */
	anchor: Scl.Ref<Scl.ElementsOf>
	/** The consumer's choices, by source record id. */
	decisionMappings?: DecisionMappings
	/**
	 * Which levels are placed: those of the template the primaries were made for (`template`, the default), or the levels
	 * the primaries sit on in the source (`source`, a copy): one per distinct level, each landing its content on the level
	 * of the same tag and name directly under where the level above it lands, else on that place itself.
	 */
	levels?: 'template' | 'source'
}

/** The consumer started above the level a template was made for: its content lands below. */
export type OffLevel = {
	/** The kind of level the template was made for. */
	templateLevel: string
	/** The kind of level the consumer started from. */
	startedFrom: string
}

/** Where the primaries of a template land, when it is not simply where the consumer started. */
export type PrimaryPlacement = {
	/**
	 * Where each level of the template lands — none when the consumer started at or below the level
	 * the template was made for: the primaries then land where the consumer started.
	 */
	levels: PlacementLevel[]
	offLevel?: OffLevel
}

/** A level the primaries sit on in the source, as read once: see `resolvePrimaryPlacement` with `levels: 'source'`. */
export type SourceLevel = {
	sourceRef: StoredRef
	record: AnyTrackedRecord
	/** The record ids of the levels above it, nearest first. */
	aboveIds: string[]
	/** The tags of the primaries it holds. */
	primaryTags: Set<string>
}
