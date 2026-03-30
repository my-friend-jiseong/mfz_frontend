import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import type { Place } from '../../features/places/type';

type Props = {
  places: Place[];
  center?: [number, number];
};

export default function PlaceMap({ places, center = [35.1047, 128.9748] }: Props) {
  return (
    <MapContainer center={center} zoom={13} style={{ height: '500px', width: '100%' }}>
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {places.map((place) => (
        <Marker key={place.id} position={[place.lat, place.lng]}>
          <Popup>
            <strong>{place.name}</strong>
            <br />
            {place.address}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}