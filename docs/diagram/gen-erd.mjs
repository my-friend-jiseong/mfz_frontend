// ERD 재생성기 — 백엔드 저장소 scripts/gen-erd.mjs 의 프론트 사본(백로그 §12-B).
// `node docs/diagram/gen-erd.mjs` → docs/diagram/ERD.drawio 재생성 + 자가검증.
//
// 진실 출처는 백엔드 prisma/schema.prisma, 그 dump 가 백엔드 docs/db-schema.md 다.
// 손으로 mxCell 을 찍으면 좌표·높이·앵커 실수가 반드시 나므로 항상 이 스크립트로 재생성한다.
// 테이블 높이는 필드 수로 자동 계산(§2.3). 좌표/앵커/waypoint 는 충돌검사 통과한 확정값.
// 스키마 변경 시: tables/edges 배열 수정 → 실행 → "✅ 겹침 0 ..." 통과 확인.
import { writeFileSync } from "node:fs";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// 여러 줄 텍스트 셀용 — esc() 가 & 를 먼저 escape 하므로 `&#xa;` 를 문자열에 직접 쓰면
// `&amp;#xa;` 가 되어 줄바꿈이 죽는다(실측: 노트가 한 줄로 이어붙음).
// 각 줄을 따로 escape 한 뒤 html=1 셀이 해석하는 <br> 로 잇는다.
// join 은 &lt;br&gt; — 속성값 안이라 `<br>` 를 날것으로 넣으면 XML 이 깨진다(실측).
// XML 파서가 &lt;br&gt; → <br> 로 되돌리고, html=1 셀이 그걸 줄바꿈으로 렌더한다.
const escLines = (lines) => lines.map(esc).join("&lt;br&gt;");

const TABLE_STYLE =
  "shape=table;startSize=30;container=1;collapsible=1;childLayout=tableLayout;fixedRows=1;rowLines=1;fontStyle=1;align=center;resizeLast=1;html=1;rounded=1;arcSize=14;absoluteArcSize=1;fillColor=light-dark(#FFCC99,#663300);horizontal=1;swimlaneFillColor=default;fontSize=12;";
const ROW_STYLE =
  "shape=tableRow;horizontal=0;startSize=0;fillColor=none;collapsible=0;dropTarget=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;fontSize=12;fontStyle=1;";
const cellStyle = (align, extra = "") =>
  `shape=partialRectangle;connectable=0;fillColor=none;overflow=hidden;whiteSpace=wrap;html=1;align=${align};${extra}fontSize=12;`;

// col widths: 한글명100 / 변수명160 / 타입90 / 제약50  (총 400)
const COLS = [
  { x: 0, w: 100, align: "center" },
  { x: 100, w: 160, align: "left", extra: "spacingLeft=6;" },
  { x: 260, w: 90, align: "center" },
  { x: 350, w: 50, align: "center" },
];

