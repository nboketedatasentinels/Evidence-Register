// Shows a spinner on the button someone just pressed, for as long as the
// request it started is still running, and ignores repeat presses meanwhile.
// Loaded by every page, so no button needs its own loading code.
// A button can opt out with data-no-busy.
(() => {
  const SHOW_AFTER = 150; // ms; quick answers do not flicker
  const LINK_WINDOW = 1000; // ms between the press (or the last answer) and the request
  const pending = new WeakMap();
  let pressed = null;
  let pressedAt = 0;

  const style = document.createElement('style');
  style.textContent = `
    .busy-btn { cursor: progress !important; opacity: .75; }
    .busy-spin {
      display: inline-block; width: 1em; height: 1em; margin-right: .5em; vertical-align: -0.15em;
      border: 2px solid currentColor; border-right-color: transparent; border-radius: 9999px;
      animation: busy-spin .7s linear infinite;
    }
    @keyframes busy-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .busy-spin { animation: none; border-right-color: currentColor; opacity: .6; } }
  `;
  document.head.appendChild(style);

  function remember(element) {
    pressed = element;
    pressedAt = performance.now();
  }

  function stopRepeat(event, button) {
    if (button?.classList.contains('busy-btn')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    }
    return false;
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button, [role="button"]');
    if (!button || button.hasAttribute('data-no-busy')) return;
    if (!stopRepeat(event, button)) remember(button);
  }, true);

  document.addEventListener('submit', (event) => {
    const button = event.submitter || event.target.querySelector('[type="submit"]');
    if (!button || button.hasAttribute('data-no-busy')) return;
    if (!stopRepeat(event, button)) remember(button);
  }, true);

  function start(button) {
    const entry = pending.get(button) || { count: 0, timer: 0, spinner: null };
    entry.count += 1;
    if (entry.count === 1) {
      entry.timer = setTimeout(() => {
        button.classList.add('busy-btn');
        button.setAttribute('aria-busy', 'true');
        // The upload form already draws its own spinner.
        if (!button.querySelector('.er-spin, .busy-spin')) {
          entry.spinner = document.createElement('span');
          entry.spinner.className = 'busy-spin';
          entry.spinner.setAttribute('aria-hidden', 'true');
          button.prepend(entry.spinner);
        }
      }, SHOW_AFTER);
    }
    pending.set(button, entry);
  }

  function finish(button) {
    const entry = pending.get(button);
    if (!entry) return;
    entry.count -= 1;
    if (entry.count > 0) return;
    clearTimeout(entry.timer);
    entry.spinner?.remove();
    button.classList.remove('busy-btn');
    button.removeAttribute('aria-busy');
    pending.delete(button);
    // A follow-on request (save, then reload) stays on the same button.
    if (pressed === button) pressedAt = performance.now();
  }

  const original = window.fetch.bind(window);
  window.fetch = (...args) => {
    const button = pressed && performance.now() - pressedAt < LINK_WINDOW && document.contains(pressed) ? pressed : null;
    if (!button) return original(...args);
    start(button);
    const request = original(...args);
    request.then(() => finish(button), () => finish(button));
    return request;
  };
})();
