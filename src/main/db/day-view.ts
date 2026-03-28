import type {
  ActivityEvidence,
  ActivityEvidenceMinute,
  ActivitySlice,
  ActivitySliceKind,
  AggregationWindowMinutes,
  DayViewData,
  PlannedBlock
} from '../../shared/calendar'
import { parseStoredEvents, type WindowEventData } from '../pipeline/minute'
import type { DatabaseContext } from './context'
import type { PlanningDatabase } from './planning'
import {
  ensureIsoTimestamp,
  getLocalDayBounds,
  normalizeTimestamp,
  type PlannedContext
} from './utils'

type MinuteIngestDayRow = {
  minute_timestamp: string
  summary_status: string
  winning_app: string | null
  winning_title: string | null
  dominance: number | null
  afk: number
  needs_review: number
  window_events_json: string
}

type ClassificationChoiceRow = {
  id: number
  minute_timestamp: string
  planned_block_id: number | null
  on_task: number
  confidence: number
  reasoning: string | null
  corrected: number
  created_at: string
}

type MinuteSlot = {
  minuteTimestamp: string
  summaryStatus: string
  kind: ActivitySliceKind
  app: string | null
  title: string | null
  windowTitles: string[]
  dominance: number | null
  afk: boolean
  needsReview: boolean
  plannedBlockId: string | null
  onTask: boolean | null
  confidence: number | null
  reasoning: string | null
}

type BucketSummary = {
  slice: ActivitySlice
  sliceId: string
}

export type CoachingSnapshot = {
  activeBlock: PlannedContext | null
  recentMinutes: Array<{
    minuteTimestamp: string
    afk: boolean
    onTask: boolean | null
    confidence: number | null
    reasoning: string | null
  }>
}

export type DayViewDatabase = {
  getDayViewData: (input: {
    date: string
    aggregationMinutes: AggregationWindowMinutes
  }) => DayViewData
  getActivityEvidence: (input: {
    startAt: string
    endAt: string
    aggregationMinutes: AggregationWindowMinutes
  }) => ActivityEvidence
  getCoachingSnapshot: (input?: { referenceTime?: string }) => CoachingSnapshot
}

function getActivitySliceId(
  startAt: string,
  endAt: string,
  aggregationMinutes: AggregationWindowMinutes
): string {
  return `${startAt}:${endAt}:${aggregationMinutes}`
}

function floorToMinute(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 60_000) * 60_000)
}

function ceilToMinute(date: Date): Date {
  return new Date(Math.ceil(date.getTime() / 60_000) * 60_000)
}

function getMinuteWindowTitles(row: MinuteIngestDayRow): string[] {
  return Array.from(
    new Set(
      parseStoredEvents<WindowEventData>(row.window_events_json, row.minute_timestamp, 'window')
        .map((event) => event.data.title?.trim() ?? '')
        .filter((title) => title.length > 0)
    )
  )
}

function chooseKind(row: MinuteIngestDayRow | undefined): ActivitySliceKind {
  if (!row) {
    return 'gap'
  }

  if (row.afk === 1) {
    return 'afk'
  }

  return row.summary_status === 'winner' && row.winning_app ? 'activity' : 'gap'
}

function choosePreferredClassifications(
  rows: ClassificationChoiceRow[]
): Map<string, ClassificationChoiceRow> {
  const preferred = new Map<string, ClassificationChoiceRow>()

  for (const row of rows) {
    if (!preferred.has(row.minute_timestamp)) {
      preferred.set(row.minute_timestamp, row)
    }
  }

  return preferred
}

