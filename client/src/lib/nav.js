// Pure focus-index math — testable without a DOM.
export function nextIndex(current, total, direction) {
  if (total <= 0) return -1;
  const proposed = current + direction;
  if (proposed < 0) return 0;
  if (proposed > total - 1) return total - 1;
  return proposed;
}

// DOM wrapper: manages focus among [data-focusable] descendants of `container`.
// Softkeys are handled by whoever owns the screen — this only does Up/Down.
// opts.onFocus(index) fires after every focus move, so a screen can adapt
// its softkey labels to the focused item.
export function attachFocusRing(container, opts) {
  const onFocus = opts && typeof opts.onFocus === 'function' ? opts.onFocus : null;
  function items() {
    return Array.prototype.slice.call(container.querySelectorAll('[data-focusable]'));
  }

  function currentIndex() {
    const all = items();
    for (let i = 0; i < all.length; i++) {
      if (all[i].classList.contains('focused')) return i;
    }
    return -1;
  }

  function focusAt(index) {
    const all = items();
    if (all.length === 0) return;
    const target = nextIndex(index, all.length, 0);
    for (let i = 0; i < all.length; i++) {
      if (i === target) all[i].classList.add('focused');
      else all[i].classList.remove('focused');
    }
    if (typeof all[target].focus === 'function') all[target].focus();
    // List rows are not focusable elements, so focus() alone does not
    // scroll them into view. Verify on device.
    if (typeof all[target].scrollIntoView === 'function') all[target].scrollIntoView(false);
    if (onFocus) onFocus(target);
  }

  // A screen disables the ring while a text input owns Up/Down (T9 editing).
  let enabled = true;

  function onKey(e) {
    if (!enabled) return;
    if (e.key === 'ArrowDown') {
      focusAt(nextIndex(currentIndex(), items().length, +1));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      focusAt(nextIndex(currentIndex(), items().length, -1));
      e.preventDefault();
    }
  }

  document.addEventListener('keydown', onKey);
  focusAt(0);

  return {
    detach: function () { document.removeEventListener('keydown', onKey); },
    focusAt: focusAt,
    currentIndex: currentIndex,
    setEnabled: function (v) { enabled = !!v; },
  };
}
