import { IDENTITY_KEEPING_FILE_TYPES, TEMPLATE_ISD_IED_NAME } from './ied-placement.constants'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { findInstancesByTemplateUuid } from '@/v2019C1/extensions/lifecycle/instance'
import { scenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy'
import { IED_ROOT_TAG } from '@/v2019C1/extensions/lifecycle/source-root/source-root.constants'

import type { AssertIedPlacementParams } from './assert-ied-placement.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Refuse, before anything is read further, an IED placement the report and the apply do not offer yet, with
 * `OPTION_NOT_AVAILABLE`: only the IED of a template ISD or of an ICD is placed, as a new IED.
 *  - an IED read from an IID or an SCD: `meta: { option: 'source', value: 'iid' | 'scd' }`;
 *  - the IED of an ISD instance file (an ISD whose IED is not named `SPECIFICATION`): `meta: { option: 'source', value:
 *    'isd-instance' }`;
 *  - `template` or `fork` finding the IED already in the project (an IED carrying its uuid as lineage, or as its own
 *    uuid for a fork): `meta: { option: 'scenario', value }`. `instantiate` places a new IED whatever the project holds.
 */
export async function assertIedPlacementOffered(
	query: Core.Query<Config>,
	params: AssertIedPlacementParams,
): Promise<void> {
	const { sourceQuery, iedRef, scenario, fileType } = params
	if (fileType && IDENTITY_KEEPING_FILE_TYPES.has(fileType)) {
		throwDialecteError(SCL_ERRORS.OPTION_NOT_AVAILABLE, {
			meta: { option: 'source', value: fileType.toLowerCase() },
			detail: `${params.operation}: an IED read from an ${fileType} is not placed yet, only one of a template ISD or an ICD`,
		})
	}
	const { name, uuid } = await sourceQuery.getAttributes(iedRef)
	if (fileType === 'ISD' && name !== TEMPLATE_ISD_IED_NAME) {
		throwDialecteError(SCL_ERRORS.OPTION_NOT_AVAILABLE, {
			meta: { option: 'source', value: 'isd-instance' },
			detail: `${params.operation}: the IED of an ISD instance file (named "${name}") is not placed yet, only a template's`,
		})
	}
	const { matchesInstances, matchKey } = scenarioPolicy({ scenario })
	if (!matchesInstances) return
	const matched = await findInstancesByTemplateUuid(query, {
		tagName: IED_ROOT_TAG,
		sourceUuid: uuid,
		matchKey,
	})
	if (matched.length === 0) return
	throwDialecteError(SCL_ERRORS.OPTION_NOT_AVAILABLE, {
		meta: { option: 'scenario', value: scenario },
		detail: `${params.operation}: "${scenario}" finds the IED in the project, only a first placement is offered yet`,
	})
}