function buildMinuteSlotsForRange(
  startDate: Date,
  endDate: Date,
  minuteRowsByTimestamp: Map<string, MinuteIngestDayRow>,
  classificationsByTimestamp: Map<string, ClassificationChoiceRow>,
  plannedBlocks: PlannedBlock[]
): MinuteSlot[] {
  const plannedBlockEntries = plannedBlocks.map((block) => ({
    ...block,
    startMs: Date.parse(block.startAt),
    endMs: Date.parse(block.endAt)
  }))

  const slots: MinuteSlot[] = []

  for (let cursor = startDate.getTime(); cursor < endDate.getTime(); cursor += 60_000) {
    const minuteTimestamp = new Date(cursor).toISOString()
    const minuteRow = minuteRowsByTimestamp.get(minuteTimestamp)
    const classificationRow = classificationsByTimestamp.get(minuteTimestamp) ?? null
    const minuteMs = cursor
    const plannedBlock =
      plannedBlockEntries.find((block) => minuteMs >= block.startMs && minuteMs < block.endMs) ??
      null
    const kind = chooseKind(minuteRow)

    slots.push({
      minuteTimestamp,
      summaryStatus: minuteRow?.summary_status ?? 'missing',
      kind,
      app: kind === 'activity' ? (minuteRow?.winning_app ?? null) : null,
      title: kind === 'activity' ? (minuteRow?.winning_title ?? null) : null,
      windowTitles: minuteRow ? getMinuteWindowTitles(minuteRow) : [],
      dominance: kind === 'activity' ? (minuteRow?.dominance ?? null) : null,
      afk: minuteRow?.afk === 1,
      needsReview: minuteRow?.needs_review === 1,
      plannedBlockId: plannedBlock?.id ?? null,
      onTask: classificationRow ? classificationRow.on_task === 1 : null,
      confidence: classificationRow?.confidence ?? null,
      reasoning: classificationRow?.reasoning ?? null
    })
  }

  return slots
}

function buildBuckets(
  slots: MinuteSlot[],
  aggregationMinutes: AggregationWindowMinutes
): BucketSummary[] {
  const bucketSize = aggregationMinutes
  const buckets: BucketSummary[] = []

  for (let index = 0; index < slots.length; index += bucketSize) {
    const bucketSlots = slots.slice(index, index + bucketSize)
    if (bucketSlots.length === 0) {
      continue
    }

    const candidateMap = new Map<
      string,
      {
        totalSeconds: number
        latestTimestamp: string
        slot: MinuteSlot
      }
    >()

    for (const slot of bucketSlots) {
      const key = `${slot.kind}|${slot.app ?? ''}|${slot.title ?? ''}`
      const existing = candidateMap.get(key)
      if (!existing) {
        candidateMap.set(key, {
          totalSeconds: 60,
          latestTimestamp: slot.minuteTimestamp,
          slot
        })
        continue
      }

      existing.totalSeconds += 60
      if (slot.minuteTimestamp >= existing.latestTimestamp) {
        existing.latestTimestamp = slot.minuteTimestamp
        existing.slot = slot
      }
    }

    let selected:
      | {
          totalSeconds: number
          latestTimestamp: string
          slot: MinuteSlot
        }
      | undefined

    for (const candidate of candidateMap.values()) {
      if (
        !selected ||
        candidate.totalSeconds > selected.totalSeconds ||
        (candidate.totalSeconds === selected.totalSeconds &&
          candidate.latestTimestamp >= selected.latestTimestamp)
      ) {
        selected = candidate
      }
    }

    if (!selected) {
      continue
    }

    const firstSlot = bucketSlots[0]
    const lastSlot = bucketSlots[bucketSlots.length - 1]
    const uniquePlannedBlockIds = new Set(bucketSlots.map((slot) => slot.plannedBlockId))
    const plannedBlockId =
      uniquePlannedBlockIds.size === 1 ? (bucketSlots[0]?.plannedBlockId ?? null) : null
    const sliceId = getActivitySliceId(
      firstSlot.minuteTimestamp,
      new Date(Date.parse(lastSlot.minuteTimestamp) + 60_000).toISOString(),
      aggregationMinutes
    )

    buckets.push({
      sliceId,
      slice: {
        id: sliceId,
        kind: selected.slot.kind,
        startAt: firstSlot.minuteTimestamp,
        endAt: new Date(Date.parse(lastSlot.minuteTimestamp) + 60_000).toISOString(),
        app: selected.slot.app,
        title: selected.slot.title,
        dominance: selected.slot.dominance,
        needsReview: selected.slot.needsReview,
        plannedBlockId,
        onTask: selected.slot.onTask,
        confidence: selected.slot.confidence
      }
    })
  }

  return buckets
}