// 테이블: id, 헤더, x, y, fields[[한글, 변수, 타입, 제약]]
const tables = [
  { id: "t_user", head: "users (사용자)", x: 720, y: 40, fields: [
    ["사용자ID", "id", "VARCHAR(64)", "PK"],
    ["이메일", "email", "VARCHAR(255)", "UQ, NN"],
    ["이름", "name", "VARCHAR(100)", "NN"],
    ["비밀번호해시", "password_hash", "VARCHAR(255)", "NN"],
    ["역할", "role", "VARCHAR(32)", "NN"],
    ["생성일시", "created_at", "TIMESTAMPTZ", "NN"],
    ["수정일시", "updated_at", "TIMESTAMPTZ", "NN"],
    ["삭제일시", "deleted_at", "TIMESTAMPTZ", ""],
  ]},
  { id: "t_loc", head: "locations (위치)", x: 2080, y: 40, fields: [
    ["위치ID", "id", "VARCHAR(64)", "PK"],
    ["위도", "latitude", "DECIMAL(10,7)", ""],
    ["경도", "longitude", "DECIMAL(10,7)", ""],
    ["시도", "sido", "VARCHAR(100)", ""],
    ["시군구", "sigungu", "VARCHAR(100)", ""],
    ["도로명주소", "road_address", "VARCHAR(500)", ""],
    ["상세주소", "detail_address", "VARCHAR(255)", ""],
    ["생성일시", "created_at", "TIMESTAMPTZ", "NN"],
    ["수정일시", "updated_at", "TIMESTAMPTZ", "NN"],
  ]},
  { id: "t_trip", head: "trips (외근)", x: 40, y: 560, fields: [
    ["외근ID", "id", "VARCHAR(64)", "PK"],
    ["사용자ID", "user_id", "VARCHAR(64)", "FK, NN"],
    ["제목", "title", "VARCHAR(50)", ""],
    ["상태", "status", "VARCHAR(32)", "NN"],
    ["시작일시", "started_at", "TIMESTAMPTZ", "NN"],
    ["종료일시", "ended_at", "TIMESTAMPTZ", ""],
    ["생성일시", "created_at", "TIMESTAMPTZ", "NN"],
    ["수정일시", "updated_at", "TIMESTAMPTZ", "NN"],
    ["삭제일시", "deleted_at", "TIMESTAMPTZ", ""],
  ]},
  { id: "t_cat", head: "categories (분류 마스터)", x: 1400, y: 560, fields: [
    ["분류ID", "id", "VARCHAR(64)", "PK"],
    ["사용자ID", "user_id", "VARCHAR(64)", "FK, NN"],
    ["분류명", "name", "VARCHAR(64)", "NN"],
    ["생성일시", "created_at", "TIMESTAMPTZ", "NN"],
    ["수정일시", "updated_at", "TIMESTAMPTZ", "NN"],
  ]},
  { id: "t_proj", head: "projects (프로젝트)", x: 720, y: 560, fields: [
    ["프로젝트ID", "id", "VARCHAR(64)", "PK"],
    ["사용자ID", "user_id", "VARCHAR(64)", "FK, NN"],
    ["프로젝트명", "name", "VARCHAR(255)", "NN"],
    ["상태", "status", "VARCHAR(32)", "NN"],
    ["생성일시", "created_at", "TIMESTAMPTZ", "NN"],
    ["수정일시", "updated_at", "TIMESTAMPTZ", "NN"],
  ]},
  { id: "t_field", head: "fields (현장)", x: 1400, y: 1050, fields: [
    ["현장ID", "id", "VARCHAR(64)", "PK"],
    ["사용자ID", "user_id", "VARCHAR(64)", "FK, NN"],
    ["프로젝트ID", "project_id", "VARCHAR(64)", "FK"],
    ["위치ID", "location_id", "VARCHAR(64)", "FK, UQ, NN"],
    ["현장명", "name", "VARCHAR(255)", "NN"],
    ["상태", "status", "VARCHAR(32)", "NN"],
    ["생성일시", "created_at", "TIMESTAMPTZ", "NN"],
    ["수정일시", "updated_at", "TIMESTAMPTZ", "NN"],
    ["삭제일시", "deleted_at", "TIMESTAMPTZ", ""],
  ]},
  { id: "t_report", head: "reports (보고서)", x: 2760, y: 1050, fields: [
    ["보고서ID", "id", "BIGSERIAL", "PK"],
    ["외근ID", "trip_id", "VARCHAR(64)", "FK"],
    ["제목", "title", "VARCHAR(255)", ""],
    ["산출물URL", "output_file_url", "VARCHAR(500)", ""],
    ["위치도URL", "overview_map_url", "VARCHAR(500)", ""],
    ["생성자ID", "created_by", "VARCHAR(64)", "FK"],
    ["생성일시", "created_at", "TIMESTAMPTZ", "NN"],
    ["수정일시", "updated_at", "TIMESTAMPTZ", "NN"],
  ]},
  { id: "t_fcat", head: "field_categories (현장 카테고리)", x: 40, y: 1570, fields: [
    ["현장ID", "field_id", "VARCHAR(64)", "PK, FK"],
    ["카테고리", "category", "VARCHAR(64)", "PK"],
    ["생성일시", "created_at", "TIMESTAMPTZ", "NN"],
  ]},
  { id: "t_fphoto", head: "field_photos (현장 사진)", x: 720, y: 1570, fields: [
    ["사진ID", "id", "VARCHAR(64)", "PK"],
    ["현장ID", "field_id", "VARCHAR(64)", "FK, NN"],
    ["파일명", "file_name", "VARCHAR(255)", ""],
    ["MIME타입", "mime_type", "VARCHAR(100)", ""],
    ["파일URL", "file_url", "VARCHAR(500)", ""],
    ["파일크기", "file_size", "INTEGER", ""],
    ["생성일시", "created_at", "TIMESTAMPTZ", "NN"],
  ]},
  { id: "t_memo", head: "memos (메모)", x: 1400, y: 1570, fields: [
    ["메모ID", "id", "VARCHAR(64)", "PK"],
    ["현장ID", "field_id", "VARCHAR(64)", "FK, NN"],
    ["내용", "content", "TEXT", "NN"],
    ["생성자ID", "created_by", "VARCHAR(64)", "FK, NN"],
    ["생성일시", "created_at", "TIMESTAMPTZ", "NN"],
  ]},
  { id: "t_visit", head: "visits (방문)", x: 2080, y: 1570, fields: [
    ["방문ID", "id", "VARCHAR(64)", "PK"],
    ["외근ID", "trip_id", "VARCHAR(64)", "FK, NN"],
    ["현장ID", "field_id", "VARCHAR(64)", "FK, NN"],
    ["방문일시", "visited_at", "TIMESTAMPTZ", "NN"],
    ["상태", "status", "VARCHAR(32)", "NN"],
    ["상태사유", "status_reason", "VARCHAR(255)", ""],
    ["생성일시", "created_at", "TIMESTAMPTZ", "NN"],
    ["수정일시", "updated_at", "TIMESTAMPTZ", "NN"],
  ]},
  { id: "t_freport", head: "field_reports (현장 보고)", x: 2760, y: 1570, fields: [
    ["현장보고ID", "id", "BIGSERIAL", "PK"],
    ["보고서ID", "report_id", "BIGINT", "FK, NN"],
    ["현장ID", "field_id", "VARCHAR(64)", "FK, NN"],
    ["제목", "title", "VARCHAR(255)", ""],
    ["작업전사진URL", "before_photo_url", "VARCHAR(500)", ""],
    ["작업전캡션", "before_photo_caption", "VARCHAR(255)", ""],
    ["보류사진URL", "pending_photo_url", "VARCHAR(500)", ""],
    ["보류캡션", "pending_photo_caption", "VARCHAR(255)", ""],
    ["작업후사진URL", "after_photo_url", "VARCHAR(500)", ""],
    ["작업후캡션", "after_photo_caption", "VARCHAR(255)", ""],
    ["생성일시", "created_at", "TIMESTAMPTZ", "NN"],
    ["수정일시", "updated_at", "TIMESTAMPTZ", "NN"],
  ]},
  { id: "t_tdest", head: "trip_destinations (계획 목적지)", x: 680, y: 1050, fields: [
    ["목적지ID", "id", "VARCHAR(64)", "PK"],
    ["외근ID", "trip_id", "VARCHAR(64)", "FK, NN"],
    ["현장ID", "field_id", "VARCHAR(64)", "FK, NN"],
    ["방문순서", "sort_order", "INTEGER", "NN"],
    ["상태", "status", "VARCHAR(32)", "NN"],
    ["생성일시", "created_at", "TIMESTAMPTZ", "NN"],
    ["수정일시", "updated_at", "TIMESTAMPTZ", "NN"],
  ]},
  { id: "t_vphoto", head: "visit_photos (방문 사진)", x: 2080, y: 2050, fields: [
    ["사진ID", "id", "VARCHAR(64)", "PK"],
    ["방문ID", "visit_id", "VARCHAR(64)", "FK, NN"],
    ["파일명", "file_name", "VARCHAR(255)", ""],
    ["MIME타입", "mime_type", "VARCHAR(100)", ""],
    ["파일URL", "file_url", "VARCHAR(500)", ""],
    ["파일크기", "file_size", "INTEGER", ""],
    ["조치단계", "phase", "VARCHAR(16)", ""],
    ["생성일시", "created_at", "TIMESTAMPTZ", "NN"],
  ]},
];

