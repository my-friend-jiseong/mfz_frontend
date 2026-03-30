type Status = 'PENDING' | 'IN_PROGRESS' | 'DONE';

type Props = {
  status: Status;
};

const labelMap: Record<Status, string> = {
  PENDING: '미완료',
  IN_PROGRESS: '진행중',
  DONE: '완료',
};

export default function StatusBadge({ status }: Props) {
  return <span className={`status-badge status-${status.toLowerCase()}`}>{labelMap[status]}</span>;
}