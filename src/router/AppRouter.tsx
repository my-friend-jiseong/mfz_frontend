import { Navigate, Routes, Route } from 'react-router-dom';
import Layout from '../components/common/Layout';
import PlaceListPage from '../features/places/PlaceListPage';

export default function AppRouter() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/places" replace />} />
        <Route path="/places" element={<PlaceListPage />} />
      </Routes>
    </Layout>
  );
}