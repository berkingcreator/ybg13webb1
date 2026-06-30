// "İnsanların en hayırlısı, insanlara faydalı olandır." - Hz. Muhammed (s.a.v)
'use strict';
const https = require('https');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const cluster = require('cluster');
const net = require('net');
const stream = require('stream');
const path = require('path');
const CONFIG = {
  listenPort: parseInt(process.env.ZTNA_PORT, 10) || 443,
  backendServers: [
    { host: 'backend1.internal', port: 8080, weight: 3 },
    { host: 'backend2.internal', port: 8080, weight: 2 },
    { host: 'backend3.internal', port: 8080, weight: 1 },
  ],
  tls: {
    serverKey: process.env.TLS_KEY_PATH || '/etc/ztna/server.key',
    serverCert: process.env.TLS_CERT_PATH || '/etc/ztna/server.crt',
    caBundle: process.env.TLS_CA_PATH || '/etc/ztna/ca-bundle.crt',
    requestCert: true,
    rejectUnauthorized: true,
    ciphers: 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384',
    minVersion: 'TLSv1.2',
  },
  jwt: {
    publicKeyPaths: process.env.JWT_KEYS ? process.env.JWT_KEYS.split(',') : ['/etc/ztna/jwt_key1.pem', '/etc/ztna/jwt_key2.pem'],
    algorithms: ['RS256', 'RS384', 'RS512'],
    requiredClaims: ['sub', 'exp', 'iat'],
    clockTolerance: 30,
  },
  trustedCertFingerprints: [
    'AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01',
    '12:34:56:78:9A:BC:DE:F0:12:34:56:78:9A:BC:DE:F0:12:34:56:78',
    'FE:DC:BA:98:76:54:32:10:FE:DC:BA:98:76:54:32:10:FE:DC:BA:98',
  ],
  trustedIssuers: [
    '/C=TR/O=ZTNA Org/CN=ZTNA Root CA',
    '/C=TR/O=Security Corp/CN=Internal Issuing CA',
  ],
  devicePostureHeader: 'x-device-posture',
  postureExpectedValue: 'compliant',
  rateLimiting: {
    enabled: true,
    tokensPerInterval: 100,
    intervalMs: 1000,
    bucketCapacity: 200,
    cleanupIntervalMs: 60000,
    maxEntries: 10000,
  },
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeoutMs: 30000,
    halfOpenMaxRequests: 3,
    monitorIntervalMs: 5000,
  },
  policyRules: [
    {
      name: 'allow-health-check',
      priority: 1,
      condition: (ctx) => ctx.path === '/health' && ctx.method === 'GET',
      action: 'allow',
    },
    {
      name: 'deny-admin-paths-for-guests',
      priority: 10,
      condition: (ctx) => ctx.path.startsWith('/admin') && ctx.user && ctx.user.role === 'guest',
      action: 'deny',
    },
    {
      name: 'allow-internal-api-for-employees',
      priority: 20,
      condition: (ctx) => ctx.path.startsWith('/api/internal') && ctx.user && ctx.user.role === 'employee' && ctx.devicePosture === 'compliant',
      action: 'allow',
    },
    {
      name: 'allow-external-api-for-partners',
      priority: 30,
      condition: (ctx) => ctx.path.startsWith('/api/external') && ctx.user && (ctx.user.role === 'partner' || ctx.user.role === 'employee'),
      action: 'allow',
    },
    {
      name: 'restrict-sensitive-by-ip',
      priority: 40,
      condition: (ctx) => ctx.path.startsWith('/sensitive') && ctx.sourceIP && ctx.sourceIP.startsWith('10.'),
      action: 'allow',
    },
    {
      name: 'deny-blacklisted-paths',
      priority: 100,
      condition: (ctx) => ['/wp-admin', '/.env', '/config.php', '/.git'].some((p) => ctx.path.toLowerCase().includes(p)),
      action: 'deny',
    },
    {
      name: 'default-deny',
      priority: 999,
      condition: () => true,
      action: 'deny',
    },
  ],
  log: {
    file: process.env.LOG_FILE || '/var/log/ztna-gateway.log',
    level: process.env.LOG_LEVEL || 'info',
    maxFileSize: 10 * 1024 * 1024,
  },
  requestTimeoutMs: 30000,
  backendMaxSockets: 50,
};
class Logger {
  constructor(config) {
    this.file = config.file;
    this.level = config.level;
    this.maxSize = config.maxFileSize;
    this.levels = { debug: 10, info: 20, warn: 30, error: 40 };
    this.currentLevel = this.levels[this.level] || 20;
    this.stream = fs.createWriteStream(this.file, { flags: 'a' });
    this.stream.on('error', (err) => { process.stderr.write(`Log hatasi: ${err.message}\n`); });
  }
  formatMessage(level, message, meta) {
    const timestamp = new Date().toISOString();
    let metaStr = '';
    if (meta) {
      try {
        metaStr = JSON.stringify(meta);
      } catch (e) {
        metaStr = '[serilestirilemez]';
      }
    }
    return `${timestamp} [${level.toUpperCase()}] ${message} ${metaStr}`;
  }
  log(level, message, meta) {
    if (this.levels[level] < this.currentLevel) return;
    const formatted = this.formatMessage(level, message, meta);
    this.stream.write(formatted + '\n');
    process.stdout.write(formatted + '\n');
  }
  debug(msg, meta) { this.log('debug', msg, meta); }
  info(msg, meta) { this.log('info', msg, meta); }
  warn(msg, meta) { this.log('warn', msg, meta); }
  error(msg, meta) { this.log('error', msg, meta); }
  rotateIfNeeded() {
    try {
      const stats = fs.statSync(this.file);
      if (stats.size > this.maxSize) {
        this.stream.end();
        const rotated = this.file + '.' + Date.now();
        fs.renameSync(this.file, rotated);
        this.stream = fs.createWriteStream(this.file, { flags: 'a' });
      }
    } catch (e) {}
  }
}
class CircuitBreaker {
  constructor(name, config, logger) {
    this.name = name;
    this.failureThreshold = config.failureThreshold;
    this.resetTimeout = config.resetTimeoutMs;
    this.halfOpenMaxRequests = config.halfOpenMaxRequests;
    this.logger = logger;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.state = 'CLOSED';
    this.halfOpenCount = 0;
  }
  async call(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.halfOpenCount = 0;
        this.logger.info(`Devre kesici ${this.name} HALF_OPEN durumuna gecti`);
      } else {
        throw new Error(`Devre kesici ${this.name} su an OPEN durumunda`);
      }
    }
    try {
      const result = await fn();
      if (this.state === 'HALF_OPEN') {
        this.halfOpenCount++;
        if (this.halfOpenCount >= this.halfOpenMaxRequests) {
          this.reset();
          this.logger.info(`Devre kesici ${this.name} basarili denemeler sonrasi CLOSED durumuna gecti`);
        }
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
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.logger.warn(`Devre kesici ${this.name} ardardina hatalar sebebiyle OPEN durumuna gecti`);
    }
  }
  reset() {
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.state = 'CLOSED';
    this.halfOpenCount = 0;
  }
  getStatus() {
    return { name: this.name, state: this.state, failures: this.failureCount, lastFailure: new Date(this.lastFailureTime).toISOString() };
  }
}
class RateLimiter {
  constructor(config, logger) {
    this.tokensPerInterval = config.tokensPerInterval;
    this.intervalMs = config.intervalMs;
    this.capacity = config.bucketCapacity;
    this.cleanupIntervalMs = config.cleanupIntervalMs;
    this.maxEntries = config.maxEntries;
    this.logger = logger;
    this.buckets = new Map();
    this.cleanupTimer = setInterval(() => this.cleanup(), this.cleanupIntervalMs);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }
  getKey(ctx) {
    const user = ctx.user ? ctx.user.sub : 'anonymous';
    const ip = ctx.sourceIP || 'unknown';
    return `${user}:${ip}`;
  }
  refill(bucket, now) {
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor(elapsed * (this.tokensPerInterval / this.intervalMs));
    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(bucket.tokens + tokensToAdd, this.capacity);
      bucket.lastRefill = now;
    }
  }
  consume(key, tokens = 1) {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now };
      this.buckets.set(key, bucket);
    }
    this.refill(bucket, now);
    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return true;
    }
    return false;
  }
  isAllowed(ctx) {
    const key = this.getKey(ctx);
    return this.consume(key);
  }
  cleanup() {
    if (this.buckets.size > this.maxEntries) {
      const keys = Array.from(this.buckets.keys());
      const toDelete = keys.slice(0, keys.length - this.maxEntries);
      for (const k of toDelete) this.buckets.delete(k);
      this.logger.debug(`Hiz sinirlayici ${toDelete.length} eski kaydi temizledi`);
    }
  }
  getStatus() {
    return { activeEntries: this.buckets.size, capacity: this.capacity };
  }
}
class PolicyEngine {
  constructor(rules, logger) {
    this.rules = rules.sort((a, b) => a.priority - b.priority);
    this.logger = logger;
  }
  evaluate(context) {
    for (const rule of this.rules) {
      try {
        const matches = rule.condition(context);
        if (matches) {
          this.logger.debug(`Politika kurali eslesti: ${rule.name} eylem=${rule.action}`);
          return rule.action;
        }
      } catch (err) {
        this.logger.warn(`Kural degerlendirme hatasi ${rule.name}: ${err.message}`);
      }
    }
    return 'deny';
  }
}
class ZTNAGateway {
  constructor(config) {
    this.config = config;
    this.logger = new Logger(config.log);
    this.policyEngine = new PolicyEngine(config.policyRules, this.logger);
    this.rateLimiter = config.rateLimiting.enabled ? new RateLimiter(config.rateLimiting, this.logger) : null;
    this.circuitBreaker = new CircuitBreaker('backend-cluster', config.circuitBreaker, this.logger);
    this.backendAgent = new http.Agent({
      keepAlive: true,
      maxSockets: config.backendMaxSockets,
      keepAliveMsecs: 5000,
      timeout: config.requestTimeoutMs,
    });
    this.serverKey = this.readFileSafe(config.tls.serverKey);
    this.serverCert = this.readFileSafe(config.tls.serverCert);
    this.caBundle = this.readFileSafe(config.tls.caBundle);
    this.jwtPublicKeys = [];
    for (const keyPath of config.jwt.publicKeyPaths) {
      try {
        const pem = fs.readFileSync(keyPath, 'utf8');
        this.jwtPublicKeys.push(pem);
      } catch (e) {
        this.logger.warn(`JWT anahtari yuklenemedi ${keyPath}: ${e.message}`);
      }
    }
    if (this.jwtPublicKeys.length === 0) {
      throw new Error('Hicbir JWT acik anahtari yuklenemedi');
    }
    this.certFingerprints = new Set(config.trustedCertFingerprints.map((fp) => fp.replace(/:/g, '').toLowerCase()));
    this.server = null;
    this.activeRequests = 0;
    this.startTime = null;
    this.shuttingDown = false;
  }
  readFileSafe(filePath) {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      this.logger.error(`Dosya okunamadi ${filePath}: ${e.message}`);
      throw e;
    }
  }
  validateClientCertificate(peerCert) {
    if (!peerCert || !peerCert.fingerprint) {
      return false;
    }
    const fp = peerCert.fingerprint.replace(/:/g, '').toLowerCase();
    if (!this.certFingerprints.has(fp)) {
      this.logger.warn(`Bilinmeyen istemci sertifikasi parmak izi: ${peerCert.fingerprint}`);
      return false;
    }
    const now = new Date();
    if (peerCert.valid_from && peerCert.valid_to) {
      const validFrom = new Date(peerCert.valid_from);
      const validTo = new Date(peerCert.valid_to);
      if (now < validFrom || now > validTo) {
        this.logger.warn('Istemci sertifikasi suresi dolmus veya henuz gecerli degil');
        return false;
      }
    }
    if (peerCert.issuer && this.config.trustedIssuers.length > 0) {
      const issuerMatch = this.config.trustedIssuers.some((trusted) => peerCert.issuer.CN === trusted || peerCert.issuerCertificate === trusted);
      if (!issuerMatch) {
        this.logger.warn(`Istemci sertifikasi saglayicisi guvenilir degil: ${JSON.stringify(peerCert.issuer)}`);
        return false;
      }
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
      const headerStr = Buffer.from(headerB64, 'base64url').toString('utf8');
      header = JSON.parse(headerStr);
    } catch (e) {
      return null;
    }
    const alg = header.alg;
    if (!this.config.jwt.algorithms.includes(alg)) {
      this.logger.warn(`JWT algoritmasina izin verilmiyor: ${alg}`);
      return null;
    }
    const algMap = { 'RS256': 'RSA-SHA256', 'RS384': 'RSA-SHA384', 'RS512': 'RSA-SHA512' };
    const verifyAlg = algMap[alg];
    if (!verifyAlg) {
      this.logger.warn(`Desteklenmeyen JWT algoritmasi eslesmesi: ${alg}`);
      return null;
    }
    const signingInput = `${headerB64}.${payloadB64}`;
    const signature = Buffer.from(signatureB64, 'base64url');
    let verified = false;
    let matchingKeyIndex = -1;
    for (let i = 0; i < this.jwtPublicKeys.length; i++) {
      try {
        const key = this.jwtPublicKeys[i];
        const verifier = crypto.createVerify(verifyAlg);
        verifier.update(signingInput);
        if (verifier.verify(key, signature)) {
          verified = true;
          matchingKeyIndex = i;
          break;
        }
      } catch (e) {}
    }
    if (!verified) {
      this.logger.warn('JWT imza dogrulamasi basarisiz oldu');
      return null;
    }
    let payload;
    try {
      const payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
      payload = JSON.parse(payloadStr);
    } catch (e) {
      return null;
    }
    const now = Math.floor(Date.now() / 1000);
    const tolerance = this.config.jwt.clockTolerance;
    if (payload.exp && payload.exp + tolerance < now) {
      this.logger.warn('JWT suresi dolmus');
      return null;
    }
    if (payload.nbf && payload.nbf - tolerance > now) {
      this.logger.warn('JWT henuz gecerli degil');
      return null;
    }
    if (payload.iat && payload.iat - tolerance > now) {
      this.logger.warn('JWT gelecekte basilmis');
      return null;
    }
    for (const claim of this.config.jwt.requiredClaims) {
      if (!(claim in payload)) {
        this.logger.warn(`JWT eksik zorunlu beyan iceriyor: ${claim}`);
        return null;
      }
    }
    return { header, payload, keyIndex: matchingKeyIndex };
  }
  extractDevicePosture(req) {
    return req.headers[this.config.devicePostureHeader] || 'unknown';
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
      devicePosture: this.extractDevicePosture(req),
      jwt: jwtPayload,
      timestamp: Date.now(),
    };
  }
  selectBackend() {
    const servers = this.config.backendServers;
    if (servers.length === 0) return null;
    if (servers.length === 1) return servers[0];
    const totalWeight = servers.reduce((acc, s) => acc + s.weight, 0);
    let random = Math.floor(Math.random() * totalWeight);
    for (const server of servers) {
      if (random < server.weight) return server;
      random -= server.weight;
    }
    return servers[0];
  }
  proxyRequest(clientReq, clientRes, context) {
    return new Promise((resolve, reject) => {
      const backend = this.selectBackend();
      if (!backend) {
        this.logger.error('Kullanilabilir arka uc sunucusu yok');
        if (!clientRes.headersSent) {
          clientRes.writeHead(503, { 'Content-Type': 'text/plain' });
          clientRes.end('Hizmet Yok');
        }
        return reject(new Error('Arka uc bulunamadi'));
      }
      const options = {
        hostname: backend.host,
        port: backend.port,
        path: clientReq.url,
        method: clientReq.method,
        headers: { ...clientReq.headers },
        agent: this.backendAgent,
        timeout: this.config.requestTimeoutMs,
      };
      delete options.headers['host'];
      options.headers['host'] = backend.host;
      options.headers['x-forwarded-for'] = context.sourceIP;
      if (context.user && context.user.sub) {
        options.headers['x-authenticated-user'] = context.user.sub;
      }
      options.headers['x-request-id'] = context.requestId || crypto.randomUUID();
      const proxyReq = http.request(options, (proxyRes) => {
        clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(clientRes);
        clientRes.on('finish', resolve);
      });
      proxyReq.on('timeout', () => {
        proxyReq.destroy(new Error('Arka uc istegi zaman asimina ugradi'));
      });
      proxyReq.on('error', (err) => {
        this.logger.error(`Arka uc istegi basarisiz oldu ${backend.host}:${backend.port} - ${err.message}`);
        if (!clientRes.headersSent) {
          clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
          clientRes.end('Kotü Ag Gecidi');
        } else {
          clientRes.end();
        }
        reject(err);
      });
      clientReq.pipe(proxyReq);
    });
  }
  handleHealth(clientReq, clientRes) {
    const status = {
      status: this.shuttingDown ? 'shutting_down' : 'ok',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      activeRequests: Math.max(0, this.activeRequests - 1),
      circuitBreaker: this.circuitBreaker.getStatus(),
      rateLimiter: this.rateLimiter ? this.rateLimiter.getStatus() : 'disabled',
      version: '1.0.0',
    };
    clientRes.writeHead(200, { 'Content-Type': 'application/json' });
    clientRes.end(JSON.stringify(status));
  }
  async handleRequest(clientReq, clientRes) {
    this.activeRequests++;
    const requestId = crypto.randomUUID();
    try {
      const reqUrl = new URL(clientReq.url, `http://${clientReq.headers.host || 'localhost'}`);
      if (reqUrl.pathname === '/health' && clientReq.method === 'GET') {
        this.handleHealth(clientReq, clientRes);
        return;
      }
      const peerCert = clientReq.socket.getPeerCertificate();
      if (!this.validateClientCertificate(peerCert)) {
        clientRes.writeHead(403, { 'Content-Type': 'text/plain' });
        clientRes.end('Erisim Reddedildi: Gecersiz istemci sertifikasi');
        return;
      }
      const token = this.extractBearerToken(clientReq);
      if (!token) {
        clientRes.writeHead(401, { 'Content-Type': 'text/plain' });
        clientRes.end('Erisim Reddedildi: Yetkilendirme tokeni eksik');
        return;
      }
      const jwtPayload = this.verifyJwt(token);
      if (!jwtPayload) {
        clientRes.writeHead(401, { 'Content-Type': 'text/plain' });
        clientRes.end('Erisim Reddedildi: Gecersiz veya suresi dolmus token');
        return;
      }
      const context = this.buildContext(clientReq, jwtPayload);
      context.requestId = requestId;
      if (this.rateLimiter && !this.rateLimiter.isAllowed(context)) {
        clientRes.writeHead(429, { 'Content-Type': 'text/plain' });
        clientRes.end('Cok Fazla Istek');
        return;
      }
      const policyDecision = this.policyEngine.evaluate(context);
      if (policyDecision === 'deny') {
        clientRes.writeHead(403, { 'Content-Type': 'text/plain' });
        clientRes.end('Erisim Politikalar Tarafindan Reddedildi');
        return;
      }
      await this.circuitBreaker.call(() => this.proxyRequest(clientReq, clientRes, context));
    } catch (err) {
      this.logger.error(`Istek isleme hatasi: ${err.message}`);
      if (!clientRes.headersSent) {
        clientRes.writeHead(500, { 'Content-Type': 'text/plain' });
        clientRes.end('Dahili Sunucu Hatasi');
      }
    } finally {
      this.activeRequests--;
    }
  }
  handleUpgrade(clientReq, clientSocket, head) {
    this.logger.info('WebSocket yukseltme istegi alindi');
    clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    clientSocket.destroy();
  }
  gracefulShutdown() {
    this.logger.info('Zarif kapatma baslatiliyor...');
    this.shuttingDown = true;
    if (this.server) {
      this.server.close(() => {
        this.logger.info('Sunucu kapatildi, baglantilar temizleniyor...');
        this.backendAgent.destroy();
        process.exit(0);
      });
      setTimeout(() => {
        this.logger.warn('Zaman asimi sonrasi zorla kapatma');
        process.exit(1);
      }, 15000);
    }
  }
  start() {
    const tlsOptions = {
      key: this.serverKey,
      cert: this.serverCert,
      ca: this.caBundle,
      requestCert: this.config.tls.requestCert,
      rejectUnauthorized: this.config.tls.rejectUnauthorized,
      ciphers: this.config.tls.ciphers,
      minVersion: this.config.tls.minVersion,
    };
    this.server = https.createServer(tlsOptions, (req, res) => {
      this.handleRequest(req, res).catch((err) => {
        this.logger.error(`Istekte yakalanamayan hata: ${err.stack}`);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end();
        }
      });
    });
    this.server.on('upgrade', (req, socket, head) => {
      this.handleUpgrade(req, socket, head);
    });
    this.server.on('clientError', (err, socket) => {
      this.logger.warn(`Istemci hatasi: ${err.message}`);
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    });
    this.server.listen(this.config.listenPort, () => {
      this.startTime = Date.now();
      this.logger.info(`ZTNA Gateway ${this.config.listenPort} portunda dinleniyor`);
      this.logger.info(`${this.jwtPublicKeys.length} JWT acik anahtari yuklendi`);
      this.logger.info(`Politika motoru kural sayisi: ${this.config.policyRules.length}`);
    });
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('SIGINT', () => this.gracefulShutdown());
  }
}
if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  console.log(`Ana islem ${process.pid} baslatildi, ${numCPUs} isci olusturuluyor`);
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Isci ${worker.process.pid} sonlandi, yeniden baslatiliyor...`);
    cluster.fork();
  });
} else {
  try {
    const gateway = new ZTNAGateway(CONFIG);
    gateway.start();
  } catch (err) {
    console.error(`Isci ${process.pid} baslatilamadi: ${err.stack}`);
    process.exit(1);
  }
}
