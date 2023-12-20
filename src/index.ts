import Fastify from '@groupclaes/fastify-elastic'
const config = require('./config')
import { env } from 'process'

import { FastifyInstance } from 'fastify'
import contentController from './controllers/content.controller'
import fileConrtroller from './controllers/file.controller'

let fastify: FastifyInstance | undefined

const LOGLEVEL = 'debug'

/** Main loop */
async function main() {
  fastify = await Fastify({ ...config.wrapper, securityHeaders: { csp: `default-src 'self' 'unsafe-inline' pcm.groupclaes.be` } })
  const version_prefix = (env.APP_VERSION ? '/' + env.APP_VERSION : '')
  await fastify.register(fileConrtroller, { prefix: `${version_prefix}/${config.wrapper.serviceName}/file`, logLevel: LOGLEVEL })
  await fastify.register(contentController, { prefix: `${version_prefix}/${config.wrapper.serviceName}`, logLevel: 'info' })
  await fastify.listen({ port: +(env['PORT'] ?? 80), host: '::' })
}

['SIGTERM', 'SIGINT'].forEach(signal => {
  process.on(signal, async () => {
    await fastify?.close()
    process.exit(0)
  })
})

main()