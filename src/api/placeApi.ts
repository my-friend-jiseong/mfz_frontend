import { apiClient } from './client';
import type { Place, PlaceStatus } from '../features/places/type';

export async function getPlaces(): Promise<Place[]> {
  const { data } = await apiClient.get('/places');
  return data;
}

export async function getPlaceDetail(id: string): Promise<Place> {
  const { data } = await apiClient.get(`/places/${id}`);
  return data;
}

export async function updatePlaceStatus(id: number, status: PlaceStatus) {
  const { data } = await apiClient.patch(`/places/${id}/status`, { status });
  return data;
}

export async function updatePlaceMemo(id: number, memo: string) {
  const { data } = await apiClient.post(`/places/${id}/memo`, { memo });
  return data;
}