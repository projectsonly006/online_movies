import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import "./Admin.css";
import { api } from "../api";

function Admin() {
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [cbc, setCbc] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ==========================================
  // CHECK LOGIN
  // ==========================================

  useEffect(() => {
    const token = localStorage.getItem("adminToken");

    if (!token) {
      navigate("/admin/login", {
        replace: true,
      });
    }
  }, [navigate]);

  // ==========================================
  // LOGOUT
  // ==========================================

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");

    navigate("/admin/login", {
      replace: true,
    });
  };

  // ==========================================
  // SUBMIT
  // ==========================================

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    const token = localStorage.getItem("adminToken");

    if (!token) {
      navigate("/admin/login", {
        replace: true,
      });

      return;
    }

    const cleanTitle = title.trim();
    const cleanUrl = url.trim();
    const cleanCbc = cbc.trim();

    if (!cleanTitle) {
      setError("Please enter the movie title.");
      return;
    }

    if (!cleanUrl) {
      setError("Please enter the video URL.");
      return;
    }

    if (!cleanCbc) {
      setError("Please select the CBC rating.");
      return;
    }

    try {
      new URL(cleanUrl);
    } catch {
      setError("Please enter a valid video URL.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(api("/api/videos/create-watchable"), {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          Authorization: `Bearer ${token}`,
        },

        body: JSON.stringify({
          signedFileUrl: cleanUrl,

          title: cleanTitle,

          cbc: cleanCbc,
        }),
      });

      const data = await response.json();

      console.log("CREATE MOVIE RESPONSE:", data);

      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("adminToken");
        localStorage.removeItem("adminUser");

        navigate("/admin/login", {
          replace: true,
        });

        return;
      }

      if (!response.ok) {
        throw new Error(data.message || "Failed to add movie");
      }

      setSuccess(
        "Movie added successfully. It is now visible in the movie library.",
      );

      setTitle("");
      setUrl("");
      setCbc("");
    } catch (error) {
      console.error("ADD MOVIE ERROR:", error);

      setError(error.message || "Failed to add movie");
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // ADMIN USER
  // ==========================================

  let adminUser = null;

  try {
    adminUser = JSON.parse(localStorage.getItem("adminUser") || "null");
  } catch {
    adminUser = null;
  }

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <main className="admin-page">
      <div className="admin-container">
        <header className="admin-header">
          <div className="admin-brand">
            <div className="admin-logo">▶</div>

            <div>
              <h1>Admin Dashboard</h1>

              <p>Manage your movie library</p>
            </div>
          </div>

          <div className="admin-account">
            <div className="admin-user">
              <span className="admin-user-label">Logged in as</span>

              <strong>{adminUser?.username || "Admin"}</strong>
            </div>

            <button className="logout-button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

        <section className="admin-card">
          <div className="admin-card-header">
            <div>
              <span className="section-label">ADMIN</span>

              <h2>Add Movie</h2>

              <p>Add a movie using its authorized video URL.</p>
            </div>
          </div>

          <form className="admin-form" onSubmit={handleSubmit}>
            {/* TITLE */}

            <div className="form-group">
              <label htmlFor="movie-title">Movie Title</label>

              <input
                id="movie-title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Enter movie title"
                disabled={loading}
              />
            </div>

            {/* URL */}

            <div className="form-group">
              <label htmlFor="movie-url">Video URL</label>

              <input
                id="movie-url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="Paste the direct video URL"
                disabled={loading}
                required
              />

              <span className="input-help">
                The server stores this URL. The video is not downloaded or
                stored on your server.
              </span>
            </div>

            {/* CBC */}

            <div className="form-group">
              <label htmlFor="movie-cbc">CBC Rating</label>

              <select
                id="movie-cbc"
                value={cbc}
                onChange={(event) => setCbc(event.target.value)}
                disabled={loading}
              >
                <option value="">Select rating</option>

                <option value="U">U</option>

                <option value="U/A">U/A</option>

                <option value="A">A</option>

                <option value="R">R</option>
              </select>
            </div>

            {/* BUTTON */}

            <button
              className="add-movie-button"
              type="submit"
              disabled={loading}
            >
              {loading ? "Adding Movie..." : "＋ Add Movie"}
            </button>
          </form>

          {/* ERROR */}

          {error && <div className="admin-message error">{error}</div>}

          {/* SUCCESS */}

          {success && <div className="admin-message success">{success}</div>}
        </section>

        <button className="back-home-button" onClick={() => navigate("/")}>
          ← Movie Library
        </button>
      </div>
    </main>
  );
}

export default Admin;
