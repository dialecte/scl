import { resolveStandings, standingChoiceKey } from './resolve-standings'

import { describe, expect, it } from 'vitest'

import type { Standing, StandingChild, StandingPolicy } from './standing.types'
import type { Scl } from '@/v2019C1/config'
import type { DecisionMapping } from '@/v2019C1/extensions/lifecycle/mapping'
import type { AnyTrackedRecord } from '@dialecte/core'

// A container with two instances, each living on its own level, and one child of lineage "child-uuid".
const child: StandingChild = { ref: { tagName: 'Function', id: 'child-s' }, lineage: 'child-uuid' }
const record = (id: string) => ({ id, tagName: 'Function' }) as unknown as AnyTrackedRecord
const instances = [record('first'), record('second')]
const levelOf: Record<string, Scl.Ref<Scl.ElementsOf>> = {
	first: { tagName: 'Bay', id: 'bay-1' },
	second: { tagName: 'Bay', id: 'bay-2' },
}

type Project = {
	/** What each instance already holds for the child. */
	owned?: Record<string, string[]>
	/** The elements of the child's lineage on each level, by level id. */
	onLevel?: Record<string, string[]>
	/** Where the consumer started. */
	anchor?: string
}

function policyFor(project: Project): StandingPolicy {
	return {
		owned: ({ instance }) => (project.owned?.[instance.id] ?? []).map(record),
		levelOf: async ({ instance }) => levelOf[instance.id],
		lineageAt: async ({ level }) => (project.onLevel?.[level.id ?? ''] ?? []).map(record),
		anchorLevelOf: async () =>
			project.anchor
				? ({ tagName: 'Bay', id: project.anchor } as Scl.Ref<Scl.ElementsOf>)
				: undefined,
	}
}

/** A standing in one word, with the element it stands on. */
function summarize(standing: Standing | undefined): string {
	if (!standing) return 'nothing'
	if (standing.kind === 'owned')
		return `owned ${standing.elements.map((element) => element.id).join('+')}`
	if (standing.kind === 'taken') return `taken ${standing.element.id}`
	if (standing.kind === 'placed') return `placed on ${standing.level.id}`
	return 'undecided'
}

describe('resolveStandings — what stands, per instance, for a child the container refers to', () => {
	it.each<{
		name: string
		project: Project
		chosen?: [string, DecisionMapping][]
		expected: { first: string; second: string; choices: string[]; unclaimed?: string[] }
	}>([
		{
			name: 'each instance holds its own → owned, nothing to choose',
			project: { owned: { first: ['own-1'], second: ['own-2'] } },
			expected: { first: 'owned own-1', second: 'owned own-2', choices: [] },
		},
		{
			name: 'nothing of the lineage anywhere → a new one placed where each instance lives',
			project: {},
			expected: { first: 'placed on bay-1', second: 'placed on bay-2', choices: [] },
		},
		{
			name: 'one free on the first level → taken by the first instance; the second gets a new one',
			project: { onLevel: { 'bay-1': ['free-1'] } },
			expected: { first: 'taken free-1', second: 'placed on bay-2', choices: [] },
		},
		{
			name: 'one held by the first instance on the shared level → never free for the second',
			project: { owned: { first: ['own-1'] }, onLevel: { 'bay-1': ['own-1'], 'bay-2': ['own-1'] } },
			expected: { first: 'owned own-1', second: 'placed on bay-2', choices: [] },
		},
		{
			name: 'several free on the first level → the consumer chooses, nothing written before',
			project: { onLevel: { 'bay-1': ['free-1', 'free-2'] } },
			expected: { first: 'undecided', second: 'placed on bay-2', choices: ['first'] },
		},
		{
			name: '… the consumer picks one → taken',
			project: { onLevel: { 'bay-1': ['free-1', 'free-2'] } },
			chosen: [
				[
					standingChoiceKey({ instance: { id: 'first' }, child: child.ref }),
					{ existing: { tagName: 'Function', id: 'free-2' } },
				],
			],
			expected: { first: 'taken free-2', second: 'placed on bay-2', choices: ['first'] },
		},
		{
			name: '… the consumer wants a new one → placed, beside the two',
			project: { onLevel: { 'bay-1': ['free-1', 'free-2'] } },
			chosen: [
				[standingChoiceKey({ instance: { id: 'first' }, child: child.ref }), { create: {} }],
			],
			expected: { first: 'placed on bay-1', second: 'placed on bay-2', choices: ['first'] },
		},
		{
			name: 'what no instance stands on where the consumer started → reconciled there',
			project: { onLevel: { 'bay-1': ['free-1', 'free-2'] }, anchor: 'bay-1' },
			chosen: [
				[
					standingChoiceKey({ instance: { id: 'first' }, child: child.ref }),
					{ existing: { tagName: 'Function', id: 'free-1' } },
				],
			],
			expected: {
				first: 'taken free-1',
				second: 'placed on bay-2',
				choices: ['first'],
				unclaimed: ['free-2'],
			},
		},
	])('$name', async ({ project, chosen, expected }) => {
		const [resolved] = await resolveStandings({
			instances,
			children: [child],
			policy: policyFor(project),
			decisionMappings: new Map(chosen ?? []),
		})

		expect({
			first: summarize(resolved.standings.get('first')),
			second: summarize(resolved.standings.get('second')),
			choices: [...resolved.choices.keys()],
			...(expected.unclaimed ? { unclaimed: resolved.unclaimed.map((element) => element.id) } : {}),
		}).toEqual(expected)
	})
})
