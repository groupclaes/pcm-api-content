import server from './src'
const cfg = require('./config')

const main = async function(): Promise<void> {
  const fastify = await server(cfg);

  ['SIGTERM', 'SIGINT'].forEach((signal: string): void => {
    process.on(signal, async (): Promise<never> => {
      await fastify?.close()
      process.exit(0)
    })
  })
}

main()