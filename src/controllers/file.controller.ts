// External dependencies
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { env } from 'process'
import fs from 'fs'
import { pdftobuffer } from 'pdftopic'
import sharp from 'sharp'
import sql from 'mssql'

import Document from '../repositories/document.repository'
import sha1 from '../crypto'

const PAGE_SIZE = {
  WIDTH: 420,
  HEIGHT: 595
}

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
   * @route /{version}/content/file/{uuid}
   */
  fastify.get('/:uuid', async function (request: FastifyRequest<{ Params: { uuid: string } }>, reply: FastifyReply) {
    let contentMode = 'attachment'
    // fix CSP
    // reply.header('Content-Security-Policy', `default-src 'self' 'unsafe-inline' pcm.groupclaes.be`)
    if ('show' in (request.query as any)) {
      contentMode = 'inline'
    }

    try {
      const pool = await fastify.getSqlPool()
      const repository = new Document(request.log, pool)
      // const token = request.token || { sub: null }
      let uuid: string = request.params['uuid'].toLowerCase()

      let document = await repository.findOne({
        guid: uuid
      })

      if (document) {
        const uuid = document.guid.toLowerCase()
        const _fn = `${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/file`

        if (fs.existsSync(_fn)) {
          const lastMod = fs.statSync(_fn).mtime
          if (request.method === 'HEAD') {
            return reply
              .header('Content-Length', document.size)
              .header('Last-Modified', lastMod.toUTCString())
              .type(document.mimeType)
              .send(document.name)
          }

          const document_name_encoded = encodeURI(document.name)
          let filename = `filename="${document_name_encoded}"; filename*=UTF-8''${document_name_encoded}`

          if (contentMode === 'inline') {
            filename = `filename="${document.documentType}_${document.itemNum}.${document.extension}"`
          }

          reply
            .header('Cache-Control', `must-revalidate, max-age=${document.maxAge}, private`)
            .header('document-guid', uuid)
            .header('Expires', new Date(lastMod.getTime() + (document.maxAge * 1000)).toUTCString())
            .header('Last-Modified', lastMod.toUTCString())
            .header('Content-Disposition', `${contentMode}; ${filename}`)
            .type(document.mimeType)

          const stream = fs.createReadStream(_fn)
          return reply
            .send(stream)
        }
        return reply
          .code(404)
          .send({
            status: 'Not Found',
            statusCode: 404,
            message: `File '${uuid}' not found`
          })
      } else {
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
  })

  /**
   * previews are 280x280 images `thumb_large` if file is pdf thumb will be PAGE_SIZE
   */
  fastify.get('/:uuid/preview', async function (request: FastifyRequest<{ Params: { uuid: string }, Querystring: { culture?: string } }>, reply: FastifyReply) {
    let culture = request.query.culture ?? 'nl'

    try {
      const pool = await fastify.getSqlPool()
      const repo = new Document(request.log, pool)
      let uuid: string = request.params['uuid'].toLowerCase()

      let document = await repo.findOne({
        guid: uuid
      })

      if (document) {
        const _fn = `${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/file`
        const _fn_thumb = `${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb_large`
        const _fn_etag = `${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb_large_etag`

        let stream
        // preview logic is based on mime type 
        switch (document.mimeType) {
          case 'image/bmp':
          case 'image/gif':
          case 'image/jpeg':
          case 'image/pjpeg':
          case 'image/png':
          case 'image/svg+xml':
          case 'image/webp':
            return reply.redirect(307, `https://pcm.groupclaes.be/${env.APP_VERSION}/i/${uuid}?s=thumb_large`)

          case 'image/tiff':
            stream = fs.createReadStream('./assets/tif.png')
            return reply
              .type('image/png')
              .send(stream)

          case 'text/plain':
            stream = fs.createReadStream('./assets/txt.png')
            return reply
              .type('image/png')
              .send(stream)

          case 'document-image/vnd.adobe.photoshop':
            stream = fs.createReadStream('./assets/psd.png')
            return reply
              .type('image/png')
              .send(stream)

          case 'document-application/postscript':
            stream = fs.createReadStream('./assets/ps.png')
            return reply
              .type('image/png')
              .send(stream)

          case 'document-application/vnd.ms-powerpoint':
            stream = fs.createReadStream('./assets/ppt.png')
            return reply
              .type('image/png')
              .send(stream)

          case 'document-application/vnd.ms-excel':
          case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
            stream = fs.createReadStream('./assets/xls.png')
            return reply
              .type('image/png')
              .send(stream)

          case 'application/msword':
          case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
            stream = fs.createReadStream('./assets/doc.png')
            return reply
              .type('image/png')
              .send(stream)

          case 'application/x-compressed':
          case 'application/x-zip-compressed':
            stream = fs.createReadStream('./assets/zip.png')
            return reply
              .type('image/png')
              .send(stream)

          case 'application/pdf':
            try {
              if (fs.existsSync(_fn)) {
                const lastMod = fs.statSync(_fn).mtime
                const etag = sha1(lastMod.toISOString())
                const webp = (request.headers['accept'] && request.headers['accept'].indexOf('image/webp') > -1)

                if (fs.existsSync(_fn_etag) && webp) {
                  if (fs.readFileSync(_fn_etag).toString() == etag) {
                    stream = fs.readFileSync(_fn_thumb)
                    return reply
                      .type('image/webp')
                      .send(stream)
                  }
                }

                const pdf = fs.readFileSync(_fn, null)
                const buff = await pdftobuffer(pdf, 0)

                let image = sharp(buff)
                const background = '#ffffff'
                image = image
                  .resize({
                    height: PAGE_SIZE.HEIGHT,
                    width: PAGE_SIZE.WIDTH,
                    fit: 'contain',
                    background
                  })
                // .flatten({ background })

                const buffer = await (
                  webp ?
                    image
                      .webp({ quality: 80 })
                      .toBuffer()
                    :
                    image
                      .jpeg({ quality: 90 })
                      .toBuffer()
                )

                if (buffer) {
                  fs.writeFileSync(_fn_thumb, buffer)
                  fs.writeFileSync(_fn_etag, etag)

                  return reply
                    .type(webp ? 'image/webp' : 'image/jpeg')
                    .send(buffer)
                }
              }
            } catch (err) {
              console.error(err)

              stream = fs.createReadStream('./assets/pdf.png')
              return reply
                .type('image/png')
                .send(stream)
            }
        }
      }

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
    } catch (err) {
      return reply
        .status(500)
        .send(err)
    }
  })

  fastify.delete('/:uuid/cache', async function (request: FastifyRequest<{ Params: { uuid: string } }>, reply: FastifyReply) {
    try {
      const pool = await fastify.getSqlPool()
      const repository = new Document(request.log, pool)
      // const token = request.token || { sub: null }
      let uuid: string = request.params['uuid'].toLowerCase()

      let document = await repository.findOne({
        guid: uuid
      })

      if (document) {
        const files: string[] = []

        if (fs.existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_small`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_small`)
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_small_etag`)
        }
        if (fs.existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb`)
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb_etag`)
        }
        if (fs.existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb_m`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb_m`)
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb_m_etag`)
        }
        if (fs.existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb_l`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb_l`)
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb_l_etag`)
        }
        if (fs.existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb_large`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb_large`)
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb_large_etag`)
        }
        if (fs.existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/miniature`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/miniature`)
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/miniature_etag`)
        }
        if (fs.existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image`)
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_etag`)
        }
        if (fs.existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_large`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_large`)
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_large_etag`)
        }
        if (fs.existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_large`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_large`)
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_large_etag`)
        }
        if (fs.existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_large`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_large`)
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_large_etag`)
        }
        if (fs.existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/border-color_code`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/border-color_code`)
        }
        if (fs.existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/background-color_code`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/background-color_code`)
        }
        if (fs.existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/color_code`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/color_code`)
        }

        if (files.length > 0) {
          await Promise.all(files.map(file => fs.unlink(file, console.error)))
        }
        return files
      }
      return reply
        .status(404)
        .send('Document does not exist')

    } catch (err) {
      return reply
        .status(500)
        .send(err)
    }
  })

  fastify.get('/tools/ext/:ext', async function (request: FastifyRequest<{ Params: { ext: string } }>, reply: FastifyReply) {
    try {
      let ext: string = request.params.ext.toLowerCase()

      let ext_int = 0
      switch (ext.length) {
        case 1:
          ext_int = ext.charCodeAt(0)
          break

        case 2:
          ext_int = ext.charCodeAt(0) + (ext.charCodeAt(1) * 2)
          break

        default:
          ext_int = ext.charCodeAt(0) + (ext.charCodeAt(1) * 2) + (ext.charCodeAt(2) * 4)
          break
      }

      const color_index = ext_int % colors.length
      const color = colors[color_index]

      let file = fs.readFileSync('./assets/template.svg').toString('utf8')
      file = file.replace('#4444ef', color).replace('-EXT-', ext.toLocaleUpperCase())
      let image = sharp(Buffer.from(file))
      const webp = (request.headers['accept'] && request.headers['accept'].indexOf('image/webp') > -1)

      const buffer = await (
        webp ?
          image
            .webp({ quality: 80 })
            .toBuffer()
          :
          image
            .png({ quality: 90 })
            .toBuffer()
      )

      return reply
        .type(webp ? 'image/webp' : 'image/png')
        .send(buffer)
    } catch (err) {
      return reply
        .status(500)
        .send(err)
    }
  })
}

const colors = [
  '#efefef',
  '#44efef',
  '#efef44',
  '#ef44ef',
  '#44ef44',
  '#ef4444',
  '#4444ef',
  '#444444',
]

const colors2 = [
  '#a2a2a2',
  '#f7a2a2',
  '#a2a2f7',
  '#a2f7a2',
  '#f7a2f7',
  '#f7f7a2',
  '#a2f7f7',
  '#f7f7f7'
]