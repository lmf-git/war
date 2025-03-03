import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { auth } from '$lib/firebase/firebase';

// Create a writable store to manage user state
export const user = writable(null);
export const loading = writable(true);

// Initialize the auth listener
export const initAuthListener = async () => {
  if (browser) {
    const { onAuthStateChanged } = await import('firebase/auth');
    onAuthStateChanged(auth, (userData) => {
      user.set(userData);
      loading.set(false);
    });
  } else {
    loading.set(false);
  }
};

// Auth functions
export const signIn = async (email, password) => {
  if (!browser) return { success: false, error: 'Cannot sign in on server' };
  
  try {
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    await signInWithEmailAndPassword(auth, email, password);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const signUp = async (email, password) => {
  if (!browser) return { success: false, error: 'Cannot sign up on server' };
  
  try {
    const { createUserWithEmailAndPassword } = await import('firebase/auth');
    await createUserWithEmailAndPassword(auth, email, password);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const signOut = async () => {
  if (!browser) return { success: false, error: 'Cannot sign out on server' };
  
  try {
    const { signOut: firebaseSignOut } = await import('firebase/auth');
    await firebaseSignOut(auth);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};
