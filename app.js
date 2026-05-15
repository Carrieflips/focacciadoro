'use strict';

/* ─── DOM builder ────────────────────────────────────────────────────────────
 * el(tag, props, ...children) — safe alternative to innerHTML template literals.
 * User strings reach the DOM as text nodes, never parsed as markup.
 */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class')                          node.className = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key === 'disabled')                  node.disabled = Boolean(value);
    else                                          node.setAttribute(key, String(value));
  }

  const append = (child) => {
    if (child == null || child === false) return;
    if (Array.isArray(child))             child.forEach(append);
    else if (child instanceof Node)       node.appendChild(child);
    else node.appendChild(document.createTextNode(String(child)));
  };
  children.forEach(append);
  return node;
}

/* ─── Platform detection ─────────────────────────────────────────────────────*/
function getPlatform() {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/android/i.test(ua))          return 'android';
  return 'desktop';
}

/* ─── Analytics stub (wired up in Phase 8) ───────────────────────────────────*/
function track(eventName, params = {}) {
  if (typeof gtag !== 'undefined') {
    gtag('event', eventName, { ...params, timestamp: Date.now() });
  }
}

/* ─── State ──────────────────────────────────────────────────────────────────*/
const state = {
  view: 'home',             // 'home' | 'session'
  currentStepIndex: 0,
  viewedStepIndex: 0,       // may differ during swipe-peek
  todos: [],                // [{id, text, completed}]
  sessionStartTime: null,
  timerEndTime: null,
  timerInterval: null,
  elapsedByStep: {},
  loafChoice: null,         // 'single' | 'double'
  reflection: '',
  inFoldBreak: false,       // true during pan-rise embedded fold breaks
  notificationsGranted: null,   // null = pending, true = granted, false = denied
  pwaInstalled: false,
  pwaDismissed: false,
  pwaPromptShown: false,
  alarmActive: false,
  onSilence: null,
};

/* ─── Steps ──────────────────────────────────────────────────────────────────*/
const steps = [
  { id: 'prep',       index: 0,  name: 'Get Prepped',            estimatedMinutes: 15, type: 'prep' },
  { id: 'mix',        index: 1,  name: 'Mix the Dough',          estimatedMinutes: 10, type: 'work' },
  { id: 'rise-1',     index: 2,  name: 'Rise 1 of 4',            estimatedMinutes: 30, type: 'work' },
  { id: 'fold-1',     index: 3,  name: 'Fold Break 1',           estimatedMinutes: 5,  type: 'fold' },
  { id: 'rise-2',     index: 4,  name: 'Rise 2 of 4',            estimatedMinutes: 30, type: 'work' },
  { id: 'fold-2',     index: 5,  name: 'Fold Break 2',           estimatedMinutes: 5,  type: 'fold' },
  { id: 'rise-3',     index: 6,  name: 'Rise 3 of 4',            estimatedMinutes: 30, type: 'work' },
  { id: 'fold-3',     index: 7,  name: 'Fold Break 3',           estimatedMinutes: 5,  type: 'fold' },
  { id: 'rise-4',     index: 8,  name: 'Rise 4 of 4',            estimatedMinutes: 30, type: 'work' },
  { id: 'fold-4',     index: 9,  name: 'Fold Break 4',           estimatedMinutes: 5,  type: 'fold' },
  { id: 'pan',        index: 10, name: 'Move Dough to Pan',      estimatedMinutes: 10, type: 'work' },
  { id: 'pan-rise-1', index: 11, name: 'Pan Rise — First Half',  estimatedMinutes: 30, type: 'work' },
  { id: 'pan-rise-2', index: 12, name: 'Pan Rise — Second Half', estimatedMinutes: 30, type: 'work' },
  { id: 'bake',       index: 13, name: 'Bake — First Check',     estimatedMinutes: 15, type: 'bake' },
  { id: 'finish',     index: 14, name: 'Remove from Oven',       estimatedMinutes: 7,  type: 'bake' },
  { id: 'done',       index: 15, name: "You're Done",            estimatedMinutes: 0,  type: 'done' },
];

// Attach placeholder renders — later phases replace these per-step.
steps.forEach(step => {
  step.render = () =>
    el('div', { class: 'container' },
      el('p', { class: 'step-label' }, step.name),
      el('p', { style: { color: 'var(--color-text-muted)', marginTop: 'var(--space-md)' } },
        'Step content coming soon.')
    );
});

/* ─── Prep step (Step 0) ─────────────────────────────────────────────────────*/

const AMAZON_REFERRAL_URL = 'https://www.amazon.com'; // TODO: replace with affiliate link before launch

// Each ingredient: { name, measure, grams?, info }
// grams is optional — omit for "to taste" quantities.
// info appears in the expandable detail panel — update freely before launch.
const INGREDIENTS = [
  {
    name: 'Flour',
    measure: '3 cups all-purpose',
    grams: '360g',
    info: 'All-purpose flour works great here. Bread flour will give you a chewier crumb — also excellent. Avoid cake flour.',
  },
  {
    name: 'Salt',
    measure: '1½ teaspoons',
    grams: '9g',
    info: 'Table salt dissolves evenly into the dough. Using kosher salt? Increase to 2 tsp.',
  },
  {
    name: 'Sugar',
    measure: '1 teaspoon',
    grams: '4g',
    info: 'Feeds the yeast and encourages browning. Don\'t skip it, even though the bread isn\'t sweet.',
  },
  {
    name: 'Instant yeast',
    measure: '1 teaspoon',
    grams: '3g',
    info: 'Instant (or rapid-rise) yeast goes straight into the dry ingredients — no proofing needed. Active dry yeast works too, but dissolve it in the warm water first and wait 5 minutes.',
  },
  {
    name: 'Warm water',
    measure: '1¼ cups',
    grams: '295g',
    info: 'Too hot kills the yeast; too cold and it won\'t activate. 100°F is a safe target — warm to the touch, not hot. A kitchen thermometer is helpful, but your wrist works too.',
  },
  {
    name: 'Olive oil',
    measure: '1½ tablespoons extra-virgin',
    grams: '20g',
    info: 'Goes into the dough. Use something you\'d be happy to dip bread in — the flavor comes through.',
  },
  {
    name: 'Olive oil',
    measure: 'additional, for the pan',
    info: 'Used to coat the pan and the surface of the dough. Be generous — a good pour is part of what makes focaccia focaccia.',
  },
  {
    name: 'Flaky sea salt',
    measure: 'for topping',
    info: 'Maldon or fleur de sel are both excellent. Table salt will work in a pinch but won\'t have the same crunch or visual presence.',
  },
];

