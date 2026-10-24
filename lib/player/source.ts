import { offlineAudioUrl } from "./offline-audio";

/**
 * Where a playlist song plays from. With a connection: its presigned S3 URL,
 * so nothing goes through the service worker (on iPhone, a service worker
 * busy streaming audio can stall the page's other requests). The copy kept
 * on this device is used when offline, or if the network URL fails.
 * Songs already pointing at the device copy (the /offline page) stay there.
 */
export function pickSource(
  track: { id: string; src: string },
  state: { online: boolean; kept: boolean; failed: boolean },
): string {
  if (track.src.startsWith("/offline-audio/")) return track.src;
  if (state.kept && (!state.online || state.failed)) return offlineAudioUrl(track.id);
  return track.src;
}
