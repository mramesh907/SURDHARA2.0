import { useEffect, useRef } from 'react';
import { Search, Download, ChevronDown, Menu, X, Sun, Moon } from 'lucide-react';

function getProfileName(user, role) {
  if (!user) return 'Sign in';
  const metadata = user.user_metadata || {};
  return role === 'admin'
    ? 'Admin'
    : metadata.full_name || metadata.name || metadata.user_name || user.email?.split('@')[0] || 'Profile';
}

function getAvatarUrl(user) {
  const metadata = user?.user_metadata || {};
  return metadata.avatar_url || metadata.picture || metadata.photo_url || '';
}

function ProfileAvatar({ user, role, mobile = false }) {
  const avatarUrl = getAvatarUrl(user);
  const displayName = getProfileName(user, role);
  const initial = (user ? displayName : 'S').slice(0, 1).toUpperCase();
  return avatarUrl
    ? <img className={`profile-avatar profile-avatar-image${mobile ? ' mobile-avatar' : ''}`} src={avatarUrl} alt="" referrerPolicy="no-referrer" />
    : <span className={`profile-avatar${mobile ? ' mobile-avatar' : ''}`}>{initial}</span>;
}

export default function Header({ query, onQueryChange, onSearchSubmit, onOpenMenu, onOpenProfile, searchOpen, onToggleSearch, theme = 'dark', onToggleTheme, user = null, role = 'guest', canInstall = false, onInstall }) {
  const searchInputRef = useRef(null);
  const profileName = getProfileName(user, role);

  useEffect(() => {
    const handleShortcut = (event) => {
      const target = event.target;
      const tag = target?.tagName?.toLowerCase();
      const isEditable = tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
      if (event.key === '/' && !isEditable && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        if (!searchOpen) onToggleSearch?.();
        window.requestAnimationFrame(() => searchInputRef.current?.focus());
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [onToggleSearch, searchOpen]);

  return (
    <header className="topbar">
      <div className="mobile-topbar-brand">
        <button className="icon-button mobile-menu-button" onClick={onOpenMenu} aria-label="Open menu"><Menu size={21} /></button>
        <div className="mobile-brand"><img src="/surdhara-logo.png" alt="" className="mobile-brand-logo" /><strong>SURDHARA</strong></div>
        <button className="profile-avatar-button" onClick={onOpenProfile} aria-label="Open account and profile"><ProfileAvatar user={user} role={role} mobile /></button>
      </div>

      <form className={`search-box ${searchOpen ? 'search-box-open' : ''}`} onSubmit={(event) => { event.preventDefault(); onSearchSubmit(); }}>
        <Search size={18} strokeWidth={1.9} />
        <input
          ref={searchInputRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search songs, artists, albums..."
          aria-label="Search songs, artists, albums"
        />
        {query && <button type="button" className="search-clear" onClick={() => onQueryChange('')} aria-label="Clear search"><X size={15} /></button>}
        <kbd className="search-shortcut" aria-label="Press slash to focus search">/</kbd>
      </form>

      <div className="topbar-actions">
        <button className="icon-button topbar-search-toggle" onClick={onToggleSearch} aria-label="Open search"><Search size={20} /></button>
        <button
          className="icon-button theme-toggle-button"
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-pressed={theme === 'light'}
        >{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}</button>
        {canInstall && <button className="install-chip" onClick={onInstall} aria-label="Install SURDHARA as an app" title="Install SURDHARA as an app"><Download size={16} /><span>Install app</span></button>}
        <button className="profile-chip" onClick={onOpenProfile} aria-label="Open account and profile">
          <ProfileAvatar user={user} role={role} />
          <span className="profile-name">{profileName}</span>
          <ChevronDown size={15} />
        </button>
      </div>
    </header>
  );
}
