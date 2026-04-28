import type { RunEvent } from '../../../../../../packages/shared/src'
import { formatRelativeTimestamp } from '../../utils/formatting'
import { describeRunEvent } from '../../utils/run-events'

export function RecentSignals({ recentEvents }: { recentEvents: RunEvent[] }) {
  return (
    <div className="sidebar-section sidebar-collapsible-content">
      <h2>Recent Signals</h2>
      <ul className="event-list">
        {recentEvents.length > 0 ? (
          recentEvents.map((event) => {
            const description = describeRunEvent(event)

            return (
              <li key={event.id} className="event-list-item">
                <div>
                  <strong>{description.title}</strong>
                  <small>{event.runId.slice(0, 8)}</small>
                </div>
                <small>{formatRelativeTimestamp(event.timestamp)}</small>
              </li>
            )
          })
        ) : (
          <li>No signals yet.</li>
        )}
      </ul>
    </div>
  )
}
