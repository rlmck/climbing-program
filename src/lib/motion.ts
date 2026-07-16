import gsap from 'gsap';

// All motion is decorative — every helper is a no-op when the user asks for
// reduced motion, and every tween clears its inline styles so dnd-kit's own
// transforms never fight leftover GSAP state.

function prefersReduced(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Stagger-rise the elements matching `selector` inside `root`. */
export function riseIn(root: HTMLElement | null, selector = '[data-rise]'): void {
  if (!root || prefersReduced()) return;
  const targets = root.querySelectorAll(selector);
  if (targets.length === 0) return;
  gsap.fromTo(
    targets,
    { autoAlpha: 0, y: 14 },
    { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power3.out', stagger: 0.045, clearProps: 'all', overwrite: 'auto' },
  );
}

/** Count a numeric readout up to `value`; the tween owns the element's text. */
export function countUp(el: HTMLElement | null, value: number, format: (v: number) => string): void {
  if (!el) return;
  if (prefersReduced()) {
    el.textContent = format(value);
    return;
  }
  const state = { v: 0 };
  gsap.to(state, {
    v: value,
    duration: 0.8,
    ease: 'power3.out',
    onUpdate: () => {
      el.textContent = format(state.v);
    },
  });
}

/** Slow breathing pulse (for the current-week bolt). Returns a cleanup. */
export function breathe(el: HTMLElement | null): () => void {
  if (!el || prefersReduced()) return () => {};
  const tween = gsap.to(el, {
    scale: 1.25,
    duration: 1.4,
    ease: 'sine.inOut',
    repeat: -1,
    yoyo: true,
  });
  return () => {
    tween.kill();
    gsap.set(el, { clearProps: 'all' });
  };
}