const EQUIPMENT = [
  { name: 'Scale', tag: 'highly recommended' },
  'Large bowl with lid',
  'Small bowl',
  '9" square or 13x9 baking pan',
  'Bowl scraper or spatula',
  'Whisk',
];

/* ─── Rise microcopy ─────────────────────────────────────────────────────────*/
const RISE_MICROCOPY = [
  'The dough is resting. You should be working.',
  '25 minutes. That\'s enough time to do something that matters.',
  'Your bread doesn\'t know you\'re procrastinating. But you do.',
  'Flour, water, salt, yeast. Focus, intention, rest, repeat.',
];

/* ─── Fold content ───────────────────────────────────────────────────────────*/
const FOLD_INSTRUCTIONS = 'Time to fold. Wet your hand, grab one side of the dough, stretch it upward, and fold it to the center. Rotate the bowl and repeat until you\'ve gone all the way around — about 8 to 12 folds. Flip the dough smooth-side up, cover, and come back.';

const FOLD_TIPS = [
  'Wet hands prevent sticking. The dough will feel sticky — that\'s normal and good.',
  'The dough should feel smoother and tighter than last time. That\'s the gluten developing.',
  'By now the dough should feel almost elastic. You\'re almost done with the folds.',
  'Last fold. The dough should feel strong and smooth. It\'s ready for its long rest.',
];

/* ─── To-do list module ──────────────────────────────────────────────────────*/
function addTodo(text) {
  if (state.todos.length >= 3) return;
  state.todos.push({ id: Date.now(), text, completed: false });
  track('task_added');
  render();
}

function completeTodo(id) {
  const todo = state.todos.find(t => t.id === id);
  if (todo) {
    todo.completed = true;
    track('task_completed');
    render();
  }
}

function deleteTodo(id) {
  state.todos = state.todos.filter(t => t.id !== id);
  track('task_deleted');
  render();
}

function renderTodoList(interactive) {
  const items = state.todos.map(todo =>
    el('div', {
      class: todo.completed ? 'todo-item todo-item--done' : 'todo-item',
    },
      el('span', { class: 'todo-text' }, todo.text),
      interactive && !todo.completed
        ? el('button', {
            class: 'todo-complete',
            'data-action': 'complete-todo',
            'data-todo-id': String(todo.id),
            'aria-label': 'Mark complete',
          }, '✓')
        : false,
      interactive
        ? el('button', {
            class: 'todo-delete',
            'data-action': 'delete-todo',
            'data-todo-id': String(todo.id),
            'aria-label': 'Remove task',
          }, '×')
        : false
    )
  );

  const canAdd = interactive && state.todos.length < 3;

  return el('div', { class: 'todo-section' },
    el('p', { class: 'todo-heading' }, 'Focus tasks'),
    items.length > 0 ? el('div', { class: 'todo-list' }, ...items) : false,
    canAdd
      ? el('form', { class: 'todo-form' },
          el('input', {
            type: 'text',
            class: 'todo-input',
            id: 'todo-input',
            placeholder: items.length === 0 ? 'What will you work on?' : 'Add another task',
            maxlength: '80',
            autocomplete: 'off',
          }),
          el('button', { type: 'submit', class: 'todo-add-btn' }, '+')
        )
      : interactive && state.todos.length >= 3
        ? el('p', { class: 'todo-max' }, 'Three tasks. Pick the one that matters most.')
        : false
  );
}

function renderIngredientChecklist() {
  const rows = INGREDIENTS.map((item, i) =>
    el('div', { class: 'checklist-row checklist-row--expandable' },
      el('label', { class: 'checklist-checkbox-label' },
        el('input', { type: 'checkbox', class: 'checklist-input', id: `ing-${i}` }),
        el('span', { class: 'checklist-check', 'aria-hidden': 'true' })
      ),
      el('details', { class: 'ingredient-details' },
        el('summary', { class: 'ingredient-summary' },
          el('span', { class: 'ingredient-text' },
            el('span', { class: 'ingredient-name' }, item.name),
            el('span', { class: 'ingredient-sep' }, ', '),
            el('span', { class: 'ingredient-measure' }, item.measure),
            item.grams
              ? el('span', { class: 'ingredient-grams' }, item.grams)
              : false
          ),
          el('span', { class: 'chevron', 'aria-hidden': 'true' })
        ),
        item.info ? el('div', { class: 'ingredient-info' }, el('p', {}, item.info)) : null
      )
    )
  );

  return el('div', { class: 'checklist-section' },
    el('p', { class: 'checklist-heading' }, 'Ingredients'),
    el('div', { class: 'checklist' }, ...rows)
  );
}

function renderChecklistSection(heading, items, idPrefix) {
  return el('div', { class: 'checklist-section' },
    el('p', { class: 'checklist-heading' }, heading),
    el('div', { class: 'checklist' },
      ...items.map((item, i) => {
        const name = typeof item === 'string' ? item : item.name;
        const tag  = typeof item === 'object' ? item.tag : null;
        return el('label', { class: 'checklist-row' },
          el('input', { type: 'checkbox', class: 'checklist-input', id: `${idPrefix}-${i}` }),
          el('span', { class: 'checklist-check', 'aria-hidden': 'true' }),
          el('span', { class: 'checklist-text' }, name),
          tag ? el('span', { class: 'checklist-tag' }, tag) : false
        );
      })
    )
  );
}

function renderPWAPrompt() {
  const platform = getPlatform();
  if (platform === 'desktop') return null;

  if (!state.pwaPromptShown) {
    track('pwa_prompt_shown', { platform });
    state.pwaPromptShown = true;
  }

  if (state.pwaDismissed) {
    return el('div', { class: 'pwa-warning' },
      el('p', {}, 'Notifications may not reach you.')
    );
  }

  const instructions = platform === 'ios'
    ? [
        'Tap the Share button in Safari (the box with an arrow)',
        'Scroll down and tap “Add to Home Screen”',
        'Tap “Add”',
      ]
    : [
        'Tap the three-dot menu in Chrome',
        'Tap “Add to Home Screen” or “Install App”',
        'Tap “Install”',
      ];

  return el('div', { class: 'pwa-prompt' },
    el('p', { class: 'pwa-copy' },
      `Before you start — add this to your home screen. It's the only way your timer can reach you when your phone is locked or you've switched apps. Takes 10 seconds.`
    ),
    el('ol', { class: 'pwa-instructions' },
      ...instructions.map(text => el('li', {}, text))
    ),
    el('button', { class: 'btn-ghost', 'data-action': 'pwa-skip' }, `I'll skip this`)
  );
}

