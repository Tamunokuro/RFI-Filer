/**
 * Minimal toast event bus.
 *
 * Components call  toast.success("msg") / toast.error("msg") / toast.info("msg").
 * The <Toaster> component subscribes and renders the notifications.
 * The API surface is intentionally identical to react-toastify so callsites
 * need no changes beyond the import path.
 */

let _id = 0;
const _listeners = new Set();

function _dispatch(type, message) {
  const id = ++_id;
  _listeners.forEach((fn) => fn({ id, type, message }));
  return id;
}

const toast = {
  success: (message) => _dispatch("success", message),
  error:   (message) => _dispatch("error",   message),
  info:    (message) => _dispatch("info",    message),

  /** Used internally by <Toaster> — not part of the public API. */
  _subscribe:   (fn) => _listeners.add(fn),
  _unsubscribe: (fn) => _listeners.delete(fn),
};

export default toast;
