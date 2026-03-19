import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager"
import snowflake from "snowflake-sdk"

snowflake.configure({ logLevel: "WARN" })

interface SnowflakeCredentials {
  account: string
  user: string
  warehouse: string
  role: string
  database: string
  schema: string
  private_key: string
}

let cachedCreds: SnowflakeCredentials | null = null

async function getCredentials(): Promise<SnowflakeCredentials> {
  if (cachedCreds) return cachedCreds
  const client = new SecretsManagerClient({ region: "us-east-1" })
  const { SecretString } = await client.send(
    new GetSecretValueCommand({ SecretId: "ReportingInvestigationAgentSnowflake-prod" })
  )
  cachedCreds = JSON.parse(SecretString!)
  return cachedCreds!
}

function formatPrivateKey(rawKey: string): string {
  const body = rawKey
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "")
    .match(/.{1,64}/g)!
    .join("\n")
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`
}

export interface SnowflakeClient {
  query: <T = Record<string, unknown>>(sql: string, binds?: (string | number)[]) => Promise<T[]>
  close: () => void
}

export async function createSnowflakeClient(): Promise<SnowflakeClient> {
  const creds = await getCredentials()
  const connection = snowflake.createConnection({
    account: creds.account,
    username: creds.user,
    privateKey: formatPrivateKey(creds.private_key),
    authenticator: "SNOWFLAKE_JWT",
    warehouse: creds.warehouse,
    database: creds.database,
    schema: creds.schema,
    role: creds.role,
  })

  await new Promise<void>((resolve, reject) => {
    connection.connect((err) => (err ? reject(err) : resolve()))
  })

  return {
    query: <T = Record<string, unknown>>(sql: string, binds?: (string | number)[]) =>
      new Promise<T[]>((resolve, reject) => {
        connection.execute({
          sqlText: sql,
          binds,
          complete: (err, _stmt, rows) => (err ? reject(err) : resolve((rows ?? []) as T[])),
        })
      }),
    close: () => connection.destroy(() => {}),
  }
}
