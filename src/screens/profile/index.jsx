import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
    FaTimes,
    FaSignOutAlt,
    FaCheck,
    FaEdit,
    FaCamera,
    FaLock,
    FaPause,
    FaPlay,
    FaTrash
} from 'react-icons/fa';

import './profile.css';
import { useUser } from '../../context/userContext';
import { usePlayer } from '../../context/playerContext';
import { useFeedback } from '../../context/feedbackContext';
import { AuthService } from '../../services/authService';
import PageHeader from '../../components/shared/PageHeader';
import { auth, storage, db } from '../../firebase/config';
import { updateProfile } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { clearProductMetrics, getSuccessSummary } from '../../services/productMetrics';

const Profile = () => {
    const navigate = useNavigate();
    const { user, favorites, playlists, loading: userLoading } = useUser();
    const { listeningHistory, historyPaused, toggleHistoryPaused, clearListeningHistory } = usePlayer();
    const { notify, confirm } = useFeedback();
    const fileInputRef = useRef(null);

    // Estados UI
    const [theme] = useState(() => localStorage.getItem('paradox_theme') || 'dark');
    const [successSummary, setSuccessSummary] = useState(() => getSuccessSummary());

    // Estados de edición
    const [isEditingName, setIsEditingName] = useState(false);
    const [editedName, setEditedName] = useState('');
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [isSavingName, setIsSavingName] = useState(false);

    useEffect(() => {
        document.body.setAttribute('data-theme', theme);
        return () => document.body.removeAttribute('data-theme');
    }, [theme]);

    // Inicializar nombre editado cuando cambie el usuario
    useEffect(() => {
        if (user?.displayName) {
            setEditedName(user.displayName);
        }
    }, [user?.displayName]);

    const showNotification = useCallback((message, type = 'success') => {
        notify(message, { type });
    }, [notify]);

    // Handlers
    const handleClose = () => navigate(-1);

    const handleSignOut = async () => {
        const userName = user?.displayName || user?.email || 'tu cuenta';
        const accepted = await confirm({
            title: 'Cerrar sesión',
            message: `¿Quieres cerrar la sesión de ${userName}?`,
            confirmLabel: 'Cerrar sesión',
            tone: 'danger',
        });
        if (accepted) {
            try {
                await AuthService.logout();
                navigate('/login');
            } catch (error) {
                console.error('Error al cerrar sesión:', error);
                notify('No se pudo cerrar la sesión. Intenta nuevamente.', { type: 'error' });
            }
        }
    };

    // ========== EDICIÓN DE NOMBRE ==========
    const handleStartEditName = () => {
        setEditedName(user?.displayName || '');
        setIsEditingName(true);
    };

    const handleCancelEditName = () => {
        setEditedName(user?.displayName || '');
        setIsEditingName(false);
    };

    const handleSaveName = async () => {
        if (!editedName.trim()) {
            showNotification('El nombre no puede estar vacío', 'error');
            return;
        }

        if (editedName.trim() === user?.displayName) {
            setIsEditingName(false);
            return;
        }

        setIsSavingName(true);
        try {
            // Actualizar en Firebase Auth
            await updateProfile(auth.currentUser, {
                displayName: editedName.trim()
            });

            // Actualizar en Firestore
            const userDocRef = doc(db, 'users', user.uid);
            await updateDoc(userDocRef, {
                username: editedName.trim(),
                displayName: editedName.trim()
            });

            setIsEditingName(false);
            showNotification('Nombre actualizado correctamente');
        } catch (error) {
            console.error('Error updating name:', error);
            showNotification('Error al actualizar el nombre', 'error');
        } finally {
            setIsSavingName(false);
        }
    };

    // ========== CAMBIO DE FOTO DE PERFIL ==========
    const handleAvatarClick = () => {
        if (!isUploadingPhoto) {
            fileInputRef.current?.click();
        }
    };

    // ========== UTILIDAD: Redimensionar y comprimir imagen ==========
    const processImageForUpload = (file, maxSizeBytes = 5 * 1024 * 1024) => {
        return new Promise((resolve, reject) => {
            // Timeout de seguridad de 30 segundos
            const timeout = setTimeout(() => {
                reject(new Error('Timeout: El procesamiento de imagen tardó demasiado'));
            }, 30000);

            try {
                // Crear un Image element para cargar el archivo
                const img = new Image();
                const reader = new FileReader();

                reader.onload = (e) => {
                    img.onload = () => {
                        try {
                            // Función recursiva para comprimir hasta lograr el tamaño deseado
                            const compressWithQuality = (quality, maxDimension) => {
                                try {
                                    const canvas = document.createElement('canvas');
                                    const ctx = canvas.getContext('2d');

                                    if (!ctx) {
                                        clearTimeout(timeout);
                                        reject(new Error('No se pudo crear el contexto del canvas'));
                                        return;
                                    }

                                    // Calcular nuevas dimensiones manteniendo aspect ratio
                                    let { width, height } = img;

                                    // Para avatares, usamos dimensiones más razonables
                                    if (width > maxDimension || height > maxDimension) {
                                        if (width > height) {
                                            height = Math.round((height * maxDimension) / width);
                                            width = maxDimension;
                                        } else {
                                            width = Math.round((width * maxDimension) / height);
                                            height = maxDimension;
                                        }
                                    }

                                    canvas.width = width;
                                    canvas.height = height;

                                    // Dibujar imagen redimensionada
                                    ctx.drawImage(img, 0, 0, width, height);

                                    // Convertir a blob con la calidad especificada
                                    canvas.toBlob(
                                        (blob) => {
                                            if (!blob) {
                                                clearTimeout(timeout);
                                                reject(new Error('Error al procesar la imagen: blob vacío'));
                                                return;
                                            }

                                            console.log(`[Profile] Imagen procesada: ${width}x${height}, calidad: ${quality.toFixed(1)}, tamaño: ${(blob.size / 1024 / 1024).toFixed(2)}MB`);

                                            // Si el blob es menor al máximo, resolver
                                            if (blob.size <= maxSizeBytes) {
                                                clearTimeout(timeout);
                                                resolve(blob);
                                            } else if (quality > 0.2) {
                                                // Reducir calidad y reintentar
                                                compressWithQuality(quality - 0.1, maxDimension);
                                            } else if (maxDimension > 300) {
                                                // Si ya estamos en calidad baja, reducir dimensiones
                                                compressWithQuality(0.8, maxDimension - 150);
                                            } else {
                                                // Último recurso: devolver la imagen más pequeña posible
                                                clearTimeout(timeout);
                                                resolve(blob);
                                            }
                                        },
                                        'image/jpeg',
                                        quality
                                    );
                                } catch (canvasError) {
                                    clearTimeout(timeout);
                                    console.error('[Profile] Error en canvas:', canvasError);
                                    reject(canvasError);
                                }
                            };

                            // Iniciar compresión con calidad alta y dimensión máxima razonable para avatar (250px)
                            compressWithQuality(0.9, 250);
                        } catch (processError) {
                            clearTimeout(timeout);
                            console.error('[Profile] Error procesando imagen:', processError);
                            reject(processError);
                        }
                    };

                    img.onerror = (imgError) => {
                        clearTimeout(timeout);
                        console.error('[Profile] Error cargando imagen en canvas:', imgError);
                        reject(new Error('Error al cargar la imagen'));
                    };

                    img.src = e.target.result;
                };

                reader.onerror = (readerError) => {
                    clearTimeout(timeout);
                    console.error('[Profile] Error leyendo archivo:', readerError);
                    reject(new Error('Error al leer el archivo'));
                };

                reader.readAsDataURL(file);
            } catch (outerError) {
                clearTimeout(timeout);
                console.error('[Profile] Error general en processImageForUpload:', outerError);
                reject(outerError);
            }
        });
    };

    const handleFileSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validar tipo de archivo
        if (!file.type.startsWith('image/')) {
            showNotification('Por favor selecciona una imagen', 'error');
            return;
        }

        setIsUploadingPhoto(true);

        try {
            // Procesar imagen: redimensionar y comprimir automáticamente
            console.log(`[Profile] Iniciando procesamiento de imagen: ${file.name}, ${(file.size / 1024 / 1024).toFixed(2)}MB`);

            let processedBlob;
            try {
                processedBlob = await processImageForUpload(file);
                console.log(`[Profile] Imagen procesada exitosamente: ${(processedBlob.size / 1024 / 1024).toFixed(2)}MB`);
            } catch (processError) {
                console.error('[Profile] Error al procesar imagen, intentando subir original:', processError);
                // Si el procesamiento falla pero el archivo es pequeño, intenta subir el original
                if (file.size <= 5 * 1024 * 1024) {
                    processedBlob = file;
                } else {
                    throw new Error('No se pudo procesar la imagen. Por favor intenta con otra.', { cause: processError });
                }
            }

            // Crear nombre de archivo para el blob procesado
            const fileName = `avatar_${Date.now()}.jpg`;
            console.log(`[Profile] Subiendo a Firebase Storage: avatars/${user.uid}/${fileName}`);

            // Crear referencia en Storage
            const storageRef = ref(storage, `avatars/${user.uid}/${fileName}`);

            // Subir archivo procesado
            await uploadBytes(storageRef, processedBlob, {
                contentType: 'image/jpeg'
            });
            console.log('[Profile] Subida a Storage completada');

            // Obtener URL de descarga
            const downloadURL = await getDownloadURL(storageRef);
            console.log('[Profile] URL obtenida:', downloadURL);

            // Actualizar en Firebase Auth
            await updateProfile(auth.currentUser, {
                photoURL: downloadURL
            });
            console.log('[Profile] Firebase Auth actualizado');

            // Actualizar en Firestore
            const userDocRef = doc(db, 'users', user.uid);
            await updateDoc(userDocRef, {
                avatar: downloadURL,
                photoURL: downloadURL
            });
            console.log('[Profile] Firestore actualizado');

            showNotification('Foto de perfil actualizada');
        } catch (error) {
            console.error('[Profile] Error en handleFileSelect:', error);
            showNotification(error.message || 'Error al subir la imagen', 'error');
        } finally {
            setIsUploadingPhoto(false);
            // Limpiar input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleClearHistory = async () => {
        const accepted = await confirm({
            title: 'Borrar historial',
            message: 'Se eliminarán las escuchas guardadas en este dispositivo. Tus favoritos no cambian.',
            confirmLabel: 'Borrar historial',
            tone: 'danger',
        });
        if (accepted) {
            clearListeningHistory();
            showNotification('Historial borrado');
        }
    };

    const handleClearMetrics = () => {
        clearProductMetrics();
        setSuccessSummary(getSuccessSummary());
        showNotification('Contadores locales borrados');
    };

    // Helpers
    const formatNumber = (num) => new Intl.NumberFormat('es-ES').format(num || 0);

    const getJoinYear = () => {
        if (user?.metadata?.creationTime) {
            return new Date(user.metadata.creationTime).getFullYear();
        }
        return new Date().getFullYear();
    };

    const getUserInitial = () => {
        if (user?.displayName) return user.displayName.charAt(0).toUpperCase();
        if (user?.email) return user.email.charAt(0).toUpperCase();
        return '?';
    };

    // Loading state
    if (userLoading) {
        return createPortal(
            <div className="profile-wrapper">
                <div className="profile-loading">
                    <div className="loading-spinner" />
                    <span>Cargando perfil...</span>
                </div>
            </div>,
            document.body
        );
    }

    return createPortal(
        <div className="profile-wrapper">
            {/* Header */}
            <PageHeader
                title="Perfil"
                onClose={handleClose}
                className="profile-page-header"
                sticky={false}
            />

            {/* Content */}
            <div className="profile-content">
                {/* Sidebar / User Card */}
                <aside className="profile-sidebar">
                    <div className="profile-user-card">
                        {/* Avatar (Editable only in Edit Mode) */}
                        <div
                            className={`profile-avatar ${isEditingName ? 'editable' : ''}`}
                            onClick={isEditingName ? handleAvatarClick : undefined}
                            style={{ cursor: isEditingName ? 'pointer' : 'default' }}
                        >
                            {user?.photoURL ? (
                                <img src={user.photoURL} alt="Avatar" />
                            ) : (
                                <span className="profile-avatar-initial">{getUserInitial()}</span>
                            )}

                            {/* Overlay de edición explícito */}
                            {isEditingName && (
                                <div className="profile-avatar-edit-overlay">
                                    <FaCamera />
                                    <span>Cambiar</span>
                                </div>
                            )}

                        </div>

                        {/* Input de archivo oculto */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileSelect}
                            style={{ display: 'none' }}
                        />

                        <div className="profile-user-info">
                            {/* Nombre editable (Solo activado desde Ajustes) */}
                            {isEditingName ? (
                                <div className="profile-edit-container">
                                    <div className="profile-name-edit">
                                        <input
                                            type="text"
                                            value={editedName}
                                            onChange={(e) => setEditedName(e.target.value)}
                                            className="profile-name-input"
                                            placeholder="Tu nombre"
                                            autoFocus
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleSaveName();
                                                if (e.key === 'Escape') handleCancelEditName();
                                            }}
                                        />
                                        <div className="profile-name-actions">
                                            <button
                                                className="profile-name-btn save"
                                                onClick={handleSaveName}
                                                disabled={isSavingName}
                                            >
                                                {isSavingName ? (
                                                    <div className="btn-spinner" />
                                                ) : (
                                                    <FaCheck />
                                                )}
                                            </button>
                                            <button
                                                className="profile-name-btn cancel"
                                                onClick={handleCancelEditName}
                                                disabled={isSavingName}
                                            >
                                                <FaTimes />
                                            </button>
                                        </div>
                                    </div>

                                </div>
                            ) : (
                                <div className="profile-name-display">
                                    <h2 className="profile-user-name">
                                        {user?.displayName || 'Usuario'}
                                    </h2>
                                </div>
                            )}
                            <p className="profile-user-email">{user?.email}</p>

                            {/* Badge de privacidad (Solo cuando NO se edita) */}
                            {!isEditingName && (
                                <div className="profile-privacy-badge private">
                                    <FaLock />
                                    <span>Perfil privado</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="profile-stats">
                        <div className="profile-stat">
                            <span className="profile-stat-value">{formatNumber(favorites?.length || 0)}</span>
                            <span className="profile-stat-label">Canciones</span>
                        </div>
                        <div className="profile-stat">
                            <span className="profile-stat-value">{formatNumber(playlists?.length || 0)}</span>
                            <span className="profile-stat-label">Playlists</span>
                        </div>
                        <div className="profile-stat">
                            <span className="profile-stat-value">{getJoinYear()}</span>
                            <span className="profile-stat-label">Miembro</span>
                        </div>
                    </div>


                </aside>

                {/* Main Area */}
                <main className="profile-main">
                    {/* Settings Content (Formerly a tab, now the only content) */}
                    <div className="profile-tab-content">
                        <section className="profile-section">
                            {/* Sección de Perfil */}
                            <h3 className="profile-section-title">Tu Perfil</h3>

                            <div className="profile-settings-list">
                                {/* Editar Perfil (Activa modo edición para nombre y foto) */}
                                <button type="button" className="profile-setting clickable" onClick={handleStartEditName}>
                                    <div className="profile-setting-header">
                                        <div className="profile-setting-icon">
                                            <FaEdit />
                                        </div>
                                        <div className="profile-setting-info">
                                            <h4>Editar perfil</h4>
                                            <p className="profile-setting-desc">
                                                Cambiar nombre y foto
                                            </p>
                                        </div>
                                        <FaEdit className="profile-setting-action" />
                                    </div>
                                </button>
                            </div>

                            <h3 className="profile-section-title" style={{ marginTop: '32px' }}>Privacidad y datos</h3>

                            <div className="profile-settings-list">
                                <div className="profile-setting">
                                    <div className="profile-setting-header">
                                        <div className="profile-setting-icon"><FaLock /></div>
                                        <div className="profile-setting-info">
                                            <h4>Perfil privado por ahora</h4>
                                            <p className="profile-setting-desc">No existen perfiles públicos ni actividad social visible en esta versión.</p>
                                        </div>
                                    </div>
                                </div>

                                <button type="button" className="profile-setting clickable" onClick={toggleHistoryPaused}>
                                    <div className="profile-setting-header">
                                        <div className="profile-setting-icon">{historyPaused ? <FaPlay /> : <FaPause />}</div>
                                        <div className="profile-setting-info">
                                            <h4>{historyPaused ? 'Reanudar historial' : 'Pausar historial'}</h4>
                                            <p className="profile-setting-desc">
                                                {historyPaused ? 'Las nuevas escuchas no se están guardando.' : `${listeningHistory.length} escuchas útiles guardadas en este dispositivo.`}
                                            </p>
                                        </div>
                                    </div>
                                </button>

                                <button type="button" className="profile-setting clickable" onClick={handleClearHistory} disabled={!listeningHistory.length}>
                                    <div className="profile-setting-header">
                                        <div className="profile-setting-icon"><FaTrash /></div>
                                        <div className="profile-setting-info">
                                            <h4>Borrar historial</h4>
                                            <p className="profile-setting-desc">Elimina las escuchas locales sin tocar favoritos ni playlists.</p>
                                        </div>
                                    </div>
                                </button>

                                <div className="profile-setting">
                                    <div className="profile-setting-header">
                                        <div className="profile-setting-icon"><FaCheck /></div>
                                        <div className="profile-setting-info">
                                            <h4>Medición privada en este dispositivo</h4>
                                            <p className="profile-setting-desc">
                                                {successSummary.meaningfulPlayback} escuchas de 30 s · {successSummary.radioStarted} radios · {successSummary.magicPlaylists} playlists mágicas. No guardamos canciones, búsquedas, URLs ni tu identidad.
                                            </p>
                                        </div>
                                    </div>
                                    <button type="button" className="profile-inline-action" onClick={handleClearMetrics}>Borrar contadores</button>
                                </div>
                            </div>

                            {/* Zona de Peligro / Sesión */}
                            <h3 className="profile-section-title" style={{ marginTop: '32px', color: 'var(--profile-danger)' }}>Sesión</h3>

                            <div className="profile-settings-list">
                                <button type="button" className="profile-setting clickable" onClick={handleSignOut} style={{ border: '1px solid var(--profile-danger)' }}>
                                    <div className="profile-setting-header">
                                        <div className="profile-setting-icon" style={{ color: 'var(--profile-danger)', background: 'rgba(231, 76, 60, 0.1)' }}>
                                            <FaSignOutAlt />
                                        </div>
                                        <div className="profile-setting-info">
                                            <h4 style={{ color: 'var(--profile-danger)' }}>Cerrar sesión</h4>
                                            <p className="profile-setting-desc">
                                                Sal de tu cuenta actual
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            </div>
                        </section>
                    </div>
                </main>
            </div>
        </div>,
        document.body
    );
};

export default Profile;