function renderNotificationSection() {
  if (!('Notification' in window)) return null;

  // Sync with live browser permission state
  if (Notification.permission === 'granted') state.notificationsGranted = true;
  if (Notification.permission === 'denied' && state.notificationsGranted === null) {
    state.notificationsGranted = false;
  }

  if (state.notificationsGranted === true) {
    return el('div', { class: 'notification-confirmed' },
      el('span', { class: 'notification-confirmed-text' }, 'Notifications enabled'),
      el('button', { class: 'btn-ghost btn-test-notification', 'data-action': 'test-notification' }, 'Test')
    );
  }

  if (state.notificationsGranted === false) {
    return el('div', { class: 'notification-warning' },
      el('p', {}, 'Notifications are off. Keep this tab open and your volume up.')
    );
  }

  // Permission still 'default' — show explainer
  return el('div', { class: 'notification-section' },
    el('p', { class: 'notification-explainer' },
      `Allow notifications so your timer can reach you — even when this tab isn't open.`
    ),
    el('button', { class: 'btn-secondary', 'data-action': 'request-notifications' },
      'Allow notifications')
  );
}

function renderPrepStep() {
  // Sync notification state before deciding CTA eligibility
  if ('Notification' in window) {
    if (Notification.permission === 'granted') state.notificationsGranted = true;
    if (Notification.permission === 'denied' && state.notificationsGranted === null) {
      state.notificationsGranted = false;
    }
  }

  const ctaActive = !('Notification' in window) ||
                    state.notificationsGranted !== null ||
                    Notification.permission !== 'default';

  return el('div', { class: 'container prep-step' },
    el('h2', { class: 'prep-heading' }, 'Let\'s gather the stuff.'),
    renderIngredientChecklist(),
    renderChecklistSection('Equipment', EQUIPMENT, 'eq'),
    renderPWAPrompt(),
    renderNotificationSection(),
    el('div', { class: 'prep-ctas' },
      el('button', {
        class: 'btn-primary',
        'data-action': 'advance-from-prep',
        disabled: !ctaActive,
      }, `I have everything, let's go`),
      el('button', {
        class: 'btn-link',
        'data-action': 'amazon-referral',
      }, '🛒 I need to grab a few things')
    )
  );
}

steps[0].render = renderPrepStep;

/* ─── Mix step (Step 1) ──────────────────────────────────────────────────────*/
// Instructions are plain strings, arrays of mixed parts ({ b: 'text' } = bold),
// or { header, items } objects that render as a sub-bulleted list.
const MIX_INSTRUCTIONS = [
  { header: 'In a large bowl, whisk together:', items: [
    [{b:'Salt'}, ' — 1½ teaspoons (9g)'],
    [{b:'Sugar'}, ' — 1 teaspoon (4g)'],
    [{b:'Instant yeast'}, ' — 1 teaspoon (3g)'],
    [{b:'Flour'}, ' — 3 cups (360g)'],
  ], tip: 'If you aren\'t using a scale, remember to fluff your flour by stirring it with a spoon or whisk in its container before measuring. Packed flour can weigh almost 40g more per cup, making your focaccia more dense and dry.' },
  { header: 'Add to the bowl:', items: [
    [{b:'Olive oil'}, ' — 1½ tablespoons (20g) extra-virgin'],
    [{b:'Warm water'}, ' — 1¼ cups (295g)'],
  ], tip: 'If you want to be more precise, look for the recommended temperature on the back of your yeast packet or jar.' },
  'Mix until fully combined with no dry patches — use a spatula, scraper, or your hands.',
  'Cover the bowl and set it aside.',
  'Add water to a small bowl, and place it near your dough bowl. This is for easily dipping your hand in water when folding the dough.',
  'Wash your hands.',
];

function renderMixStep() {
  return el('div', { class: 'container mix-step' },
    el('p', { class: 'step-label' }, 'Mix the Dough'),
    el('ol', { class: 'mix-instructions' },
      ...MIX_INSTRUCTIONS.map((instr, i) => {
        if (typeof instr === 'string') return el('li', { class: 'mix-instruction' }, instr);
        if (Array.isArray(instr)) {
          const parts = instr.map(p => typeof p === 'string' ? p : el('strong', {}, p.b));
          return el('li', { class: 'mix-instruction' }, ...parts);
        }
        // { header, items, tip? } — header + sub-checklist + optional tip
        const subItems = instr.items.map((parts, j) =>
          el('label', { class: 'checklist-row mix-subitem' },
            el('input', { type: 'checkbox', class: 'checklist-input', id: `mix-item-${i}-${j}` }),
            el('span', { class: 'checklist-check', 'aria-hidden': 'true' }),
            el('span', { class: 'checklist-text' },
              ...parts.map(p => typeof p === 'string' ? p : el('strong', {}, p.b))
            )
          )
        );
        return el('li', { class: 'mix-instruction' },
          instr.header,
          el('div', { class: 'checklist mix-sublist' }, ...subItems),
          instr.tip
            ? el('p', { class: 'mix-tip' }, instr.tip)
            : false
        );
      })
    ),
    el('hr', { class: 'mix-divider' }),
    el('blockquote', { class: 'mix-prompt' },
      'Your dough is resting. So can your mind — for just a moment. What do you want to accomplish in the next 25 minutes? Keep it simple.'
    ),
    renderTodoList(true),
    el('div', { class: 'rise-cta' },
      el('button', { class: 'btn-primary', 'data-action': 'advance-and-start-timer' },
        'Start 25 minute timer')
    )
  );
}

steps[1].render = renderMixStep;

/* ─── Rise steps (indices 2, 4, 6, 8) ───────────────────────────────────────*/
function renderRiseStep(step) {
  const riseIdx = [2, 4, 6, 8].indexOf(step.index); // 0-based → selects microcopy
  const timerRunning = state.timerInterval !== null;
  const microcopy = RISE_MICROCOPY[riseIdx % RISE_MICROCOPY.length];

  const timeRemaining = timerRunning
    ? Math.max(0, Math.round((state.timerEndTime - Date.now()) / 1000))
    : 25 * 60;

  return el('div', { class: 'container rise-step' },
    el('p', { class: 'step-label' }, step.name),
    el('div', { class: 'timer-block' },
      el('span', {
        id: 'timer-display',
        class: timerRunning ? 'timer-display' : 'timer-display timer-display--idle',
      }, formatTime(timeRemaining)),
      timerRunning
        ? el('p', { class: 'timer-microcopy' }, microcopy)
        : false
    ),
    renderTodoList(false),
    !timerRunning
      ? el('div', { class: 'rise-cta' },
          el('button', { class: 'btn-primary', 'data-action': 'start-rise-timer' },
            'Start 25 minute timer')
        )
      : false
  );
}

