const listeners = new Set();

function notify(type, message) {
  const item = {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    type,
    message,
  };

  listeners.forEach((listener) => listener(item));
}

const toast = {
  success(message) {
    notify("success", message);
  },

  error(message) {
    notify("error", message);
  },

  info(message) {
    notify("info", message);
  },

  subscribe(listener) {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  },
};

export default toast;