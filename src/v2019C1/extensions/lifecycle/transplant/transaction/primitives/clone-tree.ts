import { stripAttributes } from '@dialecte/core/helpers'

import {
	holdsTemplateOnlyElement,
	toInstanceTree,
	toTemplateTree,
} from '@/v2019C1/extensions/lifecycle/engine/instance-tag'

import type { StripConfig, RetagRootConfig } from './clone-tree.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { OmitEntry } from '@dialecte/core'

/**
 * Clone pipeline: getTree -> template-only elements as what they are instantiated as -> optional
 * retag root tagName -> optional template form -> optional attribute filter -> deepClone.
 *
 * The clone is faithful: every attribute is copied as the source holds it, the lineage (`templateUuid` /
 * `originUuid`) included — what the clone's lineage becomes is decided by the identity writer the caller runs over
 * the returned mappings (`finalizeClonedIdentity`), which also fixes up the uuids. `strip: { scope, attributes }`
 * drops attributes the target cannot take (a generic filter, not a lineage policy); none by default.
 *
 * Returns the `CloneResult` (cloned root record + source->target mappings), or
 * `undefined` when the source element does not exist.
 */
export async function cloneTree(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		ref: Scl.Ref<Scl.ElementsOf>
		targetParent: Scl.Ref<Scl.ElementsOf>
		omit?: OmitEntry<Config>[]
		retagRoot?: RetagRootConfig
		strip?: StripConfig | false
		/** Source records not cloned, with what they hold (record ids). */
		leaveOut?: ReadonlySet<string>
		/** Written as a template with no parent level: a function as a function template. */
		asTemplate?: boolean
	},
): Promise<Core.CloneResult<Config, Exclude<Scl.ElementsOf, 'SCL'>> | undefined> {
	const { sourceQuery, ref, targetParent, omit, retagRoot, strip, leaveOut, asTemplate } = params

	// A clone must be a faithful copy: keep transparent `Private` wrappers in the tree
	// (`unwrap: []` disables the default transparent-element unwrap) so vendor privates —
	// including text-only (e.g. Siemens-MasterId) and empty flags (e.g. Siemens-IsSiprotec5IED) —
	// reach `deepClone` instead of being flattened away.
	const read = await sourceQuery.getTree(ref, { omit, unwrap: [] })
	if (!read) return undefined
	const tree = leaveOut && leaveOut.size > 0 ? withoutLeftOut({ tree: read, leaveOut }) : read

	// a subtree holding template-only elements (a function template) is cloned as what it is
	// instantiated as: a function, in the namespace of a function
	const instantiable = holdsTemplateOnlyElement(tree)
		? toInstanceTree({ tree, parentTagName: targetParent.tagName })
		: tree

	const rooted =
		retagRoot && instantiable.tagName === retagRoot.from
			? { ...instantiable, tagName: retagRoot.to }
			: instantiable
	const retagged = asTemplate
		? toTemplateTree({ tree: rooted, parentTagName: targetParent.tagName })
		: rooted

	let result = retagged
	if (strip) {
		result =
			strip.scope === 'tree'
				? stripAttributes(retagged, strip.attributes)
				: {
						...retagged,
						attributes: retagged.attributes.filter((a) => !strip.attributes.includes(a.name)),
					}
	}

	// getTree on Scl.Ref<Scl.ElementsOf> includes 'SCL' in the union; deepClone requires
	// a child element. 'SCL' is the document root and never a cloned satellite.
	return await tx.deepClone(targetParent, result as Scl.TreeRecord<Exclude<Scl.ElementsOf, 'SCL'>>)
}

/** The tree without the records left out, with what they hold. */
function withoutLeftOut<GenericTree extends { tree: GenericTree[] } & { id: string }>(params: {
	tree: GenericTree
	leaveOut: ReadonlySet<string>
}): GenericTree {
	const { tree, leaveOut } = params
	return {
		...tree,
		tree: tree.tree
			.filter((child) => !leaveOut.has(child.id))
			.map((child) => withoutLeftOut({ tree: child, leaveOut })),
	}
}
