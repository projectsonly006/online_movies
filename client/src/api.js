const API_URL = import.meta.env.DEV
  ? "http://localhost:5000"
  : "https://online-movies-uebc.onrender.com";

export const api = (path) => {
  return `${API_URL}${path}`;
};

export default API_URL;