/* ─── Fold steps (indices 3, 5, 7, 9) ───────────────────────────────────────*/
function renderFoldStep(step) {
  const foldNum = [3, 5, 7, 9].indexOf(step.index); // 0-based → selects tip
  const timerRunning = state.timerInterval !== null;
  const timerDone = !timerRunning && state.timerEndTime !== null;
  const late = timerDone ? minutesSinceTimerEnd() : 0;

  const timeRemaining = timerRunning
    ? Math.max(0, Math.round((state.timerEndTime - Date.now()) / 1000))
    : 0;

  const isLastFold = step.index === 9; // fold-4 → pan next, not a rise

  return el('div', { class: 'container fold-step' },
    el('p', { class: 'step-label' }, step.name),
    el('div', { class: 'fold-timer-block' },
      el('span', {
        id: 'timer-display',
        class: 'timer-display timer-display--ambient',
      }, timerRunning ? formatTime(timeRemaining) : '00:00')
    ),
    el('div', { class: 'fold-instructions' },
      el('p', { class: 'fold-instructions-text' }, FOLD_INSTRUCTIONS)
    ),
    el('div', { class: 'fold-tip' },
      el('p', { class: 'fold-tip-label' }, 'Tip'),
      el('p', { class: 'fold-tip-text' }, FOLD_TIPS[foldNum])
    ),
    renderTodoList(true),
    timerDone
      ? el('div', { class: 'fold-return' },
          late > 0
            ? el('p', { class: 'fold-late' },
                `You're ${late} minute${late === 1 ? '' : 's'} over. The dough is fine — get back to it.`)
            : el('p', { class: 'fold-ready' }, 'Time to get back to it.'),
          isLastFold
            ? el('button', { class: 'btn-primary', 'data-action': 'advance-from-fold' }, 'Continue')
            : el('button', { class: 'btn-primary', 'data-action': 'advance-and-start-timer' },
                'Start 25 minute timer')
        )
      : false
  );
}

[2, 4, 6, 8].forEach(i => { steps[i].render = () => renderRiseStep(steps[i]); });
[3, 5, 7, 9].forEach(i => { steps[i].render = () => renderFoldStep(steps[i]); });

/* ─── Pan step content (Step 10) ─────────────────────────────────────────────*/
const PAN_INSTRUCTIONS = [
  'Pour a generous amount of olive oil into the pan — about 3 tablespoons for a 9" square, a bit more for a 13×9. Tilt to coat the bottom.',
  'Scrape the dough into the pan. It will look very loose and wet. That\'s right.',
  'Turn the dough in the oil to coat it, then gently press it toward the edges. It won\'t reach all the way — leave it. It will spread as it rises.',
  'Cover and leave it alone.',
];

const PAN_FOLD_BREAKS = [
  {
    instruction: 'Set your oven to 450°F (230°C) with a rack in the middle. While you\'re in the kitchen, check the dough — it should have spread toward the edges. If it hasn\'t reached, gently coax it with oiled fingers.',
    tip: 'A fully preheated oven makes a real difference. Give it at least 30 minutes if your oven runs cool.',
  },
  {
    instruction: 'Drizzle a little more olive oil over the top of the dough. Press your fingers firmly all the way to the bottom of the pan — deep, decisive dimples across the whole surface. Scatter your flaky sea salt. It goes in the oven now.',
    tip: 'Don\'t be shy with the dimples. Press hard all the way down. They fill back in during baking and hold the oil — that\'s where the crunch lives.',
  },
];

const BAKE_DONENESS = 'The bread is done when the top is deep golden brown. Pull back a corner to check the bottom — it should be golden too, not pale or soft. A hollow sound when you tap the top is a good sign.';

const FINISH_INSTRUCTIONS = [
  'Remove the pan from the oven.',
  'Let it cool in the pan for 5 minutes. The residual heat keeps the bottom crisping. Steam is the enemy of crust — don\'t cover it.',
  'Slide a spatula underneath and transfer to a cutting board or wire rack.',
  'Wait at least 10 more minutes before cutting. You\'ve come this far.',
];

const INSTAGRAM_URL = 'https://instagram.com'; // TODO: replace with real handle/tag before launch
const WCK_URL       = 'https://wck.org/donate';

/* ─── Loaf choice widget ─────────────────────────────────────────────────────*/
function renderLoafChoice() {
  const opts = [
    { value: 'single', label: '9" square pan', sub: 'Thick, tall, chewy center' },
    { value: 'double', label: '13×9 pan',       sub: 'Thinner, crispier, feeds more' },
  ];
  return el('div', { class: 'loaf-choice' },
    el('p', { class: 'loaf-choice-label' }, 'Which pan are you using?'),
    el('div', { class: 'loaf-options' },
      ...opts.map(opt =>
        el('button', {
          class: state.loafChoice === opt.value
            ? 'loaf-option loaf-option--selected'
            : 'loaf-option',
          'data-action': 'select-loaf',
          'data-loaf':   opt.value,
        },
          el('span', { class: 'loaf-option-label' }, opt.label),
          el('span', { class: 'loaf-option-sub' },   opt.sub)
        )
      )
    )
  );
}

/* ─── Pan step (Step 10) ─────────────────────────────────────────────────────*/
function renderPanStep() {
  return el('div', { class: 'container pan-step' },
    el('p', { class: 'step-label' }, 'Move Dough to Pan'),
    el('div', { class: 'pan-instructions' },
      ...PAN_INSTRUCTIONS.map(text => el('p', { class: 'pan-instruction' }, text))
    ),
    renderLoafChoice(),
    renderTodoList(true),
    el('div', { class: 'rise-cta' },
      el('button', {
        class: 'btn-primary',
        'data-action': 'start-pan-timer',
        disabled: !state.loafChoice,
      }, 'Start 25 minute timer')
    )
  );
}

steps[10].render = renderPanStep;

