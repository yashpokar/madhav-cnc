import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { can } from '@/lib/permissions'
import { toCsv } from '@/lib/csv'
import { EXPORT_RESOURCE, buildSheet } from '@/lib/services/export'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const { kind } = await params
  const resource = EXPORT_RESOURCE[kind]

  if (!resource) {
    return NextResponse.json({ error: 'Unknown export' }, { status: 404 })
  }

  const user = await getCurrentUser()

  if (!user || !user.isActive) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  if (!can(user.role, `${resource}:read`)) {
    return NextResponse.json({ error: 'Not permitted' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('q')?.trim() || undefined
  const sheet = await buildSheet(kind, search, searchParams.get('status'))

  if (!sheet) {
    return NextResponse.json({ error: 'Unknown export' }, { status: 404 })
  }

  const date = new Date().toISOString().slice(0, 10)

  return new NextResponse(toCsv(sheet.headers, sheet.rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${kind}-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
