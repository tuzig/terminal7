/* eslint-env node */
const mockAndTestFiles = ["aatp/**/*.ts", "src/__mocks__/**/*.ts"];

module.exports = {
    extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
    parser: "@typescript-eslint/parser",
    parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
    },
    plugins: ["@typescript-eslint"],
    env: {
        browser: true,
    },
    globals: {
        db: "writable",
        terminal7: "writable",
    },
    root: true,
    overrides: [
        {
            files: mockAndTestFiles,
            parserOptions: {
                project: null,
            },
            rules: {
                "@typescript-eslint/no-unnecessary-type-assertion": "off",
                "@typescript-eslint/no-unnecessary-type-arguments": "off",
            },
        },
    ],
    rules: {
        "@typescript-eslint/ts-comment": "off",
        "@typescript-eslint/ban-ts-comment": "off",
        "@typescript-eslint/no-unused-vars": [
            "error",
            {
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
                caughtErrorsIgnorePattern: "^(e|err|_)$",
            },
        ],
        // The following rules are stricter in eslint v8's recommended
        // config than they were in v5. Disable to match old behavior.
        "no-case-declarations": "off",
        "no-useless-escape": "off",
        "no-empty-pattern": "off",
        "no-control-regex": "off",
        "no-async-promise-executor": "off",
        "@typescript-eslint/no-unused-expressions": "off",
        "no-empty": [
            "error",
            {
                allowEmptyCatch: true,
            },
        ],
        "no-constant-condition": [
            "error",
            {
                checkLoops: false,
            },
        ],
    },
};
