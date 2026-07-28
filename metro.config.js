// Metro 설정 — Expo 기본값 + 병렬 워크트리 사본 제외
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// 병렬 작업 시 `.claude/worktrees/{slug}/` 에 프로젝트 전체 사본이 생긴다(.claude/skills/parallel-worktree).
// 메인 체크아웃에서 띄운 Metro 가 프로젝트 루트를 크롤링하며 그 사본까지 빨아들이면
// haste 모듈 이름 충돌·불필요한 파일 감시로 리로드가 느려지므로 해석·감시 대상에서 뺀다.
const defaultBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(defaultBlockList) ? defaultBlockList : defaultBlockList ? [defaultBlockList] : []),
  /[\\/]\.claude[\\/]worktrees[\\/].*/,
];

module.exports = config;
