import type { Config, Scl } from '@/v2019C1/config'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord, AnyTrackedRecord } from '@dialecte/core'

/** A read surface shared by the report (Query) and the apply (Transaction). */
export type MappingReader = Core.Query<Config> | Core.Transaction<Config>

/**
 * How a shared element of the project is recognised as the one a source element stands for.
 * Declared by the layer that owns the element.
 */
export type MappingPolicy = {
	tagName: Scl.ElementsOf
	/** The attribute a source element and a project element share when they are the same thing. */
	key: 'name'
	/** The consumer may choose another mapping than the one resolved. */
	selectable: boolean
}

/**
 * Why a source element was mapped the way it was:
 *  - `decision` — the consumer chose;
 *  - `lineage` — the project already holds the element standing for it: the one this instance was
 *    given by an earlier placement, or the one element created from it;
 *  - `name` — exactly one project element shares its key;
 *  - `anchor` — a level of the project the consumer started from;
 *  - `only` — the only such level there is, below the one above;
 *  - `none` — nothing to map onto, it is created.
 */
export type MappingReason = 'decision' | 'lineage' | 'name' | 'anchor' | 'only' | 'none'

/** Where a shared source element lands in the project. */
export type ResolvedMapping = {
	/** The project element the source element maps onto. Absent: a new element is created. */
	existing?: AnyTrackedRecord
	reason: MappingReason
	/**
	 * Nothing was picked although something qualified: several project elements qualified equally,
	 * or the instance being updated holds an element that could stand for this one and nothing
	 * tells whether it does.
	 */
	ambiguous: boolean
	/** The instance being updated already carries this mapping: it is not the consumer's to change. */
	locked: boolean
	/**
	 * The element mapped onto is the project's own (it does not carry the source element's lineage):
	 * it only receives what the source element contributes below it.
	 */
	projectOwned: boolean
	/**
	 * Nothing is decided: several project elements qualify, or the instance holds an element that
	 * could stand for this one, and where it lands is the consumer's to choose. Nothing is written
	 * until it chose. Never set for an element whose mapping the consumer cannot choose.
	 */
	undecided: boolean
}

/** Where each shared source element of one instance lands, by the record id of the source element. */
export type ResolvedMappings = ReadonlyMap<string, ResolvedMapping>

export type ResolveMappingParams = {
	sourceQuery: Core.Query<Config>
	sourceRef: Scl.Ref<Scl.ElementsOf>
	policy: MappingPolicy
	/** The consumer's choice for this source element, when it made one. */
	decision?: DecisionMapping
	/** How a project element carries the uuid of the source element it was created from. */
	matchKey?: MatchKey
}

export type ResolveSatelliteMappingsParams = {
	sourceQuery: Core.Query<Config>
	/** The source elements carried with the source primary. */
	satelliteRefs: readonly Scl.Ref<Scl.ElementsOf>[]
	/** The project elements carried with the instance being updated — none on a first placement. */
	instanceSatelliteRefs?: readonly Scl.Ref<Scl.ElementsOf>[]
	/** The consumer's choices, by source record id. */
	decisionMappings?: DecisionMappings
	matchKey?: MatchKey
}

export type FindWithdrawnContributionsParams = {
	/** The instance being updated. */
	instancePrimaryRef: AnyRefOrRecord
	/** The project elements carried with the instance, as they were before the update. */
	instanceSatelliteRefs: readonly Scl.Ref<Scl.ElementsOf>[]
	/** Where the shared source elements of the template land for this instance. */
	resolvedMappings: ResolvedMappings
	matchKey?: MatchKey
}

/** A reference to a stored element: its record id is known. */
export type StoredRef = Scl.Ref<Scl.ElementsOf> & { id: string }

/** A shared source element and the policy its tag declares. */
export type SourceSatellite = { ref: StoredRef; policy: MappingPolicy }

export type PairInstanceSatellitesParams = {
	sourceQuery: Core.Query<Config>
	sourceSatellites: readonly SourceSatellite[]
	instanceSatelliteRefs: readonly StoredRef[]
	matchKey: MatchKey
}

