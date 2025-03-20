// External dependencies
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { env } from 'process'
import { createReadStream, existsSync, statSync, readFileSync, writeFileSync, unlink, ReadStream } from 'node:fs'
import { fromBuffer } from 'pdf2pic'
import sharp from 'sharp'

import Document from '../repositories/document.repository'
import sha1 from '../crypto'
import parseRangeHeader from '../request-range'
import { Range, Ranges } from 'range-parser'
import Tools from '../repositories/tools'
import { ConnectionPool } from 'mssql'

const PAGE_SIZE = {
  WIDTH: 420,
  HEIGHT: 595
}

export default async function(fastify: FastifyInstance) {
  /**
   * @route /{version}/content/file/{uuid}
   */
  fastify.get('/:uuid', { exposeHeadRoute: true }, async function(request: FastifyRequest<{
    Params: { uuid: string }
  }>, reply: FastifyReply) {
    let contentMode = 'attachment'
    // fix CSP
    // reply.header('Content-Security-Policy', `default-src 'self' 'unsafe-inline' pcm.groupclaes.be`)
    if ('show' in (request.query as any)) {
      contentMode = 'inline'
    }

    // const token = request.token || { sub: null }
    let uuid: string = request.params['uuid'].toLowerCase()

    try {
      const pool = await fastify.getSqlPool()
      const repository = new Document(request.log, pool)

      let document = await repository.findOne({
        guid: uuid
      })

      if (document) {
        const uuid = document.guid.toLowerCase()
        const _fn = `${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/file`

        if (existsSync(_fn)) {
          const lastMod = statSync(_fn).mtime
          if (request.method === 'HEAD') {
            return reply
              .header('Content-Length', document.size)
              .header('Last-Modified', lastMod.toUTCString())
              .type(document.mimeType)
              .send(document.name)
          }

          const document_name_encoded: string = encodeURI(document.name)
          let filename: string = `filename="${document_name_encoded}"; filename*=UTF-8''${document_name_encoded}`

          if (contentMode === 'inline') {
            filename = `filename="${document.documentType}_${document.itemNum}.${document.extension}"`
          }

          if (document.mimeType.startsWith('video/')) {
            request.log.debug('in video specific handler!')
            // video specific handler
            const range: { unit: string; ranges: Ranges } | number = parseRangeHeader(request, document.size)
            let singleRange: Range
            if (!range || typeof (range) === 'number') { // Client is a dumb-dumb
              request.log.debug({ range }, 'Range Not Satisfiable')
              // If no valid range is found, throw a 416 error
              // as indicated by the RFC 7233
              switch (range) {
                case -2:
                  return reply.error('Malformed range header', 416)

                case -1:
                  return reply.error('Range Not Satisfiable', 416)

                default:
                  // No 'Range' header present; this is often caused by misconfiguration on the client-side.
                  // Nonetheless, we will be an understanding, happy server and fix the client's stupidity.
                  singleRange = {
                    start: 0,
                    end: 1
                  }
                  break
              }
            } else {
              // Handle only the first range requested
              singleRange = range.ranges[0]
              request.log.debug({ singleRange }, 'singleRange')
            }

            // Define the size of the chunk to send
            const chunkSize = 1e6 // 1MB = 1 * 1e6
            const start: number = singleRange.start
            // Always pick the smallest end size; this accommodates if the client feels special and
            // requested a smaller size than our defined buffer size of 1MB.
            const end: number = Math.min(singleRange.end, start + chunkSize - 1, document.size - 1)
            const contentLength: number = end - start + 1
            request.log.debug({ contentLength }, `bytes ${start}-${end}/${document.size}`)

            // Set the appropriate headers for range requests
            reply.headers({
              'Accept-Ranges': 'bytes',
              'Content-Range': `bytes ${start}-${end}/${document.size}`,
              'Content-Length': contentLength,
              'Content-Disposition': 'inline; ' + filename,
              'Last-Modified': lastMod.toUTCString(),
              'document-guid': uuid
            })

            // Send a 206 Partial Content status code
            reply.code(206)
            reply.type(document.mimeType)
            request.log.debug({ mime: document.mimeType }, 'code 206')

            // Stream the requested chunk of the video file
            return createReadStream(_fn, { start, end })
          }

          reply
            .header('Cache-Control', `must-revalidate, max-age=${document.maxAge}, private`)
            .header('document-guid', uuid)
            .header('Expires', new Date(lastMod.getTime() + (document.maxAge * 1000)).toUTCString())
            .header('Last-Modified', lastMod.toUTCString())
            .header('Content-Disposition', `${contentMode}; ${filename}`)
            .type(document.mimeType)

          return reply
            .send(createReadStream(_fn))
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
      request.log.error({ err, uuid }, 'Error while retrieving file')
      return reply
        .status(500)
        .send(err)
    }
  })

  /**
   * previews are 280x280 images `thumb_large` if file is pdf thumb will be PAGE_SIZE
   */
  fastify.get('/:uuid/preview', async function(request: FastifyRequest<{
    Params: { uuid: string },
    Querystring: { culture?: string }
  }>, reply: FastifyReply): Promise<never> {
    try {
      const pool: ConnectionPool = await fastify.getSqlPool()
      const repo = new Document(request.log, pool)
      let uuid: string = request.params['uuid'].toLowerCase()

      let document = await repo.findOne({
        guid: uuid
      })

      if (document) {
        const _fn = `${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/file`
        const _fn_thumb = `${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb_large`
        const _fn_etag = `${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb_large_etag`

        let stream: ReadStream | Buffer
        // preview logic is based on mime type 
        switch (document.mimeType) {
          case 'image/bmp':
          case 'image/gif':
          case 'image/jpeg':
          case 'image/pjpeg':
          case 'image/png':
          case 'image/svg+xml':
          case 'image/webp':
            return reply.redirect(`https://pcm.groupclaes.be/${env.APP_VERSION}/i/${uuid}?s=thumb_large`, 307)

          case 'image/tiff':
            stream = createReadStream('./assets/tif.png')
            return reply
              .type('image/png')
              .send(stream)

          case 'text/plain':
            stream = createReadStream('./assets/txt.png')
            return reply
              .type('image/png')
              .send(stream)

          case 'document-image/vnd.adobe.photoshop':
            stream = createReadStream('./assets/psd.png')
            return reply
              .type('image/png')
              .send(stream)

          case 'document-application/postscript':
            stream = createReadStream('./assets/ps.png')
            return reply
              .type('image/png')
              .send(stream)

          case 'document-application/vnd.ms-powerpoint':
            stream = createReadStream('./assets/ppt.png')
            return reply
              .type('image/png')
              .send(stream)

          case 'document-application/vnd.ms-excel':
          case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
            stream = createReadStream('./assets/xls.png')
            return reply
              .type('image/png')
              .send(stream)

          case 'application/msword':
          case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
            stream = createReadStream('./assets/doc.png')
            return reply
              .type('image/png')
              .send(stream)

          case 'application/x-compressed':
          case 'application/x-zip-compressed':
            stream = createReadStream('./assets/zip.png')
            return reply
              .type('image/png')
              .send(stream)

          case 'application/pdf':
            try {
              if (existsSync(_fn)) {
                const lastMod = statSync(_fn).mtime
                const etag = sha1(lastMod.toISOString())
                const webp = (request.headers['accept'] && request.headers['accept'].indexOf('image/webp') > -1)

                if (existsSync(_fn_etag) && webp) {
                  if (readFileSync(_fn_etag).toString() == etag) {
                    stream = readFileSync(_fn_thumb)
                    return reply
                      .type('image/webp')
                      .send(stream)
                  }
                }

                const pdf = readFileSync(_fn, null)
                const convert = fromBuffer(pdf, {
                  format: 'png'
                })

                const output = await convert(1, { responseType: 'buffer' })

                let image = sharp(output.buffer)
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
                  writeFileSync(_fn_thumb, buffer)
                  writeFileSync(_fn_etag, etag)

                  return reply
                    .type(webp ? 'image/webp' : 'image/jpeg')
                    .send(buffer)
                }
              }
            } catch (err) {
              console.error(err)

              stream = createReadStream('./assets/pdf.png')
              return reply
                .type('image/png')
                .send(stream)
            }
        }
      }

      return Tools.send404Image(request, reply)
    } catch (err) {
      return reply
        .status(500)
        .send(err)
    }
  })

  fastify.delete('/:uuid/cache', async function(request: FastifyRequest<{
    Params: { uuid: string }
  }>, reply: FastifyReply) {
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

        if (existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_small`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_small`)
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_small_etag`)
        }
        if (existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb`)
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb_etag`)
        }
        if (existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb_m`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb_m`)
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb_m_etag`)
        }
        if (existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb_l`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb_l`)
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb_l_etag`)
        }
        if (existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb_large`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb_large`)
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/thumb_large_etag`)
        }
        if (existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/miniature`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/miniature`)
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/miniature_etag`)
        }
        if (existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image`)
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_etag`)
        }
        if (existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_large`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_large`)
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_large_etag`)
        }
        if (existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_large`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_large`)
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_large_etag`)
        }
        if (existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_large`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_large`)
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/image_large_etag`)
        }
        if (existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/border-color_code`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/border-color_code`)
        }
        if (existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/background-color_code`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/background-color_code`)
        }
        if (existsSync(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/color_code`)) {
          files.push(`${env['DATA_PATH']}/content/${uuid.substring(0, 2)}/${uuid}/color_code`)
        }

        if (files.length > 0) {
          await Promise.all(files.map(file => unlink(file, console.error)))
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

  fastify.get('/tools/ext/:ext', async function(request: FastifyRequest<{
    Params: { ext: string }
  }>, reply: FastifyReply) {
    try {
      let ext: string = request.params.ext.toLowerCase()

      let ext_int: number
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

      let file = readFileSync('./assets/template.svg').toString('utf8')
      file = file.replace('#4444ef', color).replace('-EXT-', ext.toLocaleUpperCase().slice(0, 5))
      let image = sharp(Buffer.from(file))
      const webp = (request.headers['accept'] && request.headers['accept'].indexOf('image/webp') > -1)

      const buffer = await (
        webp ?
          image
            .webp({ lossless: true })
            .toBuffer()
          :
          image
            .png()
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
  '#444444'
]

// const colors2 = [
//   '#a2a2a2',
//   '#f7a2a2',
//   '#a2a2f7',
//   '#a2f7a2',
//   '#f7a2f7',
//   '#f7f7a2',
//   '#a2f7f7',
//   '#f7f7f7'
// ]