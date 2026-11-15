import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A small reader of prisma/schema.prisma for tests: the models, their tables
 * and fields. It lets the coverage test and the fixture builder follow the
 * schema without a hand-kept list.
 */

export type SchemaField = {
  name: string
  type: string
  list: boolean
  optional: boolean
  isId: boolean
  hasDefault: boolean
  isUpdatedAt: boolean
  unique: boolean
  /** For a relation field: the scalar FK fields on this model. */
  fkFields: string[]
  /** Set when `type` is another model. */
  isRelation: boolean
  column: string
}

export type SchemaModel = { name: string; table: string; fields: SchemaField[] }

export function parseSchema(root = process.cwd()) {
  const text = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8')
  const enums: Record<string, string[]> = {}

  for (const match of text.matchAll(/^enum (\w+) \{([\s\S]*?)^\}/gm)) {
    enums[match[1]] = match[2]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('//') && !line.startsWith('@@'))
      .map((line) => line.split(/\s+/)[0])
  }

  const modelNames = [...text.matchAll(/^model (\w+) \{/gm)].map((m) => m[1])
  const models: SchemaModel[] = []

  for (const match of text.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const body = match[2]
    const table = /@@map\("(\w+)"\)/.exec(body)?.[1] ?? match[1]
    const compositeId = /@@id\(\[([^\]]*)\]\)/.exec(body)?.[1]?.split(',').map((s) => s.trim()) ?? []
    const fields: SchemaField[] = []

    for (const line of body.split('\n')) {
      const field = /^\s{2}(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(line)

      if (!field || line.trim().startsWith('//') || line.trim().startsWith('@@')) continue

      const [, name, type, list, optional, rest] = field
      const relation = /@relation\([^)]*fields:\s*\[([^\]]*)\]/.exec(rest)

      fields.push({
        name,
        type,
        list: Boolean(list),
        optional: Boolean(optional),
        isId: /@id\b/.test(rest) || compositeId.includes(name),
        hasDefault: /@default\(/.test(rest),
        isUpdatedAt: /@updatedAt/.test(rest),
        unique: /@unique\b/.test(rest),
        fkFields: relation ? relation[1].split(',').map((s) => s.trim()) : [],
        isRelation: modelNames.includes(type),
        column: /@map\("(\w+)"\)/.exec(rest)?.[1] ?? name,
      })
    }

    models.push({ name: match[1], table, fields })
  }

  return { models, enums }
}
