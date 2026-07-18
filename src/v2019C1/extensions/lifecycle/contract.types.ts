import type { Scl, Config } from '@/v2019C1/config'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/** Which template layer the lifecycle surface operates on. */
export type LifecycleVerb = 'fsd' | 'asd'

/**
 * Which lifecycle operation the user chose:
 *  - `instantiate` — place a NEW instance of the template (duplicates allowed;
 *    a sibling name collision is resolved). Re-applying the same template yields
 *    another instance, never a silent no-op.
 *  - `update` — reconcile the template onto its EXISTING instance(s).
 *
 * Picked explicitly by the consumer — it cannot be inferred reliably (a same-
 * version re-upload is a valid duplicate). Defaults to `update` for back-compat.
 */
export type LifecycleScenario = 'instantiate' | 'update'

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
			/** Operation to perform. Defaults to `update`. */
			scenario?: LifecycleScenario
	  }
	| {
			verb: 'asd'
			sourceQuery: Core.Query<Config>
			/** The source (template) Application to reconcile. */
			ref: Scl.Ref<'Application'>
			/** Target parent the composed functions are placed into. */
			anchor: Scl.Ref<Scl.ElementsOf>
			/** Operation to perform. Defaults to `update`. */
			scenario?: LifecycleScenario
	  }

/**
 * `apply` inputs: the target plus the `report` produced by `report` (the
 * consumer classifies first, then applies). The report gates the track.
 *
 * `decisions` drives the full track: absent -> the caller has not decided yet
 * (apply writes nothing and returns the report); present -> apply the accepted
 * groups only (a group absent from the map defaults to accept).
 */
export type LifecycleApplyParams = LifecycleTarget & { report: DiffReport; decisions?: DecisionMap }
