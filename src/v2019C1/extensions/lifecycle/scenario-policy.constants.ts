import type { LifecycleScenario } from './contract.types'
import type { ScenarioPolicy } from './scenario-policy.types'

/**
 * The policy of each lifecycle scenario. A scenario added to `LifecycleScenario` does not compile until it has its
 * row here.
 *  - `instantiate` places a new instance: its elements get a uuid of their own and the template's as their lineage;
 *  - `template` reconciles the instances of a template, by that lineage;
 *  - `fork` reconciles the previous revision of the same file, by the uuids both share, which it keeps.
 */
export const SCENARIO_POLICIES = {
	instantiate: {
		matchKey: 'templateUuid',
		matchesInstances: false,
		refsAlwaysAdded: true,
		identityMode: 'stamp-template',
		bumpsCollisions: true,
	},
	template: {
		matchKey: 'templateUuid',
		matchesInstances: true,
		refsAlwaysAdded: false,
		identityMode: 'stamp-template',
		bumpsCollisions: true,
	},
	fork: {
		matchKey: 'uuid',
		matchesInstances: true,
		refsAlwaysAdded: false,
		identityMode: 'keep',
		bumpsCollisions: false,
	},
} as const satisfies Record<LifecycleScenario, ScenarioPolicy>
