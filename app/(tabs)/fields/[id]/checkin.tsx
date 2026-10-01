import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoid } from '@/components/ui/KeyboardAvoid';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { NavHeader } from '@/components/ui/NavHeader';
import { toast } from '@/components/ui/Toast';
import { EmptyState } from '@/components/EmptyState';
import { SafeScreen } from '@/components/SafeScreen';
import { VisitRecordForm } from '@/components/trips/VisitRecordForm';
import { useFieldStore } from '@/stores/fieldStore';
import { useTripStore } from '@/stores/tripStore';
import { useVisitStore } from '@/stores/visitStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { fieldDetailLine } from '@/utils/fieldFacets';
import {
  EMPTY_RECORD,
  latestMemo,
  otherReasonShort,
  saveVisitRecord,
  type VisitRecordValue,
} from '@/utils/visitRecord';
import { openReportForTripField } from '@/utils/reportEntry';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

const ACTIVE_ROUTE = '/(tabs)/trips/active';

// 체크인 (명세 v2 §4.1).
// 방문은 **`체크인 완료` 를 눌러야** 만든다 — 예전엔 화면 진입과 동시에 만들어서 뒤로가기해도
// 방문이 남았다(FE-CHK-01 위반). 사진도 고르기만 하고 완료 시점에 올린다.
export default function FieldCheckin() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fieldId = id ?? '';
  const router = useRouter();

  const field = useFieldStore((s) => s.getById(fieldId));
  const loadFieldDetail = useFieldStore((s) => s.loadDetail);
  const attachments = useFieldStore((s) => s.directAttachments[fieldId]);
  const activeTripId = useTripStore((s) => s.activeTripId);
  const checkIn = useVisitStore((s) => s.checkIn);
  const findDestination = useDestinationStore((s) => s.findByTripField);
  const markDestinationArrived = useDestinationStore((s) => s.markArrived);

  const [value, setValue] = useState<VisitRecordValue>(EMPTY_RECORD);
  const [saving, setSaving] = useState<null | 'done' | 'report'>(null);
  // 이 화면에서 이미 만든 방문 — 보고서 작성 후 돌아와 다시 완료를 눌러도 방문이 두 번 생기지 않게.
  // 어느 외근의 방문인지 함께 기억한다: 화면이 현장 탭 스택에 남아 다음 외근에 재사용되면
  // 이전 외근의 방문에 새 기록을 덮어쓰던 여지가 있었다(리뷰).
  const createdVisitId = useRef<string | null>(null);
  const createdForTrip = useRef<string | null>(null);
  // 체크인 완료로 끝난 세션 — 다음에 이 화면이 포커스되면 새 체크인으로 시작한다.
  const completed = useRef(false);
  // 저장 중엔 떠나도 폼을 비우지 않는다(저장 결과가 되돌려 쓰며 경합했다 — 리뷰).
  const persisting = useRef(false);

  // 현장의 기존 메모를 불러와 고칠 수 있게 한다 (FE-CHK-04). 사용자가 입력을 시작한 뒤엔 덮지 않는다.
  // 불러온 메모는 **이전 방문의 것**이다 — 고쳐도 그걸 지우지 않고 이번 방문 메모를 새로 쓴다.
  const prefilled = useRef(false);
  const memo = latestMemo(attachments);
  const memoRef = useRef<string | null>(null);
  memoRef.current = memo?.text ?? null;
  // 저장 기준선 — 처음엔 불러온 텍스트, 한 번 저장한 뒤엔 이번 방문에 쓴 메모.
  const saved = useRef<{ memoText: string; memo: ReturnType<typeof latestMemo> }>({
    memoText: '',
    memo: null,
  });
  useEffect(() => {
    void loadFieldDetail(fieldId);
  }, [fieldId, loadFieldDetail]);
  useEffect(() => {
    if (prefilled.current || !attachments) return;
    prefilled.current = true;
    if (memo?.text) {
      saved.current.memoText = memo.text;
      setValue((v) => (v.memo ? v : { ...v, memo: memo.text ?? '' }));
    }
  }, [attachments, memo]);

  // 화면을 떠날 때 — 아직 방문을 만들지 않았으면 입력을 버린다(FE-CHK-01 뒤로가기 = 저장 안 함).
  // 체크인은 현장 탭 스택에 올라가 있어 하드웨어 뒤로가기가 탭만 바꾸고 화면을 언마운트하지 않는다.
  // 그래서 다시 들어오면 저장하지 않은 선택·메모가 남아 있었다(에뮬레이터 실측 2026-09-30).
  // 방문을 이미 만들었으면(보고서 작성으로 나간 경우) 남긴다 — 비우면 돌아와 완료할 때 방문이 두 번 생긴다.
  const resetSession = () => {
    createdVisitId.current = null;
    createdForTrip.current = null;
    completed.current = false;
    saved.current = { memoText: memoRef.current ?? '', memo: null };
    // 비우되 현장의 기존 메모는 다시 채워 둔다(FE-CHK-04 — 불러와 수정).
    setValue({ ...EMPTY_RECORD, memo: memoRef.current ?? '' });
  };
  useFocusEffect(
    useCallback(() => {
      // 들어올 때 — 지난번에 완료했거나 다른 외근에서 만든 방문이면 새로 시작한다.
      // (떠날 때가 아니라 들어올 때 비우는 이유: 떠나는 화면의 상태를 navigate 와 같은 틱에 바꾸면
      //  Fabric 이 무음 크래시한 전례가 있다 — 메모리 '로그인 직후 앱 내려감'.)
      if (
        createdVisitId.current &&
        (completed.current || createdForTrip.current !== useTripStore.getState().activeTripId)
      ) {
        resetSession();
      }
      return () => {
        if (createdVisitId.current || persisting.current) return;
        resetSession();
      };
      // resetSession 은 ref·setState 만 쓴다.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const back = () => router.replace(ACTIVE_ROUTE as never);

  if (!field) {
    return (
      <SafeScreen>
        <NavHeader title="체크인" onBack={back} />
        <EmptyState icon="search-outline" title="현장을 찾을 수 없습니다" />
      </SafeScreen>
    );
  }

  if (activeTripId === null) {
    return (
      <SafeScreen>
        <NavHeader title="체크인" onBack={() => router.replace('/(tabs)/trips' as never)} />
        <EmptyState
          icon="briefcase-outline"
          title="외근 시작 후 체크인 가능합니다"
          description="외근 탭에서 외근을 시작해주세요"
        />
      </SafeScreen>
    );
  }

  const blocked = otherReasonShort(value);

  // 방문 생성 + 입력 반영. 성공하면 visitId, 실패하면 null(안내는 여기서 띄운다).
  const persist = async (): Promise<string | null> => {
    persisting.current = true;
    try {
      return await persistInner();
    } finally {
      persisting.current = false;
    }
  };
  const persistInner = async (): Promise<string | null> => {
    let visitId = createdVisitId.current;
    if (!visitId) {
      const r = await checkIn(activeTripId, fieldId);
      if (!r.ok) {
        Alert.alert('체크인 실패', r.error);
        return null;
      }
      visitId = r.visit.id;
      createdVisitId.current = visitId;
      createdForTrip.current = activeTripId;
      const dest = findDestination(activeTripId, fieldId);
      if (dest && dest.status === 'pending') markDestinationArrived(dest.id);
    }
    const res = await saveVisitRecord({
      visitId,
      fieldId,
      initialStatus: null,
      initialMemo: saved.current.memo,
      memoBaseline: saved.current.memoText,
      value,
    });
    const { errors } = res;
    // 보고서 작성으로 갔다가 돌아와 다시 완료를 눌러도 같은 사진·메모를 또 올리지 않게 기준선을 옮긴다.
    setValue(res.value);
    saved.current = { memoText: res.value.memo.trim(), memo: res.memo };
    // 방문은 이미 만들어졌다 — 일부 입력만 실패했으면 알리고 진행한다. 방문 수정에서 다시 고칠 수 있다.
    if (errors.length > 0) {
      Alert.alert('일부 내용을 저장하지 못했습니다', `${errors.join('\n')}\n\n외근 정리의 방문 수정에서 다시 입력할 수 있습니다.`);
    }
    return visitId;
  };

  const handleDone = async () => {
    if (saving || blocked) return;
    setSaving('done');
    const visitId = await persist();
    setSaving(null);
    if (!visitId) return;
    completed.current = true;
    toast('체크인을 저장했습니다');
    // safeBack 대신 replace — 체크인은 trips/active 에서 다른 탭(fields) 스택으로 건너와 있어
    // canGoBack 기준이 엉뚱하다. 돌아갈 곳이 정해져 있으니 직행한다.
    router.replace(ACTIVE_ROUTE as never);
  };

  const handleReport = async () => {
    if (saving || blocked) return;
    setSaving('report');
    const visitId = await persist();
    if (!visitId) {
      setSaving(null);
      return;
    }
    await openReportForTripField(router, activeTripId, fieldId);
    setSaving(null);
  };

  return (
    <SafeScreen>
      <NavHeader title="체크인" onBack={back} />
      <KeyboardAvoid
        style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Card padding="lg" style={styles.header}>
            <View style={styles.headerCap}>
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              <Text variant="bodySm" weight="bold" color="primary">
                체크인 완료
              </Text>
            </View>
            <Text variant="body" weight="semibold">
              {field.address}
            </Text>
            {/* 주소가 이미 상세주소로 끝나면 중복이다 (fieldFacets 규칙). */}
            {fieldDetailLine(field) ? (
              <Text variant="bodySm" color="textMuted">
                {fieldDetailLine(field)}
              </Text>
            ) : null}
          </Card>

          <VisitRecordForm value={value} onChange={setValue} disabled={saving !== null} />
        </ScrollView>
        <BottomActionBar
          secondary={
            <Button
              onPress={() => void handleReport()}
              variant="secondary"
              size="lg"
              loading={saving === 'report'}
              disabled={saving !== null || blocked}
            >
              보고서 작성
            </Button>
          }
        >
          <Button
            onPress={() => void handleDone()}
            size="lg"
            fullWidth
            leftIcon="save"
            loading={saving === 'done'}
            disabled={saving !== null || blocked}
          >
            체크인 완료
          </Button>
        </BottomActionBar>
      </KeyboardAvoid>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  // 테두리를 지우고 배경만 깔면 문서 흐름의 depth 전략(테두리)에서 이 박스만 빠진다 —
  // delete-account 경고 박스와 같은 이유로 같은 계열 테두리를 남긴다(7절).
  header: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  headerCap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
