import type { Scl, Config } from '@/v2019C1/config'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/** Which template layer the lifecycle seam operates on. */
export type LifecycleVerb = 'fsd' | 'asd'

/**
 * What to reconcile and where — the uniform `{ verb, sourceQuery, ref, anchor }`
 * descriptor shared by `report` (read-only classify) and `apply` (write).
 * Discriminated on `verb` so `ref` narrows to the right element type.
 */
export type LifecycleTarget =
	| {
			verb: 'fsd'
			sourceQuery: Core.Query<Config>
			/** The source (template) Function to reconcile. */
			ref: Scl.Ref<'Function'>
			/** Target parent the instance lives under / is placed into. */
			anchor: Scl.Ref<Scl.ElementsOf>
	  }
	| {
			verb: 'asd'
			sourceQuery: Core.Query<Config>
			/** The source (template) Application to reconcile. */
			ref: Scl.Ref<'Application'>
			/** Target parent the composed functions are placed into. */
			anchor: Scl.Ref<Scl.ElementsOf>
	  }

/**
 * `apply` inputs: the target plus the `report` produced by `report` (the
 * consumer classifies first, then applies). The report gates the track.
 */
export type LifecycleApplyParams = LifecycleTarget & { report: DiffReport }
