import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Menu from './pages/Menu.jsx';
import Orders from './pages/Orders.jsx';
import ChatBox from './components/ChatBox.jsx';
import BackgroundMusic from './components/BackgroundMusic.jsx';

export default function App() {
  return (
    <>
      <header className="topbar">
        <img className="brand" src="/logo.png" alt="Daniel" />
        <nav>
          <NavLink to="/dashboard">Our Week</NavLink>
          <NavLink to="/orders">Orders</NavLink>
          <NavLink to="/menu">Recipes</NavLink>
        </nav>
        <BackgroundMusic />
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/menu" element={<Menu />} />
        </Routes>
      </main>
      <ChatBox />
      <footer className="footer">
        Made with all my love, just for you{' '}<span className="heart">♥</span>{' '}Daniel
        <p className="credit">
          Music: “Canon in D Major” by{' '}
          <a href="https://incompetech.com" target="_blank" rel="noopener noreferrer">Kevin MacLeod</a>, licensed under{' '}
          <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer">CC BY 3.0</a>
        </p>
      </footer>
    </>
  );
}
