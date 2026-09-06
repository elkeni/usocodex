import './sidebar.css';
import SidebarButton from './sidebarButton';
import { MdLibraryMusic } from "react-icons/md";
import { FaSearch } from 'react-icons/fa';
import { MdSpaceDashboard } from "react-icons/md";

export default function Sidebar() {
  return (
    <nav className="sidebar-container" aria-label="Navegación principal">
      <div className="sidebar-group">
        <div className="group-title">MENÚ</div>
        <SidebarButton title="Descubrir" to="/feed" icon={<MdSpaceDashboard />} />
        <SidebarButton title="Buscar" to="/search" icon={<FaSearch />} />
      </div>

      <div className="sidebar-group">
        <div className="group-title">TU MÚSICA</div>
        <SidebarButton title="Biblioteca" to="/library" icon={<MdLibraryMusic />} />
      </div>
    </nav>
  );
}
