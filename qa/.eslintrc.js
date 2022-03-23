module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint/eslint-plugin',
    'mocha',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    "plugin:mocha/recommended",
  ],
  env: {
      mocha: true,
      browser: true,
      node: true,
      commonjs: true,
  },
  rules: {
      '@typescript-eslint/no-var-requires': 0,
  },

}
/* TODO: cherry pick lines from the old conf and merge with above
module.exports = {
    "env": {
        "browser": true,
        "es6": true
    },
    "extends": [
        "eslint:recommended",
        "plugin:@typescript-eslint/eslint-recommended"
    ],
    "globals": {
        "Atomics": "readonly",
        "SharedArrayBuffer": "readonly"
    },
    "parser": "@typescript-eslint/parser",
    "parserOptions": {
        "ecmaVersion": 2018,
        "sourceType": "module"
    },
    "plugins": [
        "@typescript-eslint/eslint-plugin"
    ],
    "rules": {
    }
};
*/
