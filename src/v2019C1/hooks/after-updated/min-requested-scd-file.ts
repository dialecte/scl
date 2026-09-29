import {
	resolveAffectedIeds,
	resolveIedByName,
	syncMinRequestedScdFiles,
} from '@/v2019C1/hooks/shared/min-requested-scd-file'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

export async function syncMinRequestedScdFileOnUpdate<
	GenericElement extends Scl.ElementsOf,
>(params: {
	oldRecord: Scl.RawRecord<GenericElement>
	newRecord: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { oldRecord, newRecord, query } = params

	const tagName = newRecord.tagName as string
	if (
		tagName === 'SubNetwork' &&
		attributeValue(oldRecord, 'name') === attributeValue(newRecord, 'name') &&
		attributeValue(oldRecord, 'type') === attributeValue(newRecord, 'type')
	)
		return []

	if (tagName === 'IED') {
		const iedRef = iedRefOnNameChange({ oldRecord, newRecord })
		return syncMinRequestedScdFiles({ iedRefs: iedRef ? [iedRef] : [], query })
	}

	const iedRefs = await resolveAffectedIeds({ record: newRecord, query })
	if (
		tagName === 'ConnectedAP' &&
		attributeValue(oldRecord, 'iedName') !== attributeValue(newRecord, 'iedName')
	) {
		const oldIed = await resolveIedByName({ iedName: attributeValue(oldRecord, 'iedName'), query })
		if (oldIed) iedRefs.push(oldIed)
	}
	return syncMinRequestedScdFiles({ iedRefs, query })
}

function iedRefOnNameChange<GenericElement extends Scl.ElementsOf>(params: {
	oldRecord: Scl.RawRecord<GenericElement>
	newRecord: Scl.RawRecord<GenericElement>
}): Scl.Ref<'IED'> | null {
	const { oldRecord, newRecord } = params

	if (attributeValue(oldRecord, 'name') === attributeValue(newRecord, 'name')) return null
	return { tagName: 'IED', id: newRecord.id }
}

function attributeValue<GenericElement extends Scl.ElementsOf>(
	record: Scl.RawRecord<GenericElement>,
	name: string,
): string | undefined {
	return record.attributes.find((attribute) => attribute.name === name)?.value
}