// 관계: src(부모)→tgt(자식), start/end 화살표, exit/entry 분수, waypoints
// (§4.3 앵커는 테이블별로 전부 distinct 하게 손계산)
const edges = [
  { id: "e1", s: "t_user", t: "t_proj", st: "ERone", en: "ERzeroToMany", ex: [0.4, 1], ey: [0.4, 0], wp: [] },
  { id: "e2", s: "t_user", t: "t_trip", st: "ERone", en: "ERzeroToMany", ex: [0.2, 1], ey: [0.5, 0], wp: [[800, 450], [240, 450]] },
  { id: "e3", s: "t_user", t: "t_field", st: "ERone", en: "ERzeroToMany", ex: [0.65, 1], ey: [0.4, 0], wp: [[980, 470], [1300, 470], [1300, 960], [1560, 960]] },
  { id: "e4", s: "t_user", t: "t_report", st: "ERzeroToOne", en: "ERzeroToMany", ex: [0.8, 1], ey: [0.5, 0], wp: [[1040, 430], [2960, 430]] },
  { id: "e5", s: "t_user", t: "t_memo", st: "ERone", en: "ERzeroToMany", ex: [0.5, 1], ey: [0.6, 0], wp: [[920, 490], [1220, 490], [1220, 1470], [1640, 1470]] },
  { id: "e6", s: "t_proj", t: "t_field", st: "ERzeroToOne", en: "ERzeroToMany", ex: [0.6, 1], ey: [0.2, 0], wp: [[960, 920], [1480, 920]] },
  { id: "e7", s: "t_loc", t: "t_field", st: "ERone", en: "ERone", ex: [0.3, 1], ey: [0.75, 0], wp: [[2200, 460], [1980, 460], [1980, 960], [1700, 960]] },
  { id: "e8", s: "t_field", t: "t_fcat", st: "ERone", en: "ERzeroToMany", ex: [0.15, 1], ey: [0.75, 0], wp: [[1460, 1380], [340, 1380]] },
  { id: "e9", s: "t_field", t: "t_memo", st: "ERone", en: "ERzeroToMany", ex: [0.5, 1], ey: [0.4, 0], wp: [[1600, 1440], [1560, 1440]] },
  { id: "e10", s: "t_field", t: "t_fphoto", st: "ERone", en: "ERzeroToMany", ex: [0.35, 1], ey: [0.5, 0], wp: [[1540, 1410], [920, 1410]] },
  { id: "e11", s: "t_field", t: "t_visit", st: "ERone", en: "ERzeroToMany", ex: [0.7, 1], ey: [0.5, 0], wp: [[1680, 1380], [2280, 1380]] },
  { id: "e12", s: "t_field", t: "t_freport", st: "ERone", en: "ERzeroToMany", ex: [0.85, 1], ey: [0.125, 0], wp: [[1740, 1410], [2810, 1410]] },
  { id: "e13", s: "t_trip", t: "t_visit", st: "ERone", en: "ERzeroToMany", ex: [0.5, 1], ey: [0, 0.5], wp: [[240, 1500], [2020, 1500], [2020, 1690]] },
  { id: "e14", s: "t_trip", t: "t_report", st: "ERzeroToOne", en: "ERzeroToMany", ex: [0.9, 1], ey: [0, 0.5], wp: [[400, 900], [2700, 900], [2700, 1170]] },
  { id: "e15", s: "t_report", t: "t_freport", st: "ERone", en: "ERzeroToMany", ex: [0.5, 1], ey: [0.5, 0], wp: [] },
  // §25 categories · §11 trip_destinations · §9 visit_photos
  { id: "e16", s: "t_user", t: "t_cat", st: "ERone", en: "ERzeroToMany", ex: [0.3, 1], ey: [0.5, 0], wp: [[840, 510], [1600, 510]] },
  { id: "e17", s: "t_trip", t: "t_tdest", st: "ERone", en: "ERzeroToMany", ex: [0.2, 1], ey: [0.3, 0], wp: [[120, 960], [800, 960]] },
  { id: "e18", s: "t_field", t: "t_tdest", st: "ERone", en: "ERzeroToMany", ex: [0, 0.5], ey: [1, 0.5], wp: [[1240, 1200], [1240, 1170]] },
  { id: "e19", s: "t_visit", t: "t_vphoto", st: "ERone", en: "ERzeroToMany", ex: [0.5, 1], ey: [0.5, 0], wp: [] },
];

