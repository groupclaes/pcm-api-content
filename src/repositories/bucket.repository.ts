import { FastifyBaseLogger } from 'fastify'
import sql, { ConnectionPool, IProcedureResult } from 'mssql'

export default class BucketRepository {
  schema: string = 'bucket.'
  _logger: FastifyBaseLogger
  _pool: ConnectionPool

  constructor(logger: FastifyBaseLogger, pool: ConnectionPool) {
    this._logger = logger
    this._pool = pool
  }


  async getInfo(uuid: string): Promise<any> {
    const r = new sql.Request(this._pool)
    r.input('uuid', sql.VarChar, uuid)
    this._logger.debug({
      sqlParam: { uuid },
      sqlSchema: this.schema,
      sqlProc: 'usp_getBucketInfo'
    }, 'running procedure')

    const result: IProcedureResult<any> = await r.execute(this.schema + 'usp_getBucketInfo')
    this._logger.debug({ result }, 'procedure result')

    if (result.recordset.length > 0)
      return result.recordset[0][0]
    return undefined
  }
}