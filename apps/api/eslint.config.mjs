import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'src/generated/**'] },
  { ...eslint.configs.recommended, files: ['src/**/*.ts'] },
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: ['src/**/*.ts'] })),
  { files: ['test/**/*.mjs'], languageOptions: { globals: { process: 'readonly' } } },
);
