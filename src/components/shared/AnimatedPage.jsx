
/**
 * AnimatedPage (Legacy name)
 * Wraps a screen/tab. 
 * Previously provided animations, now simplified for performance.
 * Keeps the component mounted (preserves state) but toggles display.
 */
export const AnimatedPage = ({ children, isActive, className = "", style = {} }) => {
    return (
        <div
            className={`tab-page ${className}`}
            style={{
                ...style,
                // Active page is visible and on top
                // Inactive page is hidden nicely to save reflow costs but keep state
                display: isActive ? 'block' : 'none',
                zIndex: isActive ? 10 : 0
            }}
            aria-hidden={!isActive}
        >
            {children}
        </div>
    );
};

export default AnimatedPage;
