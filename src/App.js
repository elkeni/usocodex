import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './screens/home/index.js';
import Login from './screens/auth/login.js';       // Verifica que la ruta sea correcta
import Register from './screens/auth/register.js'; // Verifica que la ruta sea correcta
import Callback from './screens/auth/callback.js'; // Si usas callback
import { ProtectedRoute } from './screens/auth/ProtectedRoute';
import './screens/home/home.css';


export default function App() {
  return (
    <Router>
      <Routes>
        {/* === RUTAS PÚBLICAS === */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/callback" element={<Callback />} />

        {/* === RUTAS PRIVADAS === */}
        {/* Cualquier ruta que no sea login/register irá a Home, protegido por Firebase */}
        <Route path="/*" element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        } />
      </Routes>
    </Router>
  );
}