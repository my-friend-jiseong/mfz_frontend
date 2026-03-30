import { useState } from 'react';
import type { Place } from '../../features/places/type';
import PlaceMemoForm from './PlaceMemoForm';
import PlacePhotoUpload from './PlacePhotoUpload';
import PlaceStatusForm from './PlaceStatusForm';

type Props = {
  place: Place;
};

export default function PlaceDetailPanel({ place }: Props) {
  const [status, setStatus] = useState(place.status);

  return (
    <div className="detail-panel">
      <h2>{place.name}</h2>
      <p>{place.address}</p>

      <PlaceStatusForm value={status} onChange={setStatus} />
      <PlaceMemoForm initialValue={place.memo} onSave={(memo) => console.log('메모 저장', memo)} />
      <PlacePhotoUpload onUpload={(files) => console.log('사진 업로드', files)} />
    </div>
  );
}