import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    rules: {
      // 백엔드에서는 로그 출력이 필요할 수 있으므로 허용함
      "no-console": "off",

      // _로 시작하는 매개변수는 의도적으로 사용하지 않는 것으로 간주함
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  {
    ignores: ["node_modules/**", "dist/**", "coverage/**"],
  },

  // Prettier와 충돌하는 ESLint 스타일 규칙을 비활성화함
  eslintConfigPrettier,
);
