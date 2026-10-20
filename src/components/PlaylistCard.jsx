import { Play, ArrowUpRight } from 'lucide-react';

export default function PlaylistCard({ playlist, onClick, compact = false }) {
  return (
    <button className={`playlist-card ${compact ? 'playlist-card-compact' : ''}`} onClick={() => onClick(playlist.id)}>
      <span className="playlist-art-wrap">
        <img className="playlist-art" src={playlist.cover} alt="" loading="lazy" />
        <span className="playlist-art-shade" />
        <span className="playlist-play"><Play size={17} fill="currentColor" /></span>
        {playlist.badge && <span className="playlist-badge">{playlist.badge}</span>}
      </span>
      <span className="playlist-card-copy">
        <span className="playlist-card-title">{playlist.title}</span>
        <span className="playlist-card-subtitle">{playlist.subtitle}</span>
      </span>
      <span className="playlist-card-arrow"><ArrowUpRight size={15} /></span>
    </button>
  );
}
