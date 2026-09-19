import { isIP } from 'node:net';

// Use the TCP peer, never Host/Origin/X-Forwarded-For, to choose compression.
// Include all of 127/8 and IPv4-mapped IPv6, not just 127.0.0.1.
export function isLoopbackAddress(address) {
  if (isIP(address ?? '') === 4) return address.startsWith('127.');
  if (isIP(address ?? '') !== 6) return false;
  const normalized = new URL('http://[' + address.split('%')[0] + ']').hostname;
  return normalized === '[::1]' || /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(normalized);
}

export function isLanAddress(address) {
  return isIP(address ?? '') !== 0 && !isLoopbackAddress(address);
}

// Fresh options per endpoint; ws has a process-global zlib limiter (first PMD
// instance wins). All production PMD endpoints use the same bounded limit.
// Default RFC7692 windows are at most 32 KiB; keep them for binary-frame ratio.
export function lanPerMessageDeflate() {
  return {
    zlibDeflateOptions: { level: 1, memLevel: 7, chunkSize: 16 * 1024 },
    zlibInflateOptions: { chunkSize: 16 * 1024 },
    serverNoContextTakeover: true,
    clientNoContextTakeover: true,
    concurrencyLimit: 2,
    threshold: 1024,
  };
}

export function lanClientCompression() {
  return {
    perMessageDeflate: lanPerMessageDeflate(),
    // ws's public finishRequest hook lets DNS/TCP complete before the offer is
    // sent. This also handles hostnames resolving to loopback, without a second
    // DNS lookup, changing Host/TLS identity, or mutating shared WSS options.
    finishRequest(req) {
      req.once('socket', socket => {
        const finish = () => {
          if (!isLanAddress(socket.remoteAddress)) req.removeHeader('Sec-WebSocket-Extensions');
          req.end();
        };
        if (socket.connecting) socket.once('connect', finish);
        else finish();
      });
    },
  };
}
