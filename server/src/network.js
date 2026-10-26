import os from 'node:os';

const unique = values => [...new Set(values.filter(Boolean))];

function normalizeOrigin(value) {
  try { return new URL(value.trim()).origin; } catch { return null; }
}

function requestIsSameOrigin(request, origin) {
  try {
    const parsed = new URL(origin);
    const protocol = request.socket.encrypted ? 'https:' : 'http:';
    return parsed.protocol === protocol && parsed.host.toLowerCase() === request.headers.host?.toLowerCase();
  } catch { return false; }
}

export function getAllowedOrigins({ clientOrigin = process.env.CLIENT_ORIGIN || '', port = process.env.PORT || '3001', vitePort = process.env.VITE_PORT || '5173', interfaces = os.networkInterfaces(), hostname = os.hostname() } = {}) {
  const origins = (Array.isArray(clientOrigin) ? clientOrigin : clientOrigin.split(','))
    .map(normalizeOrigin).filter(Boolean);
  const hosts = unique(['localhost', '127.0.0.1', hostname, `${hostname}.local`, ...Object.values(interfaces).flat().filter(item => item.family === 'IPv4' && !item.internal).map(item => item.address)]);
  const ports = unique([String(port), String(vitePort), '80', '443']);

  for (const host of hosts) for (const protocol of ['http:', 'https:']) for (const portNumber of ports) {
    const defaultPort = (protocol === 'http:' && portNumber === '80') || (protocol === 'https:' && portNumber === '443');
    origins.push(normalizeOrigin(`${protocol}//${host}${defaultPort ? '' : `:${portNumber}`}`));
  }
  return new Set(origins);
}

export function createSocketOptions(options = {}) {
  const allowedOrigins = getAllowedOrigins(options);
  return {
    cors: {
      origin: (origin, callback) => callback(null, origin && allowedOrigins.has(normalizeOrigin(origin)) ? normalizeOrigin(origin) : false),
      credentials: true,
      methods: ['GET', 'POST'],
    },
    allowRequest: (request, callback) => {
      const origin = request.headers.origin;
      callback(null, !origin || allowedOrigins.has(normalizeOrigin(origin)) || requestIsSameOrigin(request, origin));
    },
  };
}
