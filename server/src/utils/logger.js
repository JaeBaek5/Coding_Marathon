import { randomUUID } from 'node:crypto';

export function generateRequestId() {
  return `req_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
}

export const logger = {
  child(context = {}) {
    return {
      info(message, childContext = {}) {
        logger.info(message, { ...context, ...childContext });
      },
      warn(message, childContext = {}) {
        logger.warn(message, { ...context, ...childContext });
      },
      error(message, error, childContext = {}) {
        logger.error(message, error, { ...context, ...childContext });
      }
    };
  },
  info(message, context = {}) {
    const timestamp = new Date().toISOString();
    console.log(
      JSON.stringify({ timestamp, level: 'INFO', message, ...context })
    );
  },
  error(message, error, context = {}) {
    const timestamp = new Date().toISOString();
    console.error(
      JSON.stringify({
        timestamp,
        level: 'ERROR',
        message,
        error: error?.message || String(error),
        stack: error?.stack,
        ...context
      })
    );
  },
  warn(message, context = {}) {
    const timestamp = new Date().toISOString();
    console.warn(
      JSON.stringify({ timestamp, level: 'WARN', message, ...context })
    );
  }
};

export function loggerMiddleware(req, res, next) {
  req.id = req.headers['x-request-id'] || generateRequestId();
  const start = Date.now();

  logger.info('Incoming request', {
    requestId: req.id,
    method: req.method,
    url: req.url,
    ip: req.ip,
    headers: {
      'user-agent': req.get('user-agent'),
      'content-type': req.get('content-type')
    },
    query: req.query,
    body:
      req.method === 'POST'
        ? { ...req.body, query: req.body.query ? '(truncated)' : undefined }
        : undefined
  });

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      requestId: req.id,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      durationMs: duration
    });
  });

  next();
}

export function logAgentHop(targetLogger, context) {
  targetLogger.info('Agent hop', {
    event: 'agent_hop',
    ...context
  });
}