/* ─── Pan rise steps (Steps 11, 12) ─────────────────────────────────────────*/
function renderPanRiseStep(step) {
  const isPanRise1 = step.index === 11;
  const foldBreak  = PAN_FOLD_BREAKS[isPanRise1 ? 0 : 1];

  if (state.inFoldBreak) {
    const timerRunning = state.timerInterval !== null;
    const timerDone    = !timerRunning && state.timerEndTime !== null;
    const late         = timerDone ? minutesSinceTimerEnd() : 0;
    const timeRemaining = timerRunning
      ? Math.max(0, Math.round((state.timerEndTime - Date.now()) / 1000))
      : 0;

    return el('div', { class: 'container fold-step' },
      el('p', { class: 'step-label' }, step.name),
      el('div', { class: 'fold-timer-block' },
        el('span', {
          id: 'timer-display',
          class: 'timer-display timer-display--ambient',
        }, timerRunning ? formatTime(timeRemaining) : '00:00')
      ),
      el('div', { class: 'fold-instructions' },
        el('p', { class: 'fold-instructions-text' }, foldBreak.instruction)
      ),
      el('div', { class: 'fold-tip' },
        el('p', { class: 'fold-tip-label' }, 'Tip'),
        el('p', { class: 'fold-tip-text' }, foldBreak.tip)
      ),
      renderTodoList(true),
      timerDone
        ? el('div', { class: 'fold-return' },
            late > 0
              ? el('p', { class: 'fold-late' },
                  `You're ${late} minute${late === 1 ? '' : 's'} over. Keep going.`)
              : el('p', { class: 'fold-ready' },
                  isPanRise1 ? 'Ready for the second half.' : 'Time to bake.'),
            el('button', {
              class: 'btn-primary',
              'data-action': 'advance-from-pan-fold',
              'data-next':    String(isPanRise1 ? 12 : 13),
              'data-minutes': String(isPanRise1 ? 25 : 15),
            }, isPanRise1 ? 'Start 25 minute timer' : 'Start 15 minute timer')
          )
        : false
    );
  }

  const timerRunning  = state.timerInterval !== null;
  const microcopy     = RISE_MICROCOPY[isPanRise1 ? 0 : 1];
  const timeRemaining = timerRunning
    ? Math.max(0, Math.round((state.timerEndTime - Date.now()) / 1000))
    : 25 * 60;

  return el('div', { class: 'container rise-step' },
    el('p', { class: 'step-label' }, step.name),
    el('div', { class: 'timer-block' },
      el('span', {
        id: 'timer-display',
        class: timerRunning ? 'timer-display' : 'timer-display timer-display--idle',
      }, formatTime(timeRemaining)),
      timerRunning
        ? el('p', { class: 'timer-microcopy' }, microcopy)
        : false
    ),
    renderTodoList(false),
    !timerRunning
      ? el('div', { class: 'rise-cta' },
          el('button', { class: 'btn-primary', 'data-action': 'start-pan-rise-timer' },
            'Start 25 minute timer')
        )
      : false
  );
}

steps[11].render = () => renderPanRiseStep(steps[11]);
steps[12].render = () => renderPanRiseStep(steps[12]);

/* ─── Bake step (Step 13) ────────────────────────────────────────────────────*/
function renderBakeStep() {
  const timerRunning  = state.timerInterval !== null;
  const timerDone     = !timerRunning && state.timerEndTime !== null;
  const timeRemaining = timerRunning
    ? Math.max(0, Math.round((state.timerEndTime - Date.now()) / 1000))
    : 15 * 60;

  const reflectionBlock = el('div', { class: 'reflection-section' },
    el('p', { class: 'reflection-label' }, 'While you wait — how did the session go?'),
    el('textarea', {
      class: 'reflection-textarea',
      id: 'reflection-input',
      placeholder: 'What did you work on? What would you do differently? What surprised you?',
      rows: '5',
    }, state.reflection)
  );

  if (timerDone) {
    return el('div', { class: 'container bake-step' },
      el('p', { class: 'step-label' }, 'Bake — First Check'),
      el('div', { class: 'bake-check' },
        el('p', { class: 'bake-doneness' }, BAKE_DONENESS),
        el('div', { class: 'bake-extend' },
          el('p', { class: 'bake-extend-label' }, 'Need a little more?'),
          el('div', { class: 'extend-buttons' },
            ...[2, 3, 4, 5].map(min =>
              el('button', {
                class: 'btn-extend',
                'data-action': 'extend-bake',
                'data-minutes': String(min),
              }, `+${min} min`)
            )
          )
        ),
        el('button', { class: 'btn-primary', 'data-action': 'advance-to-finish' },
          'Remove from oven')
      ),
      reflectionBlock
    );
  }

  return el('div', { class: 'container bake-step' },
    el('p', { class: 'step-label' }, 'Bake — First Check'),
    el('div', { class: 'timer-block' },
      el('span', {
        id: 'timer-display',
        class: timerRunning ? 'timer-display' : 'timer-display timer-display--idle',
      }, formatTime(timeRemaining))
    ),
    el('p', { class: 'bake-hint' },
      'Check for deep golden brown on top, golden on the bottom.'),
    reflectionBlock,
    !timerRunning
      ? el('div', { class: 'rise-cta' },
          el('button', { class: 'btn-primary', 'data-action': 'start-bake-timer' },
            'Start 15 minute timer')
        )
      : false
  );
}

steps[13].render = renderBakeStep;

/* ─── Finish step (Step 14) ──────────────────────────────────────────────────*/
function renderFinishStep() {
  const timerRunning  = state.timerInterval !== null;
  const timeRemaining = timerRunning
    ? Math.max(0, Math.round((state.timerEndTime - Date.now()) / 1000))
    : 7 * 60;

  return el('div', { class: 'container finish-step' },
    el('p', { class: 'step-label' }, 'Remove from Oven'),
    el('div', { class: 'finish-instructions' },
      ...FINISH_INSTRUCTIONS.map(text => el('p', { class: 'finish-instruction' }, text))
    ),
    el('div', { class: timerRunning ? 'timer-block' : 'timer-block timer-block--idle' },
      el('span', {
        id: 'timer-display',
        class: timerRunning ? 'timer-display' : 'timer-display timer-display--idle',
      }, formatTime(timeRemaining))
    ),
    !timerRunning
      ? el('div', { class: 'rise-cta' },
          el('button', { class: 'btn-primary', 'data-action': 'start-finish-timer' },
            'Start 7 minute timer')
        )
      : false
  );
}

steps[14].render = renderFinishStep;

