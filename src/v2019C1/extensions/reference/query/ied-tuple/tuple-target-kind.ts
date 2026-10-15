import type { TupleTargetKind } from './ied-tuple.types'
import type { TupleRoles } from '@/v2019C1/constants/reference-pairs.types'

/**
 * What a tuple reference points at, from the parts its names name: a control block when it names
 * one, else an access point, else a logical node when it names a class, else a logical device.
 */
export function tupleTargetKind(roles: TupleRoles): TupleTargetKind {
	if (roles.controlBlock) return 'cb'
	if (roles.accessPoint) return 'ap'
	if (roles.lnClass) return 'ln'
	return 'ld'
}
