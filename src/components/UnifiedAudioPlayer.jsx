import { forwardRef } from 'react';
import YouTubeInlinePlayer from './YouTubeInlinePlayer.jsx';
import LocalAudioPlayer from './LocalAudioPlayer.jsx';

const UnifiedAudioPlayer = forwardRef(function UnifiedAudioPlayer(props, ref) {
  const isLocal = props.track?.sourceType === 'local' || Boolean(props.track?.audioUrl);
  return isLocal ? <LocalAudioPlayer {...props} ref={ref} /> : <YouTubeInlinePlayer {...props} ref={ref} />;
});

export default UnifiedAudioPlayer;
