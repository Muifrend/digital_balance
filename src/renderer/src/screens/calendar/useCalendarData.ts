import { useCallback, useEffect, useRef, useState } from 'react'
import type { AggregationWindowMinutes, DayViewData } from '../../../../shared/calendar'

type CalendarDataState = {
  data: DayViewData | null
  loading: boolean
  error: string | null
}

export function useCalendarData(
  date: string,
  aggregationMinutes: AggregationWindowMinutes
): CalendarDataState & { refetch: () => void } {
  const [state, setState] = useState<CalendarDataState>({
    data: null,
    loading: true,
    error: null
  })

  // Keep a ref to the latest date so the onChanged listener always compares
  // against the currently viewed date without needing to re-subscribe.
  const dateRef = useRef(date)
  dateRef.current = date

  const fetch = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }))
    void window.api.calendar
      .getDay({ date, aggregationMinutes })
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        setState((s) => ({ ...s, loading: false, error: msg }))
      })
  }, [date, aggregationMinutes])

  // Refetch whenever date or aggregation changes.
  useEffect(() => {
    fetch()
  }, [fetch])

  // Refetch when the main process signals a change to the viewed date.
  useEffect(() => {
    const unsubscribe = window.api.calendar.onChanged((changedDate) => {
      if (changedDate === dateRef.current) {
        fetch()
      }
    })
    return unsubscribe
  }, [fetch])

  return { ...state, refetch: fetch }
}