function mergeAdjacentBuckets(buckets: BucketSummary[]): ActivitySlice[] {
  const slices: ActivitySlice[] = []

  for (const bucket of buckets) {
    const previous = slices[slices.length - 1]
    if (
      previous &&
      previous.kind === bucket.slice.kind &&
      previous.app === bucket.slice.app &&
      previous.title === bucket.slice.title &&
      previous.plannedBlockId === bucket.slice.plannedBlockId &&
      previous.onTask === bucket.slice.onTask &&
      previous.confidence === bucket.slice.confidence &&
      previous.needsReview === bucket.slice.needsReview &&
      previous.endAt === bucket.slice.startAt
    ) {
      previous.endAt = bucket.slice.endAt
      if (
        previous.dominance !== null &&
        bucket.slice.dominance !== null &&
        Number.isFinite(previous.dominance) &&
        Number.isFinite(bucket.slice.dominance)
      ) {
        previous.dominance = Number(((previous.dominance + bucket.slice.dominance) / 2).toFixed(2))
      } else if (bucket.slice.dominance !== null) {
        previous.dominance = bucket.slice.dominance
      }
      previous.id = getActivitySliceId(previous.startAt, previous.endAt, 1)
      continue
    }

    slices.push({ ...bucket.slice })
  }

  return slices
}

