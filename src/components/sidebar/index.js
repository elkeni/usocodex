import React from 'react';
import './sidebar.css';
import SidebarButton from './sidebarButton';
import { IoIosTrendingUp } from "react-icons/io";
import { MdFavorite } from "react-icons/md";
import { MdLibraryMusic } from "react-icons/md";
import { FaSearch } from 'react-icons/fa';
import { MdSpaceDashboard } from "react-icons/md";

export default function Sidebar({ onSignOut }) {
  return (
    <div className="sidebar-container">
      <div className="sidebar-group">
        <div className="group-title">MENU</div>
        <SidebarButton title="Feed" to="/feed" icon={<MdSpaceDashboard />} />
        <SidebarButton title="Search" to="/search" icon={<FaSearch />} />
        <SidebarButton title="Radio" to="/radio" icon={<IoIosTrendingUp />} />
      </div>

      <div className="sidebar-group">
        <div className="group-title">LIBRARY</div>
        <SidebarButton title="Favorites" to="/favorites" icon={<MdFavorite />} />
        <SidebarButton title="Library" to="/library" icon={<MdLibraryMusic />} />
      </div>
    </div>
  );
}
