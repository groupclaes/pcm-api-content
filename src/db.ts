// import external node packages
import sql from 'mssql'

// local import
let cfg = require('./config')

// Local variables
const pools = new Map()

export default {
  /**
    * Get or create a pool. If a pool doesn't exist the config must be provided.
    * If the pool does exist the config is ignored (even if it was different to the one provided
    * when creating the pool)
    */
  get: async (name: string): Promise<sql.ConnectionPool> => {
    if (!pools.has(name)) {
      if (!cfg.mssql[name]) {
        throw new Error(`Configuration for pool '${name}' does not exist!`)
      }
      const pool = new sql.ConnectionPool(cfg.mssql[name])
      const close = pool.close.bind(pool)
      pool.close = (...args) => {
        pools.delete(name)
        return close(...args)
      }
      pools.set(name, await pool.connect())
    }
    return pools.get(name)
  },
  /**
    * Closes all the pools and removes them from the store
    */
  closeAll: (): Promise<sql.ConnectionPool[]> => Promise.all(Array.from(pools.values()).map((connect) => {
    return connect.then((pool: sql.ConnectionPool) => pool.close())
  }))
}