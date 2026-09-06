// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Approved mobile layout isolation', () => {
  it('keeps every desktop rule outside the approved <=767px mobile range', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync(join(import.meta.dirname, 'desktopExperience.css'), 'utf8');
    document.head.append(style);
    try {
      const rules = [...style.sheet.cssRules];
      expect(rules.length).toBeGreaterThan(0);
      for (const rule of rules) {
        // No global selectors, imports or keyframes may leak into mobile.
        expect(rule.type).toBe(CSSRule.MEDIA_RULE);
        const alternatives = rule.conditionText.split(',');
        for (const query of alternatives) {
          const minimum = query.match(/\(min-width:\s*(\d+)px\)/);
          const exclusive = query.match(/\(width\s*>\s*(\d+)px\)/);
          expect(minimum || exclusive, `Unprotected query: ${query}`).not.toBeNull();
          if (minimum) expect(Number(minimum[1])).toBeGreaterThanOrEqual(768);
          else expect(Number(exclusive[1])).toBeGreaterThanOrEqual(767);
        }
      }
    } finally {
      style.remove();
    }
  });
});
