// 카카오 지도/검색 SDK 는 요청 도메인(Referer)을 카카오 디벨로퍼스의 등록 웹 플랫폼과 대조한다.
// 네이티브 WebView 가 source={{ html }} 로 인라인 로드하면 origin 이 about:blank 라 Referer 가 비어
// SDK 가 거부된다(지도 백지). source 에 등록 도메인을 baseUrl 로 지정해 그 origin 으로 통과시킨다.
// 값은 카카오 디벨로퍼스에 등록된 웹 도메인과 정확히 일치해야 한다.
export const KAKAO_WEBVIEW_BASE_URL = 'https://app.ilgayo.co.kr';
