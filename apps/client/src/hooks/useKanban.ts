import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import mailApi from '../api/mail'
import { loadColumnConfig } from '../utils/kanbanConfig'

export type KanbanColumnId = string

export interface KanbanColumn {
  id: KanbanColumnId
  title: string
  gmailLabel: string
}

// Load columns from localStorage (dynamic configuration)
export function getKanbanColumns(): KanbanColumn[] {
  const config = loadColumnConfig()
  return config.map(col => ({
    id: col.id,
    title: col.title,
    gmailLabel: col.gmailLabel
  }))
}

// Legacy export for backward compatibility
export const KANBAN_COLUMNS = getKanbanColumns()

type ColumnsData = Record<string, any[]>

async function fetchColumns(): Promise<ColumnsData> {
  const columns = getKanbanColumns() // Get dynamic columns
  const newData: ColumnsData = {}
  await Promise.all(
    columns.map(async (col) => {
      try {
        // Use the Gmail label instead of column ID for the API call
        const res = await mailApi.listEmails(col.gmailLabel, 10)
        const emails = (res && res.previews) ? res.previews : (res && res.threads ? res.threads : [])
        newData[col.id] = emails
      } catch (e) {
        console.error(`Error loading column ${col.id} (label: ${col.gmailLabel})`, e)
        newData[col.id] = []
      }
    })
  )
  return newData
}

export function useKanbanColumns() {
  const columns = getKanbanColumns() // Get current column configuration
  
  const query = useQuery<ColumnsData>({
    queryKey: ['kanban', 'columns'],
    queryFn: fetchColumns,
    staleTime: 1000 * 30,
    retry: 2,
    refetchOnWindowFocus: false,
  })

  // Always return an object with empty arrays to prevent undefined access
  const data = useMemo<ColumnsData>(() => {
    const result = query.data || {}
    // Ensure all columns exist with at least empty arrays
    columns.forEach(col => {
      if (!result[col.id]) {
        result[col.id] = []
      }
    })
    return result
  }, [query.data, columns])

  return { ...query, data }
}

export function useMoveEmail() {
  const qc = useQueryClient()

  return useMutation(
    async ({ emailId, from, to, index }: { emailId: string; from: KanbanColumnId; to: KanbanColumnId; index: number }) => {
      // Get the Gmail label for the destination column
      const columns = getKanbanColumns()
      const targetColumn = columns.find(col => col.id === to)
      const gmailLabel = targetColumn?.gmailLabel || to
      
      // Apply the Gmail label
      await mailApi.modifyEmail(emailId, { labels: [gmailLabel] })
      return { emailId, from, to, index }
    },
    {
      // optimistic update
      onMutate: async (variables) => {
        await qc.cancelQueries(['kanban', 'columns'])
        const prev = qc.getQueryData<ColumnsData>(['kanban', 'columns']) || {}

        const newData: ColumnsData = Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, [...v]]))
        const sourceList = newData[variables.from] || []
        const destList = newData[variables.to] || []
        const movingItem = sourceList.find((m) => String(m.id) === String(variables.emailId))
        if (movingItem) {
          newData[variables.from] = sourceList.filter((m) => String(m.id) !== String(variables.emailId))
          destList.splice(variables.index, 0, movingItem)
          newData[variables.to] = destList
        }
        qc.setQueryData(['kanban', 'columns'], newData)
        return { prev }
      },
      onError: (_err, _vars, ctx) => {
        if (ctx?.prev) qc.setQueryData(['kanban', 'columns'], ctx.prev)
      },
      onSettled: () => {
        qc.invalidateQueries(['kanban', 'columns'])
      },
    }
  )
}

export function useSnoozeEmail() {
  const qc = useQueryClient()

  return useMutation(
    async ({ emailId, snoozeUntil }: { emailId: string; snoozeUntil: string }) => {
      await mailApi.snoozeEmail(emailId, snoozeUntil)
      return { emailId, snoozeUntil }
    },
    {
      onMutate: async ({ emailId }) => {
        await qc.cancelQueries(['kanban', 'columns'])
        const prev = qc.getQueryData<ColumnsData>(['kanban', 'columns']) || {}
        const newData: ColumnsData = Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, [...v]]))

        let snoozedItem: any | null = null
        Object.keys(newData).forEach((colId) => {
          if (colId === 'snoozed') return
          const idx = newData[colId]?.findIndex((e) => String(e.id) === String(emailId)) ?? -1
          if (idx >= 0) {
            snoozedItem = newData[colId][idx]
            newData[colId] = newData[colId].filter((e) => String(e.id) !== String(emailId))
          }
        })
        if (snoozedItem) {
          newData['snoozed'] = [snoozedItem, ...(newData['snoozed'] || [])]
        }

        qc.setQueryData(['kanban', 'columns'], newData)
        return { prev }
      },
      onError: (_err, _vars, ctx) => {
        if (ctx?.prev) qc.setQueryData(['kanban', 'columns'], ctx.prev)
      },
      onSettled: () => {
        qc.invalidateQueries(['kanban', 'columns'])
      },
    }
  )
}

