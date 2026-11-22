import { compareFileIdentity } from '@/v2019C1/extensions/lifecycle/file-identity'
import { isIsdInstance } from '@/v2019C1/extensions/lifecycle/layers/ied/is-isd-instance'
import { checkIedScenario } from '@/v2019C1/extensions/lifecycle/layers/ied/resolve-ied-instance'
import { isRefused } from '@/v2019C1/extensions/lifecycle/refusal'
import { IED_SOURCE_EXTENSIONS } from '@/v2019C1/extensions/lifecycle/report/report-target.constants'
import {
	checkSourceFileType,
	readDocumentFileType,
} from '@/v2019C1/extensions/lifecycle/source-file-type'

import type {
	IedScenario,
	IedScenarioOfParams,
	LayerScenario,
	LayerScenarioOfParams,
	PickIedScenarioParams,
} from './scenario-of.types'
import type { Config } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { Refused } from '@/v2019C1/extensions/lifecycle/refusal.types'
import type * as Core from '@dialecte/core'

/**
 * The scenario an IED operation runs with, or why it is refused, before anything is reported or written. The consumer
 * tells what it does: it updates the IED of the open document `targetInstance` names, or, without one, places the
 * source IED.
 *  - placed: the IED of an ISD instance file keeps its identity (`fork`), any other is a new IED (`instantiate`);
 *  - updated: on an open ISD, another version of its file or the IED of another ISD instance file is a `fork` of it,
 *    any other source is the template the IED was placed from (`template`).
 *
 * The answer is `{ scenario, sameFile }` (`sameFile`: both Headers name the same file, a fork of the file itself), or
 * `{ refused }` with the error the verbs throw for that scenario (`code`, its `meta` and `detail`) and why (`reason`):
 * the report, the apply and the update of the IED read the same checks, so a scenario answered here is one they run,
 * and one refused here they refuse alike. The type of file the source is comes from its extension, as the report reads
 * it (the report refuses an extension no IED is read from; `apply` and `update.ied` are given the type). Placed on an
 * open ISD of the same file holding the IED, an ISD instance is a fork that updates it. Which IED a source file holds is `sourceRoot.ied`'s to tell.
 *
 * @intent tell whether an ISD places a new IED, forks or updates an IED, check an ISD is a version of the open ISD before a review, know the lifecycle scenario of an IED file
 */
export async function ied(
	query: Core.Query<Config>,
	params: IedScenarioOfParams,
): Promise<IedScenario | Refused> {
	const { sourceQuery, ref, targetInstance } = params
	const operation = 'scenarioOf (ied)'
	const fileType = await checkSourceFileType(sourceQuery, {
		accepted: IED_SOURCE_EXTENSIONS,
		operation,
	})
	if (isRefused(fileType)) return fileType
	const [identity, source, openFileType] = await Promise.all([
		compareFileIdentity({ query, otherQuery: sourceQuery }),
		sourceQuery.getAttributes(ref),
		readDocumentFileType(query),
	])
	const scenario = pickIedScenario({
		updates: targetInstance !== undefined,
		sourceIsIsdInstance: isIsdInstance({ fileType, iedName: source.name }),
		onOpenIsd: openFileType === 'ISD',
		sameFile: identity.sameFile,
	})
	const answer = await checkIedScenario(query, {
		sourceQuery,
		iedRef: ref,
		scenario,
		fileType,
		targetInstance,
		operation,
	})
	if (isRefused(answer)) return answer
	return { scenario, sameFile: identity.sameFile }
}

/**
 * Whether the source of an FSD, ASD or SSD operation is a version of the open document's file: both Headers name the
 * same file. No scenario: the verbs take every one, so the consumer states it (instantiate a new instance, update its
 * instances from the template, or fork the file).
 *
 * @intent tell whether a template file is a version of the open file, know if an FSD, ASD or SSD is the same file
 */
export async function layer(
	query: Core.Query<Config>,
	params: LayerScenarioOfParams,
): Promise<LayerScenario> {
	const { sameFile } = await compareFileIdentity({ query, otherQuery: params.sourceQuery })
	return { sameFile }
}

/** The scenario of an IED operation, from what tells it apart: see {@link ied}. */
function pickIedScenario(params: PickIedScenarioParams): LifecycleScenario {
	const { updates, sourceIsIsdInstance, onOpenIsd, sameFile } = params
	if (!updates) return sourceIsIsdInstance ? 'fork' : 'instantiate'
	return onOpenIsd && (sameFile || sourceIsIsdInstance) ? 'fork' : 'template'
}
