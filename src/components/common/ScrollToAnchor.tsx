import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Ensures smooth anchor scrolling and form targeting across all route transitions.
 * When a hash exists (for example #pricing-plans or #contact-form), it finds the element,
 * calculates the sticky header offset, smoothly scrolls to it, and applies a brief visual pulse.
 */
export function ScrollToAnchor() {
  const { pathname, hash, search } = useLocation();

  useEffect(() => {
    if (hash) {
      const targetId = hash.replace('#', '');
      
      // Allow DOM to settle on route transition
      const timer = setTimeout(() => {
        const element = document.getElementById(targetId);
        if (element) {
          const headerOffset = 80;
          const elementPosition = element.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

          window.scrollTo({
            top: Math.max(0, offsetPosition),
            behavior: 'smooth',
          });

          // Focus first interactive element if it's a form or card
          const firstInput = element.querySelector('input, select, textarea, button') as HTMLElement | null;
          if (firstInput && !['BUTTON', 'A'].includes(firstInput.tagName)) {
            firstInput.focus({ preventScroll: true });
          }

          // Apply temporary attention highlight
          element.classList.add('transition-all', 'duration-500');
          element.classList.add('ring-2', 'ring-blue-500', 'ring-offset-4', 'ring-offset-zinc-950');

          const clearHighlight = setTimeout(() => {
            element.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-4', 'ring-offset-zinc-950');
          }, 2000);

          return () => clearTimeout(clearHighlight);
        }
      }, 100);

      return () => clearTimeout(timer);
    } else {
      // Normal page navigation without anchor scrolls to top
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [pathname, hash, search]);

  return null;
}
