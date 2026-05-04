import { io } from 'socket.io-client';

// Default to localhost:5000 if REACT_APP_SOCKET_URL is not set
const SOCKET_URL =
  process.env.REACT_APP_SOCKET_URL ||
  'https://growmoreapp2-0.onrender.com';

let socket = null;

export const initSocket = () => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });
  }
  return socket;
};

export const getSocket = () => socket;

export const connectSocket = () => {
  if (socket && !socket.connected) {
    socket.connect();
  }
};

export const disconnectSocket = () => {
  if (socket && socket.connected) {
    socket.disconnect();
  }
};
