// oracle/rung-map.mjs
// Maps each fidelity-scored rung to its target/oracle source files and the
// canonical Storybook story id on each side. Paths are relative to the trial
// root (workbench/trials/<trialId>, resolved via TRIAL).
//
// Rungs are named by COMPLEXITY tier (trivial/moderate/complex/extreme), not by
// a fixed design methodology. Component placement is FLAT
// (config.components.designMethodology = "flat"): every component lands in
// target/src/components/<Name>/. The trivial-icon and tokens runs are out of
// fidelity scope (icon a11y / token-layer fidelity are checked separately —
// see STEPS.md).
//
// targetTsx paths assume the flat layout. Before `run-accuracy.mjs`, reconcile
// each targetTsx to the actual build output (glob target/src/components/<Name>/).
// oracleStoryId values are best-guess HeroUI Storybook ids — verify them against
// the built oracle Storybook before a `--render` (visual/style) pass.
export const RUNG_MAP = {
  'trivial-button': {
    rung: 'trivial-button', component: 'Button',
    targetTsx: 'target/src/components/Button/Button.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/button/button.tsx',
    hasOracleStory: true,
    targetStoryId: 'components-components-button--default',
    oracleStoryId: 'components-buttons-button--default',
  },
  'trivial-chip': {
    rung: 'trivial-chip', component: 'Chip',
    targetTsx: 'target/src/components/Chip/Chip.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/chip/chip.tsx',
    hasOracleStory: true,
    targetStoryId: 'components-components-chip--default',
    oracleStoryId: 'components-data-display-chip--default',
  },
  'moderate-input': {
    rung: 'moderate-input', component: 'Input',
    targetTsx: 'target/src/components/Input/Input.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/input/input.tsx',
    hasOracleStory: true,
    targetStoryId: 'components-input--default',
    oracleStoryId: 'components-forms-input--default',
  },
  'moderate-switch': {
    rung: 'moderate-switch', component: 'Switch',
    targetTsx: 'target/src/components/Switch/Switch.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/switch/switch.tsx',
    hasOracleStory: true,
    targetStoryId: 'components-components-switch--default',
    oracleStoryId: 'components-controls-switch--default',
  },
  'complex-card': {
    rung: 'complex-card', component: 'Card',
    targetTsx: 'target/src/components/Card/Card.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/card/card.tsx',
    hasOracleStory: true,
    targetStoryId: 'components-components-card--default',
    oracleStoryId: 'components-layout-card--default',
  },
  'complex-alert': {
    rung: 'complex-alert', component: 'Alert',
    targetTsx: 'target/src/components/Alert/Alert.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/alert/alert.tsx',
    hasOracleStory: true,
    targetStoryId: 'components-components-alert--default',
    oracleStoryId: 'components-feedback-alert--default',
  },
  'complex-tabs': {
    rung: 'complex-tabs', component: 'Tabs',
    targetTsx: 'target/src/components/Tabs/Tabs.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/tabs/tabs.tsx',
    hasOracleStory: true,
    targetStoryId: 'components-components-tabs--primary',
    oracleStoryId: 'components-navigation-tabs--default',
  },
  'extreme-calendar': {
    rung: 'extreme-calendar', component: 'Calendar',
    targetTsx: 'target/src/components/Calendar/Calendar.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/calendar/calendar.tsx',
    hasOracleStory: true,
    targetStoryId: 'components-components-calendar--default',
    oracleStoryId: 'components-date-and-time-calendar--default',
  },
  'complex-dashboard': {
    rung: 'complex-dashboard', component: 'Dashboard',
    targetTsx: 'target/src/components/DashboardDemo/DashboardDemo.tsx',
    // Composition demo — no 1:1 component oracle; closest HeroUI demo is the
    // subtle-cards dashboard layout. Scored structurally + by quality judge, not
    // pixel-diffed to a single component story.
    oracleTsx: 'ref-heroui/packages/storybook/.storybook/stories/demos/subtle-cards-demo.tsx',
    hasOracleStory: false,
    targetStoryId: 'components-components-dashboarddemo--default',
    oracleStoryId: null,
  },
};

// runId in results.json differs from rung only for the cached/compared input
// (moderate-input scores against the cold build).
export const RUNG_TO_RUNID = {
  'trivial-button': 'trivial-button',
  'trivial-chip': 'trivial-chip',
  'moderate-input': 'moderate-input-cold',
  'moderate-switch': 'moderate-switch',
  'complex-card': 'complex-card',
  'complex-alert': 'complex-alert',
  'complex-tabs': 'complex-tabs',
  'extreme-calendar': 'extreme-calendar',
  'complex-dashboard': 'complex-dashboard',
};

export const scoredRungs = () => Object.values(RUNG_MAP);
