import sql from 'mssql';

// ─── Types ───
export interface RpcParam {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type: any; // mssql type (e.g. sql.VarChar(50), sql.Char(8), sql.Int, sql.Bit)
  value: unknown;
}

type DatabaseName = 'fullpot' | 'sistema';

// ─── Parse server config ───
const parseServerConfig = (): { server: string; port: number } => {
  const dbServer = process.env.DB_SERVER || '';

  // Remove 'tcp:' prefix if present
  let serverStr = dbServer.replace(/^tcp:/i, '');

  let server = serverStr;
  let port = 3342; // default port

  if (serverStr.includes(',')) {
    const parts = serverStr.split(',');
    server = parts[0];
    port = parseInt(parts[1], 10) || 3342;
  } else if (serverStr.includes(':')) {
    const parts = serverStr.split(':');
    server = parts[0];
    port = parseInt(parts[1], 10) || 3342;
  }

  return { server, port };
};

// ─── Build config for a specific database ───
const buildConfig = (database: string): sql.config => {
  const { server, port } = parseServerConfig();

  return {
    server,
    port,
    database,
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: false,
      enableArithAbort: true,
    },
  };
};

// ─── Connection pool manager ───
const pools: Map<string, sql.ConnectionPool> = new Map();

async function getPool(database: DatabaseName): Promise<sql.ConnectionPool> {
  const dbName =
    database === 'sistema'
      ? process.env.DB_SISTEMA_NAME || 'sistema'
      : process.env.DB_DATABASE || 'fullpot';

  const existing = pools.get(dbName);
  if (existing?.connected) {
    return existing;
  }

  try {
    const config = buildConfig(dbName);
    const pool = await sql.connect(config);
    pools.set(dbName, pool);
    console.log(`✅ Connected to SQL Server [${dbName}]`);
    return pool;
  } catch (error) {
    console.error(`❌ Error connecting to SQL Server [${dbName}]:`, error);
    throw error;
  }
}

// ─── Execute Stored Procedure via RPC ───
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeRPC(
  spName: string,
  params: RpcParam[] = [],
  database: DatabaseName = 'fullpot'
): Promise<sql.IProcedureResult<any>> {
  const pool = await getPool(database);
  const request = pool.request();

  params.forEach((param) => {
    request.input(param.name, param.type, param.value);
  });

  return request.execute(spName);
}

// ─── Health check ───
export async function checkDbHealth(): Promise<{ connected: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    const pool = await getPool('fullpot');
    await pool.request().query('SELECT 1 AS health');
    return { connected: true, latencyMs: Date.now() - start };
  } catch {
    return { connected: false, latencyMs: Date.now() - start };
  }
}

// Re-export sql types for parameter building
export { sql };