/* ─── Done screen (Step 15) ──────────────────────────────────────────────────*/
function renderDoneScreen() {
  return el('div', { class: 'container done-step' },
    el('div', { class: 'done-hero' },
      el('h2', { class: 'done-heading' }, 'You made bread. You did your work.'),
      el('p',  { class: 'done-sub' },    'That\'s time well spent.')
    ),
    state.reflection
      ? el('blockquote', { class: 'done-reflection' }, state.reflection)
      : false,
    el('div', { class: 'done-share' },
      el('p', { class: 'done-share-label' }, 'Share what you made?'),
      el('a', {
        class: 'btn-secondary done-instagram',
        href: INSTAGRAM_URL,
        target: '_blank',
        rel: 'noopener noreferrer',
      }, 'Share on Instagram')
    ),
    el('div', { class: 'done-support' },
      el('p', { class: 'done-support-label' },
        'Focadoro is free. If it helped, consider donating to World Central Kitchen — feeding people through food.'),
      el('button', { class: 'btn-flour', 'data-action': 'buy-me-flour' },
        'Donate to World Central Kitchen 🌾')
    ),
    el('div', { class: 'done-feedback' },
      el('p', { class: 'done-feedback-label' }, 'How was your session?'),
      el('a', {
        class: 'btn-ghost',
        href: 'mailto:hey@carrieflips.com?subject=Focadoro feedback',
      }, 'Send feedback →')
    ),
    el('div', { class: 'done-restart' },
      el('button', { class: 'btn-ghost', 'data-action': 'new-session' },
        'Start a new session')
    )
  );
}

steps[15].render = renderDoneScreen;

/* ─── Homepage ───────────────────────────────────────────────────────────────*/

const FAQ_ITEMS = [
  {
    q: "What's a Pomodoro?",
    a: "The Pomodoro Technique is a way of working in focused bursts, separated by short breaks. You pick one thing, work on it without interruption for a fixed amount of time, then step away briefly before starting again. The idea is that knowing a break is coming makes it easier to stay focused — and that regular rest prevents the kind of slow mental fade that turns a productive session into a blurry one."
  },
  {
    q: "Why is it called that?",
    a: "Francesco Cirillo invented the technique as a university student in the late 1980s, using a tomato-shaped kitchen timer to keep himself on track. Pomodoro is Italian for tomato. The timer on your counter is carrying on a proud tradition."
  },
  {
    q: "How does it work?",
    a: "You work for 25 minutes, then take a 5-minute break. After four cycles, you take a longer break. That's it. The simplicity is the point — there's nothing to configure or optimize. You just start the timer and do the thing."
  },
  {
    q: "What's focaccia?",
    a: "Focaccia is a flat Italian bread, dimpled with olive oil and sea salt, with a crust that crackles and an inside that's soft and chewy. It's one of the most forgiving breads you can make — the dough is sticky and loose, it doesn't need to be shaped, and it wants to be left alone between folds. Which, as it turns out, makes it perfect for a focused session."
  },
  {
    q: "How much time do I need?",
    a: "About 4 hours from start to finish — which sounds like a lot until you realize most of that time is the dough doing its thing while you're doing yours. You'll spend maybe 20 minutes of active kitchen time across the whole session. The rest is rising, folding, and baking alongside your work. All you need is a clear stretch ahead of you."
  },
  {
    q: "How does Focadoro work?",
    a: "Focadoro maps the natural rhythm of making focaccia onto a focused work session. Each 30-minute cycle — 25 minutes of deep work, 5 minutes to fold your dough and reset — becomes one rise. By the time your bread comes out of the oven, you've done four focused work sessions, reflected on how it went, and made something delicious. You just need a bowl, a few ingredients, and somewhere to be for a few hours."
  },
];

function renderFAQ() {
  const items = FAQ_ITEMS.map(({ q, a }) =>
    el('details', { class: 'faq-item' },
      el('summary', { class: 'faq-question' }, q),
      el('div', { class: 'faq-answer' }, el('p', {}, a))
    )
  );
  return el('section', { class: 'faq-section' },
    el('h2', { class: 'faq-heading' }, 'Questions'),
    ...items
  );
}

function renderQRSection() {
  // Desktop-only via CSS. QR code is a placeholder — swap for real URL before launch.
  return el('div', { class: 'qr-section' },
    el('div', { class: 'qr-placeholder', 'aria-hidden': 'true' }),
    el('div', { class: 'qr-copy' },
      el('p', { class: 'qr-heading' }, 'Take this to the kitchen with you.'),
      el('p', { class: 'qr-sub' }, 'Save it to your home screen so your timer can reach you.')
    )
  );
}

const homepage = {
  id: 'home',
  render() {
    return el('div', { class: 'homepage-wrapper' },
      el('div', { class: 'container' },
        el('header', { class: 'homepage-hero' },
          el('h1', { class: 'home-title' }, 'Focadoro'),
          el('p', { class: 'home-tagline' }, 'Bread and work, in perfect rhythm.'),
          el('p', { class: 'home-intro' },
            'Focadoro pairs the Pomodoro work rhythm with making focaccia bread. The bread is a bonus — the real product is a structured session that gets you up from your desk, moving your body, and returning to your work with intention. By the time your loaf comes out of the oven, you\'ve had one of your most focused sessions in recent memory.'
          ),
          el('button', { class: 'btn-primary', 'data-action': 'start-session' }, 'Get Prepped')
        ),
        renderFAQ(),
        renderQRSection(),
        el('footer', { class: 'homepage-footer' },
          el('p', {},
            'This site uses Google Analytics to understand how the experience is working. No personal data is collected.'
          )
        )
      )
    );
  },
};

/* ─── Render helpers ─────────────────────────────────────────────────────────*/
function renderProgressStrip() {
  const dots = steps.map((step, i) => {
    const cls = i < state.currentStepIndex ? 'dot dot--past'
              : i === state.currentStepIndex ? 'dot dot--current'
              : 'dot dot--future';
    return el('span', { class: cls, 'data-step-index': i, 'aria-label': step.name });
  });
  return el('nav', { class: 'progress-strip', 'aria-label': 'Session progress' }, dots);
}

function renderStepShell(step) {
  const i = step.index;

  if (i < state.currentStepIndex) {
    return el('div', { class: 'step step--past', 'data-step-index': i },
      el('div', { class: 'container' },
        el('p', { class: 'step-past-name' }, step.name),
        el('p', { class: 'step-past-summary' }, 'Completed')
      )
    );
  }

  if (i > state.currentStepIndex) {
    return el('div', { class: 'step step--future', 'data-step-index': i },
      el('div', { class: 'container' },
        el('p', { class: 'step-future-name' }, step.name),
        el('p', { class: 'step-future-time' },
          step.estimatedMinutes > 0 ? `~${step.estimatedMinutes} min` : '')
      )
    );
  }

  return el('div', { class: 'step step--current', 'data-step-index': i },
    step.render()
  );
}

