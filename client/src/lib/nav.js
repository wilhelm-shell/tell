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
export function attachFocusRing(container) {
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
  }

  function onKey(e) {
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
  };
}
