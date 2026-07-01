'use strict';

const https = require('https');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const cluster = require('cluster');
const path = require('path');
const yaml = require('js-yaml');
const { EventEmitter } = require('events');

let Redis;
try { Redis = require('ioredis'); } catch(e) { Redis = null; }
let promClient;
try {
  promClient = require('prom-client');
  promClient.collectDefaultMetrics();
} catch(e) { promClient = null; }

class ConfigManager extends EventEmitter {
  constructor(configPath = './ztna.yaml') {
    super();
    this.configPath = configPath;
    this.config = this.load();
    this.watch();
  }

  load() {
    const raw = fs.readFileSync(this.configPath, 'utf8');
    return yaml.load(raw);
  }

  watch() {
    fs.watchFile(this.configPath, { interval: 2000 }, (curr, prev) => {
      if (curr.mtime !== prev.mtime) {
        try {
          this.config = yaml.load(fs.readFileSync(this.configPath, 'utf8'));
          this.emit('config-update', this.config);
        } catch (err) {
          console.error('Config reload failed:', err.message);
        }
      }
    });
  }

  get(key, defaultValue) {
    return key.split('.').reduce((o, i) => (o ? o[i] : undefined), this.config) ?? defaultValue;
  }
}

class Logger {
  constructor(level = 'info') {
    this.levels = { debug: 10, info: 20, warn: 30, error: 40 };
    this.currentLevel = this.levels[level] || 20;
  }

  log(level, message, meta) {
    if (this.levels[level] < this.currentLevel) return;
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta
    };
    process.stdout.write(JSON.stringify(entry) + '\n');
  }

  debug(msg, meta) { this.log('debug', msg, meta); }
  info(msg, meta) { this.log('info', msg, meta); }
  warn(msg, meta) { this.log('warn', msg, meta); }
  error(msg, meta) { this.log('error', msg, meta); }
}

class RateLimiter {
  constructor(config, logger) {
    this.logger = logger;
    this.redis = null;
    if (config.redis && Redis) {
      this.redis = new Redis(config.redis);
      this.logger.info('Rate limiter using Redis');
    } else {
      this.buckets = new Map();
      this.tokensPerInterval = config.tokensPerInterval || 100;
      this.intervalMs = config.intervalMs || 1000;
      this.capacity = config.bucketCapacity || 200;
      this.cleanupIntervalMs = config.cleanupIntervalMs || 60000;
      this.maxEntries = config.maxEntries || 10000;
      this.cleanupTimer = setInterval(() => this.cleanup(), this.cleanupIntervalMs);
      if (this.cleanupTimer.unref) this.cleanupTimer.unref();
      this.logger.info('Rate limiter using in-memory buckets');
    }
    this.localFallback = !this.redis;
  }

  getKey(ctx) {
    const user = ctx.user ? ctx.user.sub : 'anonymous';
    const ip = ctx.sourceIP || 'unknown';
    return `rate:${user}:${ip}`;
  }

  async isAllowed(ctx) {
    const key = this.getKey(ctx);
    if (this.redis) {
      const multi = this.redis.multi();
      multi.get(key);
      multi.ttl(key);
      const results = await multi.exec();
      let tokens = results[0][1] ? parseInt(results[0][1], 10) : this.capacity;
      if (tokens > 0) {
        await this.redis.decrby(key, 1);
        return true;
      }
      return false;
    } else {
      return this.localCheck(key);
    }
  }

  localCheck(key) {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now };
      this.buckets.set(key, bucket);
    }
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor(elapsed * (this.tokensPerInterval / this.intervalMs));
    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(bucket.tokens + tokensToAdd, this.capacity);
      bucket.lastRefill = now;
    }
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }

  cleanup() {
    if (this.buckets.size > this.maxEntries) {
      const keys = Array.from(this.buckets.keys());
      const toDelete = keys.slice(0, keys.length - this.maxEntries);
      for (const k of toDelete) this.buckets.delete(k);
    }
  }

  getStatus() {
    return this.redis ? { mode: 'redis' } : { mode: 'memory', entries: this.buckets?.size };
  }
}

class CircuitBreaker {
  constructor(name, config, logger) {
    this.name = name;
    this.failureThreshold = config.failureThreshold || 5;
    this.resetTimeoutMs = config.resetTimeoutMs || 30000;
    this.halfOpenMaxRequests = config.halfOpenMaxRequests || 3;
    this.logger = logger;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.state = 'CLOSED';
    this.halfOpenCount = 0;
    this.successCount = 0;
  }

