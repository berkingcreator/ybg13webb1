// "İnsanların en hayırlısı, insanlara faydalı olandır." - Hz. Muhammed (s.a.v)
'use strict';
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const os = require('os');
const cluster = require('cluster');
const net = require('net');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

let promClient;
try {
  promClient = require('prom-client');
  promClient.collectDefaultMetrics();
} catch (_) {
  promClient = null;
}

let Redis;
try {
  Redis = require('ioredis');
} catch (_) {
  Redis = null;
}

class TokenBucket {
  constructor(capacity, fillRate, redis, redisPrefix = '') {
    this.capacity = capacity;
    this.fillRate = fillRate;
    this.redis = redis;
    this.redisPrefix = redisPrefix;
    this.buckets = new Map();
    this.globalBucket = redis
      ? null
      : { tokens: capacity, lastFill: Date.now() };
  }

  async consume(key) {
    if (this.redis) {
      const script = `
        local bucket = redis.call('HMGET', KEYS[1], 'tokens', 'lastFill')
        local tokens = tonumber(bucket[1]) or ${this.capacity}
        local lastFill = tonumber(bucket[2]) or 0
        local now = redis.call('TIME')[1] * 1000
        local elapsed = math.max(0, now - lastFill)
        local newTokens = math.min(${this.capacity}, tokens + (elapsed * ${this.fillRate} / 1000))
        if newTokens < 1 then
          redis.call('HSET', KEYS[1], 'tokens', newTokens, 'lastFill', now)
          redis.call('PEXPIRE', KEYS[1], 60000)
          return 0
        end
        redis.call('HSET', KEYS[1], 'tokens', newTokens - 1, 'lastFill', now)
        redis.call('PEXPIRE', KEYS[1], 60000)
        return 1
      `;
      return (await this.redis.eval(script, 1, this.redisPrefix + key)) === 1;
    } else {
      const now = Date.now();
      const bucket = key ? this.buckets : { data: this.globalBucket };
      if (key) {
        let b = this.buckets.get(key);
        if (!b) {
          b = { tokens: this.capacity, lastFill: now };
          this.buckets.set(key, b);
        }
        bucket.data = b;
      }
      const b = bucket.data;
      const elapsed = now - b.lastFill;
      b.tokens = Math.min(
        this.capacity,
        b.tokens + (elapsed * this.fillRate) / 1000
      );
      b.lastFill = now;
      if (b.tokens < 1) return false;
      b.tokens -= 1;
      return true;
    }
  }
}

class PenaltyTracker {
  constructor(redis, longBan) {
    this.redis = redis;
    this.penalties = new Map();
    this.longBan = longBan;
  }

  async get(ip) {
    if (this.redis) {
      const data = await this.redis.hgetall(`penalty:${ip}`);
      return data && data.score
        ? { score: +data.score, banUntil: +data.banUntil }
        : null;
    }
    return this.penalties.get(ip) || null;
  }

  async set(ip, score, banUntil = 0) {
    if (this.redis) {
      await this.redis.hmset(`penalty:${ip}`, 'score', score, 'banUntil', banUntil);
      await this.redis.pexpire(`penalty:${ip}`, this.longBan * 2);
    } else {
      this.penalties.set(ip, { score, banUntil });
    }
  }
}

class ConnectionTracker {
  constructor(redis, ttl) {
    this.redis = redis;
    this.ttl = ttl;
    this.connections = new Map();
  }

  async increment(ip) {
    if (this.redis) {
      const count = await this.redis.incr(`conn:${ip}`);
      await this.redis.pexpire(`conn:${ip}`, this.ttl);
      return count;
    }
    let entry = this.connections.get(ip);
    if (!entry || Date.now() - entry.ts > this.ttl) {
      entry = { count: 0, ts: Date.now() };
    }
    entry.count++;
    this.connections.set(ip, entry);
    return entry.count;
  }

