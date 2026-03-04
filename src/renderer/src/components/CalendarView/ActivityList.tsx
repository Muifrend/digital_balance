import { useMemo, type JSX } from 'react'
import type { ActivityEvent, ClassificationEntry } from './types'

interface ActivityListProps {
  activities: ActivityEvent[]
  classifications: ClassificationEntry[]
}

function toTimestamp(value: string): number {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function findClosestClassification(
  activity: ActivityEvent,
  classifications: ClassificationEntry[]
): ClassificationEntry | null {
  if (classifications.length === 0) return null

  const activityTime = toTimestamp(activity.timestamp)
  let closest = classifications[0]
  let minDelta = Math.abs(activityTime - toTimestamp(closest.timestamp))

  for (let index = 1; index < classifications.length; index += 1) {
    const candidate = classifications[index]
    const delta = Math.abs(activityTime - toTimestamp(candidate.timestamp))
    if (delta < minDelta) {
      closest = candidate
      minDelta = delta
    }
  }

  return closest
}

function getBadgeColor(classification: ClassificationEntry | null): string {
  if (!classification) return '#9ca3af'
  return classification.onGoal ? '#22c55e' : '#ef4444'
}

function formatTimestamp(timestamp: string): string {
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) return timestamp
  return parsed.toLocaleString()
}

export default function ActivityList({
  activities,
  classifications
}: ActivityListProps): JSX.Element {
  const sortedActivities = useMemo(
    () => [...activities].sort((a, b) => toTimestamp(b.timestamp) - toTimestamp(a.timestamp)),
    [activities]
  )

  return (
    <aside
      style={{
        width: 300,
        minWidth: 300,
        maxWidth: 300,
        height: '100%',
        overflowY: 'auto',
        borderRight: '1px solid #e5e7eb',
        boxSizing: 'border-box',
        padding: 12
      }}
    >
      {sortedActivities.map((activity, index) => {
        const classification = findClosestClassification(activity, classifications)
        return (
          <div
            key={`${activity.id}-${activity.timestamp}-${index}`}
            style={{
              borderBottom: '1px solid #e5e7eb',
              padding: '8px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: getBadgeColor(classification),
                flexShrink: 0
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div>{activity.app || 'Unknown App'}</div>
              <div
                title={activity.title}
                style={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {activity.title || 'Untitled Window'}
              </div>
              <div style={{ color: '#6b7280' }}>{formatTimestamp(activity.timestamp)}</div>
            </div>
          </div>
        )
      })}
    </aside>
  )
}
