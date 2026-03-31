import { useMemo } from 'react'
import { QRCodeCanvas } from 'qrcode.react'

export default function Settings() {
  const joinUrl = useMemo(() => `${window.location.origin}/join`, [])

  return (
    <div className="page">
      <main className="main">
        <section className="card">
          <h2>Settings</h2>
          <p className="muted">
            Settings page is ready for future options.
          </p>
        </section>

        <details className="card" open={false}>
          <summary className="shareSummary">
            <span>Share this site (QR)</span>
            <span className="muted">collapsed</span>
          </summary>
          <div className="shareBody">
            <p className="muted">
              This QR code is for you to share the join page with others.
            </p>
            <div className="qrWrap">
              <QRCodeCanvas value={joinUrl} size={220} includeMargin />
            </div>
            <p className="muted">
              Link: <a href="/join">{joinUrl}</a>
            </p>
          </div>
        </details>
      </main>
    </div>
  )
}
