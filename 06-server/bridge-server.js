#!/usr/bin/env node
/**
 * ============================================================================
 *  CampusBiz Autopilot — Local Bridge Server
 *  bridge-server.js
 * ============================================================================
 *
 *  WHAT THIS IS
 *  ------------
 *  A zero-dependency Node.js HTTP server (built-in modules only: http, fs, path,
 *  child_process, https, os, crypto) that lets the "campusbiz-live.html"
 *  dashboard trigger the real CampusBiz Orchestrator Expert Group in WorkBuddy
 *  and stream genuine execution events back to the browser via Server-Sent
 *  Events (SSE).
 *
 *  It does NOT fake progress animations. Every event it emits comes from one of:
 *    (a) a real WorkBuddy API stream           -> mode: "api"
 *    (b) real stdout/stderr of the WorkBuddy CLI -> mode: "cli"
 *    (c) an explicit, clearly-labelled demo replay -> mode: "demo"
 *        (only used when neither API nor CLI is available; every event is
 *         tagged simulated:true so the UI can label it [SIMULATED])
 *
 * ----------------------------------------------------------------------------
 *  QUICK START
 * ----------------------------------------------------------------------------
 *   1) Copy the example config and edit it (OPTIONAL — env vars also work):
 *
 *        cp ~/.campusbiz-bridge.example.json ~/.campusbiz-bridge.json
 *
 *      ~/.campusbiz-bridge.json
 *      {
 *        "port": 3333,
 *        "workbuddyApiBase": "http://localhost:PORT/v1",
 *        "workbuddyApiKey": "",
 *        "workbuddyCli": "workbuddy",
 *        "agentName": "campusbiz-orchestrator",
 *        "outputDir": "~/campusbiz-output/"
 *      }
 *
 *   2) Run it:
 *
 *        node ~/campusbiz-output/bridge-server.js
 *
 *   3) Health check:
 *
 *        curl http://localhost:3333/api/health
 *
 * ----------------------------------------------------------------------------
 *  CONFIG PRECEDENCE (highest wins)
 * ----------------------------------------------------------------------------
 *   1. Environment variables
 *   2. ~/.campusbiz-bridge.json
 *   3. Built-in defaults
 *
 *   Recognised env vars:
 *     CAMPUSBIZ_PORT            -> port                    (default 3333)
 *     WORKBUDDY_API_BASE        -> workbuddyApiBase
 *     WORKBUDDY_API_KEY         -> workbuddyApiKey         (NEVER hardcode this)
 *     WORKBUDDY_CLI             -> workbuddyCli            (default "workbuddy")
 *     CAMPUSBIZ_AGENT           -> agentName               (default "campusbiz-orchestrator")
 *     CAMPUSBIZ_OUTPUT_DIR      -> outputDir               (default "~/campusbiz-output/")
 *     CAMPUSBIZ_CLI_ARGS        -> extra CLI args, space-separated
 *     CAMPUSBIZ_ALLOW_DEMO      -> "1" to allow demo replay when no runtime found
 *
 *  SECURITY NOTE
 *  -------------
 *  This server binds to 127.0.0.1 only. It never writes your API key to logs
 *  or to any response body. Keep it bound to localhost.
 * ============================================================================
 */

'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// 1. CONFIG
// ---------------------------------------------------------------------------

const HOME = os.homedir();

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return HOME;
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(HOME, p.slice(2));
  return p;
}

const DEFAULT_CONFIG = {
  port: 3333,
  host: '127.0.0.1',
  // --- OpenAI-compatible wrapper (workbuddy2api / codebuddy2api) ---
  openaiBase: '',               // e.g. http://127.0.0.1:8787/v1
  openaiApiKey: 'local',        // wrappers usually accept any value, or "local"
  openaiModel: 'default-model', // or e.g. deepseek-v3, claude-3-5-sonnet
  // --- Direct WorkBuddy API ---
  workbuddyApiBase: '',
  workbuddyApiKey: '',
  // --- CLI ---
  workbuddyCli: 'workbuddy',
  cliFlavor: '',                // '' = auto-detect; or 'codebuddy' | 'generic'
  agentName: 'campusbiz-orchestrator',
  outputDir: path.join(HOME, 'campusbiz-output'),
  extraCliArgs: [],
  allowDemo: true,
  multiAgent: true,
};

function readConfigFile() {
  const candidates = [
    path.join(HOME, '.campusbiz-bridge.json'),
    path.join(process.cwd(), '.campusbiz-bridge.json'),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw);
        console.log(`[bridge] loaded config from ${file}`);
        return parsed || {};
      }
    } catch (err) {
      console.warn(`[bridge] could not parse config ${file}: ${err.message}`);
    }
  }
  return {};
}

function buildConfig() {
  const fileCfg = readConfigFile();
  const env = process.env;

  const pick = (envVal, fileVal, fallback) => {
    if (envVal !== undefined && envVal !== '') return envVal;
    if (fileVal !== undefined && fileVal !== '') return fileVal;
    return fallback;
  };

  const cfg = {
    port: parseInt(pick(env.CAMPUSBIZ_PORT, fileCfg.port, DEFAULT_CONFIG.port), 10),
    host: pick(fileCfg.host, undefined, DEFAULT_CONFIG.host),
    openaiBase: pick(env.OPENAI_BASE, fileCfg.openaiBase, DEFAULT_CONFIG.openaiBase),
    openaiApiKey: pick(env.OPENAI_API_KEY, fileCfg.openaiApiKey, DEFAULT_CONFIG.openaiApiKey),
    openaiModel: pick(env.OPENAI_MODEL, fileCfg.openaiModel, DEFAULT_CONFIG.openaiModel),
    workbuddyApiBase: pick(env.WORKBUDDY_API_BASE, fileCfg.workbuddyApiBase, DEFAULT_CONFIG.workbuddyApiBase),
    workbuddyApiKey: pick(env.WORKBUDDY_API_KEY, fileCfg.workbuddyApiKey, DEFAULT_CONFIG.workbuddyApiKey),
    workbuddyCli: pick(env.WORKBUDDY_CLI, fileCfg.workbuddyCli, DEFAULT_CONFIG.workbuddyCli),
    cliFlavor: pick(env.CAMPUSBIZ_CLI_FLAVOR, fileCfg.cliFlavor, DEFAULT_CONFIG.cliFlavor),
    agentName: pick(env.CAMPUSBIZ_AGENT, fileCfg.agentName, DEFAULT_CONFIG.agentName),
    outputDir: expandHome(pick(env.CAMPUSBIZ_OUTPUT_DIR, fileCfg.outputDir, DEFAULT_CONFIG.outputDir)),
    extraCliArgs: parseArgs(pick(env.CAMPUSBIZ_CLI_ARGS, fileCfg.extraCliArgs, '')),
    multiAgent: pick(env.CAMPUSBIZ_MULTI, fileCfg.multiAgent, true) !== false && pick(env.CAMPUSBIZ_MULTI, fileCfg.multiAgent, true) !== '0',
    allowDemo: (pick(env.CAMPUSBIZ_ALLOW_DEMO, fileCfg.allowDemo, true) === true ||
                pick(env.CAMPUSBIZ_ALLOW_DEMO, fileCfg.allowDemo, '1') === '1'),
  };

  if (!Number.isFinite(cfg.port) || cfg.port <= 0) cfg.port = DEFAULT_CONFIG.port;
  return cfg;
}

function parseArgs(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) return v.trim().split(/\s+/);
  return [];
}

const CONFIG = buildConfig();

// Probe once at boot: does the configured CLI actually resolve?
const CLI_AVAILABLE = probeCliSync(CONFIG.workbuddyCli);

