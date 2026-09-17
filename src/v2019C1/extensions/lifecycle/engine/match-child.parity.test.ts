import { diff } from './diff'
import { reconcile } from './reconcile'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// The report (diff) and apply (reconcile) sides now share ONE matcher (`matchChild`), so a child is
// paired identically whether we describe the change or perform it. These tests pin two scenarios that
// previously diverged — reconcile lacked the cross-type templateUuid guard AND reference-identity
// matching — by asserting the report classification and the applied result agree.

const PLACEHOLDER = '123e4567-e89b-12d3-a456-789012345678'

describe('engine — diff (report) and reconcile (apply) pair children identically', () => {
	// (a) A placeholder `templateUuid` smeared across TYPES: the source Function's `uuid` coincides
	// with an instance AllocationRole's `templateUuid`. Report says "Function added"; apply must ADD a
	// distinct Function and leave the AllocationRole untouched — never merge the Function onto it.
	it('cross-type placeholder: reports added AND applies as a distinct add, role untouched', async () => {
		const sourceXml = /* xml */ `
			<SCL ${ns} ${id}="asd-src">
				<Substation name="TEMPLATE" ${id}="sub-s">
					<Private type="eIEC61850-6-100" ${id}="priv-s">
						<eIEC61850-6-100:Application name="App" uuid="app-src" ${id}="app-s">
							<Function name="Fn" uuid="${PLACEHOLDER}" ${id}="fn-s"/>
						</eIEC61850-6-100:Application>
					</Private>
				</Substation>
			</SCL>
		`
		const targetXml = /* xml */ `
			<SCL ${ns} ${id}="scd">
				<Substation name="S1" ${id}="sub-t">
					<Private type="eIEC61850-6-100" ${id}="priv-t">
						<eIEC61850-6-100:Application name="App" uuid="app-inst" templateUuid="app-src" ${id}="app-i">
							<eIEC61850-6-100:AllocationRole name="PIU" uuid="PIU_AR" templateUuid="${PLACEHOLDER}" ${id}="ar-i"/>
						</eIEC61850-6-100:Application>
					</Private>
				</Substation>
			</SCL>
		`

		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')

		const applicationSourceRef = { tagName: 'Application', id: 'app-s' } as Scl.Ref<'Application'>
		const applicationInstanceRef = { tagName: 'Application', id: 'app-i' } as Scl.Ref<'Application'>

		// report
		const report = await diff({
			sourceQuery: source.document.query,
			targetQuery: target.document.query,
			sourceRootRef: applicationSourceRef,
			instanceRootRef: applicationInstanceRef,
		})
		const fnGroup = report.groups.find((group) => group.primary.tagName === 'Function')
		expect(fnGroup?.change, 'report: Function is a genuine add').toBe('added')

		// apply
		await target.document.transaction(async (tx) => {
			await reconcile(tx, {
				sourceQuery: source.document.query,
				sourceRootRef: applicationSourceRef,
				instanceRootRef: applicationInstanceRef,
			})
		})

		const addedFunctions = await target.document.query.any.findByAttributes({
			tagName: 'Function',
			attributes: { templateUuid: PLACEHOLDER },
		})
		expect(addedFunctions, 'apply: exactly one Function added by lineage').toHaveLength(1)

		const roleName = await target.document.query.any.getAttribute(
			{ tagName: 'AllocationRole', id: 'ar-i' },
			{ name: 'name' },
		)
		expect(roleName, 'apply: the AllocationRole is untouched, not merged into').toBe('PIU')
	})

	// (b) The source AllocationRole REPLACED its link: it references `fn-new`, the instance still
	// references a different `fn-existing`. By reference identity the source ref is a genuine ADD and
	// the instance ref a genuine REMOVE — the report says exactly that, and apply must perform it by
	// ADDING a new ref + REMOVING the old element, NOT overwriting the old ref in place by tag position
	// (the pre-shared-matcher reconcile behavior, which mutated the wrong element's provenance).
	it('reference child replaced: reports add + remove AND applies as add + remove, not in-place overwrite', async () => {
		const sourceXml = /* xml */ `
			<SCL ${ns} ${id}="asd-src">
				<Substation name="TEMPLATE" ${id}="sub-s">
					<Private type="eIEC61850-6-100">
						<eIEC61850-6-100:AllocationRole name="PIU" uuid="ar-src" ${id}="ar-s">
							<eIEC61850-6-100:FunctionRef function="New_Fn" functionUuid="fn-new" ${id}="fref-s"/>
						</eIEC61850-6-100:AllocationRole>
					</Private>
				</Substation>
			</SCL>
		`
		const targetXml = /* xml */ `
			<SCL ${ns} ${id}="asd-tgt">
				<Substation name="S1" ${id}="sub-t">
					<Private type="eIEC61850-6-100">
						<eIEC61850-6-100:AllocationRole name="PIU" uuid="ar-i" templateUuid="ar-src" ${id}="ar-i">
							<eIEC61850-6-100:FunctionRef function="Existing_Fn" functionUuid="fn-existing" ${id}="fref-i"/>
						</eIEC61850-6-100:AllocationRole>
					</Private>
				</Substation>
			</SCL>
		`

		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')

		const roleSourceRef = { tagName: 'AllocationRole', id: 'ar-s' } as Scl.Ref<'AllocationRole'>
		const roleInstanceRef = { tagName: 'AllocationRole', id: 'ar-i' } as Scl.Ref<'AllocationRole'>

		// report
		const report = await diff({
			sourceQuery: source.document.query,
			targetQuery: target.document.query,
			sourceRootRef: roleSourceRef,
			instanceRootRef: roleInstanceRef,
		})
		const addedRefs = report.groups.filter(
			(group) => group.change === 'added' && group.primary.tagName === 'FunctionRef',
		)
		expect(addedRefs, 'report: the new FunctionRef is a genuine add').toHaveLength(1)
		const removedRefs = report.groups.filter(
			(group) => group.change === 'removed' && group.primary.tagName === 'FunctionRef',
		)
		expect(removedRefs, 'report: the dropped FunctionRef is a genuine remove').toHaveLength(1)

		// apply
		await target.document.transaction(async (tx) => {
			await reconcile(tx, {
				sourceQuery: source.document.query,
				sourceRootRef: roleSourceRef,
				instanceRootRef: roleInstanceRef,
			})
		})

		const roleTree = await target.document.query.any.getTree({
			tagName: 'AllocationRole',
			id: 'ar-i',
		})
		const refs = roleTree ? roleTree.tree.filter((child) => child.tagName === 'FunctionRef') : []
		expect(refs, 'apply: exactly one FunctionRef — the source link').toHaveLength(1)
		const functionUuid = refs[0]
			? await target.document.query.any.getAttribute(refs[0], { name: 'functionUuid' })
			: undefined
		expect(functionUuid, 'apply: it points at the source target').toBe('fn-new')

		// The dropped link was REMOVED as its own element, not overwritten in place by tag position.
		const overwritten = await target.document.query.any.getRecord({
			tagName: 'FunctionRef',
			id: 'fref-i',
		})
		expect(overwritten, 'apply: the old FunctionRef element is removed, not mutated').toBeFalsy()
	})
})
