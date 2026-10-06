/** Express 4 does not automatically forward rejected async route promises. */
export function installAsyncHandlers(app) {
  // Forward async errors to Express 4's error handler.
  for (const method of ['get', 'post', 'patch']) {
    const register = app[method].bind(app);
    app[method] = (path, ...handlers) =>
      register(
        path,
        ...handlers.map((fn) =>
          fn.constructor.name === 'AsyncFunction'
            ? (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
            : fn,
        ),
      );
  }
}

/** Protect file-store read-modify-write requests from concurrent lost updates.
 * Uploads do not mutate db.json; admin login is read-only.
 * Keep finish AND close handlers so disconnected clients release the queue.
 */
export function serializeMutations() {
  let mutationQueue = Promise.resolve();
  return (req, res, next) => {
    if (
      !['POST', 'PATCH'].includes(req.method) ||
      req.path === '/api/auth/login' ||
      req.path.startsWith('/api/uploads/')
    )
      return next();
    const previous = mutationQueue;
    let release;
    mutationQueue = new Promise((resolve) => {
      release = resolve;
    });
    previous.then(() => {
      if (res.destroyed) return release();
      res.once('finish', release);
      res.once('close', release);
      next();
    });
  };
}
