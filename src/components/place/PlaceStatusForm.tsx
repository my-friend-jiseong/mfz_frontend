import type { PlaceStatus } from '../../features/places/type';

type Props = {
  value: PlaceStatus;
  onChange: (value: PlaceStatus) => void;
};

export default function PlaceStatusForm({ value, onChange }: Props) {
  return (
    <section>
      <h3>상태 변경</h3>
      <select value={value} onChange={(e) => onChange(e.target.value as PlaceStatus)}>
        <option value="PENDING">미완료</option>
        <option value="IN_PROGRESS">진행중</option>
        <option value="DONE">완료</option>
      </select>
    </section>
  );
}