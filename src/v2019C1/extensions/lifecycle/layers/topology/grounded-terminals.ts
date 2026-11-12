import { GROUNDED_NODE_REFERRERS } from './grounded-terminals.constants'
import { placeTemplateLevels, readTemplateLevels } from './landed-levels'

import { GROUNDED_CONNECTIVITY_NODE_NAME } from '@/v2019C1/constants/naming'
import { buildElementPath } from '@/v2019C1/extensions/reference/query/build/build-element-path'
import {
	composeDerivedAttributes,
	derivedAttributesFollowing,
} from '@/v2019C1/extensions/reference/query/build/compose-derived-attributes'
import { resolveElementPath } from '@/v2019C1/extensions/reference/query/resolve/resolve-element-path'
import { namesGroundedNode } from '@/v2019C1/helpers/grounded-node'

import type { Config, Scl } from '@/v2019C1/config'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type { ElementPath } from '@/v2019C1/extensions/reference/query/build/path-segment.types'
import type * as Core from '@dialecte/core'

/**
 * Name, on each terminal or neutral point an operation cloned onto the predefined grounded node, the grounded node of
 * the level its path names as that level was placed (`placedLevels`): no file declares the node, so no uuid repoints the
 * reference, and its path would keep the template's names. Run once the placed levels carry their final names. Reads
 * the source attributes the clone carries; each level's path is built once.
 */
export async function landGroundedTerminals(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		cloneMappings: readonly Scl.CloneMapping[]
		/** Where each level of the template was placed: source record id -> the project's level. */
		placedLevels: ReadonlyMap<string, Scl.Ref<Scl.ElementsOf> | undefined>
	},
): Promise<void> {
	const { sourceQuery, placedLevels } = params
	const grounded = params.cloneMappings.flatMap(function onGrounded(mapping) {
		if (!(GROUNDED_NODE_REFERRERS as readonly string[]).includes(mapping.source.tagName)) return []
		const path = mapping.source.attributes.find(function isNodePath(attribute) {
			return attribute.name === 'connectivityNode'
		})?.value
		return path && namesGroundedNode({ targets: ['ConnectivityNode'], path })
			? [{ mapping, path }]
			: []
	})
	// the grounded node's path of each level, built once: none when the level was not placed
	const nodePaths = new Map<string, ElementPath | undefined>()
	for (const { path } of grounded) {
		const levelPath = path.slice(0, path.lastIndexOf('/'))
		if (nodePaths.has(levelPath)) continue
		const sourceLevel = await resolveElementPath(sourceQuery, levelPath)
		const placed = sourceLevel ? placedLevels.get(sourceLevel.id) : undefined
		const placedPath = placed ? await buildElementPath(tx, placed) : null
		nodePaths.set(levelPath, placedPath?.path ? groundedNodePath(placedPath) : undefined)
	}
	for (const { mapping, path } of grounded) {
		const nodePath = nodePaths.get(path.slice(0, path.lastIndexOf('/')))
		if (!nodePath) continue
		const derived = derivedAttributesFollowing({
			tagName: mapping.target.tagName,
			follows: 'connectivityNode',
		})
		const levelNames = derived ? composeDerivedAttributes({ derived, sourcePath: nodePath }) : []
		const attributes: Record<string, string> = { connectivityNode: nodePath.path }
		for (const { name, value } of levelNames) if (value !== undefined) attributes[name] = value
		await tx.any.update(mapping.target, { attributes })
	}
}

/**
 * Where each Substation, VoltageLevel and Bay of a template was placed by an operation placing under `structure`: on
 * the structure's level of its tag, else on the nearest level above it the structure holds, as a clone is placed
 * (`placeTemplateLevels`). One read per tag.
 */
export async function placeLevelsOnStructure(
	sourceQuery: Core.Query<Config>,
	params: { structure: TargetStructure },
): Promise<Map<string, Scl.Ref<Scl.ElementsOf> | undefined>> {
	const levels = await readTemplateLevels(sourceQuery)
	return placeTemplateLevels({ levels, structure: params.structure })
}

/** The path of the grounded node of a placed level, segment by segment, as a node of that level reads it. */
function groundedNodePath(levelPath: ElementPath): ElementPath {
	return {
		path: `${levelPath.path}/${GROUNDED_CONNECTIVITY_NODE_NAME}`,
		segments: [
			...levelPath.segments,
			{
				segment: GROUNDED_CONNECTIVITY_NODE_NAME,
				separator: '/',
				ref: { tagName: 'ConnectivityNode' },
			},
		],
	}
}