const out = [];
out.push('<mxfile host="prisma-erd-gen">');
out.push('  <diagram name="ERD" id="prisma-erd">');
out.push('    <mxGraphModel dx="0" dy="0" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">');
out.push("      <root>");
out.push('        <mxCell id="0"/>');
out.push('        <mxCell id="1" parent="0"/>');

// --- depth 구분선(가로 점선) ---
const dividers = [
  [410, "Depth 0 · users / locations (root)"],
  [1000, "Depth 1 · trips / projects / categories"],
  [1540, "Depth 2 · fields(hub) / reports / trip_destinations → Depth 3 · 그 외"],
  [1990, "Depth 4 · visit_photos"],
];
let dn = 0;
for (const [y, label] of dividers) {
  out.push(`        <mxCell id="div${dn}" value="${esc(label)}" style="endArrow=none;dashed=1;html=1;rounded=0;strokeColor=#999999;strokeWidth=1;fontSize=12;fontColor=#999999;align=left;verticalAlign=bottom;" parent="1" edge="1"><mxGeometry relative="1" as="geometry"><mxPoint x="0" y="${y}" as="sourcePoint"/><mxPoint x="3200" y="${y}" as="targetPoint"/></mxGeometry></mxCell>`);
  dn++;
}

// --- 테이블 ---
for (const tb of tables) {
  const h = 30 + 30 * tb.fields.length;
  out.push(`        <mxCell id="${tb.id}" value="${esc(tb.head)}" style="${TABLE_STYLE}" parent="1" vertex="1"><mxGeometry x="${tb.x}" y="${tb.y}" width="400" height="${h}" as="geometry"/></mxCell>`);
  tb.fields.forEach((f, i) => {
    const rid = `${tb.id}_r${i}`;
    out.push(`        <mxCell id="${rid}" value="" style="${ROW_STYLE}" parent="${tb.id}" vertex="1"><mxGeometry y="${30 + 30 * i}" width="400" height="30" as="geometry"/></mxCell>`);
    f.forEach((val, c) => {
      const col = COLS[c];
      const st = cellStyle(col.align, col.extra || "");
      out.push(`        <mxCell id="${rid}_c${c}" value="${esc(val)}" style="${st}" parent="${rid}" vertex="1"><mxGeometry x="${col.x}" width="${col.w}" height="30" as="geometry"><mxRectangle width="${col.w}" height="30" as="alternateBounds"/></mxGeometry></mxCell>`);
    });
  });
}

