import { deep } from './deep'

import { describe } from 'vitest'

import { applyUuidRemap } from '@/v2019C1/extensions/reference/transaction'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

/**
 * Characterization of uuid-reference remapping through the PUBLIC clone boundary
 * (`transplant.deep`), asserting only end-state (not the mechanism). These pin the
 * behavior that must survive relocating the remap out of core's `afterDeepClone`
 * hook into an scl-owned pass: a ref pointing INSIDE the clone is repointed to the
 * clone's fresh identity; a ref pointing OUTSIDE the clone keeps its source uuid.
 */

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const emptySubstationTarget = /* xml */ `
	<SCL ${ns} ${id}="scl-t">
		<Substation name="Sub1" ${id}="sub-t"/>
	</SCL>`

type TestCase = SclTest.BaseXmlTestCase & {
	ref: { tagName: string; id: string }
	targetParent: { tagName: string; id: string }
}

describe('import.deep — uuid reference remapping', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'internal uuid ref → repointed to the clone (source uuid gone)': {
			sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<Substation name="Sub1" ${id}="sub-1">
					<Function name="F1" ${id}="fn-1" uuid="uuid-f1">
						<Private type="eIEC61850-6-100" ${id}="priv-1">
							<eIEC61850-6-100:FunctionRef ${id}="fref-1" function="Sub1/F1" functionUuid="uuid-f1"/>
						</Private>
					</Function>
				</Substation>
			</SCL>`,
			targetXml: emptySubstationTarget,
			ref: { tagName: 'Function', id: 'fn-1' },
			targetParent: { tagName: 'Substation', id: 'sub-t' },
			expectedQueries: [
				'//default:Substation/default:Function[@name="F1"]/default:Private/v2019C1:FunctionRef',
			],
			// the cloned ref must NOT keep the source uuid — it was repointed to the clone
			unexpectedQueries: ['//v2019C1:FunctionRef[@functionUuid="uuid-f1"]'],
		},

		'external uuid ref → preserved (target not part of the clone)': {
			sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<Substation name="Sub1" ${id}="sub-1">
					<Function name="F1" ${id}="fn-1" uuid="uuid-f1"/>
					<Function name="F2" ${id}="fn-2" uuid="uuid-f2">
						<Private type="eIEC61850-6-100" ${id}="priv-2">
							<eIEC61850-6-100:FunctionRef ${id}="fref-2" function="Sub1/F1" functionUuid="uuid-f1"/>
						</Private>
					</Function>
				</Substation>
			</SCL>`,
			targetXml: emptySubstationTarget,
			// clone ONLY F2 — F1 (the ref target) stays in the source, uncloned
			ref: { tagName: 'Function', id: 'fn-2' },
			targetParent: { tagName: 'Substation', id: 'sub-t' },
			expectedQueries: [
				'//default:Substation/default:Function[@name="F2"]/default:Private/v2019C1:FunctionRef[@functionUuid="uuid-f1"]',
			],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			const { recordMappings } = await deep(tx, {
				sourceQuery: source.query,
				ref: testCase.ref as Scl.Ref<Scl.ElementsOf>,
				targetParent: testCase.targetParent as Scl.Ref<Scl.ElementsOf>,
				withTypes: false,
			})
			// caller owns uuid rewiring (deep is a faithful subtree copy)
			await applyUuidRemap(tx, { mappings: recordMappings })
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
