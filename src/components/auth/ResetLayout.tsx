import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { KeyboardAvoid } from '@/components/ui/KeyboardAvoid';
import { PageHeader } from '@/components/ui/PageHeader';
import { Text } from '@/components/ui/Text';
import { c2, space } from '@/theme/v2';

interface Props {
  onBack: () => void;
  title: string;
  /** 제목 아래 회색 설명. 문자열이 아니면(굵은 이메일 섞인 11-5) 그대로 그린다. */
  description: React.ReactNode;
  children: React.ReactNode;
  /** 하단 고정 버튼. */
  footer: React.ReactNode;
}

/** 비밀번호 찾기 11-4·11-5·11-8 공통 틀: 머리 '비밀번호 찾기' + 큰 제목 + 설명 + 본문 + 하단 버튼. */
export function ResetLayout({ onBack, title, description, children, footer }: Props) {
  return (
    <SafeScreen background={c2.bg.canvas}>
      <PageHeader title="비밀번호 찾기" onBack={onBack} />
      <KeyboardAvoid style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text v2="title.l" tone="primary" accessibilityRole="header">
            {title}
          </Text>
          {typeof description === 'string' ? (
            <Text v2="bodyM.regular" tone="secondary" style={styles.desc}>
              {description}
            </Text>
          ) : (
            <View style={styles.desc}>{description}</View>
          )}
          <View style={styles.body}>{children}</View>
        </ScrollView>
        <BottomActionBar>{footer}</BottomActionBar>
      </KeyboardAvoid>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c2.bg.canvas },
  scroll: { paddingHorizontal: space[20], paddingTop: space[20], paddingBottom: space[24] },
  desc: { marginTop: space[8] },
  body: { marginTop: space[24] + space[4], gap: space[16] },
});