// --- 관계 엣지 ---
for (const e of edges) {
  const loop = e.st === "ERone" && e.en === "ERone" ? "orthogonalLoop=1;jettySize=auto;" : "jettySize=20;";
  const style =
    `edgeStyle=orthogonalEdgeStyle;rounded=0;${loop}html=1;fontSize=12;` +
    `endArrow=${e.en};endFill=0;startArrow=${e.st};startFill=0;` +
    `exitX=${e.ex[0]};exitY=${e.ex[1]};exitDx=0;exitDy=0;entryX=${e.ey[0]};entryY=${e.ey[1]};entryDx=0;entryDy=0;`;
  let geo = '<mxGeometry relative="1" as="geometry">';
  if (e.wp.length) {
    geo += '<Array as="points">';
    for (const [x, y] of e.wp) geo += `<mxPoint x="${x}" y="${y}"/>`;
    geo += "</Array>";
  }
  geo += "</mxGeometry>";
  out.push(`        <mxCell id="${e.id}" style="${style}" parent="1" source="${e.s}" target="${e.t}" edge="1">${geo}</mxCell>`);
}

// --- 범례 (좌하단) ---
const ly = 2160;
out.push(`        <mxCell id="lg_title" value="${esc("■ 관계 표기 (Crow's Foot) — 화살표 머리가 자식(N) 쪽")}" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontSize=14;fontStyle=1;" parent="1" vertex="1"><mxGeometry x="40" y="${ly - 40}" width="600" height="30" as="geometry"/></mxCell>`);
const markers = [
  ["ERone", "정확히 1 (¦)"],
  ["ERzeroToOne", "0 또는 1 (○¦)"],
  ["ERzeroToMany", "0 이상 / 다수 (○<)"],
  ["ERoneToMany", "1 이상 (¦<)"],
];
markers.forEach((m, i) => {
  const y = ly + i * 50;
  out.push(`        <mxCell id="lg_a${i}" value="A" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontSize=12;" parent="1" vertex="1"><mxGeometry x="40" y="${y}" width="40" height="30" as="geometry"/></mxCell>`);
  out.push(`        <mxCell id="lg_b${i}" value="B" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontSize=12;" parent="1" vertex="1"><mxGeometry x="160" y="${y}" width="40" height="30" as="geometry"/></mxCell>`);
  out.push(`        <mxCell id="lg_e${i}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=${m[0]};endFill=0;startArrow=ERone;startFill=0;exitX=1;exitY=0.5;entryX=0;entryY=0.5;" parent="1" source="lg_a${i}" target="lg_b${i}" edge="1"><mxGeometry relative="1" as="geometry"/></mxCell>`);
  out.push(`        <mxCell id="lg_d${i}" value="${esc(m[0] + " — " + m[1])}" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontSize=12;" parent="1" vertex="1"><mxGeometry x="220" y="${y}" width="360" height="30" as="geometry"/></mxCell>`);
});
// 엔티티 예제 테이블
const ex = { id: "lg_ex", head: "entity_example (엔티티 예제)", x: 700, y: ly, fields: [
  ["예시ID", "id", "VARCHAR(64)", "PK"],
  ["생성일시", "created_at", "TIMESTAMPTZ", "NN"],
]};
{
  const h = 30 + 30 * ex.fields.length;
  out.push(`        <mxCell id="${ex.id}" value="${esc(ex.head)}" style="${TABLE_STYLE}" parent="1" vertex="1"><mxGeometry x="${ex.x}" y="${ex.y}" width="400" height="${h}" as="geometry"/></mxCell>`);
  ex.fields.forEach((f, i) => {
    const rid = `${ex.id}_r${i}`;
    out.push(`        <mxCell id="${rid}" value="" style="${ROW_STYLE}" parent="${ex.id}" vertex="1"><mxGeometry y="${30 + 30 * i}" width="400" height="30" as="geometry"/></mxCell>`);
    f.forEach((val, c) => {
      const col = COLS[c];
      out.push(`        <mxCell id="${rid}_c${c}" value="${esc(val)}" style="${cellStyle(col.align, col.extra || "")}" parent="${rid}" vertex="1"><mxGeometry x="${col.x}" width="${col.w}" height="30" as="geometry"><mxRectangle width="${col.w}" height="30" as="alternateBounds"/></mxGeometry></mxCell>`);
    });
  });
}
// 복합 제약 · 파생값 — 컬럼 제약 칸에 안 담기는 정보 (백엔드 docs/db-schema.md 기준)
out.push(`        <mxCell id="lg_multi" value="${escLines([
  "복합 UNIQUE",
  "· categories (user_id, name)",
  "· trip_destinations (trip_id, field_id)",
  "",
  "API 파생값 — 컬럼 아님",
  "· visitCount = COUNT(visits)",
  "· siteCount = visits 의 DISTINCT field_id",
  "· phaseProgress = visit_photos.phase 파생",
])}" style="text;html=1;strokeColor=#666666;fillColor=none;align=left;verticalAlign=top;fontSize=12;spacing=6;" parent="1" vertex="1"><mxGeometry x="1600" y="${ly}" width="420" height="200" as="geometry"/></mxCell>`);

