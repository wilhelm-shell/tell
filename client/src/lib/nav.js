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
//
// opts.onFocus(index) fires after every focus move, so a screen can adapt
// its softkey labels to the focused item.
// opts.scroller: the scrolling element around the items. When given, an
// item taller than the visible area is paged through with Up/Down before
// focus moves on, so a long message can actually be read on a D-pad.
export function attachFocusRing(container, opts) {
  const onFocus = opts && typeof opts.onFocus === 'function' ? opts.onFocus : null;
  const scroller = opts && opts.scroller ? opts.scroller : null;

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
    const el = all[target];
    if (typeof el.focus === 'function') el.focus();
    // List rows are not focusable elements, so focus() alone does not
    // scroll them into view. An item taller than the viewport is aligned
    // to its top so reading starts at the beginning. Verify on device.
    if (typeof el.scrollIntoView === 'function') {
      const tall = scroller && el.offsetHeight > scroller.clientHeight;
      el.scrollIntoView(!!tall);
    }
    if (onFocus) onFocus(target);
  }

  // Page within the focused item when its far edge is still off-screen.
  // Returns true when it scrolled instead of moving focus.
  function pageWithin(direction) {
    if (!scroller) return false;
    const all = items();
    const el = all[currentIndex()];
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    const step = Math.floor(scroller.clientHeight * 0.8);
    if (direction > 0 && r.bottom > s.bottom + 1) { scroller.scrollTop += step; return true; }
    if (direction < 0 && r.top < s.top - 1) { scroller.scrollTop -= step; return true; }
    return false;
  }

  // A screen disables the ring while a text input owns Up/Down (T9 editing).
  let enabled = true;

  function onKey(e) {
    if (!enabled) return;
    if (e.key === 'ArrowDown') {
      if (!pageWithin(+1)) focusAt(nextIndex(currentIndex(), items().length, +1));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      if (!pageWithin(-1)) focusAt(nextIndex(currentIndex(), items().length, -1));
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