/* ─── Main render ────────────────────────────────────────────────────────────*/
const app = document.getElementById('app');

function render() {
  if (state.view === 'home') {
    app.replaceChildren(homepage.render());
    return;
  }

  const isOffCurrent = state.viewedStepIndex !== state.currentStepIndex;
  const viewed = steps[state.viewedStepIndex];

  const children = [
    renderProgressStrip(),
    el('div', { class: 'illustration-wrapper' },
      el('img', { class: 'illustration-header', src: 'illustration.svg', alt: '' })
    ),
    el('div', { class: 'session-viewport' },
      renderStepShell(viewed)
    ),
  ];

  if (isOffCurrent) {
    children.push(
      el('div', { class: 'back-to-current' },
        el('button', { class: 'btn-ghost', 'data-action': 'return-to-current' },
          '← Back to current step')
      )
    );
  }

  children.push(
    el('div', { class: 'session-nav', 'aria-hidden': 'true' },
      el('button', {
        class: 'nav-arrow nav-arrow--prev',
        'data-action': 'nav-prev',
        disabled: state.viewedStepIndex === 0,
        'aria-label': 'Previous step',
      }, '‹'),
      el('button', {
        class: 'nav-arrow nav-arrow--next',
        'data-action': 'nav-next',
        disabled: state.viewedStepIndex === steps.length - 1,
        'aria-label': 'Next step',
      }, '›')
    )
  );

  if (state.alarmActive) children.push(renderAlarmOverlay());
  app.replaceChildren(...children);
}

/* ─── Navigation ─────────────────────────────────────────────────────────────*/
function startSession() {
  state.view = 'session';
  state.currentStepIndex = 0;
  state.viewedStepIndex = 0;
  state.sessionStartTime = Date.now();
  initAudio(); // unlock AudioContext while we're inside a user gesture
  track('session_started');
  render();
}

function advanceTo(index) {
  if (index < 0 || index >= steps.length) return;
  stopTimer();
  state.timerEndTime = null;
  state.inFoldBreak = false;
  state.currentStepIndex = index;
  state.viewedStepIndex = index;
  if (steps[index].type === 'fold') startFoldTimer();
  render();
}

function goNext() {
  advanceTo(state.currentStepIndex + 1);
}

function peekStep(index) {
  if (index < 0 || index >= steps.length) return;
  state.viewedStepIndex = index;
  render();
}

/* ─── Timer engine ───────────────────────────────────────────────────────────*/

// AudioContext is created once during the first user gesture so the browser
// allows programmatic audio when the timer alarm fires automatically.
let _audioCtx = null;