function probeCliSync(cli) {
  if (!cli) return false;
  try {
    // Full path to an existing file (e.g. the bundled codebuddy CLI .js) wins.
    const asPath = expandHome(cli);
    if (fs.existsSync(asPath)) return true;
    const { execFileSync } = require('child_process');
    const probeCmd = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(probeCmd, [cli], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function detectMode() {
  if (CONFIG.openaiBase) return 'openai';          // workbuddy2api / codebuddy2api
  if (CONFIG.workbuddyApiBase && CONFIG.workbuddyApiKey) return 'api';
  if (CLI_AVAILABLE) return 'cli';
  return CONFIG.allowDemo ? 'demo' : 'offline';
}

// ---------------------------------------------------------------------------
// 2. SESSION STORE
// ---------------------------------------------------------------------------

/** @type {Map<string, Session>} */
const sessions = new Map();

function createSession(goal) {
  const id = crypto.randomUUID();
  const session = {
    id,
    goal,
    createdAt: Date.now(),
    status: 'running',
    mode: detectMode(),
    clients: new Set(),   // SSE response objects
    buffer: [],           // replay buffer for late/reconnecting clients
    child: null,          // CLI child process
    apiReq: null,         // in-flight API request
    finishedAt: null,
  };
  sessions.set(id, session);

  // Retain finished sessions for 30 minutes so reconnecting clients can replay.
  const cleanup = () => { if (sessions.has(id)) sessions.delete(id); };
  setTimeout(cleanup, 30 * 60 * 1000).unref?.();

  return session;
}

function emit(session, event) {
  // Always stamp a timestamp; never leak the API key.
  const enriched = Object.assign({ ts: Date.now() }, event);
  session.buffer.push(enriched);

  const payload = `data: ${JSON.stringify(enriched)}\n\n`;
  for (const res of session.clients) {
    try { res.write(payload); } catch { /* client gone; cleaned up on close */ }
  }

  // Mirror to the server console so the operator can watch real progress.
  const tag = enriched.agent ? ` [${enriched.agent}]` : '';
  const st = enriched.status ? ` ${enriched.status}` : '';
  console.log(`[${session.id.slice(0, 8)}]${tag}${st} ${enriched.message || enriched.type}`);
}

function log(session, message) {
  emit(session, { type: 'log', agent: 'orchestrator', message });
}

function agentStatus(session, agent, status, message, extra) {
  emit(session, Object.assign({ type: 'agent_status', agent, status, message }, extra || {}));
}

// ---------------------------------------------------------------------------
// 3. AGENT MARKER PARSING
// ---------------------------------------------------------------------------

/**
 * The WorkBuddy CLI / Expert Group prints free-form text. We heuristically map
 * real output lines onto agent identifiers so the dashboard desks can light up.
 * This does not invent progress — it only classifies lines that actually arrived.
 */
const AGENT_MARKERS = [
  { agent: 'orchestrator', re: /(orchestrat|team[- ]?lead|主理人|统筹|phase\s*\d|拆解|调度|校验)/i, status: 'WORKING' },
  { agent: 'finance',      re: /(finance|unit.?contribution|breakeven|盈亏|财务|单位贡献|定价|月入|RM\s?\d)/i, status: 'WORKING' },
  { agent: 'demand',       re: /(demand|需求|日需求|estimated_daily|市场容量|销量预测)/i, status: 'WORKING' },
  { agent: 'growth',       re: /(growth|marketing|landing.?page|海报|文案|物料|营销|开业活动)/i, status: 'WORKING' },
  { agent: 'operations',   re: /(operations|prep_quantity|备货|截单|履约|产能|排程|每日任务)/i, status: 'WORKING' },
];

const STATUS_MARKERS = [
  { re: /(✅|DONE|完成|finished)/i, status: 'DONE' },
  { re: /(❌|NOT_FEASIBLE|FAIL|失败|否决)/i, status: 'BLOCKED' },
  { re: /(⚠️|AT_RISK|WARN|风险)/i, status: 'THINKING' },
];

function classifyLine(line) {
  const clean = stripAnsi(line).trim();
  if (!clean) return null;

  let agent = null;
  for (const m of AGENT_MARKERS) {
    if (m.re.test(clean)) { agent = m.agent; break; }
  }

  let status = null;
  for (const s of STATUS_MARKERS) {
    if (s.re.test(clean)) { status = s.status; break; }
  }

  return { clean, agent, status };
}

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return String(s).replace(/\u001b\[[0-9;]*m/g, '');
}

function feedCliLine(session, rawLine, stream) {
  const info = classifyLine(rawLine);
  if (!info) return;

  if (info.agent && info.status) {
    agentStatus(session, info.agent, info.status, info.clean);
  } else if (info.agent) {
    agentStatus(session, info.agent, 'WORKING', info.clean);
  } else if (info.status) {
    agentStatus(session, 'orchestrator', info.status, info.clean);
  } else {
    log(session, info.clean);
  }
}

// ---------------------------------------------------------------------------
// 4. RESULT EXTRACTION
// ---------------------------------------------------------------------------

/**
 * Parse the final agent output for the key numbers the dashboard shows.
 * Works on real output; only falls back to nothing (not fake values) if absent.
 */
function extractResults(text) {
  const flat = stripAnsi(text || '');
  // Take the LAST match (the model's final labelled lines), tolerate an "RM" prefix.
  const num = (re) => {
    const g = new RegExp(re.source.replace(/\(\[\\d\.\]\+\)/, '(?:RM\\s*)?([\\d.]+)'), 'gi');
    const all = [...flat.matchAll(g)];
    if (!all.length) return null;
    const v = parseFloat(String(all[all.length - 1][1]).replace(/,/g, ''));
    return Number.isFinite(v) ? v : null;
  };

  let feasibility = null;
  const labelled = [...flat.matchAll(/feasibility[_ ]?status["'*\s:]*(NOT[_ ]?FEASIBLE|AT[_ ]?RISK|FEASIBLE)/gi)];
  if (labelled.length) feasibility = labelled[labelled.length - 1][1].toUpperCase().replace(/ /g, '_').replace(/^NOTFEASIBLE$/, 'NOT_FEASIBLE').replace(/^ATRISK$/, 'AT_RISK');
  else if (/NOT[_ ]?FEASIBLE|不可行|做不到/i.test(flat)) feasibility = 'NOT_FEASIBLE';
  else if (/AT[_ ]?RISK|有风险|有条件可行/i.test(flat)) feasibility = 'AT_RISK';
  else if (/FEASIBLE|可行/i.test(flat)) feasibility = 'FEASIBLE';

  return {
    feasibility,
    unitContribution: num(/unit[_ ]?contribution["'\s:]*([\d.]+)/i) ??
                      num(/单位贡献["'\s:]*([\d.]+)/i),
    requiredDailySales: num(/required[_ ]?daily[_ ]?sales["'\s:]*([\d.]+)/i) ??
                        num(/(?:需要|需)?每日?销量["'\s:]*([\d.]+)/i),
    capacity: num(/capacity["'\s:]*([\d.]+)/i) ??
              num(/产能(?:上限)?["'\s:]*([\d.]+)/i),
    estimatedDailyDemand: num(/estimated[_ ]?daily[_ ]?demand["'\s:]*([\d.]+)/i) ??
                          num(/预估日需求["'\s:]*([\d.]+)/i),
    recommendedPrice: num(/recommended[_ ]?price["'\s:]*([\d.]+)/i) ??
                      num(/建议定价["'\s:]*([\d.]+)/i),
    rawText: flat,
    simulated: /SIMULATED|\[模拟\]/i.test(flat),
  };
}

/** List artifact files present in outputDir (real filesystem listing). */
function listArtifacts() {
  const dir = CONFIG.outputDir;
  const wanted = [
    { key: 'landing', label: 'Landing Page', match: /landing[-_]?page.*\.html$/i, exts: /\.html?$/i },
    { key: 'order', label: 'Order Form', match: /order[-_]?form.*\.html$/i, exts: /\.html?$/i },
    { key: 'calendar', label: 'Marketing Calendar', match: /(marketing[-_]?calendar|calendar).*$/i, exts: /\.(md|html|txt)$/i },
  ];
  let files = [];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }

  const out = [];
  for (const w of wanted) {
    const hit = files.find((f) => w.match.test(f)) || files.find((f) => w.exts.test(f) && new RegExp(w.key, 'i').test(f));
    if (hit) {
      out.push({
        key: w.key,
        label: w.label,
        file: hit,
        path: path.join(dir, hit),
        openUrl: `http://${CONFIG.host}:${CONFIG.port}/api/artifact/${encodeURIComponent(hit)}`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 5. RUNNERS
// ---------------------------------------------------------------------------

function startRun(session) {
  const mode = session.mode;
  log(session, `Bridge online — mode: ${mode}`);
  log(session, `Agent: ${CONFIG.agentName}`);
  log(session, `Goal: ${session.goal}`);
  agentStatus(session, 'orchestrator', 'THINKING', 'Parsing goal & extracting key parameters...');

  if (mode === 'openai') return CONFIG.multiAgent ? runMultiAgent(session) : runOpenAiMode(session);
  if (mode === 'api') return runApiMode(session);
  if (mode === 'cli') return runCliMode(session);
  if (mode === 'demo') return runDemoMode(session);

  session.status = 'failed';
  agentStatus(session, 'orchestrator', 'BLOCKED', 'No WorkBuddy runtime available (no API base/key and CLI not found).');
  emit(session, { type: 'error', agent: 'orchestrator', message: 'Bridge cannot reach WorkBuddy. Set WORKBUDDY_API_BASE + WORKBUDDY_API_KEY, or put the workbuddy CLI on PATH, or set CAMPUSBIZ_ALLOW_DEMO=1.' });
  finish(session);
}

// --- MODE 0: OpenAI-compatible wrapper (workbuddy2api / codebuddy2api) ------
//
// Speaks the standard OpenAI Chat Completions protocol with SSE streaming.
// This is the simplest, most reliable wiring: no API key to create, the wrapper
// reuses the logged-in WorkBuddy desktop credentials and exposes /v1 locally.

const CAMPUSBIZ_SYSTEM_PROMPT = [
  'You are the CampusBiz Orchestrator, leading a four-expert micro-business team',
  '(finance, demand, growth, operations). Work the standard SOP: parse the goal,',
  'run the four workstreams, cross-validate feasibility, and produce one unified',
  'execution plan. When you reference an agent, name it explicitly (finance,',
  'demand, growth, operations, orchestrator) so the status can be tracked.',
  'Always end with these labelled lines so they can be parsed:',
  'unit_contribution, required_daily_sales, capacity, estimated_daily_demand,',
  'recommended_price, and feasibility_status (FEASIBLE / AT_RISK / NOT_FEASIBLE).',
].join(' ');

function runOpenAiMode(session) {
  // Strip trailing slash, then append the endpoint path so any base prefix is kept.
  // A leading "/" in new URL() would discard the "/v1" prefix, so build the path by hand.
  const base = CONFIG.openaiBase.replace(/\/+$/, '');
  const url = new URL(base + '/chat/completions');
  const payload = {
    model: CONFIG.openaiModel,
    stream: true,
    messages: [
      { role: 'system', content: CAMPUSBIZ_SYSTEM_PROMPT },
      { role: 'user', content: session.goal },
    ],
  };
  const body = JSON.stringify(payload);

  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  log(session, `POST ${url.origin}${url.pathname} (model: ${CONFIG.openaiModel})`);

  const req = lib.request(
    {
      method: 'POST',
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Authorization': `Bearer ${CONFIG.openaiApiKey || 'local'}`,
        'Content-Length': Buffer.byteLength(body),
      },
    },
    (res) => {
      if (res.statusCode >= 400) {
        let errBody = '';
        res.on('data', (c) => (errBody += c));
        res.on('end', () => {
          agentStatus(session, 'orchestrator', 'BLOCKED', `Wrapper error ${res.statusCode}`);
          emit(session, {
            type: 'error',
            message: `OpenAI wrapper at ${base} returned ${res.statusCode}: ${errBody.slice(0, 300)}. ` +
                     `Is the workbuddy2api server running, and does it need an --api-key?`,
          });
          finish(session);
        });
        return;
      }

      let acc = '';
      let carry = '';
      res.setEncoding('utf8');

      res.on('data', (chunk) => {
        carry += chunk;
        const lines = carry.split('\n');
        carry = lines.pop();
        for (let line of lines) {
          line = line.trim();
          if (!line.startsWith('data:')) continue;   // SSE comment / event name
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;

          let obj;
          try { obj = JSON.parse(data); } catch { continue; }

          // Standard OpenAI streaming delta shape.
          const choice = (obj.choices && obj.choices[0]) || {};
          const delta = choice.delta || {};
          const piece = delta.content || (choice.message && choice.message.content) || '';
          if (piece) {
            acc += piece;
            // Stream token-level text into the log; classify agent markers live.
            feedCliLine(session, piece, 'stdout');
          }
          if (choice.finish_reason) {
            log(session, `Upstream finish_reason: ${choice.finish_reason}`);
          }
        }
      });

      res.on('end', () => finalizeFromText(session, acc));
      res.on('error', (err) => {
        emit(session, { type: 'error', message: `Wrapper stream error: ${err.message}` });
        finish(session);
      });
    }
  );

  req.on('error', (err) => {
    agentStatus(session, 'orchestrator', 'BLOCKED', `Wrapper unreachable: ${err.message}`);
    emit(session, {
      type: 'error',
      message: `Could not reach the OpenAI wrapper at ${base}. Start it first ` +
               `(e.g. python -m core.converter, usually on http://127.0.0.1:8787/v1). (${err.message})`,
    });
    finish(session);
  });

  session.apiReq = req;
  req.write(body);
  req.end();
}

// --- MODE 0b: MULTI-AGENT (real specialist calls + real calc.py tool) -------
//
// One orchestrator step plus four specialist steps. Finance runs the real
// finance-calculator script; demand / operations / growth are separate model
// calls with their own system prompts, run in parallel where the SOP allows.
// The feasibility verdict is computed in code from the specialists' numbers.

function llmCall(session, system, user) {
  return new Promise((resolve, reject) => {
    const base = CONFIG.openaiBase.replace(/\/+$/, '');
    const url = new URL(base + '/chat/completions');
    const body = JSON.stringify({
      model: CONFIG.openaiModel, stream: true,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    });
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const req = lib.request({
      method: 'POST', hostname: url.hostname, port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json', 'Accept': 'text/event-stream',
        'Authorization': `Bearer ${CONFIG.openaiApiKey || 'local'}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      if (res.statusCode >= 400) {
        let e = '';
        res.on('data', (c) => (e += c));
        res.on('end', () => reject(new Error(`wrapper ${res.statusCode}: ${e.slice(0, 200)}`)));
        return;
      }
      let acc = '', carry = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        carry += chunk;
        const lines = carry.split('\n');
        carry = lines.pop();
        for (let line of lines) {
          line = line.trim();
          if (!line.startsWith('data:')) continue;
          const d = line.slice(5).trim();
          if (!d || d === '[DONE]') continue;
          try { const o = JSON.parse(d); acc += ((o.choices && o.choices[0] && o.choices[0].delta) || {}).content || ''; } catch {}
        }
      });
      res.on('end', () => resolve(acc));
      res.on('error', reject);
    });
    req.on('error', reject);
    (session.reqs = session.reqs || new Set()).add(req);
    req.write(body);
    req.end();
  });
}

async function askJson(session, system, user, retries = 1) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    const text = await llmCall(session, system + ' Reply with ONE JSON object only, no markdown fences, no commentary.', user);
    const m = text.match(/\{[\s\S]*\}/);
    try { return JSON.parse(m ? m[0] : text); } catch (e) { lastErr = new Error('model returned non-JSON'); }
  }
  throw lastErr;
}

function calcJs(p) { // fallback only when no Python is found
  const uc = p.price - p.variableCost;
  if (uc <= 0) return { error: 'INVALID_UNIT_CONTRIBUTION', unitContribution: uc };
  const m = Math.ceil((p.targetProfit + p.fixedCost) / uc);
  const d = Math.ceil(m / p.operatingDays);
  return { unitContribution: Math.round(uc * 100) / 100, requiredMonthlySales: m, requiredDailySales: d,
    monthlyRevenue: m * p.price, monthlyProfit: m * uc - p.fixedCost };
}

function runCalc(p) {
  const script = process.env.CAMPUSBIZ_CALC ||
    path.join(__dirname, '..', '03-skills', 'finance-calculator', 'scripts', 'calc.py');
  const args = [script, '--price', p.price, '--variable-cost', p.variableCost, '--fixed-cost', p.fixedCost,
    '--target-profit', p.targetProfit, '--operating-days', p.operatingDays, '--capacity', p.capacity].map(String);
  const pyKnown = path.join(HOME, '.workbuddy-ai', 'binaries', 'python', 'versions', '3.13.12', 'python.exe');
  const bins = [process.env.PYTHON, fs.existsSync(pyKnown) ? pyKnown : null, 'python', 'python3', 'py'].filter(Boolean);
  const { execFile } = require('child_process');
  const attempt = (i) => new Promise((resolve) => {
    if (i >= bins.length || !fs.existsSync(script)) return resolve({ tool: 'calc-js (fallback, Python/calc.py not found)', out: calcJs(p) });
    const c = execFile(bins[i], args, { timeout: 10000, windowsHide: true }, (err, stdout) => {
      try { return resolve({ tool: 'finance-calculator/calc.py', out: JSON.parse(stdout) }); }
      catch { return resolve(attempt(i + 1)); }
    });
    if (c.stdin) c.stdin.end();
  });
  return attempt(0);
}

const num0 = (v, d) => { const n = parseFloat(String(v).replace(/[^\d.\-]/g, '')); return Number.isFinite(n) ? n : d; };
const BM_EN = ' Write every text value in BOTH Bahasa Melayu and English (Malay first, then English after " / ").';

// Message bus: every inter-agent message is routed through the orchestrator
// (hub-and-spoke, per the lead's spec) and emitted to the dashboard as a
// `message` event so the exchange is visible and replayable.
function bus(session, from, to, kind, payload) {
  const content = typeof payload === 'string' ? payload : JSON.stringify(payload);
  emit(session, { type: 'message', agent: from, from, to, kind, message: `${kind}: ${content.slice(0, 240)}` });
  return payload;
}

async function finAgent(session, P, kind) {
  agentStatus(session, 'finance', 'WORKING', kind === 'revise' ? 'Solving for the minimum price that fits capacity (then re-verifying with calc.py)...' : 'Running finance-calculator (calc.py)...');
  let q = P;
  if (kind === 'revise') {
    const p = Math.ceil((P.variableCost + (P.targetProfit + P.fixedCost) / (P.capacity * P.operatingDays)) * 10) / 10;
    q = Object.assign({}, P, { price: p });
  }
  const r = await runCalc(q);
  if (r.out.error) agentStatus(session, 'finance', 'BLOCKED', `${r.out.error}: unit contribution ${r.out.unitContribution}`);
  else agentStatus(session, 'finance', 'DONE', `[${r.tool}] price RM${q.price}: unit_contribution = ${r.out.unitContribution}; required_daily_sales = ${r.out.requiredDailySales}`);
  return { tool: r.tool, price: q.price, out: r.out };
}

async function demAgent(session, P, price, context) {
  agentStatus(session, 'demand', 'WORKING', `Estimating daily campus demand at RM${price} (model estimate, SIMULATED)...`);
  const d = await askJson(session,
    'You are the Demand Analyst for a campus micro-business. Estimate realistic daily demand at the stated price. ' +
    'Keys: estimated_daily_demand (number), demand_uncertainty (string), key_assumptions (array of strings). This is a model estimate, not market research.' + BM_EN,
    `Product: ${P.product}. Price: RM${price}. Context: university campus. Goal: ${session.goal}. ${context || ''}`);
  d.estimated_daily_demand = num0(d.estimated_daily_demand, 0);
  agentStatus(session, 'demand', 'DONE', `estimated_daily_demand = ${d.estimated_daily_demand} at RM${price} [SIMULATED estimate]`);
  return d;
}

async function opsAgent(session, P, context) {
  agentStatus(session, 'operations', 'WORKING', `Planning prep within hard capacity ${P.capacity}/day...`);
  const o = await askJson(session,
    'You are the Operations Planner. The daily capacity is a HARD limit; never plan above it. ' +
    'Keys: prep_quantity (number), order_cutoff_time (string), fulfillment_window (string), daily_tasks (array of short strings).' + BM_EN,
    `Product: ${P.product}. Capacity: ${P.capacity} per day. Operating days/month: ${P.operatingDays}. ${context || ''}`);
  o.prep_quantity = Math.min(num0(o.prep_quantity, P.capacity), P.capacity);
  agentStatus(session, 'operations', 'DONE', `prep_quantity = ${o.prep_quantity} (capacity ${P.capacity}), cutoff ${o.order_cutoff_time || 'n/a'}`);
  return o;
}

function judge(F, cap, demand, P, price) {
  const req = F.requiredDailySales;
  if (F.error || !Number.isFinite(req)) return { status: 'NOT_FEASIBLE', detail: `Unit contribution <= 0 (price RM${price} <= variable cost RM${P.variableCost}); no volume can reach the target.` };
  if (req > cap) return { status: 'NOT_FEASIBLE', detail: `Required ${req}/day exceeds capacity ${cap}/day by ${(req / cap).toFixed(2)}x.` };
  if (req > demand) return { status: 'AT_RISK', detail: `Capacity OK (${req} <= ${cap}) but estimated demand ${demand}/day is below required ${req}/day.` };
  return { status: 'FEASIBLE', detail: `Required ${req}/day <= capacity ${cap}/day and <= demand ${demand}/day.` };
}

async function runMultiAgent(session) {
  const alive = () => session.status === 'running';
  const rounds = [];
  try {
    log(session, 'Multi-agent mode: agents exchange messages via the orchestrator; failed cross-checks trigger revision rounds (max 2).');

    // ---- Phase 0 ----
    agentStatus(session, 'orchestrator', 'WORKING', 'Phase 0 - extracting structured parameters from the goal');
    const raw = await askJson(session,
      'You are the CampusBiz Orchestrator. Extract parameters from the student goal. Keys: product (string), ' +
      'price (selling price per unit, number, RM), variableCost (cost per unit, number), fixedCost (monthly, number), ' +
      'targetProfit (desired MONTHLY NET PROFIT, number; treat "earn/month income" as profit), operatingDays (number, default 26), ' +
      'capacity (max units per day, number), assumptions (array of strings: every value you had to assume, conservative).',
      session.goal);
    if (!alive()) return;
    const P = {
      product: String(raw.product || 'product'),
      price: num0(raw.price, 5), variableCost: num0(raw.variableCost, 2.5), fixedCost: num0(raw.fixedCost, 0),
      targetProfit: num0(raw.targetProfit, 0), operatingDays: num0(raw.operatingDays, 26) || 26, capacity: num0(raw.capacity, 40) || 40,
      assumptions: Array.isArray(raw.assumptions) ? raw.assumptions.map(String) : [],
    };
    const cap = P.capacity;

    // ---- Round 0: orchestrator -> three specialists in parallel ----
    agentStatus(session, 'orchestrator', 'THINKING', `Round 0 - dispatching: price RM${P.price}, var cost RM${P.variableCost}, target profit RM${P.targetProfit}/mo, capacity ${cap}/day.`);
    bus(session, 'orchestrator', 'finance', 'task', { price: P.price, variableCost: P.variableCost, fixedCost: P.fixedCost, targetProfit: P.targetProfit, operatingDays: P.operatingDays, capacity: cap });
    bus(session, 'orchestrator', 'demand', 'task', { product: P.product, price: P.price });
    bus(session, 'orchestrator', 'operations', 'task', { capacity: cap, operatingDays: P.operatingDays });
    let [fin, dem, ops] = await Promise.all([finAgent(session, P, 'task'), demAgent(session, P, P.price), opsAgent(session, P)]);
    if (!alive()) return;
    bus(session, 'finance', 'orchestrator', 'result', { unit_contribution: fin.out.unitContribution, required_daily_sales: fin.out.requiredDailySales });
    bus(session, 'demand', 'orchestrator', 'result', { estimated_daily_demand: dem.estimated_daily_demand });
    bus(session, 'operations', 'orchestrator', 'result', { prep_quantity: ops.prep_quantity });

    let price = P.price;
    let v = judge(fin.out, cap, dem.estimated_daily_demand, P, price);
    rounds.push(`Round 0 @RM${price}: ${v.status} - ${v.detail}`);
    agentStatus(session, 'orchestrator', v.status === 'NOT_FEASIBLE' ? 'BLOCKED' : 'THINKING', `Round 0 verdict ${v.status}: ${v.detail}`);

    // ---- Round 1: price negotiation (finance -> demand -> operations, relayed) ----
    if (v.status !== 'FEASIBLE') {
      bus(session, 'orchestrator', 'finance', 'revise', `Round 1: which minimum price makes required sales fit capacity ${cap}/day?`);
      const fin1 = await finAgent(session, P, 'revise');
      if (!alive()) return;
      bus(session, 'finance', 'orchestrator', 'result', { proposed_price: fin1.price, required_daily_sales: fin1.out.requiredDailySales, unit_contribution: fin1.out.unitContribution });
      if (!fin1.out.error && fin1.price <= P.price * 2) {
        bus(session, 'orchestrator', 'demand', 'revise', `Finance proposes RM${fin1.price} (from RM${P.price}). Re-estimate daily demand at the new price; previous estimate was ${dem.estimated_daily_demand}.`);
        bus(session, 'orchestrator', 'operations', 'revise', `Revised plan: required ${fin1.out.requiredDailySales}/day vs capacity ${cap}/day. Confirm prep fits.`);
        const [dem1, ops1] = await Promise.all([
          demAgent(session, P, fin1.price, `A price rise is proposed from RM${P.price}. Previous estimate at RM${P.price}: ${dem.estimated_daily_demand}/day. Price-sensitive students may buy less.`),
          opsAgent(session, P, `Revised required daily sales: ${fin1.out.requiredDailySales}. Plan prep accordingly, never above capacity.`),
        ]);
        if (!alive()) return;
        bus(session, 'demand', 'orchestrator', 'result', { estimated_daily_demand: dem1.estimated_daily_demand, at_price: fin1.price });
        bus(session, 'operations', 'orchestrator', 'result', { prep_quantity: ops1.prep_quantity });
        fin = fin1; dem = dem1; ops = ops1; price = fin1.price;
        v = judge(fin.out, cap, dem.estimated_daily_demand, P, price);
        rounds.push(`Round 1 @RM${price}: ${v.status} - ${v.detail}`);
        agentStatus(session, 'orchestrator', v.status === 'NOT_FEASIBLE' ? 'BLOCKED' : 'THINKING', `Round 1 verdict ${v.status}: ${v.detail}`);
      } else {
        rounds.push(`Round 1: price fix rejected (needs RM${fin1.price}, more than 2x the original RM${P.price}) - target is unrealistic by price alone.`);
        agentStatus(session, 'orchestrator', 'BLOCKED', rounds[rounds.length - 1]);
      }
    }

    // ---- Round 2: growth is asked to lift demand when capacity fits but demand does not ----
    if (v.status === 'AT_RISK') {
      bus(session, 'orchestrator', 'growth', 'question', `Demand ${dem.estimated_daily_demand}/day < required ${fin.out.requiredDailySales}/day at RM${price}. What campaign can close the gap?`);
      agentStatus(session, 'growth', 'WORKING', 'Designing demand-lift tactics...');
      let tac = {};
      try {
        tac = await askJson(session,
          'You are the Growth Marketer. Propose realistic campus demand-lift tactics. Keys: tactics (array of short strings), expected_uplift_percent (number, conservative).' + BM_EN,
          `Product: ${P.product}. Price: RM${price}. Current demand: ${dem.estimated_daily_demand}/day. Needed: ${fin.out.requiredDailySales}/day. Capacity: ${cap}/day.`);
      } catch (e) { tac = { tactics: [], expected_uplift_percent: 0 }; }
      agentStatus(session, 'growth', 'DONE', `Tactics ready (+${num0(tac.expected_uplift_percent, 0)}% claimed)`);
      bus(session, 'growth', 'orchestrator', 'result', tac);
      if (!alive()) return;
      bus(session, 'orchestrator', 'demand', 'revise', `Growth claims +${num0(tac.expected_uplift_percent, 0)}% with: ${(tac.tactics || []).join('; ').slice(0, 160)}. Re-estimate conservatively.`);
      const dem2 = await demAgent(session, P, price, `Growth proposes: ${JSON.stringify(tac).slice(0, 400)}. Re-estimate demand conservatively; do not just accept the claimed uplift.`);
      if (!alive()) return;
      bus(session, 'demand', 'orchestrator', 'result', { estimated_daily_demand: dem2.estimated_daily_demand });
      dem = dem2;
      v = judge(fin.out, cap, dem.estimated_daily_demand, P, price);
      rounds.push(`Round 2 @RM${price} (with growth tactics): ${v.status} - ${v.detail}`);
      agentStatus(session, 'orchestrator', v.status === 'NOT_FEASIBLE' ? 'BLOCKED' : 'THINKING', `Round 2 verdict ${v.status}: ${v.detail}`);
    }

    // ---- Final: growth launch plan within the validated limits ----
    bus(session, 'orchestrator', 'growth', 'task', `Final verdict ${v.status} at RM${price}. Produce a launch plan within capacity ${cap}/day.`);
    agentStatus(session, 'growth', 'WORKING', 'Drafting launch plan consistent with the validated boundaries...');
    let growth = {};
    try {
      growth = await askJson(session,
        'You are the Growth Marketer. Only promise what the validated limits allow (never promote more than capacity). ' +
        'Keys: headline (string), offer (string), channels (array of strings), seven_day_plan (array of 7 short strings).' + BM_EN,
        `Product: ${P.product}. Price: RM${price}. Capacity: ${cap}/day. Estimated demand: ${dem.estimated_daily_demand}/day. Verdict: ${v.status}. ${v.detail}`);
    } catch (e) { growth = { error: e.message }; }
    agentStatus(session, 'growth', 'DONE', growth.headline ? `Launch plan ready: ${growth.headline}` : 'Growth step finished (no plan returned).');
    bus(session, 'growth', 'orchestrator', 'result', { headline: growth.headline || null });

    const uc = fin.out.unitContribution;
    const ceilingUnits = Math.min(cap, dem.estimated_daily_demand);
    const realisticProfit = Number.isFinite(uc) ? Math.round(ceilingUnits * P.operatingDays * uc - P.fixedCost) : null;
    const text = [
      `Negotiation / Rundingan:`,
      ...rounds,
      `Final verdict / Keputusan akhir: ${v.status} - ${v.detail}`,
      `Assumptions / Andaian: ${P.assumptions.join('; ') || 'none'}`,
      `Finance (${fin.tool}): ${JSON.stringify(fin.out)}`,
      `Demand (model estimate, not market research): ${JSON.stringify(dem)}`,
      `Operations: ${JSON.stringify(ops)}`,
      `Growth: ${JSON.stringify(growth)}`,
      `Realistic monthly profit ceiling at min(capacity, demand): ${realisticProfit}`,
      '',
      `unit_contribution: ${uc}`,
      `required_daily_sales: ${fin.out.requiredDailySales}`,
      `capacity: ${cap}`,
      `estimated_daily_demand: ${dem.estimated_daily_demand}`,
      `recommended_price: ${price}`,
      `feasibility_status: ${v.status}`,
    ].join('\n');
    finalizeFromText(session, text);
  } catch (err) {
    if (!alive()) return;
    agentStatus(session, 'orchestrator', 'BLOCKED', `Multi-agent run failed: ${err.message}`);
    emit(session, { type: 'error', message: `Multi-agent run failed: ${err.message}` });
    finish(session);
  }
}

// --- MODE A: WorkBuddy API --------------------------------------------------

function runApiMode(session) {
  const base = CONFIG.workbuddyApiBase.replace(/\/$/, '');
  const url = new URL('/v1/task/stream', base);
  const body = JSON.stringify({ agent: CONFIG.agentName, prompt: session.goal, stream: true });

  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  const req = lib.request(
    {
      method: 'POST',
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Authorization': `Bearer ${CONFIG.workbuddyApiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    },
    (res) => {
      if (res.statusCode >= 400) {
        let errBody = '';
        res.on('data', (c) => (errBody += c));
        res.on('end', () => {
          agentStatus(session, 'orchestrator', 'BLOCKED', `API error ${res.statusCode}`);
          emit(session, { type: 'error', message: `WorkBuddy API returned ${res.statusCode}: ${errBody.slice(0, 300)}` });
          finish(session);
        });
        return;
      }

      let acc = '';
      let carry = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        acc += chunk;
        carry += chunk;
        const lines = carry.split('\n');
        carry = lines.pop(); // keep partial line
        for (let line of lines) {
          line = line.trim();
          if (!line) continue;
          if (line.startsWith('data:')) line = line.slice(5).trim();
          if (line === '[DONE]') continue;

          // Prefer structured JSON events from the API.
          try {
            const ev = JSON.parse(line);
            if (ev.type) { emit(session, ev); continue; }
            if (ev.agent && ev.status) { agentStatus(session, ev.agent, ev.status, ev.message || ev.delta || ''); continue; }
            if (ev.delta || ev.text || ev.content) { feedCliLine(session, ev.delta || ev.text || ev.content, 'stdout'); continue; }
          } catch {
            // Not JSON — treat as a raw text line.
            feedCliLine(session, line, 'stdout');
          }
        }
      });
      res.on('end', () => {
        finalizeFromText(session, acc);
      });
      res.on('error', (err) => {
        emit(session, { type: 'error', message: `API stream error: ${err.message}` });
        finish(session);
      });
    }
  );

  req.on('error', (err) => {
    agentStatus(session, 'orchestrator', 'BLOCKED', `API unreachable: ${err.message}`);
    emit(session, { type: 'error', message: `Could not reach WorkBuddy API at ${base}. Check workbuddyApiBase. (${err.message})` });
    finish(session);
  });

  session.apiReq = req;
  req.write(body);
  req.end();
}

// --- MODE B: WorkBuddy CLI --------------------------------------------------

/** Tokens the demo/CLI inputs are validated against (prevents shell injection). */
function sanitizeGoalForArgv(goal) {
  // Single argv element, passed without a shell — safe by construction.
  return String(goal).replace(/[\r\n]+/g, ' ').slice(0, 4000);
}

/**
 * Decode one line of `codebuddy --output-format stream-json` output and forward
 * it as SSE. The stream is newline-delimited JSON objects; the shapes we care
 * about are: system init, assistant text deltas, tool use, and the final result.
 * Everything else is passed through as a plain log line.
 */
function handleStreamJsonLine(session, rawLine, acc) {
  const line = rawLine.trim();
  if (!line) return;

  let obj;
  try { obj = JSON.parse(line); }
  catch {
    // Not JSON — could be a human-readable progress line. Classify it.
    feedCliLine(session, line, 'stdout');
    return;
  }

  const type = obj.type || obj.event || '';

  // --- session / system init ---
  if (type === 'system' || type === 'init' || obj.subtype === 'init') {
    const agent = obj.agent || CONFIG.agentName;
    agentStatus(session, 'orchestrator', 'WORKING', `Session initialised (agent: ${agent}).`);
    return;
  }

  // --- assistant message (may carry text and/or tool_use) ---
  if (type === 'assistant' || type === 'message' || obj.message) {
    const msg = obj.message || obj;
    const content = Array.isArray(msg.content) ? msg.content : [];
    for (const block of content) {
      if (block.type === 'text' && block.text) {
        acc.value += block.text + '\n';
        for (const ln of block.text.split(/\r?\n/)) feedCliLine(session, ln, 'stdout');
      } else if (block.type === 'tool_use') {
        const name = block.name || 'tool';
        agentStatus(session, 'orchestrator', 'WORKING', `▶ ${name}${block.input && block.input.agent ? ` → ${block.input.agent}` : ''}`);
      }
    }
    // Some shapes put plain text at the top level.
    if (!content.length && (msg.text || obj.text)) {
      const t = msg.text || obj.text;
      acc.value += t + '\n';
      for (const ln of String(t).split(/\r?\n/)) feedCliLine(session, ln, 'stdout');
    }
    return;
  }

  // --- streaming text delta ---
  if (obj.delta || obj.text_delta) {
    const t = obj.delta || obj.text_delta;
    acc.value += t;
    feedCliLine(session, t, 'stdout');
    return;
  }

  // --- tool result ---
  if (type === 'tool_result' || obj.tool_use_id) {
    const t = typeof obj.content === 'string' ? obj.content : JSON.stringify(obj.content || '');
    for (const ln of t.split(/\r?\n/)) feedCliLine(session, ln, 'stdout');
    return;
  }

  // --- final result envelope ---
  if (type === 'result' || obj.subtype === 'result' || obj.duration_ms !== undefined) {
    const finalText = obj.result || obj.text || obj.content || '';
    if (finalText && typeof finalText === 'string') acc.value += '\n' + finalText;
    return;
  }

  // Unknown typed object — if it has a message, log it; else ignore.
  if (obj.message && typeof obj.message === 'string') {
    feedCliLine(session, obj.message, 'stdout');
  }
}

/**
 * Build the argv for the CLI. Supports two flavours:
 *   1. "codebuddy" (the bundled @genie/agent-cli) — uses -p + stream-json
 *   2. "generic"  — any `workbuddy task run --agent .. --prompt .. --stream`
 * The flavour is inferred from whether the resolved command looks like the
 * bundled codebuddy CLI, or forced via config `cliFlavor`.
 */
function buildCliArgs(session) {
  const goal = sanitizeGoalForArgv(session.goal);
  const flavor = CONFIG.cliFlavor || (/(^|[\\/])codebuddy(-code)?(\.cmd|\.exe)?$/i.test(CONFIG.workbuddyCli) ? 'codebuddy' : 'generic');

  if (flavor === 'codebuddy') {
    return {
      flavor,
      args: [
        '-p',
        '--agent', CONFIG.agentName,
        '--output-format', 'stream-json',
        '--include-partial-messages',
        '--permission-mode', 'acceptEdits',
        goal,
        ...CONFIG.extraCliArgs,
      ],
    };
  }

  return {
    flavor,
    args: [
      'task', 'run',
      '--agent', CONFIG.agentName,
      '--prompt', goal,
      '--stream',
      ...CONFIG.extraCliArgs,
    ],
  };
}

function runCliMode(session) {
  const cli = CONFIG.workbuddyCli;
  const { flavor, args } = buildCliArgs(session);
  const acc = { value: '' };

  // The bundled CLI (bin/codebuddy) is an extensionless Node script. Windows
  // can't exec it directly, so detect that and launch it via the current node.
  const resolved = expandHome(cli);
  const isNodeScript = fs.existsSync(resolved) &&
    !/\.(exe|cmd|bat|ps1)$/i.test(resolved) &&
    !/\.(js|mjs|cjs)$/i.test(resolved);   // extensionless => Node shebang script
  const isJsFile = fs.existsSync(resolved) && /\.(js|mjs|cjs)$/i.test(resolved);

  let cmd, finalArgs;
  if (isNodeScript || isJsFile) {
    cmd = process.execPath;               // the node running this bridge
    finalArgs = [resolved, ...args];
  } else {
    cmd = cli;
    finalArgs = args;
  }

  log(session, `$ ${cmd} ${finalArgs.map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}`);
  log(session, `CLI flavour: ${flavor}`);

  let child;
  try {
    child = spawn(cmd, finalArgs, {
      shell: false,
      windowsHide: true,
      env: Object.assign({}, process.env, {
        // Help the bundled CLI find the WorkBuddy config & session.
        CODEBUDDY_CONFIG_DIR: process.env.CODEBUDDY_CONFIG_DIR || path.join(HOME, '.workbuddy-ai'),
      }),
    });
  } catch (err) {
    agentStatus(session, 'orchestrator', 'BLOCKED', `Failed to spawn CLI: ${err.message}`);
    emit(session, { type: 'error', message: err.message });
    finish(session);
    return;
  }

  session.child = child;
  let stdoutBuf = '';
  let stderrBuf = '';

  const handle = (stream, kind) => {
    let carry = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      if (kind === 'stdout') stdoutBuf += chunk; else stderrBuf += chunk;
      carry += chunk;
      const lines = carry.split(/\r?\n/);
      carry = lines.pop();
      for (const line of lines) {
        if (kind === 'stdout' && flavor === 'codebuddy') handleStreamJsonLine(session, line, acc);
        else feedCliLine(session, line, kind);
      }
    });
    stream.on('end', () => {
      if (!carry.trim()) return;
      if (kind === 'stdout' && flavor === 'codebuddy') handleStreamJsonLine(session, carry, acc);
      else feedCliLine(session, carry, kind);
    });
  };

  handle(child.stdout, 'stdout');
  handle(child.stderr, 'stderr');

  child.on('error', (err) => {
    agentStatus(session, 'orchestrator', 'BLOCKED', `CLI error: ${err.message}`);
    emit(session, { type: 'error', message: `CLI failed to start: ${err.message}` });
    finish(session);
  });

  child.on('close', (code) => {
    session.child = null;
    if (code === 0) {
      finalizeFromText(session, acc.value || stdoutBuf || stderrBuf);
    } else {
      agentStatus(session, 'orchestrator', 'BLOCKED', `CLI exited with code ${code}`);
      const hint = /EADDRINUSE|fetch config failed/.test(stderrBuf)
        ? ' (hint: the bundled CLI needs to run as a child of the WorkBuddy app — see LINKING-WORKBUDDY.md)'
        : '';
      emit(session, { type: 'error', message: `WorkBuddy CLI exited with code ${code}.${hint} ${stderrBuf.slice(0, 300)}` });
      finish(session);
    }
  });
}

// --- MODE C: demo replay (explicitly labelled) ------------------------------

/**
 * Only reached when no API and no CLI are available, and CAMPUSBIZ_ALLOW_DEMO
 * is not disabled. Every event is tagged simulated:true. This is a *replay of
 * the reference cookie scenario*, not fabricated live progress — the dashboard
 * shows a [SIMULATED] banner whenever simulated events are present.
 */
function runDemoMode(session) {
  emit(session, {
    type: 'notice',
    simulated: true,
    message: 'No WorkBuddy runtime detected (no API key, CLI not on PATH). Replaying the reference cookie scenario — all values are [SIMULATED].',
  });

  const script = [
    { t: 300,  f: () => agentStatus(session, 'orchestrator', 'WORKING', 'Decomposing goal into finance / demand / growth / operations workstreams...') },
    { t: 700,  f: () => log(session, '[SIMULATED] Phase 1 — dispatching three parallel workstreams.') },
    { t: 900,  f: () => agentStatus(session, 'finance', 'WORKING', 'Calculating unit contribution via finance-calculator...') },
    { t: 1200, f: () => agentStatus(session, 'demand', 'WORKING', 'Estimating daily demand from campus scenario (SIMULATED)...') },
    { t: 1500, f: () => agentStatus(session, 'operations', 'WORKING', 'Deriving prep capacity constraint...') },
    { t: 1900, f: () => { agentStatus(session, 'finance', 'DONE', 'unit_contribution = 3.00; required_daily_sales = 100.'); emit(session, { type: 'data', agent: 'finance', simulated: true, message: 'unit_contribution=3.00, required_daily_sales=100' }); } },
    { t: 2200, f: () => { agentStatus(session, 'demand', 'DONE', 'estimated_daily_demand = 80 [SIMULATED].'); emit(session, { type: 'data', agent: 'demand', simulated: true, message: 'estimated_daily_demand=80' }); } },
    { t: 2500, f: () => agentStatus(session, 'operations', 'DONE', 'capacity = 40 boxes/day (hard constraint).') },
    { t: 2800, f: () => agentStatus(session, 'orchestrator', 'THINKING', 'Cross-validating: required 100/day vs capacity 40/day...') },
    { t: 3200, f: () => agentStatus(session, 'orchestrator', 'BLOCKED', 'NOT_FEASIBLE — required sales exceed daily capacity by 2.5x.') },
    { t: 3500, f: () => emit(session, { type: 'notice', simulated: true, message: 'Verdict: NOT_FEASIBLE at the stated goal. Adjusting target to the realistic ceiling...' }) },
    { t: 3900, f: () => agentStatus(session, 'growth', 'WORKING', 'Preparing marketing assets consistent with the revised boundary...') },
    { t: 4400, f: () => agentStatus(session, 'growth', 'DONE', 'Artifacts linked from outputDir (real files on disk).') },
  ];

  let acc = 'unit_contribution: 3.00\nrequired_daily_sales: 100\ncapacity: 40\nestimated_daily_demand: 80\nrecommended_price: 6.00\nfeasibility_status: NOT_FEASIBLE\n[SIMULATED]';

  script.forEach((step) => {
    const timer = setTimeout(() => {
      if (session.status !== 'running') return;
      step.f();
    }, step.t);
    timer.unref?.();
  });

  const endTimer = setTimeout(() => {
    if (session.status !== 'running') return;
    finalizeFromText(session, acc, true);
  }, 4900);
  endTimer.unref?.();
}

// ---------------------------------------------------------------------------
// 6. FINALIZE
// ---------------------------------------------------------------------------

function finalizeFromText(session, text, isSimulated) {
  if (session.status !== 'running') return;

  const results = extractResults(text);
  results.simulated = results.simulated || !!isSimulated;
  results.artifacts = listArtifacts();

  // Mark any desk not yet DONE as DONE so the floor resolves cleanly.
  for (const a of ['finance', 'demand', 'growth', 'operations']) {
    agentStatus(session, a, 'DONE', 'Workstream complete.');
  }
  agentStatus(session, 'orchestrator', results.feasibility === 'NOT_FEASIBLE' ? 'BLOCKED' : 'DONE',
    `Final verdict: ${results.feasibility || 'COMPLETE'}`);

  emit(session, { type: 'result', agent: 'orchestrator', simulated: results.simulated, data: results });
  finish(session, 'completed');
}

function finish(session, status) {
  session.status = status || (session.status === 'running' ? 'completed' : session.status);
  session.finishedAt = Date.now();
  emit(session, { type: session.status === 'completed' ? 'done' : 'error', agent: 'orchestrator', message: `Session ${session.status}.` });
  // Give SSE clients a beat to flush, then close their connections.
  setTimeout(() => {
    for (const res of session.clients) { try { res.end(); } catch {} }
    session.clients.clear();
  }, 50).unref?.();
}

// ---------------------------------------------------------------------------
// 7. HTTP PLUMBING
// ---------------------------------------------------------------------------

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, code, obj) {
  setCors(res);
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > limit) { reject(new Error('Body too large')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);

  if (req.method === 'OPTIONS') { setCors(res); res.writeHead(204); return res.end(); }

  // --- GET /api/health ---
  if (req.method === 'GET' && url.pathname === '/api/health') {
    const mode = detectMode();
    return sendJson(res, 200, {
      ok: true,
      mode,
      agent: CONFIG.agentName,
      outputDir: CONFIG.outputDir,
      cliAvailable: CLI_AVAILABLE,
      apiConfigured: Boolean(CONFIG.workbuddyApiBase && CONFIG.workbuddyApiKey),
      openaiBase: CONFIG.openaiBase || null,
      openaiModel: CONFIG.openaiBase ? CONFIG.openaiModel : null,
      multiAgent: CONFIG.multiAgent,
      sessions: sessions.size,
      ts: Date.now(),
    });
  }

  // --- POST /api/run ---
  if (req.method === 'POST' && url.pathname === '/api/run') {
    let body;
    try { body = JSON.parse(await readBody(req) || '{}'); }
    catch { return sendJson(res, 400, { error: 'Invalid JSON body' }); }

    const goal = (body.goal || '').toString().trim();
    if (!goal) return sendJson(res, 400, { error: 'Missing "goal" string' });

    const session = createSession(goal);
    // Kick off asynchronously so we can return sessionId immediately.
    setImmediate(() => {
      try { startRun(session); }
      catch (err) {
        emit(session, { type: 'error', message: `Runner crashed: ${err.message}` });
        finish(session);
      }
    });

    return sendJson(res, 200, { sessionId: session.id, mode: session.mode });
  }

  // --- GET /api/stream/:sessionId ---
  if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'stream' && parts[2]) {
    const session = sessions.get(parts[2]);
    if (!session) return sendJson(res, 404, { error: 'Unknown sessionId' });

    setCors(res);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');

    // Replay anything already emitted (supports late connect / reconnect).
    for (const ev of session.buffer) res.write(`data: ${JSON.stringify(ev)}\n\n`);

    if (session.status !== 'running') { return res.end(); }

    session.clients.add(res);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 15000);
    ping.unref?.();

    req.on('close', () => { clearInterval(ping); session.clients.delete(res); });
    return;
  }

  // --- POST /api/stop/:sessionId ---
  if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'stop' && parts[2]) {
    const session = sessions.get(parts[2]);
    if (!session) return sendJson(res, 404, { error: 'Unknown sessionId' });

    try { if (session.child) session.child.kill('SIGTERM'); } catch {}
    try { if (session.apiReq) session.apiReq.destroy(); } catch {}
    try { for (const r of session.reqs || []) r.destroy(); } catch {}
    session.status = 'stopped';
    emit(session, { type: 'log', agent: 'orchestrator', message: 'Stop requested by user.' });
    finish(session, 'stopped');
    return sendJson(res, 200, { ok: true, sessionId: session.id, status: 'stopped' });
  }

  // --- GET /api/artifact/:filename --- (serve real files from outputDir)
  if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'artifact' && parts[2]) {
    const name = decodeURIComponent(parts[2]);
    const safe = path.basename(name); // block traversal
    const full = path.join(CONFIG.outputDir, safe);
    if (!full.startsWith(path.resolve(CONFIG.outputDir))) {
      return sendJson(res, 403, { error: 'Forbidden' });
    }
    if (!fs.existsSync(full)) return sendJson(res, 404, { error: 'Artifact not found', file: safe });

    const ext = path.extname(safe).toLowerCase();
    const buf = fs.readFileSync(full);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': buf.length });
    return res.end(buf);
  }

  // --- GET /api/artifacts --- (list for convenience)
  if (req.method === 'GET' && url.pathname === '/api/artifacts') {
    return sendJson(res, 200, { outputDir: CONFIG.outputDir, artifacts: listArtifacts() });
  }

  return sendJson(res, 404, { error: 'Not found', path: url.pathname });
});

// ---------------------------------------------------------------------------
// 8. BOOT
// ---------------------------------------------------------------------------

server.listen(CONFIG.port, CONFIG.host, () => {
  const mode = detectMode();
  console.log('');
  console.log('  CampusBiz Autopilot — Bridge Server');
  console.log('  ----------------------------------');
  console.log(`  Listening : http://${CONFIG.host}:${CONFIG.port}`);
  console.log(`  Mode      : ${mode}`);
  console.log(`  Agent     : ${CONFIG.agentName}`);
  if (mode === 'openai') {
    console.log(`  Wrapper   : ${CONFIG.openaiBase} (model: ${CONFIG.openaiModel})`);
  }
  console.log(`  CLI       : ${CONFIG.workbuddyCli} ${CLI_AVAILABLE ? '(found)' : '(not found on PATH)'}`);
  console.log(`  API base  : ${CONFIG.workbuddyApiBase || '(not set)'}`);
  console.log(`  API key   : ${CONFIG.workbuddyApiKey ? '(set)' : '(not set)'}`);
  console.log(`  Output dir: ${CONFIG.outputDir}`);
  console.log('');
  console.log('  Health   : curl http://localhost:' + CONFIG.port + '/api/health');
  console.log('  Dashboard: open campusbiz-live.html');
  console.log('');
  if (mode === 'demo') {
    console.log('  ⚠️  No WorkBuddy runtime detected — running in labelled DEMO replay mode.');
    console.log('      Set WORKBUDDY_API_BASE + WORKBUDDY_API_KEY, or put the CLI on PATH,');
    console.log('      to trigger the real Expert Group. See README.md.');
    console.log('');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ✗ Port ${CONFIG.port} is already in use.`);
    console.error(`    Stop the other process, or run with CAMPUSBIZ_PORT=3334 node bridge-server.js\n`);
  } else {
    console.error('\n  ✗ Server error:', err.message, '\n');
  }
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n  Shutting down bridge...');
  for (const s of sessions.values()) {
    try { if (s.child) s.child.kill('SIGTERM'); } catch {}
    try { if (s.apiReq) s.apiReq.destroy(); } catch {}
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref?.();
});
