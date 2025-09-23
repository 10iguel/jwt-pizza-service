import globals from "globals";
import pluginJs from '@eslint/js';

// import { defineConfig } from "eslint/config";

// export default defineConfig([
//   { files: ["**/*.{js,mjs,cjs}"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: globals.browser } },
// ]);

export default [
    { files: ['**/*.js'], languageOptions: { sourceType: 'commonjs' } },
    { languageOptions: { globals: globals.node } },
    { languageOptions: { globals: globals.jest } },
    pluginJs.configs.recommended,
];