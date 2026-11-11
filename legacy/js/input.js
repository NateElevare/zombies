// input.js — keyboard + mouse state. Keys by e.code; mouse buttons exposed as 'Mouse0','Mouse1','Mouse2'.
(function () {
  'use strict';
  const Z = (window.Z = window.Z || {});
  const down = {};
  const pressedSet = {};

  const input = (Z.input = {
    keys: down,
    mouse: { x: 0, y: 0, worldX: 0, worldY: 0, down: false },
    // true once per physical press (cleared in endFrame)
    pressed(code) { return !!pressedSet[code]; },
    init(canvas) {
      window.addEventListener('keydown', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
        if (!e.repeat) pressedSet[e.code] = true;
        down[e.code] = true;
      });
      window.addEventListener('keyup', (e) => { down[e.code] = false; });
      window.addEventListener('blur', () => {
        for (const k in down) down[k] = false;
        input.mouse.down = false;
      });
      const target = canvas || window;
      function setPos(e) {
        const r = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
        input.mouse.x = e.clientX - r.left;
        input.mouse.y = e.clientY - r.top;
      }
      window.addEventListener('mousemove', setPos);
      target.addEventListener('mousedown', (e) => {
        setPos(e);
        const code = 'Mouse' + e.button;
        pressedSet[code] = true;
        down[code] = true;
        if (e.button === 0) input.mouse.down = true;
      });
      window.addEventListener('mouseup', (e) => {
        down['Mouse' + e.button] = false;
        if (e.button === 0) input.mouse.down = false;
      });
      if (canvas) canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    },
    endFrame() { for (const k in pressedSet) delete pressedSet[k]; },
  });
})();
