const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// VIN-148 — The State Dot renders the Session State and only that.
//
// Same approach as the ten sibling style tests: the acceptance criterion is a property of the
// stylesheet, so it is read off the stylesheet. What matters here is that each of the four
// states has exactly one class of its own, that no rule arbitrates between two of them with a
// :not() cascade or an !important, and that the five stacked booleans the dot used to carry —
// a live PTY, the busy arc, the attention ripple, the unread disc — are gone for good.
const styleCss = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'style.css'),
  'utf8',
);

const STATE_CLASSES = [
  '.session-status-dot--sleeping',
  '.session-status-dot--needs-input',
  '.session-status-dot--working',
  '.session-status-dot--done',
];

test('each Session State has its own State Dot rule', () => {
  for (const cls of STATE_CLASSES) {
    assert.ok(styleCss.includes(cls + ' {'), `expected a rule for ${cls}`);
  }
});

test('a State Dot rule is a single class — no cascade arbitrates between two states', () => {
  for (const cls of STATE_CLASSES) {
    const selectors = [...styleCss.matchAll(new RegExp(`^([^\\n{}]*${cls.replace('.', '\\.')}[^\\n{}]*)\\{`, 'gm'))];
    assert.ok(selectors.length > 0, `expected a rule for ${cls}`);
    for (const [, selector] of selectors) {
      assert.equal(selector.trim(), cls, `${cls} must stand alone, found: ${selector.trim()}`);
    }
  }
});

test('no State Dot rule uses !important', () => {
  const dotRules = [...styleCss.matchAll(/\.session-status-dot[^{}]*\{([^}]*)\}/g)];
  assert.ok(dotRules.length >= STATE_CLASSES.length);
  for (const [rule, body] of dotRules) {
    assert.ok(!body.includes('!important'), `!important survives in: ${rule.split('\n')[0]}`);
  }
});

test('the states the dot no longer renders have no rule left', () => {
  const gone = [
    '.session-status-dot.running',
    '.session-item.cli-busy',
    '.session-item.needs-attention',
    '.session-item.response-ready',
  ];
  for (const selector of gone) {
    assert.ok(!styleCss.includes(selector), `${selector} should have been removed`);
  }
});

test('the spinning arc and the attention ripple are gone, the breath replaces them', () => {
  assert.ok(!styleCss.includes('@keyframes ripple-out'), 'the double ripple should be gone');
  assert.ok(!styleCss.includes('@keyframes shimmer-text'), 'the busy title shimmer should be gone');
  assert.ok(styleCss.includes('@keyframes breath-dot'), 'working needs its breath animation');
  // The arc keyframe survives for the terminal header dot, which this ticket leaves alone —
  // but no Session row rule may reach for it any more.
  assert.ok(!/\.session-status-dot[^{}]*\{[^}]*spin-dot/.test(styleCss), 'no State Dot spins');
});

test('exactly one state animates the dot', () => {
  const animated = STATE_CLASSES.filter((cls) => {
    const m = styleCss.match(new RegExp(`${cls.replace('.', '\\.')}\\s*\\{([^}]*)\\}`));
    return m && /animation:/.test(m[1]);
  });
  assert.deepEqual(animated, ['.session-status-dot--working']);
});

test('Unread accents the title and never the dot', () => {
  assert.ok(styleCss.includes('.session-item.is-unread .session-summary'), 'unread keeps its title accent');
  assert.ok(
    !/\.session-item\.is-unread[^{}]*\.session-status-dot/.test(styleCss),
    'unread must not reach the State Dot',
  );
});
