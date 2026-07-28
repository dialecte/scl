import { diff } from './diff'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// A `FunctionRef` is a uuid-less REFERENCE: its identity is the `functionUuid` it points to,
// NOT its position among sibling `FunctionRef`s. When an (updated) template `AllocationRole`
// adds a `FunctionRef` to a target the instance does not yet reference, it must be reported
// as `added` — not silently paired with the instance's first `FunctionRef` by tag position
// (which mis-classifies the genuine addition as `unchanged`).
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd-src">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100">
				<eIEC61850-6-100:AllocationRole name="PIU" uuid="ar-src" ${id}="ar-s">
					<eIEC61850-6-100:FunctionRef function="Current Transformer_Fn" functionUuid="fn-new" ${id}="fref-s"/>
				</eIEC61850-6-100:AllocationRole>
			</Private>
		</Substation>
	</SCL>`

// The instance `AllocationRole` matches the template (templateUuid) but already carries a
// DIFFERENT author-referenced `FunctionRef` (functionUuid="fn-existing").
const targetXml = /* xml */ `
	<SCL ${ns} ${id}="asd-tgt">
		<Substation name="S1" ${id}="sub-t">
			<Private type="eIEC61850-6-100">
				<eIEC61850-6-100:AllocationRole name="PIU" uuid="ar-i" templateUuid="ar-src" ${id}="ar-i">
					<eIEC61850-6-100:FunctionRef function="CB Interface" functionUuid="fn-existing" ${id}="fref-i"/>
				</eIEC61850-6-100:AllocationRole>
			</Private>
		</Substation>
	</SCL>`

describe('engine.diff — reference children match by reference identity, not tag position', () => {
	it('reports a template FunctionRef to an unreferenced target as added, not unchanged', async () => {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')

		const report = await diff({
			sourceQuery: source.document.query,
			targetQuery: target.document.query,
			sourceRootRef: { tagName: 'AllocationRole', id: 'ar-s' } as Scl.Ref<'AllocationRole'>,
			instanceRootRef: { tagName: 'AllocationRole', id: 'ar-i' } as Scl.Ref<'AllocationRole'>,
		})

		const addedRefs = report.groups.filter(
			(group) => group.change === 'added' && group.primary.tagName === 'FunctionRef',
		)
		expect(addedRefs).toHaveLength(1)
		expect(addedRefs[0]?.primary.sourceRef?.id).toBe('fref-s')
	})

	// Re-updating a just-instantiated ASD whose template elements themselves carry a
	// `templateUuid` (an EXTRACTED template with its own lineage): the source ref's target uuid
	// is already template space and must NOT be normalized again, otherwise it resolves to the
	// template's OWN ancestor while the instance resolves to the template — a false mismatch that
	// wrongly reports the reference as removed.
	it('matches a reference whose (extracted) source target carries its own templateUuid', async () => {
		const extractedSourceXml = /* xml */ `
			<SCL ${ns} ${id}="asd-src2">
				<Substation name="TEMPLATE" ${id}="sub-s2">
					<Private type="eIEC61850-6-100">
						<eIEC61850-6-100:AllocationRole name="PIU" uuid="ar-src2" ${id}="ar-s2">
							<eIEC61850-6-100:FunctionRef function="Prot" functionUuid="fn-src2" ${id}="fref-s2"/>
						</eIEC61850-6-100:AllocationRole>
					</Private>
					<VoltageLevel name="TEMPLATE" ${id}="vl-s2">
						<Bay name="TEMPLATE" ${id}="bay-s2">
							<Function name="Prot" uuid="fn-src2" templateUuid="fn-origin" ${id}="fn-s2"/>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>`

		const instanceXml = /* xml */ `
			<SCL ${ns} ${id}="asd-tgt2">
				<Substation name="S1" ${id}="sub-t2">
					<Private type="eIEC61850-6-100">
						<eIEC61850-6-100:AllocationRole name="PIU" uuid="ar-inst2" templateUuid="ar-src2" ${id}="ar-i2">
							<eIEC61850-6-100:FunctionRef function="Prot" functionUuid="fn-inst2" ${id}="fref-i2"/>
						</eIEC61850-6-100:AllocationRole>
					</Private>
					<VoltageLevel name="V1" ${id}="vl-t2">
						<Bay name="B1" ${id}="bay-t2">
							<Function name="Prot" uuid="fn-inst2" templateUuid="fn-src2" ${id}="fn-i2"/>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>`

		const { source, target } = await createSclTestProject({
			sourceXml: extractedSourceXml,
			targetXml: instanceXml,
		})
		if (!target) throw new Error('target required')

		const report = await diff({
			sourceQuery: source.document.query,
			targetQuery: target.document.query,
			sourceRootRef: { tagName: 'AllocationRole', id: 'ar-s2' } as Scl.Ref<'AllocationRole'>,
			instanceRootRef: { tagName: 'AllocationRole', id: 'ar-i2' } as Scl.Ref<'AllocationRole'>,
		})

		const refChanges = report.groups.filter((group) => group.primary.tagName === 'FunctionRef')
		expect(refChanges).toHaveLength(0)
	})
})
