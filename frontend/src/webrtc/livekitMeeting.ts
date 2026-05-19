/**
 * LiveKit SFU session: each client connects to the media server (not peer-to-peer).
 */

import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type LocalParticipant,
  type RemoteParticipant,
  type RemoteTrackPublication,
} from 'livekit-client'

export type LivekitMeetingCallbacks = {
  onRemoteMedia: (participantId: string, element: HTMLMediaElement) => void
  onRemoteGone: (participantId: string) => void
  onLog?: (msg: string) => void
  onConnectionState?: (state: ConnectionState) => void
}

function log(cb: LivekitMeetingCallbacks | undefined, msg: string) {
  cb?.onLog?.(msg)
}

function attachRemoteVideo(
  participant: RemoteParticipant,
  publication: RemoteTrackPublication,
  callbacks: LivekitMeetingCallbacks,
) {
  const track = publication.track
  if (!track || track.kind !== Track.Kind.Video) return
  const el = track.attach()
  el.dataset.peer = participant.identity
  callbacks.onRemoteMedia(participant.identity, el)
}

function attachExistingRemote(
  room: Room,
  callbacks: LivekitMeetingCallbacks,
) {
  for (const participant of room.remoteParticipants.values()) {
    for (const publication of participant.trackPublications.values()) {
      if (publication.isSubscribed) {
        attachRemoteVideo(participant, publication, callbacks)
      }
    }
  }
}

export async function connectLivekitMeeting(
  livekitUrl: string,
  token: string,
  localVideoEl: HTMLVideoElement,
  callbacks: LivekitMeetingCallbacks,
) {
  const room = new Room()
  let closed = false

  room.on(RoomEvent.ConnectionStateChanged, (state) => {
    log(callbacks, `Connection: ${state}`)
    callbacks.onConnectionState?.(state)
  })

  room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
    if (track.kind === Track.Kind.Video) {
      const el = track.attach()
      el.dataset.peer = participant.identity
      callbacks.onRemoteMedia(participant.identity, el)
    }
  })

  room.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
    track.detach()
    const hasVideo = [...participant.trackPublications.values()].some(
      (p) => p.kind === Track.Kind.Video && p.isSubscribed,
    )
    if (!hasVideo) callbacks.onRemoteGone(participant.identity)
  })

  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    callbacks.onRemoteGone(participant.identity)
  })

  function attachLocalVideo(participant: LocalParticipant) {
    const pub = participant.getTrackPublication(Track.Source.Camera)
    const track = pub?.videoTrack
    if (track) track.attach(localVideoEl)
  }

  room.on(RoomEvent.LocalTrackPublished, (publication) => {
    if (publication.source === Track.Source.Camera && publication.videoTrack) {
      publication.videoTrack.attach(localVideoEl)
    }
  })

  await room.connect(livekitUrl, token)
  if (closed) {
    room.disconnect()
    return { close: () => {} }
  }

  attachExistingRemote(room, callbacks)
  await room.localParticipant.setCameraEnabled(true)
  await room.localParticipant.setMicrophoneEnabled(true)
  attachLocalVideo(room.localParticipant)
  log(callbacks, `Joined room ${room.name} as ${room.localParticipant.identity}`)

  function close() {
    if (closed) return
    closed = true
    room.disconnect()
  }

  return { close, room }
}
