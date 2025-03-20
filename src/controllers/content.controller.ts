// External dependencies
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { env } from 'process'
import * as fs from 'fs'

import Document from '../repositories/document.repository'
import { createReadStream, ReadStream } from 'node:fs'
import { ConnectionPool } from 'mssql'

export default async function(fastify: FastifyInstance): Promise<void> {
  async function getByParams(request: FastifyRequest<{
    Params: {
      company: string
      objectType: string
      documentType: string
      objectId?: number
      culture?: string
    },
    Querystring: {
      size: 'any' | 'small' | 'medium' | 'large'
      show?: any
      retry?: any
      thumb?: any
    }
    Headers: {
      accept?: string
    }
  }>, reply: FastifyReply): Promise<FastifyReply> {
    let contentMode: string = 'attachment'
    // fix CSP
    reply.header('Content-Security-Policy', `default-src 'self' 'unsafe-inline' pcm.groupclaes.be`)
    if ('show' in request.query)
      contentMode = 'inline'

    let retry: boolean = 'retry' in request.query
    let thumbnail: boolean = 'thumb' in request.query

    try {
      const pool: ConnectionPool = await fastify.getSqlPool()
      const repository = new Document(request.log, pool)
      // const token = request.token || { sub: null }

      let company: string = request.params['company'].toLowerCase()
      let objectType: string = request.params['objectType'].toLowerCase()
      let documentType: string = request.params['documentType'].toLowerCase()
      let objectId: number = request.params.objectId ?? 100
      let culture: string = request.params.culture?.toLowerCase() ?? 'nl'

      let document: any = await repository.findOne({
        company,
        objectType,
        documentType,
        objectId,
        culture,
        size: request.query.size ?? 'any'
      })

      if (document) {
        const _guid: string = document.guid.toLowerCase()
        const _fn = `${env['DATA_PATH']}/content/${_guid.substring(0, 2)}/${_guid}/file`

        if (fs.existsSync(_fn)) {
          if (thumbnail && documentType === 'foto')
            return reply.redirect(`https://pcm.groupclaes.be/${env.APP_VERSION}/i/${_guid}?s=thumb`, 307)
          if (document.mimeType.startsWith('image/'))
            return reply.redirect(`https://pcm.groupclaes.be/${env.APP_VERSION}/i/${_guid}`, 307)
          const lastMod: Date = fs.statSync(_fn).mtime

          const document_name_encoded: string = encodeURI(document.name)
          let filename: string = `filename="${document.name}"; filename*=UTF-8''${document_name_encoded}`

          if (contentMode === 'inline') {
            filename = `filename="${document.documentType}_${document.itemNum}.${document.extension}"`
          }

          const stream: ReadStream = createReadStream(_fn)
          return reply
            .header('Cache-Control', `must-revalidate, max-age=${document.maxAge}, private`)
            .header('document-guid', _guid)
            .header('Expires', new Date(lastMod.getTime() + (document.maxAge * 1000)).toUTCString())
            .header('Last-Modified', lastMod.toUTCString())
            .header('Content-Disposition', `${contentMode}; ${filename}`)
            .type(document.mimeType)
            .send(stream)
        }
        return reply
          .code(404)
          .send({
            status: 'Not Found',
            statusCode: 404,
            message: `File '${_guid}' not found`
          })
      } else {
        if (retry) {
          let _fn_404: string = './assets/404.png'
          // If browser supports svg use vector image to save bandwidth and improve clarity.
          if (request.headers.accept && request.headers.accept.indexOf('image/svg+xml') > -1) {
            _fn_404 = './assets/404.svg'
            reply.type('image/svg+xml')
          } else
            reply.type('image/png')
          // If culture is supported use culture specific image.
          if (['nl', 'fr'].includes(culture))
            _fn_404 = _fn_404.replace('/404', '/404_' + culture)
          return reply
            .send(createReadStream(_fn_404))
        }
        return reply
          .status(404)
          .send({
            status: 'Not Found',
            statusCode: 404,
            message: 'Document not found'
          })
      }
    } catch (err) {
      return reply
        .status(500)
        .send(err)
    }
  }

  /**
   * @route /{version}/content/{company}/{objectType}/{documentType}/{objectId?}/{culture?}
   * @param {FastifyRequest} request
   * @param {FastifyReply} reply
   */
  fastify.get('/:company/:objectType/:documentType', { exposeHeadRoute: true }, getByParams)
  fastify.get('/:company/:objectType/:documentType/:objectId', { exposeHeadRoute: true }, getByParams)
  fastify.get('/:company/:objectType/:documentType/:objectId/:culture', { exposeHeadRoute: true }, getByParams)
}