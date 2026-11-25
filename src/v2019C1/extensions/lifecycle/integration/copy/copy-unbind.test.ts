import { applyCopy, ref, reportCopy } from './copy-helpers'
import functionXml from './fixtures/a-function-to-copy.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { CopyCase } from './copy-helpers.types'
import type { CopyUnbind } from '@/v2019C1/extensions/lifecycle/copy/copy.types'
import type { SclTest } from '@/v2019C1/test'

// a-function-to-copy.xml: F1's PTRC1 (ln1) is bound to P1's PPTRC2 by uuid, specified as PTRC1 on no IED, its Op mapped on
// PPTRC3 (ln1-op), its Trip input P1's GGIO1 ExtRef (trip-input); its CSWI1 (ln4) is bound to S_IED's CSWI1, specified on
// S_IED's LD0 (ln4-naming); its XCBR1 (ln3) is bound to nothing. No IED travels with a copy of F1.

const TO_B2: CopyCase = { verb: 'fsd', ref: ref('Function', 'f1'), anchor: ref('Bay', 'b2') }

const COPY_IN_B2 = '//default:Bay[@name="B2"]/default:Function[@name="F1"]'

// The report lists every copied LNode the copy releases from its IED, with what the apply writes on its copy.
describe('fsd copy - the LNodes it releases, reported', () => {
	type ReportedCase = SclTest.BaseXmlTestCase & { copy: CopyCase; expected: CopyUnbind[] }

	const testCases: SclTest.TestCases<ReportedCase> = {
		// PTRC1 bound to P1 by uuid with its mapping and ExtRef input; CSWI1 bound to S_IED
		'F1 to B2 → PTRC1 unassigned, named as specified, its mapping and its ExtRef input cleared; CSWI1 unassigned, its specification IED removed':
			{
				sourceXml: functionXml,
				copy: TO_B2,
				expected: [
					{
						lnode: {
							element: { tagName: 'LNode', id: 'ln1' },
							written: { iedName: 'None', lnInst: '1' },
							removed: ['ldInst', 'lnUuid', 'prefix'],
						},
						references: [
							{
								element: { tagName: 'DOS', id: 'ln1-op' },
								written: {},
								removed: ['mappedDoName', 'mappedLnUuid'],
							},
							{
								element: { tagName: 'SourceRef', id: 'trip-input' },
								written: {},
								removed: ['extRefAddr', 'extRefUuid'],
							},
						],
					},
					{
						lnode: {
							element: { tagName: 'LNode', id: 'ln4' },
							written: { iedName: 'None' },
							removed: ['ldInst', 'lnUuid'],
						},
						specNaming: {
							element: { tagName: 'LNodeSpecNaming', id: 'ln4-naming' },
							written: {},
							removed: ['sIedName'],
						},
						references: [],
					},
				],
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<ReportedCase>): Promise<void> {
		const unbinds = reportCopy({ document: source, copy: testCase.copy }).then(
			(report) => report.unbinds,
		)
		await expect(unbinds).resolves.toStrictEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// The apply writes the plan the report listed on the copy; the original keeps its bindings.
describe('fsd copy - the LNodes it releases, written', () => {
	type WrittenCase = SclTest.BaseXmlTestCase & { copy: CopyCase }

	const testCases: SclTest.TestCases<WrittenCase> = {
		// PTRC1 bound to P1's PPTRC2, specified as PTRC1 on no IED
		'F1 to B2 → the copied PTRC1 unassigned, PTRC1 as specified, its mapping and its ExtRef input cleared; the original bound':
			{
				sourceXml: functionXml,
				copy: TO_B2,
				expectedQueries: [
					`${COPY_IN_B2}/default:LNode[@lnClass="PTRC"][@lnInst="1"][@iedName="None"][not(@ldInst)][not(@prefix)][not(@lnUuid)]`,
					`${COPY_IN_B2}/default:LNode[@lnClass="PTRC"]/default:Private/v2019C1:DOS[@name="Op"][not(@mappedLnUuid)][not(@mappedDoName)]`,
					`${COPY_IN_B2}//v2019C1:SourceRef[@input="Trip"][not(@extRefUuid)][not(@extRefAddr)]`,
					'//default:LNode[@uuid="ln1"][@iedName="P1"][@prefix="P"][@lnInst="2"][@lnUuid="p1-ptrc-uuid"]',
					'//default:LNode[@uuid="ln1"]/default:Private/v2019C1:DOS[@name="Op"][@mappedLnUuid="p1-ptrc3-uuid"]',
					'//v2019C1:SourceRef[@input="Trip"][@extRefUuid="p1-trip-input-uuid"]',
				],
			},
		// CSWI1 bound to S_IED's CSWI1, specified on S_IED's LD0
		'F1 to B2 → the copied CSWI1 unassigned, its specification IED removed, its logical device kept; the original bound':
			{
				sourceXml: functionXml,
				copy: TO_B2,
				expectedQueries: [
					`${COPY_IN_B2}/default:LNode[@lnClass="CSWI"][@iedName="None"][not(@ldInst)][not(@lnUuid)]/default:Private/v2019C1:LNodeSpecNaming[@sLdInst="LD0"][not(@sIedName)]`,
					'//default:LNode[@uuid="ln4"][@iedName="S_IED"][@lnUuid="s-cswi-uuid"]/default:Private/v2019C1:LNodeSpecNaming[@sIedName="S_IED"]',
				],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<WrittenCase>): Promise<SclTest.ActResult> {
		await expect(applyCopy({ document: source, copy: testCase.copy })).resolves.toBe('committed')
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
