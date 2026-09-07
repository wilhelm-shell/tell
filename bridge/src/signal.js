import { spawn as defaultSpawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import net from 'node:net';

export const STATUS = Object.freeze({
  DISABLED: 'disabled',
  NOT_INSTALLED: 'not-installed',
  STARTING: 'starting',
  READY: 'ready',
  CRASHED: 'crashed',
  RETRYING: 'retrying',
});

const RETRY_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];
const POLL_INTERVAL_MS = 500;
const POLL_MAX_ATTEMPTS = 60; // 30s

export class SignalManager extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.enabled = opts.enabled === true;
    this.bin = opts.bin || 'signal-cli';
    this.rpcHost = opts.rpcHost || '127.0.0.1';
    this.rpcPort = opts.rpcPort || 7583;
    this.spawnFn = opts.spawnFn || defaultSpawn;
    this.setTimeoutFn = opts.setTimeoutFn || setTimeout;
    this._status = STATUS.DISABLED;
    this._proc = null;
    this._retryAttempt = 0;
    this._stopped = false;
  }

  get status() { return this._status; }

  _setStatus(status, message) {
    if (this._status === status) return;
    this._status = status;
    this.emit('status', message ? { status, message } : { status });
  }

  async start() {
    if (!this.enabled) {
      this._setStatus(STATUS.DISABLED);
      return;
    }
    this._stopped = false;
    this._spawnOnce();
  }

  _spawnOnce() {
    this._setStatus(STATUS.STARTING);
    let proc;
    try {
      proc = this.spawnFn(
        this.bin,
        ['daemon', '--tcp', `${this.rpcHost}:${this.rpcPort}`],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
    } catch (e) {
      // NOT_INSTALLED is a hard error — don't retry, the binary won't
      // appear on its own. User needs to install signal-cli.
      this._setStatus(STATUS.NOT_INSTALLED, e.message);
      return;
    }
    this._proc = proc;

    proc.on('error', (err) => {
      if (this._proc !== proc) return;
      if (err.code === 'ENOENT') {
        this._proc = null;
        this._setStatus(STATUS.NOT_INSTALLED, err.message);
      } else {
        this._setStatus(STATUS.CRASHED, err.message);
      }
    });

    proc.on('exit', (code, signal) => {
      if (this._proc !== proc) return;
      this._proc = null;
      if (this._stopped) return;
      this._setStatus(STATUS.CRASHED, `exited (code=${code}, signal=${signal})`);
      this._scheduleRetry();
    });

    this._pollReady(proc, 0);
  }

  _pollReady(proc, attempt) {
    if (this._stopped || this._proc !== proc) return;
    if (attempt >= POLL_MAX_ATTEMPTS) {
      this._setStatus(STATUS.CRASHED, 'ready timeout');
      try { proc.kill(); } catch (_) {}
      return;
    }
    const sock = net.connect(this.rpcPort, this.rpcHost);
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      try { sock.destroy(); } catch (_) {}
    };
    sock.once('connect', () => {
      done();
      if (this._stopped || this._proc !== proc) return;
      this._retryAttempt = 0;
      this._setStatus(STATUS.READY);
    });
    sock.once('error', () => {
      done();
      this.setTimeoutFn(() => this._pollReady(proc, attempt + 1), POLL_INTERVAL_MS);
    });
  }

  _scheduleRetry() {
    if (this._stopped) return;
    const delay = RETRY_DELAYS_MS[Math.min(this._retryAttempt, RETRY_DELAYS_MS.length - 1)];
    this._retryAttempt++;
    this._setStatus(STATUS.RETRYING, `retry in ${delay}ms`);
    this.setTimeoutFn(() => {
      if (!this._stopped) this._spawnOnce();
    }, delay);
  }

  stop() {
    this._stopped = true;
    if (this._proc) {
      const p = this._proc;
      this._proc = null;
      try { p.kill(); } catch (_) {}
    }
  }
}
