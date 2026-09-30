import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  const createdVisitId = useRef<string | null>(null);

  // 현장의 기존 메모를 불러와 고칠 수 있게 한다 (FE-CHK-04). 사용자가 입력을 시작한 뒤엔 덮지 않는다.
  // 불러온 메모는 **이전 방문의 것**이다 — 고쳐도 그걸 지우지 않고 이번 방문 메모를 새로 쓴다.
  const prefilled = useRef(false);
  const memo = latestMemo(attachments);
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
    let visitId = createdVisitId.current;
    if (!visitId) {
      const r = await checkIn(activeTripId, fieldId);
      if (!r.ok) {
        Alert.alert('체크인 실패', r.error);
        return null;
      }
      visitId = r.visit.id;
      createdVisitId.current = visitId;
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
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Card padding="lg" style={styles.header}>
            <View style={styles.headerCap}>
              <Ionicons name="location" size={16} color={colors.primary} />
              <Text variant="bodySm" weight="bold" color="primary">
                체크인
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
      </KeyboardAvoidingView>
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
