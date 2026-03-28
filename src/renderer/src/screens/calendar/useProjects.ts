import { useCallback, useEffect, useState } from 'react'
import type { ProjectRecord } from '../../../../shared/projects'

type ProjectsState = {
  projects: ProjectRecord[]
  loading: boolean
  error: string | null
}

export function useProjects(): ProjectsState & { refetch: () => void } {
  const [state, setState] = useState<ProjectsState>({
    projects: [],
    loading: true,
    error: null
  })

  const fetch = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }))
    void window.api.projects
      .list()
      .then((projects) => setState({ projects, loading: false, error: null }))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        setState((s) => ({ ...s, loading: false, error: msg }))
      })
  }, [])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { ...state, refetch: fetch }
}
