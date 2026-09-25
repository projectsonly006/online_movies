import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Home.css";
import "../App.css";

function Home() {
  const [videos, setVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  // ==========================================
  // FETCH AVAILABLE VIDEOS
  // ==========================================

  const fetchVideos = async () => {
    try {
      setVideosLoading(true);
      setError("");

      const response = await fetch("http://localhost:5000/api/videos");

      const data = await response.json();

      console.log("AVAILABLE VIDEOS:", data);

      if (!response.ok) {
        throw new Error(data.message || "Failed to load videos");
      }

      if (Array.isArray(data)) {
        setVideos(data);
      } else if (Array.isArray(data.videos)) {
        setVideos(data.videos);
      } else {
        setVideos([]);
      }
    } catch (error) {
      console.error("FETCH VIDEOS ERROR:", error);

      setVideos([]);

      setError("Failed to load videos. Please try again.");
    } finally {
      setVideosLoading(false);
    }
  };

  // ==========================================
  // INITIAL LOAD
  // ==========================================

  useEffect(() => {
    fetchVideos();
  }, []);

  // ==========================================
  // FORMAT DURATION
  // ==========================================

  const formatDuration = (seconds) => {
    const duration = Number(seconds || 0);

    if (!duration) {
      return "0:00";
    }

    const hours = Math.floor(duration / 3600);

    const minutes = Math.floor((duration % 3600) / 60);

    const remainingSeconds = Math.floor(duration % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds
        .toString()
        .padStart(2, "0")}`;
    }

    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <main className="home-page">
      <div className="home-container">
        {/* ======================================
            HEADER
        ====================================== */}

        <header className="home-header">
          <div className="home-brand">
            <div className="logo-icon">▶</div>

            <div>
              <p>Watch your available movies</p>
            </div>
          </div>

          {/* ADMIN LOGIN */}

          <button
            className="admin-login-button"
            onClick={() => navigate("/admin/login")}
            type="button"
          >
            Admin
          </button>
        </header>

        {/* ======================================
            AVAILABLE VIDEOS
        ====================================== */}

        <section className="available-videos">
          <div className="available-header">
            <div>
              <span className="section-label">LIBRARY</span>

              <h2>Available Videos</h2>

              <p>Videos that are ready to watch.</p>
            </div>

            <div className="library-actions">
              <span className="video-count">{videos.length}</span>

              <button
                className="refresh-button"
                onClick={fetchVideos}
                disabled={videosLoading}
                type="button"
                title="Refresh videos"
              >
                ↻
              </button>
            </div>
          </div>

          {/* ======================================
              ERROR
          ====================================== */}

          {error && (
            <div className="error-message">
              <span className="error-icon">!</span>

              <div>
                <strong>Unable to load videos</strong>

                <p>{error}</p>
              </div>
            </div>
          )}

          {/* ======================================
              LOADING
          ====================================== */}

          {videosLoading ? (
            <div className="videos-empty">
              <div className="watch-spinner"></div>

              <p>Loading videos...</p>
            </div>
          ) : videos.length === 0 ? (
            <div className="videos-empty">
              <div className="empty-icon">▶</div>

              <h3>No videos yet</h3>

              <p>Videos added by the administrator will appear here.</p>
            </div>
          ) : (
            <div className="video-grid">
              {videos.map((item) => (
                <article
                  className="video-library-card"
                  key={item._id}
                  onClick={() => navigate(`/watch/${item._id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      navigate(`/watch/${item._id}`);
                    }
                  }}
                >
                  {/* THUMBNAIL */}

                  <div className="library-thumbnail">
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt={item.title || "Video"}
                      />
                    ) : (
                      <div className="thumbnail-placeholder">
                        <span>▶</span>
                      </div>
                    )}

                    <div className="play-overlay">▶</div>

                    <span className="duration-badge">
                      {formatDuration(item.duration)}
                    </span>
                  </div>

                  {/* INFO */}

                  <div className="library-info">
                    <h3 title={item.title}>{item.title || "Untitled Video"}</h3>

                    <div className="library-meta">
                      {item.cbc && (
                        <span>
                          <strong>{item.cbc}</strong> Rated
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* ======================================
            FOOTER
        ====================================== */}

        <p className="home-footer">
          Browse the available movies and select one to watch.
        </p>
      </div>
    </main>
  );
}

export default Home;
