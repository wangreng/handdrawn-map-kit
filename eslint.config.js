'use strict';
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/', 'out/'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },
  {
    // Vendored from kevintngo/statechart-art; kept close to upstream.
    files: ['engine/**'],
    rules: { 'no-unused-vars': 'off' },
  },
];
