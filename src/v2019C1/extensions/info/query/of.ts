import { describeRecords } from './describe-records'
import { createInfoContext } from './info-context'

import type { ElementInfo, InfoOptions } from './of.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

// ── Public API ───────────────────────────────────────────────────────

/**
 * The own title of an SCL element, read from the element itself - its attributes or text, a named
 * child for a few tags, the signal name for a signal - never from its ancestors (a Bay's title is its
 * `name`, not its path from the root, which is `reference.buildElementPath`); its state when asked
 * (`withState: true`: an LNode's reads what implements it and the kind of that IED, so a title alone
 * stays one read of the element), and its `<Labels>` when asked (`withLabels: true`, two more reads).
 *
 * Resolution precedence for the title (first non-empty wins):
 * 1. `TITLE_FIELDS_OVERRIDE` spec for the tag (compact or full).
 * 2. `record.value` (XML text body) - handles BayType, IEDName, Val, etc.
 * 3. `DEFINITION.identityFields` fallback (name > id > first), lineage attributes left out.
 * 4. tagName.
 *
 * @intent own title or display name of an element, display name of a Bay/IED/LNode/ExtRef, state of an LNode or signal (locked, mapped, connected, implemented), Labels translations of an element
 */
export async function of<GenericElement extends string = string>(
	query: Core.Query<Config>,
	refOrRecord: AnyRefOrRecord & { readonly tagName: GenericElement },
	options: InfoOptions = {},
): Promise<ElementInfo<GenericElement>> {
	const record = await query.getRecord(refOrRecord as Scl.Ref<Scl.ElementsOf>)
	const context = createInfoContext(query)
	const [info] = await describeRecords({ query, records: [record], options, context })
	return info as ElementInfo<GenericElement>
}
