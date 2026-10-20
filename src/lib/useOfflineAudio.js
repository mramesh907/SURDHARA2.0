import { useSyncExternalStore } from 'react';
import { getOfflineAudioSnapshot, subscribeOfflineAudio } from './offlineAudio.js';

export function useOfflineAudio() {
  return useSyncExternalStore(subscribeOfflineAudio, getOfflineAudioSnapshot, getOfflineAudioSnapshot);
}
