export type PlaceStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE';

export interface Place {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  status: PlaceStatus;
  memo?: string;
  photos?: string[];
}