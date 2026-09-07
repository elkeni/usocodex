import { FaMusic } from 'react-icons/fa';

export default function AuthLayout({ eyebrow, title, description, children, footer, mode }) {
  return (
    <main className={`auth-page auth-page--${mode}`}>
      <section className="auth-card" aria-labelledby={`auth-${mode}-title`}>
        <div className="auth-brand">
          <span className="auth-brand__mark" aria-hidden="true"><FaMusic /></span>
          <span>PARADISQUO</span>
        </div>
        <header className="auth-card__header">
          <p className="auth-card__eyebrow">{eyebrow}</p>
          <h1 id={`auth-${mode}-title`}>{title}</h1>
          {description && <p>{description}</p>}
        </header>
        {children}
        {footer}
      </section>
    </main>
  );
}
