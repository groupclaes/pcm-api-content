// External dependencies
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { env } from 'process'
import fs from 'fs'
import sql from 'mssql'

import Document from '../repositories/document.repository'

declare module 'fastify' {
  export interface FastifyInstance {
    getSqlPool: (name?: string) => Promise<sql.ConnectionPool>
  }

  export interface FastifyReply {
    success: (data?: any, code?: number, executionTime?: number) => FastifyReply
    fail: (data?: any, code?: number, executionTime?: number) => FastifyReply
    error: (message?: string, code?: number, executionTime?: number) => FastifyReply
  }
}

export default async function (fastify: FastifyInstance) {
  /**
   * @route /{version}/content/{company}/{objectType}/{documentType}/{objectId?}/{culture?}
   * @param {FastifyRequest} request
   * @param {FastifyReply} reply
  */
  fastify.get('/:company/:objectType/:documentType', { exposeHeadRoute: true }, getByParams)
  fastify.get('/:company/:objectType/:documentType/:objectId', { exposeHeadRoute: true }, getByParams)
  fastify.get('/:company/:objectType/:documentType/:objectId/:culture', { exposeHeadRoute: true }, getByParams)
}

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
}>, reply: FastifyReply) {
  let contentMode = 'attachment'
  // fix CSP
  reply.header('Content-Security-Policy', `default-src 'self' 'unsafe-inline' pcm.groupclaes.be`)
  if ('show' in request.query)
    contentMode = 'inline'

  let retry = 'retry' in request.query
  let thumbnail = 'thumb' in request.query

  try {
    const pool = await request.server.getSqlPool()
    const repository = new Document(request.log, pool)
    // const token = request.token || { sub: null }

    let company: string = request.params['company'].toLowerCase()
    let objectType: string = request.params['objectType'].toLowerCase()
    let documentType: string = request.params['documentType'].toLowerCase()
    let objectId: number = request.params.objectId ?? 100
    let culture: string = request.params.culture?.toLowerCase() ?? 'nl'

    let document = await repository.findOne({
      company,
      objectType,
      documentType,
      objectId,
      culture,
      size: request.query.size ?? 'any'
    })

    if (document) {
      const _guid = document.guid.toLowerCase()
      const _fn = `${env['DATA_PATH']}/content/${_guid.substring(0, 2)}/${_guid}/file`

      if (fs.existsSync(_fn)) {
        if (thumbnail && documentType === 'foto') {
          return reply.redirect(307, `https://pcm.groupclaes.be/v3/i/${_guid}?s=thumb`)
        }
        const lastMod = fs.statSync(_fn).mtime

        const document_name_encoded = encodeURI(document.name)
        let filename = `filename="${document.name}"; filename*=UTF-8''${document_name_encoded}`

        if (contentMode === 'inline') {
          filename = `filename="${document.documentType}_${document.itemNum}.${document.extension}"`
        }

        const stream = fs.createReadStream(_fn)
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
        if (request.headers.accept && request.headers.accept.indexOf('image/svg+xml') > -1) {
          reply.type('image/svg+xml')
          if (culture === 'nl') {
            const stream = fs.createReadStream('./assets/404_nl.svg')
            return reply.send(stream)
          } else if (culture === 'fr') {
            const stream = fs.createReadStream('./assets/404_fr.svg')
            return reply.send(stream)
          } else {
            const stream = fs.createReadStream('./assets/404.svg')
            return reply.send(stream)
          }
        } else {
          reply.type('image/png')
          if (culture === 'nl') {
            const stream = fs.createReadStream('./assets/404_nl.png')
            return reply.send(stream)
          } else if (culture === 'fr') {
            const stream = fs.createReadStream('./assets/404_fr.png')
            return reply.send(stream)
          } else {
            const stream = fs.createReadStream('./assets/404.png')
            return reply.send(stream)
          }
        }
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