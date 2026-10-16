import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FieldStatus } from '@/types/entities';
import { Icon, ICON_NAMES } from '@/components/icons';
import { KakaoMapWebView, type KakaoMapMarker, type MapPath } from '@/components/KakaoMapWebView';
import { MapPreviewCard } from '@/components/MapPreviewCard';
import {
  AddToggle,
  AppSheet,
  Button2,
  CheckinPill,
  DestinationFAB,
  EditableTitle,
  FilterChip2,
  MapButton,
  MemoField,
  SearchBar,
  SelectRow,
  StatusMark,
  StatusOptionGroup,
  Tag,
  Text,
  confirm,
  showPopoverMenu,
  snackbar,
  type Button2Variant,
} from '@/components/ui';
import { c2, elevation2, radius2, shadowCss, space, type2, type Type2 } from '@/theme/v2';

// 2차 공통 컴포넌트 갤러리(개발 전용). http://localhost:8081/dev/ui2
// 상태를 띄운 채 찍고 싶으면 쿼리: ?show=snackbar | sheet | menu | confirm | warn
// 지명·좌표는 데모용(부산 사하구) — 화면 코드에 옮기지 말 것.

const VARIANTS: Button2Variant[] = ['primary', 'secondary', 'tonal', 'outline', 'danger', 'ghost'];
const STATUSES: FieldStatus[] = ['pending', 'in_progress', 'done'];

const P = (lat: number, lng: number) => ({ lat, lng });
const DEMO_PINS: KakaoMapMarker[] = [
  { id: 'a', ...P(35.1046, 128.9706), label: '', color: '', pin: 'pending' },
  { id: 'b', ...P(35.1052, 128.9752), label: '', color: '', pin: 'in_progress' },
  { id: 'c', ...P(35.1031, 128.9781), label: '', color: '', pin: 'done' },
  { id: 'd', ...P(35.1012, 128.9733), label: '', color: '', pin: 'new', selected: true },
  { id: 'e', ...P(35.0998, 128.9772), label: '', color: '', pin: 'search' },
  { id: 'f', ...P(35.1068, 128.9725), label: '', color: '', pin: 'in_progress', order: 1 },
  { id: 'g', ...P(35.1072, 128.9772), label: '', color: '', pin: 'done', order: 2 },
  { id: 'h', ...P(35.1061, 128.9800), label: '', color: '', pin: 'visited', order: 3 },
  { id: 'i', ...P(35.0985, 128.9705), label: '', color: '', pin: 'skipped', order: 4 },
];
const DEMO_PATHS: MapPath[] = [
  { points: [P(35.1068, 128.9725), P(35.1072, 128.9772)], tone: 'brand' },
  { points: [P(35.1072, 128.9772), P(35.1061, 128.98)], tone: 'muted', dotted: true },
  { points: [P(35.1061, 128.98), P(35.1031, 128.9781)], tone: 'brand', dotted: true },
];

export default function Ui2Gallery() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Gallery />;
}

