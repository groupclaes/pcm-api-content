// External dependencies
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { ConnectionPool } from 'mssql'
import { env } from 'process'
import AdmZip from 'adm-zip'
import { existsSync, unlinkSync, readFileSync } from 'node:fs'

import BucketRepository from '../repositories/bucket.repository'

export default async function(fastify: FastifyInstance): Promise<void> {
  /**
   * @route /{version}/content/buckets/{uuid}.zip
   */
  fastify.get('/:uuid', { exposeHeadRoute: true }, async function(request: FastifyRequest<{
    Params: { uuid: string }
  }>, reply: FastifyReply): Promise<any> {
    const uuid: string = request.params.uuid.toLocaleLowerCase().replace('.zip', '')
    const archive_fn = `bucket-${uuid}-${request.id}.zip`

    try {
      const pool: ConnectionPool = await fastify.getSqlPool()
      const repository = new BucketRepository(request.log, pool)

      let bucket: any = await repository.getInfo(uuid)

      if (bucket) {
        if (request.method === 'HEAD') {
          return reply
            // .header('Content-Length', document.size)
            .header('Last-Modified', new Date(bucket.changed).toUTCString())
            .header('Content-Disposition', `attachment; ${uuid}.zip`)
            .type('application/zip')
            .send()
        }

        const zip = new AdmZip()

        for (let document of bucket.documents) {
          const _fn = `${env['DATA_PATH']}/content/${document.guid.substring(0, 2)}/${document.guid}/file`
          zip.addFile(document.name, readFileSync(_fn))
        }
        const buffer: Buffer = zip.toBuffer()

        reply
          .header('Content-Length', buffer.length)
          .header('Last-Modified', new Date(bucket.changed).toUTCString())
          .header('Content-Disposition', `attachment; ${uuid}.zip`)
          .type('application/zip')
          .send(buffer)
      } else {
        return reply
          .status(404)
          .send({
            status: 'Not Found',
            statusCode: 404,
            message: 'Bucket not found'
          })
      }
    } catch (err) {
      request.log.error({ err, uuid }, 'Error while retrieving file')
      return reply.error(err?.message, 500)
    } finally {
      if (existsSync(`./${archive_fn}`))
        unlinkSync(`./${archive_fn}`)
    }
  })
}