import PlaceMap from '../../components/map/PlaceMap';
import usePlaces from '../../hooks/usePlaces';

export default function MapPage() {
  const { places } = usePlaces();

  return (
    <section>
      <h2>지도 화면</h2>
      <PlaceMap places={places} />
    </section>
  );
}