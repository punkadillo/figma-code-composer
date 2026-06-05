// oracle/rung-map.mjs
// Maps each fidelity-scored rung to its target/oracle source files and the
// canonical Storybook story id on each side. Paths are relative to the trial
// root (workbench/trials/heroui-20260603). icon-only and page are out of scope.
export const RUNG_MAP = {
  atom: {
    rung: 'atom', component: 'Button',
    targetTsx: 'target/src/components/atoms/Button/Button.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/button/button.tsx',
    hasOracleStory: true,
    targetStoryId: 'components-atoms-button--default',
    oracleStoryId: 'components-buttons-button--default',
  },
  molecule: {
    rung: 'molecule', component: 'Input',
    targetTsx: 'target/src/components/atoms/Input/Input.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/input/input.tsx',
    hasOracleStory: true,
    targetStoryId: 'components-atoms-input--default',
    oracleStoryId: 'components-forms-input--default',
  },
  organism: {
    rung: 'organism', component: 'Card',
    targetTsx: 'target/src/components/molecules/Card/Card.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/card/card.tsx',
    hasOracleStory: true,
    targetStoryId: 'components-molecules-card--default',
    oracleStoryId: 'components-layout-card--default',
  },
  template: {
    rung: 'template', component: 'Form',
    targetTsx: 'target/src/components/organisms/Form/Form.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/form/form.tsx',
    hasOracleStory: false,   // HeroUI Form has no story in the storybook
    targetStoryId: 'components-organisms-form--default',
    oracleStoryId: null,
  },
  'all-icons': {
    rung: 'all-icons', component: 'Alert',
    targetTsx: 'target/src/components/molecules/Alert/Alert.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/alert/alert.tsx',
    hasOracleStory: true,
    targetStoryId: 'components-molecules-alert--default',
    oracleStoryId: 'components-feedback-alert--default',
  },
};

// runId in results.json differs from rung for molecule (molecule-cold).
export const RUNG_TO_RUNID = {
  atom: 'atom', molecule: 'molecule-cold', organism: 'organism',
  template: 'template', 'all-icons': 'all-icons',
};

export const scoredRungs = () => Object.values(RUNG_MAP);
