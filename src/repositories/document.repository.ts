import sql from 'mssql'
import db from '../db'
import { FastifyBaseLogger } from 'fastify'

const DB_NAME = 'PCM'

export default class Document {
  schema: string = '[document].'
  _logger: FastifyBaseLogger

  constructor(logger: FastifyBaseLogger) { this._logger = logger }

  async findOne(filters) {
    const r = new sql.Request(await db.get(DB_NAME))

    r.input('id', sql.Int, filters.id)
    r.input('guid', sql.UniqueIdentifier, filters.guid)
    r.input('company', sql.Char, filters.company)
    r.input('company_oe', sql.Char, filters.companyOe)
    r.input('object_type', sql.VarChar, filters.objectType)
    r.input('document_type', sql.VarChar, filters.documentType)
    r.input('object_id', sql.BigInt, filters.objectId)
    r.input('culture', sql.VarChar, filters.culture)

    this._logger.debug({ sqlParam: { filters }, sqlDb: DB_NAME, sqlSchema: this.schema, sqlProc: 'usp_findOne' }, 'running procedure')

    let result = await r.execute(`${this.schema}usp_findOne`)
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