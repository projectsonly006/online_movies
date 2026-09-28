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

  useEffect(() => {
    const token = localStorage.getItem("adminToken");

    if (!token) {
      navigate("/admin/login", {
        replace: true,
      });
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");

    navigate("/admin/login", {
      replace: true,
    });
  };

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

    if (!title.trim()) {
      setError("Please enter the movie title.");
      return;
    }

    if (!url.trim()) {
      setError("Please enter the WeTransfer URL.");
      return;
    }

    if (!cbc.trim()) {
      setError("Please select the CBC rating.");
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
          title: title.trim(),
          signedFileUrl: url.trim(),
          cbc: cbc.trim(),
        }),
      });

      const data = await response.json();

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

      setTitle("");
      setUrl("");
      setCbc("");

      setSuccess("Movie added successfully!");
    } catch (error) {
      console.error("CREATE VIDEO ERROR:", error);

      setError(error.message || "Failed to add movie");
    } finally {
      setLoading(false);
    }
  };

  let adminUser = null;

  try {
    adminUser = JSON.parse(localStorage.getItem("adminUser") || "null");
  } catch {
    adminUser = null;
  }

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

              <p>Add a movie using its authorized WeTransfer video URL.</p>
            </div>
          </div>

          <form className="admin-form" onSubmit={handleSubmit}>
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

            <div className="form-group">
              <label htmlFor="movie-url">WeTransfer Video URL</label>

              <input
                id="movie-url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="Paste WeTransfer URL"
                disabled={loading}
                required
              />

              <span className="input-help">
                The URL must provide access to the authorized video.
              </span>
            </div>

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

            <button
              className="add-movie-button"
              type="submit"
              disabled={loading}
            >
              {loading ? "Adding Movie..." : "＋ Add Movie"}
            </button>
          </form>

          {error && <div className="admin-message error">{error}</div>}

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
