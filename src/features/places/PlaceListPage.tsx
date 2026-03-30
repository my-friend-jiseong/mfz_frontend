import Loading from '../../components/common/Loading';
import PlaceCard from '../../components/place/PlaceCard';
import usePlaces from '../../hooks/usePlaces';

export default function PlaceListPage() {
  const { places, loading } = usePlaces();

  if (loading) return <Loading />;

  return (
    <section>
      <h2>방문지 목록</h2>
      <div className="place-list">
        {places.map((place) => (
          <PlaceCard key={place.id} place={place} />
        ))}
      </div>
    </section>
  );
}