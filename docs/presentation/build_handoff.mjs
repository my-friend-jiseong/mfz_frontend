// 클로드 데스크탑 핸드오프 패키지 빌드 — handoff/ 는 항상 이 스크립트로 재생성하는 스냅샷.
// 원본: MVP_INFORMATION.md(여기) · IAD/ERD(docs/diagram) · screenshots/(여기, 캡처 스크립트 출력).
//
//   실행: node docs/presentation/build_handoff.mjs
//   결과: docs/presentation/handoff/ (gitignore — 로컬 전용, 전달 직전 재생성)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'handoff');
const DIAGRAM = path.join(HERE, '..', 'diagram');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true });

const files = [
  [path.join(HERE, 'MVP_INFORMATION.md'), 'MVP_INFORMATION.md'],
  [path.join(DIAGRAM, 'IAD.drawio'), 'IAD.drawio'],
  [path.join(DIAGRAM, 'ERD.drawio'), 'ERD.drawio'],
];
for (const [src, name] of files) fs.copyFileSync(src, path.join(OUT, name));

const shots = fs.readdirSync(path.join(HERE, 'screenshots')).filter((f) => f.endsWith('.png'));
for (const f of shots) fs.copyFileSync(path.join(HERE, 'screenshots', f), path.join(OUT, 'screenshots', f));

console.log(`handoff/ 재생성 완료 — 문서 ${files.length} + 스크린샷 ${shots.length}장`);
