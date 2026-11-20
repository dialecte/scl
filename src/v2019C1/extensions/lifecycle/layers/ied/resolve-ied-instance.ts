import { assertIedSourceOffered } from './assert-ied-placement'
import { assertIedVersion } from './assert-ied-version'
import { UPDATED_IED_FILE_TYPES } from './resolve-ied-instance.constants'

import { throwDialecteError } from '@dialecte/core'
import { toRef } from '@dialecte/core/helpers'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { findInstancesByTemplateUuid } from '@/v2019C1/extensions/lifecycle/instance'
import { scenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy'
import { readDocumentFileType } from '@/v2019C1/extensions/lifecycle/source-file-type'
import { IED_ROOT_TAG } from '@/v2019C1/extensions/lifecycle/source-root/source-root.constants'

import type { ForkedIedParams, ResolveIedInstanceParams } from './resolve-ied-instance.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * The IED of the project a `template` update of a source IED reconciles: the one `targetInstance` names among those
 * carrying the source IED's uuid as their lineage; the only one when `targetInstance` names none. For a `fork` on an open
 * ISD, the IED of the source IED's uuid (another version of the file updates it; `targetInstance` is not read).
 * `undefined` when the project holds none, for `instantiate`, or for a fork into a project (a first placement, see
 * `assertIedPlacementOffered`).
 *
 * Refused before anything is read further:
 *  - a source an IED is not read from (`assertIedSourceOffered`);
 *  - a fork on an open ISD document of a file that is not a version of it, with `NOT_A_VERSION_OF_FILE`
 *    (`assertIedVersion`);
 *  - the IED of another file than an ISD found in the project, with `OPTION_NOT_AVAILABLE`
 *    (`meta: { option: 'source', value }`, the file type in lower case): only an ISD's IED is updated;
 *  - several instances and `targetInstance` naming none of them, `targetInstance` naming an element that is no instance,
 *    or naming one while the project holds none (the file is no version of what it was placed from), with
 *    `TARGET_INSTANCE_REQUIRED` (`meta: { instances, named? }`): an update changes the IED it starts from.
 */
export async function resolveIedInstance(
	reader: Core.Query<Config> | Core.Transaction<Config>,
	params: ResolveIedInstanceParams,
): Promise<AnyTrackedRecord | undefined> {
	const { scenario, fileType, targetInstance, operation } = params
	const { uuid } = await assertIedSourceOffered(params)
	if (scenario === 'fork')
		await assertIedVersion(reader, {
			sourceQuery: params.sourceQuery,
			otherIedUuid: uuid,
			operation,
		})
	const { matchesInstances, matchKey, placementIdentity } = scenarioPolicy({ scenario })
	// a new IED is placed whatever the project holds
	if (!matchesInstances) return undefined
	// a fork keeps the file's identity: on an open ISD, another version of it updates its IED (found by uuid, the
	// version check above proved it is there); into a project, a fork is a first placement
	if (placementIdentity === 'keep') return forkedIed(reader, { uuid, matchKey })
	const instances = await findInstancesByTemplateUuid(reader, {
		tagName: IED_ROOT_TAG,
		sourceUuid: uuid,
		matchKey,
	})
	// an update started from an IED the template placed none of: no version of what that IED came from
	if (instances.length === 0) {
		if (!targetInstance) return undefined
		return throwDialecteError(SCL_ERRORS.TARGET_INSTANCE_REQUIRED, {
			meta: { instances: [], named: targetInstance },
			detail: `${operation}: the project holds no IED placed from the template, the update starts from none`,
		})
	}
	if (!fileType || !UPDATED_IED_FILE_TYPES.has(fileType)) {
		throwDialecteError(SCL_ERRORS.OPTION_NOT_AVAILABLE, {
			meta: { option: 'source', value: (fileType ?? 'unknown').toLowerCase() },
			detail: `${operation}: an IED is updated from a template ISD only yet, not from ${fileType ?? 'a file of unknown type'}`,
		})
	}
	const named = targetInstance
		? instances.find((instance) => instance.id === targetInstance.id)
		: instances.length === 1
			? instances[0]
			: undefined
	if (named) return named
	return throwDialecteError(SCL_ERRORS.TARGET_INSTANCE_REQUIRED, {
		meta: {
			instances: instances.map((instance) => toRef(instance)),
			...(targetInstance ? { named: targetInstance } : {}),
		},
		detail: `${operation}: the project holds ${instances.length} instance(s) of the IED, the update starts from one of them`,
	})
}

/** The IED of an open ISD a fork of another version of it updates: the one carrying the source IED's uuid. */
async function forkedIed(
	reader: Core.Query<Config> | Core.Transaction<Config>,
	params: ForkedIedParams,
): Promise<AnyTrackedRecord | undefined> {
	if ((await readDocumentFileType(reader)) !== 'ISD') return undefined
	const [instance] = await findInstancesByTemplateUuid(reader, {
		tagName: IED_ROOT_TAG,
		sourceUuid: params.uuid,
		matchKey: params.matchKey,
	})
	return instance
}
