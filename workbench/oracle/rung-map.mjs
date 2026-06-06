// oracle/rung-map.mjs
// Maps each fidelity-scored rung to its target/oracle source files and the
// canonical Storybook story id on each side. Paths are relative to the trial
// root (workbench/trials/<trialId>, resolved via TRIAL). icon-only and tokens
// are out of fidelity scope (icon a11y / token-layer fidelity are checked
// separately — see STEPS.md).
//
// targetTsx paths are PREDICTED from the intent-based layer classifier
// (protocols/component-layout.md). Before `run-accuracy.mjs`, reconcile each
// targetTsx to the actual build output (glob target/src/components/**/<Name>/).
// oracleStoryId values are best-guess HeroUI Storybook ids — verify them against
// the built oracle Storybook before a `--render` (visual/style) pass.
export const RUNG_MAP = {
  atom: {
    rung: 'atom', component: 'Button',
    targetTsx: 'target/src/components/atoms/Button/Button.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/button/button.tsx',
    hasOracleStory: true,
    targetStoryId: 'components-atoms-button--default',
    oracleStoryId: 'components-buttons-button--default',
  },
  chip: {
    rung: 'chip', component: 'Chip',
    targetTsx: 'target/src/components/atoms/Chip/Chip.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/chip/chip.tsx',
    hasOracleStory: true,
    targetStoryId: 'components-atoms-chip--default',
    oracleStoryId: 'components-data-display-chip--default',
  },
  molecule: {
    rung: 'molecule', component: 'Input',
    targetTsx: 'target/src/components/molecules/Input/Input.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/input/input.tsx',
    hasOracleStory: true,
    targetStoryId: 'components-molecules-input--default',
    oracleStoryId: 'components-forms-input--default',
  },
  switch: {
    rung: 'switch', component: 'Switch',
    targetTsx: 'target/src/components/molecules/Switch/Switch.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/switch/switch.tsx',
    hasOracleStory: true,
    targetStoryId: 'components-molecules-switch--default',
    oracleStoryId: 'components-forms-switch--default',
  },
  organism: {
    rung: 'organism', component: 'Card',
    targetTsx: 'target/src/components/organisms/Card/Card.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/card/card.tsx',
    hasOracleStory: true,
    targetStoryId: 'components-organisms-card--default',
    oracleStoryId: 'components-layout-card--default',
  },
  tabs: {
    rung: 'tabs', component: 'Tabs',
    targetTsx: 'target/src/components/organisms/Tabs/Tabs.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/tabs/tabs.tsx',
    hasOracleStory: true,
    targetStoryId: 'components-organisms-tabs--default',
    oracleStoryId: 'components-navigation-tabs--default',
  },
  'all-icons': {
    rung: 'all-icons', component: 'Alert',
    targetTsx: 'target/src/components/molecules/Alert/Alert.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/alert/alert.tsx',
    hasOracleStory: true,
    targetStoryId: 'components-molecules-alert--default',
    oracleStoryId: 'components-feedback-alert--default',
  },
  extreme: {
    rung: 'extreme', component: 'Calendar',
    targetTsx: 'target/src/components/organisms/Calendar/Calendar.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/calendar/calendar.tsx',
    hasOracleStory: true,
    targetStoryId: 'components-organisms-calendar--default',
    oracleStoryId: 'components-date-time-calendar--default',
  },
  template: {
    rung: 'template', component: 'Dashboard',
    targetTsx: 'target/src/components/templates/Dashboard/Dashboard.tsx',
    // Composition demo — no 1:1 component oracle; closest HeroUI demo is the
    // subtle-cards dashboard layout. Scored structurally + by quality judge, not
    // pixel-diffed to a single component story.
    oracleTsx: 'ref-heroui/packages/storybook/.storybook/stories/demos/subtle-cards-demo.tsx',
    hasOracleStory: false,
    targetStoryId: 'components-templates-dashboard--default',
    oracleStoryId: null,
  },
};

// runId in results.json differs from rung for molecule (molecule-cold).
export const RUNG_TO_RUNID = {
  atom: 'atom', chip: 'chip', molecule: 'molecule-cold', switch: 'switch',
  organism: 'organism', tabs: 'tabs', 'all-icons': 'all-icons',
  extreme: 'extreme', template: 'template',
};

export const scoredRungs = () => Object.values(RUNG_MAP);
