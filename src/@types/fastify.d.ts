import { ConnectionPool } from 'mssql'
// import { JWTPayload } from 'jose'

declare module 'fastify' {
  export interface FastifyInstance {
    getSqlPool: (name?: string) => Promise<ConnectionPool>
  }

  // export interface FastifyRequest {
  //   jwt: JWTPayload
  //   hasRole: (role: string) => boolean
  //   hasPermission: (permission: string, scope?: string) => boolean
  // }

  export interface FastifyReply {
    success: (data?: any, code?: number, executionTime?: number) => FastifyReply
    fail: (data?: any, code?: number, executionTime?: number) => FastifyReply
    error: (message?: string, code?: number, executionTime?: number) => FastifyReply
  }
}