// Neon Salvage — keyboard and mouse input.
// One job: listen to the page, keep the current held keys and mouse state,
// and remember which keys were pressed since the last frame so menus can
// react to a single tap. The game loop clears justPressed each frame.

export function createInput(canvas) {
  const keys = new Set();
  const justPressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };
  let attached = false;

  function onKeyDown(event) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    if (!event.repeat) justPressed.add(event.code);
    keys.add(event.code);
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function updateMouse(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  }

  function onMouseMove(event) {
    updateMouse(event);
  }

  function onMouseDown(event) {
    updateMouse(event);
    mouse.down = true;
    mouse.clicked = true;
  }

  function onMouseUp() {
    mouse.down = false;
  }

  function onBlur() {
    keys.clear();
    mouse.down = false;
  }

  return {
    keys,
    justPressed,
    mouse,

    attach() {
      if (attached) return;
      attached = true;
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      canvas.addEventListener('mousemove', onMouseMove);
      canvas.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('blur', onBlur);
    },

    detach() {
      if (!attached) return;
      attached = false;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onBlur);
    },

    // True while the key is held. Accepts any of the codes for an action.
    held(...codes) {
      return codes.some((code) => keys.has(code));
    },

    // True once, on the frame the key went down. Cleared by endFrame().
    pressed(...codes) {
      return codes.some((code) => justPressed.has(code));
    },

    // Call at the end of every frame so taps are single-frame events.
    endFrame() {
      justPressed.clear();
      mouse.clicked = false;
    },
  };
}
