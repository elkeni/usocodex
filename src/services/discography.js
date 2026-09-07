export const getReleaseType = (release) => {
    const rawType = String(
        release?.recordType || release?.record_type || release?.type || '',
    ).trim().toLocaleLowerCase('es');

    if (rawType === 'ep' || rawType.includes('extended play')) return 'ep';
    if (rawType.includes('single')) return 'single';
    return 'album';
};

/** Mantiene el orden de llegada (la pantalla ya lo ordena por fecha). */
export const groupDiscography = (releases = []) => releases.reduce((groups, release) => {
    if (!release) return groups;
    groups[getReleaseType(release)].push(release);
    return groups;
}, { album: [], ep: [], single: [] });
