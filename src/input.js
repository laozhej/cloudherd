// Pointer, keyboard and touch. The spirit follows the pointer; WASD steers it directly.
// Default mouse: hold LEFT to gather clouds, RIGHT (or Space) to gust. Right-button drags
// are avoided on purpose: several browsers turn them into navigation gestures.
import { G } from './state.js';

export function createInput(canvas) {
  const I = {
    x: innerWidth / 2, y: innerHeight / 2, has: false,
    lmb: false, rmb: false, keys: new Set(), pressed: new Set(),
    gustQueued: false, mode: 'mouse', touchGather: false, gatherOn: false, onKey: null, onMove: null, enabled: true,
  };
  const isMoveKey = (c) => ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c);
  const swap = () => !!G.settings.swapButtons;
  // Buttons are read from e.buttons: a second button pressed while the first is held arrives as a
  // pointermove, not a pointerdown. Presses only count on the canvas; anywhere else a button can only be let go.
  let armed = false; // the current press began on the canvas (not on a toolbar button dragged onto it)
  const sync = (e, onCanvas) => {
    const l = (e.buttons & 1) !== 0, r = (e.buttons & 2) !== 0;
    if (onCanvas) {
      const gust = swap() ? l && !I.lmb : r && !I.rmb;
      const gather = swap() ? r && !I.rmb : l && !I.lmb;
      if (gust) I.gustQueued = true;
      if (gather && G.settings.toggleGather) I.gatherOn = !I.gatherOn;
      I.lmb = l; I.rmb = r;
    } else { I.lmb = I.lmb && l; I.rmb = I.rmb && r; }
  };
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    I.x = e.clientX; I.y = e.clientY; I.has = true; I.mode = 'mouse';
    I.onMove?.(I.x, I.y);
    sync(e, armed);
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    I.x = e.clientX; I.y = e.clientY; I.has = true;
    armed = true;
    sync(e, true);
    if (e.button !== 0) e.preventDefault();
    canvas.focus?.();
  });
  // keep middle-click autoscroll and right-button extras away from the game
  canvas.addEventListener('mousedown', (e) => { if (e.button !== 0) e.preventDefault(); });
  canvas.addEventListener('auxclick', (e) => e.preventDefault());
  addEventListener('dragstart', (e) => e.preventDefault());
  addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch' && e.target !== canvas) sync(e, false); });
  addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') return; sync(e, false); if (!e.buttons) armed = false; });
  // the browser menu has no business anywhere in the game (a right button let go over a panel would open it)
  addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('keydown', (e) => {
    if (e.repeat) { if (isMoveKey(e.code) || e.code === 'Space') e.preventDefault(); return; }
    I.pressed.add(e.code); I.keys.add(e.code);
    if (isMoveKey(e.code)) I.mode = 'keys';
    if (e.code === 'KeyE') I.gatherOn = !I.gatherOn;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && document.activeElement?.tagName !== 'BUTTON') e.preventDefault();
    I.onKey?.(e.code, e);
  });
  addEventListener('keyup', (e) => I.keys.delete(e.code));
  addEventListener('blur', () => { I.keys.clear(); I.lmb = I.rmb = false; I.touchGather = false; });

  // touch: one finger steers (a quick tap gusts), a second finger held down gathers;
  // the on-screen Gather / Gust buttons (hud.js) do the same through touchGather and gustQueued
  const touches = new Map();
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY, t0: performance.now(), moved: 0 });
    const first = [...touches.values()][0];
    if (first) { I.x = first.x; I.y = first.y; I.has = true; I.mode = 'mouse'; }
    I.touchTwo = touches.size >= 2;
    // first touch: show the on-screen Gather / Gust buttons and drop the mouse reticle
    if (!G.touch) { G.touch = true; document.body.classList.add('touch'); document.body.classList.remove('aim'); }
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) { const s = touches.get(t.identifier); if (s) { s.moved += Math.hypot(t.clientX - s.x, t.clientY - s.y); s.x = t.clientX; s.y = t.clientY; } }
    const first = [...touches.values()][0];
    if (first) { I.x = first.x; I.y = first.y; }
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) {
      const s = touches.get(t.identifier);
      if (s && touches.size === 1 && performance.now() - s.t0 < 240 && s.moved < 18) I.gustQueued = true;
      touches.delete(t.identifier);
    }
    I.touchTwo = touches.size >= 2;
  };
  canvas.addEventListener('touchend', end); canvas.addEventListener('touchcancel', end);

  I.moveAxis = () => {
    let x = 0, z = 0;
    if (I.keys.has('KeyW') || I.keys.has('ArrowUp')) z -= 1;
    if (I.keys.has('KeyS') || I.keys.has('ArrowDown')) z += 1;
    if (I.keys.has('KeyA') || I.keys.has('ArrowLeft')) x -= 1;
    if (I.keys.has('KeyD') || I.keys.has('ArrowRight')) x += 1;
    const l = Math.hypot(x, z) || 1;
    return { x: x / l, z: z / l, any: x !== 0 || z !== 0 };
  };
  I.gatherHeld = () => {
    if (!I.enabled) return false;
    if (I.gatherOn || I.touchGather || I.touchTwo || I.keys.has('ShiftLeft') || I.keys.has('ShiftRight')) return true;
    if (G.settings.toggleGather) return false;
    return swap() ? I.rmb : I.lmb;
  };
  I.gustNow = () => I.enabled && (I.gustQueued || I.pressed.has('Space') || I.pressed.has('KeyQ'));
  I.endFrame = () => { I.pressed.clear(); I.gustQueued = false; };
  I.clear = () => { I.keys.clear(); I.pressed.clear(); I.lmb = I.rmb = false; I.gustQueued = false; I.gatherOn = false; I.touchGather = false; };
  return I;
}
