import { ref } from './copy-helpers'
import { COPY } from './copy-helpers.constants'
import functionXml from './fixtures/a-function-to-copy.xml?raw'
import applicationsXml from './fixtures/applications-to-copy.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	openSclDocument,
	runSclTestCases,
} from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { LifecycleReportParams } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

// a-function-to-copy.xml: S1/VL1/B1 holds F1 (its SF1, sf1), IED P1; applications-to-copy.xml: A1 composing F1 and F2 in
// B1.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** A document holding a FunctionTemplate, as an FSD does. */
const functionTemplateXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Substation name="S1" ${id}="s1">
			<VoltageLevel name="VL1" ${id}="vl1">
				<Bay name="B1" ${id}="b1"/>
			</VoltageLevel>
		</Substation>
		<Private type="eIEC61850-6-100" ${id}="project-private">
			<eIEC61850-6-100:FunctionTemplate name="FT" uuid="ft" ${id}="ft">
				<eIEC61850-6-100:LNode iedName="None" lnClass="PTRC" lnInst="1" uuid="ft-ln" ${id}="ft-ln"/>
			</eIEC61850-6-100:FunctionTemplate>
		</Private>
	</SCL>
`

/** A refusal as the cases compare it: its key and its meta. */
type Refused = { key: string; meta: unknown }

type RefusedCase = SclTest.BaseXmlTestCase & {
	/** The copy, given the query of the document it is pasted into and of the one it is read from. */
	target: (queries: {
		query: Core.Query<Config>
		other: Core.Query<Config>
	}) => LifecycleReportParams
	expected: Refused
}

const NOT_A_COPY = { key: 'OPTION_NOT_AVAILABLE', meta: { option: 'scenario', value: 'copy' } }

// What a copy cannot do yet is refused at its entry, by the report and by the apply alike, before anything is read or
// written: another document, another verb than fsd and asd, a root other than a Function or an Application, an
// application merged onto the functions it composes.
describe('copy - refused at its entry', () => {
	const testCases: SclTest.TestCases<RefusedCase> = {
		// the same file imported a second time is another document
		'F1 copied from another document → OPTION_NOT_AVAILABLE, a copy reads the document it is pasted into':
			{
				sourceXml: functionXml,
				target: ({ other }) =>
					copyOf({
						verb: 'fsd',
						sourceQuery: other,
						ref: ref('Function', 'f1'),
						anchor: ref('Bay', 'b2'),
					}),
				expected: NOT_A_COPY,
			},
		// an untyped caller: the type refuses a copy on ssd
		'B1 copied with the ssd verb → OPTION_NOT_AVAILABLE': {
			sourceXml: functionXml,
			target: ({ query }) =>
				copyOf({
					verb: 'ssd',
					sourceQuery: query,
					ref: ref('Bay', 'b1'),
					anchor: ref('VoltageLevel', 'vl1'),
				}),
			expected: NOT_A_COPY,
		},
		// an untyped caller: the type refuses a copy on ied
		'P1 copied with the ied verb → OPTION_NOT_AVAILABLE': {
			sourceXml: functionXml,
			target: ({ query }) =>
				copyOf({
					verb: 'ied',
					sourceQuery: query,
					ref: ref('IED', 'p1'),
					anchor: ref('SCL', 'project'),
				}),
			expected: NOT_A_COPY,
		},
		// SF1 is F1's subfunction
		'SF1 copied as the root → OPTION_NOT_AVAILABLE, a SubFunction is no copy root': {
			sourceXml: functionXml,
			target: ({ query }) =>
				copyOf({
					verb: 'fsd',
					sourceQuery: query,
					ref: ref('SubFunction', 'sf1'),
					anchor: ref('Bay', 'b2'),
				}),
			expected: { key: 'OPTION_NOT_AVAILABLE', meta: { option: 'ref', value: 'SubFunction' } },
		},
		'a FunctionTemplate copied → OPTION_NOT_AVAILABLE, a FunctionTemplate is no copy root': {
			sourceXml: functionTemplateXml,
			target: ({ query }) =>
				copyOf({
					verb: 'fsd',
					sourceQuery: query,
					ref: ref('FunctionTemplate', 'ft'),
					anchor: ref('Bay', 'b1'),
				}),
			expected: { key: 'OPTION_NOT_AVAILABLE', meta: { option: 'ref', value: 'FunctionTemplate' } },
		},
		// A1 composes F1 and F2 in B1
		'A1 copied merging its functions onto those it composes → OPTION_NOT_AVAILABLE': {
			sourceXml: applicationsXml,
			target: ({ query }) => ({
				...copyOf({
					verb: 'asd',
					sourceQuery: query,
					ref: ref('Application', 'a1'),
					anchor: ref('Bay', 'b2'),
				}),
				resolution: { sharedFunctions: 'merge' },
			}),
			expected: {
				key: 'OPTION_NOT_AVAILABLE',
				meta: { option: 'sharedFunctions', value: 'merge' },
			},
		},
	}

	async function act({ testCase, source, project }: SclTest.ActParams<RefusedCase>): Promise<void> {
		const other = await openSclDocument({ project, xml: functionXml, label: 'another-document' })
		const target = testCase.target({ query: source.query, other: other.query })
		const reported = source.query.lifecycle.report(target).then(() => 'reported', refusedWith)
		const applied = source
			.transaction(async function applyTheCopy(tx) {
				await tx.lifecycle.apply({ ...target, report: AN_EMPTY_REPORT })
			})
			.then(() => 'applied', refusedWith)
		await expect(Promise.all([reported, applied])).resolves.toEqual([
			testCase.expected,
			testCase.expected,
		])
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** A report with nothing in it: the refusal at the apply's entry comes before the report is read. */
const AN_EMPTY_REPORT: DiffReport = {
	instances: [],
	needsDecisions: false,
	summary: { added: 0, removed: 0, modified: 0, moved: 0, kept: 0 },
	mappings: [],
	templateInstances: [],
}

/** The copy of a target, typed loosely: a caller that does not type-check may ask for any verb. */
function copyOf(params: {
	verb: string
	sourceQuery: Core.Query<Config>
	ref: Scl.Ref<Scl.ElementsOf>
	anchor: Scl.Ref<Scl.ElementsOf>
}): LifecycleReportParams {
	return { ...params, scenario: COPY } as unknown as LifecycleReportParams
}

/** The key and the meta of the refusal an error is. */
function refusedWith(error: unknown): Refused {
	const refusal = toDialecteError(error)
	return { key: refusal?.key ?? String(error), meta: refusal?.meta }
}