  async call(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.halfOpenCount = 0;
        this.successCount = 0;
        this.logger.warn(`CB ${this.name} half-open`);
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
    }
    try {
      const result = await fn();
      this.successCount++;
      if (this.state === 'HALF_OPEN' && this.successCount >= this.halfOpenMaxRequests) {
        this.reset();
      }
      return result;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }

  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.logger.warn(`CB ${this.name} open due to failures`);
    }
  }

  reset() {
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.state = 'CLOSED';
    this.halfOpenCount = 0;
    this.successCount = 0;
  }

  getStatus() {
    return { name: this.name, state: this.state, failures: this.failureCount };
  }
}

class PolicyEngine {
  constructor() {
    this.rules = [];
  }

  updateRules(rules) {
    this.rules = [...rules].sort((a, b) => a.priority - b.priority);
  }

  evaluate(ctx) {
    for (const rule of this.rules) {
      try {
        const match = rule.condition(ctx);
        if (match) return rule.action;
      } catch (err) {}
    }
    return 'deny';
  }
}

class BackendPool {
  constructor(servers, config, logger) {
    this.servers = servers;
    this.logger = logger;
    this.agent = new http.Agent({
      keepAlive: true,
      maxSockets: config.backendMaxSockets || 50,
      keepAliveMsecs: 5000,
      timeout: config.requestTimeoutMs || 30000,
    });
  }

  select() {
    const servers = this.servers;
    if (!servers || servers.length === 0) return null;
    if (servers.length === 1) return servers[0];
    const totalWeight = servers.reduce((acc, s) => acc + (s.weight || 1), 0);
    let random = Math.floor(Math.random() * totalWeight);
    for (const server of servers) {
      if (random < (server.weight || 1)) return server;
      random -= (server.weight || 1);
    }
    return servers[0];
  }

  proxy(clientReq, clientRes, context, circuitBreaker) {
    return new Promise((resolve, reject) => {
      const backend = this.select();
      if (!backend) {
        if (!clientRes.headersSent) {
          clientRes.writeHead(503, { 'Content-Type': 'text/plain' });
          clientRes.end('No backend available');
        }
        return reject(new Error('No backend'));
      }
      const options = {
        hostname: backend.host,
        port: backend.port,
        path: clientReq.url,
        method: clientReq.method,
        headers: { ...clientReq.headers },
        agent: this.agent,
        timeout: 30000,
      };
      options.headers['host'] = backend.host;
      options.headers['x-forwarded-for'] = context.sourceIP;
      if (context.user?.sub) options.headers['x-authenticated-user'] = context.user.sub;
      options.headers['x-request-id'] = context.requestId || crypto.randomUUID();

      const proxyReq = http.request(options, (proxyRes) => {
        clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(clientRes);
        clientRes.on('finish', resolve);
      });
      proxyReq.on('timeout', () => {
        proxyReq.destroy(new Error('backend timeout'));
      });
      proxyReq.on('error', (err) => {
        this.logger.error(`backend error ${backend.host}:${backend.port}`, { error: err.message });
        if (!clientRes.headersSent) {
          clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
          clientRes.end('Bad Gateway');
        } else {
          clientRes.end();
        }
        reject(err);
      });
      clientReq.pipe(proxyReq);
    });
  }
}

class Metrics {
  constructor() {
    if (!promClient) {
      this.enabled = false;
      return;
    }
    this.enabled = true;
    this.httpRequestsTotal = new promClient.Counter({
      name: 'ztna_http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'path', 'status'],
    });
    this.policyDecisions = new promClient.Counter({
      name: 'ztna_policy_decisions_total',
      help: 'Total policy decisions',
      labelNames: ['decision'],
    });
    this.activeRequests = new promClient.Gauge({
      name: 'ztna_active_requests',
      help: 'Number of active requests',
    });
  }

  recordRequest(method, path, status) {
    if (this.enabled) this.httpRequestsTotal.inc({ method, path, status });
  }

  recordPolicyDecision(decision) {
    if (this.enabled) this.policyDecisions.inc({ decision });
  }

  gaugeActiveRequests(value) {
    if (this.enabled) this.activeRequests.set(value);
  }

  getMetrics() {
    if (this.enabled) return promClient.register.metrics();
    return '';
  }
}

class ZTNAGateway {
  constructor(configPath) {
    this.configManager = new ConfigManager(configPath);
    const config = this.configManager.config;
    this.logger = new Logger(config.log?.level || 'info');
    this.policyEngine = new PolicyEngine();
    this.metrics = new Metrics();
    this.rateLimiter = config.rateLimiting?.enabled ? new RateLimiter(config.rateLimiting, this.logger) : null;
    this.circuitBreaker = new CircuitBreaker('backend', config.circuitBreaker || {}, this.logger);
    this.backendPool = null;
    this.activeRequests = 0;
    this.shuttingDown = false;
    this.startTime = Date.now();
    this.adminToken = config.admin?.token || crypto.randomBytes(16).toString('hex');

    this.loadConfigData(config);
    this.configManager.on('config-update', (newConfig) => {
      this.logger.info('Configuration reloaded, applying changes...');
      this.loadConfigData(newConfig);
    });
  }

