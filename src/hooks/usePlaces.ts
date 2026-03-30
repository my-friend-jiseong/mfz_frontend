import { useEffect, useState } from 'react';
import { getPlaces } from '../api/placeApi';
import { mockPlaces } from '../mocks/place';
import type { Place } from '../features/places/type';

export default function usePlaces() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPlaces = async () => {
      try {
        const data = await getPlaces();
        setPlaces(data);
      } catch (err) {
        console.warn('API 연결 실패, 목업 데이터 사용', err);
        setPlaces(mockPlaces);
        setError(null);
      } finally {
        setLoading(false);
      }
    };

    fetchPlaces();
  }, []);

  return { places, loading, error };
}