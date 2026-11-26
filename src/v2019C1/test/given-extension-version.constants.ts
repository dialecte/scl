import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'

/** The eIEC61850-6-100 namespace: its uri and the prefix a refusal names it by. */
export const EXTENSION = SCL_DIALECTE_CONFIG.namespaces.v2019C1

/** The start tag of a document's `SCL` root, as its XML writes it. */
export const ROOT_START_TAG = /<SCL\b[^>]*>/

/** Each attribute of a start tag, its value in double or single quotes: its qualified name, the quote, then its value. */
export const START_TAG_ATTRIBUTE = /\s([^\s=]+)\s*=\s*(["'])(.*?)\2/g
