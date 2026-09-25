import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Admin.css";
import { api } from "../api";

function Admin() {
  const navigate = useNavigate();

  const pollingRef = useRef(null);

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [cbc, setCbc] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [progress, setProgress] = useState(null);

  // ==========================================
  // CHECK ADMIN LOGIN
  // ==========================================

  useEffect(() => {
    const token = localStorage.getItem("adminToken");

    if (!token) {
      navigate("/admin/login", { replace: true });
    }
  }, [navigate]);

  // ==========================================
  // STOP POLLING
  // ==========================================

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  // ==========================================
  // LOGOUT
  // ==========================================

  const handleLogout = () => {
    stopPolling();

    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");

    navigate("/admin/login", { replace: true });
  };

  // ==========================================
  // POLL DOWNLOAD PROGRESS
  // ==========================================

  const startProgressPolling = (jobId) => {
    stopPolling();

    const checkProgress = async () => {
      try {
        const token = localStorage.getItem("adminToken");

        if (!token) {
          stopPolling();

          navigate("/admin/login", {
            replace: true,
          });

          return;
        }

        const response = await fetch(
          api(`/api/videos/download-progress/${jobId}`),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const data = await response.json();

        if (response.status === 401 || response.status === 403) {
          stopPolling();

          localStorage.removeItem("adminToken");
          localStorage.removeItem("adminUser");

          navigate("/admin/login", {
            replace: true,
          });

          return;
        }

        if (!response.ok) {
          return;
        }

        setProgress(data);

        if (data.status === "completed" && data.videoId) {
          stopPolling();

          setLoading(false);

          setSuccess("Movie added successfully!");

          setTitle("");
          setUrl("");
          setCbc("");

          setProgress({
            ...data,
            percentage: 100,
          });

          return;
        }

        if (data.status === "error") {
          stopPolling();

          setLoading(false);

          setError(data.error || "Download failed");
        }
      } catch (error) {
        console.error("PROGRESS ERROR:", error);
      }
    };

    checkProgress();

    pollingRef.current = setInterval(checkProgress, 1000);
  };

  // ==========================================
  // SUBMIT
  // ==========================================

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");
    setSuccess("");
    setProgress(null);

    const token = localStorage.getItem("adminToken");

    if (!token) {
      navigate("/admin/login", { replace: true });
      return;
    }

    if (!title.trim()) {
      setError("Please enter the movie title.");
      return;
    }

    if (!url.trim()) {
      setError("Please enter the video URL.");
      return;
    }

    if (!cbc.trim()) {
      setError("Please select the CBC rating.");
      return;
    }

    setLoading(true);

    const jobId = crypto.randomUUID();

    try {
      const response = await fetch(
        "http://localhost:5000/api/videos/create-watchable",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",

            Authorization: `Bearer ${token}`,
          },

          body: JSON.stringify({
            signedFileUrl: url.trim(),

            title: title.trim(),

            cbc: cbc.trim(),

            jobId,
          }),
        },
      );

      const data = await response.json();

      console.log("CREATE VIDEO RESPONSE:", data);

      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("adminToken");
        localStorage.removeItem("adminUser");

        navigate("/admin/login", {
          replace: true,
        });

        return;
      }

      if (!response.ok) {
        throw new Error(data.message || "Failed to create video");
      }

      startProgressPolling(data.jobId || jobId);
    } catch (error) {
      console.error("CREATE VIDEO ERROR:", error);

      setLoading(false);

      setError(error.message || "Failed to create video");
    }
  };

  // ==========================================
  // CLEANUP
  // ==========================================

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  // ==========================================
  // PROGRESS
  // ==========================================

  const percentage = Math.min(
    100,
    Math.max(0, Number(progress?.percentage || 0)),
  );

  const downloadedMB = progress?.downloadedMB ?? 0;

  const totalMB = progress?.totalMB ?? 0;

  const speed = progress?.speedMBps ?? 0;

  // ==========================================
  // USER
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
        {/* HEADER */}

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

        {/* CREATE MOVIE */}

        <section className="admin-card">
          <div className="admin-card-header">
            <div>
              <span className="section-label">ADMIN</span>

              <h2>Add Movie</h2>

              <p>Add a movie to your video library.</p>
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
                onChange={(e) => setTitle(e.target.value)}
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
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste the authorized video download URL"
                disabled={loading}
                required
              />

              <span className="input-help">
                Use the direct signed video download URL.
              </span>
            </div>

            {/* CBC */}

            <div className="form-group">
              <label htmlFor="movie-cbc">CBC Rating</label>

              <select
                id="movie-cbc"
                value={cbc}
                onChange={(e) => setCbc(e.target.value)}
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
              {loading ? (
                <>
                  <span className="button-spinner"></span>
                  Adding Movie...
                </>
              ) : (
                <>
                  <span>＋</span>
                  Add Movie
                </>
              )}
            </button>
          </form>

          {/* PROGRESS */}

          {loading && progress && (
            <div className="admin-progress">
              <div className="progress-header">
                <div>
                  <h3>Adding movie</h3>

                  <span>
                    {progress.status === "starting"
                      ? "Starting download..."
                      : progress.status === "downloading"
                        ? "Downloading..."
                        : progress.status === "processing"
                          ? "Processing video..."
                          : progress.status}
                  </span>
                </div>

                <strong>{percentage.toFixed(1)}%</strong>
              </div>

              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${percentage}%`,
                  }}
                />
              </div>

              <div className="progress-stats">
                <span>
                  Downloaded: <strong>{downloadedMB} MB</strong>
                </span>

                <span>
                  Total: <strong>{totalMB} MB</strong>
                </span>

                <span>
                  Speed: <strong>{speed} MB/s</strong>
                </span>
              </div>
            </div>
          )}

          {/* ERROR */}

          {error && <div className="admin-message error">{error}</div>}

          {/* SUCCESS */}

          {success && <div className="admin-message success">{success}</div>}
        </section>

        {/* BACK TO HOME */}

        <button className="back-home-button" onClick={() => navigate("/")}>
          ← Movie Library
        </button>
      </div>
    </main>
  );
}

export default Admin;
