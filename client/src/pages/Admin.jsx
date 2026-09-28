import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Admin.css";
import { api } from "../api";

// ==========================================
// EMPTY MOVIE
// ==========================================

const createEmptyMovie = () => ({
  title: "",
  url: "",
  cbc: "",
});

function Admin() {
  const navigate = useNavigate();

  const pollingRef = useRef(null);

  // ==========================================
  // NUMBER OF MOVIES
  // ==========================================

  const [movieCount, setMovieCount] = useState("");

  const [movies, setMovies] = useState([]);

  const [currentMovieIndex, setCurrentMovieIndex] = useState(0);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  const [progress, setProgress] = useState(null);

  const [existingMovies, setExistingMovies] = useState([]);

  const [loadingMovies, setLoadingMovies] = useState(false);

  const [deletingMovieId, setDeletingMovieId] = useState(null);

  // ==========================================
  // CHECK ADMIN LOGIN
  // ==========================================

  useEffect(() => {
    const token = localStorage.getItem("adminToken");

    if (!token) {
      navigate("/admin/login", {
        replace: true,
      });

      return;
    }

    loadExistingMovies();
  }, [navigate]);

  // ==========================================
  // DELETE MOVIE
  // ==========================================

  const handleDeleteMovie = async (movie) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${movie.title}"?\n\nThis will delete the movie from MongoDB and remove the video file from the server.`,
    );

    if (!confirmed) {
      return;
    }

    const token = localStorage.getItem("adminToken");

    if (!token) {
      navigate("/admin/login", {
        replace: true,
      });

      return;
    }

    try {
      setDeletingMovieId(movie._id);

      setError("");

      setSuccess("");

      const response = await fetch(api(`/api/videos/${movie._id}`), {
        method: "DELETE",

        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      // ==========================================
      // AUTH ERROR
      // ==========================================

      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("adminToken");

        localStorage.removeItem("adminUser");

        navigate("/admin/login", {
          replace: true,
        });

        return;
      }

      if (!response.ok) {
        throw new Error(data.message || "Failed to delete movie");
      }

      // ==========================================
      // REMOVE FROM ADMIN LIST
      // ==========================================

      setExistingMovies((previousMovies) =>
        previousMovies.filter(
          (existingMovie) => existingMovie._id !== movie._id,
        ),
      );

      setSuccess(`"${movie.title}" deleted successfully.`);
    } catch (error) {
      console.error("DELETE MOVIE ERROR:", error);

      setError(error.message || "Failed to delete movie.");
    } finally {
      setDeletingMovieId(null);
    }
  };

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

    navigate("/admin/login", {
      replace: true,
    });
  };

  // ==========================================
  // LOAD EXISTING MOVIES
  // ==========================================

  const loadExistingMovies = async () => {
    try {
      setLoadingMovies(true);

      const response = await fetch(api("/api/videos"));

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to load movies");
      }

      setExistingMovies(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("LOAD MOVIES ERROR:", error);

      setError(error.message || "Failed to load existing movies.");
    } finally {
      setLoadingMovies(false);
    }
  };

  // ==========================================
  // CREATE MOVIE SLOTS
  // ==========================================

  const createMovieSlots = () => {
    setError("");

    setSuccess("");

    setProgress(null);

    const count = Number(movieCount);

    // ========================================
    // VALIDATION
    // ========================================

    if (!Number.isInteger(count) || count < 1) {
      setError("Please enter a valid number of movies.");
      return;
    }

    // Change this if you want a different maximum.
    if (count > 500) {
      setError("You can add a maximum of 500 movies at once.");
      return;
    }

    // ========================================
    // CREATE EXACT NUMBER OF MOVIES
    // ========================================

    const newMovies = Array.from({ length: count }, () => createEmptyMovie());

    setMovies(newMovies);

    setCurrentMovieIndex(0);
  };

  // ==========================================
  // UPDATE MOVIE FIELD
  // ==========================================

  const updateMovie = (index, field, value) => {
    setMovies((previousMovies) =>
      previousMovies.map((movie, movieIndex) =>
        movieIndex === index
          ? {
              ...movie,
              [field]: value,
            }
          : movie,
      ),
    );
  };

  // ==========================================
  // RESET FORM
  // ==========================================

  const resetForm = () => {
    setMovieCount("");

    setMovies([]);

    setCurrentMovieIndex(0);

    setProgress(null);
  };

  // ==========================================
  // CREATE JOB ID
  // ==========================================

  const createJobId = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    return `job-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  };

  // ==========================================
  // DOWNLOAD ONE MOVIE
  // ==========================================

  const downloadMovie = async (movie, index, token) => {
    const jobId = createJobId();

    setCurrentMovieIndex(index);

    setProgress({
      status: "starting",

      percentage: 0,

      downloadedBytes: 0,

      totalBytes: 0,

      downloadedMB: 0,

      totalMB: 0,

      speedMBps: 0,

      filename: "",
    });

    const response = await fetch(api("/api/videos/create-watchable"), {
      method: "POST",

      headers: {
        "Content-Type": "application/json",

        Authorization: `Bearer ${token}`,
      },

      body: JSON.stringify({
        signedFileUrl: movie.url.trim(),

        sourceUrl: movie.url.trim(),

        title: movie.title.trim(),

        cbc: movie.cbc.trim(),

        jobId,
      }),
    });

    const data = await response.json();

    console.log(`CREATE MOVIE ${index + 1} RESPONSE:`, data);

    // ========================================
    // AUTH ERROR
    // ========================================

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem("adminToken");

      localStorage.removeItem("adminUser");

      navigate("/admin/login", {
        replace: true,
      });

      throw new Error("Admin session expired");
    }

    // ========================================
    // SERVER ERROR
    // ========================================

    if (!response.ok) {
      throw new Error(data.message || `Failed to add movie ${index + 1}`);
    }

    // ========================================
    // WAIT FOR DOWNLOAD
    // ========================================

    return new Promise((resolve, reject) => {
      let finished = false;

      const checkProgress = async () => {
        try {
          const progressResponse = await fetch(
            api(`/api/videos/download-progress/${data.jobId || jobId}`),
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          );

          const progressData = await progressResponse.json();

          // ======================================
          // AUTH ERROR
          // ======================================

          if (
            progressResponse.status === 401 ||
            progressResponse.status === 403
          ) {
            stopPolling();

            localStorage.removeItem("adminToken");

            localStorage.removeItem("adminUser");

            navigate("/admin/login", {
              replace: true,
            });

            if (!finished) {
              finished = true;

              reject(new Error("Admin session expired"));
            }

            return;
          }

          if (!progressResponse.ok) {
            return;
          }

          setProgress(progressData);

          // ======================================
          // MOVIE COMPLETED
          // ======================================

          if (progressData.status === "completed" && progressData.videoId) {
            stopPolling();

            if (!finished) {
              finished = true;

              resolve(progressData);
            }

            return;
          }

          // ======================================
          // MOVIE FAILED
          // ======================================

          if (progressData.status === "error") {
            stopPolling();

            if (!finished) {
              finished = true;

              reject(
                new Error(
                  progressData.error || `Movie ${index + 1} download failed`,
                ),
              );
            }
          }
        } catch (error) {
          console.error("PROGRESS ERROR:", error);
        }
      };

      checkProgress();

      pollingRef.current = setInterval(checkProgress, 1000);
    });
  };

  // ==========================================
  // SUBMIT ALL MOVIES
  // ==========================================

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");

    setSuccess("");

    setProgress(null);

    const token = localStorage.getItem("adminToken");

    if (!token) {
      navigate("/admin/login", {
        replace: true,
      });

      return;
    }

    // ==========================================
    // MAKE SURE SLOTS EXIST
    // ==========================================

    if (movies.length === 0) {
      setError("Please enter the number of movies first.");

      return;
    }

    // ==========================================
    // MOVIE 1 IS REQUIRED
    // ==========================================

    const firstMovie = movies[0];

    if (!firstMovie.title.trim()) {
      setError("Movie 1 title is required.");

      return;
    }

    if (!firstMovie.url.trim()) {
      setError("Movie 1 video URL is required.");

      return;
    }

    if (!firstMovie.cbc.trim()) {
      setError("Movie 1 CBC rating is required.");

      return;
    }

    // ==========================================
    // FIND FILLED MOVIES
    // ==========================================

    const moviesToAdd = [];

    for (let index = 0; index < movies.length; index++) {
      const movie = movies[index];

      const hasTitle = movie.title.trim() !== "";

      const hasUrl = movie.url.trim() !== "";

      const hasCbc = movie.cbc.trim() !== "";

      const hasAnything = hasTitle || hasUrl || hasCbc;

      // ========================================
      // EMPTY OPTIONAL SLOT
      // ========================================

      if (!hasAnything) {
        continue;
      }

      // ========================================
      // VALIDATE OPTIONAL MOVIE
      // ========================================

      if (index > 0) {
        if (!hasTitle) {
          setError(`Movie ${index + 1}: please enter a title.`);

          return;
        }

        if (!hasUrl) {
          setError(`Movie ${index + 1}: please enter a video URL.`);

          return;
        }

        if (!hasCbc) {
          setError(`Movie ${index + 1}: please select a CBC rating.`);

          return;
        }
      }

      moviesToAdd.push({
        ...movie,

        index,
      });
    }

    // ==========================================
    // SAFETY CHECK
    // ==========================================

    if (moviesToAdd.length === 0) {
      setError("Please add at least one movie.");

      return;
    }

    setLoading(true);

    try {
      // ========================================
      // ADD MOVIES ONE BY ONE
      // ========================================

      for (
        let moviePosition = 0;
        moviePosition < moviesToAdd.length;
        moviePosition++
      ) {
        const movie = moviesToAdd[moviePosition];

        console.log(
          `ADDING MOVIE ${moviePosition + 1} OF ${moviesToAdd.length}`,
        );

        setCurrentMovieIndex(movie.index);

        setProgress({
          status: "starting",

          percentage: 0,

          downloadedBytes: 0,

          totalBytes: 0,

          downloadedMB: 0,

          totalMB: 0,

          speedMBps: 0,

          filename: "",

          movieNumber: moviePosition + 1,

          totalMovies: moviesToAdd.length,
        });

        await downloadMovie(movie, movie.index, token);
      }

      // ========================================
      // ALL MOVIES COMPLETE
      // ========================================

      setLoading(false);

      setSuccess(
        `${moviesToAdd.length} ${
          moviesToAdd.length === 1 ? "movie" : "movies"
        } added successfully!`,
      );

      resetForm();
    } catch (error) {
      console.error("CREATE MOVIES ERROR:", error);

      setLoading(false);

      setError(error.message || "Failed to add movies.");
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
        {/* ======================================
            HEADER
        ====================================== */}

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

            <button
              className="logout-button"
              onClick={handleLogout}
              type="button"
            >
              Logout
            </button>
          </div>
        </header>

        {/* ======================================
            CREATE MOVIES
        ====================================== */}

        <section className="admin-card">
          <div className="admin-card-header">
            <div>
              <span className="section-label">ADMIN</span>

              <h2>Add Movies</h2>

              <p>Choose how many movie slots you want.</p>
            </div>
          </div>

          {/* ====================================
              NUMBER OF MOVIES
          ==================================== */}

          {!loading && movies.length === 0 && (
            <div className="movie-count-section">
              <div className="form-group">
                <label htmlFor="movie-count">
                  How many movies do you want to add?
                </label>

                <input
                  id="movie-count"
                  type="number"
                  min="1"
                  max="500"
                  value={movieCount}
                  onChange={(e) => setMovieCount(e.target.value)}
                  placeholder="Example: 5"
                />

                <span className="input-help">
                  Enter any number from 1 to 500.
                </span>
              </div>

              <button
                className="add-movie-button"
                type="button"
                onClick={createMovieSlots}
              >
                <span>＋</span>
                Create Movie Slots
              </button>
            </div>
          )}

          {/* ====================================
              MOVIE FORM
          ==================================== */}

          {movies.length > 0 && (
            <form className="admin-form" onSubmit={handleSubmit}>
              <div className="movie-count-info">
                <strong>
                  {movies.length} {movies.length === 1 ? "Movie" : "Movies"}
                </strong>

                <button
                  type="button"
                  className="change-count-button"
                  onClick={() => {
                    if (loading) return;

                    setMovies([]);

                    setMovieCount("");

                    setError("");

                    setSuccess("");

                    setProgress(null);
                  }}
                  disabled={loading}
                >
                  Change Number
                </button>
              </div>

              {/* ==================================
                  MOVIE SLOTS
              ================================== */}

              <div className="movie-slots">
                {movies.map((movie, index) => {
                  const isRequired = index === 0;

                  const isActive = currentMovieIndex === index && loading;

                  return (
                    <div
                      className={`movie-slot ${
                        isActive ? "movie-slot-active" : ""
                      }`}
                      key={index}
                    >
                      {/* SLOT HEADER */}

                      <div className="movie-slot-header">
                        <div>
                          <span className="movie-slot-number">
                            Movie {index + 1}
                          </span>

                          <h3>
                            {isRequired ? "Required Movie" : "Optional Movie"}
                          </h3>
                        </div>

                        {isActive && (
                          <span className="movie-slot-status">Adding...</span>
                        )}
                      </div>

                      {/* TITLE */}

                      <div className="form-group">
                        <label htmlFor={`movie-title-${index}`}>
                          Movie Title
                          {isRequired && (
                            <span className="required-star">*</span>
                          )}
                        </label>

                        <input
                          id={`movie-title-${index}`}
                          type="text"
                          value={movie.title}
                          onChange={(e) =>
                            updateMovie(index, "title", e.target.value)
                          }
                          placeholder={
                            isRequired
                              ? "Enter movie title"
                              : "Optional movie title"
                          }
                          disabled={loading}
                          required={isRequired}
                        />
                      </div>

                      {/* URL */}

                      <div className="form-group">
                        <label htmlFor={`movie-url-${index}`}>
                          Video URL
                          {isRequired && (
                            <span className="required-star">*</span>
                          )}
                        </label>

                        <input
                          id={`movie-url-${index}`}
                          type="url"
                          value={movie.url}
                          onChange={(e) =>
                            updateMovie(index, "url", e.target.value)
                          }
                          placeholder="Paste the direct signed video URL"
                          disabled={loading}
                          required={isRequired}
                        />

                        <span className="input-help">
                          Use the direct signed video download URL.
                        </span>
                      </div>

                      {/* CBC */}

                      <div className="form-group">
                        <label htmlFor={`movie-cbc-${index}`}>
                          CBC Rating
                          {isRequired && (
                            <span className="required-star">*</span>
                          )}
                        </label>

                        <select
                          id={`movie-cbc-${index}`}
                          value={movie.cbc}
                          onChange={(e) =>
                            updateMovie(index, "cbc", e.target.value)
                          }
                          disabled={loading}
                          required={isRequired}
                        >
                          <option value="">Select rating</option>

                          <option value="U">U</option>

                          <option value="U/A">U/A</option>

                          <option value="A">A</option>

                          <option value="R">R</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ==================================
                  SUBMIT
              ================================== */}

              <button
                className="add-movie-button"
                type="submit"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="button-spinner"></span>
                    Adding Movies...
                  </>
                ) : (
                  <>
                    <span>＋</span>
                    Add Movies
                  </>
                )}
              </button>
            </form>
          )}

          {/* ======================================
              PROGRESS
          ====================================== */}

          {loading && progress && (
            <div className="admin-progress">
              <div className="progress-header">
                <div>
                  <h3>Adding Movie {currentMovieIndex + 1}</h3>

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

          {/* ======================================
              ERROR
          ====================================== */}

          {error && <div className="admin-message error">{error}</div>}

          {/* ======================================
              SUCCESS
          ====================================== */}

          {success && <div className="admin-message success">{success}</div>}
        </section>

        {/* ======================================
    EXISTING MOVIES
====================================== */}

        <section className="admin-card">
          <div className="admin-card-header">
            <div>
              <span className="section-label">LIBRARY</span>

              <h2>Existing Movies</h2>

              <p>Movies currently available to users.</p>
            </div>
          </div>

          {loadingMovies ? (
            <div className="admin-message">Loading movies...</div>
          ) : existingMovies.length === 0 ? (
            <div className="admin-message">No movies have been added yet.</div>
          ) : (
            <div className="existing-movies-list">
              {existingMovies.map((movie) => {
                const isDeleting = deletingMovieId === movie._id;

                return (
                  <div className="existing-movie-item" key={movie._id}>
                    <div className="existing-movie-info">
                      <h3>{movie.title}</h3>

                      <div className="existing-movie-details">
                        <span>Rating: {movie.cbc || "Not set"}</span>

                        <span>Format: {movie.format || "mp4"}</span>

                        {movie.duration > 0 && (
                          <span>
                            Duration: {Math.round(movie.duration)} sec
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="delete-movie-button"
                      onClick={() => handleDeleteMovie(movie)}
                      disabled={isDeleting || loading}
                    >
                      {isDeleting ? (
                        <>
                          <span className="button-spinner"></span>
                          Deleting...
                        </>
                      ) : (
                        "Delete"
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ======================================
            BACK HOME
        ====================================== */}

        <button
          className="back-home-button"
          onClick={() => navigate("/")}
          type="button"
        >
          ← Movie Library
        </button>
      </div>
    </main>
  );
}

export default Admin;
