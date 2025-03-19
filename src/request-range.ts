import { FastifyRequest } from 'fastify'

// @ts-ignore
import RangeParser, { Ranges } from 'range-parser'

export default function parseRangeHeader(request: FastifyRequest, size: number, rangeParserOptions?: any): {
  unit: string,
  ranges: Ranges
} | number {
  const range = request.headers.range
  if (!range)
    return

  const res = RangeParser(size, range, rangeParserOptions)
  if (typeof (res) === 'number' && res < 0)
    return res

  const parsedResult = res as Ranges

  return { unit: parsedResult.type, ranges: parsedResult }
}
