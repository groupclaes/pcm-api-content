import sql, { ConnectionPool, IProcedureResult } from 'mssql'
import { FastifyBaseLogger } from 'fastify'

export default class Document {
  schema: string = '[document].'
  _logger: FastifyBaseLogger
  _pool: ConnectionPool

  constructor(logger: FastifyBaseLogger, pool: ConnectionPool) {
    this._logger = logger
    this._pool = pool
  }

  async findOne(filters: any): Promise<any> {
    const r = new sql.Request(this._pool)
    r.input('id', sql.Int, filters.id)
    r.input('guid', sql.UniqueIdentifier, filters.guid)
    r.input('company', sql.Char, filters.company)
    r.input('company_oe', sql.Char, filters.companyOe)
    r.input('object_type', sql.VarChar, filters.objectType)
    r.input('document_type', sql.VarChar, filters.documentType)
    r.input('object_id', sql.BigInt, filters.objectId)
    r.input('culture', sql.VarChar, filters.culture)
    r.input('size', sql.VarChar, filters.size)

    this._logger.debug({ sqlParam: { filters }, sqlSchema: this.schema, sqlProc: 'usp_findOne' }, 'running procedure')

    let result: IProcedureResult<any> = await r.execute(`${this.schema}usp_findOne`)
    this._logger.debug({ result }, 'procedure result')

    if (result.recordset && result.recordset.length === 1) {
      return result.recordset[0]
    } else if (result.recordset && result.recordset.length > 1) {
      this._logger.error('Wrong number of records, return first result')
      return result.recordset[0]
    }
    return undefined
  }
}