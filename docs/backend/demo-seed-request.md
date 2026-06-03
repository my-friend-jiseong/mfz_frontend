# 발표용 데모 데이터 — 백엔드 작업 불필요 (검증 완료)

> 2026-06-01 · 프론트(발표 준비)
> **결론: 백엔드에 요청할 것이 없다.** 데모 데이터는 프론트가 자가 시드(`docs/presentation/seed_demo_data.mjs`)로 전부 만든다 — S7 보고서의 전·중·후 사진까지.

## 한때 의심했던 gap과 그 해소
field_report 작성 흐름(`reportStore.createWithVisitScaffold`)이 `{ fieldId }` 만 보내 전·중·후 사진 슬롯이 빈 채 시작하는 건 사실이다. 그래서 "사진 연결을 백엔드가 해줘야 하나" 의심했으나 — **probe 로 직접 확인(2026-06-01)**:

- `POST /api/reports/:id/field-reports` 에 `beforePhotoUrl/pendingPhotoUrl/afterPhotoUrl`(+`*Caption`)을 실어 보내면 **그대로 저장**되고, `GET /api/reports/:id` 의 `fieldReports[]` 로 **그대로 회수**된다. 외부 URL(`example.com/...`)도 저장됨.
- 즉 사진 연결은 **프론트가 URL 만 채워 보내면 끝**. 백엔드 변경·§9 prefill 머지 불요.

## 남는 일 (백엔드 아님)
- 시드 스크립트가 placeholder 이미지 URL 을 넣어둠. **실제 점검 사진**으로 바꾸려면 URL 교체 또는 `fields.addPhoto` 업로드 후 `fileUrl` 사용 — 프론트/사용자 몫.
