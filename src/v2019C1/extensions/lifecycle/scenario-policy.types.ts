import type { LifecycleScenario } from './contract.types'
import type { IdentityMode } from '@/v2019C1/extensions/identity/transaction/write-identity.types'

/**
 * How an instance element is matched to a source element during diff/reconcile:
 *  - `templateUuid` — instance carries `templateUuid = source.uuid` (instantiate/template);
 *  - `uuid` — source and target are two revisions of the SAME file, sharing `uuid` (fork).
 */
export type MatchKey = 'uuid' | 'templateUuid'

/**
 * What a lifecycle scenario decides, in one place: every site that behaves differently per scenario reads one of these
 * fields, never the scenario itself. A verb derives the policy once at its entry; the engine below it receives the
 * fields it needs.
 */
export type ScenarioPolicy = {
	/** The attribute an instance element carries its source element's uuid in. */
	matchKey: MatchKey
	/** The project's instances of the template are matched; without, a new instance is placed whatever it holds. */
	matchesInstances: boolean
	/**
	 * A reference the template brings is new whatever the project holds: a new instance has references of its own,
	 * never another instance's.
	 */
	refsAlwaysAdded: boolean
	/**
	 * The identity written on an element the template gained inside an instance it matched: a lineage of its own
	 * (`stamp-template`) or the source's own uuid (`keep`).
	 */
	identityMode: Extract<IdentityMode, 'stamp-template' | 'keep'>
	/** An added element whose name a sibling already holds is numbered. */
	bumpsCollisions: boolean
	/**
	 * The identity of an element placed where the project holds no instance of it, and of what it holds: a uuid of
	 * its own and the template's as its lineage (`stamp-template`), or the source's own uuid (`keep`) — then an
	 * element of the project already carrying that uuid is the instance, wherever it sits.
	 */
	placementIdentity: Extract<IdentityMode, 'stamp-template' | 'keep'>
	/**
	 * A placed function or application records the file it came from (its own `FunctionSclRef` /
	 * `ApplicationSclRef`). An SSD placement lists the file in the project's Header in every scenario.
	 */
	writesProvenance: boolean
	/**
	 * What tells that an element of the project the source lacks was dropped from it, to be removed: nothing (`none`:
	 * a new instance removes nothing), the lineage the element carries (`lineage`: the template no longer holds the
	 * element it was made from), or the previous revision of the file (`revision`: it held the element, the newer one
	 * does not — an element it never held is the project's own).
	 */
	removalBase: 'none' | 'lineage' | 'revision'
}

export type ScenarioPolicyParams = {
	/** The scenario asked for. Default: `template`. */
	scenario?: LifecycleScenario
	/**
	 * The element is placed afresh by a larger operation (the function an application gained, a primary a substation
	 * template gained): it gets its own, whatever another instance holds — matched to none, its references its own.
	 */
	placesFresh?: boolean
}
