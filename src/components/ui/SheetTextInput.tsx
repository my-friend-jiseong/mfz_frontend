import React from 'react';
import { Platform, TextInput, type TextInputProps, type TextStyle } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';

// 시트 안 입력칸. 네이티브는 gorhom BottomSheetTextInput(키보드에 맞춰 시트를 올린다),
// 웹은 일반 TextInput — gorhom 5.2 의 BottomSheetTextInput 은 웹에서 blur 때
// `TextInput.State.currentlyFocusedInput is not a function` 으로 죽는다(2026-10-17 실측).
const WEB_NO_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as TextStyle | null;

export function SheetTextInput({ style, ...rest }: TextInputProps) {
  if (Platform.OS === 'web') return <TextInput {...rest} style={[style, WEB_NO_OUTLINE]} />;
  return <BottomSheetTextInput {...rest} style={style} />;
}
