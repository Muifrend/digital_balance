import { type JSX, type RefObject } from 'react'
import moment from 'moment'
import { Calendar, Views, momentLocalizer } from 'react-big-calendar'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import type { ClassificationEntry } from './types'

interface ClassificationCalendarProps {
  classifications: ClassificationEntry[]
  date: Date
  onNavigate: (date: Date) => void
  containerRef: RefObject<HTMLDivElement | null>
}

const localizer = momentLocalizer(moment)

export default function ClassificationCalendar({
  classifications: _classifications,
  date,
  onNavigate,
  containerRef
}: ClassificationCalendarProps): JSX.Element {
  return (
    <section ref={containerRef} style={{ flex: 1, height: '100%', padding: 12, boxSizing: 'border-box' }}>
      <Calendar
        localizer={localizer}
        date={date}
        onNavigate={onNavigate}
        events={[]}
        defaultView={Views.DAY}
        views={[Views.DAY]}
        step={15}
        timeslots={1}
        scrollToTime={new Date()}
        startAccessor="start"
        endAccessor="end"
        style={{ height: '100%' }}
      />
    </section>
  )
}
