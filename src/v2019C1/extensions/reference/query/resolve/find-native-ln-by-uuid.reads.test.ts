import { findNativeLnByUuid } from './find-native-ln-by-uuid'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const ID = CUSTOM_RECORD_ID_ATTRIBUTE
const UUID = '30000000-0000-4000-8000-000000000001'

/** The store reads of the ancestor walk and the records they move, counted by the dev perf counters. */
const MANY_READ = 'core::store::getMany'
const MANY_MOVED = 'core::store::records.getMany'

// The uuid on a vendor LN, then on the LN0 of I2 and on an LN of I1: the native one first in document order is I1's.
const THREE_CARRIERS_XML = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} xmlns:vendor="urn:vendor" ${ID}="scl-1">
		<IED name="I1" ${ID}="ied-1">
			<AccessPoint name="AP1" ${ID}="ap-1">
				<Server ${ID}="srv-1">
					<Authentication ${ID}="auth-1"/>
					<LDevice inst="LD0" ${ID}="ld-1">
						<Private type="vendor" ${ID}="payload">
							<vendor:LN lnClass="XCBR" inst="1" uuid="${UUID}" ${ID}="vendor-ln"/>
						</Private>
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" ${ID}="ln0-1"/>
						<LN lnClass="XCBR" inst="1" lnType="XCBR_T" uuid="${UUID}" ${ID}="xcbr-1"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<IED name="I2" ${ID}="ied-2">
			<AccessPoint name="AP1" ${ID}="ap-2">
				<Server ${ID}="srv-2">
					<Authentication ${ID}="auth-2"/>
					<LDevice inst="LD0" ${ID}="ld-2">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="${UUID}" ${ID}="ln0-2"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>
`

const DUPLICATES = {
	reason: 'several elements carry one uuid: the case reads which of them is taken',
	violations: [{ check: 'identity' as const, code: 'duplicate-instance-uuid' }],
}

// The carriers are climbed in one ancestor walk: one read per level holding an ancestor not read yet.
describe('findNativeLnByUuid - the carriers climbed in one walk', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		uuid: string
		expected: { reads: number; moved: number; found?: { ln: string; ied: string } }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// the vendor LN, the LN of I1 and the LN0 of I2: the vendor's Private, the LDevice, Server, AccessPoint and IED
		// of each IED (I1's shared by two carriers), then the one SCL
		'the uuid on a vendor LN, an LN of I1 and the LN0 of I2 → the LN of I1, 5 reads, 10 records': {
			allowInvalidFixture: DUPLICATES,
			sourceXml: THREE_CARRIERS_XML,
			uuid: UUID,
			expected: { reads: 5, moved: 10, found: { ln: 'xcbr-1', ied: 'ied-1' } },
		},
		'a uuid nothing carries → undefined, no read': {
			allowInvalidFixture: DUPLICATES,
			sourceXml: THREE_CARRIERS_XML,
			uuid: '30000000-0000-4000-8000-000000000009',
			expected: { reads: 0, moved: 0 },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			source.perf.reset()
			const found = await findNativeLnByUuid(source.query, { uuid: testCase.uuid })
			const report = source.perf.report()
			expect({
				reads: report[MANY_READ]?.count ?? 0,
				moved: report[MANY_MOVED]?.count ?? 0,
				...(found && { found: { ln: found.ln.id, ied: found.ied.id } }),
			}).toEqual(testCase.expected)
		},
	})
})

// Inside a transaction: the LN of I1 deleted, an LN carrying the uuid created in I2 after its LN0.
describe('findNativeLnByUuid - inside a transaction', () => {
	type TestCase = SclTest.BaseXmlTestCase & { expected: { ln: string; ied: string } }

	const testCases: SclTest.TestCases<TestCase> = {
		'the LN of I1 deleted → the LN0 of I2, first in document order': {
			allowInvalidFixture: DUPLICATES,
			sourceXml: THREE_CARRIERS_XML,
			expected: { ln: 'ln0-2', ied: 'ied-2' },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const answered: { found?: { ln: string; ied: string } } = {}
			await source.transaction(async function findStaged(tx) {
				await tx.delete({ tagName: 'LN', id: 'xcbr-1' })
				await tx.addChild(
					{ tagName: 'LDevice', id: 'ld-2' },
					{
						tagName: 'LN',
						attributes: { lnClass: 'XCBR', inst: '1', lnType: 'XCBR_T', uuid: UUID },
					},
				)
				const found = await findNativeLnByUuid(tx, { uuid: UUID })
				answered.found = found && { ln: found.ln.id, ied: found.ied.id }
			})
			expect(answered.found).toEqual(testCase.expected)
		},
	})
})