function Gallery() {
  const insets = useSafeAreaInsets();
  const { show } = useLocalSearchParams<{ show?: string }>();
  const [status, setStatus] = useState<FieldStatus | null>('in_progress');
  const [added, setAdded] = useState(false);
  const [chip, setChip] = useState(true);
  const [query, setQuery] = useState('낙동대로 3');
  const [sheet, setSheet] = useState(show === 'sheet');
  const [checked, setChecked] = useState<Record<string, boolean>>({ 보안등: true, 도로: true });
  const [title, setTitle] = useState('하신중앙로 점검');
  const moreRef = useRef<View>(null);

  const openMenu = () =>
    showPopoverMenu(moreRef.current, [
      { label: '이름 변경', icon: 'edit', onPress: () => snackbar.show({ message: '이름 변경' }) },
      { label: '삭제', icon: 'trash', tone: 'danger', onPress: () => snackbar.show({ message: '삭제' }) },
    ], { width: 216 });
  const openSnack = () =>
    snackbar.show({
      message: '낙동대로 351을 건너뛰었어요',
      action: { label: '되돌리기', onPress: () => undefined },
      duration: show === 'snackbar' ? 60000 : undefined,
      bottomOffset: space[24],
    });

  useEffect(() => {
    const t = setTimeout(() => {
      if (show === 'snackbar') openSnack();
      if (show === 'menu') openMenu();
      if (show === 'confirm')
        void confirm({ title: '현장을 삭제할까요?', message: '방문 기록 3건도 함께 지워지고 되돌릴 수 없어요.', confirmLabel: '삭제', destructive: true });
      if (show === 'warn')
        void confirm({
          title: '외근을 삭제할까요?',
          warning: "이 외근으로 만든 보고서 '낙동대로 일대 점검 보고'도 함께 지워져요.",
          message: '방문 기록과 이 외근에서만 들른 현장이 지워지고 되돌릴 수 없어요.',
          confirmLabel: '삭제',
          destructive: true,
        });
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + space[16], paddingBottom: insets.bottom + 120 }]}>
        <Text v2="display">2차 UI 갤러리</Text>

        <Section title="Color">
          <View style={styles.wrap}>
            {(['text', 'bg', 'border', 'status'] as const).flatMap((group) =>
              Object.entries(c2[group]).map(([k, v]) => (
                <View key={`${group}.${k}`} style={styles.swatchBox}>
                  <View style={[styles.swatch, { backgroundColor: v }]} />
                  <Text v2="micro.semibold" tone="secondary" numberOfLines={1}>{`${group}/${k}`}</Text>
                </View>
              )),
            )}
          </View>
        </Section>

        <Section title="Typography (27)">
          {(Object.keys(type2) as Type2[]).map((k) => (
            <Text key={k} v2={k} numberOfLines={1}>
              {k} · 외근 낙동대로 351
            </Text>
          ))}
        </Section>

        <Section title="Radius · Elevation">
          <View style={styles.wrap}>
            {Object.entries(radius2).map(([k, r]) => (
              <View key={k} style={styles.swatchBox}>
                <View style={[styles.radiusBox, { borderRadius: Math.min(r, 28) }]} />
                <Text v2="micro.semibold" tone="secondary">{`${k} ${r}`}</Text>
              </View>
            ))}
          </View>
          <View style={[styles.wrap, { gap: space[20], marginTop: space[12] }]}>
            {(Object.keys(shadowCss) as (keyof typeof shadowCss)[]).map((k) => (
              <View key={k} style={styles.swatchBox}>
                <View style={[styles.shadowBox, elevation2[k]]} />
                <Text v2="micro.semibold" tone="secondary">{k}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title={`Icons (${ICON_NAMES.length})`}>
          <View style={styles.wrap}>
            {ICON_NAMES.map((n) => (
              <View key={n} style={styles.iconCell}>
                <Icon name={n} size={24} color={n === 'clear' ? c2.bg.strong : c2.text.primary} />
                <Text v2="tiny" tone="tertiary" numberOfLines={1}>{n}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Button2 · L / M">
          {(['L', 'M'] as const).map((size) => (
            <View key={size} style={styles.wrap}>
              {VARIANTS.map((v) => (
                <Button2 key={v} variant={v} size={size} icon="check">
                  버튼
                </Button2>
              ))}
            </View>
          ))}
          <View style={styles.wrap}>
            <Button2 loading>저장</Button2>
            <Button2 disabled variant="secondary">비활성</Button2>
          </View>
          <Button2 fullWidth icon="check">체크인</Button2>
        </Section>

        <Section title="Tag · StatusMark">
          <View style={styles.row}>
            <Tag label="보안등" />
            <Tag label="보안등" tone="brand" />
            <Tag label="보안등" tone="success" />
            <Tag label="보안등" tone="warning" />
            <Tag label="보안등" tone="danger" />
          </View>
          <View style={styles.row}>
            {STATUSES.map((s) => (
              <StatusMark key={s} status={s} />
            ))}
            <View style={styles.brandStrip}>
              {STATUSES.map((s) => (
                <StatusMark key={s} status={s} variant="onBrand" />
              ))}
            </View>
          </View>
        </Section>

        <Section title="StatusOption · AddToggle · FilterChip2">
          <StatusOptionGroup value={status} onChange={setStatus} />
          <View style={styles.row}>
            <AddToggle added={added} onPress={() => setAdded((a) => !a)} label="낙동대로 351" />
            <AddToggle added onPress={() => undefined} label="당리로 87" />
          </View>
          <View style={styles.wrap}>
            <FilterChip2 label="보안등" selected={chip} onPress={() => setChip((c) => !c)} status="pending" />
            <FilterChip2 label="보안등" selected={false} onPress={() => undefined} status="pending" />
            <FilterChip2 label="도로" selected size="M" onPress={() => undefined} />
            <FilterChip2 label="도로" selected={false} size="M" onPress={() => undefined} />
          </View>
        </Section>

        <Section title="SearchBar · MapButton · MemoField">
          <View style={styles.subtle}>
            <SearchBar value="" onPressLauncher={() => undefined} />
            <SearchBar value={query} onChangeText={setQuery} />
            <View style={styles.row}>
              <MapButton icon="layers" accessibilityLabel="지도 설정" onPress={() => undefined} dot />
              <MapButton icon="locate" accessibilityLabel="내 위치" onPress={() => undefined} />
              <MapButton icon="plus" accessibilityLabel="기록" onPress={() => undefined} />
              <MapButton icon="close" size={44} accessibilityLabel="닫기" onPress={() => undefined} />
              <MapButton ref={moreRef} icon="more" size={44} accessibilityLabel="더보기" onPress={openMenu} />
            </View>
          </View>
          <MemoField />
          <MemoField voice={{ onPress: () => undefined }} placeholder="메모 입력 (voice)" />
          <MemoField multiline placeholder="여러 줄 메모" />
        </Section>

        <Section title="DestinationFAB · CheckinPill">
          <View style={[styles.wrap, { gap: space[24] }]}>
            <DestinationFAB count={2} onPress={() => undefined} />
            <DestinationFAB count={0} onPress={() => undefined} />
            <DestinationFAB size={44} count={2} onPress={() => undefined} />
            <DestinationFAB size={44} count={12} onPress={() => undefined} />
            <CheckinPill label="체크인 · 1/2 · 10:42" />
          </View>
        </Section>

        <Section title="SelectRow">
          {['보안등', '도로', '불법투기'].map((n, i) => (
            <SelectRow
              key={n}
              first={i === 0}
              title={n}
              subtitle={`현장 ${12 - i * 4}곳`}
              selected={!!checked[n]}
              onPress={() => setChecked((c) => ({ ...c, [n]: !c[n] }))}
              onMore={() => undefined}
            />
          ))}
          <SelectRow mode="radio" first={false} title="낙동정비사업" subtitle="현장 12곳 · 지금 속한 프로젝트" selected onPress={() => undefined} />
          <SelectRow mode="radio" title="프로젝트 없음" selected={false} onPress={() => undefined} />
        </Section>

        <Section title="EditableTitle">
          <EditableTitle value={title} onSubmit={setTitle} label="외근 제목" appearance="pencil" />
          <EditableTitle value={title} onSubmit={setTitle} label="외근 제목" appearance="pencil-underline" />
          <EditableTitle value="" onSubmit={() => undefined} label="제목" appearance="pencil" allowEmpty placeholder="제목 없음" v2="title.s" />
        </Section>

        <Section title="Overlays">
          <View style={styles.wrap}>
            <Button2 size="M" variant="secondary" onPress={openSnack}>스낵바</Button2>
            <Button2 size="M" variant="secondary" onPress={() => setSheet(true)}>시트</Button2>
            <Button2 size="M" variant="secondary" onPress={openMenu}>메뉴</Button2>
            <Button2
              size="M"
              variant="danger"
              onPress={() =>
                void confirm({
                  title: '외근을 삭제할까요?',
                  warning: "이 외근으로 만든 보고서 '낙동대로 일대 점검 보고'도 함께 지워져요.",
                  message: '방문 기록과 이 외근에서만 들른 현장이 지워지고 되돌릴 수 없어요.',
                  confirmLabel: '삭제',
                  destructive: true,
                })
              }
            >
              확인 창
            </Button2>
          </View>
        </Section>

        <Section title="MapPreviewCard (132 / 120)">
          <MapPreviewCard markers={[{ ...DEMO_PINS[0], selected: true }]} onExpand={() => snackbar.show({ message: '크게 보기' })} />
          <MapPreviewCard
            height={120}
            markers={[{ ...DEMO_PINS[3] }]}
            circle={{ lat: 35.1012, lng: 128.9733, radius: 48 }}
            onExpand={() => undefined}
          />
        </Section>

        <Section title="Map pins · paths · circle · start">
          <View style={styles.bigMap}>
            <KakaoMapWebView
              markers={DEMO_PINS}
              paths={DEMO_PATHS}
              circle={{ lat: 35.1012, lng: 128.9733, radius: 60 }}
              startPoint={P(35.1040, 128.9740)}
              fitToMarkers
            />
          </View>
        </Section>
      </ScrollView>

      <AppSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="분류 선택"
        subtitle="낙동대로 355 · 여러 개 고를 수 있어요"
      >
        <View style={styles.sheetList}>
          {['보안등', '도로', '불법투기', '가로수'].map((n, i) => (
            <SelectRow
              key={n}
              first={i === 0}
              title={n}
              subtitle={`현장 ${12 - i * 3}곳`}
              selected={!!checked[n]}
              onPress={() => setChecked((c) => ({ ...c, [n]: !c[n] }))}
              onMore={() => undefined}
            />
          ))}
        </View>
      </AppSheet>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text v2="heading">{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c2.bg.canvas },
  content: { paddingHorizontal: space[20], gap: space[32] },
  section: { gap: space[12] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[8] },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[8] },
  swatchBox: { width: 76, gap: space[4] },
  swatch: { height: 32, borderRadius: radius2.xs, borderWidth: 1, borderColor: c2.border.default },
  radiusBox: { width: 56, height: 56, backgroundColor: c2.bg.brandSubtle, borderWidth: 1, borderColor: c2.border.brandSubtle },
  shadowBox: { width: 64, height: 48, borderRadius: radius2.md, backgroundColor: c2.bg.canvas },
  iconCell: { width: 64, alignItems: 'center', gap: space[4], paddingVertical: space[6] },
  brandStrip: { flexDirection: 'row', gap: space[8], padding: space[8], borderRadius: radius2.sm, backgroundColor: c2.bg.brand },
  subtle: { gap: space[12], padding: space[12], borderRadius: radius2.xl, backgroundColor: c2.bg.muted },
  bigMap: { height: 340, borderRadius: radius2.lg, overflow: 'hidden', borderWidth: 1, borderColor: c2.border.default },
  sheetList: { paddingHorizontal: space[20] },
});
