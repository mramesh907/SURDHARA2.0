import { useEffect } from 'react';
import { CheckCircle2, LogOut, ShieldCheck, UserRound, X } from 'lucide-react';

function getDisplayName(user) {
  if (!user) return '';
  const metadata = user.user_metadata || {};
  return metadata.full_name || metadata.name || metadata.user_name || user.email?.split('@')[0] || 'Listener';
}

function getAvatar(user) {
  const metadata = user?.user_metadata || {};
  return metadata.avatar_url || metadata.picture || metadata.photo_url || '';
}

export default function ProfileAuthModal({
  open,
  user,
  role = 'guest',
  configured = false,
  loading = false,
  roleError = '',
  authError = '',
  onClose,
  onSignIn,
  onSignOut,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const displayName = getDisplayName(user);
  const avatar = getAvatar(user);

  return (
    <div className="modal-scrim profile-auth-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section className="create-playlist-modal profile-auth-modal" role="dialog" aria-modal="true" aria-labelledby="profile-auth-title">
        <button type="button" className="modal-close icon-button" onClick={onClose} aria-label="Close profile"><X size={18} /></button>
        <span className="modal-icon"><UserRound size={22} /></span>
        <span className="section-eyebrow">YOUR SURDHARA ACCOUNT</span>
        <h2 id="profile-auth-title">{user ? 'Your profile' : 'Sign in to SURDHARA'}</h2>
        <p>{user ? 'Your account and Admin/User role are verified through Supabase. Your liked songs, recent listening and personal playlists are stored privately with this account.' : 'Sign in to keep your music preferences connected to your account across devices.'}</p>

        {loading ? (
          <div className="profile-auth-status" role="status">Checking your account…</div>
        ) : user ? (
          <div className="profile-account-card">
            <div className="profile-account-avatar">
              {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : <span>{displayName.slice(0, 1).toUpperCase()}</span>}
            </div>
            <div className="profile-account-copy"><strong>{displayName}</strong><span>{user.email || 'Signed-in account'}</span></div>
            <span className={`profile-role-pill ${role === 'admin' ? 'is-admin' : ''}`}>{role === 'admin' ? <ShieldCheck size={13} /> : <UserRound size={12} />}{role === 'admin' ? 'Admin' : 'User'}</span>
            {role === 'admin' && <div className="profile-role-note"><CheckCircle2 size={15} /> Admin account detected. You can publish songs and manage shared metadata after the cloud setup is complete.</div>}
            {roleError && <div className="profile-setup-note">Account role setup is incomplete. Run <code>supabase/phase1-auth.sql</code> in your Supabase SQL Editor, then assign your account the admin role.</div>}
            {role === 'user' && !roleError && <div className="profile-auth-footnote">This is a standard user account. To grant site-owner access, assign the Admin role in Supabase SQL Editor as described in the included setup guide.</div>}
            <div className="modal-actions profile-auth-actions"><button type="button" className="subtle-button" onClick={onClose}>Close</button><button type="button" className="primary-button" onClick={onSignOut}><LogOut size={15} /> Sign out</button></div>
          </div>
        ) : (
          <div className="profile-auth-content">
            <button type="button" className="auth-provider-button auth-google-button" disabled={!configured} onClick={() => onSignIn?.('google')}>
              <span className="auth-provider-mark google-mark" aria-hidden="true">G</span><span>Continue with Google</span>
            </button>
            <button type="button" className="auth-provider-button auth-facebook-button" disabled={!configured} onClick={() => onSignIn?.('facebook')}>
              <span className="auth-provider-mark facebook-mark" aria-hidden="true">f</span><span>Continue with Facebook</span>
            </button>
            {!configured && <div className="profile-setup-note"><strong>Login setup required</strong><span>Add your Supabase Project URL and Publishable Key to <code>.env.local</code>, then enable Google and Facebook providers in Supabase. The setup guide is included with this project.</span></div>}
            {configured && <div className="profile-auth-footnote">Your personal likes, listening history and playlists sync to this account when the Phase 3 database setup is complete. Shared music publishing and Admin tools require the Phase 2–3 cloud setup.</div>}
            {authError && <div className="profile-auth-error" role="alert">{authError}</div>}
          </div>
        )}
        {role === 'admin' && !roleError && <div className="profile-auth-footnote">Admin permissions must also be enforced by Supabase database and storage policies. Hiding a button alone is not a security boundary.</div>}
      </section>
    </div>
  );
}