  loadConfigData(config) {
    if (config.policyRules) {
      this.policyEngine.updateRules(config.policyRules);
      this.logger.info(`Policy engine updated with ${config.policyRules.length} rules`);
    }
    if (config.backendServers) {
      this.backendPool = new BackendPool(config.backendServers, config, this.logger);
      this.logger.info(`Backend pool updated with ${config.backendServers.length} servers`);
    }
    if (config.tls) {
      this.tlsOptions = {
        key: fs.readFileSync(config.tls.serverKey || '/etc/ztna/server.key', 'utf8'),
        cert: fs.readFileSync(config.tls.serverCert || '/etc/ztna/server.crt', 'utf8'),
        ca: config.tls.caBundle ? fs.readFileSync(config.tls.caBundle, 'utf8') : undefined,
        requestCert: config.tls.requestCert !== false,
        rejectUnauthorized: config.tls.rejectUnauthorized !== false,
        ciphers: config.tls.ciphers || 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384',
        minVersion: config.tls.minVersion || 'TLSv1.2',
      };
    }
    this.jwtPublicKeys = [];
    if (config.jwt?.publicKeyPaths) {
      for (const keyPath of config.jwt.publicKeyPaths) {
        try { this.jwtPublicKeys.push(fs.readFileSync(keyPath, 'utf8')); } catch(e) {}
      }
    }
    this.trustedFingerprints = new Set(
      (config.trustedCertFingerprints || []).map(fp => fp.replace(/:/g, '').toLowerCase())
    );
    this.trustedIssuers = config.trustedIssuers || [];
  }

  validateClientCertificate(peerCert) {
    if (!peerCert || !peerCert.fingerprint) return false;
    const fp = peerCert.fingerprint.replace(/:/g, '').toLowerCase();
    if (!this.trustedFingerprints.has(fp)) return false;
    const now = new Date();
    if (peerCert.valid_from && peerCert.valid_to) {
      const validFrom = new Date(peerCert.valid_from);
      const validTo = new Date(peerCert.valid_to);
      if (now < validFrom || now > validTo) return false;
    }
    if (this.trustedIssuers.length > 0 && peerCert.issuer) {
      const issuerMatch = this.trustedIssuers.some(trusted =>
        peerCert.issuer.CN === trusted || peerCert.issuerCertificate === trusted
      );
      if (!issuerMatch) return false;
    }
    return true;
  }

  extractBearerToken(req) {
    const auth = req.headers['authorization'];
    if (!auth) return null;
    const parts = auth.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
    return parts[1];
  }

  verifyJwt(token) {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;
    let header;
    try {
      header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    } catch (e) { return null; }
    const alg = header.alg;
    if (!['RS256', 'RS384', 'RS512'].includes(alg)) return null;
    const algMap = { RS256: 'RSA-SHA256', RS384: 'RSA-SHA384', RS512: 'RSA-SHA512' };
    const verifyAlg = algMap[alg];
    const signingInput = `${headerB64}.${payloadB64}`;
    const signature = Buffer.from(signatureB64, 'base64url');
    for (const key of this.jwtPublicKeys) {
      try {
        const verifier = crypto.createVerify(verifyAlg);
        verifier.update(signingInput);
        if (verifier.verify(key, signature)) {
          const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
          const now = Math.floor(Date.now() / 1000);
          const tolerance = 30;
          if (payload.exp && payload.exp + tolerance < now) return null;
          if (payload.nbf && payload.nbf - tolerance > now) return null;
          if (payload.iat && payload.iat - tolerance > now) return null;
          return { header, payload };
        }
      } catch(e) {}
    }
    return null;
  }

  buildContext(req, jwtPayload) {
    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    return {
      method: req.method,
      path: reqUrl.pathname,
      query: Object.fromEntries(reqUrl.searchParams),
      headers: req.headers,
      sourceIP: req.socket.remoteAddress || 'unknown',
      user: jwtPayload ? jwtPayload.payload : null,
      devicePosture: req.headers['x-device-posture'] || 'unknown',
      jwt: jwtPayload,
      timestamp: Date.now(),
    };
  }