/** A project element an instance already holds for a shared source element. */
export type InstanceSatellitePair = {
	existing: AnyTrackedRecord
	projectOwned: boolean
}

export type InstanceSatellitePairing = {
	/** The project element the instance holds for each shared source element, by source record id. */
	pairs: ReadonlyMap<string, InstanceSatellitePair>
	/**
	 * Record ids of the source elements left unpaired although the instance holds elements that
	 * could stand for them: nothing tells which.
	 */
	undecidedSourceIds: ReadonlySet<string>
}

/** A project element a shared source element may be mapped onto. */
export type MappingCandidate = {
	ref: Scl.Ref<Scl.ElementsOf>
	title: string
	/** Where the element sits in the project. */
	path: string
}

/**
 * What one pass over a report shares between the elements it describes: the candidates already
 * listed, by tag and anchor — every shared element of a kind is offered the same project elements.
 */
export type ReportPass = {
	candidates: Map<string, MappingCandidate[]>
}

/** Where one shared source element lands: an element of the project, or a new one. */
export type DecisionMapping = { existing: Scl.Ref<Scl.ElementsOf> } | { create: { name?: string } }

/** The consumer's choices, keyed by the record id of the source element. */
export type DecisionMappings = ReadonlyMap<string, DecisionMapping>

/**
 * What a mapping is about: a structural `level` of the template (where its content is placed), or
 * a `shared` element the project holds once and the template refers to.
 */
export type MappingKind = 'level' | 'shared'

/** What the report says about one source element that lands on an element of the project. */
export type ReportMapping = {
	/**
	 * The key of a choice made for it: the record id of the source element — or, for a mapping
	 * decided for one element of the project (`placedFor`), that element's id and the source
	 * element's (`<placedFor id>::<source id>`).
	 */
	id: string
	/** Record id of the source element, when `id` is scoped to `placedFor`. */
	sourceId?: string
	/**
	 * The element of the project this mapping is decided for, when the report lists it once per
	 * such element (a function an application gained, for one instance of the application).
	 */
	placedFor?: AnyRefOrRecord
	tagName: string
	kind: MappingKind
	/**
	 * Where it lands. Absent: nothing is decided — several elements qualify and none is picked for
	 * the consumer, or it follows from a mapping that is not decided yet. The report then asks for
	 * a decision and `apply` refuses until the consumer chose.
	 */
	mapping?: DecisionMapping
	/**
	 * Set when it lands on an element the project owns — reused, not an instance of the source
	 * element: that element keeps its own attributes and only gains what the source contributes.
	 */
	projectOwned?: true
	/**
	 * For an element to create: the path of the element it is created under — an element of the
	 * project, or one this placement creates too.
	 */
	parentPath?: string
	reason: MappingReason
	/**
	 * Nothing was picked although something qualified: several project elements qualified equally
	 * (`reason` tells how) or — with the reason `none` — the instance being updated holds an element
	 * that could stand for this one and nothing tells whether it does. When the consumer may choose
	 * (`selectable`), the mapping is then left undecided; otherwise a new element is created.
	 */
	ambiguous: boolean
	/** The consumer may choose another mapping for an element of this kind. */
	selectable: boolean
	/** The instance being updated already carries this mapping: shown, not the consumer's to change. */
	locked: boolean
	/**
	 * Every project element this source element could be mapped onto — for a locked mapping, the one
	 * it is mapped onto.
	 */
	candidates: MappingCandidate[]
	/**
	 * The id of the mapping this one depends on — the level above, for a structural level: what it
	 * can be mapped onto follows from where that one lands.
	 */
	dependsOn?: string
	/**
	 * The element this source element became in the APPLIED document, filled by `apply` on the
	 * report it returns (undefined on a pure `report`): the element created for it, or the one it is
	 * mapped onto. Lets a consumer show an element created for a mapping as new.
	 */
	appliedRef?: AnyRefOrRecord
}
