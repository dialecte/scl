import type { IedElement } from './ied-process.types'

/** The uuids of the IED's elements the IED part writes: those neither left out nor below an element left out. */
export function writtenIedUuids(params: {
	elements: readonly IedElement[]
	iedLeaveOut: ReadonlySet<string>
}): ReadonlySet<string> {
	const { elements, iedLeaveOut } = params
	const byId = new Map(
		elements.map(function byItsId(element) {
			return [element.id, element] as const
		}),
	)
	return new Set(
		elements
			.filter(function isWritten(element) {
				return element.uuid !== '' && !isLeftOut({ element, byId, iedLeaveOut })
			})
			.map(function uuidOf(element) {
				return element.uuid
			}),
	)
}

/** Whether the element or one above it is left out, climbing the parents read. */
function isLeftOut(params: {
	element: IedElement
	byId: ReadonlyMap<string, IedElement>
	iedLeaveOut: ReadonlySet<string>
}): boolean {
	const { byId, iedLeaveOut } = params
	let current: IedElement | undefined = params.element
	while (current) {
		if (iedLeaveOut.has(current.id)) return true
		current = current.parent === undefined ? undefined : byId.get(current.parent)
	}
	return false
}