  async handleRequest(clientReq, clientRes) {
    this.activeRequests++;
    this.metrics.gaugeActiveRequests(this.activeRequests);
    const requestId = crypto.randomUUID();
    try {
      const reqUrl = new URL(clientReq.url, `http://${clientReq.headers.host || 'localhost'}`);
      if (reqUrl.pathname === '/health') {
        clientRes.writeHead(200, { 'Content-Type': 'application/json' });
        clientRes.end(JSON.stringify({ status: this.shuttingDown ? 'shutting_down' : 'ok', uptime: Math.floor((Date.now() - this.startTime) / 1000) }));
        return;
      }
      if (reqUrl.pathname === '/metrics' && this.metrics.enabled) {
        clientRes.writeHead(200, { 'Content-Type': 'text/plain' });
        clientRes.end(await this.metrics.getMetrics());
        return;
      }
      if (reqUrl.pathname === '/admin/reload' && clientReq.method === 'POST') {
        const token = clientReq.headers['x-admin-token'];
        if (token !== this.adminToken) {
          clientRes.writeHead(403);
          clientRes.end('Forbidden');
          return;
        }
        this.configManager.config = this.configManager.load();
        this.loadConfigData(this.configManager.config);
        clientRes.writeHead(200, { 'Content-Type': 'application/json' });
        clientRes.end(JSON.stringify({ status: 'reloaded' }));
        return;
      }

      const peerCert = clientReq.socket.getPeerCertificate();
      if (!this.validateClientCertificate(peerCert)) {
        this.metrics.recordRequest(reqUrl.method, reqUrl.pathname, 403);
        clientRes.writeHead(403, { 'Content-Type': 'text/plain' });
        clientRes.end('Client certificate invalid');
        return;
      }

      const token = this.extractBearerToken(clientReq);
      if (!token) {
        this.metrics.recordRequest(reqUrl.method, reqUrl.pathname, 401);
        clientRes.writeHead(401, { 'Content-Type': 'text/plain' });
        clientRes.end('Missing bearer token');
        return;
      }

      const jwtPayload = this.verifyJwt(token);
      if (!jwtPayload) {
        this.metrics.recordRequest(reqUrl.method, reqUrl.pathname, 401);
        clientRes.writeHead(401, { 'Content-Type': 'text/plain' });
        clientRes.end('Invalid token');
        return;
      }

      const ctx = this.buildContext(clientReq, jwtPayload);
      ctx.requestId = requestId;

      if (this.rateLimiter && !(await this.rateLimiter.isAllowed(ctx))) {
        this.metrics.recordRequest(ctx.method, ctx.path, 429);
        clientRes.writeHead(429, { 'Content-Type': 'text/plain' });
        clientRes.end('Too Many Requests');
        return;
      }

      const decision = this.policyEngine.evaluate(ctx);
      this.metrics.recordPolicyDecision(decision);
      if (decision === 'deny') {
        this.metrics.recordRequest(ctx.method, ctx.path, 403);
        clientRes.writeHead(403, { 'Content-Type': 'text/plain' });
        clientRes.end('Access denied by policy');
        return;
      }

      await this.circuitBreaker.call(() => this.backendPool.proxy(clientReq, clientRes, ctx, this.circuitBreaker));
      this.metrics.recordRequest(ctx.method, ctx.path, 200);
    } catch (err) {
      this.logger.error(`Request error: ${err.message}`, { requestId });
      if (!clientRes.headersSent) {
        clientRes.writeHead(500, { 'Content-Type': 'text/plain' });
        clientRes.end('Internal Server Error');
      }
      this.metrics.recordRequest('UNKNOWN', 'UNKNOWN', 500);
    } finally {
      this.activeRequests--;
      this.metrics.gaugeActiveRequests(this.activeRequests);
    }
  }

  start() {
    const server = https.createServer(this.tlsOptions, (req, res) => {
      this.handleRequest(req, res).catch((err) => {
        this.logger.error(`Unhandled: ${err.stack}`);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end();
        }
      });
    });
    server.on('upgrade', (req, socket, head) => {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
    });
    server.on('clientError', (err, socket) => {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    });
    const port = this.configManager.config.listenPort || 443;
    server.listen(port, () => {
      this.logger.info(`ZTNA Gateway listening on port ${port}`);
    });

    process.on('SIGTERM', () => {
      this.shuttingDown = true;
      server.close(() => {
        this.logger.info('Server closed');
        process.exit(0);
      });
    });
    process.on('SIGINT', () => {
      this.shuttingDown = true;
      server.close(() => process.exit(0));
    });
  }
}

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  console.log(`Primary ${process.pid} started, forking ${numCPUs} workers`);
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  cluster.on('exit', (worker, code) => {
    console.log(`Worker ${worker.process.pid} died, restarting...`);
    cluster.fork();
  });
} else {
  const configPath = process.env.ZTNA_CONFIG || './ztna.yaml';
  if (!fs.existsSync(configPath)) {
    console.error('Configuration file not found:', configPath);
    process.exit(1);
  }
  const gateway = new ZTNAGateway(configPath);
  gateway.start();
}