  async decrement(ip) {
    if (this.redis) {
      await this.redis.decr(`conn:${ip}`);
    } else {
      const entry = this.connections.get(ip);
      if (entry && entry.count > 0) entry.count--;
    }
  }
}

class ChallengeEngine {
  constructor(secret, difficulty, ttl) {
    this.secret = secret;
    this.difficulty = difficulty;
    this.ttl = ttl;
  }

  generate() {
    const nonce = crypto.randomBytes(16).toString('base64');
    return { nonce, difficulty: this.difficulty };
  }

  verify(cookie) {
    if (!cookie) return false;
    try {
      const decoded = Buffer.from(cookie, 'base64').toString('utf8');
      const { nonce, answer, exp } = JSON.parse(decoded);
      if (Date.now() > exp) return false;
      const hash = crypto
        .createHash('sha256')
        .update(nonce + answer)
        .digest('hex');
      return hash.startsWith('0'.repeat(this.difficulty));
    } catch (_) {
      return false;
    }
  }

  renderChallengePage(nonce, difficulty) {
    const scriptNonce = crypto.randomBytes(8).toString('hex');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script nonce="${scriptNonce}">
      const nonce = '${nonce}';
      const difficulty = ${difficulty};
      const prefix = '0'.repeat(difficulty);
      let answer = 0;
      async function solve() {
        while (1) {
          const hash = await crypto.subtle.digest('SHA-256',
            new TextEncoder().encode(nonce + answer.toString()));
          const hex = Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2,'0')).join('');
          if (hex.startsWith(prefix)) {
            const payload = btoa(JSON.stringify({
              nonce: nonce,
              answer: answer.toString(),
              exp: Date.now() + ${this.ttl}
            }));
            document.cookie = '_ts_challenge=' + payload +
              ';path=/;max-age=' + ${Math.floor(this.ttl / 1000)} +
              ';SameSite=Lax;Secure';
            location.reload();
            break;
          }
          answer++;
        }
      }
      solve();
    </script></body></html>`;
  }
}

class AnomalyDetector {
  evaluate(req) {
    let score = 0;
    const ua = req.headers['user-agent'] || '';
    const accept = req.headers['accept'] || '';
    const lang = req.headers['accept-language'] || '';
    const connection = req.headers['connection'] || '';
    if (!ua) score += 3;
    if (!accept) score += 2;
    if (!lang) score += 1;
    if (connection === 'close' && req.headers['keep-alive']) score += 2;
    if (ua.length < 20 && ua.length > 0) score += 1;
    if (/python|curl|wget|go-http|axios|node-fetch/i.test(ua)) score += 2;
    if (
      (req.method === 'POST' || req.method === 'PUT') &&
      !req.headers['content-type']
    )
      score += 2;
    return score;
  }
}

class IPFirewall {
  constructor(enabled, longBan) {
    this.enabled = enabled;
    this.longBan = longBan;
    if (this.enabled) {
      execFileAsync('ipset', [
        'create',
        'titan_blacklist',
        'hash:ip',
        'timeout',
        longBan.toString(),
        '-exist',
      ]).catch(() => {});
    }
  }

  async block(ip) {
    if (!this.enabled || ip === 'unknown') return;
    try {
      await execFileAsync('ipset', ['add', 'titan_blacklist', ip]);
    } catch (_) {}
  }
}

class Metrics {
  constructor() {
    if (!promClient) {
      this.active = false;
      return;
    }
    this.active = true;
    this.activeGauge = new promClient.Gauge({
      name: 'titan_active_requests',
      help: 'Active requests',
    });
    this.blockedCounter = new promClient.Counter({
      name: 'titan_blocked_ips_total',
      help: 'Total blocked IPs',
    });
  }

  setActive(val) {
    if (this.active) this.activeGauge.set(val);
  }

  incBlocked() {
    if (this.active) this.blockedCounter.inc();
  }

  metrics() {
    return this.active ? promClient.register.metrics() : '';
  }
}

class BackendPool {
  constructor(backends = [], healthInterval = 5000) {
    this.servers = backends.map((b) => ({
      ...b,
      weight: b.weight || 1,
      isAlive: true,
    }));
    this.currentIndex = -1;
    this.currentWeight = 0;
    this.healthInterval = healthInterval;
    this.healthTimer = setInterval(() => this.checkHealth(), this.healthInterval);
    if (this.healthTimer.unref) this.healthTimer.unref();
  }

  checkHealth() {
    for (const server of this.servers) {
      const socket = new net.Socket();
      socket.setTimeout(2000);
      socket.connect(server.port, server.host, () => {
        server.isAlive = true;
        socket.destroy();
      });
      socket.on('error', () => {
        server.isAlive = false;
        socket.destroy();
      });
      socket.on('timeout', () => {
        server.isAlive = false;
        socket.destroy();
      });
    }
  }

  selectBackend() {
    const alive = this.servers.filter((s) => s.isAlive);
    if (alive.length === 0) return null;
    if (alive.length === 1) return alive[0];

    while (true) {
      this.currentIndex = (this.currentIndex + 1) % alive.length;
      if (this.currentIndex === 0) {
        this.currentWeight -= Math.min(...alive.map((s) => s.weight));
        if (this.currentWeight <= 0) {
          this.currentWeight = Math.max(...alive.map((s) => s.weight));
        }
      }
      if (alive[this.currentIndex].weight >= this.currentWeight) {
        return alive[this.currentIndex];
      }
    }
  }

  updateBackends(backends) {
    this.servers = backends.map((b) => ({
      ...b,
      weight: b.weight || 1,
      isAlive: true,
    }));
  }

  stop() {
    clearInterval(this.healthTimer);
  }
}

class Gateway {
  constructor(config) {
    this.redis = config.redisUri && Redis ? new Redis(config.redisUri) : null;
    this.bucketCapacity = config.bucketCapacity || 30;
    this.bucketFillRate = config.bucketFillRate || 5;
    this.globalBucketCapacity = config.globalBucketCapacity || 5000;
    this.globalFillRate = config.globalFillRate || 1000;
    this.ipBucket = new TokenBucket(
      this.bucketCapacity,
      this.bucketFillRate,
      this.redis,
      'bucket:'
    );
    this.globalBucket = new TokenBucket(
      this.globalBucketCapacity,
      this.globalFillRate,
      this.redis,
      '__global__'
    );
    this.shortBan = config.shortBan || 600000;
    this.longBan = config.longBan || 3600000;
    this.penalty = new PenaltyTracker(this.redis, this.longBan);
    this.connections = new ConnectionTracker(
      this.redis,
      config.connectionTTL || 120000
    );
    this.challengeDifficulty = config.challengeDifficulty || 4;
    this.challengeTTL = config.challengeTTL || 300000;
    this.challenge = new ChallengeEngine(
      config.challengeSecret || crypto.randomBytes(32).toString('hex'),
      this.challengeDifficulty,
      this.challengeTTL
    );
    this.anomaly = new AnomalyDetector();
    this.firewall = new IPFirewall(
      config.osFirewallEnabled !== false,
      this.longBan
    );
    this.metrics = new Metrics();

    this.blocklist = new Set(config.threatIntelBlocklist || []);
    this.failOpen = config.failOpen !== false;
    this.maxPayloadSize = config.maxPayloadSize || 1048576;
    this.penaltyDelay = config.penaltyDelay || 2000;
    this.challengeEnabled = config.challengeEnabled !== false;
    this.trustProxy = config.trustProxy || false;
    this.cloudflare = config.cloudflare || false;

    this.backends = config.backends || [];
    this.backendPool = new BackendPool(this.backends);

    this.activeRequests = 0;
  }

  updateConfig(newConfig) {
    if (newConfig.bucketCapacity !== undefined) {
      this.bucketCapacity = newConfig.bucketCapacity;
      this.ipBucket = new TokenBucket(
        this.bucketCapacity,
        this.bucketFillRate,
        this.redis,
        'bucket:'
      );
    }
    if (newConfig.bucketFillRate !== undefined) {
      this.bucketFillRate = newConfig.bucketFillRate;
      this.ipBucket = new TokenBucket(
        this.bucketCapacity,
        this.bucketFillRate,
        this.redis,
        'bucket:'
      );
    }
    if (newConfig.globalBucketCapacity !== undefined) {
      this.globalBucketCapacity = newConfig.globalBucketCapacity;
      this.globalBucket = new TokenBucket(
        this.globalBucketCapacity,
        this.globalFillRate,
        this.redis,
        '__global__'
      );
    }
    if (newConfig.globalFillRate !== undefined) {
      this.globalFillRate = newConfig.globalFillRate;
      this.globalBucket = new TokenBucket(
        this.globalBucketCapacity,
        this.globalFillRate,
        this.redis,
        '__global__'
      );
    }
    if (newConfig.shortBan !== undefined) this.shortBan = newConfig.shortBan;
    if (newConfig.longBan !== undefined) {
      this.longBan = newConfig.longBan;
      this.penalty.longBan = this.longBan;
    }
    if (newConfig.challengeDifficulty !== undefined) {
      this.challengeDifficulty = newConfig.challengeDifficulty;
      this.challenge = new ChallengeEngine(
        this.challenge.secret,
        this.challengeDifficulty,
        this.challengeTTL
      );
    }
    if (newConfig.challengeTTL !== undefined) {
      this.challengeTTL = newConfig.challengeTTL;
      this.challenge = new ChallengeEngine(
        this.challenge.secret,
        this.challengeDifficulty,
        this.challengeTTL
      );
    }
    if (newConfig.penaltyDelay !== undefined)
      this.penaltyDelay = newConfig.penaltyDelay;
    if (newConfig.maxPayloadSize !== undefined)
      this.maxPayloadSize = newConfig.maxPayloadSize;
    if (newConfig.backends) {
      this.backends = newConfig.backends;
      this.backendPool.updateBackends(this.backends);
    }
  }

  extractIP(req) {
    let ip;
    if (this.cloudflare && req.headers['cf-connecting-ip'] && req.headers['cf-ray']) {
      ip = req.headers['cf-connecting-ip'];
    } else if (this.trustProxy && req.connection && req.connection.remoteAddress) {
      ip = req.connection.remoteAddress;
    } else {
      ip = req.socket?.remoteAddress || 'unknown';
    }
    if (ip && ip.startsWith('::ffff:')) ip = ip.slice(7);
    return ip || 'unknown';
  }

  parseCookies(cookieHeader) {
    const cookies = {};
    if (!cookieHeader) return cookies;
    try {
      cookieHeader.split(';').forEach((pair) => {
        const idx = pair.indexOf('=');
        if (idx === -1) return;
        const key = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        cookies[key] = value;
      });
    } catch (_) {}
    return cookies;
  }

  async handleRequest(req, res) {
    this.activeRequests++;
    this.metrics.setActive(this.activeRequests);
    const ip = this.extractIP(req);
    const now = Date.now();

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    try {
      if (this.blocklist.has(ip)) {
        res.writeHead(403);
        res.end('IP blacklisted');
        this.metrics.incBlocked();
        return;
      }

      const connCount = await this.connections.increment(ip);
      if (connCount > 100) {
        await this.connections.decrement(ip);
        res.writeHead(429);
        res.end('Too many connections');
        return;
      }
      req.on('close', () => this.connections.decrement(ip).catch(() => {}));

      if (this.challengeEnabled) {
        const cookies = this.parseCookies(req.headers.cookie);
        const challengeCookie = cookies['_ts_challenge'];
        if (!this.challenge.verify(challengeCookie)) {
          const { nonce, difficulty } = this.challenge.generate();
          res.setHeader(
            'Content-Security-Policy',
            `script-src 'nonce-${crypto.randomBytes(8).toString('hex')}'`
          );
          res.setHeader('Set-Cookie', '_ts_challenge=; Max-Age=0');
          res.writeHead(403, { 'Content-Type': 'text/html' });
          res.end(this.challenge.renderChallengePage(nonce, difficulty));
          return;
        }
      }

      const penalty = await this.penalty.get(ip);
      if (penalty && penalty.banUntil > now) {
        const remaining = Math.ceil((penalty.banUntil - now) / 1000);
        res.setHeader('Retry-After', remaining);
        res.writeHead(penalty.score >= 10 ? 403 : 429);
        res.end('Access denied');
        this.metrics.incBlocked();
        return;
      }

      const globalOK = await this.globalBucket.consume(null);
      if (!globalOK) {
        res.writeHead(503);
        res.end('Server overloaded');
        return;
      }

      const ipOK = await this.ipBucket.consume(ip);
      if (!ipOK) {
        const current = penalty ? penalty.score : 0;
        const newScore = current + 2;
        let banUntil = 0;
        if (newScore >= 15) {
          banUntil = now + this.longBan;
          this.firewall.block(ip);
        } else if (newScore >= 10) {
          banUntil = now + this.shortBan;
        } else if (newScore >= 5) {
          res.setHeader('X-RateLimit-Delay', this.penaltyDelay / 1000);
        }
        await this.penalty.set(ip, newScore, banUntil);
        if (banUntil) {
          res.writeHead(429);
          res.end('IP banned');
          this.metrics.incBlocked();
          return;
        }
        await new Promise((r) => setTimeout(r, this.penaltyDelay));
      }

      const anomalyScore = this.anomaly.evaluate(req);
      if (anomalyScore > 0) {
        const current = penalty ? penalty.score : 0;
        await this.penalty.set(ip, current + anomalyScore, penalty ? penalty.banUntil : 0);
      }

      const contentLength = parseInt(req.headers['content-length'] || '0', 10);
      if (req.method === 'POST' || req.method === 'PUT') {
        if (req.headers['transfer-encoding']) {
          res.writeHead(411);
          res.end('Chunked requests rejected');
          return;
        }
        if (contentLength > this.maxPayloadSize) {
          res.writeHead(413);
          res.end('Payload too large');
          return;
        }
      }

      this.proxyRequest(req, res);
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
        if (!res.headersSent) {
          res.writeHead(502);
          res.end('Upstream unreachable');
        }
      } else if (!this.failOpen) {
        if (!res.headersSent) {
          res.writeHead(500);
          res.end('Internal firewall error');
        }
      } else {
        this.proxyRequest(req, res);
      }
    } finally {
      this.metrics.setActive(--this.activeRequests);
    }
  }

  proxyRequest(req, res) {
    const backend = this.backendPool.selectBackend();
    if (!backend) {
      res.writeHead(503);
      res.end('No backend available');
      return;
    }
    const options = {
      hostname: backend.host,
      port: backend.port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers },
    };
    options.headers['host'] = backend.host;
    options.headers['x-forwarded-for'] = this.extractIP(req);

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502);
        res.end('Bad Gateway');
      }
    });
    req.pipe(proxyReq);
  }
}

class AdminAPI {
  constructor(gateway, workers) {
    this.gateway = gateway;
    this.workers = workers;
  }

  start(port = 8080) {
    const server = http.createServer(async (req, res) => {
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } else if (req.method === 'GET' && req.url === '/metrics') {
        const metrics = await this.gateway.metrics.metrics();
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(metrics);
      } else if (req.method === 'POST' && req.url === '/blocklist') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { ip, action } = JSON.parse(body);
            if (action === 'add') {
              this.gateway.blocklist.add(ip);
              this.broadcast({ type: 'blocklist', ip, action: 'add' });
            } else if (action === 'remove') {
              this.gateway.blocklist.delete(ip);
              this.broadcast({ type: 'blocklist', ip, action: 'remove' });
            }
            res.writeHead(200);
            res.end('OK');
          } catch (_) {
            res.writeHead(400);
            res.end('Invalid JSON');
          }
        });
      } else if (req.method === 'POST' && req.url === '/config') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const newConfig = JSON.parse(body);
            this.gateway.updateConfig(newConfig);
            this.broadcast({ type: 'config', data: newConfig });
            res.writeHead(200);
            res.end('OK');
          } catch (_) {
            res.writeHead(400);
            res.end('Invalid JSON');
          }
        });
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });
    server.listen(port, () => {
      console.log(`Admin API listening on port ${port}`);
    });
  }

  broadcast(msg) {
    for (const worker of this.workers) {
      worker.send(msg);
    }
  }
}

if (cluster.isPrimary) {
  if (!process.env.TLS_KEY || !process.env.TLS_CERT) {
    console.error('TLS_KEY and TLS_CERT environment variables must be set');
    process.exit(1);
  }

  const numCPUs = os.cpus().length;
  const workers = [];
  for (let i = 0; i < numCPUs; i++) {
    const worker = cluster.fork();
    workers.push(worker);
  }
  cluster.on('exit', (deadWorker) => {
    const idx = workers.indexOf(deadWorker);
    if (idx !== -1) {
      const newWorker = cluster.fork();
      workers[idx] = newWorker;
    }
  });

  const gatewayConfig = {
    redisUri: process.env.REDIS_URI,
    bucketCapacity: 30,
    bucketFillRate: 5,
    globalBucketCapacity: 5000,
    globalFillRate: 1000,
    shortBan: 600000,
    longBan: 3600000,
    penaltyDelay: 2000,
    challengeEnabled: true,
    challengeDifficulty: 4,
    challengeTTL: 300000,
    osFirewallEnabled: false,
    failOpen: true,
    maxPayloadSize: 1048576,
    backends: [],
  };
  const adminGateway = new Gateway(gatewayConfig);
  const adminAPI = new AdminAPI(adminGateway, workers);
  adminAPI.start(8080);
} else {
  if (!process.env.TLS_KEY || !process.env.TLS_CERT) {
    console.error('TLS_KEY and TLS_CERT must be provided');
    process.exit(1);
  }

  const gateway = new Gateway({
    redisUri: process.env.REDIS_URI,
    bucketCapacity: 30,
    bucketFillRate: 5,
    globalBucketCapacity: 5000,
    globalFillRate: 1000,
    shortBan: 600000,
    longBan: 3600000,
    penaltyDelay: 2000,
    challengeEnabled: true,
    challengeDifficulty: 4,
    challengeTTL: 300000,
    osFirewallEnabled: false,
    failOpen: true,
    maxPayloadSize: 1048576,
    backends: process.env.BACKENDS ? JSON.parse(process.env.BACKENDS) : [],
  });

  process.on('message', (msg) => {
    if (msg.type === 'blocklist') {
      if (msg.action === 'add') gateway.blocklist.add(msg.ip);
      else if (msg.action === 'remove') gateway.blocklist.delete(msg.ip);
    } else if (msg.type === 'config') {
      gateway.updateConfig(msg.data);
    }
  });

  const tlsOptions = {
    key: require('fs').readFileSync(process.env.TLS_KEY),
    cert: require('fs').readFileSync(process.env.TLS_CERT),
  };

  const server = https.createServer(tlsOptions, (req, res) => {
    gateway.handleRequest(req, res);
  });
  server.listen(443, () => {
    console.log(`Worker ${process.pid} listening on 443`);
  });
}
