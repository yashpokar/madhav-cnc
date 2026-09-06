'use client'

import { useState } from 'react'
import { Badge } from '@/components/catalyst/badge'
import { FormBanner } from '@/components/form-banner'
import type { SimpleResult } from '@/lib/actions/production'
import type { BoardTask, StageOption } from '@/lib/queries/production'
import { TaskCard } from './task-card'

export function ProductionBoard({
  stages,
  tasks,
  canUpdate,
  hideFinished,
}: {
  stages: StageOption[]
  tasks: BoardTask[]
  canUpdate: boolean
  hideFinished: boolean
}) {
  const [result, setResult] = useState<SimpleResult | null>(null)

  const byStage = new Map<string, BoardTask[]>()

  for (const stage of stages) {
    byStage.set(stage.id, [])
  }

  for (const task of tasks) {
    if (hideFinished && (task.status === 'DONE' || task.status === 'SKIPPED')) {
      continue
    }

    byStage.get(task.stage.id)?.push(task)
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {result ? (
        <FormBanner tone={result.ok ? 'success' : 'error'}>
          {result.ok ? result.message : result.error}
        </FormBanner>
      ) : null}

      <div className="overflow-x-auto pb-2">
        <div className="flex gap-4">
          {stages.map((stage) => {
            const stageTasks = byStage.get(stage.id) ?? []

            return (
              <div
                key={stage.id}
                className="flex w-72 shrink-0 flex-col gap-3 rounded-lg bg-zinc-950/5 p-3 dark:bg-white/5"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm/6 font-medium">{stage.name}</div>
                  <Badge color="zinc">{stageTasks.length}</Badge>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {stageTasks.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-zinc-950/15 px-3 py-6 text-center text-xs/5 text-zinc-500 dark:border-white/15 dark:text-zinc-400">
                      Nothing here
                    </div>
                  ) : (
                    stageTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        canUpdate={canUpdate}
                        onResult={setResult}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
