export const getSessionKey = () => localStorage.getItem('lastfm_session');
export const getUsername = () => localStorage.getItem('lastfm_username');

export const ensureAuthenticated = (navigate) => {
  const sk = getSessionKey();
  if (!sk) {
    navigate('/', { replace: true });
    return false;
  }
  return true;
};
