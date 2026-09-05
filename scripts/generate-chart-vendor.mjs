#!/usr/bin/env node
// node_modules/chart.js의 UMD 번들을 src/chart-vendor.ts에 문자열로 박아 넣는다.
// 대시보드가 cdnjs 같은 외부 CDN 없이 같은 origin에서 Chart.js를 직접 서빙하기 위함이다
// (광고 차단기/콘텐츠 차단 기능이 CDN 요청을 막아 차트가 안 뜨는 문제를 원천적으로 없앤다).
// chart.js 패키지 버전을 올릴 때마다 다시 실행해서 커밋한다: node scripts/generate-chart-vendor.mjs
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = await readFile(path.join(rootDir, "node_modules/chart.js/dist/chart.umd.js"), "utf8");

const output = `// 자동 생성 파일. 직접 고치지 말고 scripts/generate-chart-vendor.mjs를 다시 실행한다.
// node_modules/chart.js/dist/chart.umd.js를 그대로 담고 있다.
export const CHART_JS_SOURCE = ${JSON.stringify(source)};
`;

await writeFile(path.join(rootDir, "src/chart-vendor.ts"), output);
console.log(`Wrote src/chart-vendor.ts (${(output.length / 1024).toFixed(1)} KB)`);
