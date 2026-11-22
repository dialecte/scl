import type { Config, Scl } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { Refused } from '@/v2019C1/extensions/lifecycle/refusal.types'
import type * as Core from '@dialecte/core'

/**
 * The IED a scenario is asked for: the source file's IED (`ref`, as `sourceRoot.ied` reads it), and the IED of the
 * open document an update starts from (`targetInstance`): given, the consumer updates it; absent, it places the IED.
 */
export type IedScenarioOfParams = {
	sourceQuery: Core.Query<Config>
	ref: Scl.Ref<'IED'>
	targetInstance?: Scl.Ref<'IED'>
}

/** The source file of an FSD, ASD or SSD operation. */
export type LayerScenarioOfParams = {
	sourceQuery: Core.Query<Config>
}

/**
 * The scenario an IED operation runs with, and whether the source is a version of the open document's file
 * (`sameFile`: a fork of the file itself, which re-targets references).
 */
export type IedScenario = {
	scenario: LifecycleScenario
	sameFile: boolean
}

/**
 * What the engine tells of an FSD, ASD or SSD operation: whether the source is a version of the open document's file.
 * No scenario: for these verbs the consumer states it.
 */
export type LayerScenario = {
	sameFile: boolean
	scenario?: never
}

/** One reader per verb: a verb added to the contract without one does not compile. */
export type ScenarioOfReaders = {
	ied: (query: Core.Query<Config>, params: IedScenarioOfParams) => Promise<IedScenario | Refused>
	fsd: (query: Core.Query<Config>, params: LayerScenarioOfParams) => Promise<LayerScenario>
	asd: (query: Core.Query<Config>, params: LayerScenarioOfParams) => Promise<LayerScenario>
	ssd: (query: Core.Query<Config>, params: LayerScenarioOfParams) => Promise<LayerScenario>
}

/** What tells the scenario of an IED operation apart. */
export type PickIedScenarioParams = {
	/** The consumer updates an IED of the open document (`targetInstance` given), or places one. */
	updates: boolean
	/** The source IED is the IED of an ISD instance file. */
	sourceIsIsdInstance: boolean
	/** The open document is an ISD. */
	onOpenIsd: boolean
	sameFile: boolean
}
