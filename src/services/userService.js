import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db, auth } from "../firebase/config";

export const UserService = {
    toggleFavorite: async (songData) => {
        const user = auth.currentUser;
        if (!user) throw new Error("Debes iniciar sesión");

        const userRef = doc(db, "users", user.uid);

        // Si quisieras agregar (usamos arrayUnion para no duplicar)
        await updateDoc(userRef, {
            favorites: arrayUnion(songData)
        });

        // Para quitar usarías arrayRemove
    }
};