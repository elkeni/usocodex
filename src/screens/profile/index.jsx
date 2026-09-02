import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
    FaSignOutAlt,
    FaEdit,
    FaCamera,
    FaLock,
    FaPause,
    FaPlay,
    FaTrash,
    FaSlidersH,
    FaChevronRight,
    FaHeadphonesAlt,
    FaVolumeUp,
    FaEye,
    FaDatabase,
    FaUserShield,
    FaCompactDisc,
    FaCalendarAlt,
    FaBolt
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
import {
    getAudioQualityPreference,
    getResolvedAudioQualityMode,
    setAudioQualityPreference as persistAudioQualityPreference,
} from '../../services/audioQuality';
import {
    getReducedMotionPreference,
    setReducedMotionPreference as persistReducedMotionPreference,
} from '../../services/experiencePreferences';
import { playbackPrefetchService } from '../../services/playbackPrefetchService';
import { clearAudioUrlCache } from '../../services/unifiedService';

const Profile = () => {
    const navigate = useNavigate();
    const { user, favorites, playlists, savedAlbums, loading: userLoading } = useUser();
    const {
        listeningHistory,
        historyPaused,
        toggleHistoryPaused,
        clearListeningHistory,
        currentAudioQuality,
        isCrossfadeEnabled,
        toggleCrossfade,
    } = usePlayer();
    const { notify, confirm } = useFeedback();
    const fileInputRef = useRef(null);

    // Estados UI
    const [successSummary, setSuccessSummary] = useState(() => getSuccessSummary());
    const [audioQualityPreference, setAudioQualityPreference] = useState(getAudioQualityPreference);
    const [reducedMotion, setReducedMotion] = useState(getReducedMotionPreference);

    // Estados de edición
    const [isEditingName, setIsEditingName] = useState(false);
    const [editedName, setEditedName] = useState('');
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [isSavingName, setIsSavingName] = useState(false);

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

    const handleAudioQualityChange = (value) => {
        const preference = persistAudioQualityPreference(value);
        setAudioQualityPreference(preference);
        notify('Calidad de reproducción actualizada.', { type: 'success' });
    };

    const handleReducedMotionChange = () => {
        const nextValue = persistReducedMotionPreference(!reducedMotion);
        setReducedMotion(nextValue);
        notify(nextValue ? 'Animaciones reducidas.' : 'Animaciones completas activadas.', { type: 'success' });
    };

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
        const normalizedName = editedName.trim().replace(/\s+/g, ' ');
        if (!normalizedName) {
            showNotification('El nombre no puede estar vacío', 'error');
            return;
        }

        if (normalizedName.length > 40) {
            showNotification('El nombre puede tener hasta 40 caracteres', 'error');
            return;
        }

        if (normalizedName === user?.displayName) {
            setIsEditingName(false);
            return;
        }

        setIsSavingName(true);
        try {
            // Actualizar en Firebase Auth
            await updateProfile(auth.currentUser, {
                displayName: normalizedName
            });

            // Actualizar en Firestore
            const userDocRef = doc(db, 'users', user.uid);
            await updateDoc(userDocRef, {
                username: normalizedName,
                displayName: normalizedName
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

    const handleClearPlaybackCache = () => {
        playbackPrefetchService.clear();
        clearAudioUrlCache();
        showNotification('Caché temporal de reproducción liberada');
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

    const resolvedAudioQualityMode = getResolvedAudioQualityMode();
    const resolvedAudioQualityLabel = {
        high: 'Alta',
        balanced: 'Equilibrada',
        data_saver: 'Ahorro de datos',
    }[resolvedAudioQualityMode] || 'Equilibrada';

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

            <div className="profile-content">
                <section className="profile-identity-card" aria-label="Información de la cuenta">
                    <div className="profile-identity-glow" aria-hidden="true" />
                    <button
                        type="button"
                        className="profile-avatar profile-avatar--button"
                        onClick={handleAvatarClick}
                        disabled={isUploadingPhoto}
                        aria-label="Cambiar foto de perfil"
                    >
                        {user?.photoURL ? <img src={user.photoURL} alt="" /> : <span className="profile-avatar-initial">{getUserInitial()}</span>}
                        <span className="profile-avatar-edit-overlay">
                            {isUploadingPhoto ? <span className="btn-spinner" /> : <FaCamera />}
                        </span>
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} hidden />

                    <div className="profile-user-info">
                        {isEditingName ? (
                            <div className="profile-edit-container">
                                <label htmlFor="profile-display-name">Nombre visible</label>
                                <input
                                    id="profile-display-name"
                                    type="text"
                                    value={editedName}
                                    onChange={(event) => setEditedName(event.target.value)}
                                    className="profile-name-input"
                                    placeholder="Tu nombre"
                                    maxLength={40}
                                    autoFocus
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') handleSaveName();
                                        if (event.key === 'Escape') handleCancelEditName();
                                    }}
                                />
                                <div className="profile-edit-footer">
                                    <span>{editedName.trim().length}/40</span>
                                    <div className="profile-name-actions">
                                        <button type="button" className="profile-name-btn cancel" onClick={handleCancelEditName} disabled={isSavingName}>Cancelar</button>
                                        <button type="button" className="profile-name-btn save" onClick={handleSaveName} disabled={isSavingName || !editedName.trim()}>
                                            {isSavingName ? <span className="btn-spinner" /> : 'Guardar'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="profile-name-line">
                                    <h1 className="profile-user-name">{user?.displayName || 'Usuario'}</h1>
                                    <button type="button" className="profile-edit-name-button" onClick={handleStartEditName} aria-label="Editar nombre"><FaEdit /></button>
                                </div>
                                <p className="profile-user-email">{user?.email}</p>
                                <div className="profile-privacy-badge"><FaUserShield /><span>Cuenta privada</span></div>
                            </>
                        )}
                    </div>
                </section>

                <section className="profile-stats" aria-label="Resumen de la biblioteca">
                    <div className="profile-stat"><FaHeadphonesAlt /><span className="profile-stat-value">{formatNumber(favorites?.length || 0)}</span><span className="profile-stat-label">Canciones</span></div>
                    <div className="profile-stat"><FaPlay /><span className="profile-stat-value">{formatNumber(playlists?.length || 0)}</span><span className="profile-stat-label">Playlists</span></div>
                    <div className="profile-stat"><FaCompactDisc /><span className="profile-stat-value">{formatNumber(savedAlbums?.length || 0)}</span><span className="profile-stat-label">Álbumes</span></div>
                    <div className="profile-stat"><FaCalendarAlt /><span className="profile-stat-value">{getJoinYear()}</span><span className="profile-stat-label">Desde</span></div>
                </section>

                <main className="profile-main">
                    <section className="profile-section">
                        <div className="profile-section-heading"><div><span>SONIDO</span><h2>Reproducción</h2></div><FaHeadphonesAlt /></div>
                        <div className="profile-panel profile-quality-panel">
                            <div className="profile-setting-header">
                                <div className="profile-setting-icon"><FaSlidersH /></div>
                                <div className="profile-setting-info"><h3>Calidad de audio</h3><p>Se aplica a las siguientes canciones.</p></div>
                            </div>
                            <div className="profile-quality-options" role="radiogroup" aria-label="Calidad de audio">
                                {[
                                    { value: 'automatic', label: 'Automática', detail: 'Se adapta a tu conexión' },
                                    { value: 'high', label: 'Alta', detail: 'Hasta 320 kbps' },
                                    { value: 'data_saver', label: 'Ahorro', detail: '96 kbps' },
                                ].map((option) => (
                                    <button key={option.value} type="button" role="radio" aria-checked={audioQualityPreference === option.value} className={`profile-quality-option ${audioQualityPreference === option.value ? 'active' : ''}`} onClick={() => handleAudioQualityChange(option.value)}>
                                        <span>{option.label}</span><small>{option.detail}</small>
                                    </button>
                                ))}
                            </div>
                            <p className="profile-quality-status">Modo resuelto: {resolvedAudioQualityLabel}{currentAudioQuality ? ` · ${currentAudioQuality}` : ''}</p>
                        </div>

                        <button type="button" className="profile-setting clickable" onClick={toggleCrossfade} aria-pressed={isCrossfadeEnabled}>
                            <span className="profile-setting-icon"><FaVolumeUp /></span>
                            <span className="profile-setting-info"><strong>Transiciones suaves</strong><small>Mezcla el final y el inicio entre canciones cuando la app está visible.</small></span>
                            <span className={`profile-toggle ${isCrossfadeEnabled ? 'active' : ''}`} aria-hidden="true"><span /></span>
                        </button>
                        <button type="button" className="profile-setting clickable" onClick={handleClearPlaybackCache}>
                            <span className="profile-setting-icon"><FaBolt /></span>
                            <span className="profile-setting-info"><strong>Liberar caché temporal</strong><small>Fuerza URLs nuevas sin detener la canción actual.</small></span>
                            <FaChevronRight className="profile-setting-action" />
                        </button>
                    </section>

                    <section className="profile-section">
                        <div className="profile-section-heading"><div><span>COMODIDAD</span><h2>Experiencia</h2></div><FaEye /></div>
                        <button type="button" className="profile-setting clickable" onClick={handleReducedMotionChange} aria-pressed={reducedMotion}>
                            <span className="profile-setting-icon"><FaEye /></span>
                            <span className="profile-setting-info"><strong>Reducir animaciones</strong><small>Disminuye movimientos, brillos y transiciones en toda la aplicación.</small></span>
                            <span className={`profile-toggle ${reducedMotion ? 'active' : ''}`} aria-hidden="true"><span /></span>
                        </button>
                    </section>

                    <section className="profile-section">
                        <div className="profile-section-heading"><div><span>CONTROL</span><h2>Privacidad y datos</h2></div><FaLock /></div>
                        <div className="profile-privacy-note"><FaUserShield /><div><strong>Tu actividad es privada</strong><p>No hay perfiles públicos ni actividad social visible.</p></div></div>
                        <button type="button" className="profile-setting clickable" onClick={toggleHistoryPaused} aria-pressed={historyPaused}>
                            <span className="profile-setting-icon">{historyPaused ? <FaPlay /> : <FaPause />}</span>
                            <span className="profile-setting-info"><strong>{historyPaused ? 'Reanudar historial' : 'Pausar historial'}</strong><small>{historyPaused ? 'Las nuevas escuchas no se guardan.' : `${listeningHistory.length} escuchas guardadas en este dispositivo.`}</small></span>
                            <span className={`profile-toggle ${!historyPaused ? 'active' : ''}`} aria-hidden="true"><span /></span>
                        </button>
                        <button type="button" className="profile-setting clickable" onClick={handleClearHistory} disabled={!listeningHistory.length}>
                            <span className="profile-setting-icon profile-setting-icon--danger"><FaTrash /></span>
                            <span className="profile-setting-info"><strong>Borrar historial</strong><small>No elimina favoritos, álbumes ni playlists.</small></span>
                            <FaChevronRight className="profile-setting-action" />
                        </button>
                        <div className="profile-panel profile-metrics-card">
                            <div><FaDatabase /><strong>Medición privada local</strong></div>
                            <p>{successSummary.meaningfulPlayback} escuchas de 30 s · {successSummary.radioStarted} radios · {successSummary.magicPlaylists} playlists mágicas.</p>
                            <button type="button" onClick={handleClearMetrics}>Borrar contadores locales</button>
                        </div>
                    </section>

                    <section className="profile-section profile-session-section">
                        <div className="profile-section-heading"><div><span>CUENTA</span><h2>Sesión</h2></div></div>
                        <button type="button" className="profile-setting clickable profile-setting--danger" onClick={handleSignOut}>
                            <span className="profile-setting-icon"><FaSignOutAlt /></span>
                            <span className="profile-setting-info"><strong>Cerrar sesión</strong><small>Salir de {user?.email || 'esta cuenta'}.</small></span>
                            <FaChevronRight className="profile-setting-action" />
                        </button>
                    </section>
                </main>
            </div>
        </div>,
        document.body
    );
};

export default Profile;
