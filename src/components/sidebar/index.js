import React from 'react';
import './sidebar.css';
import SidebarButton from './sidebarButton';
import { MdLibraryMusic } from "react-icons/md";
import { FaSearch } from 'react-icons/fa';
import { MdSpaceDashboard } from "react-icons/md";
import { HiCloudDownload } from "react-icons/hi";

export default function Sidebar({ onSignOut }) {
  return (
    <div className="sidebar-container">
      <div className="sidebar-group">
        <div className="group-title">MENU</div>
        <SidebarButton title="Feed" to="/feed" icon={<MdSpaceDashboard />} />
        <SidebarButton title="Search" to="/search" icon={<FaSearch />} />
      </div>

      <div className="sidebar-group">
        <div className="group-title">TU MÚSICA</div>
        <SidebarButton title="Biblioteca" to="/library" icon={<MdLibraryMusic />} />
        <SidebarButton title="Importar" to="/import" icon={<HiCloudDownload />} />
      </div>
    </div>
  );
}
