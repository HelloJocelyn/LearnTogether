import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { joinMeeting, meetingWebSocketUrl } from '../api'
import { createMeshMeetingSession } from '../webrtc/meetingMesh'
import { useI18n } from '../i18n'

type MeetingLocationState = {
  clientId?: string
  room_id?: string
  is_host?: boolean
  ice_servers?: RTCIceServer[]
  displayName?: string
}

export default function WebRTCMeeting() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? null) as MeetingLocationState | null

  const [clientId] = useState(() => state?.clientId ?? crypto.randomUUID())
  const displayName = useMemo(() => {
    const q = new URLSearchParams(location.search).get('displayName')?.trim()
    return (state?.displayName ?? q ?? '').trim()
  }, [location.search, state?.displayName])

  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteWrapRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logLines, setLogLines] = useState<string[]>([])
  const [isHost, setIsHost] = useState(false)
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'ended'>('idle')

  const remoteStreamsRef = useRef(new Map<string, HTMLVideoElement>())

  useEffect(() => {
    let mesh: { close: () => void } | null = null
    let stream: MediaStream | null = null
    let cancelled = false

    async function run() {
      setError(null)
      setStatus('connecting')
      try {
        let roomId = state?.room_id
        let iceServers = state?.ice_servers
        let host = state?.is_host ?? false
        if (!roomId || !iceServers) {
          const j = await joinMeeting(clientId, displayName || undefined)
          if (cancelled) return
          roomId = j.room_id
          iceServers = j.ice_servers
          host = j.is_host
        }
        if (cancelled) return
        setIsHost(Boolean(host))

        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (cancelled) {
          for (const tr of stream.getTracks()) tr.stop()
          return
        }
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
          await localVideoRef.current.play().catch(() => {})
        }

        const wsUrl = meetingWebSocketUrl(roomId, clientId)
        mesh = createMeshMeetingSession(wsUrl, clientId, iceServers, stream, {
          onRemoteStream: (peerId, remoteStream) => {
            if (cancelled) return
            const wrap = remoteWrapRef.current
            if (!wrap) return
            let vid = remoteStreamsRef.current.get(peerId)
            if (!vid) {
              vid = document.createElement('video')
              vid.autoplay = true
              vid.playsInline = true
              vid.className = 'meetingRemoteVideo'
              vid.dataset.peer = peerId
              wrap.appendChild(vid)
              remoteStreamsRef.current.set(peerId, vid)
            }
            vid.srcObject = remoteStream
          },
          onRemoteGone: (peerId) => {
            const vid = remoteStreamsRef.current.get(peerId)
            if (vid) {
              vid.remove()
              remoteStreamsRef.current.delete(peerId)
            }
          },
          onLog: (msg) => {
            if (!cancelled) setLogLines((prev) => [...prev.slice(-40), msg])
          },
        })
        if (cancelled) {
          mesh.close()
          mesh = null
          return
        }
        setStatus('live')
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setStatus('ended')
        }
      }
    }

    void run()
    return () => {
      cancelled = true
      mesh?.close()
      for (const v of remoteStreamsRef.current.values()) {
        v.remove()
      }
      remoteStreamsRef.current.clear()
      if (stream) {
        for (const tr of stream.getTracks()) tr.stop()
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = null
    }
  }, [clientId, displayName, state?.ice_servers, state?.is_host, state?.room_id])

  return (
    <div className="page">
      <header className="header">
        <div className="titleRow">
          <h1 className="title">{t('meeting.title')}</h1>
        </div>
        <div className="muted">
          <Link to="/">{t('common.back')}</Link>
        </div>
      </header>

      <main className="main meetingMain">
        {isHost ? <p className="muted meetingHostBanner">{t('meeting.hostBanner')}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {status === 'connecting' ? <p className="muted">{t('meeting.connecting')}</p> : null}

        <div className="meetingVideoLayout">
          <div className="meetingLocalWrap">
            <video ref={localVideoRef} className="meetingLocalVideo" muted playsInline autoPlay />
            <div className="muted meetingLabel">{t('meeting.you')}</div>
          </div>
          <div ref={remoteWrapRef} className="meetingRemoteGrid" />
        </div>

        <p className="muted meetingHint">{t('meeting.meshHint')}</p>

        <button type="button" className="secondary" onClick={() => navigate('/')}>
          {t('meeting.leave')}
        </button>

        {logLines.length > 0 ? (
          <details className="meetingLog" style={{ marginTop: 16 }}>
            <summary className="muted">{t('meeting.debugLog')}</summary>
            <pre className="meetingLogPre">{logLines.join('\n')}</pre>
          </details>
        ) : null}
      </main>
    </div>
  )
}
