import { Link } from 'react-router-dom';
import type { Place } from '../../features/places/type';
import StatusBadge from '../common/StatusBadge';

type Props = {
  place: Place;
};

export default function PlaceCard({ place }: Props) {
  return (
    <Link to={`/places/${place.id}`} className="place-card">
      <div>
        <h3>{place.name}</h3>
        <p>{place.address}</p>
      </div>
      <StatusBadge status={place.status} />
    </Link>
  );
}