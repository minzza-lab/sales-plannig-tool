# 영업기획 도구

## 나이스페이 부가세 정산 STEP 3

`/tools/nicepay-vat-settlement`에서 나이스페이 상세 거래일 파일을 업로드해 상품 분류, PKG별 수수료 집계, 이용업장 배분, 검증, Excel 다운로드를 수행합니다. 원본 거래 파일은 브라우저 안에서만 읽고 수정하거나 데이터베이스에 저장하지 않습니다. 공유 DB에는 상품 분류 기준, PKG 구성표, 이용업장-Excel 열 매핑만 저장합니다.

처음 한 번 Supabase SQL Editor에서 [supabase_nicepay_vat_schema.sql](supabase_nicepay_vat_schema.sql)을 실행한 다음, STEP 3 화면에서 기본 기준을 검토하고 `설정 저장`을 누르세요. 스키마 적용 전에도 현재 브라우저에서는 기본 설정으로 검토·계산할 수 있지만, 브라우저를 바꾸면 설정이 공유되지 않습니다.

### 실행

```bash
npm install
npm run dev
```

자동 계산 검증은 다음 명령으로 실행합니다.

```bash
npm run test:nicepay-vat
```

Excel 결과에는 `원본 데이터`, `분류 결과`, `PKG 집계 및 업장별 배분`, `미분류·오류 목록`, `2607월 부가세` 보고서 시트가 포함됩니다. 보고서 시트는 기준 파일의 3행 데이터 헤더, X/Y/Z 계산 열, AE:BJ 업장별 배분 열, BK 배분 합계, BN 배분 차이를 따릅니다.

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
