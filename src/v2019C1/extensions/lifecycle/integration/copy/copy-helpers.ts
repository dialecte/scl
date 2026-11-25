import { COPY } from './copy-helpers.constants'

import { toDialecteError } from '@dialecte/core'

import type { CopyCase, CopyParams } from './copy-helpers.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { CommitRefusal } from '@/v2019C1/hooks/before-commit/commit-plan.types'
import type * as Core from '@dialecte/core'

/** The lifecycle target of a copy inside the document `sourceQuery` reads. */
export function copyTarget(params: {
	sourceQuery: Core.Query<Config>
	copy: CopyCase
}): LifecycleTarget {
	const { sourceQuery, copy } = params
	return { ...copy, sourceQuery, scenario: COPY }
}

/** The report of a copy, read in the document it is pasted into. */
export async function reportCopy(params: Omit<CopyParams, 'decide'>): Promise<DiffReport> {
	const { document, copy, resolution } = params
	return document.query.lifecycle.report({
		...copyTarget({ sourceQuery: document.query, copy }),
		...(resolution ? { resolution } : {}),
	})
}

/** Report a copy, then apply that report and commit: `committed`, or the key of the error that refused it. */
export async function applyCopy(params: CopyParams): Promise<string> {
	const { document, copy, resolution, decide } = params
	return reportCopy({ document, copy, resolution })
		.then(async function thenApply(report) {
			const decisions = decide?.(report)
			await document.transaction(async function applyTheCopy(tx) {
				await tx.lifecycle.apply({
					...copyTarget({ sourceQuery: document.query, copy }),
					report,
					...(resolution || decisions ? { resolution: { ...resolution, decisions } } : {}),
				})
			})
			return 'committed'
		})
		.catch(keyOf)
}

/** The key of a refusal, or the error itself when it is no refusal of dialecte. */
export function keyOf(error: unknown): string {
	return toDialecteError(error)?.key ?? String(error)
}

/** A refusal of the commit as the cases compare them: its reason, the reference by tag, and its uuid attribute. */
export function describeRefusals(refusals: readonly CommitRefusal[]): string[] {
	return refusals
		.map(function describeRefusal(refusal) {
			if (refusal.key !== 'REFERENCE_INCOHERENT') return `${refusal.key}`
			const { reason, reference, uuidAttribute } = refusal.meta
			return `${refusal.code} ${reason} ${reference.tagName} ${uuidAttribute}`
		})
		.sort()
}

/** A ref of the case's fixture, by its record id. */
export function ref<GenericTag extends Scl.ElementsOf>(
	tagName: GenericTag,
	id: string,
): Scl.Ref<GenericTag> {
	return { tagName, id } as Scl.Ref<GenericTag>
}
