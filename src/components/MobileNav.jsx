import { House, Compass, LibraryBig, ListMusic } from 'lucide-react';

const items = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'discover', label: 'Discover', icon: Compass },
  { id: 'library', label: 'Library', icon: LibraryBig },
  { id: 'playlists', label: 'Playlists', icon: ListMusic },
];

export default function MobileNav({ activePage, onNavigate }) {
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {items.map(({ id, label, icon: Icon }) => (
        <button key={id} className={activePage === id ? 'active' : ''} onClick={() => onNavigate(id)}>
          <Icon size={19} strokeWidth={1.9} /><span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
