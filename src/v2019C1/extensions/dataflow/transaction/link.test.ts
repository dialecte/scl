import {
	BOUND_EXT_CTRL,
	BOUND_EXT_REF,
	buildScd,
	controlRef,
	ggioWithExtRef,
	ihmiOfAccessPointWithExtRef,
	REFS,
	sourceRef,
	xcbrWithExtCtrl,
	xcbrWithExtRef,
} from '../query/__tests__/dataflow-fixture'
import { link } from './link'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { SclErrorKey } from '@/v2019C1/errors'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE

/** The receiver's LNode, assigned to no IED. */
const NOT_MAPPED_RECEIVER_LNODE =
	'iedName="None" lnClass="XCBR" lnInst="1" uuid="uuid-lnode-receiver"'

type TestCase = SclTest.BaseXmlTestCase & {
	signal?: Scl.Ref<'SourceRef' | 'ControlRef'>
	implementation?: Scl.Ref<'ExtRef' | 'ExtCtrl'>
	/** What the case does in the transaction once it has linked. */
	afterwards?: (tx: Core.Transaction<Config>) => Promise<void>
	/** The refusal expected: its key and what it says it is about. The document is then left as it is. */
	expectedError?: { key: SclErrorKey; meta: Record<string, unknown> }
}

describe('link', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'SourceRef, ExtRef in the logical node its LNode is mapped to → extRefUuid set, extRefAddr the bare intAddr':
			{
				sourceXml: buildScd({
					signals: sourceRef(),
					receiverLogicalNodes: xcbrWithExtRef('uuid="uuid-ext-ref" intAddr="Trip"'),
				}),
				expectedQueries: ['//v2019C1:SourceRef[@extRefUuid="uuid-ext-ref"][@extRefAddr="Trip"]'],
			},
		'SourceRef held in the Private of its LNode, ExtRef in the logical node its LNode is mapped to → extRefAddr the bare intAddr':
			{
				sourceXml: buildScd({
					signals: `<Private type="eIEC61850-6-100" ${id}="private-signals">${sourceRef()}</Private>`,
					receiverLogicalNodes: xcbrWithExtRef('uuid="uuid-ext-ref" intAddr="Trip"'),
				}),
				expectedQueries: ['//v2019C1:SourceRef[@extRefUuid="uuid-ext-ref"][@extRefAddr="Trip"]'],
			},
		'SourceRef, ExtRef in another logical node of the IED its LNode is mapped to → extRefAddr below the IED':
			{
				sourceXml: buildScd({
					signals: sourceRef(),
					receiverLogicalNodes:
						xcbrWithExtRef() + ggioWithExtRef('uuid="uuid-ext-ref" intAddr="Trip"'),
				}),
				expectedQueries: [
					'//v2019C1:SourceRef[@extRefUuid="uuid-ext-ref"][@extRefAddr="LD0/GGIO1.Trip"]',
				],
			},
		'SourceRef, LNode not mapped → extRefAddr the full path': {
			sourceXml: buildScd({
				receiverLNode: NOT_MAPPED_RECEIVER_LNODE,
				signals: sourceRef(),
				receiverLogicalNodes: xcbrWithExtRef('uuid="uuid-ext-ref" intAddr="Trip"'),
			}),
			expectedQueries: [
				'//v2019C1:SourceRef[@extRefUuid="uuid-ext-ref"][@extRefAddr="B1/LD0/XCBR1.Trip"]',
			],
		},
		'SourceRef already linked to the ExtRef, linked to it again → extRefAddr kept': {
			sourceXml: buildScd({
				signals: sourceRef('extRefUuid="uuid-ext-ref" extRefAddr="Trip"'),
				receiverLogicalNodes: xcbrWithExtRef('uuid="uuid-ext-ref" intAddr="Trip"'),
			}),
			expectedQueries: ['//v2019C1:SourceRef[@extRefUuid="uuid-ext-ref"][@extRefAddr="Trip"]'],
		},
		'SourceRef holding another extRefAddr than its ExtRef gives, linked to that ExtRef → extRefAddr rewritten':
			{
				sourceXml: buildScd({
					signals: sourceRef('extRefUuid="uuid-ext-ref" extRefAddr="OLD"'),
					receiverLogicalNodes: xcbrWithExtRef('uuid="uuid-ext-ref" intAddr="Trip"'),
				}),
				expectedQueries: ['//v2019C1:SourceRef[@extRefUuid="uuid-ext-ref"][@extRefAddr="Trip"]'],
				unexpectedQueries: ['//v2019C1:SourceRef[@extRefAddr="OLD"]'],
			},
		'SourceRef, ExtRef without intAddr → extRefUuid set, no extRefAddr': {
			sourceXml: buildScd({
				signals: sourceRef(),
				receiverLogicalNodes: xcbrWithExtRef('uuid="uuid-ext-ref"'),
			}),
			expectedQueries: ['//v2019C1:SourceRef[@extRefUuid="uuid-ext-ref"]'],
			unexpectedQueries: ['//v2019C1:SourceRef[@extRefAddr]'],
		},
		'SourceRef holding a stale extRefAddr, ExtRef without intAddr → extRefAddr gone': {
			sourceXml: buildScd({
				signals: sourceRef('extRefAddr="B1/LD0/XCBR1.Stale"'),
				receiverLogicalNodes: xcbrWithExtRef('uuid="uuid-ext-ref"'),
			}),
			expectedQueries: ['//v2019C1:SourceRef[@extRefUuid="uuid-ext-ref"]'],
			unexpectedQueries: ['//v2019C1:SourceRef[@extRefAddr]'],
		},
		'SourceRef, ExtCtrl → refused, nothing written': {
			sourceXml: buildScd({
				signals: sourceRef(),
				receiverLogicalNodes: xcbrWithExtCtrl(BOUND_EXT_CTRL),
			}),
			implementation: REFS.extCtrl,
			expectedError: {
				key: 'DATAFLOW_LINK_TARGET_MISMATCH',
				meta: { signal: REFS.sourceRef, implementation: REFS.extCtrl },
			},
			unexpectedQueries: ['//v2019C1:SourceRef[@extRefUuid]'],
		},
		'SourceRef linked to an ExtRef in another logical node, its logical device renamed → extRefAddr follows':
			{
				sourceXml: buildScd({
					signals: sourceRef(),
					receiverLogicalNodes:
						xcbrWithExtRef() + ggioWithExtRef('uuid="uuid-ext-ref" intAddr="Trip"'),
				}),
				afterwards: async (tx) => {
					await tx.update(REFS.ldB1, { attributes: { inst: 'LD1' } })
				},
				expectedQueries: ['//v2019C1:SourceRef[@extRefAddr="LD1/GGIO1.Trip"]'],
				unexpectedQueries: ['//v2019C1:SourceRef[@extRefAddr="LD0/GGIO1.Trip"]'],
			},
		'SourceRef, ExtRef in a logical node held by the access point, LNode mapped to the IED → extRefAddr the full path':
			{
				sourceXml: buildScd({
					signals: sourceRef(),
					receiverLogicalNodes: xcbrWithExtRef(),
					receiverAccessPointContent: ihmiOfAccessPointWithExtRef(
						'uuid="uuid-ext-ref" intAddr="Trip"',
					),
				}),
				expectedQueries: [
					'//v2019C1:SourceRef[@extRefUuid="uuid-ext-ref"][@extRefAddr="B1/IHMI1.Trip"]',
				],
			},
		'SourceRef linked to an ExtRef, the ExtRef stays as it is': {
			sourceXml: buildScd({
				signals: sourceRef(),
				receiverLogicalNodes: xcbrWithExtRef(BOUND_EXT_REF),
			}),
			expectedQueries: [
				'//v2019C1:SourceRef[@extRefUuid="uuid-ext-ref"][@extRefAddr="Trip"]',
				'//default:ExtRef[@uuid="uuid-ext-ref"][@intAddr="Trip"][@iedName="P1"][@ldInst="LD0"][@lnClass="PTRC"][@lnInst="1"][@doName="Op"][@srcLDInst="LD0"][@srcCBName="gcb1"][@serviceType="GOOSE"]',
			],
			unexpectedQueries: ['//default:ExtRef[@extRefUuid or @extRefAddr]'],
		},
		'SourceRef linked to the ExtRef of the mapped logical node, its logical device renamed → extRefAddr below the IED (the LNode own ldInst does not follow the rename yet)':
			{
				sourceXml: buildScd({
					signals: sourceRef(),
					receiverLogicalNodes: xcbrWithExtRef('uuid="uuid-ext-ref" intAddr="Trip"'),
				}),
				afterwards: async (tx) => {
					await tx.update(REFS.ldB1, { attributes: { inst: 'LD1' } })
				},
				expectedQueries: ['//v2019C1:SourceRef[@extRefAddr="LD1/XCBR1.Trip"]'],
			},
		'SourceRef linked while its LNode is not mapped, the LNode then mapped by its names → extRefAddr the bare intAddr':
			{
				sourceXml: buildScd({
					receiverLNode: NOT_MAPPED_RECEIVER_LNODE,
					signals: sourceRef(),
					receiverLogicalNodes: xcbrWithExtRef('uuid="uuid-ext-ref" intAddr="Trip"'),
				}),
				afterwards: async (tx) => {
					await tx.update(REFS.receiverLNode, { attributes: { iedName: 'B1', ldInst: 'LD0' } })
				},
				expectedQueries: ['//v2019C1:SourceRef[@extRefUuid="uuid-ext-ref"][@extRefAddr="Trip"]'],
			},
		'SourceRef linked while its LNode is not mapped, the LNode then mapped to the ExtRef logical node → extRefAddr the bare intAddr':
			{
				sourceXml: buildScd({
					receiverLNode: NOT_MAPPED_RECEIVER_LNODE,
					signals: sourceRef(),
					receiverLogicalNodes: xcbrWithExtRef('uuid="uuid-ext-ref" intAddr="Trip"'),
				}),
				afterwards: async (tx) => {
					await tx.update(REFS.receiverLNode, { attributes: { lnUuid: 'uuid-xcbr' } })
				},
				expectedQueries: ['//v2019C1:SourceRef[@extRefUuid="uuid-ext-ref"][@extRefAddr="Trip"]'],
				unexpectedQueries: ['//v2019C1:SourceRef[@extRefAddr="B1/LD0/XCBR1.Trip"]'],
			},
		'SourceRef linked while its LNode is mapped, the LNode then unmapped → extRefAddr the full path again':
			{
				sourceXml: buildScd({
					signals: sourceRef(),
					receiverLogicalNodes: xcbrWithExtRef('uuid="uuid-ext-ref" intAddr="Trip"'),
				}),
				afterwards: async (tx) => {
					await tx.update(REFS.receiverLNode, { attributes: { lnUuid: undefined } })
				},
				expectedQueries: [
					'//v2019C1:SourceRef[@extRefUuid="uuid-ext-ref"][@extRefAddr="B1/LD0/XCBR1.Trip"]',
				],
			},
		'SourceRef linked while its LNode is not mapped, the LNode then mapped to another logical node of the IED → extRefAddr below the IED':
			{
				sourceXml: buildScd({
					receiverLNode: NOT_MAPPED_RECEIVER_LNODE,
					signals: sourceRef(),
					receiverLogicalNodes:
						xcbrWithExtRef() + ggioWithExtRef('uuid="uuid-ext-ref" intAddr="Trip"'),
				}),
				afterwards: async (tx) => {
					await tx.update(REFS.receiverLNode, { attributes: { lnUuid: 'uuid-xcbr' } })
				},
				expectedQueries: [
					'//v2019C1:SourceRef[@extRefUuid="uuid-ext-ref"][@extRefAddr="LD0/GGIO1.Trip"]',
				],
			},
		'ControlRef, ExtCtrl in the logical node its LNode is mapped to → extCtrlUuid set, extCtrlAddr the bare intAddr':
			{
				sourceXml: buildScd({
					signals: controlRef(),
					receiverLogicalNodes: xcbrWithExtCtrl('uuid="uuid-ext-ctrl" intAddr="Close"'),
				}),
				signal: REFS.controlRef,
				implementation: REFS.extCtrl,
				expectedQueries: [
					'//v2019C1:ControlRef[@extCtrlUuid="uuid-ext-ctrl"][@extCtrlAddr="Close"]',
				],
			},
		'ControlRef holding a stale extCtrlAddr, ExtCtrl without intAddr → extCtrlAddr gone': {
			sourceXml: buildScd({
				signals: controlRef('extCtrlAddr="B1/LD0/XCBR1.Stale"'),
				receiverLogicalNodes: xcbrWithExtCtrl('uuid="uuid-ext-ctrl"'),
			}),
			signal: REFS.controlRef,
			implementation: REFS.extCtrl,
			expectedQueries: ['//v2019C1:ControlRef[@extCtrlUuid="uuid-ext-ctrl"]'],
			unexpectedQueries: ['//v2019C1:ControlRef[@extCtrlAddr]'],
		},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source, testCase }) => {
			const linked = source.transaction(async (tx) => {
				await link(tx, {
					signal: testCase.signal ?? REFS.sourceRef,
					implementation: testCase.implementation ?? REFS.extRef,
				})
				await testCase.afterwards?.(tx)
			})
			if (testCase.expectedError) {
				const refusal = toDialecteError(await linked.catch((error: unknown) => error))
				expect({ key: refusal?.key, meta: refusal?.meta }).toEqual(testCase.expectedError)
			} else await linked
			return { assertOn: 'source' }
		},
	})
})
