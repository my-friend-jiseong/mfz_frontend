import { useEffect, useState } from 'react';
import { getPlaceDetail } from '../api/placeApi';
import { mockPlaces } from '../mocks/place';
import type { Place } from '../features/places/type';

export default function usePlaceDetail(id?: string) {
  const [place, setPlace] = useState<Place | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const fetchDetail = async () => {
      try {
        const data = await getPlaceDetail(id);
        setPlace(data);
      } catch {
        const fallback = mockPlaces.find((item) => String(item.id) === id) ?? null;
        setPlace(fallback);
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [id]);

  return { place, loading, setPlace };
}