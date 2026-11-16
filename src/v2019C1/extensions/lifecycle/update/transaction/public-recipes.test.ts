/// <reference types="vite/client" />
import { asd, fsd, ssd } from '.'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

/** The fixtures of this file, whole documents read as they are. */
const FIXTURES: Readonly<Record<string, string>> = import.meta.glob<string>('./fixtures/*.xml', {
	query: '?raw',
	import: 'default',
	eager: true,
})

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** A project S1 / V1 / B1 without the template's device P1. */
const projectWithoutTheDevice = /* xml */ `
	<SCL ${ns}>
		<Header id="project" uuid="project-uuid"/>
		<Substation name="S1">
			<VoltageLevel ${id}="voltage-level" name="V1">
				<Bay ${id}="bay" name="B1"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const projectBay = { tagName: 'Bay', id: 'bay' } as Scl.Ref<'Bay'>

/** The template's breaker LNode, placed back to its specification: assigned to no IED, XCBR1. */
const releasedBreaker =
	'//default:Function[@name="F1"]/default:LNode[@iedName="None"][@lnClass="XCBR"][@lnInst="1"][not(@prefix)][not(@ldInst)][not(@lnUuid)]'

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

const testCases: SclTest.TestCases<TestCase> = {
	'template LNode bound to its device, project without it -> placed assigned to no IED': {
		sourceXml: FIXTURES['./fixtures/template-bound-to-its-device.xml'],
		targetXml: projectWithoutTheDevice,
		expectedQueries: [releasedBreaker],
		unexpectedQueries: ['//default:Substation[@name="S1"]//default:LNode[@iedName="P1"]'],
	},
}

describe('update.fsd called directly - what it writes bound to a logical node the project lacks is released', () => {
	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await target.transaction(async function updateFunction(tx) {
			await fsd(tx, {
				sourceQuery: source.query,
				functionRef: { tagName: 'Function', id: 'function-s' } as Scl.Ref<'Function'>,
				targetParent: projectBay,
			})
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})

describe('update.asd called directly - what it writes bound to a logical node the project lacks is released', () => {
	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await target.transaction(async function updateApplication(tx) {
			await asd(tx, {
				sourceQuery: source.query,
				applicationRef: { tagName: 'Application', id: 'application-s' } as Scl.Ref<'Application'>,
				targetParent: projectBay,
			})
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})

describe('update.ssd called directly - what it writes bound to a logical node the project lacks is released', () => {
	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await target.transaction(async function updateSubstation(tx) {
			await ssd(tx, {
				sourceQuery: source.query,
				scopeRef: { tagName: 'Bay', id: 'bay-s' } as Scl.Ref<'Bay'>,
				targetParent: { tagName: 'VoltageLevel', id: 'voltage-level' } as Scl.Ref<'VoltageLevel'>,
			})
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})
