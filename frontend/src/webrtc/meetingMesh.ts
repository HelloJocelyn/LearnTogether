/**
 * Mesh WebRTC: each peer connects to every other peer via server-relayed SDP/ICE.
 * Swap signaling for SFU-specific messages when you plug in your media server.
 */

export type SignalPayload =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'ice'; candidate: RTCIceCandidateInit }

export type MeshMeetingCallbacks = {
  onRemoteStream: (peerId: string, stream: MediaStream) => void
  onRemoteGone: (peerId: string) => void
  onLog?: (msg: string) => void
}

function log(cb: MeshMeetingCallbacks | undefined, msg: string) {
  cb?.onLog?.(msg)
}

export function createMeshMeetingSession(
  wsUrl: string,
  selfId: string,
  iceServers: RTCIceServer[],
  localStream: MediaStream,
  callbacks: MeshMeetingCallbacks,
) {
  const peers = new Map<string, RTCPeerConnection>()
  let ws: WebSocket | null = null
  let closed = false

  function shouldInitiate(remoteId: string) {
    return selfId < remoteId
  }

  function getPc(peerId: string): RTCPeerConnection {
    let pc = peers.get(peerId)
    if (pc) return pc
    pc = new RTCPeerConnection({ iceServers })
    for (const t of localStream.getTracks()) {
      pc.addTrack(t, localStream)
    }
    pc.ontrack = (ev) => {
      if (ev.streams[0]) callbacks.onRemoteStream(peerId, ev.streams[0])
    }
    pc.onicecandidate = (ev) => {
      if (!ev.candidate || !ws || ws.readyState !== WebSocket.OPEN) return
      const payload: SignalPayload = { type: 'ice', candidate: ev.candidate.toJSON() }
      ws.send(JSON.stringify({ type: 'signal', to: peerId, payload }))
    }
    peers.set(peerId, pc)
    return pc
  }

  async function connectToPeer(peerId: string) {
    if (peerId === selfId || closed) return
    const pc = getPc(peerId)
    if (!shouldInitiate(peerId)) return
    if (pc.signalingState !== 'stable') return
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(
      JSON.stringify({
        type: 'signal',
        to: peerId,
        payload: { type: 'offer', sdp: offer.sdp ?? '' } satisfies SignalPayload,
      }),
    )
  }

  async function handleSignal(from: string, payload: SignalPayload) {
    if (from === selfId || closed) return
    const pc = getPc(from)
    try {
      if (payload.type === 'offer') {
        await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp })
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'signal',
              to: from,
              payload: { type: 'answer', sdp: answer.sdp ?? '' } satisfies SignalPayload,
            }),
          )
        }
      } else if (payload.type === 'answer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp })
      } else if (payload.type === 'ice' && payload.candidate) {
        await pc.addIceCandidate(payload.candidate)
      }
    } catch (e) {
      log(callbacks, `Signal error with ${from}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  function closePeer(peerId: string) {
    const pc = peers.get(peerId)
    if (pc) {
      pc.close()
      peers.delete(peerId)
    }
    callbacks.onRemoteGone(peerId)
  }

  function syncRoster(ids: string[]) {
    const set = new Set(ids)
    for (const id of peers.keys()) {
      if (!set.has(id)) closePeer(id)
    }
    for (const id of ids) {
      if (id !== selfId) void connectToPeer(id)
    }
  }

  ws = new WebSocket(wsUrl)
  ws.onopen = () => log(callbacks, 'Signaling connected')
  ws.onmessage = (ev) => {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(ev.data as string) as Record<string, unknown>
    } catch {
      return
    }
    const type = msg.type as string
    if (type === 'welcome' || type === 'peer-joined') {
      const roster = msg.roster as string[] | undefined
      if (roster) syncRoster(roster)
    }
    if (type === 'peer-left') {
      const left = msg.client_id as string | undefined
      if (left) closePeer(left)
      const roster = msg.roster as string[] | undefined
      if (roster) syncRoster(roster)
    }
    if (type === 'signal') {
      const from = msg.from as string
      const payload = msg.payload as SignalPayload
      if (from && payload) void handleSignal(from, payload)
    }
  }
  ws.onerror = () => log(callbacks, 'WebSocket error')
  ws.onclose = () => log(callbacks, 'WebSocket closed')

  function close() {
    if (closed) return
    closed = true
    try {
      ws?.close()
    } catch {
      /* ignore */
    }
    ws = null
    for (const id of [...peers.keys()]) {
      closePeer(id)
    }
  }

  return { close }
}
