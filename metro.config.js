// Metro 설정 — Expo 기본값 + 병렬 워크트리 사본 제외
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// 병렬 작업 시 `.claude/worktrees/{slug}/` 에 프로젝트 전체 사본이 생긴다(.claude/skills/parallel-worktree).
// 메인 체크아웃에서 띄운 Metro 가 프로젝트 루트를 크롤링하며 그 사본까지 빨아들이면
// haste 모듈 이름 충돌·불필요한 파일 감시로 리로드가 느려지므로 해석·감시 대상에서 뺀다.
//
// 단, **워크트리 안에서 Metro 를 띄운 경우엔 이 규칙을 걸면 안 된다.** 그때는 프로젝트 파일
// 전부가 `.claude/worktrees/{slug}/` 아래 있어서 자기 자신이 통째로 차단되고,
// `expo-router/entry` 조차 해석하지 못해 dev 서버가 UnableToResolveError 로 죽는다.
// (`.claude/` 는 gitignore 라 워크트리 체크아웃 안에는 중첩 사본이 애초에 없다 —
//  그래서 이 경우 규칙 자체가 불필요하다.)
const insideWorktree = /[\\/]\.claude[\\/]worktrees[\\/]/.test(__dirname);
if (!insideWorktree) {
  const defaultBlockList = config.resolver.blockList;
  config.resolver.blockList = [
    ...(Array.isArray(defaultBlockList) ? defaultBlockList : defaultBlockList ? [defaultBlockList] : []),
    /[\\/]\.claude[\\/]worktrees[\\/].*/,
  ];
}

module.exports = config;