export function createDayViewDatabase(
  context: DatabaseContext,
  planning: Pick<PlanningDatabase, 'listScheduleBlocksForRange' | 'getPlannedContextForTimestamp'>
): DayViewDatabase {
  if (!context.database) {
    throw new Error('Database not initialized')
  }

  const selectMinuteRowsInRangeStatement = context.database.prepare(`
    SELECT
      minute_timestamp,
      summary_status,
      winning_app,
      winning_title,
      dominance,
      afk,
      needs_review,
      window_events_json
    FROM minute_ingest
    WHERE minute_timestamp >= ?
      AND minute_timestamp < ?
    ORDER BY minute_timestamp ASC
  `)
  const selectClassificationRowsInRangeStatement = context.database.prepare(`
    SELECT
      id,
      minute_timestamp,
      planned_block_id,
      on_task,
      confidence,
      reasoning,
      corrected,
      created_at
    FROM classifications
    WHERE minute_timestamp >= ?
      AND minute_timestamp < ?
    ORDER BY minute_timestamp ASC, corrected DESC, created_at DESC, id DESC
  `)

  function getSlotsForRange(
    startAtInput: string,
    endAtInput: string
  ): {
    slots: MinuteSlot[]
    plannedBlocks: PlannedBlock[]
  } {
    const startAt = ensureIsoTimestamp(startAtInput, 'startAt')
    const endAt = ensureIsoTimestamp(endAtInput, 'endAt')
    const startDate = floorToMinute(new Date(startAt))
    const endDate = ceilToMinute(new Date(endAt))
    const alignedStartAt = startDate.toISOString()
    const alignedEndAt = endDate.toISOString()
    const minuteRows = selectMinuteRowsInRangeStatement.all(
      alignedStartAt,
      alignedEndAt
    ) as MinuteIngestDayRow[]
    const classifications = selectClassificationRowsInRangeStatement.all(
      alignedStartAt,
      alignedEndAt
    ) as ClassificationChoiceRow[]
    const plannedBlocks = planning.listScheduleBlocksForRange({ startAt, endAt })

    return {
      slots: buildMinuteSlotsForRange(
        startDate,
        endDate,
        new Map(minuteRows.map((row) => [normalizeTimestamp(row.minute_timestamp), row])),
        choosePreferredClassifications(classifications),
        plannedBlocks
      ),
      plannedBlocks
    }
  }

  function getDayViewData(input: {
    date: string
    aggregationMinutes: AggregationWindowMinutes
  }): DayViewData {
    const bounds = getLocalDayBounds(input.date)
    const { slots, plannedBlocks } = getSlotsForRange(bounds.startAt, bounds.endAt)

    return {
      date: input.date,
      aggregationMinutes: input.aggregationMinutes,
      plannedBlocks,
      activitySlices: mergeAdjacentBuckets(buildBuckets(slots, input.aggregationMinutes))
    }
  }

  function getActivityEvidence(input: {
    startAt: string
    endAt: string
    aggregationMinutes: AggregationWindowMinutes
  }): ActivityEvidence {
    const { slots, plannedBlocks } = getSlotsForRange(input.startAt, input.endAt)
    const nonGapSlots = slots.filter((slot) => slot.kind !== 'gap')
    const representativeSlot =
      nonGapSlots[nonGapSlots.length - 1] ?? slots[slots.length - 1] ?? null
    const plannedBlock = representativeSlot?.plannedBlockId
      ? (plannedBlocks.find((block) => block.id === representativeSlot.plannedBlockId) ?? null)
      : null

    const minutes: ActivityEvidenceMinute[] = slots.map((slot) => ({
      minuteTimestamp: slot.minuteTimestamp,
      summaryStatus: slot.summaryStatus,
      app: slot.app,
      title: slot.title,
      windowTitles: slot.windowTitles,
      dominance: slot.dominance,
      afk: slot.afk,
      onTask: slot.onTask,
      confidence: slot.confidence,
      reasoning: slot.reasoning
    }))

    return {
      sliceId: getActivitySliceId(
        ensureIsoTimestamp(input.startAt, 'startAt'),
        ensureIsoTimestamp(input.endAt, 'endAt'),
        input.aggregationMinutes
      ),
      startAt: ensureIsoTimestamp(input.startAt, 'startAt'),
      endAt: ensureIsoTimestamp(input.endAt, 'endAt'),
      plannedBlock,
      summary: {
        kind: representativeSlot?.kind ?? 'gap',
        app: representativeSlot?.app ?? null,
        title: representativeSlot?.title ?? null,
        onTask: representativeSlot?.onTask ?? null,
        confidence: representativeSlot?.confidence ?? null,
        reasoning: representativeSlot?.reasoning ?? null
      },
      minutes
    }
  }

  function getCoachingSnapshot(input?: { referenceTime?: string }): CoachingSnapshot {
    const referenceTime = ensureIsoTimestamp(
      input?.referenceTime ?? new Date().toISOString(),
      'referenceTime'
    )
    const activeBlock = planning.getPlannedContextForTimestamp(referenceTime)
    if (!activeBlock) {
      return {
        activeBlock: null,
        recentMinutes: []
      }
    }

    const { slots } = getSlotsForRange(activeBlock.startAt, referenceTime)
    const recentMinutes = slots
      .filter((slot) => slot.minuteTimestamp < referenceTime)
      .filter((slot) => slot.plannedBlockId === String(activeBlock.blockId))
      .filter((slot) => slot.afk || slot.onTask !== null)
      .slice(-5)
      .map((slot) => ({
        minuteTimestamp: slot.minuteTimestamp,
        afk: slot.afk,
        onTask: slot.onTask,
        confidence: slot.confidence,
        reasoning: slot.reasoning
      }))

    return {
      activeBlock,
      recentMinutes
    }
  }

  return {
    getDayViewData,
    getActivityEvidence,
    getCoachingSnapshot
  }
}
