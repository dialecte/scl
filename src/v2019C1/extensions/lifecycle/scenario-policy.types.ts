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
