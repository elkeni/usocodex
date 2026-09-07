import { FaHeadphones, FaMusic, FaPlay } from 'react-icons/fa';

export default function AuthLayout({ eyebrow, title, description, children, footer, mode }) {
  return (
    <div className="auth-page">
      <aside className="auth-showcase" aria-label="ParadisQuo">
        <video className="auth-showcase__video" autoPlay loop muted playsInline aria-hidden="true">
          <source src="https://cdn.pixabay.com/video/2025/03/30/268620_large.mp4" type="video/mp4" />
        </video>
        <div className="auth-showcase__veil" />
        <div className="auth-brand"><span className="auth-brand__mark" aria-hidden="true"><FaMusic /></span><span>PARADISQUO</span></div>
        <div className="auth-showcase__copy">
          <span className="auth-showcase__kicker"><FaHeadphones aria-hidden="true" /> Tu espacio musical</span>
          <h2>Todo lo que escuchas,<br />en un solo lugar.</h2>
          <p>Descubre artistas, guarda tus favoritos y crea playlists que se adaptan a ti.</p>
          <div className="auth-showcase__now-playing" aria-hidden="true"><span className="auth-showcase__play"><FaPlay /></span><span><b>Tu música, a tu manera</b><small>ParadisQuo</small></span><i /><i /><i /></div>
        </div>
      </aside>
      <main className={`auth-panel auth-panel--${mode}`}>
        <div className="auth-panel__mobile-brand auth-brand"><span className="auth-brand__mark" aria-hidden="true"><FaMusic /></span><span>PARADISQUO</span></div>
        <section className="auth-card" aria-labelledby={`auth-${mode}-title`}>
          <header className="auth-card__header"><p className="auth-card__eyebrow">{eyebrow}</p><h1 id={`auth-${mode}-title`}>{title}</h1><p>{description}</p></header>
          {children}
          {footer}
        </section>
      </main>
    </div>
  );
}
