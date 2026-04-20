import { useCallback, useEffect, useState } from 'react'
import type { DaySummary, WeekSummary } from '../../../../shared/analytics'

type AnalyticsState = {
  day: DaySummary | null
  week: WeekSummary | null
  loading: boolean
  error: string | null
}

export function useAnalyticsData(date: string): AnalyticsState & { refetch: () => void } {
  const [state, setState] = useState<AnalyticsState>({
    day: null,
    week: null,
    loading: true,
    error: null
  })

  const fetch = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }))
    Promise.all([
      window.api.analytics.getDay({ date }),
      window.api.analytics.getWeek({ endDate: date })
    ])
      .then(([day, week]) => setState({ day, week, loading: false, error: null }))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        setState((s) => ({ ...s, loading: false, error: msg }))
      })
  }, [date])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { ...state, refetch: fetch }
}
