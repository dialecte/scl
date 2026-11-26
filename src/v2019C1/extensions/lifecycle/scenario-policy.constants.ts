import type { LifecycleScenario } from './contract.types'
import type { ScenarioPolicy } from './scenario-policy.types'

/**
 * The policy of each lifecycle scenario. A scenario added to `LifecycleScenario` does not compile until it has its
 * row here.
 *  - `instantiate` places a new instance: its elements get a uuid of their own and the template's as their lineage;
 *  - `template` reconciles the instances of a template, by that lineage;
 *  - `fork` reconciles the previous revision of the same file, by the uuids both share, which it keeps — on what it
 *    places too, with no provenance of its own: the project holds the file's elements, not instances of them, and
 *    takes the file's renames; a name a sibling of the project already holds is numbered;
 *  - `copy` places a copy of an element of the document itself under the parent the consumer picked — content sitting
 *    under several levels lands by one row per level (`source-levels`): every element a uuid of its own and its lineage as copied (a copy of an instance is another instance of its template), no
 *    provenance (the copy is no placement from a file), every function an application composes copied with it, the
 *    references it carries kept as written; matched to nothing, matching by uuid finds the shared elements it is
 *    classified by (a category, a role) where they are, reused.
 */
export const SCENARIO_POLICIES = {
	instantiate: {
		matchKey: 'templateUuid',
		matchesInstances: false,
		refsAlwaysAdded: true,
		identityMode: 'stamp-template',
		bumpsCollisions: true,
		placementIdentity: 'stamp-template',
		writesProvenance: true,
		removalBase: 'none',
		namesFollow: 'project',
		subNetworkSettings: 'source',
		placement: 'template-levels',
		composedFunctions: 'missing',
	},
	template: {
		matchKey: 'templateUuid',
		matchesInstances: true,
		refsAlwaysAdded: false,
		identityMode: 'stamp-template',
		bumpsCollisions: true,
		placementIdentity: 'stamp-template',
		writesProvenance: true,
		removalBase: 'lineage',
		namesFollow: 'project',
		subNetworkSettings: 'project',
		placement: 'template-levels',
		composedFunctions: 'missing',
	},
	fork: {
		matchKey: 'uuid',
		matchesInstances: true,
		refsAlwaysAdded: false,
		identityMode: 'keep',
		bumpsCollisions: true,
		placementIdentity: 'keep',
		writesProvenance: false,
		removalBase: 'revision',
		namesFollow: 'source',
		subNetworkSettings: 'source',
		placement: 'template-levels',
		composedFunctions: 'missing',
	},
	copy: {
		matchKey: 'uuid',
		matchesInstances: false,
		refsAlwaysAdded: true,
		identityMode: 'keep',
		bumpsCollisions: true,
		placementIdentity: 'copy',
		writesProvenance: false,
		removalBase: 'none',
		namesFollow: 'project',
		subNetworkSettings: 'source',
		placement: 'source-levels',
		composedFunctions: 'all',
	},
} as const satisfies Record<LifecycleScenario, ScenarioPolicy>
