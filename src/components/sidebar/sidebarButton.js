import React from 'react';
import { NavLink } from 'react-router-dom';
import './sidebarButton.css';

export default function SidebarButton({ to, icon, title }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `btn-body${isActive ? ' active' : ''}`}
      end
    >
      <span className="btn-icon">{icon}</span>
      <span className="btn-text">{title}</span>
    </NavLink>
  );
}