// 제약 표기 설명
out.push(`        <mxCell id="lg_con" value="${escLines([
  "제약 표기",
  "PK: Primary Key",
  "FK: Foreign Key",
  "UQ: Unique",
  "NN: Not Null",
  "(빈칸 = NULL 허용)",
])}" style="text;html=1;strokeColor=#666666;fillColor=none;align=left;verticalAlign=top;fontSize=12;spacing=6;" parent="1" vertex="1"><mxGeometry x="1200" y="${ly}" width="320" height="120" as="geometry"/></mxCell>`);

out.push("      </root>");
out.push("    </mxGraphModel>");
out.push("  </diagram>");
out.push("</mxfile>");

writeFileSync("docs/diagram/ERD.drawio", out.join("\n"), "utf8");
console.log("ERD.drawio written:", tables.length, "tables,", edges.length, "edges");

// ===== 자가 검증 (§2.4 겹침 / §4.3 앵커 중복) =====
let fail = 0;
const boxes = tables.map((t) => ({ id: t.id, x: t.x, y: t.y, w: 400, h: 30 + 30 * t.fields.length }));
const H = 240, V = 160; // 최소 gutter
for (let i = 0; i < boxes.length; i++)
  for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const ok =
      a.x + a.w + H <= b.x || b.x + b.w + H <= a.x ||
      a.y + a.h + V <= b.y || b.y + b.h + V <= a.y;
    // 순수 겹침(gutter=0) 여부도 확인
    const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    if (overlap) { console.error(`OVERLAP(hard): ${a.id} ∩ ${b.id}`); fail++; }
    else if (!ok) console.warn(`tight(<gutter): ${a.id} ~ ${b.id}`);
  }

