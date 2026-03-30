import { apiClient } from './client';

export async function generateReport() {
  const { data } = await apiClient.post('/reports');
  return data;
}