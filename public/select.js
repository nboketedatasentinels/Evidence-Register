// Turns every dropdown into one you can either open and pick from, or type
// into to search. The original <select> stays in the form underneath, so
// saving, required checks and change listeners work as before.
// When "Other" is picked, a box asks what the other is, and that text is saved.
// A dropdown can opt out with data-no-search.
(() => {
  const done = new WeakSet();

  const style = document.createElement('style');
  style.textContent = `
    .ss-wrap { position: relative; display: block; }
    .ss-native { position: absolute !important; inset: 0; width: 100% !important; height: 100% !important; margin: 0 !important; opacity: 0; pointer-events: none; }
    .ss-input { padding-right: 2.25rem !important; cursor: text; text-overflow: ellipsis; }
    .ss-input:disabled { cursor: not-allowed; opacity: .6; }
    .ss-caret { position: absolute; right: .6rem; top: 50%; width: 1rem; height: 1rem; margin-top: -.5rem; color: #64748b; pointer-events: none; }
    .ss-list { position: fixed; z-index: 9999; max-height: 16rem; overflow-y: auto; margin: 0; padding: .25rem; list-style: none;
      background: #fff; border: 1px solid #e2e8f0; border-radius: .5rem; box-shadow: 0 10px 25px -5px rgba(15,23,42,.15); font-size: .875rem; font-weight: 400; color: #0f172a; }
    .ss-list[hidden] { display: none; }
    .ss-opt { padding: .45rem .6rem; border-radius: .375rem; cursor: pointer; }
    .ss-opt[aria-selected="true"] { background: #EEF4FD; color: #163A66; }
    .ss-opt.ss-current { font-weight: 600; }
    .ss-group { padding: .5rem .6rem .25rem; font-size: .7rem; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: #64748b; }
    .ss-empty { padding: .5rem .6rem; color: #64748b; }
    .ss-other { margin-top: .5rem; }
  `;
  document.head.appendChild(style);

  const plain = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const isOther = (option) => !option.hasAttribute('data-other-value')
    && (plain(option.value) === 'other' || plain(option.textContent) === 'other' || /^other\b/.test(plain(option.textContent)));
  const otherOf = (select) => [...select.options].find(isOther);
  const customOf = (select) => select.querySelector('option[data-other-value]');
  let uid = 0;

  function enhance(select) {
    if (done.has(select) || select.multiple || select.size > 1 || select.hasAttribute('data-no-search')) return;
    done.add(select);
    uid += 1;
    const listId = `ss-list-${uid}`;

    const wrap = document.createElement('span');
    wrap.className = 'ss-wrap';
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.classList.add('ss-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.className = `${select.className.replace('ss-native', '')} ss-input`;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', listId);
    const label = select.getAttribute('aria-label') || select.closest('label')?.firstChild?.textContent?.trim();
    if (label) input.setAttribute('aria-label', label);
    wrap.insertBefore(input, select);

    const caret = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    caret.setAttribute('viewBox', '0 0 20 20');
    caret.setAttribute('fill', 'currentColor');
    caret.setAttribute('class', 'ss-caret');
    caret.setAttribute('aria-hidden', 'true');
    caret.innerHTML = '<path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"/>';
    wrap.appendChild(caret);

    const list = document.createElement('ul');
    list.id = listId;
    list.className = 'ss-list';
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    wrap.appendChild(list);

    let other = null; // the "please say what" box
    let items = [];
    let active = -1;

    // ----- what the closed box shows -----
    function shown() {
      const option = select.selectedOptions[0];
      if (!option) return null;
      return option.hasAttribute('data-other-value') ? otherOf(select) || option : option;
    }

    function paint() {
      const option = shown();
      const empty = !option || option.value === '';
      input.value = empty ? '' : option.textContent.trim();
      input.placeholder = empty ? (option?.textContent.trim() || 'Search or choose…') : '';
      input.disabled = select.disabled;
      paintOther();
    }

    function paintOther() {
      const option = select.selectedOptions[0];
      const wantsOther = option && (isOther(option) || option.hasAttribute('data-other-value'));
      if (!wantsOther) {
        other?.remove();
        other = null;
        return;
      }
      if (!other) {
        other = document.createElement('input');
        other.type = 'text';
        other.required = true;
        other.maxLength = 120;
        other.className = `${input.className.replace('ss-input', '')} ss-other`;
        other.placeholder = 'Please say what it is';
        other.setAttribute('aria-label', `${label || 'Other'}: please say what it is`);
        other.addEventListener('input', () => {
          const text = other.value.trim();
          let custom = customOf(select);
          if (text) {
            if (!custom) {
              custom = document.createElement('option');
              custom.setAttribute('data-other-value', '');
              select.appendChild(custom);
            }
            custom.value = text;
            custom.textContent = text;
            setValue(text);
          } else {
            custom?.remove();
            const base = otherOf(select);
            if (base) setValue(base.value);
          }
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        wrap.after(other);
      }
      other.disabled = select.disabled;
      const custom = customOf(select);
      if (custom && option === custom && other.value !== custom.value) other.value = custom.value;
    }

    // ----- the open list -----
    function build(query) {
      const q = plain(query);
      list.innerHTML = '';
      items = [];
      const add = (option) => {
        if (option.hasAttribute('data-other-value') || option.hidden) return;
        if (q && !plain(option.textContent).includes(q)) return;
        const li = document.createElement('li');
        li.className = 'ss-opt';
        li.id = `${listId}-${items.length}`;
        li.setAttribute('role', 'option');
        li.textContent = option.textContent.trim() || '—';
        if (option === shown()) li.classList.add('ss-current');
        if (option.disabled) li.setAttribute('aria-disabled', 'true');
        li.addEventListener('mousedown', (event) => {
          event.preventDefault();
          if (!option.disabled) choose(option);
        });
        list.appendChild(li);
        items.push({ li, option });
      };
      [...select.children].forEach((child) => {
        if (child.tagName === 'OPTGROUP') {
          const before = items.length;
          const head = document.createElement('li');
          head.className = 'ss-group';
          head.setAttribute('role', 'presentation');
          head.textContent = child.label;
          list.appendChild(head);
          [...child.children].forEach(add);
          if (items.length === before) head.remove();
        } else {
          add(child);
        }
      });
      if (!items.length) {
        const none = document.createElement('li');
        none.className = 'ss-empty';
        none.textContent = 'No match';
        list.appendChild(none);
      }
      const current = items.findIndex((item) => item.option === shown());
      highlight(q ? items.findIndex((item) => !item.option.disabled) : current);
    }

    function highlight(index) {
      items.forEach((item, i) => item.li.setAttribute('aria-selected', i === index ? 'true' : 'false'));
      active = index;
      if (index >= 0) {
        input.setAttribute('aria-activedescendant', items[index].li.id);
        items[index].li.scrollIntoView({ block: 'nearest' });
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }

    function place() {
      const box = input.getBoundingClientRect();
      const below = window.innerHeight - box.bottom;
      list.style.left = `${box.left}px`;
      list.style.width = `${box.width}px`;
      if (below < 200 && box.top > below) {
        list.style.top = '';
        list.style.bottom = `${window.innerHeight - box.top + 4}px`;
      } else {
        list.style.bottom = '';
        list.style.top = `${box.bottom + 4}px`;
      }
    }

    function open(query = '') {
      if (select.disabled) return;
      build(query);
      place();
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    function close() {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      paint();
    }

    function setValue(value) {
      valueSetter.call(select, value);
    }

    function choose(option) {
      const changed = select.value !== option.value;
      customOf(select)?.remove();
      setValue(option.value);
      close();
      if (changed) {
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (other) other.focus();
    }

    input.addEventListener('focus', () => {
      open();
      input.select();
    });
    input.addEventListener('mousedown', () => {
      if (document.activeElement === input && list.hidden) open();
    });
    input.addEventListener('input', () => open(input.value));
    input.addEventListener('blur', close);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (list.hidden) open();
        if (!items.length) return;
        const step = event.key === 'ArrowDown' ? 1 : -1;
        highlight((active + step + items.length) % items.length);
      } else if (event.key === 'Enter') {
        if (!list.hidden) {
          event.preventDefault();
          if (active >= 0 && !items[active].option.disabled) choose(items[active].option);
        }
      } else if (event.key === 'Escape') {
        if (!list.hidden) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }
    });
    // Follow the box when the page scrolls; let go once the page redraws it away.
    function follow() {
      if (!input.isConnected) {
        window.removeEventListener('scroll', follow, true);
        window.removeEventListener('resize', follow);
        return;
      }
      if (!list.hidden) place();
    }
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);

    // Keep the box in step when the page changes the dropdown itself.
    const proto = HTMLSelectElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    const indexSetter = Object.getOwnPropertyDescriptor(proto, 'selectedIndex').set;
    Object.defineProperty(select, 'value', {
      configurable: true,
      get() { return Object.getOwnPropertyDescriptor(proto, 'value').get.call(this); },
      set(value) { valueSetter.call(this, value); paint(); },
    });
    Object.defineProperty(select, 'selectedIndex', {
      configurable: true,
      get() { return Object.getOwnPropertyDescriptor(proto, 'selectedIndex').get.call(this); },
      set(value) { indexSetter.call(this, value); paint(); },
    });
    new MutationObserver(paint).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected'] });
    select.addEventListener('change', paint);
    select.form?.addEventListener('reset', () => setTimeout(() => {
      customOf(select)?.remove();
      if (other) other.value = '';
      paint();
    }));
    paint();
  }

  function scan(root) {
    if (root.nodeType !== 1) return;
    if (root.tagName === 'SELECT') enhance(root);
    else root.querySelectorAll?.('select').forEach(enhance);
  }

  function start() {
    scan(document.body);
    new MutationObserver((changes) => {
      changes.forEach((change) => change.addedNodes.forEach(scan));
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
