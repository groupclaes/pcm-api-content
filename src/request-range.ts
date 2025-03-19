import { FastifyRequest } from 'fastify'

// @ts-ignore
import RangeParser, { Ranges } from 'range-parser'

export default function parseRangeHeader(request: FastifyRequest, size: number, rangeParserOptions?: any): { unit: string, ranges: Ranges } | undefined {
  const range = request.headers.range
  if (!range)
    return

  const throwOnInvalid = false // options?.throwOnInvalid

  const res = RangeParser(size, range, rangeParserOptions)
  if (typeof (res) === 'number' && res < 0) {
    if (throwOnInvalid && res === -2) {
      throw new Error('Malformed header string')
    } else if (throwOnInvalid && res === -1) {
      throw new Error('Unsatisfiable range')
    }

    return undefined
  }

  const parsedResult = res as Ranges

  return { unit: parsedResult.type, ranges: parsedResult }
}