// 앵커 중복: 테이블별 (side,fraction)
const side = (x, y) => (y === 1 ? `B${x}` : y === 0 ? `T${x}` : x === 1 ? `R${y}` : `L${y}`);
const anchors = {};
for (const e of edges) {
  (anchors[e.s] ??= []).push(["exit", side(e.ex[0], e.ex[1])]);
  (anchors[e.t] ??= []).push(["entry", side(e.ey[0], e.ey[1])]);
}
for (const [tid, list] of Object.entries(anchors)) {
  const keys = list.map(([, k]) => k);
  const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dup.length) { console.error(`ANCHOR DUP: ${tid} -> ${[...new Set(dup)].join(",")}`); fail++; }
}
// 엣지 몸통이 (양 끝이 아닌) 테이블을 관통하는지 — 폴리라인 샘플링
const box = (id) => boxes.find((b) => b.id === id);
const pad = 6; // 경계 접촉은 허용, 내부 관통만 검출
for (const e of edges) {
  const s = box(e.s), t = box(e.t);
  const p0 = [s.x + e.ex[0] * s.w, s.y + e.ex[1] * s.h];
  const p1 = [t.x + e.ey[0] * t.w, t.y + e.ey[1] * t.h];
  const pts = [p0, ...e.wp, p1];
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
    const steps = Math.max(1, Math.round((Math.abs(bx - ax) + Math.abs(by - ay)) / 8));
    for (let n = 0; n <= steps; n++) {
      const x = ax + ((bx - ax) * n) / steps, y = ay + ((by - ay) * n) / steps;
      for (const b of boxes) {
        if (b.id === e.s || b.id === e.t) continue;
        if (x > b.x + pad && x < b.x + b.w - pad && y > b.y + pad && y < b.y + b.h - pad) {
          console.error(`EDGE THRU TABLE: ${e.id} crosses ${b.id} at (${Math.round(x)},${Math.round(y)})`);
          fail++; n = steps + 1; break;
        }
      }
    }
  }
}
// 엣지끼리 collinear 포개짐(같은 x 수직 / 같은 y 수평 세그먼트가 범위 중첩) 검출.
// 교차(점 1개)는 허용, 선분이 겹쳐 포개지는 것만 실패.
const segOf = (e) => {
  const s = box(e.s), t = box(e.t);
  const pts = [[s.x + e.ex[0] * s.w, s.y + e.ex[1] * s.h], ...e.wp, [t.x + e.ey[0] * t.w, t.y + e.ey[1] * t.h]];
  const segs = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
    if (ax === bx) segs.push({ d: "V", c: ax, lo: Math.min(ay, by), hi: Math.max(ay, by) });
    else if (ay === by) segs.push({ d: "H", c: ay, lo: Math.min(ax, bx), hi: Math.max(ax, bx) });
    // 대각(미세 단차)은 무시
  }
  return segs;
};
const all = edges.map((e) => ({ id: e.id, segs: segOf(e) }));
for (let i = 0; i < all.length; i++)
  for (let j = i + 1; j < all.length; j++)
    for (const A of all[i].segs)
      for (const B of all[j].segs)
        if (A.d === B.d && A.c === B.c) {
          const lo = Math.max(A.lo, B.lo), hi = Math.min(A.hi, B.hi);
          if (hi - lo > 0) { console.error(`COLLINEAR: ${all[i].id} ∩ ${all[j].id} ${A.d}@${A.c} [${lo},${hi}]`); fail++; }
        }
console.log(fail ? `❌ 검증 실패: ${fail}` : "✅ 겹침 0 · 앵커 중복 0 · 엣지 관통 0 · 포개짐 0");
