import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { ConnectionPool } from 'mssql'
import Document from '../repositories/document.repository'
import { existsSync, readFileSync } from 'node:fs'
import AdmZip from 'adm-zip'
import { env } from 'process'

export default async function(fastify: FastifyInstance): Promise<void> {
  fastify.post('', async (request: FastifyRequest<{
    Body: TDownloadRequestBody
    // Querystring: {
    //   culture: string
    // }
  }>, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const pool: ConnectionPool = await fastify.getSqlPool()
      const repository = new Document(request.log, pool)
      const zip = new AdmZip()

      for (let guid of Object.keys(request.body)) {
        const uuid: string = guid.toLowerCase()
        const _fn = `${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/file`

        let document: any = await repository.findOne({
          guid: uuid
        })

        if (document && existsSync(_fn)) {
          const data: Buffer = readFileSync(_fn)
          for (const object_id of request.body[guid]) {
            let fn: string = document.name
            if (!fn.startsWith(object_id))
              fn = object_id + '_' + fn
            zip.addFile(fn, data)
          }
        }
      }

      const buffer: Buffer = zip.toBuffer()

      return reply
        .header('Content-Length', buffer.length)
        .header('Last-Modified', new Date().toUTCString())
        .header('Content-Disposition', `attachment; documents.zip`)
        .type('application/zip')
        .send(buffer)
    } catch (err) {
      request.log.error({ err }, 'Error while retrieving file')
      return reply.error(err?.message, 500)
    }
  })
}

export type TDownloadRequestBody = { [key: string]: string[] }
