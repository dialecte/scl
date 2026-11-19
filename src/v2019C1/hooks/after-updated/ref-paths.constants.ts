import { PATH_CONTRIBUTING_ATTRIBUTES } from '@/v2019C1/extensions/reference'

/**
 * What the referrers of an element read of it: the `uuid` they name it by (`followAncestry` looks them up by it) and
 * the attributes of a path segment (`PATH_CONTRIBUTING_ATTRIBUTES`). An update changing none of them leaves every
 * referrer's path as it was.
 */
export const REFERRER_READ_ATTRIBUTES: readonly string[] = ['uuid', ...PATH_CONTRIBUTING_ATTRIBUTES]
