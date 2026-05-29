import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import {
  isInKorea,
  KR_LAT,
  KR_LNG,
  type SelectedAddress,
} from '@/utils/addressSearch';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

interface Props {
  onResolve: (addr: SelectedAddress) => void;
}

// fields/new + fields/[id]/edit 에 line-for-line 동일하게 복제돼 있던
// 카카오 Geocoder 폴백 폼을 하나로 통합. KR 좌표 경계, 빈 입력 가드,
// 'Number('') === 0' 함정 차단을 단일 진실 출처에서 관리.
export function ManualCoordinateForm({ onResolve }: Props) {
  const [road, setRoad] = useState('');
  const [jibun, setJibun] = useState('');
  const [latStr, setLatStr] = useState('');
  const [lngStr, setLngStr] = useState('');

  const handleSubmit = () => {
    if (!road.trim() && !jibun.trim()) {
      Alert.alert(
        '주소 입력 필요',
        '도로명 주소 또는 지번 주소 중 하나는 입력해주세요.',
      );
      return;
    }
    if (!latStr.trim() || !lngStr.trim()) {
      Alert.alert('좌표 입력 필요', '위도·경도를 모두 입력해주세요.');
      return;
    }
    const lat = Number(latStr);
    const lng = Number(lngStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      Alert.alert('좌표 형식 오류', '위도·경도를 숫자로 입력해주세요.');
      return;
    }
    if (!isInKorea(lat, lng)) {
      Alert.alert(
        '대한민국 영역 외 좌표',
        `위도는 ${KR_LAT.min}~${KR_LAT.max}, 경도는 ${KR_LNG.min}~${KR_LNG.max} 범위여야 합니다.`,
      );
      return;
    }
    const display = road.trim() || jibun.trim();
    onResolve({
      roadAddress: road.trim() || jibun.trim(),
      jibunAddress: jibun.trim() || road.trim(),
      buildingName: null,
      lat,
      lng,
      display,
    });
  };

  return (
    <View style={styles.box}>
      <Text variant="body" weight="bold" style={styles.title}>
        좌표 직접 입력
      </Text>
      <Input
        label="도로명 주소"
        value={road}
        onChangeText={setRoad}
        placeholder="예: 부산광역시 해운대구 해운대해변로 264"
        containerStyle={styles.field}
      />
      <Input
        label="지번 주소"
        value={jibun}
        onChangeText={setJibun}
        placeholder="예: 부산광역시 해운대구 우동 1411"
        containerStyle={styles.field}
      />
      <View style={styles.coordRow}>
        <Input
          label="위도 (lat)"
          value={latStr}
          onChangeText={setLatStr}
          keyboardType="numeric"
          placeholder="33~43"
          containerStyle={styles.coordHalf}
        />
        <Input
          label="경도 (lng)"
          value={lngStr}
          onChangeText={setLngStr}
          keyboardType="numeric"
          placeholder="124~132"
          containerStyle={styles.coordHalf}
        />
      </View>
      <Button
        onPress={handleSubmit}
        fullWidth
        leftIcon="location"
        style={styles.submit}
      >
        이 좌표로 적용
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  title: { marginBottom: spacing.sm },
  field: { marginTop: spacing.sm },
  coordRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  coordHalf: { flex: 1 },
  submit: { marginTop: spacing.md },
});
