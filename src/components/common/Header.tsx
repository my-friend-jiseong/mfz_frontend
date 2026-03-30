import { NavLink } from 'react-router-dom';

export default function Header() {
  return (
    <header className="app-header">
      <h1>지도기반 외근 도우미</h1>
      <nav>
        <NavLink to="/places">방문지</NavLink>
        <NavLink to="/map">지도</NavLink>
        <NavLink to="/reports">보고서</NavLink>
        <NavLink to="/dashboard">대시보드</NavLink>
      </nav>
    </header>
  );
}