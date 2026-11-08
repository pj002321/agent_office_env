// Claude Code PreToolUse hook: forwards the tool request to the office app and waits for 대표's decision.
// Any failure (app closed, bad token) → deny. Runs under Electron with ELECTRON_RUN_AS_NODE=1.
const http = require('http');

const reply = ok => process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: ok ? 'allow' : 'deny',
                        permissionDecisionReason: ok ? '대표 승인' : '대표가 거절했습니다' },
}));

let body = '';
process.stdin.on('data', d => body += d).on('end', () => {
  const req = http.request({ host: '127.0.0.1', port: process.env.OFFICE_PORT, path: '/ask', method: 'POST',
                             headers: { 'x-office-token': process.env.OFFICE_TOKEN, 'x-office-floor': process.env.OFFICE_FLOOR || '' } }, res => {
    let r = '';
    res.on('data', d => r += d).on('end', () => reply(r === 'allow'));
  });
  req.on('error', () => reply(false));
  req.end(body);
});
