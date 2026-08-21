import { memo } from 'react';
import { FaArrowLeft, FaTimes } from 'react-icons/fa';
import './pageHeader.css';

/**
 * PageHeader - A unified header component for screens.
 * 
 * @param {string} title - Main title text (optional).
 * @param {string} subtitle - Subtitle text (optional).
 * @param {boolean} isScrolled - Whether the page is scrolled (triggers glass effect/shadow).
 * @param {Function} onBack - Handler for back button. If provided, renders a back arrow.
 * @param {Function} onClose - Handler for close button. If provided, renders a close "X".
 * @param {ReactNode} children - Content to render inside the header (e.g., Search input, Filters).
 * @param {ReactNode} rightContent - Content to right-align (e.g., Action buttons).
 * @param {string} className - Additional classes.
 * @param {boolean} sticky - Whether the header should be sticky (default: true).
 */
const PageHeader = memo(({
    title,
    subtitle,
    isScrolled = false,
    onBack,
    onClose,
    children,
    rightContent,
    className = '',
    sticky = true
}) => {
    return (
        <header
            className={`
                app-page-header 
                ${isScrolled ? 'is-scrolled' : ''} 
                ${sticky ? 'is-sticky' : ''} 
                ${className}
            `}
        >
            <div className="app-header-main-row">
                <div className="app-header-left">
                    {onBack && (
                        <button className="app-header-nav-btn back-btn" onClick={onBack} aria-label="Go back">
                            <FaArrowLeft />
                        </button>
                    )}
                    {onClose && (
                        <button className="app-header-nav-btn close-btn" onClick={onClose} aria-label="Close">
                            <FaTimes />
                        </button>
                    )}

                    {(title || subtitle) && (
                        <div className={`app-header-titles ${isScrolled ? 'fade-in' : ''}`}>
                            {title && <h1 className="app-header-title">{title}</h1>}
                            {subtitle && <p className="app-header-subtitle">{subtitle}</p>}
                        </div>
                    )}
                </div>

                {rightContent && (
                    <div className="app-header-right">
                        {rightContent}
                    </div>
                )}
            </div>

            {children && (
                <div className="app-header-content-row">
                    {children}
                </div>
            )}

            {/* Gradient Line/Border for scrolled state is handled via CSS */}
        </header>
    );
});

export default PageHeader;
