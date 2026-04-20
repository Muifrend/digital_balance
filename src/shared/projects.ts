export const PROJECTS_LIST_CHANNEL = 'projects:list'
export const PROJECTS_CREATE_CHANNEL = 'projects:create'
export const PROJECTS_UPDATE_CHANNEL = 'projects:update'
export const PROJECTS_ARCHIVE_CHANNEL = 'projects:archive'
export const PROJECTS_CRITIQUE_DESCRIPTION_CHANNEL = 'projects:critiqueDescription'

export type ProjectDescriptionCritiqueVerdict = 'sufficient' | 'needs_detail'

export type ProjectDescriptionCritique = {
  verdict: ProjectDescriptionCritiqueVerdict
  feedback: string
}

export type ProjectRecord = {
  id: string
  name: string
  description: string | null
  color: string | null
  archived: boolean
  createdAt: string
  updatedAt: string
}

export type ProjectsApi = {
  list: () => Promise<ProjectRecord[]>
  create: (input: {
    name: string
    description: string | null
    color: string | null
  }) => Promise<ProjectRecord>
  update: (input: {
    id: string
    name: string
    description: string | null
    color: string | null
  }) => Promise<ProjectRecord>
  archive: (input: { id: string; archived: boolean }) => Promise<void>
  critiqueDescription: (input: {
    name: string
    description: string
  }) => Promise<ProjectDescriptionCritique>
}
