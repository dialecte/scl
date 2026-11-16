/// <reference types="vite/client" />
import { describe } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

// An LNode the project already holds bound to a logical node it lacks is the project's own state: an apply releases
// only what it wrote, and leaves that binding as it is.

/** The fixtures of this file, whole documents read as they are. */
const FIXTURES: Readonly<Record<string, string>> = import.meta.glob<string>('./fixtures/*.xml', {
	query: '?raw',
	import: 'default',
	eager: true,
})

const functionSource = { tagName: 'Function', id: 'function-s' } as Scl.Ref<'Function'>
const projectBay = { tagName: 'Bay', id: 'bay' } as Scl.Ref<'Bay'>

/** The template's breaker, placed back to its specification: assigned to no IED, XCBR1. */
const releasedBreaker =
	'//default:Function[@name="F1"]/default:LNode[@iedName="None"][@lnClass="XCBR"][@lnInst="1"][not(@prefix)][not(@ldInst)][not(@lnUuid)]'

const projectOrphan =
	'the project already holds an LNode bound to a logical node it lacks: what the apply did not write is left as it is'

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

/** The act of a table: the report of the template's F1 for the project's bay, then its apply, every decision accepted. */
function applyTheTemplate(params: {
	scenario: LifecycleScenario
}): (actParams: SclTest.ActParams<TestCase>) => Promise<SclTest.ActResult> {
	return async function reportThenApply({ source, target }) {
		if (!target) throw new Error('target required')
		const lifecycleTarget = {
			verb: 'fsd',
			scenario: params.scenario,
			sourceQuery: source.query,
			ref: functionSource,
			anchor: projectBay,
		} as Parameters<typeof report>[1]
		const lifecycleReport = await report(target.query, lifecycleTarget)
		await target.transaction(async function applyEveryDecision(tx) {
			await apply(tx, {
				...lifecycleTarget,
				report: lifecycleReport,
				resolution: { decisions: new Map() },
			})
		})
		return { assertOn: 'target' }
	}
}

describe('lifecycle — a newer template updating an instance whose LNode is bound to a logical node the project lacks', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'newer template adding an input to an LNode the project holds bound to a logical node it lacks -> its binding left as it is':
			{
				allowIncoherentReferences: projectOrphan,
				sourceXml: FIXTURES['./fixtures/template-breaker-gaining-an-input.xml'],
				targetXml: FIXTURES['./fixtures/project-breaker-bound-to-a-device-it-lacks.xml'],
				expectedQueries: [
					'//default:Function[@name="F1"]/default:LNode[@iedName="P9"][@ldInst="LD0"][@prefix="Q0"][@lnClass="XCBR"][@lnInst="2"]',
					'//default:LNode[@iedName="P9"]//v2019C1:SourceRef[@input="Trip"]',
				],
			},
	}

	runSclTestCases.withExport({ testCases, act: applyTheTemplate({ scenario: 'template' }) })
})

describe('lifecycle — a template placed beside a project LNode bound to a logical node the project lacks', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'project LNode already bound to a logical node it lacks -> left as it is, only what the apply wrote released':
			{
				allowIncoherentReferences: projectOrphan,
				sourceXml: FIXTURES['./fixtures/template-breaker-bound-to-its-device.xml'],
				targetXml: FIXTURES['./fixtures/project-lnode-bound-to-a-device-it-lacks.xml'],
				expectedQueries: [
					'//default:Function[@name="Existing"]/default:LNode[@iedName="P9"][@lnUuid="gone-ln-uuid"]',
					releasedBreaker,
				],
			},
	}

	runSclTestCases.withExport({ testCases, act: applyTheTemplate({ scenario: 'instantiate' }) })
})
