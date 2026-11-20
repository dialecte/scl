import { ied, layer } from './scenario-of'

import type { ScenarioOfReaders } from './scenario-of.types'

/** `query.lifecycle.scenarioOf.<verb>()`: which scenario an operation runs with, one function per verb. */
export const scenarioOf = { ied, fsd: layer, asd: layer, ssd: layer } satisfies ScenarioOfReaders

export type {
	IedScenario,
	IedScenarioOfParams,
	LayerScenario,
	LayerScenarioOfParams,
} from './scenario-of.types'
