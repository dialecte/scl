import { asd as reconcileAsd } from './asd'
import { fsd as reconcileFsd } from './fsd'
import { ied as reconcileIedRecipe } from './ied'
import { ssd as reconcileSsd } from './ssd'

import { releaseWrittenImplementation } from '@/v2019C1/extensions/lifecycle/apply/release-written-implementation'

import type { UpdateAsdParams, WrittenApplications } from './asd.types'
import type { UpdateFsdParams } from './fsd.types'
import type { UpdateIedParams } from './ied.types'
import type { UpdateSsdParams } from './ssd.types'
import type { Config } from '@/v2019C1/config'
import type {
	AppliedFunction,
	AppliedInstance,
} from '@/v2019C1/extensions/lifecycle/apply/apply.types'
import type * as Core from '@dialecte/core'

// The update recipes as a caller runs them: each runs its recipe, then releases once what that run wrote naming a
// logical node, ExtRef or ExtCtrl the project lacks, as `lifecycle.apply` does after its verb. The recipes calling
// one another (a cascade) and the apply run the recipes themselves, so each run reads the document once for it.

/**
 * `tx.lifecycle.update.fsd` - reconcile a project against a (possibly newer) FSD, then release what the run wrote
 * naming a logical node, ExtRef or ExtCtrl the project lacks, as `tx.lifecycle.apply` does after its verb.
 *
 * @intent update a project from a newer FSD, reconcile Function instances with their template, instantiate or update a function template
 */
export async function fsd(
	tx: Core.Transaction<Config>,
	params: UpdateFsdParams,
): Promise<AppliedFunction[]> {
	const from = tx.getStagedOperations().length
	const written = await reconcileFsd(tx, params)
	await releaseWrittenImplementation(tx, { from })
	return written
}

/**
 * `tx.lifecycle.update.asd` - reconcile a project against a (possibly newer) ASD, then release what the run wrote
 * naming a logical node, ExtRef or ExtCtrl the project lacks, as `tx.lifecycle.apply` does after its verb.
 *
 * @intent update a project from a newer ASD, reconcile Application instances with their template, instantiate or update an application template
 */
export async function asd(
	tx: Core.Transaction<Config>,
	params: UpdateAsdParams,
): Promise<WrittenApplications> {
	const from = tx.getStagedOperations().length
	const written = await reconcileAsd(tx, params)
	await releaseWrittenImplementation(tx, { from })
	return written
}

/**
 * `tx.lifecycle.update.ssd` - reconcile a project against a (possibly newer) SSD, then release what the run wrote
 * naming a logical node, ExtRef or ExtCtrl the project lacks, as `tx.lifecycle.apply` does after its verb.
 *
 * @intent update a project from a newer SSD, reconcile a bay typical with its template, propagate an SSD change
 */
export async function ssd(
	tx: Core.Transaction<Config>,
	params: UpdateSsdParams,
): Promise<WrittenApplications> {
	const from = tx.getStagedOperations().length
	const written = await reconcileSsd(tx, params)
	await releaseWrittenImplementation(tx, { from })
	return written
}

/**
 * `tx.lifecycle.update.ied` - update the IED of the project placed from a template ISD with a newer revision of it (or
 * place it when the project holds none), then release what the run wrote naming a logical node, ExtRef or ExtCtrl the
 * project lacks, as `tx.lifecycle.apply` does after its verb.
 *
 * @intent update an S-IED from a newer ISD, reconcile an IED with its template ISD, update an IED specification
 */
export async function ied(
	tx: Core.Transaction<Config>,
	params: UpdateIedParams,
): Promise<AppliedInstance<'IED'>[]> {
	const from = tx.getStagedOperations().length
	const written = await reconcileIedRecipe(tx, params)
	await releaseWrittenImplementation(tx, { from })
	return written
}
