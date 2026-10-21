import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const wrangler = join(here, "..", "node_modules", "wrangler", "bin", "wrangler.js")
const args = process.argv.slice(2)

function valueAfter(flag) {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

const email = (
  args.find((arg) => arg.startsWith("--email="))?.slice("--email=".length) ??
  valueAfter("--email")
)?.trim()

if (!email) {
  console.error("Usage: pnpm admin:grant:local --email you@example.com")
  process.exit(1)
}

const target = args.includes("--remote") ? "--remote" : "--local"
const emailSql = email.replace(/'/g, "''")

function run(args, options = {}) {
  return spawnSync(process.execPath, [wrangler, ...args], {
    encoding: "utf8",
    ...options,
  })
}

const lookup = run([
  "d1",
  "execute",
  "dtr-db",
  target,
  "--json",
  "--command",
  `SELECT id, email FROM user WHERE lower(email) = lower('${emailSql}')`,
])

if (lookup.status !== 0) {
  process.stderr.write(lookup.stderr ?? "")
  process.exit(lookup.status ?? 1)
}

let rows = []
try {
  const parsed = JSON.parse(lookup.stdout)
  rows = parsed.flatMap((entry) => entry.results ?? [])
} catch {
  console.error("Could not read the account lookup result.")
  process.stderr.write(lookup.stdout ?? "")
  process.exit(1)
}

const user = rows[0]
if (!user) {
  console.error(
    `No account found for ${email}. Create the account in the app first, then run this again.`,
  )
  process.exit(1)
}

const userId = String(user.id).replace(/'/g, "''")
const grant = run([
  "d1",
  "execute",
  "dtr-db",
  target,
  "--command",
  `INSERT INTO system_admins (user_id) VALUES ('${userId}') ON CONFLICT (user_id) DO NOTHING`,
])

if (grant.status !== 0) {
  process.stderr.write(grant.stderr ?? "")
  process.exit(grant.status ?? 1)
}

console.log(`Granted system admin to ${user.email}.`)
