import React from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';

/**
 * 루트 오버레이(스낵바·확인 창·메뉴·액션 시트·세션 경고)를 iOS 네이티브 fullScreenModal((modals) 그룹) 위에 띄운다.
 * iOS 는 루트 뷰 컨트롤러가 이미 모달을 띄우고 있으면 그 아래에 그리거나(일반 View) 아예 못 띄운다(RN Modal 의
 * present 실패). FullWindowOverlay 는 별도 창 위에 그려 이 둘을 피한다. 웹·안드로이드는 그대로(Fragment).
 * 실기기 확인 대상 — 웹·안드로이드에서는 재현되지 않는다.
 */
export function TopOverlay({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'ios') return <>{children}</>;
  return (
    <FullWindowOverlay>
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {children}
      </View>
    </FullWindowOverlay>
  );
}

interface Props {
  visible: boolean;
  onRequestClose?: () => void;
  animationType?: 'none' | 'fade' | 'slide';
  children: React.ReactNode;
}

/**
 * TopOverlay 안에서 쓰는 Modal. iOS 는 FullWindowOverlay 의 뷰에 뷰 컨트롤러가 없어 RN Modal 이 뜨지 않으므로
 * 전체를 덮는 View 로 그린다(하드웨어 뒤로가 없어 onRequestClose 는 필요 없다). 그 밖은 RN Modal.
 */
export function OverlayModal({ visible, onRequestClose, animationType = 'none', children }: Props) {
  if (Platform.OS === 'ios') {
    if (!visible) return null;
    return (
      <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
        {children}
      </View>
    );
  }
  return (
    <Modal transparent visible={visible} statusBarTranslucent animationType={animationType} onRequestClose={onRequestClose}>
      {children}
    </Modal>
  );
}
