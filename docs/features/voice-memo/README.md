# 음성 메모(받아쓰기) — 체크인 메모를 말로

> **상태**: 착수 (2026-10-27) — 코드·웹 확인, 실기기 확인 남음
> **화면**: 2차 8-1 음성 메모 안내(Figma `694:4210`), 8-2 음성 듣는 중(`694:4324`)
> **백로그**: 2차 요청 K(개인정보처리방침 고지). 서버 API·스키마 변경 없음
> **출시**: 다음 빌드(iOS 6 · Android vc 6)에 함께. 네이티브 모듈이라 OTA 불가

## 무엇을 하나

체크인·방문 수정 화면 메모 칸의 마이크를 누르면 말을 글자로 바꿔 **메모 끝에 붙인다**. 저장 전에 직접 고칠 수 있다.
**녹음 파일은 만들지도 보내지도 않는다** — ERD v2 에서 폐기한 '음성 메모'(파일 업로드, `expo-av`)와 다르다.

## 결정 (2026-10-27, 사용자)

| 항목 | 결정 | 구현 |
|---|---|---|
| 인식 위치 | **온디바이스 우선**, 안 되는 기기는 서버(Apple·Google) 인식 + 처리방침 고지 | iOS: 네이티브가 ko-KR 온디바이스 지원 기기면 켬. Android: 한국어 오프라인 모델(`com.google.android.as`)이 있을 때만, 실패하면 서버로 한 번 다시 시작 |
| 웹 | **켠다.** Safari 불안정은 알고 둠 | Web Speech API 가 있는 브라우저만 마이크 표시(`isRecognitionAvailable`) |
| 출시 | 다음 빌드에 바로 넣고 되는 대로 심사 요청 | — |

## 자율로 정한 것

| 항목 | 정한 내용 | 이유 |
|---|---|---|
| 8-1 [취소] | **두지 않음**. 스크림·끌어내리기로 닫아도 OS 권한 팝업으로 잇는다 | 위치 권한 안내의 [나중에]가 App Store 5.1.1(iv)로 반려됨(`d63d081`). 같은 반려를 피한다 |
| 한 번에 한 마디 | `continuous: false` — 말을 멈추면 OS 가 끝낸다 | 8-1·8-2 문구 '말을 멈추면 자동으로 끝나요'. Android 12 이하는 연속 인식 미지원 |
| 8-2 옅은 글자 | 확정 전 말 전체를 옅게, 확정되면 메모에 붙임 | 인식기가 '안정된 앞부분'을 따로 주지 않는다(Figma 는 앞부분 진하게) |
| 8-2 [취소] | 이번 말 버림. 정지는 들은 말을 넣고 끝 | — |
| 앱이 뒤로 가면 | 끝내기(들은 말은 넣음). 화면을 떠나면 버림 | — |
| 최대 길이 | 붙인 뒤 2000자를 넘는 뒤쪽은 버림 | 메모 칸 `maxLength` 와 같게 |
| Expo Go | 마이크 숨김(네이티브 모듈 없음) | `expo-dev-client` 는 넣지 않았다 — `expo start` 기본이 dev build 로 바뀌어 기존 Expo Go 흐름이 깨진다. 실기기 확인은 preview APK·TestFlight |
| 8-1 문구 '말하지 마세요' | Figma 그대로 | 문구 규칙의 '-하세요 금지'는 부탁 문장 대상. 금지 문장은 '말하지 말아 주세요'가 어색 |

## 코드

- `src/utils/useVoiceInput.ts` — 권한·시작·결과·오류·온디바이스 판단. 네이티브 모듈을 `require` 로 감싸 Expo Go 에서 죽지 않게
- `src/components/checkin/VoiceIntroSheet.tsx` — 8-1
- `src/components/checkin/VoiceListeningPanel.tsx` — 8-2 하단 패널(파형은 네이티브 `volumechange`, 웹은 제자리 움직임)
- `src/components/ui/MemoField.tsx` — `voice.listening` 이면 8-2 메모 칸(테두리 2 brand + 옅은 글자 + 커서)
- `app.json` — `RECORD_AUDIO` 차단 해제, `expo-speech-recognition` 플러그인(iOS 마이크·음성 인식 문구), `expo-image-picker` 의 `microphonePermission: false` 도 문구로 교체(이게 `RECORD_AUDIO` 를 다시 막는다)

## 남은 일

- [x] Android 실기기(아래)
- [ ] 실기기: iOS(온디바이스·서버), Android 오프라인 모델 없는 기기(서버로 넘어가는지), 권한 거절 → 설정 안내
- [ ] 2차 요청 K — 처리방침 반영(백엔드 repo `docs/legal/`)
- [ ] 스토어: iOS 심사 노트(마이크·음성 인식 용도), Play 데이터 보안 양식·권한 선언(`RECORD_AUDIO`)

## 웹 확인 (2026-10-27, 390×844)

8-1·8-2 모양은 Figma 와 맞음([취소] 제외). 실제 마이크 대신 `webkitSpeechRecognition` 을 가짜로 바꿔 흐름을 확인했다:
안내는 처음 한 번 → 듣는 중 옅은 글자 → 정지하면 메모에 붙음 → [취소]는 버림 → 말소리 없음은 스낵바.
같이 고친 것: 웹 메모 칸이 두 줄 넘어도 안 늘고 스크롤바가 생기던 문제(키보드 입력도 같았음) — `onContentSizeChange` 로 높이를 맞춘다.
알려진 한계: 웹에서 글을 지워도 칸이 줄지 않는다(textarea scrollHeight 가 현재 높이 아래로 안 내려감).

## Android 실기기 확인 (2026-10-27, Galaxy Note20 · Android 13)

로컬 디버그 빌드를 `com.mfz.ilgayo.dev` 로 Play 판 옆에 깔아 확인(임시 `app.config.js` 로 패키지만 바꿈, 커밋 안 함).
- 8-1 → [시작하기] → 시스템 마이크 권한 팝업이 곧바로 이어짐
- **온디바이스로 인식**: `installedOnDeviceLanguages = [ko-KR]` → `com.google.android.as`(Soda 오프라인). 서버로 음성이 나가지 않음
- 말을 멈추면 스스로 끝나고(`onEndOfSpeech` → `onResults`) 메모에 붙음. 첫 시도는 권한 팝업 사이 말이 없어 '말소리를 듣지 못했어요'(no-speech)로 끝남 — 의도대로
- [취소]는 메모를 바꾸지 않음. 8-2 패널은 내비게이션 바 바로 위(가리지 않음, 실측 정지 버튼 2081~2261px / 바 2265px~)
- ⚠️ 정확도: '보안등 2기 **점등 불량**이고 **한전에** 신고 필요' → '…**전등 물량** **한전의** 신고 필요'. 온디바이스 모델 한계로 보임. 후보: ①현장 용어 힌트(Android `EXTRA_BIASING_STRINGS`·iOS `contextualStrings`) ②서버 인식과 비교 후 결정
