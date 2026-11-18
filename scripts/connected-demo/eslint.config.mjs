// Explicit touched-file lint entrypoint; edge contracts retain their existing any boundaries.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
export default tseslint.config({ignores:[]},{files:['**/*.ts','**/*.tsx','**/*.mjs'],extends:[js.configs.recommended,...tseslint.configs.recommended],languageOptions:{globals:{...globals.browser,...globals.node,Deno:'readonly'}},plugins:{'react-hooks':reactHooks},rules:{...reactHooks.configs.recommended.rules,'@typescript-eslint/no-explicit-any':'off','@typescript-eslint/no-unused-vars':['warn',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}]}});
