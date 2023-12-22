import Fastify from '@groupclaes/fastify-elastic'
import { env } from 'process'
import { FastifyInstance } from 'fastify'

import contentController from './controllers/content.controller'
import fileConrtroller from './controllers/file.controller'

const LOGLEVEL = 'debug'

export default async function (config: any): Promise<FastifyInstance | undefined> {
  if (!config.wrapper.mssql && config.mssql) config.wrapper.mssql = config.mssql
  const fastify = await Fastify({ ...config.wrapper, securityHeaders: { csp: `default-src 'self' 'unsafe-inline' pcm.groupclaes.be` } })
  const version_prefix = (env.APP_VERSION ? '/' + env.APP_VERSION : '')
  const prefix = `${version_prefix}/${config.wrapper.serviceName}`
  await fastify.register(fileConrtroller, { prefix: `${prefix}/file`, logLevel: LOGLEVEL })
  await fastify.register(contentController, { prefix: prefix, logLevel: 'info' })
  await fastify.listen({ port: +(env['PORT'] ?? 80), host: '::' })
  return fastify
}