import { useParams } from 'react-router-dom';
import Loading from '../../components/common/Loading';
import PlaceDetailPanel from '../../components/place/PlaceDetailPanel';
import usePlaceDetail from '../../hooks/usePlaceDetail';

export default function PlaceDetailPage() {
  const { id } = useParams();
  const { place, loading } = usePlaceDetail(id);

  if (loading) return <Loading />;
  if (!place) return <div>방문지 정보를 찾을 수 없습니다.</div>;

  return <PlaceDetailPanel place={place} />;
}