function initAudio() {
  if (_audioCtx) return;
  try {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (_) {}
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function startTimer(durationSeconds, onTick, onComplete) {
  stopTimer();
  initAudio(); // called while inside a user gesture (the "Start timer" tap)
  state.timerEndTime = Date.now() + (durationSeconds * 1000);

  state.timerInterval = setInterval(() => {
    const remaining = Math.max(0, Math.round((state.timerEndTime - Date.now()) / 1000));
    onTick(remaining);
    if (remaining <= 0) {
      stopTimer();
      playChime();
      scheduleNotification('Focadoro', 'Your timer is done. Time to fold.', 0);
      onComplete();
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function startFoldTimer() {
  startTimer(5 * 60,
    (rem) => {
      const display = document.getElementById('timer-display');
      if (display) display.textContent = formatTime(rem);
    },
    () => { render(); }
  );
}

function scheduleNotification(title, body, delayMs) {
  if (state.notificationsGranted !== true) return;
  if (!('Notification' in window)) return;
  setTimeout(() => {
    try { new Notification(title, { body, icon: 'icon-192.png' }); } catch (_) {}
  }, delayMs);
}

// Warm bell chord: D5 (587 Hz) + A5 (880 Hz) + D6 (1174 Hz).
// Three overlapping sine waves with exponential decay — no external file needed.
function playChime() {
  const ctx = _audioCtx;
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume();
    [[587, 0.28], [880, 0.14], [1174, 0.07]].forEach(([freq, amp]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(amp, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 2);
    });
  } catch (_) {}
}

function silenceAlarm() {
  state.alarmActive = false;
  const cb = state.onSilence;
  state.onSilence = null;
  if (typeof cb === 'function') cb(); // cb typically calls goNext() → render()
  else render();
}

// ─── Elapsed time helpers ─────────────────────────────────────────────────────

function sessionElapsedMinutes() {
  if (!state.sessionStartTime) return 0;
  return Math.floor((Date.now() - state.sessionStartTime) / 60000);
}

function minutesSinceTimerEnd() {
  if (!state.timerEndTime) return 0;
  return Math.floor((Date.now() - state.timerEndTime) / 60000);
}

// ─── Alarm overlay ────────────────────────────────────────────────────────────

function renderAlarmOverlay() {
  return el('div', { class: 'alarm-overlay' },
    el('div', { class: 'alarm-inner' },
      el('p',      { class: 'alarm-label'   }, 'Timer complete'),
      el('button', { class: 'alarm-silence', 'data-action': 'silence-alarm' },
        'Tap to silence')
    )
  );
}

// Expose for console testing (build plan test checklist)
window.startSession  = startSession;
window.advanceTo     = advanceTo;
window.goNext        = goNext;
window.peekStep      = peekStep;
window.state         = state;
window.startTimer    = startTimer;
window.stopTimer     = stopTimer;
window.formatTime    = formatTime;
window.playChime     = playChime;
window.silenceAlarm  = silenceAlarm;
window.sessionElapsedMinutes = sessionElapsedMinutes;
window.minutesSinceTimerEnd  = minutesSinceTimerEnd;
window.addTodo       = addTodo;
window.completeTodo  = completeTodo;
window.deleteTodo    = deleteTodo;

/* ─── Event delegation (single listener, survives re-renders) ────────────────*/
app.addEventListener('click', (e) => {
  // Tapping any past or future step while peeking returns to current
  if (state.view === 'session' && isOffCurrent()) {
    const stepEl = e.target.closest('.step--past, .step--future');
    if (stepEl) { peekStep(state.currentStepIndex); return; }
  }

  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;

  switch (actionEl.dataset.action) {
    case 'start-session':     startSession(); break;
    case 'nav-prev':          peekStep(state.viewedStepIndex - 1); break;
    case 'nav-next':          peekStep(state.viewedStepIndex + 1); break;
    case 'return-to-current': peekStep(state.currentStepIndex); break;

    case 'pwa-skip':
      state.pwaDismissed = true;
      render();
      break;

    case 'request-notifications':
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          state.notificationsGranted = true;
          track('notification_granted');
        } else {
          state.notificationsGranted = false;
          track('notification_denied');
        }
        render();
      });
      break;

    case 'test-notification':
      initAudio();
      playChime();
      scheduleNotification('Focadoro', 'Notifications are working. Your timer will reach you.', 0);
      break;

    case 'advance-from-prep':
      track('step_completed', { step_name: 'prep', step_index: 0 });
      advanceTo(1);
      break;

    case 'amazon-referral':
      track('amazon_referral_clicked');
      window.open(AMAZON_REFERRAL_URL, '_blank', 'noopener,noreferrer');
      break;

    case 'silence-alarm':
      silenceAlarm();
      break;

    case 'start-rise-timer':
      startTimer(25 * 60,
        (rem) => {
          const display = document.getElementById('timer-display');
          if (display) display.textContent = formatTime(rem);
        },
        () => {
          state.alarmActive = true;
          state.onSilence = () => goNext();
          render();
        }
      );
      render();
      break;

    case 'advance-and-start-timer':
      goNext(); // advances to next rise step; advanceTo clears timer state
      startTimer(25 * 60,
        (rem) => {
          const display = document.getElementById('timer-display');
          if (display) display.textContent = formatTime(rem);
        },
        () => {
          state.alarmActive = true;
          state.onSilence = () => goNext();
          render();
        }
      );
      render();
      break;

    case 'advance-from-fold':
      track('step_completed', { step_name: steps[state.currentStepIndex].id });
      goNext();
      break;

    case 'complete-todo': {
      const todoId = Number(actionEl.dataset.todoId);
      completeTodo(todoId);
      break;
    }

    case 'delete-todo': {
      const todoId = Number(actionEl.dataset.todoId);
      deleteTodo(todoId);
      break;
    }

    case 'select-loaf':
      state.loafChoice = actionEl.dataset.loaf;
      render();
      break;

    // Pan step → pan-rise-1: advance + start 25-min rise timer
    case 'start-pan-timer':
      goNext();
      startTimer(25 * 60,
        (rem) => {
          const display = document.getElementById('timer-display');
          if (display) display.textContent = formatTime(rem);
        },
        () => {
          state.alarmActive = true;
          state.onSilence = () => {
            state.inFoldBreak = true;
            state.timerEndTime = null;
            startFoldTimer();
            render();
          };
          render();
        }
      );
      render();
      break;

    // Pan-rise idle state "Start 25 minute timer" (fallback if navigated manually)
    case 'start-pan-rise-timer':
      startTimer(25 * 60,
        (rem) => {
          const display = document.getElementById('timer-display');
          if (display) display.textContent = formatTime(rem);
        },
        () => {
          state.alarmActive = true;
          state.onSilence = () => {
            state.inFoldBreak = true;
            state.timerEndTime = null;
            startFoldTimer();
            render();
          };
          render();
        }
      );
      render();
      break;

    // Pan-rise fold break done → advance and start next timer (25 or 15 min)
    case 'advance-from-pan-fold': {
      const nextIdx  = parseInt(actionEl.dataset.next,    10);
      const mins     = parseInt(actionEl.dataset.minutes, 10);
      const toBake   = nextIdx === 13;
      advanceTo(nextIdx); // resets inFoldBreak, clears timer state
      startTimer(mins * 60,
        (rem) => {
          const display = document.getElementById('timer-display');
          if (display) display.textContent = formatTime(rem);
        },
        () => {
          state.alarmActive = true;
          state.onSilence = toBake
            ? () => render()                               // bake check state
            : () => { state.inFoldBreak = true; state.timerEndTime = null; startFoldTimer(); render(); };
          render();
        }
      );
      render();
      break;
    }

    // Bake step idle fallback
    case 'start-bake-timer':
      startTimer(15 * 60,
        (rem) => {
          const display = document.getElementById('timer-display');
          if (display) display.textContent = formatTime(rem);
        },
        () => {
          state.alarmActive = true;
          state.onSilence = () => render();
          render();
        }
      );
      render();
      break;

    case 'extend-bake': {
      const extMins = parseInt(actionEl.dataset.minutes, 10);
      startTimer(extMins * 60,
        (rem) => {
          const display = document.getElementById('timer-display');
          if (display) display.textContent = formatTime(rem);
        },
        () => {
          state.alarmActive = true;
          state.onSilence = () => render();
          render();
        }
      );
      render();
      break;
    }

    case 'advance-to-finish':
      track('step_completed', { step_name: 'bake' });
      goNext();
      break;

    case 'start-finish-timer':
      startTimer(7 * 60,
        (rem) => {
          const display = document.getElementById('timer-display');
          if (display) display.textContent = formatTime(rem);
        },
        () => {
          state.alarmActive = true;
          state.onSilence = () => {
            track('session_completed', {
              total_session_duration_seconds:
                Math.round((Date.now() - state.sessionStartTime) / 1000),
            });
            goNext(); // → done (step 15)
          };
          render();
        }
      );
      render();
      break;

    case 'buy-me-flour':
      track('buy_me_flour_clicked');
      window.open(WCK_URL, '_blank', 'noopener,noreferrer');
      break;

    case 'new-session':
      location.reload();
      break;
  }
});

function isOffCurrent() {
  return state.viewedStepIndex !== state.currentStepIndex;
}

/* ─── Swipe detection ────────────────────────────────────────────────────────*/
let touchStartX = 0;
let touchStartY = 0;

app.addEventListener('input', (e) => {
  if (e.target.id === 'reflection-input') state.reflection = e.target.value;
});

app.addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.matches('.todo-form')) {
    const input = e.target.querySelector('#todo-input');
    if (input && input.value.trim()) addTodo(input.value.trim());
  }
});

app.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });

app.addEventListener('touchend', (e) => {
  if (state.view !== 'session') return;

  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;

  // Ignore if more vertical than horizontal, or too short
  if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;

  if (dx < 0) peekStep(state.viewedStepIndex + 1); // swipe left → future
  else         peekStep(state.viewedStepIndex - 1); // swipe right → past
});

/* ─── Init ───────────────────────────────────────────────────────────────────*/
render();
