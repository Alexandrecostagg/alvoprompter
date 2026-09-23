import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
export function testDatabase() {
  const sqlite = new DatabaseSync(':memory:')
  for (const name of readdirSync('api/transcribe/migrations').sort()) sqlite.exec(readFileSync(`api/transcribe/migrations/${name}`, 'utf8'))
  let failNext = false
  class Statement {
    args: (string | number | null)[] = []
    constructor(readonly sql: string) {}
    bind(...args: (string | number | null)[]) { this.args = args; return this }
    async run() { const r = sqlite.prepare(this.sql).run(...this.args); return { meta: { changes: Number(r.changes) } } }
    async first() { return sqlite.prepare(this.sql).get(...this.args) ?? null }
    async all() { return { results: sqlite.prepare(this.sql).all(...this.args) } }
  }
  const db = {
    prepare(sql: string) { return new Statement(sql) },
    async batch(statements: Statement[]) {
      sqlite.exec('BEGIN')
      try {
        const results = []
        for (let i = 0; i < statements.length; i++) {
          results.push(await statements[i]!.run())
          if (failNext && i === 0) { failNext = false; throw new Error('Transient database failure') }
        }
        sqlite.exec('COMMIT'); return results
      } catch (error) { sqlite.exec('ROLLBACK'); throw error }
    },
  }
  return { db: db as unknown as D1Database, sqlite, failNextBatch: () => { failNext = true } }
}
