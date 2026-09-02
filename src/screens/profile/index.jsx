import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
    FaSignOutAlt,
    FaEdit,
    FaCamera,
    FaTimes,
    FaCheckCircle,
    FaEnvelope,
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
    FaBolt,
    FaCloudDownloadAlt,
    FaCog,
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
    getSmartPrefetchPreference,
    setReducedMotionPreference as persistReducedMotionPreference,
    setSmartPrefetchPreference as persistSmartPrefetchPreference,
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
        clearPlaybackCacheState,
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
    const [smartPrefetch, setSmartPrefetch] = useState(getSmartPrefetchPreference);

    // Estados de edición
    const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
    const [isEditingName, setIsEditingName] = useState(false);
    const [editedName, setEditedName] = useState('');
    const [displayNamePreview, setDisplayNamePreview] = useState('');
    const [photoPreview, setPhotoPreview] = useState('');
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [isSavingName, setIsSavingName] = useState(false);

    // Inicializar nombre editado cuando cambie el usuario
    useEffect(() => {
        const nextName = user?.displayName || '';
        setEditedName(nextName);
        setDisplayNamePreview(nextName);
        setPhotoPreview(user?.photoURL || '');
    }, [user?.displayName, user?.photoURL]);

    useEffect(() => {
        if (!isEditProfileOpen) return undefined;
        const closeOnEscape = (event) => {
            if (event.key === 'Escape' && !isSavingName && !isUploadingPhoto) {
                setIsEditProfileOpen(false);
                setIsEditingName(false);
            }
        };
        document.addEventListener('keydown', closeOnEscape);
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, [isEditProfileOpen, isSavingName, isUploadingPhoto]);

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

    const handleSmartPrefetchChange = () => {
        const nextValue = persistSmartPrefetchPreference(!smartPrefetch);
        setSmartPrefetch(nextValue);
        if (!nextValue) playbackPrefetchService.clear();
        notify(nextValue ? 'Precarga inteligente activada.' : 'Precarga inteligente desactivada.', { type: 'success' });
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
        setEditedName(displayNamePreview || user?.displayName || '');
        setIsEditingName(true);
        setIsEditProfileOpen(true);
    };

    const handleCancelEditName = () => {
        setEditedName(displayNamePreview || user?.displayName || '');
        setIsEditingName(false);
        setIsEditProfileOpen(false);
    };

    const handleSaveName = async () => {
        const normalizedName = editedName.trim().replace(/\s+/g, ' ');
        if (!normalizedName) {
            showNotification('El nombre no puede estar vacío', 'error');
            return false;
        }

        if (normalizedName.length > 40) {
            showNotification('El nombre puede tener hasta 40 caracteres', 'error');
            return false;
        }

        if (normalizedName === displayNamePreview) {
            setIsEditingName(false);
            setIsEditProfileOpen(false);
            return true;
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

            setDisplayNamePreview(normalizedName);
            setIsEditingName(false);
            setIsEditProfileOpen(false);
            showNotification('Nombre actualizado correctamente');
            return true;
        } catch (error) {
            console.error('Error updating name:', error);
            showNotification('Error al actualizar el nombre', 'error');
            return false;
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

            setPhotoPreview(downloadURL);
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
        clearPlaybackCacheState();
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
        if (displayNamePreview) return displayNamePreview.charAt(0).toUpperCase();
        if (user?.email) return user.email.charAt(0).toUpperCase();
        return '?';
    };

    const getJoinLabel = () => {
        if (!user?.metadata?.creationTime) return `Desde ${getJoinYear()}`;
        return `Desde ${new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric' }).format(new Date(user.metadata.creationTime))}`;
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
            <PageHeader title="Tu perfil" onClose={handleClose} className="profile-page-header" sticky={false} />

            <div className="profile-content">
                <section className="profile-hero" aria-label="Información de la cuenta">
                    <div className="profile-hero-orb profile-hero-orb--one" aria-hidden="true" />
                    <div className="profile-hero-orb profile-hero-orb--two" aria-hidden="true" />
                    <button type="button" className="profile-avatar profile-avatar--button" onClick={handleStartEditName} aria-label="Editar perfil">
                        {photoPreview ? <img src={photoPreview} alt="" /> : <span className="profile-avatar-initial">{getUserInitial()}</span>}
                        <span className="profile-avatar-status" aria-hidden="true" />
                    </button>

                    <div className="profile-user-info">
                        <p className="profile-eyebrow">MI CUENTA</p>
                        <h1 className="profile-user-name">{displayNamePreview || 'Usuario'}</h1>
                        <p className="profile-user-email">{user?.email}</p>
                        <div className="profile-badges">
                            <span><FaUserShield /> Privada</span>
                            <span><FaCalendarAlt /> {getJoinLabel()}</span>
                        </div>
                    </div>

                    <button type="button" className="profile-edit-button" onClick={handleStartEditName}>
                        <FaEdit aria-hidden="true" />
                        <span>Editar perfil</span>
                    </button>
                </section>

                <section className="profile-stats" aria-label="Resumen de tu biblioteca">
                    <div className="profile-stat"><span className="profile-stat-icon"><FaHeadphonesAlt /></span><strong>{formatNumber(favorites?.length || 0)}</strong><small>Canciones</small></div>
                    <div className="profile-stat"><span className="profile-stat-icon"><FaPlay /></span><strong>{formatNumber(playlists?.length || 0)}</strong><small>Playlists</small></div>
                    <div className="profile-stat"><span className="profile-stat-icon"><FaCompactDisc /></span><strong>{formatNumber(savedAlbums?.length || 0)}</strong><small>Álbumes</small></div>
                </section>

                <main className="profile-main">
                    <section className="profile-section profile-section--wide">
                        <div className="profile-section-heading"><div><span>PREFERENCIAS</span><h2>Reproducción</h2><p>Ajusta el sonido y el consumo de datos.</p></div><FaHeadphonesAlt /></div>
                        <div className="profile-panel profile-quality-panel">
                            <div className="profile-setting-header">
                                <span className="profile-setting-icon profile-setting-icon--accent"><FaSlidersH /></span>
                                <span className="profile-setting-info"><strong>Calidad de audio</strong><small>El cambio se aplicará al reproducir la siguiente canción.</small></span>
                                <span className="profile-current-value">{resolvedAudioQualityLabel}</span>
                            </div>
                            <div className="profile-quality-options" role="radiogroup" aria-label="Calidad de audio">
                                {[
                                    { value: 'automatic', label: 'Automática', detail: 'Wi-Fi y datos' },
                                    { value: 'high', label: 'Alta', detail: 'Hasta 320 kbps' },
                                    { value: 'data_saver', label: 'Ahorro', detail: '96 kbps' },
                                ].map((option) => (
                                    <button key={option.value} type="button" role="radio" aria-checked={audioQualityPreference === option.value} className={`profile-quality-option ${audioQualityPreference === option.value ? 'active' : ''}`} onClick={() => handleAudioQualityChange(option.value)}>
                                        <span className="profile-radio-dot" aria-hidden="true" />
                                        <span><strong>{option.label}</strong><small>{option.detail}</small></span>
                                    </button>
                                ))}
                            </div>
                            {currentAudioQuality && <p className="profile-quality-status"><FaCheckCircle /> Reproduciendo ahora a {currentAudioQuality}</p>}
                        </div>

                        <div className="profile-settings-group">
                            <button type="button" className="profile-setting" onClick={toggleCrossfade} aria-pressed={isCrossfadeEnabled}>
                                <span className="profile-setting-icon"><FaVolumeUp /></span>
                                <span className="profile-setting-info"><strong>Transiciones suaves</strong><small>Mezcla brevemente canciones compatibles.</small></span>
                                <span className={`profile-toggle ${isCrossfadeEnabled ? 'active' : ''}`} aria-hidden="true"><span /></span>
                            </button>
                            <button type="button" className="profile-setting" onClick={handleSmartPrefetchChange} aria-pressed={smartPrefetch}>
                                <span className="profile-setting-icon"><FaCloudDownloadAlt /></span>
                                <span className="profile-setting-info"><strong>Precarga inteligente</strong><small>Prepara las próximas canciones para reducir esperas.</small></span>
                                <span className={`profile-toggle ${smartPrefetch ? 'active' : ''}`} aria-hidden="true"><span /></span>
                            </button>
                        </div>
                    </section>

                    <section className="profile-section">
                        <div className="profile-section-heading"><div><span>COMODIDAD</span><h2>Experiencia</h2><p>Adapta la interfaz a tu forma de usarla.</p></div><FaEye /></div>
                        <div className="profile-settings-group">
                            <button type="button" className="profile-setting" onClick={handleReducedMotionChange} aria-pressed={reducedMotion}>
                                <span className="profile-setting-icon"><FaEye /></span>
                                <span className="profile-setting-info"><strong>Reducir animaciones</strong><small>Disminuye movimientos y brillos en toda la app.</small></span>
                                <span className={`profile-toggle ${reducedMotion ? 'active' : ''}`} aria-hidden="true"><span /></span>
                            </button>
                            <button type="button" className="profile-setting" onClick={handleClearPlaybackCache}>
                                <span className="profile-setting-icon"><FaBolt /></span>
                                <span className="profile-setting-info"><strong>Renovar audio temporal</strong><small>Úsalo si una canción dejó de cargar correctamente.</small></span>
                                <FaChevronRight className="profile-setting-action" />
                            </button>
                        </div>
                    </section>

                    <section className="profile-section">
                        <div className="profile-section-heading"><div><span>PRIVACIDAD</span><h2>Actividad y datos</h2><p>Tú decides qué se conserva en el dispositivo.</p></div><FaLock /></div>
                        <div className="profile-privacy-note"><FaUserShield /><div><strong>Tu actividad no es pública</strong><p>El historial y los contadores de uso se mantienen únicamente para personalizar tu experiencia.</p></div></div>
                        <div className="profile-settings-group">
                            <button type="button" className="profile-setting" onClick={toggleHistoryPaused} aria-pressed={!historyPaused}>
                                <span className="profile-setting-icon">{historyPaused ? <FaPause /> : <FaPlay />}</span>
                                <span className="profile-setting-info"><strong>Guardar historial</strong><small>{historyPaused ? 'Pausado: las nuevas escuchas no se guardan.' : `Activo: ${listeningHistory.length} escuchas en este dispositivo.`}</small></span>
                                <span className={`profile-toggle ${!historyPaused ? 'active' : ''}`} aria-hidden="true"><span /></span>
                            </button>
                            <button type="button" className="profile-setting" onClick={handleClearHistory} disabled={!listeningHistory.length}>
                                <span className="profile-setting-icon profile-setting-icon--danger"><FaTrash /></span>
                                <span className="profile-setting-info"><strong>Borrar historial</strong><small>Tus favoritos, álbumes y playlists no cambian.</small></span>
                                <FaChevronRight className="profile-setting-action" />
                            </button>
                        </div>
                        <details className="profile-data-details">
                            <summary><span><FaDatabase /> Datos de uso locales</span><FaChevronRight /></summary>
                            <div className="profile-data-details__body">
                                <p>{successSummary.meaningfulPlayback} escuchas completas · {successSummary.radioStarted} radios iniciadas · {successSummary.magicPlaylists} playlists creadas.</p>
                                <button type="button" onClick={handleClearMetrics}>Borrar estos contadores</button>
                            </div>
                        </details>
                    </section>

                    <section className="profile-section profile-section--wide profile-session-section">
                        <div className="profile-section-heading"><div><span>CUENTA</span><h2>Acceso</h2><p>Información de inicio de sesión.</p></div><FaCog /></div>
                        <div className="profile-account-card">
                            <span className="profile-setting-icon"><FaEnvelope /></span>
                            <span className="profile-setting-info"><strong>{user?.email || 'Correo no disponible'}</strong><small>{user?.emailVerified ? 'Correo verificado' : 'Correo de acceso'}</small></span>
                            {user?.emailVerified && <FaCheckCircle className="profile-verified-icon" aria-label="Correo verificado" />}
                        </div>
                        <button type="button" className="profile-signout-button" onClick={handleSignOut}><FaSignOutAlt /><span>Cerrar sesión</span></button>
                        <p className="profile-version">ParadisQuo · experiencia personal de música</p>
                    </section>
                </main>
            </div>

            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileSelect} hidden />

            {isEditProfileOpen && (
                <div className="profile-editor-backdrop" role="presentation" onMouseDown={(event) => {
                    if (event.target === event.currentTarget && !isSavingName && !isUploadingPhoto) handleCancelEditName();
                }}>
                    <section className="profile-editor" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title">
                        <div className="profile-editor-handle" aria-hidden="true" />
                        <header className="profile-editor-header">
                            <div><span>CUENTA</span><h2 id="profile-editor-title">Editar perfil</h2></div>
                            <button type="button" onClick={handleCancelEditName} disabled={isSavingName || isUploadingPhoto} aria-label="Cerrar editor"><FaTimes /></button>
                        </header>
                        <div className="profile-editor-avatar-wrap">
                            <button type="button" className="profile-avatar profile-avatar--editor" onClick={handleAvatarClick} disabled={isUploadingPhoto} aria-label="Seleccionar nueva foto">
                                {photoPreview ? <img src={photoPreview} alt="" /> : <span className="profile-avatar-initial">{getUserInitial()}</span>}
                                {isUploadingPhoto && <span className="profile-avatar-loading"><span className="btn-spinner" /></span>}
                            </button>
                            <button type="button" className="profile-photo-action" onClick={handleAvatarClick} disabled={isUploadingPhoto}><FaCamera /> {isUploadingPhoto ? 'Subiendo…' : 'Cambiar foto'}</button>
                            <small>JPG, PNG o WebP. La imagen se optimiza automáticamente.</small>
                        </div>
                        <div className="profile-edit-field">
                            <label htmlFor="profile-display-name">Nombre visible</label>
                            <input id="profile-display-name" type="text" value={editedName} onChange={(event) => setEditedName(event.target.value)} className="profile-name-input" placeholder="Tu nombre" maxLength={40} autoFocus={isEditingName} onKeyDown={(event) => { if (event.key === 'Enter') handleSaveName(); }} />
                            <span>{editedName.trim().length}/40 caracteres</span>
                        </div>
                        <div className="profile-editor-actions">
                            <button type="button" className="profile-editor-cancel" onClick={handleCancelEditName} disabled={isSavingName || isUploadingPhoto}>Cancelar</button>
                            <button type="button" className="profile-editor-save" onClick={handleSaveName} disabled={isSavingName || isUploadingPhoto || !editedName.trim()}>{isSavingName ? <><span className="btn-spinner" /> Guardando</> : 'Guardar cambios'}</button>
                        </div>
                    </section>
                </div>
            )}
        </div>,
        document.body
    );
};

export default Profile;
