import { collectFrameElements, strictAncestorIds } from './ensure-topology-frame'
import { findFrameInstances } from './find-frame-instances'

import { toRef } from '@dialecte/core/helpers'

import { standingChoiceKey } from '@/v2019C1/extensions/lifecycle/engine/standing/resolve-standings'

import type {
	GainedLevel,
	HeldLevel,
	InstanceLevels,
	InstancePlacement,
	ResolveInstanceLevelsParams,
	TemplateFrame,
	TemplateFrameElement,
} from './resolve-instance-levels.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { MappingReader } from '@/v2019C1/extensions/lifecycle/mapping/mapping.types'
import type * as Core from '@dialecte/core'

/**
 * For one instance of a template's unit, where each level of the unit stands in the project — read
 * once, for everything that needs it (the frame diff, the levels listed as held, the levels the
 * template gained, the parents of a gained primary):
 *  - the unit itself on the level the instance sits on, and each level below it on the level,
 *    below its parent's, that an earlier placement created from it or mapped it onto
 *    ({@link findFrameInstances}), and the levels above the unit — `held`, top-down;
 *  - a level the instance holds nothing for, below a level it holds, was gained by the template
 *    since: listed in `gained`, and it stands on the level of the project the consumer mapped it onto
 *    for this instance, else it is new to it (`undefined`).
 */
export async function resolveInstanceLevels(
	reader: MappingReader,
	params: ResolveInstanceLevelsParams,
): Promise<InstancePlacement> {
	const { sourceQuery, templateFrame, frameInstance, decisionMappings } = params
	const matchKey = params.matchKey ?? 'templateUuid'
	const { scopeRef } = templateFrame

	const instanceLevels = new Map<string, Scl.Ref<Scl.ElementsOf> | undefined>()
	instanceLevels.set(scopeRef.id, frameInstance)
	const held: HeldLevel[] = []
	const gained: GainedLevel[] = []
	const instanceAncestors = await reader.findAncestors(frameInstance, {
		stopAtTagName: 'Substation',
	})

	for (const { ref: sourceRef, ancestorIds, uuid, context } of templateFrame.elements) {
		const parentSourceId = ancestorIds.find((id) => held.some((level) => level.sourceRef.id === id))
		const holdIt = async (level: Scl.Ref<Scl.ElementsOf>) => {
			// the project's own level unless it was created from the template's (its lineage)
			const lineage = await reader.any.getAttribute(level, { name: matchKey })
			held.push({
				sourceRef,
				level,
				...(parentSourceId ? { parentSourceId } : {}),
				projectOwned: !uuid || lineage !== uuid,
			})
		}

		// a level above the unit: the level of that kind the instance sits below
		if (context) {
			const contextLevel = instanceAncestors.find((level) => level.tagName === sourceRef.tagName)
			if (contextLevel) await holdIt(toRef(contextLevel) as Scl.Ref<Scl.ElementsOf>)
			continue
		}
		// the unit: the level the instance sits on
		if (sourceRef.id === scopeRef.id) {
			await holdIt(frameInstance)
			continue
		}

		const parentId = ancestorIds.find((id) => instanceLevels.has(id))
		const parentLevel = parentId && instanceLevels.get(parentId)
		if (!parentLevel) {
			instanceLevels.set(sourceRef.id, undefined)
			continue
		}

		const [found] = await findFrameInstances(reader, {
			sourceQuery,
			scopeRef: sourceRef,
			matchKey,
			within: parentLevel,
		})
		if (found) {
			const level = toRef(found.instance) as Scl.Ref<Scl.ElementsOf>
			instanceLevels.set(sourceRef.id, level)
			await holdIt(level)
			continue
		}

		// gained since the instance was placed: where it lands is the consumer's call
		const choiceKey = standingChoiceKey({
			instance: { id: frameInstance.id ?? '' },
			child: sourceRef,
		})
		const decision = decisionMappings?.get(choiceKey)
		gained.push({ sourceRef, parentLevel, choiceKey, ...(decision ? { decision } : {}) })
		instanceLevels.set(
			sourceRef.id,
			decision && 'existing' in decision ? decision.existing : undefined,
		)
	}
	return { levels: instanceLevels, held, gained }
}

/**
 * The structural levels of a template's unit — the levels above it, the unit, the levels below it,
 * top-down — each with its ancestors and uuid: what every instance of the unit is read against,
 * read once.
 */
export async function resolveTemplateFrame(
	sourceQuery: Core.Query<Config>,
	unitRef: Scl.Ref<Scl.ElementsOf>,
): Promise<TemplateFrame> {
	const scopeRef = { tagName: unitRef.tagName, id: unitRef.id ?? '' } as TemplateFrame['scopeRef']
	const contextIds = await strictAncestorIds(sourceQuery, scopeRef)
	const elements: TemplateFrameElement[] = []
	for (const frameElement of await collectFrameElements(sourceQuery, scopeRef)) {
		if (!frameElement.id) continue
		const ancestors = await sourceQuery.findAncestors(frameElement, { stopAtTagName: 'Substation' })
		elements.push({
			ref: { tagName: frameElement.tagName, id: frameElement.id } as TemplateFrameElement['ref'],
			ancestorIds: ancestors.flatMap((ancestor) => (ancestor.id ? [ancestor.id] : [])),
			uuid: await sourceQuery.any.getAttribute(frameElement, { name: 'uuid' }),
			context: contextIds.has(frameElement.id),
		})
	}
	return { scopeRef, elements }
}

/** The levels below the unit, as the matcher reads them: each lands on its level, or is new. */
export function toPinnedMatches(params: {
	instanceLevels: InstanceLevels
	scopeRef: Scl.Ref<Scl.ElementsOf>
}): Map<string, string | undefined> {
	const { instanceLevels, scopeRef } = params

	const pinnedMatches = new Map<string, string | undefined>()
	for (const [sourceId, level] of instanceLevels) {
		if (sourceId === scopeRef.id) continue
		pinnedMatches.set(sourceId, level?.id)
	}
	return pinnedMatches
}
