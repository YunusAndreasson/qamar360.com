import { QamarMark } from '#/components/site-chrome'

/** A lunar update as it lands on a lock screen: the app's icon, its name, the title and the line. */
export function NotificationCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="notification" role="img" aria-label={`Notification: ${title}. ${body}`}>
      <span className="notification-icon">
        <QamarMark size={22} />
      </span>
      <div className="notification-text">
        <p className="notification-meta">
          <span>Qamar360</span>
          <span>now</span>
        </p>
        <p className="notification-title">{title}</p>
        <p className="notification-body">{body}</p>
      </div>
    </div>
  )
}
