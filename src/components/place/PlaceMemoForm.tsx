import { useState } from 'react';

type Props = {
  initialValue?: string;
  onSave: (memo: string) => void;
};

export default function PlaceMemoForm({ initialValue = '', onSave }: Props) {
  const [memo, setMemo] = useState(initialValue);

  return (
    <section>
      <h3>메모</h3>
      <textarea
        rows={5}
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="현장 메모를 입력하세요"
      />
      <button onClick={() => onSave(memo)}>메모 저장</button>
    </section>
  );
}