import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppSheet } from '@/components/ui/AppSheet';
import { Button2 } from '@/components/ui/Button2';
import { Text } from '@/components/ui/Text';
import { Icon, type IconName } from '@/components/icons';
import { c2, radius2, space } from '@/theme/v2';

// Figma 8-1: 마이크 상자 52(모서리 xl 16), 줄 아이콘 상자 32(모서리 sm 10).
const ICON_BOX = 52;
const ROW_ICON_BOX = 32;

const ROWS: { icon: IconName; color: string; title: string; desc: string }[] = [
  { icon: 'text-lines', color: c2.text.body, title: '말한 내용이 글자로 들어가요', desc: '저장하기 전에 직접 고칠 수 있어요.' },
  { icon: 'clock', color: c2.text.body, title: '말을 멈추면 자동으로 끝나요', desc: '중간에 끝내려면 정지 버튼을 눌러 주세요.' },
  {
    icon: 'cloud',
    color: c2.text.warning,
    title: '음성은 변환을 위해 외부 서버로 보내질 수 있어요',
    desc: '민원인 이름·연락처 같은 개인정보는 말하지 마세요.',
  },
];

interface Props {
  open: boolean;
  /**
   * 어떤 길로든 닫힌 뒤 한 번. start 는 [시작하기]로 닫았는가.
   * [시작하기]가 아니어도 부르는 쪽은 권한을 물어야 한다 — 안내 뒤엔 OS 팝업으로 이어져야 한다(App Store 5.1.1(iv)).
   */
  onClose: (start: boolean) => void;
}

/**
 * 8-1 체크인 · 음성 메모 안내(Figma 694:4210). 마이크를 처음 누를 때 한 번만.
 * Figma 의 [취소]는 두지 않는다 — 위치 권한 안내의 [나중에]가 같은 이유로 반려됐다(d63d081). 닫는 길은 스크림·끌어내리기뿐.
 */
export function VoiceIntroSheet({ open, onClose }: Props) {
  const startRef = useRef(false);
  const [closing, setClosing] = useState(false);
  const handleClose = useCallback(() => {
    const start = startRef.current;
    startRef.current = false;
    setClosing(false);
    onClose(start);
  }, [onClose]);

  return (
    <AppSheet open={open && !closing} onClose={handleClose} closeButton={false}>
      <View style={styles.body}>
        <View style={styles.iconBox}>
          <Icon name="mic" size={26} color={c2.text.inverse} />
        </View>
        <Text v2="title.sheet" style={styles.title} accessibilityRole="header">
          말로 메모를 남길 수 있어요
        </Text>
        <View style={styles.list}>
          {ROWS.map((r) => (
            <View key={r.icon} style={styles.row}>
              <View style={styles.rowIcon}>
                <Icon name={r.icon} size={18} color={r.color} />
              </View>
              <View style={styles.rowText}>
                <Text v2="bodyM.bold">{r.title}</Text>
                <Text v2="bodyS.regular" tone="secondary" style={styles.rowDesc}>
                  {r.desc}
                </Text>
              </View>
            </View>
          ))}
        </View>
        <Button2
          onPress={() => {
            startRef.current = true;
            setClosing(true);
          }}
          fullWidth
        >
          시작하기
        </Button2>
      </View>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  // 손잡이 영역(20) 아래 12 → 아이콘(Figma: 시트 위 32).
  body: { paddingHorizontal: space[20], paddingTop: space[12], paddingBottom: space[24] },
  iconBox: {
    width: ICON_BOX,
    height: ICON_BOX,
    borderRadius: radius2.xl,
    backgroundColor: c2.bg.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { marginTop: space[12] },
  list: { marginTop: space[20], marginBottom: space[20], gap: space[16] },
  row: { flexDirection: 'row', gap: space[12] },
  rowIcon: {
    width: ROW_ICON_BOX,
    height: ROW_ICON_BOX,
    borderRadius: radius2.sm,
    backgroundColor: c2.bg.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowDesc: { marginTop: space[2] },
});
